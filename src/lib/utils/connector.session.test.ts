/**
 * The session handshake has to be able to *fail*.
 *
 * `getSession` used to wrap its body in `new Promise(async resolve => ...)`. An
 * async executor that throws returns a rejected promise which `new Promise`
 * discards, so `reject` was never called and the promise never settled — the
 * error appeared in the console as an unhandled rejection while every awaiting
 * caller, the login form included, waited forever. The in-flight promise was
 * also cleared only on success, so one failure wedged every later attempt until
 * the page was reloaded.
 *
 * These drive the failure paths only. The success path needs a real server
 * keypair to decrypt against, and is covered by running the app.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()

vi.mock('axios', () => {
  const isAxiosError = (value: unknown): boolean => Boolean(value && (value as { isAxiosError?: boolean }).isAxiosError)
  return { default: { post, isAxiosError }, isAxiosError }
})

/**
 * A device key already in storage, so the constructor takes the "load" branch.
 * Generating one costs a real 2048-bit keypair and none of these tests need the
 * private half — every case fails before anything is decrypted.
 */
function seedDeviceKey(): void {
  const modulus =
    'c5f0a1d3b7e94c2a8f6b0d5e3a97c14b2e8d6f0a4c7b9e1d3f5a8c0b2d4e6f81' +
    'a3c5e7092b4d6f8103254769abcdef0123456789abcdef0123456789abcdef01'
  localStorage.devicekey = '1'
  localStorage['devicekey-n'] = modulus
  localStorage['devicekey-e'] = '10001'
  localStorage['devicekey-d'] = modulus
  localStorage['devicekey-p'] = 'd3b7e94c2a8f6b0d5e3a97c14b2e8d6f'
  localStorage['devicekey-q'] = 'e7092b4d6f8103254769abcdef012345'
  localStorage['devicekey-dmp1'] = '4c2a8f6b0d5e3a97'
  localStorage['devicekey-dmq1'] = '6f8103254769abcd'
  localStorage['devicekey-coeff'] = '2a8f6b0d5e3a97c1'
}

/** A fresh module registry, so `Connector`'s static session state is not shared. */
async function freshConnector() {
  vi.resetModules()
  const module = await import('./connector')
  return new module.default()
}

function axiosError(code: string): Error & { isAxiosError: true; code: string } {
  return Object.assign(new Error(code), { isAxiosError: true as const, code })
}

beforeEach(() => {
  post.mockReset()
  seedDeviceKey()
})

afterEach(() => {
  vi.resetModules()
})

describe('a handshake the core rejects', () => {
  it('rejects instead of hanging', async () => {
    post.mockResolvedValue({ data: { result: 1, message: 'Service is busy. Please try again later.' } })
    const connector = await freshConnector()

    await expect(connector.getSession()).rejects.toThrow('Service is busy. Please try again later.')
  })

  it('reports something when the core sends no message at all', async () => {
    post.mockResolvedValue({ data: { result: 1 } })
    const connector = await freshConnector()

    await expect(connector.getSession()).rejects.toThrow(/unknown data/i)
  })

  it('lets the next attempt try again rather than wedging on the failed one', async () => {
    post.mockResolvedValue({ data: { result: 1, message: 'Service is busy' } })
    const connector = await freshConnector()

    await expect(connector.getSession()).rejects.toThrow('Service is busy')
    expect(post).toHaveBeenCalledTimes(1)

    // The regression: the first failure left `sessionPromise` set, so this call
    // awaited a promise that could never settle and never sent a request.
    await expect(connector.getSession()).rejects.toThrow('Service is busy')
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('coalesces callers that arrive while one handshake is already running', async () => {
    post.mockResolvedValue({ data: { result: 1, message: 'Service is busy' } })
    const connector = await freshConnector()

    const results = await Promise.allSettled([connector.getSession(), connector.getSession()])

    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect(post).toHaveBeenCalledTimes(1)
  })
})

describe('a core that never answers', () => {
  it('turns an aborted request into a message worth showing', async () => {
    post.mockRejectedValue(axiosError('ECONNABORTED'))
    const connector = await freshConnector()

    await expect(connector.getSession()).rejects.toThrow(/did not respond within \d+s/)
  })

  it('says the server is unreachable when the connection never opens', async () => {
    post.mockRejectedValue(axiosError('ECONNREFUSED'))
    const connector = await freshConnector()

    await expect(connector.getSession()).rejects.toThrow(/Could not reach the server/)
  })

  it('sends a timeout with every request, since axios has none by default', async () => {
    post.mockResolvedValue({ data: { result: 1, message: 'nope' } })
    const connector = await freshConnector()

    await expect(connector.getSession()).rejects.toThrow()
    expect(post.mock.calls[0][2]).toMatchObject({ timeout: expect.any(Number) })
    expect(post.mock.calls[0][2].timeout).toBeGreaterThan(0)
  })
})

describe('requests to the core', () => {
  it('go out one at a time, not in parallel', async () => {
    let live = 0
    let peak = 0
    post.mockImplementation(async () => {
      peak = Math.max(peak, ++live)
      await Promise.resolve()
      live--
      return { data: { result: 0 } }
    })
    vi.resetModules()
    const module = await import('./connector')
    const connector = new module.default()
    // A session in hand, so these are three posts, not one coalesced handshake.
    module.default.adoptSession('SESSION-1', '00112233445566778899aabbccddeeff')

    const answers = await Promise.all([
      connector.sendMessage('ONEBANKHOME', { command: 'loadwidget', widget: 'USAGEDAILY' }),
      connector.sendMessage('ONEBANKHOME', { command: 'loadwidget', widget: 'USAGESHARE' }),
      connector.sendMessage('ONEBANKTRANSACTION', { command: 'viewtransactions' }),
    ])

    expect(answers).toHaveLength(3)
    expect(post).toHaveBeenCalledTimes(3)
    expect(peak).toBe(1)
  })

  it('keeps sending after one of them fails', async () => {
    post.mockRejectedValueOnce(axiosError('ECONNREFUSED'))
    post.mockResolvedValue({ data: { result: 1, message: 'nope' } })
    const connector = await freshConnector()

    await expect(connector.getSession()).rejects.toThrow(/Could not reach the server/)
    await expect(connector.getSession()).rejects.toThrow('nope')
    expect(post).toHaveBeenCalledTimes(2)
  })
})
