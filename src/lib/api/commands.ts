/**
 * The OneBank service surface: one typed function per command.
 *
 * Six services — that is the whole backend contract for the corporate OneBank
 * pages. Nothing else should call `Connector.sendMessage` directly.
 *
 * `onebankid` identifies the active group. It defaults to the `currentGroup`
 * store so callers rarely pass it, but stays overridable for flows that act on
 * a group other than the active one (leaving a group, for instance).
 */

import { get } from 'svelte/store'
import { currentGroup } from '../../stores/onebankGroups'
import { call } from './client'
import {
  forgetLocalPermission,
  isLocalPermission,
  overlayPendingApprovals,
  overlayPermissions,
  overlayTransactions,
  removeLocalPermission,
} from './local'
import type {
  AccountChange,
  AccountStatusChange,
  ChangeAccountAliasResponse,
  ChangeAccountStatusResponse,
  GetAvailableAccountsResponse,
  NewAccount,
  OpenNewAccountResponse,
  AddMemberEnquiryResponse,
  AddMemberResponse,
  ChangeAccountsResponse,
  ChangeGroupDetailResponse,
  CreateGroupResponse,
  GetApprovalDetailResponse,
  GetPendingApprovalsResponse,
  GetPermissionsResponse,
  GetUploadUrlResponse,
  GroupDetailPatch,
  JoinGroupRequestResponse,
  LeaveGroupResponse,
  LoadGroupsResponse,
  LoadHomeResponse,
  LoadWidgetResponse,
  Menu,
  RemoveMemberResponse,
  RemovePermissionResponse,
  SaveHomeMenusResponse,
  StatementResponse,
  ViewTransactionsResponse,
  WidgetKind,
} from './types'

const HOME = 'ONEBANKHOME'
const GROUP = 'ONEBANKGROUP'
const TRANSACTION = 'ONEBANKTRANSACTION'
const STATEMENT = 'STATEMENT'
const USER = 'USER'
const ONEBANK = 'ONEBANK'

function groupId(onebankid?: string): string {
  return onebankid ?? get(currentGroup) ?? ''
}

// ---------------------------------------------------------------- ONEBANKHOME

/** Accounts, members, menus and group detail for one group. The main read. */
export function loadHome(onebankid?: string): Promise<LoadHomeResponse> {
  return call<LoadHomeResponse>(HOME, { command: 'loadhome', onebankid: groupId(onebankid) })
}

/** Persists the user's reordered home menu grid. */
export function saveHomeMenus(menus: Menu[] | string[], onebankid?: string): Promise<SaveHomeMenusResponse> {
  return call<SaveHomeMenusResponse>(HOME, { command: 'savehomemenus', menus, onebankid: groupId(onebankid) })
}

/**
 * One of the three home widgets.
 *
 * `ACCOUNTBALANCES` covers the whole group and takes no `accountid`; the two
 * usage widgets are per-account and the caller must supply one.
 */
export function loadWidget(widget: WidgetKind, accountid?: string, onebankid?: string): Promise<LoadWidgetResponse> {
  const data: Record<string, unknown> = { command: 'loadwidget', widget, onebankid: groupId(onebankid) }
  // Sent only when the widget is per-account, matching the mobile payloads.
  if (accountid !== undefined) data.accountid = accountid
  return call<LoadWidgetResponse>(HOME, data)
}

// --------------------------------------------------------------- ONEBANKGROUP

/** Every group the logged-in user belongs to. Drives the group tab bar. */
export function loadGroups(): Promise<LoadGroupsResponse> {
  return call<LoadGroupsResponse>(GROUP, { command: 'loadgroups' })
}

/** Creates a group from the given account ids; returns the new `onebankid`. */
export function createGroup(accounts: string[]): Promise<CreateGroupResponse> {
  return call<CreateGroupResponse>(GROUP, { command: 'creategroup', accounts })
}

/**
 * Starts a join request. Subscribe to `JOINEDGROUP-<joingroupid>` on the socket
 * to learn when an admin approves it.
 */
export function joinGroupRequest(): Promise<JoinGroupRequestResponse> {
  return call<JoinGroupRequestResponse>(GROUP, { command: 'joingrouprequest' })
}

export function leaveGroup(onebankid?: string): Promise<LeaveGroupResponse> {
  return call<LeaveGroupResponse>(GROUP, { command: 'leavegroup', onebankid: groupId(onebankid) })
}

/** Renames / recolours / re-logos a group. */
export function changeGroupDetail(patch: GroupDetailPatch, onebankid?: string): Promise<ChangeGroupDetailResponse> {
  return call<ChangeGroupDetailResponse>(GROUP, {
    command: 'changegroupdetail',
    name: patch.name,
    detail: patch.detail,
    color: patch.color,
    logoname: patch.logoname,
    onebankid: groupId(onebankid),
  })
}

/** Adds or removes accounts from a group in one batch. */
export function changeAccounts(accounts: AccountChange[], onebankid?: string): Promise<ChangeAccountsResponse> {
  return call<ChangeAccountsResponse>(GROUP, { command: 'changeaccounts', accounts, onebankid: groupId(onebankid) })
}

/** Locks or unlocks accounts in a group, in one batch. */
export function changeAccountStatus(accounts: AccountStatusChange[], onebankid?: string): Promise<ChangeAccountStatusResponse> {
  return call<ChangeAccountStatusResponse>(GROUP, { command: 'changeaccountstatus', accounts, onebankid: groupId(onebankid) })
}

