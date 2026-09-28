/**
 * Mounts the native ROLE page against a role in the core's own shape — the one
 * `getpermissions` answers, with `approverlevel` / `approvernumber` /
 * `approveruserids` and `limit.amount`.
 *
 * A role cannot be changed: the core creates and removes one, so the card opens
 * a read-only detail and only creating goes through the editor — behind
 * TWOFACTOR, whose proof rides along with `addpermission` exactly as
 * onebank-ui's ROLE sends it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, tick, unmount } from 'svelte'
import { get } from 'svelte/store'
import Role from './Role.svelte'
import { setTransport } from '../lib/api/client'
import { currentGroup, onebankGroups } from '../stores/onebankGroups'
import { resetLocalData } from '../lib/api/local'
import { closePopup } from '../lib/utils/helper'
import { popups } from '../stores/popup'

let host: HTMLElement
let app: Record<string, any> | null = null
let sent: Array<Record<string, unknown>>

/** Exactly what the core answered for this group. */
const corePermission = {
  permissionid: 9369,
  viewonly: false,
  accountids: ['1BAC00002114EE175D34C256FA00D39D1B0FF864'],
  allowedfunctions: 'ONEPAY',
  limit: { amount: 123 },
  userids: ['E48C19206F780096E043AC1003750096'],
  approverlevels: [{ approverlevel: 1, approvernumber: 1, approveruserids: ['19078303F8FBDFBAE063D583A8C0A4D1'] }],
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await tick()
}

function button(label: string): HTMLButtonElement | null {
  return host.querySelector(`button[aria-label="${label}"]`)
}

function labelled(text: string, within: ParentNode = host): HTMLButtonElement {
  return [...within.querySelectorAll('button')].find((element) => element.textContent?.trim() === text) as HTMLButtonElement
}

function dialog(): HTMLElement {
  return host.querySelector('[role="dialog"]') as HTMLElement
}

function callsTo(command: string): any[] {
  return sent.filter((data) => data.command === command)
}

beforeEach(async () => {
  resetLocalData()
  popups.set([])
  sent = []
  setTransport(async (_service, data) => {
    sent.push(data)
    if (data.command === 'getpermissions') return { result: 0, permissions: [structuredClone(corePermission)] }
    return { result: 0 }
  })
  onebankGroups.set({
    G1: {
      isFinishLoad: true,
      loadHomeResult: {
        result: 0,
        detail: { onebankid: 'G1', name: 'Ops' },
        accounts: [{ accountid: '1BAC00002114EE175D34C256FA00D39D1B0FF864', account: '010120001', ccy: 'LAK', name: 'OPS FUND' }],
        users: [
          { userid: 'E48C19206F780096E043AC1003750096', name: 'Vilay Keo' },
          { userid: '19078303F8FBDFBAE063D583A8C0A4D1', name: 'Souk Vong' },
        ],
        me: { userid: 'E48C19206F780096E043AC1003750096', name: 'Vilay Keo', role: 'OWNER' },
        allmenus: ['ONEPAY'],
      } as any,
    },
  })
  currentGroup.set('G1')
  host = document.createElement('div')
  document.body.appendChild(host)
  app = mount(Role, { target: host, props: {} })
  await flush()
})

afterEach(() => {
  if (app) unmount(app)
  app = null
  host.remove()
  setTransport(null)
  onebankGroups.set({})
  popups.set([])
  resetLocalData()
})

describe('a role in the core shape', () => {
  it('summarises its levels and its limit on the card', () => {
    expect(host.textContent).toContain('1 approval levels')
    expect(host.textContent).toContain('Has spending limits')
  })

  it('opens a read-only detail, reading the approvers the core named', async () => {
    button('View role')!.click()
    await tick()

    expect(host.textContent).toContain('Souk Vong')
    expect(host.textContent).toContain('Everyone must approve')
    expect(host.textContent).toContain('Per transaction')
    // Read-only: none of the editor's inputs are here.
    expect(host.querySelector('input')).toBeNull()
  })

  it('offers no way to edit a role, since the core has no command for it', async () => {
    expect(button('Edit role')).toBeNull()

    button('View role')!.click()
    await tick()

    expect(button('Edit role')).toBeNull()
    expect(host.textContent).toContain('A role cannot be changed once created')
  })

  it('deletes the role from its detail', async () => {
    button('View role')!.click()
    await tick()
    labelled('Delete role').click()
    await tick()
    labelled('Delete role', dialog()).click()
    await flush()

    expect(callsTo('removepermission')[0]?.permissionid).toBe(9369)
  })
})

