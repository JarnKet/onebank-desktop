# onebank-webapp

The **web** OneBank app. Svelte 5 (runes) + Vite 8 + Tailwind 4, single page app.
Package manager is **pnpm** — `packageManager` in `package.json` pins it, and
`package-lock.json` is gitignored so a second lockfile cannot come back.

It talks to the **BCEL One core** (`service3.php`) and renders every page in the
Figma design ("OneBank Web – by Pink") as a native route **where the core
contract allows it**. Every other page — Figma screens whose commands are not
mapped yet, and all the BCEL One services with no Figma screen — is the legacy
b1hybrid / onebank-ui page in an iframe. Read `PRODUCT.md` (what is native, what
is framed) and `DESIGN.md` (tokens, shell, patterns, Figma frame map) before
changing a screen; `.impeccable.md` holds the design principles.

Sibling products this repo deliberately does *not* share code with:

- **`onebank-ui`** (`../onebank-ui`, separate repo) — the **mobile** app, shipped inside the
  native Android/iOS wrappers. Frozen with respect to the web migration. We harvest from it
  by one-time copy, never by import. Its pages are also what the framed routes load.
- **`b1hybrid/`** — legacy BCEL One. A **symlink to `/var/www/html/b1hybrid`**, the copy Apache
  serves, so what you read is what runs. Gitignored. **Never edited from here.** Its pages stay
  iframe-loaded; the whole coupling surface is `VITE_PAYLOAD_PATH` plus the page allowlists in
  `src/lib/constant.ts`.

## Commands

| | |
|---|---|
| `pnpm dev` | Dev server on **7001** |
| `pnpm build` | Production build |
| `pnpm run check` | `svelte-check` typecheck |
| `pnpm test` | Vitest (`pnpm test:watch` to watch) |
| `pnpm format` | Prettier |

**Running it needs two servers.** onebank-ui must be serving the pages this app still iframes:

```bash
cd ../onebank-ui && npm run dev   # 7000, pinned by strictPort — do not serve its dist/,
                                  # only 19 of 47 pages are built there
pnpm dev                          # 7001
```

If the two land on the same origin, Vite answers `HOME.html` with this app's own `index.html` and
the shell renders inside its own content frame as a login screen. `assertDistinctOrigins()` in
`src/lib/env.ts` logs an error when that happens.

## Native vs framed routes

`src/lib/routes.ts` is the table: every route has a legacy `page` name, optional `aliases`, and a
`native` flag. `src/routes/index.ts` mounts the native component when `native` is true and
`IframeRoute` (the legacy page, framed in the content column) otherwise.

**Every Figma screen is native**, and so are the iBank tiles (`src/routes/ibank`, no Figma frames). Only
`/group-management` is framed, for embedded pages that still ask for `GROUPMANAGEMENT.html` by name. BCEL One services with no Figma screen (leasing,
insurance, taxes…) open as b1hybrid / onebank-ui overlays from their tiles.

**A b1hybrid page is claimed only by a native route** (`routeForPage`). Framed, it would drop the
results b1hybrid popups return through `callbackid`. Native, the trade-off is the reverse: a
b1hybrid page that opens `TRANSFER.html` expecting a `callbackid` result now gets the native
screen, which returns none. `aliases` (`NEWPHONE.html`, `ONEBANKTRANSFER.html`, …) are how the
OneBank-branded tiles and the `PAGE_RENAMES` reach the same screens. `routes.test.ts`,
`navigation.test.ts` and `openMenu.test.ts` pin all of this.

## Commands the core contract lacks — `src/lib/api/local`

Authorization, Role, Transfer, Salary, E-Cheque, bills, Top-up and the iBank screens call commands
the core contract does not have. They live in `src/lib/api/unmapped.ts` and all go through
`callWithFallback`:

- **The core first.** A `result: 0` answer is used as is — the day the core implements a command,
  the screen is on real data with no change.
- **An expired session is passed back**, never answered locally.
- **Anything else** — a refusal, a transport error, no answer within `VITE_UNMAPPED_TIMEOUT_MS`
  (default 5000) — is answered by `local/handlers.ts`, and that command skips the core for the
  rest of the session, so a screen waits at most once.
- A local answer sets `usingLocalData` (`stores/localData.ts`); `FrameContainer` shows
  `LocalDataNotice` ("nothing here was sent to the bank") until the route changes.

