/**
 * Wire types for the OneBank services.
 *
 * The single place the wire format is expressed. The original 22 commands
 * mirror what the BCEL One core returns (keep them aligned with onebank-ui's
 * `libs/definition.ts`); the ones below them were added for screens the core
 * never served natively; their commands are placeholders in `./unmapped.ts`
 * until the real ones are mapped.
 */

import type { Account, GroupDetail, LoadHomeResult, Menu, User } from '../../definition'

export type { Account, GroupDetail, LoadHomeResult, Menu, User }

/** Every service response carries this envelope. `result === 0` means success. */
export interface ApiEnvelope {
  result: number
  message?: string
}

/** The core returns `result: 1` when the session has expired. */
export const RESULT_OK = 0
export const RESULT_SESSION_EXPIRED = 1

// ---------------------------------------------------------------- ONEBANKHOME

// `result` and `message` come from ApiEnvelope, which requires `result`.
// `Partial<LoadHomeResult>` would make it optional, and the two declarations
// then conflict — hence the omission rather than a second `Partial`.
export interface LoadHomeResponse extends ApiEnvelope, Omit<Partial<LoadHomeResult>, 'result' | 'message'> {
  detail?: GroupDetail
}

export interface SaveHomeMenusResponse extends ApiEnvelope {}

/**
 * The home widgets, all served by one command with a `widget` discriminator.
 *
 * `ACCOUNTBALANCES` answers on `balances` and takes no account; the two usage
 * widgets answer on `items` and are per-account. Callers branch on the payload
 * key being present rather than on `result` — that is what the mobile widgets
 * do, and an absent key is how the core signals "no data for this account".
 */
export type WidgetKind = 'ACCOUNTBALANCES' | 'USAGEDAILY' | 'USAGESHARE'

export interface Balance {
  account: string
  ccy: string
  name: string
  currentbalance: number
  availablebalance: number
}

export interface UsageDaily {
  date: string
  ccy: string
  debit: number
  credit: number
}

export interface UsageShare {
  type: string
  amount: number
}

export interface LoadWidgetResponse extends ApiEnvelope {
  /** `ACCOUNTBALANCES` only. */
  balances?: Balance[]
  /** `USAGEDAILY` and `USAGESHARE`; the element type follows the widget asked for. */
  items?: UsageDaily[] | UsageShare[]
}

// --------------------------------------------------------------- ONEBANKGROUP

export interface OneBankGroup {
  onebankid: string
  name?: string
  detail?: string
  logoname?: string
  color?: string
  default?: boolean
  type?: string
}

export interface LoadGroupsResponse extends ApiEnvelope {
  groups: OneBankGroup[]
}

export interface CreateGroupResponse extends ApiEnvelope {
  onebankid: string
}

export interface JoinGroupRequestResponse extends ApiEnvelope {
  /** Channel id to subscribe to (`JOINEDGROUP-<id>`) while awaiting approval. */
  joingroupid: string
}

export interface LeaveGroupResponse extends ApiEnvelope {}
export interface ChangeGroupDetailResponse extends ApiEnvelope {}

export interface GroupDetailPatch {
  name: string
  detail: string
  color: string
  /** Empty string clears the logo back to the default. */
  logoname: string
}

/** Where to PUT a picture, and the name it will have once uploaded. */
export interface GetUploadUrlResponse extends ApiEnvelope {
  signedurl?: string
  filename?: string
}

/** A single add/remove instruction for `changeaccounts`. */
export interface AccountChange {
  accountid: string
  action: 'add' | 'remove'
}

export interface ChangeAccountsResponse extends ApiEnvelope {}

/** A single lock/unlock instruction for `changeaccountstatus`. */
export interface AccountStatusChange {
  accountid: string
  status: 'ACTIVE' | 'LOCKED'
}

export interface ChangeAccountStatusResponse extends ApiEnvelope {}
export interface ChangeAccountAliasResponse extends ApiEnvelope {}

/** Account ids the user holds that this group could still be given. */
export interface GetAvailableAccountsResponse extends ApiEnvelope {
  accounts?: string[]
}

