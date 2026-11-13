# Phase 1 — Commandes (orders): design document

Date: 2026-11-13 · Status: draft for approval · Supersedes the Phase 1 rows of `PROJECT.md` §2/§4 where they differ.

## 1. Intent & why

Fuego is a desktop app for a small Tunisian shop that takes **commandes**
(orders), confirms them against an **avance** (advance payment), tracks them to
delivery, prints a numbered **ticket** for the client, and keeps every dinar
accounted for. Phase 0 shipped the Electron + NestJS + SQLite foundation, auth,
users, and audit. Phase 1 delivers the reason the shop bought the app: creating
orders at the counter in under a minute, following their progress, and knowing
exactly how much money is still owed on each one.

The owner's vocabulary is French: commande, article, avance, reste à payer,
livraison. Every screen label and API error message is French.

## 2. Goals, non-goals, anti-goals

**Goals**
- Create/edit an order with customer info, article lines (name, qty, unit
  price), optional description, order type `local`/`online` (address + delivery
  fee), optional due date.
- Money discipline: advance = first payment; the client may pay the rest in as
  many payments as needed, whenever; "reste à payer" is always exact.
- Status workflow `pending → confirmed → in_progress → ready → delivered`
  (+ `cancelled`) with an append-only timeline (who, when, note).
