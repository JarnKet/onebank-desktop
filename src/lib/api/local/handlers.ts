/**
 * Local answers for the unmapped commands, one handler per `SERVICE/command`.
 *
 * A handler receives exactly the payload `../unmapped.ts` sent the core and
 * returns the envelope the core would have — `result: 0`, or non-zero and a
 * `message` — so a screen cannot tell which one answered, except through the
 * "offline data" notice the fallback raises (`./index.ts`).
 *
 * The group itself is always real: accounts, members and "me" come from the
 * group's `loadhome` (`stores/onebankGroups.ts`), roles from the last real
 * `getpermissions`, transactions from the last real `viewtransactions`. Only
 * what the user does here is stored locally (`./store.ts`).
 */

import { get } from 'svelte/store'
import type { Account, User } from '../../../definition'
import { onebankGroups } from '../../../stores/onebankGroups'
import { loginData } from '../../../stores/session'
import type {
  Approval,
  Cheque,
  Permission,
  TransactionInfo,
  TransferDraft,
  TransferItem,
  TransferRequest,
} from '../types'
import { BILLERS, localGroup, localState, nextLocalId, persist, type LocalGroup } from './store'
import {
  EXCHANGE_RATES,
  INTEREST_RATES,
  LOANS,
  loanSchedule,
  loanTransactions,
  NOTIFICATION_SETTINGS,
  RATES_UPDATED,
  TERM_DEPOSIT_TRANSACTIONS,
  TERM_DEPOSITS,
} from './ibank'

type Params = Record<string, any>
type Handler = (params: Params) => Record<string, unknown>

const OK = { result: 0 }

class LocalError extends Error {}

function fail(message: string, result = 2) {
  return { result, message }
}

// ------------------------------------------------------- what the core told us

/**
 * The core's own records, as last seen. Kept in memory only: they are re-read
 * from the core on every screen load, and a decision on one needs its details.
 */
const seenTransactions = new Map<string, Map<string, TransactionInfo>>()
const seenPermissions = new Map<string, Permission[]>()

export function rememberTransactions(onebankid: string, items: TransactionInfo[]): void {
  const byId = new Map<string, TransactionInfo>()
  for (const tx of items) if (tx.transactionid !== undefined) byId.set(String(tx.transactionid), tx)
  seenTransactions.set(onebankid, byId)
}

export function rememberPermissions(onebankid: string, permissions: Permission[]): void {
  seenPermissions.set(onebankid, permissions)
}

export function hasSeenTransactions(onebankid: string): boolean {
  return seenTransactions.has(onebankid)
}

export function forgetSeen(): void {
  seenTransactions.clear()
  seenPermissions.clear()
}

/** Roles in force: the core's, with local edits and removals applied. */
export function effectivePermissions(onebankid: string, real: Permission[] = seenPermissions.get(onebankid) ?? []): Permission[] {
  const local = localGroup(onebankid)
  const edits = new Map(local.permissions.map((permission) => [permission.permissionid, permission]))
  const merged = real
    .filter((permission) => !local.removedPermissions.includes(Number(permission.permissionid)))
    .map((permission) => edits.get(permission.permissionid) ?? permission)
  const realIds = new Set(real.map((permission) => permission.permissionid))
  return [...merged, ...local.permissions.filter((permission) => !realIds.has(permission.permissionid))]
}

// ------------------------------------------------------------------ context

function pad(value: number): string {
  return `${value}`.padStart(2, '0')
}

