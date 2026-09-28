/**
 * Commands the Figma screens need that are NOT in the BCEL One core contract.
 *
 * Transfers, bills, top-up, salary, e-cheque and approvals have
 * no known core command yet. The names below are the ones those
 * screens were written against. Each is sent to the core first; when the core
 * refuses it or does not answer, the local store answers instead and the shell
 * says so (`./local`). Nothing answered locally reaches the bank.
 *
 * Mapping one for real: replace its placeholder here with the core's command
 * (or move it into `commands.ts`) — the screen does not change.
 */

import { get } from 'svelte/store'
import { currentGroup } from '../../stores/onebankGroups'
import { callWithFallback as call } from './local'
import type { TwoFactorProof } from '../twoFactor'
import type {
  AddRecipientResponse,
  ApiEnvelope,
  ApproveTransactionResponse,
  CreateChequeRequest,
  CreateChequeResponse,
  CreateGroupResponse,
  GetBillersResponse,
  GetChequeBooksResponse,
  GetChequesResponse,
  GetDraftsResponse,
  GetLoanScheduleResponse,
  GetMessagesResponse,
  GetProductTransactionsResponse,
  GetRecipientsResponse,
  LoadExchangeRatesResponse,
  LoadInterestRatesResponse,
  LoadLoansResponse,
  LoadNotificationSettingsResponse,
  LoadTermDepositsResponse,
  LookupAccountResponse,
  LookupBillResponse,
  PayBillRequest,
  Permission,
  SaveDraftResponse,
  SavePermissionResponse,
  SubmitTransactionResponse,
  TransferDraft,
  TransferRequest,
} from './types'

const GROUP = 'ONEBANKGROUP'
const TRANSACTION = 'ONEBANKTRANSACTION'
const MESSAGE = 'ONEBANKMESSAGE'

function groupId(onebankid?: string): string {
  return onebankid ?? get(currentGroup) ?? ''
}

/** Joins the group an owner's invitation code belongs to. */
export function joinGroup(code: string): Promise<CreateGroupResponse> {
  return call<CreateGroupResponse>(GROUP, { command: 'joingroup', code })
}

export function changeMemberRole(userid: string, role: 'ADMIN' | 'MEMBER', onebankid?: string): Promise<ApiEnvelope> {
  return call<ApiEnvelope>(GROUP, { command: 'changememberrole', userid, role, onebankid: groupId(onebankid) })
}

/**
 * Creates a role. The core has this command — both of onebank-ui's ROLE flows
 * send it, with the proof TWOFACTOR returned — so it keeps the fallback only
 * until a verified call is confirmed against the core, and then moves to
 * `commands.ts`. There is no command for changing a role: roles are created and
 * removed, never edited.
 */
export function addPermission(
  permission: Permission,
  proof: TwoFactorProof,
  onebankid?: string,
): Promise<SavePermissionResponse> {
  return call<SavePermissionResponse>(GROUP, {
    command: 'addpermission',
    permission,
    ...proof,
    onebankid: groupId(onebankid),
  })
}

/** Saved and recent transfer recipients. */
export function getRecipients(onebankid?: string): Promise<GetRecipientsResponse> {
  return call<GetRecipientsResponse>(GROUP, { command: 'getrecipients', onebankid: groupId(onebankid) })
}

/** Saves a destination account, so transfers can offer it. */
export function addRecipient(
  recipient: { name: string; account: string; ccy: string; bank: string },
  onebankid?: string,
): Promise<AddRecipientResponse> {
  return call<AddRecipientResponse>(GROUP, { command: 'addrecipient', ...recipient, onebankid: groupId(onebankid) })
}

export function removeRecipient(recipientid: string, onebankid?: string): Promise<ApiEnvelope> {
  return call<ApiEnvelope>(GROUP, { command: 'removerecipient', recipientid, onebankid: groupId(onebankid) })
}

export function toggleFavourite(recipientid: string, onebankid?: string): Promise<ApiEnvelope> {
  return call<ApiEnvelope>(GROUP, { command: 'togglefavourite', recipientid, onebankid: groupId(onebankid) })
}

