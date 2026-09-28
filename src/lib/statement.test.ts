/**
 * Walking the statement backwards (`./statement.ts`).
 *
 * The core has no from-date, so the range is reached by paging. What must hold:
 * the walk stops, it never loops, and it never invents or drops a row.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setTransport } from './api/client'
import type { StatementTransaction } from './api/types'
import type { Account } from '../definition'
import {
  base64ToBlob,
  compactDay,
  endOfDay,
  exportFileName,
  exportStatement,
  filterGroups,
  filterLabel,
  loadRange,
  matchesFilters,
  rowDetails,
  rowReference,
  rowText,
  statementDay,
  statementTime,
  statementTimestamp,
  typeFilterId,
} from './statement'

function row(time: string, amount = -1000): StatementTransaction {
  return {
    time,
    type: 'TRO',
    title: 'Transfer out',
    summary: { ຫາບັນຊີ: 'PAYEE' },
    summarykey: { toaccount: 'PAYEE' },
    detail: {},
    detailkey: { billno: `B${time}` },
    balance: 5000,
    amount,
    diff: 0,
    user: 'ME',
  }
}

let asked: Array<string | null>

/** A core holding exactly these rows, answering `size` of them a page. */
function coreWith(times: string[], size = 2) {
  setTransport(async (_service, data) => {
    const before = (data.beforetime as string | null) ?? null
    asked.push(before)
    const cut = before ? statementTimestamp(before) : Infinity
    const rows = times
      .filter((time) => statementTimestamp(time) <= cut)
      .sort((a, b) => statementTimestamp(b) - statementTimestamp(a))
      .slice(0, size)
    return { result: 0, statements: rows.map((time) => row(time)), balance: 5000, ccy: 'LAK' }
  })
}

beforeEach(() => {
  asked = []
})

afterEach(() => setTransport(null))

describe('the wire format', () => {
  it('splits the core\'s own DD/MM/YYYY HH:MM:SS', () => {
    expect(statementTime('14/07/2025 09:51:31')).toEqual({ date: '14/07/2025', time: '09:51:31' })
    expect(statementDay('14/07/2025 09:51:31')).toBe('2025-07-14')
    expect(statementTimestamp('14/07/2025 09:51:31')).toBe(new Date(2025, 6, 14, 9, 51, 31).getTime())
  })

  it('survives a row with no time', () => {
    expect(statementTime(undefined)).toEqual({ date: '', time: '' })
    expect(statementDay('')).toBe('')
    expect(statementTimestamp('rubbish')).toBeNaN()
  })

  it('turns an ISO day into the beforetime that takes all of it in', () => {
    expect(endOfDay('2025-07-14')).toBe('14/07/2025 23:59:59')
  })
})

