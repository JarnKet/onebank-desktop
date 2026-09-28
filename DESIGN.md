# OneBank Web: design

The design source is the Figma file **"OneBank Web – by Pink (Copy)"**:
`https://www.figma.com/design/AP2cI7IjeZuZt742CAgnCd`. The canvas is page `0:1`, and every frame is 1728 × 1117.

This document records how that design is translated into code, and the decisions taken where the design is silent. For who the product is for and what it does, see `PRODUCT.md`. For the principles, see `.impeccable.md`.

## Tokens

All tokens live in the `@theme` block of `src/app.css`; there is no `tailwind.config.js`.

### Colour

| Token | Value | Where the design uses it |
|---|---|---|
| `onebank-red` | `#c11111` | Every red fill: active group tab, active nav pill, primary buttons, today's date, badges |
| `onebank-main` | `#dd2319` | The file's **"Onebank main color"** variable: the logo, the ONE BANK wordmark |
| `onebank-blue` | `#133d6b` | The file's **"Blue"** variable: the wordmark's BANK, money-panel titles, secondary buttons, filter/export buttons, active tabs, the statement header row |
| `onebank-dark-red` | `#9e0d0d` | Hover / pressed state of red |
| `onebank-page` | `#f6f6f6` | Page ground |
| white | `#ffffff` | Cards |
| `onebank-surface` | `#fcfcfe` | The calendar card |
| `onebank-row` | `#f1f1f1` | A settled transaction row |
| `onebank-pink` | `#ffe4e4` | A pending row; a selected card or account; the source-account card |
| `onebank-pink-2` | `#f6cece` | The sidebar collapse chevron |
| `onebank-muted` | `#9d9fa3` | Placeholders, past weekdays, cancelled rows |
| `onebank-subtle` | `#848484` | Secondary text |
| `onebank-ink` | `#222222` | Search and input outlines only |
| `onebank-blue-soft` | `#eef3f9` | Hover on navy-outlined controls |
| `onebank-pending` | `#b34ede` | The "Pending" status word |
| `onebank-debit` | `#dd7878` | A settled debit amount in the calendar list |
| `onebank-income` / `onebank-expense` | `#3fb65f` / `#f25f5c` | The chart's income and spending totals |

Currency chips follow the account-card frames:

| Currency | Colour |
|---|---|
| LAK | `#03a9f4` |
| USD | `#00c853` |
| THB | `#ff8f00` |
| CNY | `#e53935` |

Role chips:

| Chip | Colour |
|---|---|
| View | `#a9e3fb` |
| Transact | `#c9a7f5` |
| Account count | `#fbb074` |

**Chart palette.** The categorical slots are `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100` and `#e87ba4`, plus `#9d9fa3` for "Other". They were validated with the dataviz skill's checker against the white card surface:

- The CVD and normal-vision checks pass.
- Three slots sit below 3:1 contrast. The donut therefore always shows its legend, with names and shares, as the required relief.

### Shape, depth, type

| Property | Value |
|---|---|
| Radius | `rounded-ob-xl` = **20px** on cards, tabs, pills and primary buttons. `ob-md` 12px and `ob-sm` 10px for inputs and inner tiles. |
| Card shadow | `shadow-ob-card` = `0 0 6px rgba(0,0,0,.15)`. `.ob-card` = white + 20px + this shadow. |
| Pill shadow | `shadow-ob-pill` = `0 2px 6px rgba(0,0,0,.15)`, on the top bar's group tabs. |
| Type | **Noto Sans Lao Looped**, self-hosted variable font, the only face. |

The type scale follows the frames:

| Size | Tailwind | Used for |
|---|---|---|
| 20px bold | `text-xl` | Card titles and the calendar month — every card at the same level uses it |
| 16px | `text-base` | Body, nav items, tile labels, button labels, inputs, the amount in a list row |
| 14px | `text-sm` | Secondary lines, an account number under a name |
| 12px | `text-xs` | Chips and meta — the floor, nothing smaller |

Amounts always use `tabular-nums`.

