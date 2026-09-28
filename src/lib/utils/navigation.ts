/**
 * Where a page opens: a route we own, or an iframe overlay.
 *
 * Everything that opens a page by name goes through `showPopup` in
 * `helper.ts`, which asks `navigateToPage` first. The decision is one lookup —
 * `routeForPage` — and it is the seam the migration moves: as a Figma screen
 * becomes native, its page stops being an overlay and starts being a URL.
 */

import { push } from 'svelte-spa-router'
import { get } from 'svelte/store'
import { HOME_PATH, routeForMenu, routeForPage } from '../routes'
import type { SidebarMenuTitle } from '../../definition'
import { activePopup, popups } from '../../stores/popup'
import { routeLocation } from '../../stores/route'
import { buildUrlParam } from './url'
import { cancelPopupResults } from './popupResult'

/** Serialises route params into a hash querystring, so links survive a refresh. */
function toQueryString(params?: Record<string, unknown> | string): string {
  if (!params) return ''
  return typeof params === 'string' ? params : buildUrlParam(params)
}

/**
 * Closes every overlay. Overlays are stacked *above* the routed page, so a
 * navigation that left them open would change the page nobody can see — and an
 * overlay whose page failed to load (a 404 has no script to call `closePopup`)
 * could then only be dismissed by a reload.
 */
export function closeOverlays(): void {
  if (get(popups).length) popups.set([])
  activePopup.set(null)
  cancelPopupResults()
}

export function navigateToPath(path: string, params?: Record<string, unknown> | string): void {
  // Also covers navigating to the route already shown, where the hash does not
  // change and FrameContainer's route watcher never fires.
  closeOverlays()
  const query = toQueryString(params)
  push(query ? `${path}?${query}` : path)
}

export function navigateToMenu(menu: SidebarMenuTitle, params?: Record<string, unknown> | string): boolean {
  const route = routeForMenu(menu)
  if (!route) return false
  navigateToPath(route.path, params)
  return true
}

/** Navigates to the route that owns `pagename`. Returns false if we do not own it. */
export function navigateToPage(pagename: string, params?: Record<string, unknown> | string): boolean {
  const route = routeForPage(pagename)
  if (!route) return false
  navigateToPath(route.path, params)
  return true
}

export function goHome(): void {
  closeOverlays()
  push(HOME_PATH)
}

export function isAtHome(): boolean {
  return currentPath() === HOME_PATH
}

/** The active route path, without its querystring. */
export function currentPath(): string {
  return get(routeLocation).path || HOME_PATH
}

/** True when b1hybrid overlays are stacked above the routed page. */
export function hasOverlays(): boolean {
  return get(popups).length > 0
}