- Auto ticket number `CMD-2026-0001` style, printable anytime, reprintable.
- Order list with search (ticket no, client, phone) and filters (status, type,
  date range), paginated — in **two views**: a dense table and a kanban board
  by status, plus quick saved views (Aujourd'hui, En retard, À livrer) and
  one-click status advance from the list.
- **Draft-friendly creation**: a "Nouvelle commande" button lives in the navbar
  (always reachable, also Ctrl+N) and the form can be saved with partial info —
  even only a note — to be finished later; incomplete orders are flagged until
  articles are added.
- Roles: `staff` and `super_admin` both run orders/payments; force-delivering an
  unpaid order is `super_admin` only.

**Non-goals (explicitly out of this phase)**
- No articles/products catalog (lines are typed freely per order).
- No customer directory, no multi-currency, no taxes/TVA, no discounts.
- No expenses/income views (Phase 2), no backups/installer (Phase 3).
- No order deletion — cancellation is the only exit.

**Anti-goals (failure even if it "works")**
- Any float math on money; any way to edit or delete a payment; any state
  change that doesn't appear in the timeline; a reste à payer that can disagree
  with `grand_total − paid`.

## 3. Constraints (locked from Phase 0 / PROJECT.md)

- Monorepo `apps/*` + `packages/*`, pnpm, TypeScript strict.
- Backend: NestJS 12 embedded in the Electron main process, better-sqlite3 +
  Drizzle, uniform envelope `{ data, meta, error }`, Global ValidationPipe
  (whitelist + transform), ApiKeyGuard → JwtAuthGuard → RolesGuard, audit on
  every mutation, French error messages.
- Money: integer **millimes** in DB (1 DT = 1000), decimal.js at the edges,
  displayed `12,500 DT` (fr format).
- Frontend: React 19 + Vite + TanStack Query + RHF + Zod (shared schemas from
  `packages/shared`), Tailwind tokens, dark mode, French UI.
- SQLite has no `::int` casts — dialect SQL lives in `apps/backend/src/db/sqlite.util.ts`.

## 4. Approaches considered

**State management for the workflow**
- *A. Status column + append-only `order_events` log* (chosen): the row carries
  the current status; every transition also appends an immutable event. Queries
  stay trivial (`WHERE status = …`), the timeline stays honest. Matches the
  reference system's ledger style.
- *B. Full event sourcing* (state derived from replaying events): rejected —
  meaningful complexity, zero benefit at this scale, harder list queries.
- *C. Payments as editable rows*: rejected — payments are immutable ledger
  events; corrections happen by adding compensating rows (`refund`), including
  full refunds of delivered/cancelled orders via a "Rembourser la totalité"
  quick action.

**Delivery fee handling** (owner decision, 13 Nov 2026): dedicated
`delivery_fee` field added on top of the article total (not a pseudo-article),
so Phase 2 can report article revenue vs delivery revenue separately.

**Article lines** (owner decision, 13 Nov 2026): every order has article lines
with individual prices — the total is computed from them, not typed by hand.
A flat-price service is one line, qty 1. The free-text description survives as
an optional note.

**Ticket printing**: print-optimized route in the renderer (`/commandes/:id/ticket`,
`@media print` CSS, `window.print()` → Electron print dialog). A hidden Electron
print window is unnecessary; the reference system does the same via HTML/CSS.

## 5. Domain design

### 5.1 Tables (additive-only schema change)

**Schema reach:** the shipped desktop database gets its schema from
`ensureTables()` (boot-time `CREATE TABLE IF NOT EXISTS` in `db.service.ts`) —
Phase 1 extends that file with the four new tables. There is no migration
runner in a desktop app; `drizzle-kit push` remains a dev convenience only.
Drizzle schema definitions stay the typed mirror of the DDL.

`orders`
| column | type | notes |
|---|---|---|
| id | text uuid PK | generated in code |
| ticket_no | text, unique index | `CMD-<year>-<4-digit seq>`, e.g. `CMD-2026-0007` |
| ticket_year / ticket_seq | int | raw components; year-scope counter |
| customer_name | text, not null | |
| customer_phone | text | optional |
| description | text | optional note |
| order_type | text not null | `local` \| `online` |
| delivery_address | text | required iff `online` |
| delivery_fee | int millimes, not null default 0 | must be 0 when `local` |
| total_amount | int millimes, not null | Σ(qty × unit_price), maintained in code |
| status | text not null default `pending` | see 5.3 |
| due_date | text (`YYYY-MM-DD`) | optional promise date |
| created_by / confirmed_by | text → users.id | confirmed_by nullable |
| created_at / updated_at | epoch-ms | app-side defaults |

Indexes: unique `ticket_no`; `status`, `created_at`, `customer_name` for list filters.

`order_items`
| column | type | notes |
|---|---|---|
| id | text uuid PK | |
| order_id | text FK → orders | on delete cascade |
| position | int | display order |
| label | text not null | article name |
| quantity | int not null default 1 | ≥ 1 |
| unit_price | int millimes not null | ≥ 0 |

`order_events` (append-only, never updated)
| column | type | notes |
|---|---|---|
| id, order_id FK | | |
| type | text | `created` \| `edited` \| `confirmed` \| `started` \| `readied` \| `delivered` \| `cancelled` \| `note` |
| payload | text JSON | diffs (`{before, after}`), notes, `{forced: true}` meta |
| actor_id / actor_label | text | |
| created_at | epoch-ms | |

`payments` (append-only, never updated)
| column | type | notes |
|---|---|---|
| id, order_id FK | | |
| kind | text | `advance` \| `balance` \| `refund` |
| amount | int millimes not null | always ≥ 1; refund reduces paid |
| note | text | e.g. "espèces", "chèque #123" |
| recorded_by / recorded_by_label | text | |
| created_at | epoch-ms | |

### 5.2 Money rules

- `grand_total = total_amount + delivery_fee`.
- `paid = Σ(amount | kind ∈ {advance, balance}) − Σ(amount | kind = refund)`.
- `reste = grand_total − paid`, floored at 0 for display; an overpayment keeps
  the raw negative reste visible in the API (data honesty) while the ticket
  shows the credit as "Trop-perçu".
- All computations integer; `decimal.js` only for rendering.

### 5.3 Workflow rules

| Action | From | To | Guards |
|---|---|---|---|
| confirm | pending | confirmed | one transaction: optional advance payment row (amount ≥ 0; 0 = no payment row) + event + status. **Requires ≥ 1 article** (`total_amount > 0`) — a note-only draft stays pending; French error: "Ajoutez au moins un article avant de confirmer" |
| start | confirmed | in_progress | staff+ |
| ready | in_progress | ready | staff+ |
| deliver | ready | delivered | `reste <= 0` (overpaid = credit, deliverable), **or** `super_admin` passes `force: true` + note → event payload `{forced: true}`; the debt stays visible |
| cancel | any except delivered | cancelled | staff+; event notes the reste; refunds are separate `refund` payment rows, never automatic |
| edit | pending | — | all fields freely |
| edit | confirmed+ | — | customer/description/address/due_date freely; **articles or delivery_fee change appends an `edited` event** with `{before, after}` totals; editing a `delivered` order's money fields is blocked |

Illegal transitions return 409 with a French message ("Cette commande est déjà
confirmée"). Every mutating endpoint writes an audit log row and, where
applicable, an order event.

**Payments per status** (owner decision 13 Nov 2026: money can be taken from
creation onward):

| Order status | advance | balance | refund |
|---|---|---|---|
| pending | ✅ (early payment) | ✅ | ✅ |
| confirmed / in_progress / ready | ✅ | ✅ | ✅ |
| delivered | ❌ | ❌ | ✅ |
| cancelled | ❌ | ❌ | ✅ |

- A refund may never exceed what was paid (`refund ≤ paid`).
- `confirm` does **not** duplicate money already taken while pending: it records
  only the `advance_amount` provided in that call (0/absent = no payment row)
  and flips the status. "Avance payée" on the ticket is simply the sum of
  advance+balance payments to date.

### 5.4 Ticket numbering

Atomic in one better-sqlite3 transaction: upsert counter row
(`name = 'ticket_<YYYY>'`), `value += 1`, insert order with
`ticket_no = 'CMD-' + year + '-' + pad(value, 4)`. Concurrent-safe; sequence
restarts each year.

### 5.5 Roles recap (Phase 1 surface)

- `staff`: create/edit orders, confirm, progress transitions, cancel, record
  payments (incl. refunds), print tickets.
- `super_admin`: everything above + force-deliver; users/settings remain
  super_admin-only (unchanged from Phase 0).

## 6. API surface (all under `/api`, envelope + guards as Phase 0)

| Method & path | Body | Notes |
|---|---|---|
| `POST /orders` | `{customer_name?, customer_phone?, description?, order_type? (default local), delivery_address?, delivery_fee?, due_date?, items?: [{label, quantity, unit_price}]}` | **partial creation allowed** (owner decision 13 Nov 2026): every field optional, but at least one of customer_name/description/items must be present; creates `pending` order + `created` event; returns full order |
| `GET /orders` | query: `status?, order_type?, search?, from?, to?, limit?, page?` | `from`/`to` filter on **created_at** ("what came in today"); search matches ticket_no / customer_name / phone; meta: `{page, limit, total, totalPages}` (names follow the existing `PageMeta` convention) |
| `GET /orders/:id` | — | order + items + payments + events + computed `paid`, `reste` |
| `PATCH /orders/:id` | any editable subset incl. `items` | rules per 5.3 |
| `POST /orders/:id/confirm` | `{advance_amount?, note?}` | atomic per 5.3 |
| `POST /orders/:id/start` · `/ready` · `/deliver` · `/cancel` | `{note?}` (deliver adds `force?`) | deliver: `force` super_admin-only |
| `POST /orders/:id/payments` | `{kind: advance\|balance\|refund, amount, note?}` | immutable row; availability per status matrix (5.3); refund allowed only if `paid ≥ amount` |
| `POST /orders/:id/notes` | `{note}` | timeline note without state change |

Ticket data is served by `GET /orders/:id` (renderer composes the print view).

Validation (DTO + Zod shared schemas): `online` ⇒ `delivery_address` required;
`local` ⇒ `delivery_fee` absent/0; at least one of customer_name/description/
items on create; `quantity ≥ 1`; amounts ≥ 0, integers in millimes; French
field errors.

Ticket printing is available from `confirmed` onward — a draft (no articles)
cannot be printed; the button is disabled with a tooltip.

## 7. Renderer screens (French, existing design tokens)

- **`/commandes` (list)** — two view modes, **Tableau** (default: ticket_no,
  client, type badge, total, reste, statut badge, due date) and **Kanban**
  (columns En attente / Confirmée / En cours / Prête, cards with client, total,
  reste, due date; one-click "advance status" button on each card — drag-and-drop
  is explicitly deferred). Quick saved views: **Aujourd'hui**, **En retard**
  (due date passed, not delivered), **À livrer** (online). Search box; status/type
  filters; date range; pagination; pending orders without articles carry an
  **« Incomplète »** badge. "Nouvelle commande" button here and in the navbar
  (global, Ctrl+N shortcut). Replaces the Phase 0 placeholder.
- **New/Edit order** — one form: client, type toggle (local/online), article rows with add/remove + live totals footer, delivery fields when online, due date, description; footer actions: **Enregistrer** (pending) and **Confirmer** (opens advance field, atomic confirm). Zod schema shared with backend.
- **`/commandes/:id` (detail)** — header (ticket_no, statut badge, client, reste à payer highlight), state action buttons, "Enregistrer un paiement" modal (kind/amount/note) with a **"Rembourser la totalité"** shortcut pre-filling the full paid amount as a refund, articles table, payments list, timeline, "Imprimer le ticket" (disabled before confirmation).
- **`/commandes/:id/ticket`** — print-only **A4 layout** (owner decision: office
  printer paper): business name from settings, ticket_no, client, article lines,
  livraison, TOTAL / Avance / RESTE, statut + due date, footer from
  `settings.ticket_footer`; `@page` A4 rules, `@media print` + `window.print()`.
- Dashboard sidebar: "Commandes" becomes live; "Finances" stays a Phase 2 placeholder.

Status labels: pending=En attente, confirmed=Confirmée, in_progress=En cours, ready=Prête, delivered=Livrée, cancelled=Annulée.

## 8. Left to the builder (explicitly delegated)

- Exact pagination defaults (suggest 20/page) and empty-state copy.
- Event `payload` JSON exact shape per type (suggestion above).
- Overpayment ("Trop-perçu") presentation detail on the ticket.
- Order of buttons/detail sections to fit the existing visual language.

## 8bis. Calls settled during the builder check (marked per process)

These were settled by the author against the repo/conversation; a builder
should follow them as written:

1. **Schema reach** — extend boot-time `ensureTables()`; no migration runner (§5.1).
2. **List date filters** — `from`/`to` apply to `created_at` (§6).
3. **Pagination names** — `limit`/`page` matching the existing `PageMeta` type (§6).
4. **Deliver guard** — `reste <= 0` so an overpaid (credit) order is deliverable by staff (§5.3).
5. **Payments matrix** — money from creation onward; refunds only on delivered/cancelled; refund ≤ paid (§5.3).
- Migration file naming/numbering per the existing Drizzle setup.

## 9. Testing intent (feeds the plan)

- Unit/contract tests (Vitest, SQLite in-memory): numbering atomicity, money
  invariants (reste), transition legality, refund > paid rejection,
  online/local validation, role matrix (staff vs super_admin force-deliver).
- API smoke extension of `scripts/test-phase0.mjs` style: full order lifecycle
  via HTTP with envelope + auth checks.
