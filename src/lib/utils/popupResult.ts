/**
 * A native screen waiting on an overlay's result.
 *
 * An embedded page gets its result by `postMessage` (`onPopupResult`, keyed by
 * the `callbackid` it sent). A routed page is in this document, so it registers
 * a resolver here and `closePopup` settles it. Every waiter settles: closing
 * with no result, or a navigation that clears the stack, resolves with null.
 */

const waiting = new Map<string, (result: unknown) => void>()

let sequence = 0

export function nextResultCallbackId(): string {
  sequence += 1
  return `native-${sequence}`
}

export function awaitPopupResult(callbackid: string): Promise<unknown> {
  return new Promise((resolve) => waiting.set(callbackid, resolve))
}

/** True when `callbackid` belonged to a routed page, which has now been answered. */
export function settlePopupResult(callbackid: string | undefined, result: unknown): boolean {
  if (!callbackid) return false
  const resolve = waiting.get(callbackid)
  if (!resolve) return false
  waiting.delete(callbackid)
  resolve(result ?? null)
  return true
}

export function cancelPopupResults(): void {
  const pending = [...waiting.values()]
  waiting.clear()
  pending.forEach((resolve) => resolve(null))
}
