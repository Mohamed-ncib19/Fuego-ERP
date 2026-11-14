# Fuego — Business & Order Management (Concept v0.1)

> Desktop app for a shop that takes **commandes** (orders), tracks them from
> creation → confirmation → progress → delivery, prints **tickets**, and keeps
> the money picture clean: **avance** (advance payments), **incomes**, and
> **dépenses** (expenses).
>
> Built as an **Electron desktop app**, following the architecture, patterns
> and conventions of the reference project: `D:\School Management System`
> (iq-academy monorepo).

---

## 1. The idea in one paragraph

A small business (print shop / service shop / delivery-based shop) takes
customer orders every day. Each order has a description, a total price, and an
**advance (avance)** the customer pays up front. Once the advance is recorded
the order can be **confirmed**. The order is either **local** (customer picks
it up at the counter) or **online** (it must be delivered — address, delivery
fee). Every order gets an auto-numbered **ticket** the shop prints and hands
to the customer. The order moves through a **progress status** workflow
(pending → confirmed → in progress → ready → delivered). Money-wise, the app
tracks every **income** (advance + balance payments, ledger-style) and every
**expense (dépense)**, and shows the owner the real daily/monthly picture:
revenue, expenses, profit, pending balances, and orders still in progress.

---

## 2. Domain model (brainstorm)

### 2.1 Order (Commande) — the core entity

| Field | Notes |
|---|---|
| `ticket_no` | Auto-incrementing per-business, unique — e.g. `CMD-2026-0001`. Printed on the ticket. |
| `customer_name`, `customer_phone` | Stored on the order (fast counter workflow); a customers directory can come later. |
| `description` | Free text — what was ordered. Rich enough for a print job. |
| `order_type` | `local` (pickup at counter) or `online` (to deliver). |
| `delivery_address` | Required when `order_type = online`. |
| `delivery_fee` | Optional extra charge when `order_type = online`. |
| `total_amount` | The agreed price (excl. delivery fee, or incl. — locked decision to make). |
| `advance_amount` | Paid up front. Order can only be **confirmed** once advance ≥ minimum (locked rule to define). |
| `status` | `pending` → `confirmed` → `in_progress` → `ready` → `delivered` (+ `cancelled`). |
| `due_date` | Optional promise date. |
| `created_by`, `confirmed_by`, timestamps | Accountability like the reference audit pattern. |

**Status workflow** (event-sourced timeline, like the reference ledger):

```
pending ──confirm──► confirmed ──start──► in_progress ──finish──► ready ──handover──► delivered
   └────────────────────────────── cancel ──────────────────────────────► cancelled
```

Every transition is an `order_events` row (actor, note, timestamp) — the
timeline is the order's history, nothing is overwritten.

### 2.2 Money — advance, income, dépense

- **Ledger discipline (from the reference):** `payments` rows are immutable
  events (`advance`, `balance`, `refund`), never edited. The order's paid
  amount = sum of its payments. No float math — integer minor units (centimes)
  in the DB, `decimal.js` in code.
- **Income** = payments recorded (filterable by day/month, by order).
- **Dépense** = `expenses` table: category, amount, note, date, recorded_by.
- **Confirmed rule:** an order can only be confirmed after recording its
  advance payment (the confirmation action records both in one atomic step).
- **Delivered rule:** delivery only allowed when paid in full (balance = 0),
  or override by admin (decision to make).

### 2.3 Ticket

- Auto number + order details + advance paid / balance remaining + status.
- Printed from the app (print-friendly HTML/CSS, like the reference receipts).
- Reprint anytime from the order page.

### 2.4 Users & roles

Same pattern as the reference `users` table: `full_name`, `email` (unique,
trimmed+lowercased), `bcrypt password_hash`, `role`, `is_active`,
`tokens_valid_after` (logout-everywhere floor).

Proposed roles (Phase 1):

| Role | Can do |
|---|---|
| `super_admin` | Everything + user management + settings + audit |
| `staff` (employee) | Orders: create/confirm/progress; record payments; expenses: create only |

### 2.5 Dashboard

- Today: orders created / confirmed / ready / delivered, income vs dépense.
- KPIs: total revenue, total expenses, profit, outstanding balances (money the
  shop is owed on undelivered orders), advances held on unconfirmed work.
- Charts: revenue/expense curve per day/week/month, status distribution.

### 2.6 Supporting tables

- `audit_logs` — who/what/when + JSON diff (copied pattern from reference).
- `settings` — business name, currency, ticket header/footer, language.
- `counters` — atomic ticket numbering (reference `receipt_counters` pattern).

---

## 3. Architecture (Electron adaptation of the reference)

The reference is a browser portal (NestJS :3001 + Next.js :3000 + PostgreSQL).
For a **single-machine desktop app** we keep everything that made the
reference solid and swap the parts that don't fit Electron:

