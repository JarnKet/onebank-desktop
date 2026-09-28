import {BCELONE_PAGES} from "../constant";
import {refreshGroups} from '../../stores/groups';
import {onebankPath, payloadPath} from '../../stores/config';
import {activePopup, activeUnauthenticatedPopup, popups, unauthenticatedPopups} from '../../stores/popup';
import {get} from 'svelte/store';
import CryptoJS from 'crypto-js';
import type {PopupMetadata} from "../../definition";
import {currentGroup, onebankGroups} from "../../stores/onebankGroups";
import {buildUrlParam, loadUrlParams} from './url';
import {currentPath, goHome, navigateToPage} from './navigation';
import {awaitPopupResult, nextResultCallbackId, settlePopupResult} from './popupResult';
import {routeForPath} from '../routes';
export {buildUrlParam, loadUrlParams};

/**
 * The app's language: 0 English, 1 Lao, 2 Vietnamese, 3 Chinese.
 *
 * Resolved once, at module load, and fixed for the life of the page — menu
 * labels in `lib/menus.ts` are translated at import time, so a live switch
 * would leave half the screen in the old language. The top bar's language pill
 * changes it by storing the choice and reloading (`setLanguage`). A `?lang=`
 * URL parameter still wins, so a link can pin one. Lao is the default, as in
 * the design.
 */
function resolveLang(): number {
    const fromUrl = loadUrlParams()['lang'];
    let stored: string | null = null;
    try {
        stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('lang');
    } catch {
        stored = null;
    }
    const value = parseInt((fromUrl as string) ?? stored ?? '1', 10);
    return Number.isFinite(value) ? value : 1;
}

export const lang = resolveLang();

/**
 * Stores a new language and reloads, which is how the language changes.
 *
 * A `?lang=` in the URL would outrank the stored choice, so it is dropped on
 * the way. Without one, the page must be *reloaded*: replacing the location
 * with the same URL only moves the `#/route` fragment, which the browser treats
 * as an in-page jump — the choice was stored and nothing re-rendered.
 * The session survives the reload (`restoreSession`).
 */
export function setLanguage(
    value: number,
    location: Pick<Location, 'href' | 'replace' | 'reload'> = window.location,
): void {
    try {
        localStorage.setItem('lang', String(value));
    } catch {
        // Storage disabled: the reload below falls back to the default.
    }
    const url = new URL(location.href);
    if (url.searchParams.has('lang')) {
        url.searchParams.delete('lang');
        location.replace(url.toString());
    } else {
        location.reload();
    }
}


export function t(en: string, la: string | null = null, cn: string | null = null, vn: string | null = null): string {
    if (lang === 0) return en;
    else if (lang === 1 && la) return la;
    else if (lang === 3 && cn) return cn;
    else if (lang === 2 && vn) return vn;
    else return en;
}

/**
 * Formats an account number for display, hiding the middle digits.
 *
 * Harvested from onebank-ui's `libs/utils/helper.ts`. Every page that opens
 * another page passes its accounts through this, so the masked form is what the
 * receiving page renders — keep it byte-identical to mobile.
 */
export function maskAccount(account?: string): string {
    if (!account) return 'xxxxx-xxxxx-xxxxx';
    if (account.indexOf('SHA') === 0) {
        return account.replace(/^SHA.*?(..)(...)$/, 'SHA-xx$1-$2');
    }
    if (account.length === 18) {
        return account.substring(0, 3) + '-' + account.substring(3, 5) + '-' + account.substring(5, 7) +
            'xxxxx-' + account.substring(12, 15) + '-' + account.substring(15, 18);
    }
    if (account.length === 13) {
        return account.substring(0, 3) + '-' + account.substring(3, 5) + 'xxxxx-' + account.substring(10, 13);
    }
    return account;
}

/**
 * A member's avatar on BCEL's image hosts, or the placeholder.
 *
 * `String(...)` rather than `profileType.toString()`: one member record
 * missing the type used to throw from inside the sidebar.
 */
export function getProfileImageUrl(profileType: number | undefined, profileId: string, faceId: string = '', prefix: '' | 't.' | 'm.' = ''): string {
    switch (String(profileType)) {
        case '1':
            return 'https://public2.bcel.one/upload/' + prefix + profileId;
        case '2':
            return 'https://bcel.la:8083/uploadfaceid/' + prefix + faceId;
        default:
            return 'img/ic_no_face.svg';
    }
}