describe('loadRange', () => {
  it('starts from the end of the to-day and keeps only rows in the range', async () => {
    coreWith(['15/07/2025 10:00:00', '14/07/2025 10:00:00', '13/07/2025 10:00:00', '09/07/2025 10:00:00'])
    const range = await loadRange('A1', '2025-07-13', endOfDay('2025-07-15'))
    expect(asked[0]).toBe('15/07/2025 23:59:59')
    expect(range.items.map((item) => item.time)).toEqual(['15/07/2025 10:00:00', '14/07/2025 10:00:00', '13/07/2025 10:00:00'])
    expect(range.cursor).toBeNull()
    expect(range.balance).toBe(5000)
    expect(range.ccy).toBe('LAK')
  })

  it('pages until the rows fall out of the range', async () => {
    coreWith(['15/07/2025 10:00:00', '14/07/2025 10:00:00', '13/07/2025 10:00:00', '12/07/2025 10:00:00', '01/07/2025 10:00:00'])
    const range = await loadRange('A1', '2025-07-12', endOfDay('2025-07-15'))
    expect(asked).toHaveLength(4)
    expect(range.items).toHaveLength(4)
  })

  it('drops the boundary row the core sends back twice', async () => {
    coreWith(['15/07/2025 10:00:00', '14/07/2025 10:00:00', '13/07/2025 10:00:00', '12/07/2025 10:00:00'], 3)
    const range = await loadRange('A1', '2025-07-01', endOfDay('2025-07-15'))
    expect(range.items.map((item) => item.time)).toEqual([
      '15/07/2025 10:00:00',
      '14/07/2025 10:00:00',
      '13/07/2025 10:00:00',
      '12/07/2025 10:00:00',
    ])
  })

  it('stops rather than loop when the core keeps answering the same page', async () => {
    setTransport(async (_service, data) => {
      asked.push((data.beforetime as string) ?? null)
      return { result: 0, statements: [row('14/07/2025 10:00:00')], balance: 1, ccy: 'LAK' }
    })
    const range = await loadRange('A1', '2025-01-01', endOfDay('2025-07-15'))
    expect(asked).toHaveLength(2)
    expect(range.items).toHaveLength(1)
    expect(range.cursor).toBeNull()
  })

  it('stops at the page cap and leaves a cursor to go on with', async () => {
    setTransport(async (_service, data) => {
      const before = (data.beforetime as string) ?? ''
      asked.push(before)
      const day = 28 - asked.length
      return { result: 0, statements: [row(`${String(day).padStart(2, '0')}/07/2025 10:00:00`)], balance: 1, ccy: 'LAK' }
    })
    const range = await loadRange('A1', '2025-01-01', endOfDay('2025-07-28'), 3)
    expect(asked).toHaveLength(3)
    expect(range.items).toHaveLength(3)
    expect(range.cursor).toBe('25/07/2025 10:00:00')
  })

  it('passes a refusal back with its message, keeping what it has', async () => {
    let page = 0
    setTransport(async () => {
      page++
      if (page === 1) return { result: 0, statements: [row('15/07/2025 10:00:00'), row('14/07/2025 10:00:00')], balance: 7, ccy: 'USD' }
      return { result: 9, message: 'Account not permitted' }
    })
    const range = await loadRange('A1', '2025-01-01', endOfDay('2025-07-15'))
    expect(range.result).toBe(9)
    expect(range.message).toBe('Account not permitted')
    expect(range.items).toHaveLength(2)
    expect(range.ccy).toBe('USD')
  })

  it('reads an empty account without asking twice', async () => {
    setTransport(async () => ({ result: 0, statements: [], balance: 0, ccy: 'LAK' }))
    const range = await loadRange('A1', '2025-07-01', endOfDay('2025-07-15'))
    expect(range.items).toEqual([])
    expect(range.cursor).toBeNull()
  })
})

describe('reading a row', () => {
  it('shows the English labels in English and the Lao ones in Lao', () => {
    expect(rowDetails(row('14/07/2025 10:00:00'), false)).toEqual([['toaccount', 'PAYEE']])
    expect(rowDetails(row('14/07/2025 10:00:00'), true)).toEqual([['ຫາບັນຊີ', 'PAYEE']])
  })

  it('takes the reference from the bill number', () => {
    expect(rowReference(row('14/07/2025 10:00:00'))).toBe('B14/07/2025 10:00:00')
    expect(rowReference({ ...row('x'), detailkey: {} })).toBe('')
  })

  it('searches the title, the type and every detail value', () => {
    const text = rowText(row('14/07/2025 10:00:00'))
    expect(text).toContain('transfer out')
    expect(text).toContain('tro')
    expect(text).toContain('payee')
  })
})

