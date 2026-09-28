# OneBank Web: product

OneBank is BCEL's shared-account banking: a **group** holds accounts that several people can see or use. Each person gets a **role** that decides what they may do and who must approve it. OneBank Web is the desktop front end for it.

It talks to the BCEL One core. Every Figma screen is **native**. Where a screen needs a command the core contract does not have yet (approvals, roles, transfers, bills, top-up, salary, e-cheque), the command is sent to the core first; if the core refuses it or does not answer, the app answers it from data kept in the browser and says so on screen. The iBanking tiles have no Figma frames either, but are native too, built from the design's patterns. Other services with no Figma screen (leasing, insurance, taxes…) open as legacy overlays from their menu tiles.

## Who it is for

| User | Context | What they come to do |
|---|---|---|
| **Business owner / admin** | Office desk, laptop | Sets up the group, adds members, decides who can pay and who approves |
| **Finance staff (maker)** | Office desk, daily | Pays suppliers and salaries, settles bills, writes e-cheques |
| **Approver** | Desk or between meetings | Clears the pending queue: approves, or rejects with a reason |
| **Family / association member** | Home, occasional | Checks the balance and statement, makes the odd transfer |

Lao is the primary language; English, Chinese and Vietnamese are also available.

## Core concepts

- **Group** (OneBank): a named set of accounts and members. A user can belong to several groups and switches between them with the tabs in the top bar.
- **Account**: a real BCEL account added to the group from a personal account. The group can also hold two derived kinds:
  - a **main (virtual)** account, which sits on top of a real account;
  - a **shadow** account, which is a separate ledger.
  Any account can be locked, renamed with an alias, or removed.
- **Member**: a person in the group, added by the member code their app shows. They are the Owner, an Admin, or a Member.
- **Role / permission**: what a set of members may do on a set of accounts:
  - view only, or transact;
  - which functions they may use;
  - spending limits, per transaction and per day;
  - **approval levels**: each level needs either all of its approvers or at least N of them.
- **Pending authorization**: a transaction made under a role with approval levels waits until enough approvers agree. One rejection ends it, and the maker sees the reason.

## Screens

| Area | Route | Today |
|---|---|---|
| Login | — | QR login (scan with the BCEL One app) or username + password, against the core |
| Home | `/` | **Native**: spending chart, spending share, balances, shortcuts, services, week calendar |
| Messages | `/messages`, `/messages/:id` | **Native** on `viewtransactions`: the group's transactions and a receipt-style detail with Print / Share |
| Accounts | `/account` | **Native**: add from personal, open main or shadow, lock, alias, remove |
| Manage members | `/member` | **Native**: search and filter, see roles and accounts, remove; add a member by code, then set their permissions on the legacy role page |
| Edit group | `/group` | **Native**: picture (uploaded), name and description |
| Create OneBank | `/register` | **Native**: intro → terms → accounts → group details |
| Join / leave a group | `/group/join`, `/group/leave` | **Native**: show a join code and wait for the owner (socket); leave with a warning |
| Pending authorization | `/authorization`, `/authorization/history` | **Native**; approve / reject / cancel fall back to local data |
| Manage permissions | `/role` | **Native** on `getpermissions`: a role is created (`addpermission`, behind TWOFACTOR) or deleted, and read in a detail — the core has no command for changing one, so nothing edits a role. Creating falls back to local data while the core refuses it |
| Statement | `/statement` | **Native** on the core's own `STATEMENT/statement`: a date range walked page by page, searchable; exported as the PDF or Excel file the core renders, or drawn in the browser for a shadow account, which the core does not render |
| Transfer, international, ID card | `/transfer`, `/transfer/interbank`, `/transfer/idcard` | **Native**; submitting falls back to local data |
| Salary, E-Cheque | `/salary`, `/echeque` | **Native**; falls back to local data |
| Electricity, Water, Top-up | `/bill/electricity`, `/bill/water`, `/topup` | **Native**; paying falls back to local data |
| Account detail | `/accounts/detail` | **Native** on the group's `loadhome`: accounts by kind, totals per currency; a row opens its statement |
| Slip report | `/slips` | **Native** on `viewtransactions`: the group's transfers by account and date; a row opens its printable receipt |
| Destination accounts | `/beneficiaries` | **Native**: the saved recipients the transfer form offers; add, remove, favourite fall back to local data |
| Exchange / interest rates | `/rates/exchange`, `/rates/interest` | **Native**; the rates fall back to reference data dated when it was published |
| Term deposits, loans | `/term-deposits`, `/loans` | **Native**: list, terms, movements, and the loan's instalment schedule; fall back to reference data |
| Notification settings | `/settings/notifications` | **Native**: one switch per alert kind, saved per group; falls back to local data |
| Every other service | menu tile | Legacy overlay |

**Offline data.** When one of those commands is answered locally, a navy notice at the top of the screen says the bank did not answer and nothing on that screen was sent to the bank. Local data lasts for the browser tab and is cleared on logout. Once the core implements a command, the screen uses the core's answer with no change.

## Out of scope for this build

- **Real money movement for unmapped commands.** Approve / reject, transfers, bills, top-up, salary, e-cheque and the iBank screens (rates, deposits, loans, alerts, destination accounts) have no known command in the core contract here. Until they are mapped, what those screens do stays in the browser.
- **Unread state.** The contract has no read/unread flag, so Messages shows no unread badge.
- **No mobile app parity.** The mobile app is the separate `onebank-ui` repo.