/** Up to two initials for an avatar placeholder. */
export function initials(name: string | undefined): string {
    const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * Money as the design writes it: grouping commas, two decimals, no currency
 * symbol (the currency code is set beside it).
 */
export function formatMoney(value: number | string | undefined | null, decimals = 2): string {
    const number = Number(value ?? 0);
    return (Number.isFinite(number) ? number : 0).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/** A currency as the design writes it after an amount: "ກີບ" for kip in Lao, the code otherwise. */
export function ccyLabel(ccy: string | undefined): string {
    if (!ccy) return '';
    if (ccy === 'LAK') return t('LAK', 'ກີບ');
    if (ccy === 'THB') return t('THB', 'ບາດ');
    if (ccy === 'USD') return t('USD', 'ໂດລາ');
    return ccy;
}

/** "99,999,999.99 ກີບ". Pass `signed` to prefix a + on credits. */
export function money(value: number | string | undefined | null, ccy?: string, signed = false): string {
    const number = Number(value ?? 0);
    const sign = signed && number > 0 ? '+' : '';
    return `${sign}${formatMoney(number)} ${ccyLabel(ccy)}`.trim();
}

/** `YYYY-MM-DD` in local time. */
export function isoDay(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** "14/07/2025" and "09:51:31" from a core timestamp, as the design prints them. */
export function splitTime(txtime: string | undefined): {date: string; time: string} {
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})(:\d{2})?/.exec(txtime ?? '');
    if (!match) return {date: txtime ?? '', time: ''};
    return {date: `${match[3]}/${match[2]}/${match[1]}`, time: `${match[4]}${match[5] ?? ''}`};
}

function buildPopupUrl(pagename: string, paramArray?: Record<string, any> | string, from?: string): string {
    const payLoadPathValue = get(payloadPath);
    const onebankPathValue = get(onebankPath);
    const languageValue = lang;
    let origin = onebankPathValue;

    if (from === 'onebank') origin = onebankPathValue;

    const specialPages = [
        'CHAT.html', 'ONEPROOF.html', 'ONEPAYSCAN.html',
        'CLAIMVOUCHER.html', 'TRANSFER.html', 'ONEID.html',
        'CARDSELECT.html', 'TWOFACTOR.html', 'ONEPAYSUBSCRIPTION.html',
        'UNIONPAYQR.html'
    ];

    if (specialPages.includes(pagename) || BCELONE_PAGES.includes(pagename)) {
        origin = payLoadPathValue;
    }

    const baseUrl = pagename.startsWith('http://') ? pagename : (origin + pagename);
    let queryParams = `versioncode=320&isinbrowser=1&isdesktop=1&lang=${languageValue}&onebankpath=${onebankPathValue}`;
    // let queryParams = `versioncode=320&isinbrowser=1&isdesktop=1&lang=${languageValue}&onebankpath=${payLoadPathValue}`;
    if (paramArray) {
        const params = typeof paramArray === 'string' ? paramArray : buildUrlParam(paramArray);
        queryParams += '&' + params;
    }

    return `${baseUrl}?${queryParams}`;
}

/**
 * Builds the iframe URL for a routed page.
 *
 * Same origin resolution as `buildPopupUrl`, but the caller supplies an already
 * encoded querystring (the route's own params) rather than an object, and
 * `onebankid` is filled from the active group when the route did not set it.
 */
export function buildPageUrl(pagename: string, queryString: string, onebankid: string): string {
    const params = new URLSearchParams(queryString || '');
    // An empty onebankid in the route must not suppress the fallback.
    if (!params.get('onebankid') && onebankid) params.set('onebankid', onebankid);
    return buildPopupUrl(pagename, params.toString());
}

interface PopupOptions {
    pagename: string;
    paramArray?: Record<string, any> | string;
    from?: string;
    callbackid?: string;
    isAuthenticated?: boolean;
}

interface LoadPopupOptions {
    src: string;
    callbackid?: string;
    pagename?: string;
    isAuthenticated?: boolean;
}

export function managePopup(options: PopupOptions): void {
    const {pagename, paramArray, from, callbackid, isAuthenticated = true} = options;
    const src = buildPopupUrl(pagename, paramArray, from);
    loadPopupUrl({
        src,
        callbackid,
        pagename,
        isAuthenticated
    });
}

function loadPopupUrl(options: LoadPopupOptions): void {
    const {src, callbackid, pagename, isAuthenticated = true} = options;
    const popupData: PopupMetadata = {
        src,
        callbackid,
        isVisible: true,
        id: nextPopupId(),
        isBcelOne: pagename ? BCELONE_PAGES.includes(pagename) : false
    };

    const popupStore = isAuthenticated ? popups : unauthenticatedPopups;
    const activePopupStore = isAuthenticated ? activePopup : activeUnauthenticatedPopup;

    let popupValues = get(popupStore);

    popupValues = popupValues.map(popup => ({...popup, isVisible: false}));
    popupValues = [...popupValues, popupData];
    popupStore.set(popupValues);
    activePopupStore.set(popupData);
}

export function showPopup(pagename: string, paramArray?: Record<string, any> | string, from?: string, callbackid?: string): void {
    // A page this app owns becomes a URL. Everything else — every b1hybrid page,
    // and the onebank-ui pages still out of scope — opens as an iframe overlay.
    if (navigateToPage(pagename, paramArray)) return;
    managePopup({pagename, paramArray, from, callbackid, isAuthenticated: true});
}

/**
 * Opens a page as an overlay and resolves what it closes with — the routed
 * page's `showPopupForResult`. Never routed natively: a native route returns no
 * result. Resolves null when the user backs out.
 */
export function showPopupForResult(pagename: string, paramArray?: Record<string, any> | string, from?: string): Promise<any> {
    const callbackid = nextResultCallbackId();
    managePopup({pagename, paramArray, from, callbackid, isAuthenticated: true});
    return awaitPopupResult(callbackid);
}

export function showUnauthenticatedPopup(pagename: string, paramArray?: Record<string, any> | string, from?: string, callbackid?: string): void {
    managePopup({pagename, paramArray, from, callbackid, isAuthenticated: false});
}

/**
 * Re-reads the group list after a page that may have changed it closes.
 *
 * This used to postMessage `reloadonebank` into MAIN.html, which answered by
 * calling `loadgroups` and rebuilding its tabs. The shell owns the group list
 * now, so it calls `loadgroups` directly.
 *
 * Group management can create, join or leave, so the active group may be gone;
 * `refreshGroups` with no preference keeps the current group when it survived
 * and otherwise falls back to the last one, which is where a newly created
 * group lands. Any other page acted on the active group, so it is preferred.
 */
export function reloadOnebank(src: string): void {
    const preferred = src.includes('GROUPMANAGEMENT') ? undefined : get(currentGroup);
    void refreshGroups(preferred);
}

/**
 * A unique id per overlay, used as the `{#each}` key and the iframe's DOM id.
 *
 * `Date.now()` was the previous source and collides when two overlays open in
 * the same millisecond — two frames then share a key, and Svelte reuses the
 * wrong one. A counter cannot collide; the timestamp prefix keeps ids from
 * different sessions apart in the DOM.
 */
let popupSequence = 0

function nextPopupId(): string {
    popupSequence += 1
    return `${Date.now()}-${popupSequence}`
}

export function loadUrl(src: string, callbackid?: string, pagename?: string): void {
    const popupData: PopupMetadata = {
        src,
        callbackid,
        isVisible: true,
        id: nextPopupId(),
        isBcelOne: pagename ? BCELONE_PAGES.includes(pagename) : false
    };

    let popupValues = get(popups);
    popupValues = popupValues.map(popup => ({...popup, isVisible: false}));
    popupValues = [...popupValues, popupData];

    popups.set(popupValues);
    activePopup.set(popupData);
}

const RELOAD_TRIGGERS = {
    RESULT_REQUIRED: ["ACCOUNT", "MEMBER", "ROLE", "GROUP"],
    ALWAYS_RELOAD: ["GROUPMANAGEMENT", "REGISTERONEBANK"]
};

/**
 * Whether closing this page should make the main frame reload its group data.
 * Matched on the page name or URL, so "GROUP" also matches GROUPMANAGEMENT —
 * hence the explicit exclusion.
 */
function shouldReloadOnClose(popupSource: string, result?: any): boolean {
    const requiresResult = RELOAD_TRIGGERS.RESULT_REQUIRED.some(trigger =>
        popupSource.includes(trigger) && !popupSource.includes("GROUPMANAGEMENT")
    );
    const alwaysReload = RELOAD_TRIGGERS.ALWAYS_RELOAD.some(trigger =>
        popupSource.includes(trigger)
    );
    return (requiresResult && Boolean(result)) || alwaysReload;
}

/** Merges an edited group's name/detail/colour/logo back into the cached home result. */
function applyGroupDetailResult(source: string, result?: any): void {
    if (!result || !source.includes("GROUP") || source.includes("GROUPMANAGEMENT")) return;
    const currentGroupName = get(currentGroup);
    onebankGroups.update(groups => {
        const group = groups[currentGroupName];
        if (!group?.loadHomeResult) return groups;
        return {
            ...groups,
            [currentGroupName]: {
                ...group,
                loadHomeResult: {
                    ...group.loadHomeResult,
                    detail: {
                        ...group.loadHomeResult.detail,
                        name: result.name || group.loadHomeResult.detail.name,
                        detail: result.detail || group.loadHomeResult.detail.detail,
                        color: result.color || group.loadHomeResult.detail.color,
                        logoname: result.logoname || group.loadHomeResult.detail.logoname
                    }
                }
            }
        };
    });
}

export function closePopup(result?: any, isAuthenticated: boolean = true): void {
    const popupStore = isAuthenticated ? popups : unauthenticatedPopups;
    const activePopupStore = isAuthenticated ? activePopup : activeUnauthenticatedPopup;

    let popupValues = get(popupStore);

    // Nothing stacked means the routed page itself is closing. Apply the same
    // result handling it would have got as an overlay, then fall back to home.
    if (popupValues.length === 0) {
        if (!isAuthenticated) return;
        const path = currentPath();
        const route = routeForPath(path);
        if (route?.page) {
            applyGroupDetailResult(route.page, result);
            if (shouldReloadOnClose(route.page, result)) reloadOnebank(route.page);
        }
        goHome();
        return;
    }

    const closingPopup = popupValues[popupValues.length - 1];

    if (closingPopup.src.includes("GROUP") && result) {
        const currentGroupName = get(currentGroup);
        onebankGroups.update(groups => {
            if (groups[currentGroupName]) {
                const updatedGroup = {
                    ...groups[currentGroupName],
                    loadHomeResult: {
                        ...groups[currentGroupName].loadHomeResult,
                        detail: {
                            ...groups[currentGroupName].loadHomeResult.detail,
                            name: result.name || groups[currentGroupName].loadHomeResult.detail.name,
                            detail: result.detail || groups[currentGroupName].loadHomeResult.detail.detail,
                            color: result.color || groups[currentGroupName].loadHomeResult.detail.color,
                            logoname: result.logoname || groups[currentGroupName].loadHomeResult.detail.logoname
                        }
                    }
                };
                return {
                    ...groups,
                    [currentGroupName]: updatedGroup
                };
            }
            return groups;
        });
    }

    popupStore.update(currentPopups => {
        const remainingPopups = currentPopups.slice(0, -1);
        return remainingPopups.map((popup, idx) => ({
            ...popup,
            isVisible: idx === remainingPopups.length - 1
        }));
    });

    // Emptying the stack uncovers the routed page, which is not a popup — hence
    // null rather than the main frame this used to fall back to.
    activePopupStore.update(() => {
        const updatedPopups = get(popupStore);
        return updatedPopups.length > 0 ? updatedPopups[updatedPopups.length - 1] : null;
    });

    const currentActivePopup = get(activePopupStore);

    // The routed page waits in this document, so it is answered directly —
    // including when it is answered with nothing.
    const answeredNatively = settlePopupResult(closingPopup.callbackid, result);

    // A result only has somewhere to go while another overlay is still stacked
    // below. With the stack empty the caller was the routed page, which is in
    // this document and does not need a postMessage.
    if (!answeredNatively && result && closingPopup.callbackid && currentActivePopup) {
        const frameElement = document.getElementById(`frame-${currentActivePopup.id}`) as HTMLIFrameElement | null;
        if (frameElement && frameElement.contentWindow) {
            frameElement.contentWindow.postMessage(
                {
                    from: "onPopupResult",
                    callbackid: closingPopup.callbackid,
                    result: JSON.stringify(result)
                },
                currentActivePopup.src
            );
        }
    }
    if (closingPopup?.src && shouldReloadOnClose(closingPopup.src, result)) {
        reloadOnebank(closingPopup.src);
    }
}

export function closeUnauthenticatedPopup(result?: any): void {
    closePopup(result, false);
}

export function encryptPassword(password: string): string {
    return CryptoJS.SHA1(
        CryptoJS.enc.Utf8.parse(password + "bcelpassword12!@")
    ).toString(CryptoJS.enc.Base64);
}
