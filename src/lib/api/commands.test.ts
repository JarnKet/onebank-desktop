import { beforeEach, describe, expect, it } from 'vitest'
import { currentGroup } from '../../stores/onebankGroups'
import * as api from './index'
import { setTransport } from './client'

/** Captures what each command puts on the wire. */
let sent: Array<{ service: string; data: Record<string, unknown> }>
let reply: any

beforeEach(() => {
  sent = []
  reply = { result: 0 }
  setTransport(async (service, data) => {
    sent.push({ service, data })
    return reply
  })
  currentGroup.set('GROUP-1')
})

const last = () => sent[sent.length - 1]

describe('service routing', () => {
  it('sends home commands to ONEBANKHOME', async () => {
    await api.loadHome()
    expect(last().service).toBe('ONEBANKHOME')
    expect(last().data.command).toBe('loadhome')
  })

  it('sends group commands to ONEBANKGROUP', async () => {
    await api.loadGroups()
    expect(last().service).toBe('ONEBANKGROUP')
    expect(last().data.command).toBe('loadgroups')
  })

  it('sends transaction commands to ONEBANKTRANSACTION', async () => {
    await api.viewTransactions()
    expect(last().service).toBe('ONEBANKTRANSACTION')
    expect(last().data.command).toBe('viewtransactions')
  })

  it('sends the upload-url request to USER', async () => {
    await api.getUploadUrl()
    expect(last().service).toBe('USER')
    expect(last().data.command).toBe('getuploadurlr2')
  })

  it('sends the statement to STATEMENT', async () => {
    await api.statement('A1')
    expect(last().service).toBe('STATEMENT')
    expect(last().data).toEqual({
      command: 'statement',
      transactiontype: 'account',
      accountid: 'A1',
      beforetime: null,
      onebankid: 'GROUP-1',
    })
  })

  it('pages the statement backwards with beforetime', async () => {
    await api.statement('A1', '14/07/2025 09:51:31')
    expect(last().data.beforetime).toBe('14/07/2025 09:51:31')
  })

  it('asks STATEMENT for the file the core renders, in YYYYMMDD', async () => {
    await api.downloadStatement('A1', '20250701', '20250715', 'xlsx')
    expect(last().service).toBe('STATEMENT')
    expect(last().data).toEqual({
      command: 'downloadfile',
      fromdate: '20250701',
      todate: '20250715',
      filetype: 'xlsx',
      accountid: 'A1',
      onebankid: 'GROUP-1',
    })
  })

  it('sends opening an account to ONEBANK', async () => {
    await api.openNewAccount({ accountType: 'SHADOW', accountid: 'A1', alias: 'petty' })
    expect(last().service).toBe('ONEBANK')
    expect(last().data.command).toBe('opennewaccount')
  })
})

describe('accounts', () => {
  it('locks and unlocks in one batch', async () => {
    await api.changeAccountStatus([
      { accountid: 'A1', status: 'LOCKED' },
      { accountid: 'A2', status: 'ACTIVE' },
    ])
    expect(last().data).toMatchObject({ command: 'changeaccountstatus', onebankid: 'GROUP-1' })
    expect(last().data.accounts).toEqual([
      { accountid: 'A1', status: 'LOCKED' },
      { accountid: 'A2', status: 'ACTIVE' },
    ])
  })

  it('trims an alias before sending it', async () => {
    await api.changeAccountAlias('A1', '  petty cash  ')
    expect(last().data).toMatchObject({ command: 'changeaccountalias', accountid: 'A1', alias: 'petty cash' })
  })

  it('sends a blank alias as null, which clears it', async () => {
    await api.changeAccountAlias('A1', '   ')
    expect(last().data.alias).toBeNull()
  })

  it('asks for the accounts a group could still be given', async () => {
    await api.getAvailableAccounts()
    expect(last().data).toMatchObject({ command: 'getavailableaccounts', onebankid: 'GROUP-1' })
  })

  it('opens a new account without an onebankid — the core reads it from the session', async () => {
    await api.openNewAccount({ accountType: 'VIRTUAL', accountid: 'A1', alias: '' })
    expect(last().data).toMatchObject({ accountType: 'VIRTUAL', accountid: 'A1', alias: '', avatar: '' })
    expect(last().data.onebankid).toBeUndefined()
  })
})

