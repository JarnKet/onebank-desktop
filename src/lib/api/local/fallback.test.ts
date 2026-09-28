/**
 * Core first, local fallback (`./index.ts`).
 *
 * The rules a banking screen depends on: a real answer always wins, an expired
 * session is never papered over, and a local answer is always announced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { setTransport } from '../client'
import { env } from '../../env'
import { getPendingApprovals, getPermissions, removePermission, viewTransactions } from '../commands'
import { addPermission, approveTransaction, submitTransfer } from '../unmapped'
import { callWithFallback, resetLocalData } from './index'
import { currentGroup, onebankGroups } from '../../../stores/onebankGroups'
import { loginData } from '../../../stores/session'
import { usingLocalData } from '../../../stores/localData'

const GROUP = 'G-1'

const HOME = {
  result: 0,
  accounts: [{ accountid: 'A1', account: '010120000000000001', ccy: 'LAK', name: 'ACME', alias: '', type: 'SAVING', viewonly: 0, status: 'ACTIVE' }],
  users: [],
  me: { userid: 'U1', name: 'ME', profileid: '', faceid: '', profiletype: 0, role: 'OWNER' },
  detail: { onebankid: GROUP, name: 'Acme' },
}

const PENDING = { transactionid: 77, status: 'PENDING', makerid: 'U2', txtime: '2026-09-20 10:00:00', account: HOME.accounts[0].account }

/** A core that refuses every unmapped command, and answers the real ones. */
function refusingCore(calls: string[] = []) {
  return async (service: string, data: Record<string, unknown>) => {
    calls.push(`${service}/${data.command}`)
    switch (data.command) {
      case 'viewtransactions':
        return { result: 0, items: [PENDING] }
      case 'getpendingapprovals':
        return { result: 0, items: [PENDING] }
      case 'getpermissions':
        return { result: 0, permissions: [{ permissionid: 5, name: 'Core role', accountids: [], userids: [], viewonly: true }] }
      default:
        return { result: 99, message: 'Unknown command' }
    }
  }
}

beforeEach(() => {
  resetLocalData()
  currentGroup.set(GROUP)
  onebankGroups.set({ [GROUP]: { isFinishLoad: true, loadHomeResult: HOME as any } })
  loginData.set({ USER: { userid: 'U1', name: 'ME' } } as any)
})

afterEach(() => {
  setTransport(null)
  vi.useRealTimers()
})

describe('the core answers', () => {
  it('uses its answer, and raises no notice', async () => {
    setTransport(async () => ({ result: 0, billers: [{ billerid: 'CORE' }] }))
    const response = await callWithFallback<any>('ONEBANKTRANSACTION', { command: 'getbillers' })
    expect(response.billers).toEqual([{ billerid: 'CORE' }])
    expect(get(usingLocalData)).toBe(false)
  })

  it('passes an expired session back rather than answering locally', async () => {
    setTransport(async () => ({ result: 1, message: 'Session expired' }))
    const response = await callWithFallback('ONEBANKTRANSACTION', { command: 'getbillers' })
    expect(response.result).toBe(1)
    expect(get(usingLocalData)).toBe(false)
  })
})

describe('the core refuses or does not answer', () => {
  it('answers locally and says so', async () => {
    setTransport(refusingCore())
    const response = await callWithFallback<any>('ONEBANKTRANSACTION', { command: 'getbillers' })
    expect(response.result).toBe(0)
    expect(response.billers.length).toBeGreaterThan(0)
    expect(get(usingLocalData)).toBe(true)
  })

  it('stops asking the core once it has refused, so a screen waits only once', async () => {
    const calls: string[] = []
    setTransport(refusingCore(calls))
    await callWithFallback('ONEBANKTRANSACTION', { command: 'getbillers' })
    await callWithFallback('ONEBANKTRANSACTION', { command: 'getbillers' })
    expect(calls.filter((call) => call === 'ONEBANKTRANSACTION/getbillers')).toHaveLength(1)
  })

  it('answers locally after a transport failure', async () => {
    setTransport(async () => {
      throw new Error('Network Error')
    })
    const response = await callWithFallback('ONEBANKTRANSACTION', { command: 'getbillers' })
    expect(response.result).toBe(0)
  })

  it('answers locally when the core is silent past the timeout', async () => {
    vi.useFakeTimers()
    setTransport(() => new Promise(() => {}))
    const pending = callWithFallback('ONEBANKTRANSACTION', { command: 'getbillers' })
    await vi.advanceTimersByTimeAsync(env.unmappedTimeoutMs + 1)
    expect((await pending).result).toBe(0)
  })
})

describe('local writes show on the core reads', () => {
  it('lists a role saved locally alongside the core roles', async () => {
    setTransport(refusingCore())
    await getPermissions()
    const saved = await addPermission({ name: 'Local role', accountids: ['A1'], userids: ['U1'], viewonly: false }, {})
    expect(saved.result).toBe(0)

    const names = ((await getPermissions()).permissions ?? []).map((permission) => permission.name)
    expect(names).toEqual(['Core role', 'Local role'])
  })

  it('removes a local-only role without asking the core', async () => {
    const calls: string[] = []
    setTransport(refusingCore(calls))
    const saved = await addPermission({ name: 'Local role', accountids: [], userids: [], viewonly: true }, {})
    const id = (saved as any).permission.permissionid as number
    expect(id).toBeLessThan(0)

    expect((await removePermission(id)).result).toBe(0)
    expect(calls).not.toContain('ONEBANKGROUP/removepermission')
    expect(((await getPermissions()).permissions ?? []).map((permission) => permission.name)).toEqual(['Core role'])
  })

  it('drops a transaction approved locally from the pending list', async () => {
    setTransport(refusingCore())
    await viewTransactions()
    expect((await approveTransaction(77)).result).toBe(0)

    expect((await getPendingApprovals()).items ?? []).toHaveLength(0)
    const tx = ((await viewTransactions()).items ?? []).find((item) => item.transactionid === 77)
    expect(tx?.status).toBe('SUCCESS')
  })

  it('adds a transfer made locally to the transaction list', async () => {
    setTransport(refusingCore())
    const response = await submitTransfer({
      kind: 'BCEL',
      fromaccountid: 'A1',
      items: [{ toaccount: '010120000999888777', toname: 'PAYEE', amount: 1000, ccy: 'LAK' }],
    })
    expect(response.result).toBe(0)

    const items = (await viewTransactions()).items ?? []
    expect(items[0].detail?.TOACCOUNTNAME).toBe('PAYEE')
    expect(String(items[0].transactionid)).toMatch(/^L/)
  })

  it('forgets everything on reset (logout)', async () => {
    setTransport(refusingCore())
    await addPermission({ name: 'Local role', accountids: [], userids: [], viewonly: true }, {})
    resetLocalData()
    expect(((await getPermissions()).permissions ?? []).map((permission) => permission.name)).toEqual(['Core role'])
    expect(get(usingLocalData)).toBe(false)
  })
})

describe('a local decision', () => {
  it('reads the core transactions first when taken straight after a reload', async () => {
    setTransport(refusingCore())
    expect((await approveTransaction(77)).result).toBe(0)
    expect(((await getPendingApprovals()).items ?? [])).toHaveLength(0)
  })
})
