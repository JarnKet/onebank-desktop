/**
 * The sidebar's badge counts, read from the core — never hardcoded (the old
 * sidebar carried a literal `notifications: 2` whatever the data said).
 *
 * - Pending authorization: the `getpendingapprovals` items still waiting —
 *   the core also returns EXPIRED ones, which need no decision.
 * - Messages: the core contract has no read/unread state, so there is no
 *   honest count to show; `unreadCount` stays 0 and the badge stays hidden
 *   until such a command exists.
 */

import { get, writable } from 'svelte/store'
import { getPendingApprovals } from '../lib/api/commands'
import { currentGroup } from './onebankGroups'
import { loginData } from './session'

export const unreadCount = writable(0)
export const pendingCount = writable(0)

/** The logged-in user's id, from the login payload, when the core sends one. */
export function myUserId(): string {
  const data = get(loginData) as any
  return String(data?.USER?.userid ?? data?.USER?.id ?? '')
}

export async function refreshBadges(onebankid: string = get(currentGroup)): Promise<void> {
  if (!onebankid) return
  try {
    const pending = await getPendingApprovals(onebankid)
    const items = pending?.result === 0 ? (pending.items ?? []) : []
    pendingCount.set(items.filter((tx) => tx.status === 'PENDING').length)
  } catch {
    // A badge is decoration; a failed count must not break the shell.
  }
}