**Four sizes, and only these four.** `text-lg` (18px) and `text-2xl` (24px) are not in the
scale, nor is any `text-[Npx]`: the frames' odd sizes round to the nearest step here. 12px is a
floor rather than a convention — this type is Lao, which loses its loops below it. A card title
never drops to a body size to fit beside a control; shorten the title or move the control.

**Breakpoints** are `mobile` 640, `tablet` 768, `laptop` 960 and `desktop` 1280. Tailwind's own `sm/md/lg` are deliberately removed.

### Shared classes

| Class | What it is |
|---|---|
| `.ob-card` | The design's card |
| `.onebank-primary-btn` | Red, 50px tall, 20px radius, bold |
| `.onebank-secondary-btn` | White with a 2px navy border and navy text, same shape |
| `.onebank-outline-btn` | White with a 2px red border ("assign transaction", "add approver level") |
| `.ob-input` / `.ob-label` | Text field and its label |

## Shell anatomy (every frame)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [logo] ONE BANK        [Group A][Group B][Group C][⊕ Create/Join]  [🇱🇦 ▾ ລາວ] │  TopBar
├──────────────┬────────────────────────────────────────────────────────────┤
│ ┌──────────┐ │                                                            │
│ │ ○ Group  │◖│   routed page                                              │
│ │ ●●●●●+5  │ │                                                            │
│ │[Add memb]│ │                                                            │
│ └──────────┘ │                                                            │
│ ┌──────────┐ │                                                            │
│ │ Home     │ │                                                            │
│ │ Messages②│ │                                                            │
│ │ Pending ③│ │                                                            │
│ │ …        │ │                                                            │
│ └──────────┘ │                                                            │
└──────────────┴────────────────────────────────────────────────────────────┘
```

**Top bar** (`src/components/TopBar.svelte`):

- One 58px pill per group: the active one filled red, the others outlined in red.
- "Create / Join" opens a white menu (create, join, leave), drawn black in the Figma. Its current item is a red pill.
- The language pill shows the flag and the name. Changing it stores the choice and reloads, because `t()` is fixed per page load (see CLAUDE.md).

**Left column** (`Sidebar.svelte`):

- Two cards: the group card, and the navigation card.
- The nav items are the design's: Home, Messages, Pending authorization, Manage permissions, Accounts, Manage members, Edit group, Log out.
- The badges count unread messages and approvals waiting on you, live from the data.
- The pink chevron collapses the column to an icon rail.
- Below `laptop`, the column becomes a drawer opened from the top bar: it slides in from the left, and the scrim, Escape or a navigation closes it.

**Spacing rhythm.** Three steps, and nothing between them:

| Step | Value | Where |
|---|---|---|
| Card rhythm | **16px** | Between cards inside a page, and between the sidebar's two cards |
| Page frame | **16px**, 24px top / 27px sides at desktop | `Layout.svelte`'s padding, and the top bar's |
| Column gutter | **36px** | Sidebar to content: 20px of chevron overhang (`pr-5`) plus a 16px gap |

Both columns scroll, and both start 8px in (`pt-2`) so the first card's 6px shadow is not clipped by the scroller's edge.

**Full-width screens.** Create OneBank, Join and Leave are drawn without the left column, as in the design, and no group tab is active on them. Routes opt in with `fullWidth` in `src/lib/routes.ts`.

## Patterns

| Pattern | Where | Rule |
|---|---|---|
| **Money panel** | Transfer, salary, bills, top-up | One white `.ob-card` holds the whole form, titled in navy. "From" is a pink card with the balance; the other accounts are listed on the right on `onebank-page` tiles (`money/SourceAccount.svelte`). |
| **Confirmation card** | Every payment | A white card with the sender left, the receiver right, a `›››` between them and the amount in red; below it, a grey Cancel and a red Send (`money/ConfirmTransfer.svelte`). |
| **Selectable account** | Add account, create OneBank, add member, roles | Avatar, number, holder, balance, currency and type chips, a checkbox top right; selected shows a 2px red outline (`lib/components/SelectableAccount.svelte`). |
| **Status in words** | Everywhere | A transaction's status is always written out (ສຳເລັດ / ລໍຖ້າອະນຸມັດ / ຍົກເລີກ …). Colour follows it, never replaces it. Cancelled rows are struck through. |
| **Approval trail** | Authorization, history | ✓ green "Level N approved by X", or ✗ red "Rejected by X" with the reason and timestamp. The user is marked "(You)". |
| **List toolbar** | Messages, history | A rounded search box, a date box and a navy "Filter" button (`lib/components/ListToolbar.svelte`). |
| **Dialog** | Confirmations, reject reason, filters, add member | A white 20px card with a centred bold title and centred buttons. Escape and the backdrop close it; focus moves in and back out (`lib/components/Modal.svelte`). |
| **Paired buttons** | The Create OneBank wizard | A white "Back" in navy and a red "Next", joined inside one grey pill. |

## Screens → Figma frames

| Screen | File | Frames | Status |
|---|---|---|---|
| Home | `routes/Home.svelte` + `routes/home/*` | `1325:6978` ★ | native |
| Create OneBank | `RegisterOneBank.svelte` | `1325:5575`, `5731`, `5636`, `5792` ★ | native |
| Join / Leave group | `JoinGroup.svelte`, `LeaveGroup.svelte` | `1325:5314` / `1325:5371`, `5468` | native |
| Edit group | `Group.svelte` | `1325:3532` | native |
| Add member | `components/addmemberdialog/AddMemberDialog.svelte` | `1325:6`, `897`, `2142`, … ★ | native (role step framed) |
| Manage members | `Members.svelte` | `1325:2511`, `2761`, `3017`, `3345` | native |
| Accounts | `Account.svelte` + `account/*` | `1325:5865`, `6053`, `6186`, `6319` ★ | native |
| Manage permissions | `Role.svelte` + `lib/components/PermissionEditor.svelte` | `1325:6818`, `6454` | native (create and delete only; local fallback) |
| Messages | `Messages.svelte`, `MessageDetail.svelte` | `1325:5106`, `5214` | native |
| Pending authorization | `Authorization.svelte`, `AuthorizationHistory.svelte` | `1325:7358`, `7548`, `7748`, `7767`, `7910` | native (local fallback) |
| Statement | `Statement.svelte` | `1325:3640`, `3819` ★ | native (real `STATEMENT/statement`) |
| Transfer (+ international, ID card) | `money/TransferForm.svelte` | `1421:922`, `1213`, `732` ★ · `1421:5` · `1421:281` | native (local fallback) |
| Salary & file transfer | `Salary.svelte` | `1421:555`, `1325:19128` ★ | native (local fallback) |
| E-Cheque | `ECheque.svelte` | `1325:9762`, `9215`, `9455`, `9610`, `9940` | native (local fallback) |
| Electricity / Water | `BillPayment.svelte` | `1325:4047` / `1325:4786` | native (local fallback) |
| Top-up | `TopUp.svelte` | `1325:4945` | native (local fallback) |
| iBank: account detail, slips, destination accounts, rates, term deposits, loans, alerts | `routes/ibank/*.svelte` | none | native, built from the patterns above (local fallback) |

★ = starred by the designer as final.

**The iBank screens have no frame.** They follow the patterns table: a navy page title, white `.ob-card` panels, tables with the navy header row, `ListToolbar` for search, `Modal` for add/remove, navy tabs as E-Cheque draws them (`routes/ibank/Tabs.svelte`), switches (`role="switch"`) for alerts. Term deposits and loans are cards with a progress bar (time to maturity, share repaid) that open a detail in the same column. When a designer frames them, replace the layout and keep the data calls.

**How faithful each screen is.** The Figma MCP's Starter-plan call limit was reached part-way through the build.

- **Pixel-level:** Home, the shell, Accounts, Edit group, Join/Leave and Create OneBank were built from the frames' full design context and screenshots.
- **From section screenshots and the file's text, layer names and geometry:** Manage members and permissions, Messages, Authorization, Statement, Transfer, Salary and E-Cheque. The metadata was dumped once, at the start.
- **From that metadata alone, with no frame screenshot:** Electricity, Water, Top-up, International and ID-card transfer.

When the limit resets, compare the second and third groups frame by frame, and correct any spacing or type drift here and in the code.

## Where we deliberately depart from the Figma

**No black surfaces.** The Figma draws the money panels, the confirmation card, secondary buttons, filter buttons, the create/join menu and active tabs in black, which sits outside the brand. They were changed on the product owner's request (2026-09-21):

- Panels and cards are white `.ob-card`s.
- Secondary buttons are navy-outlined.
- Filter and export buttons, active tabs and the statement header row are navy.
- The create/join menu is white, with a red active item.

Black survives only as translucent backdrops (`bg-black/40`) behind dialogs and drawers, and in the chart tooltip.

**No gradients on controls or surfaces** (2026-09-22). Buttons, the bottom-nav pill and cards are flat brand colour; the old `.ob-gradient` utility is gone. Status chips use the palette: information (counts, view-only) in navy tint (`onebank-blue-soft` on `onebank-blue`), anything needing action or carrying a limit in pink/red (`onebank-pink` on `onebank-red`), "waiting for approval" in `onebank-pending`. Two exceptions: the chart's area fill, which fades under the line, and the login backdrop from its Figma frame.

**A tighter shell** (2026-09-28). The frames put 40px above the top bar and 60px below it, and 56px between the columns, against 12px between the cards inside a page — at that ratio the shell read as empty space with content adrift in it. The shell now follows the rhythm table above, which moves the first card about 68px up the page at desktop. Nothing inside a card moved.

## Where the design is silent (decisions)

- **Loading** uses pulsing blocks shaped like the content, never a spinner on a blank page.
- **Empty** states say what would be there and, where possible, what to do.
- **Errors** appear inline at the point of failure, in red on `red-50`.
- **Framed screens** keep the shell: a legacy page fills the content column inside an `.ob-card`, and overlays opened from menu tiles stack over the same column, so the top bar and sidebar stay in reach.
- **Offline data** is announced, never hidden: a navy status bar above the screen (`LocalDataNotice`) whenever a command the core did not answer was answered locally.
- **Home** is a fixed layout, as the frame draws it. The old draggable grid was retired, because it could not reproduce the design's composition. The shortcut tiles are the design's own customisation point, through "Add shortcut".
- **Charts** are hand-drawn SVG with the dataviz rules:
  - a 2px line;
  - a recessive grid and one y-axis;
  - a crosshair tooltip in text ink.
  The Figma's chart images were screenshots, so the data and scales come from the account.
- **Icons**: the design's own SVGs (in `public/img/ob/`) for the logo, shortcuts, services and chevrons; Iconify `mdi:*` elsewhere, matching the icon names the Figma's layers carry.
- **iBank tile icons** (`public/img/ob/sv-account-detail`, `-beneficiary`, `-exchange`, `-interest`, `-international`, `-loan`, `-notification`, `-slip`, `-term-deposit`, `-transfer-id`) are drawn here, not exported: navy `#133D6B` 2px round-capped strokes with one red `#DD2319` accent, on a 36–44px canvas, so at 40px they sit at the weight of the Figma's filled icons. They replace the shared `ib-logo.png` onebank-ui used for the whole family.

## Accessibility (WCAG 2.2 AA)

- Every interactive element is a `button`, `a` or form control, with a name. Nothing is a `div` with a click handler.
- The active nav item carries `aria-current="page"`, and tabs use `role="tab"` and `aria-selected`.
- Tests key on those attributes, never on style classes.
- Dialogs trap nothing, but they move focus in on open, restore it on close, and close on Escape.
- Status is never colour alone. Amounts carry a sign; states are words.
- Tap targets are at least 32px, and primary actions are 50px.
- Text on red and black is white; muted grey is used only on white.
