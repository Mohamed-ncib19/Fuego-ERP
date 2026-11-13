# Phase 1 — Commandes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the orders domain end-to-end — article-priced commandes with a payments ledger, status workflow, numbered printable A4 tickets, and a two-view (table + kanban) French order screen.

**Architecture:** NestJS module `orders` (service/controller/DTO) over Drizzle/SQLite following the Phase 0 `users` module shape; four new tables reached through boot-time `ensureTables()`; money stays integer millimes with pure helpers in `orders.money.ts`; renderer pages under `/commandes/*` mirroring the existing page/client patterns.

**Tech Stack:** NestJS 12, better-sqlite3 + Drizzle, class-validator DTOs, Vitest (new), React 19 + TanStack Query + RHF, shared types from `@fuego/shared`.

**Spec:** `docs/superpowers/specs/2026-11-13-phase1-orders-design.md` (the plan argues from it — executors read both).

## Global Constraints

- Money: integer **millimes** everywhere; never floats; renderer displays via `formatMillimes` (`apps/renderer/src/lib/format.ts`) → `12,500 DT`. No decimal.js.
- All UI copy and API error messages in **French**.
- Envelope `{ data, meta, error }`; guard chain ApiKey → Jwt → Roles; no `@Roles` annotation = any authenticated user (orders/payments are staff+admin; `force` is service-checked super_admin).
- Audit via `AuditService.record()` on every mutation; never throws upward.
- Timeline: `order_events` append-only; `payments` append-only (no update/delete endpoints).
- SQLite dialect SQL only inside `sql`\`...\`` templates (no `::int` casts); multi-step writes inside `this.db.client.transaction(...)`.
- Server class-validator DTOs are authoritative for API rules; renderer Zod mirrors only field-level shapes.
- New backend dev dependency allowed: `vitest` only.

## Review Focus

Failure modes the spec implies but no single task's happy path exercises, each pinned by a test:

1. **Reste disagrees with grand_total − paid** → invariant tests in Task 2 (`orders.money.spec.ts`) and the refund path in Task 6.
2. **Advance recorded twice** (client pays while pending, then confirm also records) → Task 5, "confirm does not duplicate pending payments".
3. **Refund exceeds paid** → Task 6 test refuses with French message.
4. **Draft confirmed with 0 articles** → Task 5 test refuses ("Ajoutez au moins un article avant de confirmer").
5. **Overpaid order not deliverable** (strict `== 0` would block a credit) → Task 5 test delivers at `reste <= 0`.

---

