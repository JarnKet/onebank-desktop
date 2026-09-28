/**
 * Words for transactions, shared by the authorization page, the inbox and the
 * iBank slips so they never disagree on what a "TRANSFER" is called.
 *
 * The statement speaks its own wire format and has `lib/statement.ts` instead.
 */

import type { TransactionInfo } from './api/types'
import { t } from './utils/helper'

export const SERVICE_LABEL: Record<string, [string, string]> = {
  TRANSFER: ['Transfer', 'ໂອນເງິນ'],
  RECEIVE: ['Received', 'ຮັບເງິນ'],
  PAYMENT: ['OnePay payment', 'ຊຳລະ OnePay'],
  SALARY: ['Salary', 'ໂອນເງິນເດືອນ'],
  INTERBANK: ['Interbank transfer', 'ການໂອນເງິນຂ້າມທະນາຄານ'],
  ELECTRICITY: ['Electricity', 'ຄ່າໄຟຟ້າ'],
  WATER: ['Water', 'ຄ່ານ້ຳປະປາ'],
  TOPUP: ['Phone top-up', 'ຕື່ມມູນຄ່າໂທ'],
  CHEQUE: ['E-Cheque', 'E-Cheque'],
}

export function serviceLabel(service: string | undefined): string {
  const label = SERVICE_LABEL[service ?? '']
  return label ? t(label[0], label[1]) : (service ?? '')
}

export const STATUS_LABEL: Record<string, [string, string]> = {
  SUCCESS: ['Success', 'ສຳເລັດ'],
  PENDING: ['Pending', 'ລໍຖ້າອະນຸມັດ'],
  CANCELLED: ['Cancelled', 'ຍົກເລີກ'],
  REJECTED: ['Rejected', 'ຖືກປະຕິເສດ'],
  EXPIRED: ['Expired', 'ໝົດອາຍຸ'],
}

export function statusLabel(status: string | undefined): string {
  const label = STATUS_LABEL[status ?? '']
  return label ? t(label[0], label[1]) : (status ?? '')
}

/** Tailwind classes for a status chip. */
export function statusTone(status: string | undefined): string {
  switch (status) {
    case 'SUCCESS':
      return 'bg-green-50 text-green-700'
    case 'PENDING':
      return 'bg-violet-50 text-onebank-pending'
    case 'REJECTED':
    case 'EXPIRED':
      return 'bg-red-50 text-onebank-red'
    default:
      return 'bg-onebank-row text-onebank-subtle'
  }
}

/** Who the money went to (or came from), as the cards phrase it. */
export function counterpart(tx: TransactionInfo): string {
  const name = String(tx.detail?.TOACCOUNTNAME ?? '')
  const number = String(tx.detail?.TOACCOUNTNO ?? '')
  return `${name} ${number}`.trim()
}