The local store (`local/store.ts`) holds only what the user *did* — transfers, payments,
decisions, roles, cheques, drafts — plus billers and recipients. Accounts, members and "me" always
come from the real `loadhome`; it lives in **sessionStorage** and `logout()` clears it
(`resetLocalData`). **Overlays** in `commands.ts` merge it into three real reads —
`getpermissions`, `viewtransactions`, `getpendingapprovals` — so a role saved or an approval
given locally still shows; a local-only role (negative `permissionid`) is removed locally.
`local/fallback.test.ts` and `local/handlers.test.ts` pin the rules. **To map a command for
real:** replace its placeholder in `unmapped.ts` with the core's (or move it into `commands.ts`);
the screen does not change.

**`ALWAYS_OFFERED` in `src/lib/menus.ts`** is added to `allmenus` wherever menus are listed (Home
services grid, the Role function picker) through `offeredMenus()`: the core never enumerates the
`IBANK*` family or the OneBank utilities, and the Figma rebuild dropped them by reading
`allmenus` alone. `menus.registry.test.ts` pins the list to onebank-ui's.

A tile routed to a native screen gets only its registry `params`, not the legacy `menuParams`
bundle — native screens read the group from the stores.

**Menu tiles** (`src/routes/home/openMenu.ts`): a key becomes a page name (registry `popupname`,
then `PAGE_RENAMES`), and `showPopup` either routes it (a page a route owns) or opens it as an
iframe overlay with the `menuParams` bundle (ACTIVE accounts with `maskedAccount`, group name,
detail, logo). **Every launched page is configured entirely by its querystring, so
`buildUrlParam` must JSON-encode objects** — `String([{…}])` is `[object Object]` and the page
renders blank. **A page name must resolve to an origin that serves it**: `buildPopupUrl` defaults
to onebank-ui and uses b1hybrid only for `BCELONE_PAGES`; `PHONE` → `NEWPHONE` is absent from both
repos' allowlists and unverified.

## The core

**Backend calls go through `src/lib/api/commands.ts`,** not `Connector.sendMessage` directly — the
contract across six services, the single place the wire format is expressed and the
thing that keeps web and mobile aligned. `client.ts` sends each through `Connector` unless a test
calls `setTransport`. (Login and QR login still call the Connector directly, as before.)

**The statement is real** and speaks its own wire format. `STATEMENT/statement` pages *backwards*
only — `beforetime` is a row's own `DD/MM/YYYY HH:MM:SS` — and takes no from-date, so
`src/lib/statement.ts` walks the range page by page (capped at `MAX_PAGES`, the rest behind a "load
older" button) and parses `time` there; `utils/helper.ts`'s `splitTime` speaks the ISO `txtime` of
every other command. Its rows are `StatementTransaction`, not `TransactionInfo`: a `type` code, a
`title`/`subtitle` and label/value pairs the core has already worded (`summary` Lao,
`summarykey` English). The search box and the filter modal sift the rows already read — the core
filters nothing, so the modal's chips are built from those rows (direction, plus whichever movement
codes they carry) and a chip is namespaced by its group's id prefix: chips widen within a group and
narrow across groups. **Export is the core's file wherever it renders one**: `downloadfile` takes
`YYYYMMDD` days and answers base64 PDF or xlsx. A **shadow account** has no rendered statement — the
answer carries rows instead — and only then is the file drawn here, in `src/lib/statementFile.ts`:
the bank's A4 layout through jsPDF, or its own `SHADOW_ACCOUNT_TEMPLATE.xlsx` filled in through
ExcelJS, both harvested from `ONEBANKSTATEMENT/helper.ts`. **jspdf, jspdf-autotable and exceljs are
imported dynamically** (1.5MB of chunks) and the font, logo and template are fetched from `public/`,
so an ordinary export pays for none of it; the font is kept once read. The branch is on the
*answer*, not the account type, so a shadow account moves to the core's own file the day it renders
one. `statement.test.ts` pins the walk, the sifting and the export; `statementFile.test.ts` draws
both formats against the real assets and reads the workbook back.

**Every call to the core carries a timeout.** `Connector.post()` is the single place that talks to
`service3.php`; tune with `VITE_REQUEST_TIMEOUT_MS` (default 20000). Transport failures are
rethrown with a message fit to show a user.

