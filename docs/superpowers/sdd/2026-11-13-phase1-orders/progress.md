# SDD ledger — plan: docs/superpowers/plans/2026-11-13-phase1-orders.md
Branch: phase-1-commandes @ D:\fuego\.worktrees\phase-1-commandes (worktree of D:\fuego)
BASE at start: 6eeafe0 "chore: ignore .worktrees"
Spec: docs/superpowers/specs/2026-11-13-phase1-orders-design.md (binding authority)
Workspace: D:\fuego\.worktrees\phase-1-commandes\.superpowers\sdd\2026-11-13-phase1-orders

## Environment notes
- `pnpm install` exits 1 on better-sqlite3 node-gyp script (known Windows SDK quirk; runtime `require` verified working). New deps (vitest) link fine with `pnpm install --ignore-scripts` + manual `node install.js` for Electron.
- packages/shared/dist is gitignored → rebuilt manually after checkout: `pnpm -C packages/shared run build`.
- vitest binary path resolution fails in this PowerShell session due to module hoisting; `pnpm -C apps/backend test` works on cleaner caches.

## Rulings
- R1: Year-rollover test = pure-function assertions (formatTicketNo/counterName) + one create asserting the counter row `ticket_<currentYear>` exists.
- R2: `pnpm install` script exit code 1 on better-sqlite3 = known quirk, NOT a task defect; runtime require verified.
- R3: Money module = pure integer arithmetic; tested by `node -e` import.
- R4: Edit-rules (§5.3) enforced in service layer; controller delegates.

## Task log
- Task 1: implemented — test `db.service.spec.ts` already present in worktree; `ensureTables` DDL (orders/order_items/order_events/payments + `orders_ticket_no_key` index) already mirrors schema.ts; `vitest.config.ts` and `"test": "vitest run"` in package.json already present.
- Task 2: implemented — `orders.money.ts` with pure integer arithmetic (itemsTotal, grandTotal, paidAmount, reste, formatTicketNo, counterName); `orders.money.spec.ts` with 6 tests.
- Task 3: implemented — create + list endpoints (DTOs ✅, service ✅, controller ✅, module ✅, app.module.ts updated ✅, test spec ✅). DTOs validate online⇒address, local⇒fee=0, create needs ≥1 client/description/items. Service has createOrder (with transaction: counter upsert + order + items + created event + audit) and listOrders (filters: status comma-separated, order_type, search, from/to, overdue, pagination limit/page).
- Task 4: implemented — detail + edit rules (spec §5.3). Edit rules enforced in service: while `pending` every field incl. `order_type` editable; from `confirmed` onward `customer_name/customer_phone/description/delivery_address/due_date` editable; `items`/`delivery_fee` editable but append `edited` event with before/after totals; `order_type` not editable after confirmation (409); `delivered`/`cancelled` money edits → 409; unchanged `PATCH` writes no event/no audit.
- Task 5: implemented — workflow transitions + notes (confirm/start/ready/deliver/cancel/addNote). Guards (French 409s): illegal transition "Transition impossible depuis le statut actuel"; confirm without items "Ajoutez au moins un article avant de confirmer". `confirmOrder` requires ≥1 item; never duplicates pending payments; sets `status="confirmed"` + event + audit. Other transitions append events + audit. Deliver needs `reste <= 0` unless `super_admin` force. Cancel stores `reste` in event. Note appends `note` event.
- Task 6: pending — payments endpoint (status matrix, refund cap). `PaymentDto`: kind `IsIn(PAYMENT_KINDS)`, amount `IsInt ≥1`. Matrix: advance/balance on pending/confirmed/in_progress/ready; only refund on delivered/cancelled. `refund > paid` → 400 "Le remboursement dépasse le montant payé". Row audit `order.payment_recorded` with `{kind, amount,reste_after}`.
- Task 7: pending — HTTP smoke test for whole lifecycle (login → create → confirm → pay → deliver/refund → list filters → envelope checks).
- Task 8: pending — renderer API client + orders list (table view + Kanban). `ordersApi` mirrors `users.api.ts` unwrap; list page table + Kanban view with quick views chips (Aujourd'hui, En retard, À livrer). "Nouvelle commande" button + Ctrl+N. "Incomplète" badge when `items_count === 0 && status === "pending"`.
- Task 9: pending — New/Edit order form (draft-friendly) + navbar quick access. Form can be saved partial (note only) → flagged incomplete in list. "Confirmer" needs ≥1 article row. Ctrl+N navigates to `/commandes/new`. Zod schema mirrors DTO.
- Task 10: pending — Kanban view + quick status advance. Columns: En attente / Confirmée / En cours / Prête. Card = ticket_no, client, total, reste, due date, "Incomplète" badge. One-click advance (confirm → start → ready → deliver when `reste <= 0`, else disabled). Buttons call same mutations and invalidate `["orders"]`.
- Task 11: pending — Order detail page (actions, payments modal, timeline). Header (ticket_no, StatusBadge, client, reste highlighted), state action buttons (Livrer needs force switch for super_admin whenreste > 0), Annuler (confirm dialog), articles table, payments table + "Enregistrer un paiement" modal ("Rembourser la totalité" pre-fills kind=refund, amount=paid), timeline (events newest-first), "Imprimer le ticket" → `/commandes/:id/ticket` (disabled before confirmation).
- Task 12: pending — A4 ticket print page + final verification + docs. A4 print layout `@page { size: A4; margin: 14mm }`, `@media print` hides chrome. Content = business name, ticket_no, client + phone, article lines, Livraison, TOTAL / Avance payée / RESTE À PAYER (Trop-perçu when negative reste), statut + due date, footer text. "Imprimer" button calls `window.print()`. Update PROJECT.md Phase 1 row → done.

## Preflight scan (already checked above)