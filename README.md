# Well Nest Home Care Uganda

Monorepo: `frontend/` (React 18 + Vite + TypeScript), `backend/` (FastAPI + Beanie on PyMongo async + MongoDB), `docs/` (spec, instructions, state ledger), `reference/` (HTML previews).

Start here: `docs/STATE.md` (what is done, what is next) and `docs/BUILDER_INSTRUCTIONS.md` (rules, pinned versions, scope model, SMS).

## UI reference and browser tests

Before changing public-site, nurse-app or admin UI, use `reference/nest-all-features-mockups.html` as the canonical design and navigation reference. `docs/UI_REFERENCE_GUIDE.md` maps the mockup to implemented routes, records intentional implementation gaps, and documents local UI tests. Earlier HTML previews are supplementary and must not override the canonical mockup.

## First time
```
bash scripts/preflight.sh                # environment check
cp .env.example .env                     # fill in locally, never commit
docker compose -f docker-compose.dev.yml up -d   # MongoDB replica set (S3 for e2e is moto, started by local-tests/run.sh)
cd frontend && npm ci
cd ../backend && python3 -m venv .venv && . .venv/bin/activate \
  && pip install -r requirements.lock && pip install -e . --no-deps
```

## Everyday commands
| What | Command (from the folder shown) |
| --- | --- |
| Frontend dev server | `frontend`: `npm run dev` |
| Frontend checks | `frontend`: `npm run lint && npm run typecheck && npm run test && npm run build` |
| Backend dev server | `backend`: `uvicorn app.main:app --reload` |
| Backend checks | `backend`: `ruff check . && ruff format --check . && pytest -q` |
| Create indexes (run on each release) | `backend`: `python -m app.migrate` |
| Seed first superadmin and the 8 services | `backend`: `python -m app.seed` (needs `FIRST_SUPERADMIN_*` in `.env`) |
| Backend tests that need MongoDB | set `TEST_MONGODB_URI` first, then `pytest -q -rs` (without it they are skipped) |
| Orientation for a new session | `bash scripts/orient.sh` |

## Rules in one line
Exact pinned versions only (no `^`, no updates), no roles (scopes only), no Motor, no secrets in git, one commit per job.


## Admin Android app

The admin frontend is also packaged as a dedicated Capacitor Android app. It reuses the same admin React UI, server-side scopes, native refresh-token authentication and push-registration path.

- App name: `Well Nest Home Care Uganda Admin`
- Android application id: `ug.nesthomecare.admin`
- Native build config: `frontend/capacitor.admin.config.ts`
- CI workflow: `.github/workflows/admin-android.yml`
- Build guide: `docs/ADMIN_ANDROID_APP.md`

Focused checks:

```bash
cd frontend
npm run test:admin-native
npm run build:admin-native
npm run test:e2e:admin-native
```

The Android project is generated during the build and is not committed to the repository.


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