### Task 1: Shared types, schema tables, boot-time DDL, Vitest harness

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/backend/src/db/schema.ts` (append after `counters`)
- Modify: `apps/backend/src/db/db.service.ts` (`ensureTables`)
- Modify: `apps/backend/package.json` (devDep `vitest`, scripts `"test": "vitest run"`)
- Create: `apps/backend/vitest.config.ts` (`test.include: ["src/**/*.spec.ts"]`, environment `node`)
- Test: `apps/backend/src/db/db.service.spec.ts`

**Interfaces:**
- Produces (shared, used by every later task): `OrderItem { id, order_id, position, label, quantity, unit_price }`, `OrderEvent { id, order_id, type: OrderEventType, payload: string | null, actor_id, actor_label, created_at }`, `Payment { id, order_id, kind: PaymentKind, amount, note, recorded_by, recorded_by_label, created_at }`, `OrderMoney { total_amount, delivery_fee, grand_total, paid, reste }`, `OrderSummary` (order fields + `OrderMoney` + `items_count` + `created_at`), `OrderDetail` (order fields + `OrderMoney` + `items`, `payments`, `events`), `ORDER_EVENT_TYPES`/`OrderEventType`, `ORDER_EVENT_LABELS` (created:"Création", edited:"Modification", confirmed:"Confirmée", started:"Démarrée", readied:"Prête", delivered:"Livrée", cancelled:"Annulée", note:"Note"), `ORDER_TYPE_LABELS` (local:"Local", online:"En ligne"), `PAYMENT_KINDS`, `PAYMENT_KIND_LABELS` (advance:"Avance", balance:"Solde", refund:"Remboursement").
- Produces (drizzle): tables `orders`, `orderItems`, `orderEvents`, `payments` per spec §5.1 (unique `orders_ticket_no_key`, indexes on `status`, `created_at`, `customer_name`).

- [ ] **Step 1: Write the failing test** — `db.service.spec.ts`: open a `:memory:` DB via `new DbService()` (with `process.env.DB_PATH = ":memory:"` set before first access), assert `sqlite_master` contains `orders`, `order_items`, `order_events`, `payments` and the unique index `orders_ticket_no_key`.
- [ ] **Step 2: Run** `pnpm -C apps/backend test` → expected FAIL (no vitest config / missing tables).
- [ ] **Step 3: Implement** — shared types/constants; drizzle tables (uuid text PK, epoch-ms `tsMs` timestamps, `delivery_fee` int default 0, `status` text default "pending"); `ensureTables` DDL mirroring them exactly (FKs with `ON DELETE CASCADE` on the three child tables).
- [ ] **Step 4: Run** `pnpm -C apps/backend test` → PASS.
- [ ] **Step 5: Commit** `feat(backend): order/payment/event schema + shared types + vitest`.

### Task 2: Money core — `orders.money.ts` pure functions

**Files:**
- Create: `apps/backend/src/orders/orders.money.ts`
- Test: `apps/backend/src/orders/orders.money.spec.ts`

**Interfaces:**
- Produces: `itemsTotal(items: { quantity: number; unit_price: number }[]): number`, `grandTotal(total: number, deliveryFee: number): number`, `paidAmount(payments: { kind: PaymentKind; amount: number }[]): number` (refund subtracts), `reste(grand: number, paid: number): number` (raw, may go negative = overpaid credit), `formatTicketNo(year: number, seq: number): string` → `CMD-2026-0007`, `counterName(year: number): string` → `ticket_2026`.

- [ ] **Step 1: Write the failing tests** — cases: sum of qty×price; refund lowers paid (advance 20000, balance 5000, refund 3000 → paid 22000); negative reste preserved for overpay; `formatTicketNo(2026, 7) === "CMD-2026-0007"`; seq ≥ 10000 keeps full width (no truncation).
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** — plain integer arithmetic only.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(backend): order money + ticket-number helpers`.

### Task 3: Create + list endpoints (ticket numbering atomic, filters, quick views param)

**Files:**
- Create: `apps/backend/src/orders/dto/orders.dto.ts`, `orders.service.ts`, `orders.controller.ts`, `orders.module.ts`
- Modify: `apps/backend/src/app.module.ts` (import `OrdersModule`)
- Test: `apps/backend/src/orders/orders.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 tables/types, Task 2 money helpers, `DbService`/`AuditService`/`CurrentUser` actor `{ id, full_name, role }` (same shape as `users.service.ts`).
- Produces (endpoints, all authenticated):
  - `POST /orders` body `CreateOrderDto` → 201 `OrderDetail`
  - `GET /orders?status&order_type&search&from&to&overdue&limit&page` → `{ data: OrderSummary[]; meta: PageMeta }`
  - Validation rules (service, French messages): create needs ≥ 1 of customer_name/description/items ("Renseignez au moins un client, une description ou un article"); `online` ⇒ `delivery_address` ("L'adresse de livraison est obligatoire pour une commande en ligne"); `local` ⇒ `delivery_fee` coerced to 0.
- `CreateOrderDto` fields all optional (spec: partial creation): `customer_name?` (≤120), `customer_phone?` (≤30), `description?` (≤2000), `order_type?` (`IsIn(["local","online"])`, default local), `delivery_address?` (≤300), `delivery_fee?` (`IsInt` ≥0), `due_date?` (`YYYY-MM-DD` string), `items?` (`@ValidateNested({each}) @Type(() => OrderItemDto)`; `OrderItemDto`: `label` 1..200 string, `quantity` `IsInt` ≥1, `unit_price` `IsInt` ≥0).
- List params: `from`/`to` = `YYYY-MM-DD`, filter `created_at` between day bounds; `overdue=1` → `due_date IS NOT NULL AND due_date < today AND status NOT IN (delivered, cancelled)`; `status` accepts one value **or comma-separated values** ("pending,confirmed") — needed by the "À livrer" quick view and the kanban columns; `search` → LIKE on lower(ticket_no)/customer_name/customer_phone; default limit 20, max 200 (mirror `users.service.listUsers`).
- List row money via correlated subqueries in `sql`\`\``: `paid` = `COALESCE(SUM(CASE WHEN kind='refund' THEN -amount ELSE amount END),0)` over `payments` for the order; `items_count` = count of `order_items`; `grand_total = total_amount + delivery_fee`; `reste = grand_total - paid`.
- Service methods (later tasks extend): `createOrder(dto, actor): Promise<OrderDetail>`, `listOrders(params)`.
- `createOrder` transaction: upsert counter (`INSERT INTO counters(name, value) VALUES(?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1` — returns the new value), insert order (`ticket_no` from Task 2 helpers, `total_amount` = itemsTotal, `status` "pending"), insert items with `position` = array index, insert `created` event (`payload`: `{order_type, total_amount, delivery_fee, grand_total, items_count}`), audit `order.created` — all inside one `db.client.transaction`.