describe('onebankid defaulting', () => {
  it('falls back to the active group', async () => {
    await api.loadHome()
    expect(last().data.onebankid).toBe('GROUP-1')
  })

  it('lets the caller target a different group', async () => {
    await api.leaveGroup('GROUP-2')
    expect(last().data.onebankid).toBe('GROUP-2')
  })

  it('sends an empty id rather than undefined when no group is active', async () => {
    currentGroup.set('')
    await api.loadHome()
    expect(last().data.onebankid).toBe('')
  })

  it('omits onebankid for loadGroups, which is account-wide', async () => {
    await api.loadGroups()
    expect(last().data).not.toHaveProperty('onebankid')
  })

  it('omits onebankid for createGroup, which has no group yet', async () => {
    await api.createGroup(['A1'])
    expect(last().data).not.toHaveProperty('onebankid')
  })
})

describe('command payloads', () => {
  it('createGroup passes the account ids', async () => {
    await api.createGroup(['A1', 'A2'])
    expect(last().data).toMatchObject({ command: 'creategroup', accounts: ['A1', 'A2'] })
  })

  it('changeGroupDetail flattens the patch onto the payload', async () => {
    await api.changeGroupDetail({ name: 'Ops', detail: 'team', color: '#33FFF5', logoname: '' })
    expect(last().data).toMatchObject({
      command: 'changegroupdetail',
      name: 'Ops',
      detail: 'team',
      color: '#33FFF5',
      logoname: '',
    })
  })

  it('changeAccounts batches add and remove together', async () => {
    await api.changeAccounts([
      { accountid: 'A1', action: 'add' },
      { accountid: 'A2', action: 'remove' },
    ])
    expect(last().data.accounts).toEqual([
      { accountid: 'A1', action: 'add' },
      { accountid: 'A2', action: 'remove' },
    ])
  })

  it('removePermission passes the permission id', async () => {
    await api.removePermission(42)
    expect(last().data).toMatchObject({ command: 'removepermission', permissionid: 42 })
  })

  it('removeMember uses removeuserid, not userid', async () => {
    await api.removeMember('U9')
    expect(last().data).toMatchObject({ command: 'removemember', removeuserid: 'U9' })
  })

  it('addMemberEnquiry and addMember both key off joingroupid', async () => {
    await api.addMemberEnquiry('OTP1')
    expect(last().data).toMatchObject({ command: 'addmemberenquiry', joingroupid: 'OTP1' })
    await api.addMember('OTP1')
    expect(last().data).toMatchObject({ command: 'addmember', joingroupid: 'OTP1' })
  })

  it('getApprovalDetail passes the transaction id', async () => {
    await api.getApprovalDetail('TX7')
    expect(last().data).toMatchObject({ command: 'getapprovaldetail', transactionid: 'TX7' })
  })

  it('saveHomeMenus passes the ordered menu list', async () => {
    await api.saveHomeMenus(['TRANSFER', 'TOPUP'])
    expect(last().data).toMatchObject({ command: 'savehomemenus', menus: ['TRANSFER', 'TOPUP'] })
  })
})

