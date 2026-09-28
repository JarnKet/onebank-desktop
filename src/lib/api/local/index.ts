/**
 * Core first, local fallback — for the commands the core contract lacks.
 *
 * Every function in `../unmapped.ts` sends through `callWithFallback`. The rule:
 *
 * - The core answers `result: 0` → that answer is used. The day the core
 *   implements a command, the screen is on real data with no change here.
 * - The session expired → passed back as is. Never papered over locally.
 * - Anything else (a refusal, a transport error, no answer within
 *   `env.unmappedTimeoutMs`) → answered locally (`./handlers.ts`), and that
 *   command skips the core for the rest of the session, so a screen waits at
 *   most once.
 *
 * A local answer raises `usingLocalData`, which the shell shows as a notice:
 * nothing answered here was sent to the bank.
 *
 * The overlays below run on the *real* reads in `../commands.ts`, so what the
 * user did locally still shows on the screens that read the core.
 */

import { env } from '../../env'
import { usingLocalData } from '../../../stores/localData'
import { call, isOk, isSessionExpired } from '../client'
import type { ApiEnvelope, GetPendingApprovalsResponse, GetPermissionsResponse, ViewTransactionsResponse } from '../types'
import {
  effectivePermissions,
  forgetSeen,
  handleLocally,
  hasLocalHandler,
  hasSeenTransactions,
  rememberPermissions,
  rememberTransactions,
} from './handlers'
import { localGroup, persist, resetLocalStore } from './store'

/** `SERVICE/command`s the core did not answer this session. */
const unanswered = new Set<string>()

const TIMED_OUT = Symbol('timed out')

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function callWithFallback<T extends ApiEnvelope>(service: string, data: Record<string, unknown>): Promise<T> {
  const key = `${service}/${String(data.command)}`

  if (!unanswered.has(key)) {
    try {
      const response = await withTimeout(call<T>(service, data), env.unmappedTimeoutMs)
      if (response !== TIMED_OUT) {
        if (isOk(response) || isSessionExpired(response)) return response
      }
    } catch {
      // A transport failure is exactly the case this exists for.
    }
    if (!hasLocalHandler(service, String(data.command))) {
      return { result: 2, message: 'The bank did not answer. Try again later.' } as T
    }
    unanswered.add(key)
  }

  await ensureTransactionsSeen(data)
  usingLocalData.set(true)
  return handleLocally(service, data) as T
}

/** Local answers built on the core's transactions — a decision on one. */
const NEEDS_TRANSACTIONS = new Set(['approvetransaction', 'rejecttransaction', 'canceltransaction', 'archivetransaction'])

/**
 * A decision taken straight after a reload has not seen the core's transactions
 * yet (they are kept in memory only), so read them once first.
 */
async function ensureTransactionsSeen(data: Record<string, unknown>): Promise<void> {
  const onebankid = String(data.onebankid ?? '')
  if (!onebankid || !NEEDS_TRANSACTIONS.has(String(data.command)) || hasSeenTransactions(onebankid)) return
  try {
    const response = await call<ViewTransactionsResponse>('ONEBANKTRANSACTION', { command: 'viewtransactions', onebankid })
    if (isOk(response)) rememberTransactions(onebankid, response.items ?? [])
  } catch {
    // Without them the local statement starts from what was done locally.
  }
}

// ------------------------------------------------------------------ overlays

function sortNewestFirst<T extends { txtime?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => String(b.txtime ?? '').localeCompare(String(a.txtime ?? '')))
}

/** The core's transactions, with local decisions applied and local transactions added. */
export function overlayTransactions(onebankid: string, response: ViewTransactionsResponse): ViewTransactionsResponse {
  if (!isOk(response)) return response
  const real = response.items ?? []
  rememberTransactions(onebankid, real)
  const local = localGroup(onebankid)
  if (!local.transactions.length && !Object.keys(local.patches).length) return response
  const patched = real.map((tx) => {
    const patch = local.patches[String(tx.transactionid)]
    return patch ? { ...tx, ...patch } : tx
  })
  return { ...response, items: sortNewestFirst([...structuredClone(local.transactions), ...patched]) }
}

/** The core's pending list, minus what was decided locally. */
export function overlayPendingApprovals(onebankid: string, response: GetPendingApprovalsResponse): GetPendingApprovalsResponse {
  if (!isOk(response)) return response
  const patches = localGroup(onebankid).patches
  const items = (response.items ?? []).filter((tx) => {
    const patch = patches[String(tx.transactionid)]
    return !patch || patch.status === 'PENDING'
  })
  return items.length === (response.items ?? []).length ? response : { ...response, items }
}

/** The core's roles, with local edits, additions and removals applied. */
export function overlayPermissions(onebankid: string, response: GetPermissionsResponse): GetPermissionsResponse {
  if (!isOk(response)) return response
  const real = response.permissions ?? []
  rememberPermissions(onebankid, real)
  const local = localGroup(onebankid)
  if (!local.permissions.length && !local.removedPermissions.length) return response
  return { ...response, permissions: structuredClone(effectivePermissions(onebankid, real)) }
}

/** True for a role that exists only locally — the core has never heard of it. */
export function isLocalPermission(permissionid: number): boolean {
  return permissionid < 0
}

/**
 * Removes a role locally. A local-only role simply goes; a core role removed
 * while the core would not answer is hidden until the core agrees.
 */
export function removeLocalPermission(onebankid: string, permissionid: number): ApiEnvelope {
  const local = localGroup(onebankid)
  local.permissions = local.permissions.filter((permission) => permission.permissionid !== permissionid)
  if (!isLocalPermission(permissionid) && !local.removedPermissions.includes(permissionid)) {
    local.removedPermissions.push(permissionid)
  }
  persist()
  usingLocalData.set(true)
  return { result: 0 }
}

/** The core removed a role: drop any local edit of it. */
export function forgetLocalPermission(onebankid: string, permissionid: number): void {
  const local = localGroup(onebankid)
  const before = local.permissions.length
  local.permissions = local.permissions.filter((permission) => permission.permissionid !== permissionid)
  if (local.permissions.length !== before) persist()
}

/** Logout, and tests: forget everything local, and let the core be asked again. */
export function resetLocalData(): void {
  unanswered.clear()
  forgetSeen()
  resetLocalStore()
  usingLocalData.set(false)
}
