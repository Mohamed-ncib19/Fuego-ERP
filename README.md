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

## Lancer l'application

Double-clic sur **`Fuego.bat`** (ou `pnpm start`) : c'est le seul lanceur. Il
installe et compile au besoin, puis ouvre l'app desktop autonome.
`pnpm dev` reste réservé au développement (rechargement à chaud).

## Installateur & mises à jour automatiques

- Branche **`main`** : développement. Branche **`production`** : ce qui est
  livré aux postes installés.
- Chaque `git push` sur `production` lance `.github/workflows/release.yml` :
  build → tests → installateur Windows → *release* GitHub versionnée
  `1.0.<n° de run>` (aucun numéro de version à modifier à la main).
- L'application installée vérifie ce flux au démarrage puis toutes les 4 h,
  télécharge la nouvelle version en arrière-plan et propose de redémarrer
  (sinon elle s'installe à la fermeture). Les données
  (`%APPDATA%\@fuego\desktop`) ne sont jamais touchées.

Livrer une mise à jour :

```bash
git checkout production && git merge main && git push && git checkout main
```

Construire l'installateur en local (sortie dans `apps/desktop/release/`) :

```bash
pnpm run build && pnpm -C apps/desktop run bundle && pnpm -C apps/desktop run dist
```

## Mode production intégré (comme l'app finale)

```bash
pnpm -C apps/renderer run build   # génère apps/renderer/dist
pnpm -C apps/desktop run build    # compile le shell Electron
electron apps/desktop/dist/main.js  # ou : pnpm -C apps/desktop run start
```

L'app Electron embarque l'API dans son processus principal, sert le SPA
same-origin (cookies httpOnly), stocke la base et les secrets dans
`%APPDATA%\@fuego\desktop\`.

## Tests API & Intégration

Lancer le dev stack (`pnpm dev`) puis :

```bash
pnpm test:api        # 34 vérifications Phase 0 : setup, login, users, rôles, audit…
pnpm test:phase1     # Cycle complet commandes : brouillon, articles, avance, workflow, solde, livraison
pnpm test:phase2-3   # Vérification Phase 2 & 3 : finances, dépenses, encaissements, audit, sauvegarde & restauration
pnpm test:all        # Suite complète (unitaires vitest + smoke phase 1 + smoke phase 2 & 3)
pnpm -C apps/backend test # Tests unitaires Vitest (27 tests)
pnpm run typecheck   # Vérification TypeScript stricte sur l'ensemble du monorepo
pnpm run build       # Compilation complète de production (shared, backend, renderer, desktop)
```

## Étapes & Livrables

- **Phase 0** : login JWT, gestion des utilisateurs (admin), audit, assistant première installation. ✅ **Terminé**
- **Phase 1** : commandes (articles, avance, confirmation, local/online, workflow, kanban, tickets A4 imprimables). ✅ **Terminé**
- **Phase 2** : finances & charges (dépenses, journal des encaissements, tableau de bord KPIs en temps réel, rentabilité nette, tendance 14 jours, monnaie stricte en millimes). ✅ **Terminé**
- **Phase 3** : finitions & maintenance (paramètres d'établissement, journal d'audit administratif, sauvegardes et restauration SQLite sécurisées, packaging prêt à l'emploi). ✅ **Terminé**
