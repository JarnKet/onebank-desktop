/**
 * Drawing a statement file ourselves — the shadow-account case.
 *
 * A shadow account has no statement the core renders: `downloadfile` answers
 * with rows instead, and the file is built here as onebank-ui builds it — an A4
 * PDF through jsPDF with the Lao font embedded, or the bank's own xlsx template
 * filled in. Both libraries and all three assets load on demand, so an ordinary
 * account's export never pays for them.
 *
 * The layout is the bank's, harvested from `ONEBANKSTATEMENT/helper.ts`: the
 * column widths add up to the 194mm an A4 page leaves between 8mm margins, and
 * the template's cells are addressed by number. Neither is ours to redesign.
 */

import type { Row } from 'exceljs'
import type { StatementFileRow, StatementFileType } from './api/types'
import type { Account } from '../definition'

const FONT_URL = 'phetsarath_ot.ttf'
const FONT_NAME = 'font-phetsarath-ot'
const LOGO_URL = 'img/logobcel.png'
const TEMPLATE_URL = 'img/SHADOW_ACCOUNT_TEMPLATE.xlsx'

/** The columns, in the order both the PDF table and the template's sheet want them. */
const COLUMNS: Array<keyof StatementFileRow> = ['txtime', 'amount', 'service', 'ticket', 'merchantname', 'fccref', 'description']

const HEADINGS = ['TX Time', 'Amount', 'Service', 'Ticket', 'Merchant Name', 'Fccref', 'Description']

/** Millimetres per column: 194mm, the width of A4 inside 8mm margins. */
const WIDTHS = [18, 23, 18, 27, 40, 27, 41]

const MARGIN = 8

export interface StatementFileMeta {
  account: Account
  /** `DD/MM/YYYY`, as the heading prints them. */
  fromdate: string
  todate: string
}

export interface StatementFileBody {
  /** Each movement, and a `fee` line under the ones that carry a fee. */
  rows: string[][]
  totalAmount: number
  totalFee: number
}