/** `YYYY-MM-DD HH:mm:ss` in local time — the format the core sends. */
export function txTime(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

interface Context {
  onebankid: string
  group: LocalGroup
  accounts: Account[]
  me: User
}

function context(params: Params): Context {
  const onebankid = String(params.onebankid ?? '')
  if (!onebankid) throw new LocalError('No group selected')
  const home = get(onebankGroups)[onebankid]?.loadHomeResult
  const login = get(loginData) as any
  const userid = String(login?.USER?.userid ?? login?.USER?.id ?? home?.me?.userid ?? '')
  const me: User = {
    userid,
    name: home?.me?.name ?? String(login?.USER?.name ?? login?.name ?? ''),
    profileid: home?.me?.profileid ?? '',
    faceid: home?.me?.faceid ?? '',
    profiletype: home?.me?.profiletype ?? 0,
    role: home?.me?.role ?? 'MEMBER',
  }
  return { onebankid, group: localGroup(onebankid), accounts: home?.accounts ?? [], me }
}

function findAccount(ctx: Context, accountid: unknown): Account {
  const account = ctx.accounts.find((candidate) => candidate.accountid === accountid)
  if (!account) throw new LocalError('Account not found')
  return account
}

// ------------------------------------------------------------ transactions

/**
 * Approvals a new transaction needs before it executes: the levels on the
 * maker's own roles, each counting all of its approvers or its stated minimum.
 */
function approvalsRequired(permissions: Permission[], makerid: string): number {
  const mine = permissions.filter((permission) => permission.userids.includes(makerid) && !permission.viewonly)
  return mine
    .flatMap((permission) => permission.approverlevels ?? [])
    .reduce(
      (sum, level) => sum + (level.mode === 'ATLEAST' ? Math.max(1, level.min ?? 1) : Math.max(1, level.userids?.length ?? 1)),
      0,
    )
}

/** The tightest per-transaction cap among the maker's roles, if any. */
function perTransactionLimit(permissions: Permission[], makerid: string): number | undefined {
  const caps = permissions
    .filter((permission) => permission.userids.includes(makerid))
    .map((permission) => permission.limit?.pertransaction)
    .filter((cap): cap is number => typeof cap === 'number' && cap > 0)
  return caps.length ? Math.min(...caps) : undefined
}

/**
 * What a transaction becomes once an approver has acted on it: one rejection
 * ends it; it executes once it has as many approvals as it requires.
 */
export function resolveApproval(tx: TransactionInfo): 'PENDING' | 'SUCCESS' | 'REJECTED' {
  const approvals = tx.approvals ?? []
  if (approvals.some((approval) => approval.decision === 'REJECTED')) return 'REJECTED'
  const approved = approvals.filter((approval) => approval.decision === 'APPROVED').length
  return approved >= (tx.requiredApprovals ?? 0) ? 'SUCCESS' : 'PENDING'
}

/** Records a new outgoing transaction; it executes at once when nobody need approve it. */
function submit(ctx: Context, from: Account, service: string, item: TransferItem, schedule?: string): TransactionInfo {
  if (from.status === 'LOCKED') throw new LocalError('This account is locked')
  if (from.viewonly) throw new LocalError('This account is view-only')
  if (!(item.amount > 0)) throw new LocalError('Enter an amount')
  if (typeof from.availablebalance === 'number' && item.amount > from.availablebalance) throw new LocalError('Insufficient balance')

  const permissions = effectivePermissions(ctx.onebankid)
  const cap = perTransactionLimit(permissions, ctx.me.userid)
  if (cap !== undefined && item.amount > cap) throw new LocalError(`Over your per-transaction limit of ${cap.toLocaleString('en-US')}`)

  const id = nextLocalId()
  const tx: TransactionInfo = {
    // Prefixed, so a local transaction can never collide with one of the core's.
    transactionid: `L${id}`,
    onebankid: ctx.onebankid,
    txtime: txTime(),
    amount: -item.amount,
    ccy: from.ccy,
    service,
    type: 'DEBIT',
    account: from.account,
    accountname: from.alias || from.name,
    makername: ctx.me.name,
    makerid: ctx.me.userid,
    status: 'PENDING',
    ticket: `L${Date.now()}`.slice(-10),
    detail: {
      AMOUNT: `${item.amount}`,
      CCY: from.ccy,
      DESCRIPTION: item.note || service,
      TOACCOUNTNAME: item.toname,
      TOACCOUNTNO: item.toaccount,
      BANK: item.bank ?? 'BCEL',
    },
    approvals: [],
    requiredApprovals: approvalsRequired(permissions, ctx.me.userid),
    scheduledfor: schedule,
    local: true,
  }
  tx.status = resolveApproval(tx)
  ctx.group.transactions.unshift(tx)
  return tx
}

/** The transaction as the user currently sees it: local, or the core's with local decisions applied. */
function findTransaction(ctx: Context, transactionid: unknown): { tx: TransactionInfo; local: boolean } | null {
  const id = String(transactionid)
  const local = ctx.group.transactions.find((candidate) => String(candidate.transactionid) === id)
  if (local) return { tx: local, local: true }
  const real = seenTransactions.get(ctx.onebankid)?.get(id)
  if (!real) return null
  return { tx: { ...real, ...ctx.group.patches[id] }, local: false }
}

/** Writes a decision back: onto the local record, or as a patch over the core's. */
function record(ctx: Context, found: { tx: TransactionInfo; local: boolean }): TransactionInfo {
  if (!found.local) {
    const { status, approvals, archived } = found.tx
    ctx.group.patches[String(found.tx.transactionid)] = { status, approvals, archived }
  }
  return found.tx
}

function decide(params: Params, decision: Approval['decision']) {
  const ctx = context(params)
  const found = findTransaction(ctx, params.transactionid)
  if (!found) return fail('Transaction not found')
  const { tx } = found
  if (tx.status !== 'PENDING') return fail('This transaction is no longer pending')
  if ((tx.approvals ?? []).some((approval) => approval.userid === ctx.me.userid)) return fail('You have already decided on this')

  tx.approvals = [
    ...(tx.approvals ?? []),
    {
      userid: ctx.me.userid,
      name: ctx.me.name,
      decision,
      time: txTime(),
      level: (tx.approvals?.length ?? 0) + 1,
      reason: decision === 'REJECTED' ? String(params.reason ?? '') : undefined,
    },
  ]
  // A core transaction may not say how many approvals it needs; one is the least it can need.
  if (!found.local && tx.requiredApprovals === undefined) tx.requiredApprovals = 1
  tx.status = resolveApproval(tx)
  return { ...OK, item: record(ctx, found) }
}

/** Rows between `from` and `to` (`YYYY-MM-DD`, inclusive); an empty bound is open. */
function inRange<T extends { date: string }>(items: T[], params: Params): T[] {
  const from = String(params.from ?? '')
  const to = String(params.to ?? '')
  return items.filter((item) => (!from || item.date >= from) && (!to || item.date <= to))
}

/** Remembers who money was sent to, so the transfer form can offer them again. */
function rememberRecipient(item: TransferItem): void {
  const state = localState()
  if (state.recipients.some((recipient) => recipient.account === item.toaccount)) return
  state.recipients.unshift({
    recipientid: `R${nextLocalId()}`,
    name: item.toname,
    account: item.toaccount,
    ccy: item.ccy,
    bank: item.bank ?? 'BCEL',
    favourite: false,
  })
}

// ----------------------------------------------------------------- handlers

const handlers: Record<string, Handler> = {
  // ---- group
  'ONEBANKGROUP/joingroup': () => fail('Joining with a code needs the bank; ask the owner to add you'),
  'ONEBANKGROUP/changememberrole': (params) => {
    const ctx = context(params)
    ctx.group.memberRoles[String(params.userid)] = String(params.role)
    return OK
  },
  'ONEBANKGROUP/savepermission': (params) => {
    const ctx = context(params)
    const incoming = params.permission as Permission
    const saved: Permission = incoming.permissionid ? incoming : { ...incoming, permissionid: -nextLocalId() }
    ctx.group.permissions = [...ctx.group.permissions.filter((permission) => permission.permissionid !== saved.permissionid), saved]
    ctx.group.removedPermissions = ctx.group.removedPermissions.filter((id) => id !== saved.permissionid)
    return { ...OK, permission: saved }
  },
  'ONEBANKGROUP/getrecipients': () => ({ ...OK, recipients: localState().recipients }),
  'ONEBANKGROUP/togglefavourite': (params) => {
    const recipient = localState().recipients.find((candidate) => candidate.recipientid === params.recipientid)
    if (recipient) recipient.favourite = !recipient.favourite
    return OK
  },
  'ONEBANKGROUP/addrecipient': (params) => {
    const account = String(params.account ?? '').replace(/\D/g, '')
    const name = String(params.name ?? '').trim()
    if (account.length < 8) return fail('Enter a full account number')
    if (!name) return fail('Give the account a name')
    const state = localState()
    if (state.recipients.some((recipient) => recipient.account === account)) return fail('This account is already saved')
    const recipient = {
      recipientid: `R${nextLocalId()}`,
      name,
      account,
      ccy: String(params.ccy ?? 'LAK'),
      bank: String(params.bank ?? 'BCEL'),
      favourite: true,
    }
    state.recipients.unshift(recipient)
    return { ...OK, recipient }
  },
  'ONEBANKGROUP/removerecipient': (params) => {
    const state = localState()
    const before = state.recipients.length
    state.recipients = state.recipients.filter((recipient) => recipient.recipientid !== params.recipientid)
    return state.recipients.length < before ? OK : fail('Recipient not found')
  },
  'ONEBANKGROUP/lookupaccount': (params) => {
    const number = String(params.account ?? '').replace(/\D/g, '')
    if (number.length < 8) return fail('Enter a full account number')
    const known = localState().recipients.find((recipient) => recipient.account === number)
    // Without the bank there is no name to look up: the user confirms the number instead.
    return { ...OK, name: known?.name ?? '', ccy: known?.ccy ?? 'LAK' }
  },

  // ---- approvals
  'ONEBANKTRANSACTION/approvetransaction': (params) => decide(params, 'APPROVED'),
  'ONEBANKTRANSACTION/rejecttransaction': (params) => {
    if (!String(params.reason ?? '').trim()) return fail('Give a reason for rejecting')
    return decide(params, 'REJECTED')
  },
  'ONEBANKTRANSACTION/canceltransaction': (params) => {
    const ctx = context(params)
    const found = findTransaction(ctx, params.transactionid)
    if (!found) return fail('Transaction not found')
    if (found.tx.makerid !== ctx.me.userid) return fail('Only the person who made it can cancel it')
    if (found.tx.status !== 'PENDING') return fail('This transaction is no longer pending')
    found.tx.status = 'CANCELLED'
    return { ...OK, item: record(ctx, found) }
  },
  'ONEBANKTRANSACTION/archivetransaction': (params) => {
    const ctx = context(params)
    const found = findTransaction(ctx, params.transactionid)
    if (!found) return fail('Transaction not found')
    found.tx.archived = true
    return { ...OK, item: record(ctx, found) }
  },

  // ---- transfers
  'ONEBANKTRANSACTION/submittransfer': (params) => {
    const request = params as unknown as TransferRequest & Params
    const ctx = context(params)
    const from = findAccount(ctx, request.fromaccountid)
    if (!request.items?.length) return fail('Add at least one recipient')
    const total = request.items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    if (typeof from.availablebalance === 'number' && total > from.availablebalance) return fail('Insufficient balance')
    const service = request.kind === 'SALARY' ? 'SALARY' : request.kind === 'INTERBANK' ? 'INTERBANK' : 'TRANSFER'
    // International and ID-card transfers carry a fee, added to what leaves the account.
    const fee = (item: TransferItem) =>
      request.kind === 'INTERBANK' ? (item.feebearer === 'SHARED' ? 10 : 25) : request.kind === 'IDCARD' ? 15_000 : 0
    const items = request.items.map((item) => {
      if (request.kind !== 'SALARY') rememberRecipient(item)
      return submit(ctx, from, service, { ...item, amount: Number(item.amount) + fee(item) }, request.schedule)
    })
    return { ...OK, item: items[0], items }
  },

  // ---- bills and top-up
  'ONEBANKTRANSACTION/getbillers': () => ({ ...OK, billers: BILLERS }),
  'ONEBANKTRANSACTION/lookupbill': (params) => {
    const customerno = String(params.customerno ?? '').trim()
    if (customerno.length < 4) return fail('Enter a valid customer number')
    // Without the utility there is no bill to read: the user enters the amount.
    return { ...OK, customername: '', address: '', amountdue: 0, period: '' }
  },
  'ONEBANKTRANSACTION/paybill': (params) => {
    const ctx = context(params)
    const biller = BILLERS.find((candidate) => candidate.billerid === params.billerid)
    if (!biller) return fail('Unknown biller')
    const from = findAccount(ctx, params.fromaccountid)
    const item = submit(ctx, from, biller.kind === 'PHONE' ? 'TOPUP' : biller.kind, {
      toaccount: String(params.customerno),
      toname: biller.name,
      amount: Number(params.amount),
      ccy: from.ccy,
      note: biller.name,
    })
    return { ...OK, item }
  },

  // ---- cheques
  'ONEBANKTRANSACTION/getcheques': (params) => {
    const { group } = context(params)
    return {
      ...OK,
      cheques: group.cheques,
      remaining: group.chequeBooks.reduce((sum, book) => sum + book.total - book.used, 0),
    }
  },
  'ONEBANKTRANSACTION/getchequebooks': (params) => ({ ...OK, books: context(params).group.chequeBooks }),
  'ONEBANKTRANSACTION/buychequebook': (params) => {
    const ctx = context(params)
    const account = findAccount(ctx, params.accountid)
    const numbers = ctx.group.chequeBooks.map((book) => Number(book.number))
    const book = {
      bookid: `BK${nextLocalId()}`,
      onebankid: ctx.onebankid,
      number: `${Math.max(12344, ...numbers) + 1}`,
      accountid: account.accountid,
      boughtat: txTime(),
      used: 0,
      total: 30,
    }
    ctx.group.chequeBooks.unshift(book)
    return { ...OK, book }
  },
  'ONEBANKTRANSACTION/createcheque': (params) => {
    const ctx = context(params)
    const account = findAccount(ctx, params.accountid)
    if (!String(params.payee ?? '').trim()) return fail('Enter who the cheque is for')
    if (!(Number(params.amount) > 0)) return fail('Enter an amount')
    const book = ctx.group.chequeBooks.find((candidate) =>
      params.bookid ? candidate.bookid === params.bookid : candidate.accountid === account.accountid && candidate.used < candidate.total,
    )
    if (!book) return fail('Buy a cheque book for this account first')
    if (book.used >= book.total) return fail('This cheque book is used up')
    book.used += 1
    const numbers = ctx.group.cheques.map((cheque) => Number(cheque.number))
    const cheque: Cheque = {
      chequeid: `CQ${nextLocalId()}`,
      onebankid: ctx.onebankid,
      number: `${Math.max(12344, ...numbers) + 1}`,
      accountid: account.accountid,
      payee: String(params.payee),
      amount: Number(params.amount),
      ccy: account.ccy,
      issuedate: txTime(),
      duedate: String(params.duedate),
      memo: String(params.memo ?? ''),
      status: 'ISSUED',
      kind: params.kind === 'ACCOUNT' ? 'ACCOUNT' : 'CASH',
      payeeaccount: params.payeeaccount ? String(params.payeeaccount) : undefined,
      blockfunds: Boolean(params.blockfunds),
      direction: 'ISSUED',
      bookid: book.bookid,
    }
    ctx.group.cheques.unshift(cheque)
    return { ...OK, cheque }
  },
  'ONEBANKTRANSACTION/cancelcheque': (params) => {
    const { group } = context(params)
    const cheque = group.cheques.find((candidate) => candidate.chequeid === params.chequeid)
    if (!cheque) return fail('Cheque not found')
    if (cheque.status !== 'ISSUED') return fail('Only an issued cheque can be cancelled')
    cheque.status = 'CANCELLED'
    return OK
  },

  // ---- drafts
  'ONEBANKTRANSACTION/getdrafts': (params) => ({ ...OK, drafts: context(params).group.drafts }),
  'ONEBANKTRANSACTION/savedraft': (params) => {
    const ctx = context(params)
    const incoming = params.draft as TransferDraft
    const draft: TransferDraft = {
      ...incoming,
      draftid: incoming.draftid || `D${nextLocalId()}`,
      onebankid: ctx.onebankid,
      savedat: txTime(),
    }
    ctx.group.drafts = [draft, ...ctx.group.drafts.filter((existing) => existing.draftid !== draft.draftid)]
    return { ...OK, draft }
  },
  'ONEBANKTRANSACTION/deletedraft': (params) => {
    const ctx = context(params)
    ctx.group.drafts = ctx.group.drafts.filter((draft) => draft.draftid !== params.draftid)
    return OK
  },

  // ---- messages
  'ONEBANKMESSAGE/getmessages': (params) => ({ ...OK, messages: context(params).group.messages }),
  // ---- iBank: reference data the core has no command for yet (./ibank.ts)
  'IBANKEXCHANGERATES/loadRates': () => ({ ...OK, rates: EXCHANGE_RATES, updated: RATES_UPDATED }),
  'IBANKINTERESTRATES/loadRates': () => ({ ...OK, tables: INTEREST_RATES, updated: RATES_UPDATED }),
  'IBANKTERMDEPOSITACCOUNT/loadAccounts': (params) => {
    context(params)
    return { ...OK, deposits: TERM_DEPOSITS }
  },
  'IBANKTERMDEPOSITACCOUNT/getTransactions': (params) => {
    const items = TERM_DEPOSIT_TRANSACTIONS[String(params.accountid)]
    if (!items) return fail('Deposit not found')
    return { ...OK, items: inRange(items, params) }
  },
  'IBANKLOANACCOUNT/loadAccounts': (params) => {
    context(params)
    return { ...OK, loans: LOANS }
  },
  'IBANKLOANACCOUNT/getTransactions': (params) => {
    const loan = LOANS.find((candidate) => candidate.id === params.accountid)
    if (!loan) return fail('Loan not found')
    return { ...OK, items: inRange(loanTransactions(loan), params) }
  },
  'IBANKLOANACCOUNT/getSchedule': (params) => {
    const loan = LOANS.find((candidate) => candidate.id === params.accountid)
    if (!loan) return fail('Loan not found')
    return { ...OK, schedule: loanSchedule(loan) }
  },
  'IBANKNOTIFICATIONSETTING/loadSettings': (params) => {
    const chosen = context(params).group.notifications ?? {}
    return { ...OK, settings: NOTIFICATION_SETTINGS.map((setting) => ({ ...setting, enabled: chosen[setting.id] ?? setting.enabled })) }
  },
  'IBANKNOTIFICATIONSETTING/saveSettings': (params) => {
    const ctx = context(params)
    const known = new Set(NOTIFICATION_SETTINGS.map((setting) => setting.id))
    const incoming = (params.settings ?? {}) as Record<string, unknown>
    ctx.group.notifications ??= {}
    for (const [id, enabled] of Object.entries(incoming)) if (known.has(id)) ctx.group.notifications[id] = Boolean(enabled)
    return OK
  },

  'ONEBANKMESSAGE/readmessage': (params) => {
    const message = context(params).group.messages.find((candidate) => candidate.messageid === params.messageid)
    if (message) message.read = true
    return OK
  },
}

const READ_ONLY = /\/(load|get|view|lookup)/

export function hasLocalHandler(service: string, command: string): boolean {
  return `${service}/${command}` in handlers
}

/** Answers one request locally. */
export function handleLocally(service: string, data: Record<string, unknown>): Record<string, unknown> {
  const key = `${service}/${String(data.command)}`
  const handler = handlers[key]
  if (!handler) return fail(`${key} is not available offline`, 404)
  try {
    const response = handler(data)
    if (!READ_ONLY.test(key)) persist()
    // A deep copy, so a component mutating what it was given cannot reach
    // into the store — the isolation a network round trip would give.
    return structuredClone(response)
  } catch (error) {
    if (error instanceof LocalError) return fail(error.message)
    throw error
  }
}
