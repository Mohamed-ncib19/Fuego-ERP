# UX simplification + dark grey & gold theme — short design

Approved by the owner on 2026-11-14.

## Intent

Make Fuego faster and easier for the person at the counter: fewer buttons per
screen, one obvious next step, and a dark grey and gold look.

## Goals

1. **Theme:** dark grey surfaces, gold accent, dark only. The light/dark
   toggle is removed.
2. **One main action per screen:** on an order, a single gold button for the
   next workflow step (Confirmer → Démarrer → Prête → Livrer). Edit, cancel
   and ticket move into a "more" menu.
3. **Simpler shell:** "Nouvelle commande" lives in one place (top bar, Ctrl+N
   kept). Logout moves into the user chip at the bottom of the sidebar.
4. **Shorter navigation:** Utilisateurs and Journal d'audit become tabs inside
   Paramètres; the sidebar has four entries (admin) / three (staff).
5. **Clearer feedback:** one status-step bar at the top of each order, and a
   toast after every action.

## Non-goals

New features (installer, expense editing, export). Backend changes.

## Anti-goals

Breaking a workflow that passes the smoke tests today. Hiding an action so
deep that the counter workflow needs more clicks than before for the main
path.

## Approaches

- **Restyle and regroup the existing pages (picked).** The colours already
  come from CSS tokens in `apps/renderer/src/index.css`, so the theme is a
  token change; actions are regrouped inside the existing pages. Lowest risk.
- **Rewrite the screens from scratch.** More freedom, but risks the tested
  order and finance workflows for no user-visible gain.
- **Theme only.** Cheapest, but does not address "simple to use".

## Left to the builder

Exact grey and gold values (must keep readable contrast), the shape of the
"more" menu, tab layout inside Paramètres, toast wording (French).
Routes `/settings/users` and `/audit` keep working (deep links, admin guard).