**Never write `new Promise(async (resolve) => ...)`.** An async executor that throws returns a
rejected promise which `new Promise` discards, so the promise never settles. If a cached in-flight
promise is involved, clear it in `finally` (`loadGroupHome` in `stores/home.ts`, `getSession`).
`src/lib/utils/connector.session.test.ts` pins both.

**The iframe bridge lives in `src/lib/bridge`.** One handler for both containers
(`FrameContainer`, `UnauthenticatedFrameContainer`), origin-checked against b1hybrid and
onebank-ui. Its message protocol is fixed by those two repos — do not change the shapes. Its
`groupManagement` handler now sends `newgroup` / `joingroup` / `leavegroup` to the native
`/register`, `/group/join`, `/group/leave`.

**Join group** subscribes to `JOINEDGROUP-<joingroupid>` on the SocketCluster connection
(`src/lib/socket.ts`, `public/lib.socketcluster-client.js`); QR login uses `LOGIN-<token>`.

## Conventions

**Svelte 5 runes everywhere.** `$state`, `$derived`, `$props`, `$effect`, `onclick`, callback props,
`{#snippet}` / `{@render}`. The Svelte 4 idiom does not appear anywhere — do not reintroduce it.

**Prefer the modern API to a hand-rolled one**: `svelte/reactivity/window`, `{@attach}`
(`src/lib/attachments/clickOutside.ts`), `<svelte:window>`, `<svelte:boundary>` around the
dashboard charts.

**`{@attach}` is reactive, unlike `use:`**, and Svelte flushes effects synchronously inside a
trusted event handler, so `clickOutside` listens for `pointerdown`. A trigger button and its menu
must share **one** `clickOutside` wrapper.

**Assigning state inside an `$effect` needs a reason.** A one-shot boot task wraps its body in
`untrack()`.

**Config comes from `src/lib/env.ts`.** Never hardcode a host, port or endpoint: add a `VITE_*`
variable, type it in `src/vite-env.d.ts`, expose it through `env`, document it in `.env.example`.
`.env.local` is yours and is not committed.

**Types are imported with `import type`** (`verbatimModuleSyntax` is on).

**Styling is Tailwind 4, configured in CSS** (`@theme` in `src/app.css`, see `DESIGN.md`). Only
`mobile` / `tablet` / `laptop` / `desktop` breakpoints exist. Avoid `@apply` in a component
`<style>` block. **Do not change the brand colours** — `#c11111` UI red, `#DD2319` logo red,
`#133D6B` navy. **No black surfaces and no gradients on controls or surfaces**, even where the
Figma or a legacy page draws them (see DESIGN.md); info chips are navy tint
(`onebank-blue-soft`/`onebank-blue`), action and warning chips pink/red. The login backdrop is the
one pastel exception, from its Figma frame.

**Two `t()` helpers, not duplicates.** `helper.ts`'s `t()` resolves the language once at module
load (`?lang=`, else the stored `lang`, else Lao) because `lib/menus.ts` translates at import
time; the top bar's language pill calls `setLanguage()`, which stores and reloads. The login screen
has local `t()`s reading the `language` store so it re-renders live. `buildPopupUrl` passes the same
`lang` to every framed page.

**Money** is formatted with `money()` / `formatMoney()`, dates with `splitTime()`; transaction
words live in `src/lib/transactions.ts`.

**Read the active route from `routeLocation` (`src/stores/route.ts`)** — path and querystring —
never from svelte-spa-router's internals.

**Group state:** `stores/groups.ts` (seeded from the login payload, refreshed through `loadgroups`;
`selectGroup` clears the overlay stack), `onebankGroups.ts` (`currentGroup`, cached
`loadHomeResult`), `home.ts` (`loadGroupHome` on every group change, `reloadHome()` after a
mutation), `badges.ts` (pending approvals; the contract has no unread state).

**Comments are few and short.** Let the code speak for itself: comment only what it cannot say
itself — a server quirk, a wire-format surprise, a non-obvious ordering constraint — in one line.
Do not comment every change, do not narrate what the code used to do or which bug a line fixes, and
do not put a docblock on a self-evident function. The long comments already in the tree are not a
licence to add more.

**Commit messages carry no co-author or tool attribution trailers.** Subject in the imperative,
lowercase; add a body only when the *why* isn't obvious from the diff.