- [ ] **Step 1: Write the failing tests** — (a) create full order → returns `OrderDetail` with `ticket_no === "CMD-2026-0001"`, items persisted with positions, `created` event present, audit row written; (b) second create → `CMD-2026-0002`; (c) three concurrent-ish sequential creates under two "years" — counter name per year restarts at 0001; (d) create with nothing set → 400 French message; (e) online without address → 400 French message; (f) list filters by status/type/search/"from"/"to"/overdue and paginates (limit 1, page 2 → meta.total correct).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** service/controller/module/DTOs per interfaces above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(backend): create + list orders with atomic ticket numbering`.

### Task 4: Detail + edit rules

**Files:**
- Modify: `apps/backend/src/orders/orders.service.ts`, `orders.controller.ts`, `dto/orders.dto.ts` (add `UpdateOrderDto`)
- Test: `apps/backend/src/orders/orders.service.spec.ts` (append)

**Interfaces:**
- Produces: `getOrder(id): Promise<OrderDetail>` (404 "Commande introuvable") — money computed with the Task 2 helpers (`itemsTotal`, `grandTotal`, `paidAmount`, `reste`) from the loaded payments, not a second SQL expression; `updateOrder(id, dto: UpdateOrderDto, actor): Promise<OrderDetail>`; `PATCH /orders/:id`; `GET /orders/:id`.
- `UpdateOrderDto` = `CreateOrderDto` shape, all optional. Replace-items semantics: if `items` present, the array replaces all items (positions reindexed, totals recomputed); if absent, items untouched.
- Edit rules (spec §5.3), enforced in the service:
  - While `pending`: every field incl. `order_type` is editable.
  - From `confirmed` onward: `customer_name`, `customer_phone`, `description`, `delivery_address`, `due_date` editable freely; `items` and `delivery_fee` editable but each change appends an `edited` event with payload `{ before: {total_amount, delivery_fee, grand_total}, after: {...} }`; `order_type` is **not** editable after confirmation (409 "Le type de commande n'est plus modifiable après confirmation").
  - `delivered`/`cancelled`: money-field edits (`items`, `delivery_fee`) → 409 "Une commande livrée ou annulée ne peut plus être modifiée au niveau financier"; other fields remain editable.
  - A `PATCH` that changes nothing writes no event and no audit row.
- Audit: `order.updated` with `prev_values`/`new_values` (changed fields only).

- [ ] **Step 1: Write the failing tests** — (a) detail returns items+payments+events+computed money; (b) 404 French; (c) pending full edit incl. items + type change; (d) confirmed edit of items appends `edited` event with before/after totals and updates `total_amount`; (e) confirmed edit of customer only → no `edited` event; (f) delivered money edit → 409; (g) unchanged PATCH → no event, no audit.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(backend): order detail + edit rules with amendment events`.

### Task 5: Workflow transitions + notes

**Files:**
- Modify: `apps/backend/src/orders/orders.service.ts`, `orders.controller.ts`, `dto/orders.dto.ts` (add `ConfirmOrderDto`, `TransitionDto`)
- Test: `apps/backend/src/orders/orders.service.spec.ts` (append)

