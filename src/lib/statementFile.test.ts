/**
 * The statement file this app draws itself (`./statementFile.ts`).
 *
 * The body is ours — the fee line under a movement that carries one, the three
 * totals under the table. The drawing is jsPDF's and ExcelJS's, and is checked
 * end to end by serving the real font, logo and xlsx template to `fetch`, which
 * jsdom will not do for a relative URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { StatementFileRow } from './api/types'
import type { Account } from '../definition'
import { displayDay, renderStatementFile, statementFileBody } from './statementFile'

const ASSETS: Record<string, string> = {
  'phetsarath_ot.ttf': 'public/phetsarath_ot.ttf',
  'img/logobcel.png': 'public/img/logobcel.png',
  'img/SHADOW_ACCOUNT_TEMPLATE.xlsx': 'public/img/SHADOW_ACCOUNT_TEMPLATE.xlsx',
}

const account = {
  accountid: 'A1',
  account: '010120000000000001',
  alias: 'petty',
  ccy: 'LAK',
  name: 'ACME',
  type: 'SHADOW',
  viewonly: 0,
  maskedAccount: '****0001',
} satisfies Account

const meta = { account, fromdate: '01/07/2025', todate: '15/07/2025' }

function row(amount: number, fee = 0): StatementFileRow {
  return {
    txtime: '2025-07-14 09:51:31',
    amount,
    ccy: 'LAK',
    service: 'TRANSFER',
    ticket: 'T1',
    bank: 'BCEL',
    merchantname: 'PAYEE',
    fccref: 'F1',
    alias: '',
    description: 'rent',
    fee,
    feeccy: 'LAK',
  }
}

describe('the body of the file', () => {
  it('prints a movement per row, money to two decimals', () => {
    const body = statementFileBody([row(-1500000)])
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0][1]).toBe('-1,500,000.00')
    expect(body.rows[0].slice(2)).toEqual(['TRANSFER', 'T1', 'PAYEE', 'F1', 'rent'])
  })

  it('puts a fee on its own line under the movement that carries it', () => {
    const body = statementFileBody([row(-1000, 15000), row(-2000)])
    expect(body.rows.map((entry) => entry[0])).toEqual(['07/14/2025 09:51:31 AM', 'fee', '07/14/2025 09:51:31 AM'])
    expect(body.rows[1][1]).toBe('15,000.00')
  })

  it('totals the movements and the fees apart', () => {
    const body = statementFileBody([row(-1000, 15000), row(5000, 0)])
    expect(body.totalAmount).toBe(4000)
    expect(body.totalFee).toBe(15000)
  })

  it('leaves a time it cannot read alone', () => {
    expect(statementFileBody([{ ...row(-1), txtime: 'whenever' }]).rows[0][0]).toBe('whenever')
  })

  it('reads an empty statement as three zero totals', () => {
    const body = statementFileBody([])
    expect(body).toEqual({ rows: [], totalAmount: 0, totalFee: 0 })
  })

  it('prints the heading days as DD/MM/YYYY', () => {
    expect(displayDay(new Date(2025, 6, 4))).toBe('04/07/2025')
  })
})

describe('drawing the file', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const file = ASSETS[String(url)]
      if (!file) return { ok: false, status: 404 }
      const bytes = readFileSync(file)
      return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('draws a PDF with the Lao font embedded', async () => {
    const blob = await renderStatementFile([row(-1000, 15000), row(5000)], 'pdf', meta)
    expect(blob.type).toBe('application/pdf')
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer())
    expect(text.startsWith('%PDF-')).toBe(true)
    // The Lao font is subsetted into the file, which is what makes it 100KB+.
    expect(text).toContain('/FontFile2')
    expect(blob.size).toBeGreaterThan(100_000)
  })

  it("fills the bank's own xlsx template, rows then totals", async () => {
    const blob = await renderStatementFile([row(-1000, 15000), row(5000)], 'xlsx', meta)
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blob.arrayBuffer())
    const sheet = workbook.getWorksheet(1)!
    expect(sheet.getCell(9, 3).value).toBe('A1')
    expect(sheet.getCell(10, 3).value).toBe('petty')
    expect(sheet.getCell(13, 1).value).toBe('2025-07-14 09:51:31')
    expect(sheet.getCell(13, 2).value).toBe(-1000)
    expect(sheet.getCell(14, 1).value).toBe('fee')
    expect(sheet.getCell(14, 2).value).toBe(15000)
    expect(sheet.getCell(15, 2).value).toBe(5000)
    expect(sheet.getCell(16, 1).value).toBe('Total Amount')
    expect(sheet.getCell(16, 2).value).toBe(4000)
    expect(sheet.getCell(17, 2).value).toBe(15000)
    expect(sheet.getCell(18, 2).value).toBe(19000)
  })

  it('throws rather than save a broken file when the template is missing', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }))
    await expect(renderStatementFile([row(-1)], 'xlsx', meta)).rejects.toThrow()
  })
})