describe('the filter chips', () => {
  const out = { ...row('14/07/2025 10:00:00', -1000), type: 'TRO', title: 'Transfer out' }
  const onp = { ...row('14/07/2025 11:00:00', -2000), type: 'ONP', title: 'OnePay' }
  const income = { ...row('15/07/2025 10:00:00', 5000), type: 'TRI', title: 'Transfer in' }
  const rows = [out, onp, income]

  it('offers direction always and only the types the rows carry', () => {
    const groups = filterGroups(rows)
    expect(groups.map((group) => group.en)).toEqual(['Direction', 'Movement type'])
    expect(groups[1].filters.map((filter) => filter.id)).toEqual([typeFilterId('ONP'), typeFilterId('TRI'), typeFilterId('TRO')])
    expect(groups[1].filters[0].label).toBe('ONP — OnePay')
    expect(filterGroups([])[1].filters).toEqual([])
  })

  it('lets everything through when nothing is chosen', () => {
    const groups = filterGroups(rows)
    expect(rows.every((candidate) => matchesFilters(candidate, [], groups))).toBe(true)
  })

  it('widens within a group and narrows across groups', () => {
    const groups = filterGroups(rows)
    const kept = (ids: string[]) => rows.filter((candidate) => matchesFilters(candidate, ids, groups)).map((candidate) => candidate.type)
    expect(kept([typeFilterId('TRO'), typeFilterId('ONP')])).toEqual(['TRO', 'ONP'])
    expect(kept(['DIR:OUT'])).toEqual(['TRO', 'ONP'])
    expect(kept(['DIR:OUT', typeFilterId('ONP')])).toEqual(['ONP'])
    expect(kept(['DIR:IN', typeFilterId('ONP')])).toEqual([])
  })

  it('keeps a chosen type excluding once its rows are gone, rather than being ignored', () => {
    const groups = filterGroups([income])
    expect(matchesFilters(income, [typeFilterId('ONP')], groups)).toBe(false)
    expect(filterLabel(groups, typeFilterId('ONP'))).toBe('ONP')
  })

  it('words a chip from the group it belongs to', () => {
    const groups = filterGroups(rows)
    expect(filterLabel(groups, typeFilterId('TRI'))).toBe('TRI — Transfer in')
    expect(filterLabel(groups, 'DIR:IN')).toBe('Money in')
  })
})

describe('the export', () => {
  const account = {
    accountid: 'A1',
    account: '010120000000000001',
    alias: 'petty',
    ccy: 'LAK',
    name: 'ACME',
    type: 'SAVING',
    viewonly: 0,
    maskedAccount: '****0001',
  } satisfies Account

  it('asks the core for the file it renders itself, in YYYYMMDD', async () => {
    const sent: Array<Record<string, unknown>> = []
    setTransport(async (_service, data) => {
      sent.push(data)
      return { result: 0, data: btoa('a pdf') }
    })
    expect(await exportStatement(account, '2025-07-01', '2025-07-15', 'pdf')).toEqual({ ok: true })
    expect(sent[0]).toMatchObject({ command: 'downloadfile', fromdate: '20250701', todate: '20250715', filetype: 'pdf', accountid: 'A1' })
  })

  it('names the file as onebank-ui does, with the extension it leaves off', () => {
    expect(compactDay('2025-07-01')).toBe('20250701')
    expect(exportFileName(account, '2025-07-01', '2025-07-15', 'xlsx')).toBe('STATEMENT_petty_20250701_20250715.xlsx')
    expect(exportFileName({ ...account, alias: '' }, '2025-07-01', '2025-07-15', 'pdf')).toBe(
      'STATEMENT_010120000000000001_20250701_20250715.pdf',
    )
  })

  it('decodes the base64 into a file of the right type', () => {
    expect(base64ToBlob(btoa('hello'), 'pdf').type).toBe('application/pdf')
    expect(base64ToBlob(btoa('hello'), 'xlsx').type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(base64ToBlob(btoa('hello'), 'pdf').size).toBe(5)
  })

  it('passes a refusal back with the message', async () => {
    setTransport(async () => ({ result: 9, message: 'Not permitted' }))
    expect(await exportStatement(account, '2025-07-01', '2025-07-15', 'pdf')).toEqual({ ok: false, message: 'Not permitted' })
  })

  it('says so rather than save something else when the core sends rows, not a file', async () => {
    setTransport(async () => ({ result: 0, json: [{ txtime: '2025-07-01', amount: -1 }] }))
    const result = await exportStatement(account, '2025-07-01', '2025-07-15', 'pdf')
    expect(result.ok).toBe(false)
    expect(result.message).toBe('This account has no downloadable statement yet')
  })

  it('needs an account', async () => {
    expect((await exportStatement(undefined, '2025-07-01', '2025-07-15', 'pdf')).ok).toBe(false)
  })
})