/** The name on a destination account, shown before the user confirms. */
export function lookupAccount(account: string, bank = 'BCEL', onebankid?: string): Promise<LookupAccountResponse> {
  return call<LookupAccountResponse>(GROUP, { command: 'lookupaccount', account, bank, onebankid: groupId(onebankid) })
}

export function approveTransaction(transactionid: string | number, onebankid?: string): Promise<ApproveTransactionResponse> {
  return call<ApproveTransactionResponse>(TRANSACTION, {
    command: 'approvetransaction',
    transactionid,
    onebankid: groupId(onebankid),
  })
}

/** Rejecting needs a reason; the maker sees it on the transaction. */
export function rejectTransaction(
  transactionid: string | number,
  reason: string,
  onebankid?: string,
): Promise<ApproveTransactionResponse> {
  return call<ApproveTransactionResponse>(TRANSACTION, {
    command: 'rejecttransaction',
    transactionid,
    reason,
    onebankid: groupId(onebankid),
  })
}

/** The maker withdraws a transaction that is still waiting for approval. */
export function cancelTransaction(transactionid: string | number, onebankid?: string): Promise<ApproveTransactionResponse> {
  return call<ApproveTransactionResponse>(TRANSACTION, { command: 'canceltransaction', transactionid, onebankid: groupId(onebankid) })
}

/** Files a rejected transaction away, so it leaves the "awaiting" column. */
export function archiveTransaction(transactionid: string | number, onebankid?: string): Promise<ApproveTransactionResponse> {
  return call<ApproveTransactionResponse>(TRANSACTION, { command: 'archivetransaction', transactionid, onebankid: groupId(onebankid) })
}

/**
 * Sends money: one source, one or more recipients.
 *
 * In a group whose roles require approval the result is `PENDING` and lands on
 * the authorization page; otherwise it executes at once.
 */
export function submitTransfer(request: TransferRequest, onebankid?: string): Promise<SubmitTransactionResponse> {
  return call<SubmitTransactionResponse>(TRANSACTION, { command: 'submittransfer', ...request, onebankid: groupId(onebankid) })
}

export function getBillers(): Promise<GetBillersResponse> {
  return call<GetBillersResponse>(TRANSACTION, { command: 'getbillers' })
}

/** What a utility says is owed on a customer number. */
export function lookupBill(billerid: string, customerno: string): Promise<LookupBillResponse> {
  return call<LookupBillResponse>(TRANSACTION, { command: 'lookupbill', billerid, customerno })
}

/** Pays a utility bill or tops up a phone, depending on the biller. */
export function payBill(request: PayBillRequest, onebankid?: string): Promise<SubmitTransactionResponse> {
  return call<SubmitTransactionResponse>(TRANSACTION, { command: 'paybill', ...request, onebankid: groupId(onebankid) })
}

export function getCheques(onebankid?: string): Promise<GetChequesResponse> {
  return call<GetChequesResponse>(TRANSACTION, { command: 'getcheques', onebankid: groupId(onebankid) })
}

export function createCheque(request: CreateChequeRequest, onebankid?: string): Promise<CreateChequeResponse> {
  return call<CreateChequeResponse>(TRANSACTION, { command: 'createcheque', ...request, onebankid: groupId(onebankid) })
}

export function getChequeBooks(onebankid?: string): Promise<GetChequeBooksResponse> {
  return call<GetChequeBooksResponse>(TRANSACTION, { command: 'getchequebooks', onebankid: groupId(onebankid) })
}

/** Buys a book of 30 cheque leaves against an account. */
export function buyChequeBook(accountid: string, onebankid?: string): Promise<ApiEnvelope> {
  return call<ApiEnvelope>(TRANSACTION, { command: 'buychequebook', accountid, onebankid: groupId(onebankid) })
}

export function getDrafts(onebankid?: string): Promise<GetDraftsResponse> {
  return call<GetDraftsResponse>(TRANSACTION, { command: 'getdrafts', onebankid: groupId(onebankid) })
}

