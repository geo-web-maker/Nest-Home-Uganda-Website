# Admin split review packet 1 — A0 through A3

## Status

- A0 baseline: BLOCKED as an executable baseline; the original archive does not contain `admin/`, npm install timed out, and the installed frontend dependencies are incomplete.
- A1: IMPLEMENTED — common dialogs and dependent notice/header pieces moved to `frontend/src/components/dialogs`; public import closure no longer depends on `components/admin`.
- A2: IMPLEMENTED — shared mirror sync scripts and 111 generated files.
- A3: IMPLEMENTED IN SOURCE — standalone `admin/` app and lockfile created; dependency-backed typecheck/build remains BLOCKED pending a successful `npm ci`.

## Files for review

- `admin/package.json`, `admin/package-lock.json`, `admin/tsconfig.json`, `admin/vite.config.ts`, `admin/index.html`, `admin/src/main.tsx`
- `admin/src/features/admin/**`, `admin/src/admin-native/**`, `admin/src/components/admin/**`, `admin/src/_shared/**`
- `scripts/sync-admin-shared.mjs`, `scripts/alias-admin-shared-imports.mjs`, `scripts/sync-mail-rich.mjs`
- `frontend/src/components/dialogs/**`, `frontend/src/components/security/TotpGate.tsx`

## Commands and results

- `node scripts/sync-admin-shared.mjs --check` — PASS, 111 files across 10 groups.
- `node scripts/sync-mail-rich.mjs --check` — PASS, exit 0.
- Admin lock direct package metadata check — PASS, 56 direct dependencies each have an exact lock record matching `package.json`.
- `npm ci --dry-run --offline` in `admin/` — BLOCKED, local cache has no registry response for `type-fest`.
- `npm run typecheck` in `admin/` — BLOCKED, dependencies absent; unresolved type libraries include `@testing-library/jest-dom`, `node`, `vite/client`, `vitest/globals`.

## Reviewer attention

The admin lockfile was assembled from exact pinned entries already present in the frontend/nurse lockfiles plus the pinned PWA plugin; it has not yet been validated by a network-backed `npm ci`. Verify it in CI with the repository's intended Node 22 version before deploying.
