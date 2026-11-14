# UX Simplification + Dark Grey & Gold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the renderer to a dark-only grey and gold theme and regroup actions so each screen has one obvious next step.

**Architecture:** Renderer-only change. Colours stay bound to CSS tokens in `index.css`; pages are regrouped in place, no backend or route contract changes.

**Tech Stack:** React 19, Vite, Tailwind 3 (CSS-variable tokens), lucide-react, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-11-14-ux-dark-gold-design.md`

## Global Constraints

- French UI copy only.
- No backend changes; no new dependencies.
- Routes `/settings/users` and `/audit` keep working behind the admin guard.
- The renderer has no component test harness: each task is verified by
  `pnpm -C apps/renderer run build` (typecheck + bundle) and by reading the
  live window through the DevTools port.
- The ticket print page stays black on white (it is printed on paper).

## Review Focus

- Printed ticket must not inherit the dark background.
- Gold-on-dark text and dark-on-gold button text must stay readable.
- Staff (non-admin) must not see the Paramètres entry or its tabs.
- An order with no items: "Confirmer" stays disabled with its explanation.
- Unpaid ready order: the main action is the payment, "Livrer" follows.

---

### Task 1: Dark grey & gold tokens, dark only

**Files:** Modify `apps/renderer/src/index.css`, `apps/renderer/index.html`, `apps/renderer/src/components/ui.tsx`, `apps/renderer/src/pages/login.tsx`, `apps/renderer/src/pages/setup.tsx`, `apps/desktop/src/main.ts` (window background).

- [ ] Replace the orange scale with a gold scale (500 = `212 175 55`) and the surfaces with neutral greys (`surface` 32 32 35, `surface-2` 24 24 27, `border` 58 58 64); single `:root` block, no `.dark` override.
- [ ] `index.html`: always set `class="dark"`; drop the theme script.
- [ ] Primary button: gold background with near-black text.
- [ ] Login/setup background: dark grey with a subtle gold glow instead of the orange gradient.
- [ ] Verify: build passes; screenshot shows grey + gold.

### Task 2: Simpler shell and navigation

**Files:** Modify `apps/renderer/src/components/layout/dashboard-shell.tsx`, `apps/renderer/src/pages/settings.tsx`, `settings-users.tsx`, `audit.tsx`, `dashboard.tsx`, `orders-list.tsx`. Create `apps/renderer/src/components/layout/settings-tabs.tsx`.

**Interfaces:** Produces `SettingsTabs()` — a tab strip linking `/settings`, `/settings/users`, `/audit`, rendered at the top of those three pages.

- [ ] Sidebar: Tableau de bord, Commandes, Finances, Paramètres (admin). Paramètres is active for all three settings routes.
- [ ] Top bar: title + one "Nouvelle commande" button. Remove theme toggle, Admin badge and logout button.
- [ ] User chip: profile link + logout icon button.
- [ ] Remove the duplicate "Nouvelle commande" buttons from dashboard and orders list.
- [ ] Verify: build passes; nav shows four entries for admin.

### Task 3: One main action per order

**Files:** Modify `apps/renderer/src/pages/order-detail.tsx`, `apps/renderer/src/components/ui.tsx`. Create `apps/renderer/src/components/orders/status-steps.tsx`.

**Interfaces:** Produces `StatusSteps({ status }: { status: OrderStatus })` and `MoreMenu({ items }: { items: { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string }[] })` in `ui.tsx`.

- [ ] Header: back button, status-step bar, ONE gold button for the next step, and a "more" menu holding Modifier, Imprimer le ticket, Forcer la livraison (admin), Annuler.
- [ ] Ready + unpaid: main action is "Encaisser le solde"; "Livrer" appears once paid.
- [ ] Every order mutation shows a success or error toast.
- [ ] Verify: build passes; walk one order through the workflow in the live app.

### Task 4: Final verification

- [ ] `pnpm run typecheck`, `pnpm run build`, backend unit tests, the three smoke scripts on a throwaway database.
- [ ] Launch the standalone app and read each main screen through the DevTools port.
