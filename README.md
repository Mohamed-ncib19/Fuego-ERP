# Fuego — Gestion de commerce (Electron)

Application desktop (Electron) pour gérer les **commandes** : description,
**avance**, confirmation, type **local/online**, tickets et statut de
progression, avec suivi des **revenus** et des **dépenses**.

Architecture et conventions issues du système de référence
`D:\School Management System` (monorepo pnpm, NestJS, Drizzle, enveloppe
uniforme `{ data, meta, error }`, audit, JWT access+refresh).

## Structure

```
apps/
  desktop/    Electron (main + preload) — embarque le backend en production
  backend/    API NestJS + SQLite (better-sqlite3 + Drizzle)
  renderer/   UI React + Vite + Tailwind (français)
packages/
  shared/     Enums & types partagés (UserRole, OrderStatus, …)
scripts/
  dev.mjs     Orchestrateur de dev (vite + api watch + electron)
```

## Démarrage (développement)

```bash
pnpm install
pnpm dev
```

- Renderer : http://localhost:5173 (proxy /api)
- API : http://127.0.0.1:3220/api
- Logs : `logs/*.log`
- Au premier lancement : assistant « Bienvenue » → nom du commerce + compte
  administrateur (créé seulement si aucun utilisateur n'existe).

## Mode production intégré (comme l'app finale)

```bash
pnpm -C apps/renderer run build   # génère apps/renderer/dist
pnpm -C apps/desktop run build    # compile le shell Electron
electron apps/desktop/dist/main.js  # ou : pnpm -C apps/desktop run start
```

L'app Electron embarque l'API dans son processus principal, sert le SPA
same-origin (cookies httpOnly), stocke la base et les secrets dans
`%APPDATA%\@fuego\desktop\`.

## Tests API (Phase 0 & Phase 1)

Lancer le dev stack (`pnpm dev`) puis :

```bash
pnpm test:api      # 34 vérifications : setup, login, users, rôles, audit…
pnpm test:phase1   # Cycle complet commandes : brouillon, articles, avance, workflow, solde, livraison
pnpm -C apps/backend test # Tests unitaires Vitest (20 tests)
```

## Backend seul (tests API)

```bash
pnpm -C apps/backend run dev
curl http://127.0.0.1:3220/api/health -H "x-api-key: fuego-dev-api-key"
```

## Étapes

- **Phase 0** : login JWT, gestion des utilisateurs (admin), audit, assistant première installation. ✅ **Terminé**
- **Phase 1** : commandes (articles, avance, confirmation, local/online, workflow, kanban, tickets A4 imprimables). ✅ **Terminé**
- **Phase 2** : finances (revenus, dépenses, tableau de bord).
- **Phase 3** : sauvegardes, packaging electron-builder, auto-update.