/** What a new virtual or shadow account is opened from. */
export interface NewAccount {
  /** VIRTUAL sits on top of a real account; SHADOW is a separate ledger. */
  accountType: 'VIRTUAL' | 'SHADOW'
  /** The real account it is opened against. */
  accountid: string
  alias: string
  /** Picture for the new account. Always empty from the web today. */
  avatar?: string
}

export interface OpenNewAccountResponse extends ApiEnvelope {}

export interface AddMemberEnquiryResponse extends ApiEnvelope {
  user?: User
}

export interface AddMemberResponse extends ApiEnvelope {}
export interface RemoveMemberResponse extends ApiEnvelope {}

/** Spending caps on a role, in the account's currency. Absent means no cap. */
export interface TransactionLimit {
  pertransaction?: number
  daily?: number
}

/**
 * One level of approval: who may approve, and how many of them must.
 * "ຕ້ອງອະນຸມັດທຸກຄົນ" is `ALL`; "ຕ້ອງອະນຸມັດຢ່າງຕ່ຳ N ຄົນ" is `ATLEAST` with `min`.
 */
export interface ApproverLevel {
  level: number
  userids: string[]
  mode?: 'ALL' | 'ATLEAST'
  min?: number
}

export interface Permission {
  permissionid?: number
  /** Display name of the role, e.g. "Approver". */
  name?: string
  accountids: string[]
  userids: string[]
  /** `*` for every function, otherwise a comma-separated list of menu keys. */
  allowedfunctions?: string
  limit?: TransactionLimit
  approverlevels?: ApproverLevel[]
  viewonly: boolean
}

export interface GetPermissionsResponse extends ApiEnvelope {
  permissions?: Permission[]
}

export interface RemovePermissionResponse extends ApiEnvelope {}

// --------------------------------------------------------- ONEBANKTRANSACTION

export interface TransactionDetail {
  AMOUNT?: string
  CCY?: string
  OPERATOR?: string
  PHONE?: number
  TICKET?: number
  MERCHANTNAME?: string
  DESCRIPTION?: string
  CASHOUTAMOUNT?: number
  MERCHANTID?: string
  TIPAMOUNT?: number
  TOACCOUNT?: string
  TOACCOUNTNO?: string
  TOACCOUNTNAME?: string
  [key: string]: unknown
}

/**
 * Mirrors onebank-ui's `pages/TRANSACTION/definition.ts` `transactionInfo`.
 *
 * `transactionid` is a number on the wire but the commands that take one accept
 * a string, and it is used as a key in places, so both are allowed here.
 * `txtime` is a datetime string that `Date` can parse — onebank-ui feeds it
 * straight to dayjs.
 */
export interface TransactionInfo {
  transactionid?: string | number
  onebankid?: string
  txtime?: string
  amount?: number
  service?: string
  command?: string
  ticket?: string
  usertype?: string
  account?: string
  ccy?: string
  accountname?: string
  type?: string
  makername?: string
  profileid?: string
  faceid?: string
  profiletype?: number
  status?: string
  detail?: TransactionDetail
  /** userid of whoever submitted it. */
  makerid?: string
  /** Decisions recorded so far, oldest first. */
  approvals?: Approval[]
  /** How many approvals it needs before it executes. 0 means none. */
  requiredApprovals?: number
  /** Set when a transfer was scheduled rather than sent now. */
  scheduledfor?: string
  /** The maker filed a rejected transaction away; it only shows in history now. */
  archived?: boolean
  [key: string]: unknown
}

/** One approver's decision on a pending transaction. */
export interface Approval {
  userid: string
  name: string
  decision: 'APPROVED' | 'REJECTED'
  time: string
  level: number
  reason?: string
}

export interface ViewTransactionsResponse extends ApiEnvelope {
  items?: TransactionInfo[]
}

export interface GetPendingApprovalsResponse extends ApiEnvelope {
  items?: TransactionInfo[]
}

export interface Approver {
  [key: string]: unknown
}

export interface GetApprovalDetailResponse extends ApiEnvelope {
  item?: TransactionInfo
  approvers?: Approver[]
}