describe('loadWidget', () => {
  it('routes every widget kind to ONEBANKHOME/loadwidget', async () => {
    for (const widget of ['ACCOUNTBALANCES', 'USAGEDAILY', 'USAGESHARE'] as const) {
      await api.loadWidget(widget, widget === 'ACCOUNTBALANCES' ? undefined : 'ACC-1')
      expect(last().service).toBe('ONEBANKHOME')
      expect(last().data.command).toBe('loadwidget')
      expect(last().data.widget).toBe(widget)
    }
  })

  // ACCOUNTBALANCES covers the whole group; sending an empty accountid would
  // narrow it. The mobile widget omits the key entirely.
  it('omits accountid for the group-wide widget', async () => {
    await api.loadWidget('ACCOUNTBALANCES')
    expect(last().data).not.toHaveProperty('accountid')
  })

  it('sends accountid for the per-account widgets', async () => {
    await api.loadWidget('USAGEDAILY', 'ACC-7')
    expect(last().data.accountid).toBe('ACC-7')
  })

  it('defaults onebankid to the active group and honours an override', async () => {
    await api.loadWidget('USAGESHARE', 'ACC-1')
    expect(last().data.onebankid).toBe('GROUP-1')
    await api.loadWidget('USAGESHARE', 'ACC-1', 'GROUP-9')
    expect(last().data.onebankid).toBe('GROUP-9')
  })

  // The core signals "no data" by omitting the payload key, not by a non-zero
  // result, so callers branch on the key. Keep the envelope raw.
  it('returns the raw envelope, payload key and all', async () => {
    reply = { result: 0, balances: [{ account: '1', ccy: 'LAK', name: 'n', currentbalance: 1, availablebalance: 1 }] }
    const res = await api.loadWidget('ACCOUNTBALANCES')
    expect(res.balances).toHaveLength(1)

    reply = { result: 0 }
    expect((await api.loadWidget('USAGEDAILY', 'ACC-1')).items).toBeUndefined()
  })
})

describe('every command reaches the wire exactly once', () => {
  it('covers all 19 commands of the contract', async () => {
    await api.loadHome()
    await api.saveHomeMenus([])
    await api.loadWidget('ACCOUNTBALANCES')
    await api.loadGroups()
    await api.createGroup([])
    await api.joinGroupRequest()
    await api.leaveGroup()
    await api.changeGroupDetail({ name: '', detail: '', color: '', logoname: '' })
    await api.changeAccounts([])
    await api.addMemberEnquiry('x')
    await api.addMember('x')
    await api.removeMember('x')
    await api.getPermissions()
    await api.removePermission(1)
    await api.viewTransactions()
    await api.getPendingApprovals()
    await api.getApprovalDetail('x')
    await api.statement('A1')
    await api.downloadStatement('A1', '20250701', '20250715', 'pdf')

    const commands = sent.map((s) => s.data.command)
    expect(commands).toHaveLength(19)
    expect(new Set(commands).size).toBe(19)
  })
})

describe('response handling', () => {
  it('returns the raw envelope so harvested code can branch on result', async () => {
    reply = { result: 0, groups: [{ onebankid: 'G1' }] }
    const res = await api.loadGroups()
    expect(res.result).toBe(0)
    expect(res.groups[0].onebankid).toBe('G1')
  })

  it('does not throw on a failed result', async () => {
    reply = { result: 9, message: 'nope' }
    await expect(api.loadHome()).resolves.toMatchObject({ result: 9 })
  })

  it('isOk distinguishes success from failure', () => {
    expect(api.isOk({ result: 0 })).toBe(true)
    expect(api.isOk({ result: 1 })).toBe(false)
    expect(api.isOk(undefined)).toBe(false)
  })

  it('flags an expired session', () => {
    expect(api.isSessionExpired({ result: 1 })).toBe(true)
    expect(api.isSessionExpired({ result: 0 })).toBe(false)
  })

  it('unwrap throws ApiError carrying the core message', () => {
    expect(() => api.unwrap({ result: 5, message: 'boom' }, 'ONEBANKGROUP', 'loadgroups')).toThrowError('boom')
    try {
      api.unwrap({ result: 1 }, 'ONEBANKGROUP', 'loadgroups')
    } catch (e) {
      expect(e).toBeInstanceOf(api.ApiError)
      expect((e as api.ApiError).sessionExpired).toBe(true)
    }
  })

  it('unwrap passes a successful response straight through', () => {
    const res = { result: 0, groups: [] }
    expect(api.unwrap(res)).toBe(res)
  })
})