function money(amount: number): string {
  return Number(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function when(txtime: string): string {
  const date = new Date(txtime)
  if (Number.isNaN(date.getTime())) return txtime
  return date
    .toLocaleString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    .replace(',', '')
}

export function statementFileBody(rows: StatementFileRow[]): StatementFileBody {
  const body: string[][] = []
  let totalAmount = 0
  let totalFee = 0
  for (const row of rows) {
    totalAmount += Number(row.amount ?? 0)
    totalFee += Number(row.fee ?? 0)
    body.push([when(row.txtime), money(row.amount), row.service ?? '', row.ticket ?? '', row.merchantname ?? '', row.fccref ?? '', row.description ?? ''])
    if (Number(row.fee ?? 0) > 0) body.push(['fee', money(row.fee), '', '', '', '', ''])
  }
  return { rows: body, totalAmount, totalFee }
}

/** `DD/MM/YYYY`, and the long form the footer stamps the file with. */
export function displayDay(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

function stamp(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Renders the file the core would have sent. Throws with a message fit to show. */
export async function renderStatementFile(rows: StatementFileRow[], filetype: StatementFileType, meta: StatementFileMeta): Promise<Blob> {
  return filetype === 'pdf' ? renderPdf(rows, meta) : renderExcel(rows, meta)
}

// ------------------------------------------------------------------------ PDF

let fontPromise: Promise<string> | undefined
let logoPromise: Promise<string> | undefined

function base64(bytes: Uint8Array): string {
  // In chunks: one apply() over 200KB of arguments overflows the stack.
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}

async function fetchBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return base64(new Uint8Array(await response.arrayBuffer()))
}

function embeddedFont(): Promise<string> {
  fontPromise ??= fetchBase64(FONT_URL).catch((error) => {
    fontPromise = undefined
    throw error
  })
  return fontPromise
}

function logo(): Promise<string> {
  logoPromise ??= fetchBase64(LOGO_URL)
    .then((data) => `data:image/png;base64,${data}`)
    .catch(() => '')
  return logoPromise
}

async function renderPdf(rows: StatementFileRow[], meta: StatementFileMeta): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }, font, logoData] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    embeddedFont(),
    logo(),
  ])
  const { account, fromdate, todate } = meta
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.addFileToVFS('phetsarath_ot.ttf', font)
  // Registered under both styles: the one TTF has no bold cut, and asking jsPDF for a
  // bold it does not know only warns and falls back — as it does in onebank-ui.
  doc.addFont('phetsarath_ot.ttf', FONT_NAME, 'normal')
  doc.addFont('phetsarath_ot.ttf', FONT_NAME, 'bold')
  doc.setFont(FONT_NAME, 'normal')

  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const contentWidth = pageWidth - MARGIN * 2
  const today = new Date()

  const left = (text: string, y: number, size = 8, x = MARGIN) => {
    doc.setFontSize(size)
    doc.text(text, x, y)
  }
  const centre = (text: string, y: number, size = 8) => {
    doc.setFontSize(size)
    doc.text(text, pageWidth / 2, y, { align: 'center' })
  }
  const right = (text: string, y: number, size = 8) => {
    doc.setFontSize(size)
    doc.text(text, pageWidth - MARGIN, y, { align: 'right' })
  }

  const logoX = MARGIN - 2
  if (logoData) doc.addImage(logoData, 'PNG', logoX, 8, 16, 16)
  const textX = logoX + 18
  left('BANQUE POUR LE COMMERCE EXTERIEUR LAO PUBLIC', 12, 8, textX)
  left('BRANCH CODE: ALL - ALL', 17, 8, textX)
  right(`Account Date: ${displayDay(today)}`, 17, 7)
  left('SUB BRANCH CODE: 888010-ທຄຕລມະຫາຊົນສໍານັກງານໃຫຍ່', 22, 8, textX)

  doc.setFont(FONT_NAME, 'bold')
  centre('Account Statement', 30, 10)
  doc.setFont(FONT_NAME, 'normal')
  centre('via BCEL OneBank', 35)
  centre(`From Date : ${fromdate} To ${todate}`, 40)
  left(`Account No : ${account.accountid}`, 48, 8, MARGIN * 3)
  left(`Currency : ${account.ccy}`, 48, 8, MARGIN * 3 + contentWidth / 2)
  left(`Account Alias : ${account.alias || '-'}`, 53, 8, MARGIN * 3)
  left(`Account Type : ${account.type}`, 53, 8, MARGIN * 3 + contentWidth / 2)

  const body = statementFileBody(rows)
  const columnStyles = Object.fromEntries(
    WIDTHS.map((width, index) => [
      index,
      { cellWidth: width, minCellWidth: width, halign: index === 1 ? 'right' : index === 0 || index === 2 ? 'center' : 'left' } as const,
    ]),
  )

  autoTable(doc, {
    startY: 58,
    head: [HEADINGS],
    body: body.rows,
    theme: 'grid',
    styles: {
      font: FONT_NAME,
      fontStyle: 'normal',
      cellPadding: 1,
      fontSize: 8,
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
      textColor: [56, 56, 56],
      overflow: 'linebreak',
      minCellHeight: 6,
    },
    headStyles: { fillColor: [192, 192, 192], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', valign: 'middle' },
    columnStyles,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: contentWidth,
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: 0,
    showHead: 'everyPage',
    didParseCell: (data) => {
      if (data.section !== 'body') return
      if (body.rows[data.row.index]?.[0] === 'fee') {
        data.cell.styles.fillColor = [247, 247, 247]
        data.cell.styles.fontStyle = 'italic'
        data.cell.styles.textColor = [90, 90, 90]
        data.cell.styles.halign = 'right'
      } else if ((data.column.index === 4 || data.column.index === 6) && data.cell.text) {
        data.cell.styles.overflow = 'linebreak'
        data.cell.styles.minCellHeight = 8
      }
    },
  })

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 70
  autoTable(doc, {
    startY: finalY + 1,
    body: [
      ['Total Amount', money(body.totalAmount)],
      ['Total Fee', money(body.totalFee)],
      ['Total', money(body.totalAmount + body.totalFee)],
    ],
    styles: {
      font: FONT_NAME,
      fontStyle: 'normal',
      cellPadding: 1,
      fontSize: 8,
      overflow: 'linebreak',
      minCellHeight: 6,
      fillColor: [255, 255, 255],
      lineWidth: 0,
    },
    columnStyles: { 0: { cellWidth: contentWidth / 2, halign: 'right' }, 1: { cellWidth: 'auto', halign: 'right' } },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: contentWidth,
    theme: 'plain',
    didParseCell: (data) => {
      if (data.column.index === 1) data.cell.styles.fontStyle = 'bold'
      if (data.row.index === 2) {
        data.cell.styles.fillColor = [192, 192, 192]
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.valign = 'middle'
        data.cell.styles.lineWidth = 0.1
        data.cell.styles.lineColor = [0, 0, 0]
      } else {
        data.cell.styles.lineWidth = 0
      }
    },
  })

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFontSize(7)
    doc.setFont(FONT_NAME, 'normal')
    doc.text(`Date: ${stamp(today)}`, MARGIN, pageHeight - 10)
    doc.text(`Page ${page} of ${pages}`, pageWidth - MARGIN, pageHeight - 10, { align: 'right' })
  }

  return doc.output('blob')
}