**Interfaces:**
- Produces (controller, each `POST /orders/:id/<action>` returning `OrderDetail`):
  - `confirmOrder(id, dto: { advance_amount?: number; note?: string }, actor)`
  - `startOrder(id, dto: { note?: string }, actor)` — from `confirmed`
  - `readyOrder(id, dto: { note?: string }, actor)` — from `in_progress`
  - `deliverOrder(id, dto: TransitionDto, actor)` — from `ready`; requires `reste <= 0` unless (`dto.force` and `actor.role === "super_admin"`); staff with `force` → 403 "Seul un administrateur peut forcer la livraison"
  - `cancelOrder(id, dto: TransitionDto, actor)` — from any of pending/confirmed/in_progress/ready
  - `addNote(id, dto: { note: string }, actor)` — any status; event `note`
- Guards (French 409s): illegal transition "Transition impossible depuis le statut actuel"; confirm without items "Ajoutez au moins un article avant de confirmer".
- `confirmOrder` transaction: requires ≥1 item; records `advance` payment only when `advance_amount > 0` (never duplicates payments already taken while pending); sets `status="confirmed"`, `confirmed_by=actor.id`; event `confirmed` payload `{advance_amount, note}`; audit `order.confirmed`. Other transitions: event (`started`/`readied`/`delivered` with `{note, forced?}` or `{note, forced: true, reste_at_delivery}` / `cancelled` with `{note, reste}`) + audit.
- Non-force `deliver` also sets the same event shape minus `forced`.

- [ ] **Step 1: Write the failing tests** — legality matrix (confirm only from pending; start from confirmed; ready from in_progress; deliver from ready; cancel not from delivered — each wrong hop 409); confirm requires article; confirm with `advance_amount` writes a `payments` row and is included in `paid`; **pending payment + confirm(0/absent) does not double-record**; deliver blocks at positive reste (409 "Le reste à payer doit être soldé avant la livraison"), delivers at 0, delivers at negative (overpaid), staff `force` → 403, admin `force` → delivered + event `{forced: true}`; cancel stores `reste` in event; note appends `note` event.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(backend): order workflow transitions with guards`.

### Task 6: Payments endpoint (status matrix, refund cap)

**Files:**
- Modify: `apps/backend/src/orders/orders.service.ts`, `orders.controller.ts`, `dto/orders.dto.ts` (add `PaymentDto`)
- Test: `apps/backend/src/orders/orders.service.spec.ts` (append)

**Interfaces:**
- Produces: `addPayment(id, dto: { kind: PaymentKind; amount: number; note?: string }, actor): Promise<OrderDetail>`; `POST /orders/:id/payments`.
- `PaymentDto`: `kind` `IsIn(PAYMENT_KINDS)` ("Type de paiement invalide"), `amount` `IsInt` ≥1 ("Le montant doit être un entier positif"), `note?` ≤300.
- Status matrix (French 409 "Ce type de paiement n'est pas autorisé pour une commande <statut>"): `advance`/`balance` allowed on pending/confirmed/in_progress/ready; only `refund` on delivered/cancelled.
- `refund > paid` → 400 "Le remboursement dépasse le montant payé". Row: `{ id, order_id, kind, amount, note, recorded_by, recorded_by_label: actor.full_name, created_at }`; audit `order.payment_recorded` with `{kind, amount, reste_after}`.

- [ ] **Step 1: Write the failing tests** — advance on pending OK; balance on delivered → 409; refund on cancelled OK; refund > paid → 400 with exact message; refund ≤ paid OK and `reste` recomputed; payments list immutable (detail shows all rows); overpaid state reachable (advance > grand) and visible as negative `reste` in detail.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(backend): immutable payments ledger with status matrix`.

### Task 7: HTTP smoke test for the whole lifecycle

**Files:**
- Create: `scripts/test-phase1.mjs` (mirror the boot/call/check pattern of `scripts/test-phase0.mjs`; separate login session)
- Modify: `README.md` (one line: `pnpm test:phase1`, requires dev backend on 3220)
- Modify: `package.json` (root: `"test:phase1": "node scripts/test-phase1.mjs"`)

