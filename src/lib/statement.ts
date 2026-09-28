/**
 * Reading an account statement from the core.
 *
 * `STATEMENT/statement` pages backwards and nothing else: it answers with the
 * newest rows of one account and takes `beforetime` to get the rows before
 * them. There is no from-date, so a date range is reached by paging until the
 * rows fall out of it — what the mobile app does.
 *
 * Its rows carry their own wire format (`DD/MM/YYYY HH:MM:SS`, label/value maps
 * instead of a typed detail), so the parsing lives here rather than in
 * `utils/helper.ts`, which speaks the ISO `txtime` of every other command.
 */

import { isOk } from './api/client'
import { statement } from './api/commands'
import type { StatementTransaction } from './api/types'
import { t } from './utils/helper'

/** `DD/MM/YYYY` and `HH:MM:SS` from a statement row's `time`. */
export function statementTime(time: string | undefined): { date: string; time: string } {
  const [date = '', clock = ''] = String(time ?? '').split(' ')
  return { date, time: clock }
}

/** The ISO day (`YYYY-MM-DD`) a row falls on: what the grouping and the date inputs use. */
export function statementDay(time: string | undefined): string {
  const [day, month, year] = statementTime(time).date.split('/')
  return year ? `${year}-${month}-${day}` : ''
}

export function statementTimestamp(time: string | undefined): number {
  const parts = statementTime(time)
  const [day, month, year] = parts.date.split('/').map(Number)
  if (!day || !month || !year) return NaN
  const [hours = 0, minutes = 0, seconds = 0] = parts.time.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, seconds).getTime()
}

/** An ISO day as the `beforetime` that takes in all of it. */
export function endOfDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-')
  return year ? `${day}/${month}/${year} 23:59:59` : ''
}

/** How many pages one read walks before it stops and leaves a cursor behind. */
export const MAX_PAGES = 25

export interface StatementRange {
  result: number
  message?: string
  items: StatementTransaction[]
  balance: number
  ccy: string
  /** The `beforetime` to continue from, or null when the range is complete. */
  cursor: string | null
}

/**
 * Every row of one account from an ISO day up to where `before` starts.
 *
 * `before` is the `beforetime` to page back from: `endOfDay(to)` for a fresh
 * read, a previous result's `cursor` to go on. The walk stops after `maxPages`
 * so a busy account cannot hold the screen; the cursor then says there is more.
 */
export async function loadRange(accountid: string, from: string, before: string, maxPages = MAX_PAGES): Promise<StatementRange> {
  const start = new Date(`${from}T00:00:00`).getTime()
  const items: StatementTransaction[] = []
  const seen = new Set<string>()
  let balance = 0
  let ccy = 'LAK'
  let beforetime: string | null = before
  let page = 0

  while (beforetime && page < maxPages) {
    page++
    const response = await statement(accountid, beforetime)
    if (!isOk(response)) {
      return { result: response?.result ?? -1, message: response?.message, items, balance, ccy, cursor: null }
    }
    if (page === 1) {
      balance = Number(response.balance ?? 0)
      ccy = response.ccy ?? 'LAK'
    }
    const rows = response.statements ?? []
    for (const row of rows) {
      // Paging by the oldest row's own time can bring that row back.
      const key = rowKey(row)
      if (seen.has(key)) continue
      seen.add(key)
      if (statementTimestamp(row.time) >= start) items.push(row)
    }
    const oldest = rows[rows.length - 1]?.time
    // No rows left, a time that does not move, or rows older than the range: done.
    beforetime = !oldest || oldest === beforetime || statementTimestamp(oldest) < start ? null : oldest
  }

  return { result: 0, items, balance, ccy, cursor: beforetime }
}

function rowKey(row: StatementTransaction): string {
  return [row.time, row.type, row.amount, row.balance, row.detailkey?.billno ?? ''].join('|')
}

