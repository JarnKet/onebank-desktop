/** The pending-authorization badge: only what is still waiting on a decision. */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { setTransport } from '../lib/api/client'
import { resetLocalData } from '../lib/api/local'
import { pendingCount, refreshBadges } from './badges'
import { currentGroup } from './onebankGroups'

const GROUP = 'G-1'

const approval = (transactionid: number, status: string) => ({
  transactionid,
  status,
  service: 'TRANSFER',
  command: 'transfer',
  txtime: '2025-09-30 09:47:52',
})

beforeEach(() => {
  resetLocalData()
  currentGroup.set(GROUP)
  pendingCount.set(0)
})

afterEach(() => {
  setTransport(null)
  currentGroup.set('')
})

it('counts the approvals still waiting', async () => {
  setTransport(async () => ({ result: 0, items: [approval(1, 'PENDING'), approval(2, 'PENDING')] }))
  await refreshBadges()
  expect(get(pendingCount)).toBe(2)
})

it('leaves expired approvals out of the count', async () => {
  setTransport(async () => ({ result: 0, items: [approval(1, 'PENDING'), approval(2, 'EXPIRED'), approval(3, 'EXPIRED')] }))
  await refreshBadges()
  expect(get(pendingCount)).toBe(1)
})

it('shows no badge when the core refuses', async () => {
  pendingCount.set(3)
  setTransport(async () => ({ result: 2, message: 'no' }))
  await refreshBadges()
  expect(get(pendingCount)).toBe(0)
})