- [ ] **Step 1: Write** the smoke script: login → create partial order (note only) → PATCH items → confirm with avance → payment balance → start → ready → deliver refused (reste > 0) → settle → deliver OK → refund full → ticket_no format check → list filters (status/search) → staff role: login as staff (create via admin first) can confirm/pay, force-deliver denied (403) → envelope shape checks (`data`/`meta`/`error` French messages).
- [ ] **Step 2: Run** `pnpm dev` (backend :3220, dev API key) then `pnpm test:phase1` → all checks pass (fix service bugs surfaced; rerun Task 3–6 specs if touched).
- [ ] **Step 3: Commit** `test(api): phase 1 order lifecycle smoke`.

### Task 8: Renderer API client + orders list (table view)

**Files:**
- Create: `apps/renderer/src/lib/api/orders.api.ts`
- Create: `apps/renderer/src/pages/orders-list.tsx`
- Create: `apps/renderer/src/components/orders/status-badge.tsx`, `type-badge.tsx`
- Modify: `apps/renderer/src/App.tsx` (routes `/commandes`, replace `/orders` route+placeholder import)
- Modify: `apps/renderer/src/components/layout/dashboard-shell.tsx:22` (nav item `to: "/commandes"`, `soon: false`)
- Modify: `apps/renderer/src/pages/placeholders.tsx` (drop `OrdersPlaceholderPage`)