| Layer | Reference | Fuego (Electron) | Why |
|---|---|---|---|
| Shell | Browser | **Electron** (main + preload) | Desktop app, tray, printing |
| Frontend | Next.js 14 | **React 18 + Vite** | No SSR needed; Vite is the Electron standard |
| Backend | NestJS on :3001 | **NestJS embedded in the main process**, listens on `127.0.0.1:<port>` | Keeps 100% of the reference patterns: guards, envelope, DTO validation |
| Database | PostgreSQL portable | **SQLite (better-sqlite3) + Drizzle** | Zero install, one data file, same Drizzle DX |
| Auth | JWT access+refresh, httpOnly cookies | Same JWT model (cookie via embedded server, safeStorage fallback) | Same code shape |
| Money | `numeric` + decimal.js | Integer minor units + decimal.js | SQLite has no numeric type |
| Packaging | Inno Setup | **electron-builder** | Standard for Electron |
| Monorepo | pnpm workspaces `apps/*` + `packages/*` | Same shape | Familiarity + code sharing |

Workspace layout:

```
D:\fuego\
├─ apps\
│  ├─ desktop\      Electron main + preload (starts backend, opens window, printing)
│  ├─ backend\      NestJS API — auth, users, orders, payments, expenses, settings, audit
│  └─ renderer\     React + Vite + Tailwind — login, dashboard, orders, finance, settings
└─ packages\
   └─ shared\       enums + types (UserRole, OrderStatus, OrderType, …)
```

Kept from the reference (conventions we copy verbatim):

- Uniform response envelope `{ data, meta, error }` + AllExceptionsFilter.
- Global ValidationPipe (whitelist + transform) — DTOs everywhere.
- ApiKeyGuard + JwtAuthGuard + RolesGuard with `@Roles()`.
- Audit service on every mutating endpoint.
- bcryptjs hashing, refresh-token rotation, `tokens_valid_after` floor.
- TanStack Query + axios client (401 → login), Zustand auth store,
  React Hook Form + Zod shared schemas, lucide-react, framer-motion.
- Tailwind with CSS-variable design tokens + dark mode.
- French-first UI (reference is French; the owner's vocabulary — commande,
  avance, dépense — is French).

---

## 4. Build phases

| Phase | Scope | Status |
|---|---|---|
| **0 — Foundation** | Monorepo, Electron shell, embedded NestJS + SQLite, auth (login/JWT), admin user CRUD, audit log, **first-run admin creation** | ✅ **DONE — 34/34 API tests passed, Electron window verified** |
| **1 — Orders** | Order CRUD + workflow (confirm/cancel/progress), payments ledger, advance rule, ticket printing, order search/list filters, Kanban, table, A4 ticket | ✅ **DONE — 20/20 unit tests, full smoke test passing, complete UI & ticket printing** |
| **2 — Finance** | Expenses CRUD + categories, payments journal, live financial dashboard KPIs & 14-day cashflow trend, profit calculation in millimes | ✅ **DONE — 27/27 unit tests, full smoke test passing, complete 3-tab finances UI** |
| **3 — Polish** | Settings screen, audit viewer UI, database backup & restore (.db snapshot), full monorepo build verification | ✅ **DONE — Audit trail viewer, SQLite hot backup/restore verified, 100% build passing** |

### Phase 0 in detail (what we build first)

1. Scaffold monorepo + Electron shell (window, loads renderer, boots backend).
2. Drizzle schema: `users`, `audit_logs`, `settings`, `counters` (+ placeholder tables for Phase 1).
3. Auth module (copied shape from reference): login, me, refresh, logout,
   change-password, login-throttling, JWT access+refresh.
4. Users module (admin): list/search/create/update/reset-password/deactivate —
   with the reference safety rules (can't demote self, last-active-admin guard,
   admin-password re-auth to create another admin, audit on everything).
5. Renderer: login page + dashboard shell (sidebar/navbar) + settings→users
   management screen.
6. First-run wizard: if no user exists → create the first super_admin
   (business name + admin email + password, like the reference installer).

---

## 5. Decisions locked / open

**Locked (following the reference):**
- Monorepo pnpm workspaces, TypeScript strict, NestJS + Drizzle.
- Uniform envelope, guards, audit on mutations, ledger-style money.
- JWT access + refresh with rotation + revocation floor.
- French UI.

**Open (to decide before Phase 0 build):**
1. Currency to display (DZD? MAD? EUR?).
2. Roles: `super_admin` + `staff` only, or also `admin`?
3. Is `total_amount` including or excluding the delivery fee?
4. Can an order be confirmed without an advance (0 avance) or is advance mandatory?
5. Who can record expenses — admin only or staff too?

### Decisions made — Nov 12 2026

| Question | Decision |
|---|---|
| Currency | **TND** (Tunisian dinar, "DT") — stored as integer **millimes** (1 DT = 1000), displayed with 3 decimals like `12,500 DT` |
| Roles | `super_admin` (everything, incl. users/settings) + `staff` (orders, payments, expenses) |
| Advance | **Optional** — an order can be confirmed with 0 avance; the shop decides freely |
| UI language | **French** (hardcoded, no toggle — matches the owner's vocabulary) |
