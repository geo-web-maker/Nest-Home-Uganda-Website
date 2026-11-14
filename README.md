# Bloomwell Home Care Uganda

Monorepo: `frontend/` (public React 18 + Vite + TypeScript), `frontend-thread/` (public redesign), `admin/` (standalone staff PWA), `nurse/` (standalone nurse PWA), `backend/` (FastAPI + Beanie on PyMongo async + MongoDB), `docs/` (spec, instructions, state ledger), `reference/` (HTML previews).

Start here: `docs/STATE.md` (what is done, what is next) and `docs/BUILDER_INSTRUCTIONS.md` (rules, pinned versions, scope model, SMS).

## UI reference and browser tests

Before changing public-site, nurse-app or admin UI, use `reference/nest-all-features-mockups.html` as the canonical design and navigation reference. `docs/UI_REFERENCE_GUIDE.md` maps the mockup to implemented routes, records intentional implementation gaps, and documents local UI tests. Earlier HTML previews are supplementary and must not override the canonical mockup.

## First time
```
bash scripts/preflight.sh                # environment check
cp .env.example .env                     # fill in locally, never commit
docker compose -f docker-compose.dev.yml up -d   # MongoDB replica set (S3 for e2e is moto, started by local-tests/run.sh)
cd frontend && npm ci
cd ../admin && npm ci
cd ../backend && python3 -m venv .venv && . .venv/bin/activate \
  && pip install -r requirements.lock && pip install -e . --no-deps
```

## Database deployment

Database migrations run automatically before the backend accepts traffic. See [`docs/AUTO_MIGRATIONS.md`](docs/AUTO_MIGRATIONS.md) for startup behavior, failure policy and manual recovery commands.

## Everyday commands
| What | Command (from the folder shown) |
| --- | --- |
| Public frontend dev server | `frontend`: `npm run dev` (port 5173) |
| Thread frontend dev server | `frontend-thread`: `npm run dev` (port 5174) |
| Admin dev server | `admin`: `npm run dev` (port 5175) |
| Public frontend checks | `frontend`: `npm run lint && npm run typecheck && npm run test && npm run build` |
| Admin checks | `admin`: `npm run lint && npm run typecheck && npm run test && npm run build` |
| Backend dev server | `backend`: `uvicorn app.main:app --reload` |
| Backend checks | `backend`: `ruff check . && ruff format --check . && pytest -q` |
| Database migrations | Applied automatically by the backend during application startup (MongoDB main/care and configured mail PostgreSQL). `python -m app.migrate` remains available for controlled manual runs. |
| Seed first superadmin and the 8 services | `backend`: `python -m app.seed` (needs `FIRST_SUPERADMIN_*` in `.env`) |
| Backend tests that need MongoDB | set `TEST_MONGODB_URI` first, then `pytest -q -rs` (without it they are skipped) |
| Orientation for a new session | `bash scripts/orient.sh` |

## Rules in one line
Exact pinned versions only (no `^`, no updates), no roles (scopes only), no Motor, no secrets in git, one commit per job.


## Standalone admin app

The staff admin is a dedicated PWA at `https://admin.bhcug.com`, with its own source under `admin/`. The public site and thread redesign remain separate public apps.

- Admin dev port: `5175` (public site `5173`, thread frontend `5174`).
- Admin app root: `admin/`; run `npm ci`, then `npm run dev`, `npm run build`, or the scripts in `admin/package.json`.
- Shared source mirrors: `node scripts/sync-admin-shared.mjs`; verify with `node scripts/sync-admin-shared.mjs --check`. Mail editor mirrors: `node scripts/sync-mail-rich.mjs --check`.
- Admin origin: `https://admin.bhcug.com`; set backend `ADMIN_URL` and public-build `VITE_ADMIN_URL` to the same origin.
- The admin's browser API remains same-origin at `/api/*`, proxied by its Cloudflare Worker to `BACKEND_URL`. Backend API routes remain `/api/v1/admin/...`.
- Admin pages use the origin root (`/login`, `/mail`, `/care/clients`, `/` dashboard). Legacy `/admin/...` browser links redirect to the new paths.
- Android application id: `ug.nesthomecare.admin`; native build config: `admin/capacitor.config.ts`.
- CI workflow: `.github/workflows/admin-android.yml`; build guide: `docs/ADMIN_ANDROID_APP.md`; app/deployment guide: `docs/ADMIN_APP.md`.

Focused Android tests from `admin/`: `npm run test:admin-native` and `npm run test:e2e:admin-native`. The generated Android project is not committed.

## Pre-APK release gate

Before generating any Android APK, run the complete web/backend release gate:

```bash
node scripts/pre-apk-release.mjs
```

This covers the public website, admin web application, nurse web/PWA application, backend tests, production builds, accessibility, responsive behaviour, reference fidelity, authentication/permission flows already represented by the browser suites, offline/sync checks, and critical browser journeys. It does **not** build an APK.

For faster local iteration:

```bash
node scripts/pre-apk-release.mjs --skip-e2e
node scripts/pre-apk-release.mjs --web-only
node scripts/pre-apk-release.mjs --backend-only
```

See `docs/PRE_APK_RELEASE_TEST_SUITE.md` for the release criteria and failure scenarios. A production APK should only be created from a passing release candidate, followed by native Android smoke tests.

## Stage 13–19 reconstruction and verification

The consolidated nurse-module reconstruction, stage-by-stage decisions, test results, and remaining environment/device checks are documented in [`docs/RECONSTRUCTION_STAGE_13_TO_19.md`](docs/RECONSTRUCTION_STAGE_13_TO_19.md). That audit distinguishes checks actually run from integration/frontend suites that remain unverified because the current runtime is missing dependencies.


## Stage 20–29 reconstruction and security verification

The Stage 20–29 consolidation, nurse-safe timesheet route, admin scope guards, client and nurse detail workflows, tests, merge decisions, validation results, and remaining integration blockers are documented in [`docs/RECONSTRUCTION_STAGE_20_TO_29.md`](docs/RECONSTRUCTION_STAGE_20_TO_29.md). Stage bundles were treated as overlapping patches rather than blindly overlaid snapshots; the report distinguishes static checks that ran from backend/frontend suites that need the locked dependencies and test database.