**Interfaces:**
- Consumes: `ordersApi` mirrors `users.api.ts` unwrap pattern; TanStack Query keys `["orders", params]` / `["order", id]`.
- Produces: `export const ordersApi = { list, get, create, update, confirm, start, ready, deliver, cancel, payment, note }` typed from `@fuego/shared` (`OrderSummary`, `OrderDetail`, `PageMeta`); `StatusBadge({status})`, `TypeBadge({orderType})` used by list/kanban/detail/ticket.
- List page (table mode): columns Ticket / Client / Type / Total / Reste / Statut / Due; search input (debounced), status select, type select, date range (`from`/`to`), quick views chips (Aujourd'hui → today bounds; En retard → `overdue=1`; À livrer → `order_type=online&status=pending,confirmed,in_progress,ready`), pagination; « Incomplète » badge when `items_count === 0 && status === "pending"`; "Nouvelle commande" button → `/commandes/new`.
- Verify: `pnpm -C apps/renderer run build` clean.

- [ ] **Step 1: Implement** the above (no renderer test harness exists — verification is typecheck + build + smoke against the dev backend).
- [ ] **Step 2: Run** `pnpm -C apps/renderer run typecheck && pnpm -C apps/renderer run build` → clean.
- [ ] **Step 3: Manual smoke** against `pnpm dev` backend: create an order via curl (Task 7 helpers), see it listed/filterable.
- [ ] **Step 4: Commit** `feat(renderer): orders list (table) + api client`.

### Task 9: New/Edit order form (draft-friendly) + navbar quick access

**Files:**
- Create: `apps/renderer/src/pages/order-form.tsx` (mode by route: `/commandes/new`, `/commandes/:id/edit`)
- Modify: `apps/renderer/src/App.tsx` (both routes), `dashboard-shell.tsx` (navbar button "Nouvelle commande" + global `keydown` Ctrl+N → navigate `/commandes/new`)
- Create: `apps/renderer/src/lib/order-form.schema.ts` (Zod mirror: every field optional; `online` ⇒ address required; quantity ≥ 1; amounts ≥ 0 integers)

**Interfaces:**
- Consumes: `ordersApi.create/update/get`, `StatusBadge`, `formatMillimes`.
- Produces: article rows editor (label/qty/unit price DT with 3-decimal input, add/remove/reorder by index), live footer (Total, + Livraison, Grand total), save actions: **Enregistrer** (create/update) and **Confirmer** (create-or-update then `ordersApi.confirm` with avance prompt inline); French field errors from Zod; disabled "Confirmer" while no article row.
- Verify: build clean; manual: create partial order (note only) → flagged incomplete in list; complete it; confirm.

- [ ] **Step 1: Implement.** **Step 2: typecheck + build clean.** **Step 3: Manual smoke** (partial save → finish → confirm). **Step 4: Commit** `feat(renderer): order form with draft creation + Ctrl+N`.

### Task 10: Kanban view + quick status advance

**Files:**
- Modify: `apps/renderer/src/pages/orders-list.tsx` (view switch Tableau|Kanban persisted in localStorage)
- Create: `apps/renderer/src/components/orders/order-card.tsx`

**Interfaces:**
- Consumes: same query/`ordersApi`; `StatusBadge`, `TypeBadge`.
- Produces: kanban columns En attente / Confirmée / En cours / Prête (delivered/cancelled excluded from board; reachable via table); each column fetches `ordersApi.list({ status, limit: 50, page: 1 })`; card = ticket_no, client, total, reste, due date, « Incomplète » badge; one-click advance button (confirm → start → ready → deliver when `reste <= 0`, else disabled with tooltip "Reste à payer non soldé"); buttons call the same mutations and invalidate `["orders"]`.
- Verify: build clean; manual status advance from board.

- [ ] **Step 1: Implement.** **Step 2: typecheck + build clean.** **Step 3: Manual smoke.** **Step 4: Commit** `feat(renderer): kanban view with quick advance`.

### Task 11: Order detail page (actions, payments modal, timeline)

**Files:**
- Create: `apps/renderer/src/pages/order-detail.tsx`
- Create: `apps/renderer/src/components/orders/payment-modal.tsx`
- Modify: `apps/renderer/src/App.tsx` (route `/commandes/:id`)

**Interfaces:**
- Consumes: `ordersApi.get` + all mutations; `OrderEvent`/`ORDER_EVENT_LABELS`/`PAYMENT_KIND_LABELS`; `formatDateTime`; role from `useAuthStore`.
- Produces: header (ticket_no, StatusBadge, client, reste à payer highlighted), state action buttons (visible per current status; Livrer needs `force` switch shown only to super_admin when reste > 0 — label "Forcer la livraison"), Annuler (confirm dialog), articles table, payments table + "Enregistrer un paiement" modal (kind select/amount/note; "Rembourser la totalité" pre-fills `kind=refund`, `amount=paid` when paid > 0), timeline (events newest-first with actor + payload summary), "Imprimer le ticket" → `/commandes/:id/ticket` (disabled before confirmation with tooltip "Ticket disponible après confirmation").
- Verify: build clean; manual: full flow incl. force-deliver as admin.

- [ ] **Step 1: Implement.** **Step 2: typecheck + build clean.** **Step 3: Manual smoke** (payments incl. full refund; timeline entries). **Step 4: Commit** `feat(renderer): order detail with payments + timeline`.

### Task 12: A4 ticket print page + final verification + docs

**Files:**
- Create: `apps/renderer/src/pages/order-ticket.tsx`, `apps/renderer/src/orders-print.css`
- Modify: `apps/renderer/src/App.tsx` (route `/commandes/:id/ticket`)
- Modify: `PROJECT.md` (Phase 1 row → done; record the two decisions: articles + delivery-fee-separate)

**Interfaces:**
- Consumes: `ordersApi.get`; `settings` via existing public settings query for `business_name`/`ticket_footer`; `formatMillimes`.
- Produces: A4 print layout — `@page { size: A4; margin: 14mm }`, `@media print` hides app chrome; content = business name, ticket_no, client + phone, article lines (label, qty, unit price, line total), Livraison, TOTAL / Avance payée / RESTE À PAYER (Trop-perçu when negative reste), statut + due date, footer text. "Imprimer" button calls `window.print()`.
- Final verification is the deliverable.

- [ ] **Step 1: Implement ticket page.**
- [ ] **Step 2: Run the full gate:** `pnpm -C apps/backend test` (all spec files) → PASS; `pnpm -C apps/backend run typecheck` → clean; `pnpm -C apps/renderer run typecheck && pnpm -C apps/renderer run build` → clean; with dev backend running: `pnpm test:api` and `pnpm test:phase1` → all checks pass.
- [ ] **Step 3: Update PROJECT.md** Phase 1 row; commit `feat(ticket): A4 print view + phase 1 wrap-up`.
