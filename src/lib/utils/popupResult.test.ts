/**
 * A routed page awaiting an overlay's result. b1hybrid's pages get theirs by
 * postMessage; a native screen has no frame to answer, so `closePopup` settles
 * its promise — and nothing is left hanging when the overlay brings no result
 * or a navigation clears the stack.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { closePopup, showPopupForResult } from './helper'
import { closeOverlays } from './navigation'
import { popups } from '../../stores/popup'

afterEach(() => popups.set([]))

describe('showPopupForResult', () => {
  it('opens the page as an overlay and resolves with what it closes with', async () => {
    const result = showPopupForResult('TWOFACTOR.html')

    expect(get(popups)).toHaveLength(1)
    expect(get(popups)[0].src).toContain('TWOFACTOR.html')

    closePopup({ isVerified: true, ticket: 'TCK-9' })
    await expect(result).resolves.toEqual({ isVerified: true, ticket: 'TCK-9' })
    expect(get(popups)).toHaveLength(0)
  })

  it('resolves null when the overlay closes with nothing', async () => {
    const result = showPopupForResult('TWOFACTOR.html')

    closePopup()
    await expect(result).resolves.toBeNull()
  })

  it('resolves null when navigating closes every overlay', async () => {
    const result = showPopupForResult('TWOFACTOR.html')

    closeOverlays()
    await expect(result).resolves.toBeNull()
  })

  it('keeps the waiters apart', async () => {
    const first = showPopupForResult('TWOFACTOR.html')
    const second = showPopupForResult('TWOFACTOR.html')

    closePopup({ isVerified: true, ticket: 'SECOND' })
    await expect(second).resolves.toEqual({ isVerified: true, ticket: 'SECOND' })

    closePopup({ isVerified: true, ticket: 'FIRST' })
    await expect(first).resolves.toEqual({ isVerified: true, ticket: 'FIRST' })
  })
})