**Never key a test on a style class.** The active nav entry carries `aria-current="page"`, the
active group tab `aria-current="true"`, a framed route `.route-frame`.

## Gates

| Gate | State |
|---|---|
| `pnpm test` | **445 passing** — a passing gate |
| `pnpm run check` | **0 errors, 0 warnings** — a passing gate; do not add either |
| `pnpm build` | passing gate |
| `pnpm format:check` | failing, pre-existing — not a gate until someone runs `pnpm format` in a commit of its own |

Vendored code is out of scope and carries `@ts-nocheck`: `src/lib/utils/rsakey.ts` (its eight key
components are declared `BigInteger | null`, because the suppression stops errors being reported
while the inferred types still leak into `connector.ts`). `jsbn` has no types; `src/jsbn.d.ts`
declares the surface `rsakey.ts` uses.

## Testing

**`localStorage` in tests needs a Node flag** (`--no-experimental-webstorage` in
`vitest.config.ts`) — Node 22+'s own `localStorage` otherwise shadows jsdom's. Permanent.

**`src/setupTests.ts` pins English** at top level (the app defaults to Lao and `t()` resolves at
import) and stubs `ResizeObserver`, `matchMedia` and `Element.prototype.animate`.

**Waiting for a hash change takes two macrotasks, not one** — jsdom dispatches `hashchange` a task
after assigning the hash.

**Component tests inject their own transport** with `setTransport(async (service, data) => …)`;
without one the client builds a real `Connector`, which generates a 2048-bit RSA keypair.

## Environment

Everything runs on the dev box; `10.0.19.65` is its LAN address.

| Piece | Where | Served by |
|---|---|---|
| BCEL One core | `VITE_SERVICE_URL` → `/var/www/html/service3.php` | Apache 2.4 on :80 |
| b1hybrid pages | `VITE_PAYLOAD_PATH` → `/var/www/html/b1hybrid/` | Apache 2.4 on :80 |
| onebank-ui pages | `VITE_ONEBANK_PATH` → `../onebank-ui` | its own Vite dev server, :7000 |
| this app | — | Vite dev server, :7001 |

A fresh clone on another machine gets none of this: b1hybrid is gitignored, onebank-ui is a
separate repo, and the Apache paths are local. Set the `VITE_*` variables to wherever those live.

## Known sharp edges

- **The Figma MCP Starter plan has a low call limit** and it was hit mid-build. `DESIGN.md` lists
  which screens were built from full frame context and which from the saved metadata only.
- **Nothing may render as a blank white page.** `App.svelte` checks `$unauthenticatedPopups`
  before `$loggedIn`; `completeLogin` retires pre-login popups; boot uses the grey spinner; a
  `<svelte:boundary>` at the root turns a render error into a message. `src/App.blank.test.ts`.
- **Navigating closes every overlay.** Overlays sit above the routed page, and one whose page
  failed to load has no script to call `closePopup`. `navigateToPath`/`goHome` call
  `closeOverlays()`, and `FrameContainer` does too on any path change (back/forward).
  `FrameContainer.overlay.test.ts`.
- **A saved password is only written after the core accepts it**, and a stored hash the core
  refuses is dropped rather than replayed. `src/components/FormLogin.password.test.ts`.
- **Dev overrides are resolved in `src/lib/overrides.ts`**, never read from `env` directly:
  "Core IP" repoints `service3.php` *and* b1hybrid (same Apache host), "Use production" ignores it,
  "Onebank UI" repoints onebank-ui. `Connector` resolves the URL per request, and the bridge's
  origin allowlist follows the overrides. Off (`VITE_ENABLE_DEV_OVERRIDES` unset), they return `env`.
- Password hashing is SHA-1 with a static pepper, persisted to `localStorage` and replayed as a
  credential; RSA private key components sit in plaintext `localStorage` (`connector.ts`); a
  login survives a reload by keeping the session key and password in **sessionStorage**
  (`src/lib/session.ts`) — a live credential at rest, scoped to one tab, cleared on logout.
  Logout goes through `logout()`; a bare `window.location.reload()` would restore the session.
- Icons other than the Figma's own SVGs come from `@iconify/svelte`, fetched from the Iconify API
  at runtime.
- `helper.ts` — only `http://` is special-cased when building popup URLs.