export function saveDraft(draft: Omit<TransferDraft, 'onebankid' | 'savedat'>, onebankid?: string): Promise<SaveDraftResponse> {
  return call<SaveDraftResponse>(TRANSACTION, { command: 'savedraft', draft, onebankid: groupId(onebankid) })
}

export function deleteDraft(draftid: string, onebankid?: string): Promise<ApiEnvelope> {
  return call<ApiEnvelope>(TRANSACTION, { command: 'deletedraft', draftid, onebankid: groupId(onebankid) })
}

export function cancelCheque(chequeid: string, onebankid?: string): Promise<ApiEnvelope> {
  return call<ApiEnvelope>(TRANSACTION, { command: 'cancelcheque', chequeid, onebankid: groupId(onebankid) })
}

export function getMessages(onebankid?: string): Promise<GetMessagesResponse> {
  return call<GetMessagesResponse>(MESSAGE, { command: 'getmessages', onebankid: groupId(onebankid) })
}

export function markMessageRead(messageid: string, onebankid?: string): Promise<ApiEnvelope> {
  return call<ApiEnvelope>(MESSAGE, { command: 'readmessage', messageid, onebankid: groupId(onebankid) })
}

// -------------------------------------------------------------------- iBank
//
// Service and command names are the onebank-ui IBANK* pages' own, so the day
// the core answers them the screens need no change. Those pages never reached
// a backend (they ran on mock data), so the payloads are this app's.

export function loadExchangeRates(onebankid?: string): Promise<LoadExchangeRatesResponse> {
  return call<LoadExchangeRatesResponse>('IBANKEXCHANGERATES', { command: 'loadRates', onebankid: groupId(onebankid) })
}

export function loadInterestRates(onebankid?: string): Promise<LoadInterestRatesResponse> {
  return call<LoadInterestRatesResponse>('IBANKINTERESTRATES', { command: 'loadRates', onebankid: groupId(onebankid) })
}

export function loadTermDeposits(onebankid?: string): Promise<LoadTermDepositsResponse> {
  return call<LoadTermDepositsResponse>('IBANKTERMDEPOSITACCOUNT', { command: 'loadAccounts', onebankid: groupId(onebankid) })
}

/** Movements on one deposit between two `YYYY-MM-DD` days inclusive; empty for open. */
export function getTermDepositTransactions(accountid: string, from = '', to = '', onebankid?: string): Promise<GetProductTransactionsResponse> {
  return call<GetProductTransactionsResponse>('IBANKTERMDEPOSITACCOUNT', {
    command: 'getTransactions',
    accountid,
    from,
    to,
    onebankid: groupId(onebankid),
  })
}

export function loadLoans(onebankid?: string): Promise<LoadLoansResponse> {
  return call<LoadLoansResponse>('IBANKLOANACCOUNT', { command: 'loadAccounts', onebankid: groupId(onebankid) })
}

export function getLoanTransactions(accountid: string, from = '', to = '', onebankid?: string): Promise<GetProductTransactionsResponse> {
  return call<GetProductTransactionsResponse>('IBANKLOANACCOUNT', {
    command: 'getTransactions',
    accountid,
    from,
    to,
    onebankid: groupId(onebankid),
  })
}

export function getLoanSchedule(accountid: string, onebankid?: string): Promise<GetLoanScheduleResponse> {
  return call<GetLoanScheduleResponse>('IBANKLOANACCOUNT', { command: 'getSchedule', accountid, onebankid: groupId(onebankid) })
}

export function loadNotificationSettings(onebankid?: string): Promise<LoadNotificationSettingsResponse> {
  return call<LoadNotificationSettingsResponse>('IBANKNOTIFICATIONSETTING', { command: 'loadSettings', onebankid: groupId(onebankid) })
}

/** Saves the alert choices, by setting id. */
export function saveNotificationSettings(settings: Record<string, boolean>, onebankid?: string): Promise<ApiEnvelope> {
  return call<ApiEnvelope>('IBANKNOTIFICATIONSETTING', { command: 'saveSettings', settings, onebankid: groupId(onebankid) })
}