describe('the roles it lists', () => {
  /** Re-answers `getpermissions` with these roles and remounts. */
  async function withRoles(permissions: unknown[]): Promise<void> {
    if (app) unmount(app)
    resetLocalData()
    sent = []
    setTransport(async (_service, data) => {
      sent.push(data)
      if (data.command === 'getpermissions') return { result: 0, permissions: structuredClone(permissions) }
      return { result: 0 }
    })
    app = mount(Role, { target: host, props: {} })
    await flush()
  }

  it('drops a role whose accounts loadhome never returned, as onebank-ui does', async () => {
    await withRoles([
      corePermission,
      { ...corePermission, permissionid: 9370, name: 'Other branch', accountids: ['AN-ACCOUNT-WE-CANNOT-SEE'] },
    ])

    expect(host.textContent).not.toContain('Other branch')
    expect(host.querySelectorAll('button[aria-label="View role"]')).toHaveLength(1)
  })

  it('reads as an empty group when every role is dropped', async () => {
    await withRoles([{ ...corePermission, accountids: ['AN-ACCOUNT-WE-CANNOT-SEE'] }])

    expect(host.textContent).toContain('This group has no roles yet')
    expect(host.querySelector('button[aria-label="View role"]')).toBeNull()
  })
})

describe('creating a role', () => {
  /** Fills the editor and presses Save, stopping at the verification overlay. */
  async function fillNewRole(viewonly: boolean): Promise<void> {
    labelled('New role').click()
    await tick()
    host.querySelectorAll<HTMLInputElement>('input[name="permissionType"]')[viewonly ? 0 : 1].click()
    await tick()
    ;(host.querySelector('input[name="account"]') as HTMLInputElement).click()
    await tick()
    labelled('Save').click()
    await flush()
  }

  function verifyWith(result: unknown): Promise<void> {
    closePopup(result)
    return flush()
  }

  it('asks TWOFACTOR to verify before it sends anything', async () => {
    await fillNewRole(false)

    expect(get(popups)[0]?.src).toContain('TWOFACTOR.html')
    expect(callsTo('addpermission')).toHaveLength(0)
  })

  it("sends addpermission with the page's proof", async () => {
    await fillNewRole(false)
    await verifyWith({ isVerified: true, type: 'question', ticket: 'TCK-1' })

    const [call] = callsTo('addpermission')
    expect(call.ticket).toBe('TCK-1')
    expect(call.permission.accountids).toEqual(['1BAC00002114EE175D34C256FA00D39D1B0FF864'])
    expect(host.textContent).toContain('Role saved')
  })

  it('creates nothing when the user backs out of verification', async () => {
    await fillNewRole(false)
    await verifyWith(undefined)

    expect(callsTo('addpermission')).toHaveLength(0)
    expect(host.textContent).toContain('Identity was not verified')
  })

  it("grants a view-only role onebank-ui's own function list and nothing else", async () => {
    await fillNewRole(true)
    await verifyWith({ isVerified: true, type: 'question', ticket: 'TCK-2' })

    const { permission } = callsTo('addpermission')[0]
    expect(permission.allowedfunctions).toBe('CARDINFO,HISTORY,STATEMENT,CHAT,MESSAGE')
    expect(permission).not.toHaveProperty('limit')
    expect(permission).not.toHaveProperty('approverlevels')
  })

  it('leaves an empty level list out rather than sending it', async () => {
    await fillNewRole(false)
    await verifyWith({ isVerified: true, type: 'question', ticket: 'TCK-3' })

    const { permission } = callsTo('addpermission')[0]
    expect(permission).not.toHaveProperty('approverlevels')
    expect(permission.allowedfunctions).toBe('*')
  })
})