// ---------------------------------------------------------------------- Excel

const THIN = { style: 'thin' as const }
const BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const FEE_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF7F7F7' } }
const LAO_FONT = { name: 'Phetsarath OT', size: 8 }
/** The template's first free row; the header above it is the bank's. */
const FIRST_ROW = 13

async function renderExcel(rows: StatementFileRow[], meta: StatementFileMeta): Promise<Blob> {
  const [{ default: ExcelJS }, template] = await Promise.all([import('exceljs'), fetch(TEMPLATE_URL)])
  if (!template.ok) throw new Error(`${TEMPLATE_URL}: ${template.status}`)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await template.arrayBuffer())
  const sheet = workbook.getWorksheet(1)
  if (!sheet) throw new Error('The statement template is empty')

  const { account, fromdate, todate } = meta
  sheet.getCell(2, 6).value = `Account Date: ${displayDay(new Date())}`
  sheet.getCell(2, 6).font = LAO_FONT
  sheet.getCell(8, 2).value = `From Date : ${fromdate}`
  sheet.getCell(8, 2).font = LAO_FONT
  sheet.getCell(8, 3).value = `To ${todate}`
  sheet.getCell(9, 3).value = account.accountid
  sheet.getCell(9, 6).value = account.ccy
  sheet.getCell(10, 3).value = account.alias || '-'
  sheet.getCell(10, 6).value = account.type
  sheet.mergeCells('C9:D9')

  // The sheet takes the rows as they came: Excel does the formatting, through numFmt.
  const body = statementFileBody(rows)
  sheet.spliceRows(FIRST_ROW, 0, ...Array(body.rows.length).fill(null))

  let index = FIRST_ROW
  for (const row of rows) {
    fillRow(sheet.getRow(index++), row)
    const fee = Number(row.fee ?? 0)
    if (fee > 0) fillFeeRow(sheet.getRow(index++), fee)
  }

  for (const [label, value] of [
    ['Total Amount', body.totalAmount],
    ['Total Fee', body.totalFee],
    ['Total', body.totalAmount + body.totalFee],
  ] as const) {
    sheet.getCell(index, 1).value = label
    sheet.getCell(index, 2).value = value
    index++
  }
  sheet.getCell(index, 1).value = `Date: ${stamp(new Date())}`

  return new Blob([await workbook.xlsx.writeBuffer()], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function fillRow(sheetRow: Row, row: StatementFileRow): void {
  COLUMNS.forEach((column, index) => {
    const cell = sheetRow.getCell(index + 1)
    cell.value = row[column] ?? ''
    cell.border = BORDERS
    cell.alignment = {
      horizontal: column === 'amount' || column === 'txtime' ? 'right' : column === 'service' ? 'center' : 'left',
      vertical: 'middle',
      wrapText: true,
    }
    if (column === 'amount') cell.numFmt = '#,##0.00'
  })
  sheetRow.height = 18
}

function fillFeeRow(row: Row, fee: number): void {
  const label = row.getCell(1)
  label.value = 'fee'
  label.alignment = { horizontal: 'right', vertical: 'middle' }
  label.font = { italic: true, size: 10, color: { argb: 'FF606060' } }
  const amount = row.getCell(2)
  amount.value = fee
  amount.numFmt = '#,##0.00'
  amount.alignment = { horizontal: 'right' }
  amount.font = { italic: true, size: 10, color: { argb: 'FF606060' } }
  for (let column = 1; column <= COLUMNS.length; column++) {
    const cell = row.getCell(column)
    cell.border = BORDERS
    cell.fill = FEE_FILL
  }
  row.height = 16
}