/** The label/value pairs a row shows, in the reader's language. */
export function rowDetails(row: StatementTransaction, lao: boolean): Array<[string, string]> {
  const source = (lao ? row.summary : row.summarykey) ?? {}
  return Object.entries(source).filter((entry): entry is [string, string] => Boolean(entry[1]))
}

/** The reference the design's table prints. */
export function rowReference(row: StatementTransaction): string {
  return String(row.detailkey?.billno ?? '')
}

/** Everything the search box matches on. */
export function rowText(row: StatementTransaction): string {
  const pairs = [...Object.values(row.summary ?? {}), ...Object.values(row.summarykey ?? {}), ...Object.values(row.detailkey ?? {})]
  return [row.title, row.subtitle, row.type, row.user, ...pairs].filter(Boolean).join(' ').toLowerCase()
}

// ---------------------------------------------------------------- the filters

/**
 * The filter modal's chips.
 *
 * The core filters nothing — it answers an account and a `beforetime` — so a
 * chip is only a name for a property of the rows already read. Each group owns
 * an id prefix and says which of its ids a row carries, so a chip whose rows
 * are no longer loaded (a type absent from a shorter period) leaves nothing
 * through rather than being quietly ignored.
 */
export interface StatementFilter {
  id: string
  label: string
}

export interface StatementFilterGroup {
  en: string
  lo: string
  prefix: string
  filters: StatementFilter[]
  idsFor: (row: StatementTransaction) => string[]
}

const DIRECTION = 'DIR:'
const TYPE = 'TYPE:'

export function typeFilterId(type: string): string {
  return TYPE + type
}

const DIRECTIONS: StatementFilterGroup = {
  en: 'Direction',
  lo: 'ທິດທາງ',
  prefix: DIRECTION,
  filters: [
    { id: `${DIRECTION}IN`, label: t('Money in', 'ເງິນເຂົ້າ') },
    { id: `${DIRECTION}OUT`, label: t('Money out', 'ເງິນອອກ') },
  ],
  idsFor: (row) => (row.amount > 0 ? [`${DIRECTION}IN`] : row.amount < 0 ? [`${DIRECTION}OUT`] : []),
}

/**
 * Direction, then the movement types the rows carry — BCEL's own TRO / TRI /
 * ONP / FEE …, which the core words for us in each row's `title`. Not a fixed
 * taxonomy: an account with no fee lines offers no FEE chip.
 */
export function filterGroups(rows: StatementTransaction[]): StatementFilterGroup[] {
  const titles = new Map<string, string>()
  for (const row of rows) if (row.type && !titles.has(row.type)) titles.set(row.type, row.title ?? '')
  return [
    DIRECTIONS,
    {
      en: 'Movement type',
      lo: 'ປະເພດການເຄື່ອນໄຫວ',
      prefix: TYPE,
      filters: [...titles]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, title]) => ({ id: typeFilterId(type), label: title ? `${type} — ${title}` : type })),
      idsFor: (row) => (row.type ? [typeFilterId(row.type)] : []),
    },
  ]
}

/** The wording for a chip, including one whose rows are no longer loaded. */
export function filterLabel(groups: StatementFilterGroup[], id: string): string {
  const filter = groups.flatMap((group) => group.filters).find((candidate) => candidate.id === id)
  return filter?.label ?? id.slice(id.indexOf(':') + 1)
}

/**
 * True when a row passes every group a chip is selected in.
 *
 * Within a group the chips widen the result, across groups they narrow it:
 * "money out" and "ONP" together mean OnePay payments, not either of the two.
 */
export function matchesFilters(row: StatementTransaction, ids: string[], groups: StatementFilterGroup[]): boolean {
  if (!ids.length) return true
  return groups.every((group) => {
    const chosen = ids.filter((id) => id.startsWith(group.prefix))
    return !chosen.length || group.idsFor(row).some((id) => chosen.includes(id))
  })
}