/**
 * One line of an account statement.
 *
 * `STATEMENT/statement` has a shape of its own: `time` is `DD/MM/YYYY HH:MM:SS`
 * where the rest of the contract sends ISO, and the detail is label/value pairs
 * the core has already worded — `summary`/`detail` in Lao, `summarykey`/
 * `detailkey` in English — rather than the fields of `TransactionInfo`.
 */
export interface StatementTransaction {
  time: string
  /** BCEL's own three-letter movement code: TRO, TRI, ONP, FEE, ATM…  */
  type: string
  title: string
  subtitle?: string
  summary: Record<string, string | undefined>
  detail: Record<string, string | undefined>
  summarykey: Record<string, string | undefined>
  detailkey: Record<string, string | undefined>
  /** The account's balance after this movement. */
  balance: number
  /** Signed: negative left the account. */
  amount: number
  diff: number
  user: string
}

/** One page of a statement, newest first, plus the account's balance now. */
export interface StatementResponse extends ApiEnvelope {
  statements?: StatementTransaction[]
  balance?: number
  ccy?: string
}

// ------------------------------- for the unmapped screens (see ./unmapped.ts)

export interface ApproveTransactionResponse extends ApiEnvelope {
  item?: TransactionInfo
}

/** Who a transfer goes to. */
export interface TransferItem {
  toaccount: string
  toname: string
  /** International: SWIFT code and the receiver's address. ID card: pickup point and phone. */
  swift?: string
  address?: string
  phone?: string
  idcard?: string
  pickup?: string
  /** Who bears the fee on an international transfer. */
  feebearer?: 'SENDER' | 'SHARED'
  /** Bank code for an inter-bank transfer; BCEL otherwise. */
  bank?: string
  amount: number
  ccy: string
  note?: string
}

export type TransferKind = 'BCEL' | 'INTERBANK' | 'IDCARD' | 'SALARY'

/** A transfer saved half-way, to be finished later. */
export interface TransferDraft {
  draftid: string
  onebankid: string
  name: string
  kind: TransferKind
  fromaccountid: string
  items: TransferItem[]
  savedat: string
}

export interface GetDraftsResponse extends ApiEnvelope {
  drafts?: TransferDraft[]
}

export interface SaveDraftResponse extends ApiEnvelope {
  draft?: TransferDraft
}

/** A book of blank cheque leaves bought against one account. */
export interface ChequeBook {
  bookid: string
  onebankid: string
  number: string
  accountid: string
  boughtat: string
  used: number
  total: number
}

export interface GetChequeBooksResponse extends ApiEnvelope {
  books?: ChequeBook[]
}

export interface TransferRequest {
  kind: TransferKind
  fromaccountid: string
  items: TransferItem[]
  /** `YYYY-MM-DD HH:mm:ss`; absent means now. */
  schedule?: string
}

export interface SubmitTransactionResponse extends ApiEnvelope {
  item?: TransactionInfo
}

export interface LookupAccountResponse extends ApiEnvelope {
  name?: string
  ccy?: string
}

export interface Recipient {
  recipientid: string
  name: string
  account: string
  ccy: string
  bank: string
  favourite: boolean
}

export interface GetRecipientsResponse extends ApiEnvelope {
  recipients?: Recipient[]
}

export interface Biller {
  billerid: string
  kind: 'ELECTRICITY' | 'WATER' | 'PHONE'
  name: string
  /** File under `public/`. */
  logo: string
}

export interface GetBillersResponse extends ApiEnvelope {
  billers?: Biller[]
}

/** What a utility says is owed on a customer number. */
export interface LookupBillResponse extends ApiEnvelope {
  customername?: string
  address?: string
  amountdue?: number
  period?: string
}

export interface PayBillRequest {
  billerid: string
  /** Meter / customer number, or the phone number for a top-up. */
  customerno: string
  amount: number
  fromaccountid: string
}

export interface Cheque {
  chequeid: string
  onebankid: string
  number: string
  accountid: string
  payee: string
  amount: number
  ccy: string
  issuedate: string
  duedate: string
  memo: string
  status: 'ISSUED' | 'CASHED' | 'CANCELLED'
  /** CASH pays whoever presents it; ACCOUNT pays only into `payeeaccount`. */
  kind?: 'CASH' | 'ACCOUNT'
  payeeaccount?: string
  /** Funds are held on the account until the cheque is cashed. */
  blockfunds?: boolean
  /** `ISSUED` by this group, or `RECEIVED` from someone else. */
  direction?: 'ISSUED' | 'RECEIVED'
  bookid?: string
}