/**
 * Renames one account inside the group.
 *
 * An empty alias is sent as null, which is how the core is told to drop the
 * one it has rather than store a blank.
 */
export function changeAccountAlias(accountid: string, alias: string, onebankid?: string): Promise<ChangeAccountAliasResponse> {
  return call<ChangeAccountAliasResponse>(GROUP, {
    command: 'changeaccountalias',
    accountid,
    alias: alias.trim() || null,
    onebankid: groupId(onebankid),
  })
}

/** The user's own accounts that this group does not already hold. */
export function getAvailableAccounts(onebankid?: string): Promise<GetAvailableAccountsResponse> {
  return call<GetAvailableAccountsResponse>(GROUP, { command: 'getavailableaccounts', onebankid: groupId(onebankid) })
}

/** Looks up the user behind a join code, before actually adding them. */
export function addMemberEnquiry(joingroupid: string, onebankid?: string): Promise<AddMemberEnquiryResponse> {
  return call<AddMemberEnquiryResponse>(GROUP, {
    command: 'addmemberenquiry',
    joingroupid,
    onebankid: groupId(onebankid),
  })
}

export function addMember(joingroupid: string, onebankid?: string): Promise<AddMemberResponse> {
  return call<AddMemberResponse>(GROUP, { command: 'addmember', joingroupid, onebankid: groupId(onebankid) })
}

export function removeMember(removeuserid: string, onebankid?: string): Promise<RemoveMemberResponse> {
  return call<RemoveMemberResponse>(GROUP, { command: 'removemember', removeuserid, onebankid: groupId(onebankid) })
}

/** The group's roles: who may do what, on which accounts, up to which limit. */
// The reads below carry what the user did locally (`./local`) on top of the
// core's answer, so a role saved or an approval given while the core could not
// take it still shows. The core's own records are never altered.

export async function getPermissions(onebankid?: string): Promise<GetPermissionsResponse> {
  const group = groupId(onebankid)
  return overlayPermissions(group, await call<GetPermissionsResponse>(GROUP, { command: 'getpermissions', onebankid: group }))
}

export async function removePermission(permissionid: number, onebankid?: string): Promise<RemovePermissionResponse> {
  const group = groupId(onebankid)
  // A role that exists only locally was never the core's to remove.
  if (isLocalPermission(permissionid)) return removeLocalPermission(group, permissionid)
  const response = await call<RemovePermissionResponse>(GROUP, { command: 'removepermission', permissionid, onebankid: group })
  if (response.result === 0) forgetLocalPermission(group, permissionid)
  return response
}

// --------------------------------------------------------- ONEBANKTRANSACTION

/** Transaction history for the group. */
export async function viewTransactions(onebankid?: string): Promise<ViewTransactionsResponse> {
  const group = groupId(onebankid)
  return overlayTransactions(group, await call<ViewTransactionsResponse>(TRANSACTION, { command: 'viewtransactions', onebankid: group }))
}

/** Transactions waiting on this user's approval. */
export async function getPendingApprovals(onebankid?: string): Promise<GetPendingApprovalsResponse> {
  const group = groupId(onebankid)
  return overlayPendingApprovals(
    group,
    await call<GetPendingApprovalsResponse>(TRANSACTION, { command: 'getpendingapprovals', onebankid: group }),
  )
}

export function getApprovalDetail(transactionid: string, onebankid?: string): Promise<GetApprovalDetailResponse> {
  return call<GetApprovalDetailResponse>(TRANSACTION, {
    command: 'getapprovaldetail',
    transactionid,
    onebankid: groupId(onebankid),
  })
}

// ------------------------------------------------------------------- STATEMENT

/**
 * One page of an account's settled movements, newest first.
 *
 * The core pages backwards only: `beforetime` is a row's own
 * `DD/MM/YYYY HH:MM:SS`, and there is no from-date, so a date range is walked
 * rather than asked for (`src/lib/statement.ts`). onebank-ui's `sendMessage`
 * fills the `onebankid` in from the page's querystring; here it is explicit.
 */
export function statement(accountid: string, beforetime?: string | null, onebankid?: string): Promise<StatementResponse> {
  return call<StatementResponse>(STATEMENT, {
    command: 'statement',
    transactiontype: 'account',
    accountid,
    beforetime: beforetime ?? null,
    onebankid: groupId(onebankid),
  })
}

// ------------------------------------------------------------------------ USER

/**
 * A one-shot signed URL for uploading a picture, plus the name it lands under.
 *
 * The only command outside the three OneBank services. Group logos are the
 * single caller; see `src/lib/utils/upload.ts` for the PUT that follows.
 */
export function getUploadUrl(): Promise<GetUploadUrlResponse> {
  return call<GetUploadUrlResponse>(USER, { command: 'getuploadurlr2' })
}

// --------------------------------------------------------------------- ONEBANK

/**
 * Opens a virtual or shadow account against one of the user's real accounts.
 *
 * The only command on the `ONEBANK` service. onebank-ui sends no `onebankid`
 * here — the core takes the group from the session — so neither does this.
 */
export function openNewAccount(account: NewAccount): Promise<OpenNewAccountResponse> {
  return call<OpenNewAccountResponse>(ONEBANK, {
    command: 'opennewaccount',
    accountType: account.accountType,
    accountid: account.accountid,
    alias: account.alias,
    avatar: account.avatar ?? '',
  })
}