export interface GetChequesResponse extends ApiEnvelope {
  cheques?: Cheque[]
  /** Blank cheque leaves left in the group's book. */
  remaining?: number
}

export interface CreateChequeRequest {
  accountid: string
  payee: string
  amount: number
  duedate: string
  memo: string
  kind?: 'CASH' | 'ACCOUNT'
  payeeaccount?: string
  blockfunds?: boolean
  bookid?: string
}

export interface CreateChequeResponse extends ApiEnvelope {
  cheque?: Cheque
}

/** A notification in the group's inbox; most point at a transaction. */
export interface Message {
  messageid: string
  onebankid: string
  time: string
  title: string
  transactionid: string
  account: string
  accountname: string
  toaccount: string
  amount: number
  ccy: string
  service: string
  status: string
  maker: string
  usertype: string
  read: boolean
}

export interface GetMessagesResponse extends ApiEnvelope {
  messages?: Message[]
}

export interface SavePermissionResponse extends ApiEnvelope {
  permission?: Permission
}

// -------------------------------------------------------------------- iBank
//
// The iBanking screens. Their commands keep the service and command names of
// the onebank-ui pages they replace (IBANK*/components/WebHome.svelte), which
// never reached a backend: those pages ran on mock data only.

export interface ExchangeRate {
  ccy: string
  nameEn: string
  nameLo: string
  /** Iconify id of the flag, e.g. `emojione:flag-for-thailand`. */
  flag: string
  /** Cash rates; null where the bank does not buy or sell notes. */
  buy: number | null
  sell: number | null
  /** Transfer rates. */
  buyTransfer: number | null
  sellTransfer: number | null
}

export interface LoadExchangeRatesResponse extends ApiEnvelope {
  rates?: ExchangeRate[]
  updated?: string
}

export interface InterestRate {
  periodEn: string
  periodLo: string
  lak: number | null
  usd: number | null
  thb: number | null
}

export interface InterestRateTable {
  id: string
  nameEn: string
  nameLo: string
  rates: InterestRate[]
}

export interface LoadInterestRatesResponse extends ApiEnvelope {
  tables?: InterestRateTable[]
  updated?: string
}

export interface TermDeposit {
  id: string
  account: string
  holder: string
  product: string
  ccy: string
  principal: number
  interest: number
  maturityAmount: number
  /** Percent a year. */
  rate: number
  start: string
  end: string
  /** Months. */
  term: number
}

export interface LoadTermDepositsResponse extends ApiEnvelope {
  deposits?: TermDeposit[]
}

export interface Loan {
  id: string
  account: string
  borrower: string
  product: string
  typeEn: string
  typeLo: string
  ccy: string
  amount: number
  outstanding: number
  monthlyPayment: number
  /** Percent a year. */
  rate: number
  start: string
  end: string
  /** Months. */
  term: number
  branch: string
}

export interface LoadLoansResponse extends ApiEnvelope {
  loans?: Loan[]
}

/** One movement on a term deposit or a loan. */
export interface ProductTransaction {
  id: string
  date: string
  descriptionEn: string
  descriptionLo: string
  debit: number
  credit: number
  balance: number
}

export interface GetProductTransactionsResponse extends ApiEnvelope {
  items?: ProductTransaction[]
}

export interface LoanInstalment {
  date: string
  opening: number
  principal: number
  interest: number
  closing: number
  paid: boolean
}

export interface GetLoanScheduleResponse extends ApiEnvelope {
  schedule?: LoanInstalment[]
}

export interface NotificationSetting {
  id: string
  titleEn: string
  titleLo: string
  descriptionEn: string
  descriptionLo: string
  enabled: boolean
}

export interface LoadNotificationSettingsResponse extends ApiEnvelope {
  settings?: NotificationSetting[]
}

export interface AddRecipientResponse extends ApiEnvelope {
  recipient?: Recipient
}
