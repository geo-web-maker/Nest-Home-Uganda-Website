# Nurse Module: Build Plan for the Coding Assistant (v1.0)

> Audience: the coding assistant (ChatGPT) that writes the code, and the owner who reviews it.
> Companion files: `docs/nurse-module-spec.md` (the v1.4 spec, the "what"), `docs/BUILDER_INSTRUCTIONS.md` (house rules that already govern this repo), `reference/nest-all-features-mockups.html` (the approved look and every screen).
> This file is the "how, in what order, and how it is proven". Where this file and the spec disagree, this file wins (Section 2 lists every override).

---

## 0. Read this first (the operating rules)

### 0.0 Two phases: build everything, then correct

The owner wants the whole module built in one go, then corrected.

- **Phase A, full build.** First a **question round** (Section 0.5): you read everything, then ask **one message** with every question you cannot answer from this plan, and wait for the owner's reply. After the answers, you write **every work order in order, WO-00 to WO-17, WO-17B, WO-17C and WO-19** (WO-18 only if the owner says Module D is approved), with all their tests, **without stopping and without waiting to be told to continue**. Output is long, so it will span many messages: when a message is full, end it with one line `Next: WO-NN` and carry on straight into that work order in your next message without waiting. The only reason to pause during the build is a question (Section 0.5). All of it goes on **one branch** `nurse-module` in **one pull request**.
- **Phase B, corrections.** Only after Phase A is complete does the owner push the branch. CI then runs everything. The owner pastes failing logs, grouped by CI job, and you fix them using Section 9.2. Corrections to the design or look come after CI is green. Nothing is fixed during Phase A except obvious mistakes you notice while writing. Phase B starts automatically once Phase A is finished and the owner has pushed; you do not ask permission to move between phases.

Because Phase A is blind, keep each work order small in surface and consistent with the names in Sections 5 and 6, so later pieces plug into earlier ones without guessing. Before starting each work order, re-read the file names and function names you created earlier and reuse them exactly. Keep a running file `docs/NURSE_BUILD_LOG.md` listing, per work order, the files created and the public function and route names, so the next work order uses the same names.

### 0.1 You write code and tests. You do not run anything.

1. You cannot run code, tests, linters or builds, and you must not pretend to. **GitHub Actions is the only judge.**
2. Because nothing is run by you, **every change you make ships with the tests that prove it**, written in the same pull request. A work order is not finished until its test files exist (Section 4 and each work order list them by name).
3. Write the tests **first** in your answer, then the code. This forces the code to match a written expectation.
4. Never write "tests pass", "works", "verified" or "fixed". Write **"Written, not run. CI will run it."**
5. In Phase B, when CI fails, the owner pastes the failing job log. Fix **only** what the log shows. Do not refactor. Do not touch unrelated files. Use the prompt in Section 9.2.
6. If a test you wrote fails because the test is wrong, say so plainly and fix the test. Never weaken a test to make it pass without saying why.

### 0.2 Source order (when two sources disagree)

1. This file. 2. `docs/BUILDER_INSTRUCTIONS.md` (its hard rules still apply, except where Section 2 here overrides them). 3. `docs/nurse-module-spec.md`. 4. The mockup file, for look and behaviour only. 5. Never memory or "common practice". If still unclear, ask (Section 0.5).

### 0.3 Hard rules

1. **Work orders are built in order, in one run** (Section 0.0). Each work order's files and tests must be complete before you move to the next. One branch, one pull request.
2. **Additive only.** Existing public site, admin, enquiries, applications, content and settings behaviour must not change. Existing tests must keep passing. Small diffs to existing files, never full rewrites.
3. **No roles.** Access is by scopes only (BUILDER_INSTRUCTIONS Section 12). CI fails on the words `require_roles`, `user_role`, `UserRole`. A "preset" is just a named list of scopes used to fill in a form. The server never checks a preset name.
4. **No new dependency** except those named in Section 3. Each new package needs a pin in `docs/PINS_NURSE.md` filled in by the owner. If a pin is missing, ask (Section 0.5). Do not guess versions.
5. **Online services are allowed, but the app must never depend on them to work.** Offline-first is the rule: every nurse action works with no signal (saved on the phone, queued, sent later). Approved online services: MamboSMS (server only), Firebase Cloud Messaging for push (WO-17C), Cloudinary for photos (Decision D2), the owner's S3-compatible storage (server only), and the optional admin map tile URL. A service may be used only when it is **online-enhanced**: the feature has a defined offline behaviour and a test proving it. No Google Fonts, no CDNs, no analytics. Firebase is allowed **only** for push messages (WO-17C), never for hosting, analytics or APK distribution (D7). CI enforces the list (Section 4.6).
6. **No invented content.** Consent text, privacy notice, retention periods, emergency numbers, on-call names, photo guidance and any clinical text are "client to supply". Use the exact placeholder `client to supply` and show them as "Not set" in the readiness checklist.
7. **Server is the authority.** The phone is never trusted for verification, duration, permissions or reach.
8. **Append-only records** (visit events, SOS events, care logs, audit log) have no update or delete code path at all. A test proves the repository module exposes no such function (Section 4.3).
9. **No patient or client health detail** in SMS, notifications, logs, error messages, or the nurse payloads (spec 0.5 "What nurses see").
10. **Text style** in code, comments and UI: plain English, short sentences, no emojis, no em dashes. UI strings live in locale files, never inline.
11. **Secrets** only in environment variables. Only `.env.example` with empty or dummy values is committed. **Any other environment-specific value (addresses, names, limits, job times, app ids) is also a variable or a care setting, never a constant (Section 12).**
12. **Never edit** `docs/`, `reference/`, `design/` except to add the files this plan names.

### 0.4 What "done" means for a work order

All of these, no exceptions:
- Every file listed under "Files" exists and follows the repo's module pattern (Section 5).
- Every test listed under "Tests to write" exists, with the exact file name given.
- `openapi.json` and `api.d.ts` are regenerated **by CI** (Section 4.7), so you do not hand-edit them.
- `docs/NURSE_BUILD_LOG.md` has its entry, and `docs/OWNER_DECISIONS.md` records every answer the owner gave to your questions. Nothing is assumed.
- Nothing in "Out of scope" was built.

### 0.5 Questions: ask, never assume

**Nothing is assumed.** If you need something this plan and the owner's files do not give, you ask. The owner's answers are saved in `docs/OWNER_DECISIONS.md`.

**The question round (before any code).** Read this whole file and the files it names. Then send **one message** with every question, numbered, each with your recommended answer in brackets so the owner can reply "all recommended" or change some. Wait. Do not start WO-00 until answered. The round must cover at least:

1. (Removed. The values in Section 11 are built-in defaults that the owner can change with environment variables, Section 12.6. Do not ask about them.)
2. Package pins for Section 3 (`docs/PINS_NURSE.md`), and the SMS sender, background-location and secure token storage plugin choices, the admin app id, the API origin the Android apps should call, how many days the admin app may stay signed in offline (recommended 7), and whether the admin app needs an app PIN or biometric lock (recommended: no, require a phone screen lock only).
2b. The Northflank and configuration questions in Section 12.5.
3. (Removed. Texts, numbers and periods are environment variables the owner sets later, Section 12.6. Never invent them and never ask for them.)
4. Is Module D approved (WO-18)? Push notifications through Firebase Cloud Messaging are approved (WO-17C): which Firebase project and app ids, one Firebase app per Android app or shared, and is the `cryptography` package already pinned for the server?
5. Anything in the repo that conflicts with this plan (existing behaviour, existing tests, names that differ from what this plan assumes).
6. Anything else you cannot decide from the files.

**Questions during the build.** Ask only when a decision truly cannot be made from this plan, the owner's answers, or the existing code, and building on a guess would be wasted work. Then use this exact format and stop until answered:

`QUESTION <n>: <one sentence>. Work order: <WO-NN>. Options: <A>, <B>. Recommendation: <A or B>.`

Batch related questions into one message. Do not ask things already answered in this file.

**Never a reason to pause:** the length of the work, the number of files left, or "should I continue". Just continue.

**Phase B only:** if the same CI problem fails three times in a row, stop patching, write a short note on what you do not understand, and ask the owner.

---

## 1. What exists today (verified from the repository zip)

Use these facts. Do not re-decide them.

| Area | Fact |
| --- | --- |
| Backend | FastAPI 0.146, Python 3.12, Beanie 2.2.0 on PyMongo async (no Motor), Pydantic 2, APScheduler in-process, boto3 for S3-compatible storage, httpx. |
| Layout | `backend/app/modules/<name>/{models,repository,router,schemas,service,rules}.py`. Every model and router is listed in `backend/app/registry.py` only. Migrations are `backend/migrations/000N_*.py`, run by `python -m app.migrate`, last is `0005`. Seeds run by `python -m app.seed`. |
| Auth | Hand-rolled JWT (PyJWT), Argon2, refresh-token rotation. `User` has `scopes: list[str]` and `is_superadmin`. Access token carries scopes. `require_scopes(...)` in `backend/app/core/deps.py`. Scope registry is the only list: `backend/app/modules/auth/scopes.py`. A hand-copied `EXPECTED` set in `tests/test_scopes.py` must change with it. |
| Pagination | `?page=1&page_size=25` returns `{items,total,page,page_size}` (`core/pagination.py`). Max page size 100. |
| Storage | `core/storage.py`: `put/get/delete/signed_url`, two buckets (public, private), signed links clamped to 900 s. MinIO runs in `docker-compose.dev.yml`. |
| SMS | `modules/notifications/providers.py` (MamboSMS, console provider), `SmsLog`, retries 2 s then 5 s. Notes in `docs/MAMBOSMS_NOTES.md`. |
| Settings | `modules/settings` with `defaults.py`. |
| Audit | `modules/audit` (`AuditLog`). |
| Jobs | `app/jobs.py` builds the APScheduler; reminders every minute, retention at 03:00. |
| Frontend | `frontend/` React 18, Vite 7, `vite-react-ssg`, react-router 6.30, react-query, react-hook-form, zod, i18next, Vitest, Playwright. Admin is client-side under `frontend/src/features/admin`, nav in `admin/nav.ts` gated by scopes. Types come from `src/types/openapi.json` and `api.d.ts`. |
| Fonts | Self-hosted in `frontend/public/fonts` (Fraunces 700, Figtree 400/500/600/700, Cormorant Garamond italic 600) via `src/design/fonts.css`. |
| Tests | `backend/tests/*`: unit, `test_db_*` (real MongoDB replica set in CI), `test_http_*`, and **generated** guards: `test_scope_enforcement.py` (every `/api/v1/admin` route), `test_route_coverage.py` (route allow-lists, frontend calls match routes, committed OpenAPI matches the app). |
| CI | `.github/workflows/ci.yml` (guards, frontend, backend with Mongo replica set, e2e), `layout.yml`, `format-fix.yml`. |
| Hosting | Backend on Render, frontend on Vercel (`frontend/vercel.json`). |

---

## 2. Decisions that override the spec (final, do not reopen)

| Id | Spec says | Do this instead | Why |
| --- | --- | --- | --- |
| D1 | Roles `nurse, supervisor, admin, executive, super_admin` and a per-resource none/read/write plus scope (own/team/all) | **Scopes** (Section 5.1) plus one **reach** field on the user: `own`, `team` or `all`. Presets are only named scope lists. Superadmin keeps `is_superadmin`. | Repo rule C6 and a CI guard forbid roles. Reach per user is simpler than per resource and covers every row of spec Section 5. Per-resource reach is out of scope. |
| D2 | Cloudinary for photos, signed uploads, `/photos/sign` | **Keep Cloudinary** (owner decision). Flow: the phone saves the photo locally and queues it. When online it asks the API for a signature, uploads **straight to Cloudinary** as `type=authenticated` (private, not guessable), then registers the photo with the API (idempotent by client UUID). Staff view photos through the API, which streams them from Cloudinary after a scope check and an audit row. No Cloudinary SDK: signing is done with `hashlib` and `httpx` in one small module. Tests use a fake store, so CI needs no Cloudinary account. | Offline-first is unchanged because the queue holds the photo until a connection exists. Direct upload keeps large files off the API server. Streaming through the API keeps every view audited and avoids links that never expire. |
| D3 | Cursor pagination everywhere | Admin lists use the existing `page/page_size`. **Only** `/field/sync/pull` uses a cursor. | Consistency with every existing list and the existing frontend helpers. |
| D4 | `packages/geo` shared by server and client | The **server's Python** `app/modules/geo` is the authority. The nurse app has a TypeScript port used only for display hints. Both are tested against one shared file `shared/fixtures/geo_cases.json` (Section 6, WO-03). | Python and TypeScript cannot share one package. The shared fixture keeps them identical. |
| D5 | Monorepo with `apps/*` and `packages/*` | Keep `frontend/` and `backend/` where they are. Add **`nurse/`** (new Vite app, its own `package.json` and lockfile) and **`shared/`** (fixtures, string keys, no build step). No workspaces tool. | No risk to the working CI. Vercel gets a third project with root `nurse/`. |
| D6 | Admin screens in a separate admin app | Admin screens go into the **existing** admin under `frontend/src/features/admin/care/`, gated by scopes in `nav.ts`. | The admin already exists and has the shell, auth guards, tables and forms. |
| D7 | Firebase App Distribution for the APK | The Android APK is stored in the **private bucket** and served by an authenticated endpoint with a short signed link. The `/field/app/version` check drives update prompts. | Spec 15 names this as the fallback. Removing Firebase removes an account and a vendor. |
| D8 | Colours `#0F766E` teal and font Inter | Use the **website's tokens** from `design/tokens.css` and the self-hosted fonts, exactly as the mockup file does. | The owner approved the unified look. |
| D9 | Map tiles via OpenStreetMap | The nurse app has **no map tiles**. It shows the address and an "Open in Maps" link (`geo:` URL). The admin map uses Leaflet with a tile URL from the setting `care.map_tile_url`. If tiles do not load, the map falls back to a plain schematic (pins, radius ring, scale), as the mockup does. | Keeps the field app small and offline. Avoids depending on a free tile server for core features. |
| D10 | Push notifications are a later idea | Not built. "Are you OK?" on Android is a **local scheduled notification** (Capacitor local notifications, no server push). The server safety timer and SMS still work if the phone is dead. iPhone PWA shows the in-app prompt only while open. | No push vendor, no tokens to manage. |
| D11 | Module E "Requests inbox" with a new `service_requests` collection | **Do not create it.** The existing `Enquiry` module is the inbox. Add only "Convert to client" (WO-15). | The inbox, statuses, notes, reminders and SMS alerts already exist. |
| D12 | SMS acknowledge by replying `ACK` | **Acknowledge by secure link only** (login required). Delivery receipts are **not** assumed: the log says "Accepted" or "Failed", never "Delivered". | `docs/MAMBOSMS_NOTES.md` documents neither inbound messages nor delivery reports. |
| D13 | Backups by a server job to B2 | Backups run in **GitHub Actions** on a schedule (`backup.yml`), encrypted before upload to B2 with Object Lock. A monthly `restore-drill.yml` restores into a second database and compares counts. | Render cannot run `mongodump` safely, and this adds no server code. |
| D14 | Settings table `key/value` with scopes | Reuse the existing `settings` module and `defaults.py`. Add care keys there (WO-02). Resolution order: client, team, organisation, default, **only for keys that declare overrides**. | One settings system. |
| D15 | Login identifier undecided | Setting `auth.login_identifier` = `email`, `phone` or `either`, default `either`. Phone is stored in E.164 and looked up through the existing `core/phone.py`. | Spec 25.2. |
| D16 | PDPO, consent, retention | Build the screens, records and jobs. **Never write legal text.** All wording is a setting or a "client to supply" placeholder. | Needs a Ugandan lawyer. |

---

## 3. New dependencies (names only; the owner supplies pins in `docs/PINS_NURSE.md`)

Keep this list short. Anything else needs the owner's approval first.

| Package | Where | Why it is needed |
| --- | --- | --- |
| `dexie` | nurse | IndexedDB wrapper for the offline store. |
| `vite-plugin-pwa` (uses Workbox) | nurse | Offline app shell and install support. |
| `react`, `react-dom`, `react-router-dom`, `react-i18next`, `i18next`, `zod`, `react-hook-form`, `@tanstack/react-query` | nurse | Same pins as `frontend/package.json`. Do not use other versions. |
| `dexie`, `fake-indexeddb` (dev) | frontend, admin-native entry only | Offline cache and outbox for the admin app. Must stay out of the public site bundle (a test checks the public build does not contain it). |
| `@capacitor/push-notifications` | nurse and frontend admin-native (WO-17C) | Receives Firebase push messages. `google-services.json` is generated at build time from environment variables. |
| a Capacitor secure-storage plugin for tokens | nurse and frontend (WO-17B) | Keeps the refresh token safe in the Android apps. The owner picks it. |
| `leaflet` | frontend (admin) | Map with pin and radius circle. Loaded only on map screens by dynamic import. |
| `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/geolocation`, `@capacitor/local-notifications`, `@capacitor/app`, `@capacitor/preferences` | nurse (WO-17) | Android wrapper. |
| a maintained Capacitor background-location plugin | nurse (WO-17) | Background arrival prompt. The owner picks it (spec 14 `[FILL IN]`). Ask in the question round which plugin to use, or whether to build without background location. |
| `fake-indexeddb` | nurse, dev | Tests for the offline store. |
| `@axe-core/playwright` | frontend and nurse, dev | Automated accessibility checks. |
| Python: none | backend | Use what is already pinned. No Pillow, no Motor, no new SMS library, no Cloudinary SDK (use `httpx` and `hashlib`). |

---

## 4. How everything is proven (the test architecture)

CI is the judge, so the test suite must be strong enough that a green build means the feature works. There are seven layers. Each work order names the files for each layer it touches.

### 4.1 Backend unit tests (no database)

Pure functions in `rules.py` and `geo`: verification, thresholds, timesheet maths, alert rules, escalation, SMS text length, state machines. Table-driven with `pytest.mark.parametrize`. These run in a second. Aim for every branch.

### 4.2 Backend database tests (`test_db_*`, real MongoDB replica set)

Repository functions, unique indexes (idempotency), reach filtering, migrations idempotent, retention jobs, concurrency (two identical pushes at once create one record). Use the existing `mongo` fixture in `tests/conftest.py`.

### 4.3 Backend HTTP tests (`test_http_*`)

Through `httpx.ASGITransport`. Every new endpoint gets: success, 401 with no token, 403 with the wrong scope, 404 and 422 cases, reach isolation (nurse A cannot read nurse B), and the exact response shape. Plus **structural guards** (written once, in WO-00):
- `test_append_only.py`: for `visit_events`, `sos_events`, `care_logs`, `audit_log` repositories, assert no function named `update*`, `delete*`, `remove*`, `replace*` exists.
- `test_no_health_in_sms.py`: every SMS template, rendered with a worst-case context, contains no client name, address or health word, is within one GSM-7 message (160 characters), and uses only GSM-7 characters.
- `test_field_payloads.py`: the field API response models contain only the allowed nurse fields (client display name, place address text, coordinates for the map link, time, instructions). A new field fails the test until the allowed list is edited on purpose.

### 4.4 Generated route guards (extended in WO-00)

`test_scope_enforcement.py` and `test_route_coverage.py` already run over every `/api/v1/admin` route. WO-00 extends them to also cover **`/api/v1/field`** (every field route needs a scope, 401 without token, 403 without scope) and adds the allow-list entries the field API needs. After this, a new route with no scope fails CI automatically.

### 4.5 Frontend tests

- **Vitest and Testing Library** for components, hooks and the offline engine (`fake-indexeddb`): outbox ordering, retry and backoff, duplicate handling, "needs attention", logout guard, timer from stored time, SOS hold logic with fake timers.
- **Playwright end-to-end** (`nurse/e2e`, `frontend/e2e/care-*.spec.ts`) against the built apps and a real backend with MongoDB and MinIO started by CI (photos use the fake photo store in these runs). Browser offline mode is set with `context.setOffline(true)`. Geolocation is faked with Playwright's geolocation permission.
- **Layout and accessibility**: reuse `layout.spec.ts` rules for the nurse app (no sideways scroll, no text overflow) at 360, 390, 430 and 820 px, plus `@axe-core/playwright` on every screen.

### 4.6 Repository guards (scripts run by CI)

- `scripts/check-no-external.mjs`: scans the built output of `frontend/dist` and `nurse/dist` and fails on any URL whose host is not on `scripts/external-allowlist.txt` (own domains, `www.w3.org` for SVG namespaces, `api.cloudinary.com` in the nurse app only, the tile setting default). Catches Google Fonts, CDNs, analytics.
- `scripts/check-bundle-size.mjs`: fails if the nurse app's initial JavaScript is over 200 KB gzipped, or any single route chunk is over 80 KB gzipped, or Leaflet appears in the nurse bundle.
- `scripts/check-fonts.mjs`: fails if a font-family used in nurse CSS has no matching `@font-face` file.
- `scripts/check-strings.mjs`: fails on a UI string literal in nurse JSX outside the locale files.
- Shell guards in `ci.yml` stay (no `.env`, no Motor, no roles). Add: no `googleapis.com/css` in tracked files, and no `firebase` outside the files named in WO-17C. Cloudinary is allowed only in `backend/app/core/photo_store.py`, the nurse `photos` feature, tests and docs; a grep fails if it appears elsewhere.

### 4.7 OpenAPI and generated types without anyone running a command

The existing guard fails if `openapi.json` is stale, and the generated files need a command. You cannot run it, so **WO-00 adds `types-fix.yml`**: on every pull request, it runs `bash scripts/gen-types.sh`, and if the two generated files changed it commits them back to the pull request branch. The owner then re-runs CI. You never edit `openapi.json` or `api.d.ts` by hand.

### 4.8 Android build check

A CI job builds the debug APK (`npx cap sync android` then `./gradlew assembleDebug`) and uploads it as an artifact. A second job runs only on a version tag and builds the **signed** release APK using GitHub secrets for the keystore.

### 4.9 Golden fixtures (shared by server and client)

`shared/fixtures/geo_cases.json` (WO-03), `shared/fixtures/alert_cases.json` (WO-13), `shared/fixtures/timesheet_cases.json` (WO-12), `shared/fixtures/sync_cases.json` (WO-08). The Python tests and the TypeScript tests load the same file. A change to a rule means a change to the fixture in the same pull request.

### 4.10 Required CI jobs after WO-00

`guards`, `backend`, `frontend`, `nurse` (lint, typecheck, vitest, build, budgets, external-guard), `e2e` (public and admin), `field-e2e` (nurse app with the real backend), `layout`, `a11y`, `android-debug`, `types-fix`. Branch protection on `main` requires all of them (the owner sets this).

---

## 5. Conventions every work order follows

### 5.1 Scopes, reach and presets (built in WO-01)

**New scope ids** (exact; add none, remove none; WO-01 updates `EXPECTED` in `tests/test_scopes.py` to match):

| Group | Scope | Meaning |
| --- | --- | --- |
| Field work | `field:use` | Use the nurse app: own visits, check in and out, notes, photos, timesheet. Always own data only. |
| Field work | `sos:send` | Send an SOS. |
| Care operations | `nurses:read`, `nurses:write` | View, invite, deactivate, assign supervisor, per-nurse overrides. |
| Care operations | `clients:read`, `clients:write` | Care clients, places, stays. |
| Care operations | `visits:read`, `visits:write` | View visits and detail. Schedule, reassign, cancel, annotate. |
| Care operations | `flags:read`, `flags:write` | View and resolve flags. |
| Care operations | `photos:read` | View visit photos (each view is audited). Hiding a photo needs `photos:hide`. |
| Care operations | `photos:hide` | Hide a photo (audited). |
| Monitoring | `monitor:view` | Live dashboard, map, executive charts. |
| Monitoring | `alerts:read`, `alerts:write` | View, acknowledge, resolve alerts. |
| Monitoring | `timesheets:read`, `timesheets:approve` | View timesheets. Approve, send back, adjust. |
| Safety | `sos:read`, `sos:respond` | View SOS records. Acknowledge, note, resolve. |
| Safety | `oncall:read`, `oncall:write` | View and edit the on-call roster. |
| Setup | `carecfg:read` | View care settings and the readiness checklist. |
| Setup | `carecfg:write` | Change care settings, app releases. **Superadmin only** (add to `SUPERADMIN_ONLY_SCOPES`). |

Module D scopes (`clinical:read`, `clinical:write`, `care:log`) are **not** added until WO-18 is unlocked.

Existing scopes reused: `enquiries:*` for Module E, `reports:read` and `reports:export` for care reports, `activity:read` for the audit log, `users:*` for staff users, `system:manage` for SMS and retention.

**Reach** is a new field on `User`: `reach: "own" | "team" | "all"`, default `"own"`. It is read from the database by a dependency `get_care_actor` (new, in `app/core/deps.py`), never from the token or the request. `team` means nurses whose `NurseProfile.supervisor_id` equals the actor's user id. Field routes ignore reach and always use the caller's own user id.

**Presets** are constants in `scopes.py` named `SCOPE_PRESETS`, used by the Users screen ("Apply preset") and the seed. They fill in scopes and reach. They are never checked on the server.

| Preset | Scopes | Reach |
| --- | --- | --- |
| Nurse | `field:use`, `sos:send` | own |
| Supervisor | `nurses:read`, `clients:read`, `clients:write`, `visits:read`, `visits:write`, `flags:read`, `flags:write`, `photos:read`, `monitor:view`, `alerts:read`, `alerts:write`, `timesheets:read`, `timesheets:approve`, `sos:read`, `sos:respond`, `oncall:read`, `reports:read`, `dashboard:view` | team |
| Care admin | every care scope except `carecfg:write`, plus `enquiries:*`, `reports:*`, `activity:read` | all |
| Executive | every `*:read`, `monitor:view`, `dashboard:view`, `reports:read`, `reports:export`. No write scopes. | all |

### 5.2 Backend module template

For each new module `backend/app/modules/<name>/`: `models.py` (Beanie documents), `repository.py` (database only), `rules.py` (pure functions, no database, no clock: take `now` as an argument), `schemas.py` (Pydantic request and response models), `service.py` (orchestration), `router.py`. Then:
1. Register models in `DOCUMENT_MODELS` and routers in `ROUTERS` in `app/registry.py`.
2. Add a numbered migration `backend/migrations/000N_<name>.py` for every index and validator. Migrations must be safe to run twice (CI runs them twice).
3. Add demo data to `app/seed.py` (safe to run twice). Demo data uses invented names only.
4. Every datetime is timezone-aware UTC. Day and week boundaries use `ZoneInfo("Africa/Kampala")`. A rules function never calls `datetime.now()`.
5. Errors use `app/core/errors.py` (`Forbidden`, `Conflict`, `ValidationFailed`, ...). Never return raw exceptions.
6. Every admin or field write calls the audit service (`modules/audit/service.py`) with actor, action, entity, before and after.

Router prefixes: nurse-facing `/api/v1/field/...`, staff-facing `/api/v1/admin/care/...`, public `/api/v1/public/...`.

### 5.3 Data model (all new collections)

IDs: server-made documents use Mongo `_id`. Documents made on a phone also carry a client UUID in `id` (string, unique index). Visits created by staff also get a UUID `id` so the phone can reference them.

| Collection | Fields (type) |
| --- | --- |
| `users` (extend) | `kind` (`staff`/`nurse`, default `staff`), `reach` (`own`/`team`/`all`, default `own`), `phone_e164` (optional, indexed). |
| `nurse_profiles` | `user_id` (unique), `full_name`, `phone_e164`, `supervisor_id` (user id), `status` (`active`/`inactive`), `adhoc_override` (`null`/`true`/`false`), `last_seen_at`, `last_sync_at`, `app_version`, `platform`, `battery_pct`. |
| `devices` | `device_id` (client UUID, unique), `user_id`, `platform` (`ios-pwa`/`android-app`/`web`), `app_version`, `revoked_at`, `last_seen_at`. |
| `care_clients` | `display_name`, `notes_for_nurse` (max 280, non-sensitive), `photo_allowed` (default true), `status`, `supervisor_id`, `assigned_nurse_ids` (list), `source_enquiry_id`. |
| `places` | `client_id`, `label`, `address_text`, `geo` (GeoJSON Point `[lng, lat]`), `radius_m` (50 to 1000, default from setting), `is_primary`, `status`. |
| `place_stays` | `client_id`, `place_id`, `starts_on` (date), `ends_on` (date or null), `reason` (`home`/`hospital`/`care_facility`/`other`), `created_by`. |
| `visits` | `id` (UUID), `client_id`, `place_id`, `nurse_id`, `supervisor_id`, `scheduled_start`, `scheduled_end`, `status` (`scheduled`/`in_progress`/`completed`/`missed`/`cancelled`), `instructions` (max 280), `adhoc` (bool), `created_by`, `location_snapshot` `{address_text, lat, lng, radius_m, geo}`, `check_in_at`, `check_out_at` (denormalised from events), `safety_timer_until`, `safety_state` (`none`/`armed`/`confirmed_safe`/`overdue`), `cancel_reason`. |
| `visit_events` (append-only) | `id`, `client_op_id` (both unique), `visit_id`, `nurse_id`, `type` (`check_in`/`check_out`), `device_time`, `sent_at_device`, `server_received_at`, `lat`, `lng`, `accuracy_m`, `source` (`app_auto`/`app_manual`/`pwa_manual`/`admin_edit`), `verification`, `distance_m`, `clock_offset_s`, `device_info`. |
| `visit_notes` (append-only) | `id`, `client_op_id`, `visit_id`, `author_id`, `body` (max 1000), `created_at_device`, `server_received_at`, `geo_snap`, `in_range`, `distance_m`. |
| `visit_photos` | `id`, `client_op_id`, `visit_id`, `nurse_id`, `kind` (`arrival`/`departure`/`other`), `caption` (max 140), `public_id`, `thumb_public_id`, `bytes`, `width`, `height`, `content_type`, `captured_at_device`, `geo_snap`, `server_received_at`, `status` (`registered`/`hidden`), `hidden_by`, `hidden_reason`. |
| `visit_flags` | `id`, `visit_id`, `type` (`outside_radius`, `low_accuracy`, `no_location`, `clock_skew`, `duration_short`, `duration_long`, `missing_checkout`, `left_site`, `adhoc`), `dedupe_key` (unique), `resolved`, `resolved_by`, `resolved_note`, `resolved_at`. |
| `consents` | `user_id`, `type` (`privacy_notice`/`location`), `version`, `accepted_at`. |
| `app_releases` | `platform`, `version`, `min_supported_version`, `storage_key`, `sha256`, `notes`, `released_at`. |
| `timesheets` | see WO-12. |
| `alerts` | see WO-13. |
| `sos_events` (append-only) | see WO-14. |
| `oncall_rosters` | see WO-14. |
| `sms_log` (extend existing `SmsLog`) | add optional `purpose`, `ref_type`, `ref_id`, `test`, `cost`. |

`geo_snap` is the embedded object `{lat, lng, accuracy_m, captured_at}` or `null`.

### 5.4 Frontend conventions

- Admin care screens: `frontend/src/features/admin/care/<screen>/` with `Page.tsx`, `Page.test.tsx`, strings in `frontend/src/locales/en/adminCare.ts`. Add each to `ADMIN_NAV` in `nav.ts` with its scopes. Use the existing table, form, badge and layout components. Look and behaviour copy the mockup file page of the same name.
- Nurse app: `nurse/src/{app,features,lib,locales,design}` where `features` has `auth, visits, sync, photos, history, timesheets, sos, settings`, and `lib` has `db` (Dexie), `api`, `location`, `platform`, `time`, `geo`.
- Strings: all UI text in `locales/en/*.ts`. Components use `t('key')`.
- Styling: CSS modules, using the tokens in `design/tokens.css` (nurse imports it through a Vite alias to `../design/tokens.css`). **No hardcoded colours** anywhere else. Fonts: `nurse/public/fonts` is filled by `scripts/copy-fonts.mjs` from `frontend/public/fonts` during `npm run build` and in CI.
- Motion: 150 to 250 ms, `prefers-reduced-motion` respected, as in the mockup.
- Touch: targets at least 48 px. Primary action full width, 56 px, in the lower third.

---

## 6. Work orders

Order is fixed. Each lists: **Goal**, **Spec**, **Depends on**, **Files**, **Rules and behaviour**, **Tests to write**, **Out of scope**, **Done when**.

---

### WO-00 Foundations and CI (no features)

**Goal.** Make CI strong enough to judge everything that follows.
**Spec.** 0, 4, 17 Phase 0 and 1. **Depends on.** Nothing.

**Files.**
- `docs/nurse-module-spec.md` (the v1.4 spec, copied unchanged), `docs/NURSE_BUILD_PLAN.md` (this file), `docs/PINS_NURSE.md` (a table with the package names from Section 3 and an empty "Pin" column), `reference/nest-all-features-mockups.html`.
- `.github/workflows/types-fix.yml`, `.github/workflows/ci.yml` (add jobs), `.github/workflows/nurse.yml`.
- `scripts/check-no-external.mjs`, `scripts/external-allowlist.txt`, `scripts/check-bundle-size.mjs`, `scripts/check-fonts.mjs`, `scripts/check-strings.mjs`, `scripts/copy-fonts.mjs`.
- `backend/tests/test_append_only.py`, `test_no_health_in_sms.py`, `test_field_payloads.py` (skeletons that scan the modules and pass while the modules do not exist yet).
- `nurse/` skeleton: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/app/App.tsx` (a placeholder page using the tokens and fonts), `eslint.config.js`, `.prettierrc`, `vercel.json` (SPA rewrite, `X-Robots-Tag: noindex`, CSP `default-src 'self'; img-src 'self' data: blob:; connect-src 'self' <API origin> https://api.cloudinary.com; frame-ancestors 'none'`).
- `shared/fixtures/.gitkeep`.

**Behaviour.**
- `types-fix.yml`: on `pull_request`, run `bash scripts/gen-types.sh`; if `frontend/src/types/openapi.json` or `api.d.ts` changed, commit and push to the PR branch with the message `chore: regenerate API types`. Skip if the PR is from a fork.
- Extend `backend/tests/test_scope_enforcement.py` so `admin_cases()` includes paths starting `/api/v1/field` as well as `/api/v1/admin`. In `test_route_coverage.py`, allow the prefix `/api/v1/field` in `test_every_route_is_public_auth_or_admin`, and make the frontend-call scan also read `nurse/src`.
- `nurse.yml` job: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `node ../scripts/check-no-external.mjs dist`, `node ../scripts/check-bundle-size.mjs dist`, `node ../scripts/check-fonts.mjs`, `node ../scripts/check-strings.mjs`.
- In `ci.yml` `guards`: add greps that fail on `firebase` outside the WO-17C files, `fonts.googleapis`, `fonts.gstatic`, `unpkg.com`, `cdn.jsdelivr` in tracked source (excluding `docs/` and `reference/`).
- Add `frontend` build step `node ../scripts/check-no-external.mjs dist` and fix nothing else: if it finds an external URL in the existing site, **ask the owner, do not remove it**.

**Tests to write.**
- `scripts/__tests__/check-no-external.test.mjs` (Node `node:test`): a fixture dist folder with a Google Fonts link fails, a clean one passes, an allow-listed host passes.
- Same style for `check-bundle-size` (a fake 250 KB gzip fails, 150 KB passes) and `check-strings`.
- `nurse/src/app/App.test.tsx`: renders and shows the app name from the locale file.
- `backend/tests/test_append_only.py`: parametrised over the module names `visit_events`, `visit_notes`, `sos`, `care_logs`, `audit`; for each module that exists, asserts its `repository.py` has no function whose name starts with `update`, `delete`, `remove` or `replace`. Skips modules that do not exist yet but fails if the list of expected modules is empty.
- `backend/tests/test_no_health_in_sms.py`: loads `app.modules.notifications.templates` (created in WO-13; skip until it exists) and checks length, GSM-7 charset and banned words.
- `backend/tests/test_field_payloads.py`: skip until `app.modules.field` exists; then assert the exact allowed field names.

**Out of scope.** Any feature, any model, any screen.
**Configuration tests (WO-00).** Add `tests/test_env_example.py`, `tests/test_env_docs.py`, `tests/test_settings_defaults.py`, `tests/test_scheduler_flag.py` and the two hard-coded-value guard scripts from Section 12.3 in this work order, together with an initial `docs/ENV_VARS.md`. Every later work order that adds an environment variable adds it to `Settings`, `.env.example` and `docs/ENV_VARS.md` in the same change, or these tests fail.

**Done when.** CI is green with the new jobs, the nurse placeholder builds, and the external-URL check runs on both apps.


---

### WO-01 Scopes, reach, presets, nurse accounts

**Goal.** The permission foundation for everything else.
**Spec.** 5, 25.2 `auth.*`, 17 Phase 2. **Depends on.** WO-00.

**Files.**
- Change `backend/app/modules/auth/scopes.py` (new scopes, `SCOPE_PRESETS`, `carecfg:write` in `SUPERADMIN_ONLY_SCOPES`).
- Change `backend/app/modules/auth/models.py` (`kind`, `reach`, `phone_e164`), `schemas.py`, `service.py`, `router.py` (login accepts phone or email per setting).
- Change `backend/app/core/deps.py`: add `ReachContext` and dependency `get_care_actor`.
- New module `backend/app/modules/nurses/` (`models.py` `NurseProfile` and `Device`, `repository.py`, `schemas.py`, `service.py`, `router.py`).
- New `backend/migrations/0006_care_users.py` (unique index on `nurse_profiles.user_id`, `devices.device_id`; index `users.phone_e164`).
- Change `backend/app/seed.py` (demo supervisor, three demo nurses, with passwords from env only in development).
- Frontend: change `frontend/src/features/admin/users` to show the new scope groups and an "Apply preset" control; add `reach` select. Strings in `adminCare.ts`.
- Update `backend/tests/test_scopes.py` `EXPECTED` to the exact new list.

**Behaviour.**
- `get_care_actor(principal)`: loads the user, returns `ReachContext(user_id, reach, team_nurse_ids)`. A superadmin gets `all`. `team_nurse_ids` comes from `nurse_profiles` where `supervisor_id == user_id`. Inactive users are rejected.
- Helper `reach_filter(ctx, nurse_field="nurse_id")` returns a Mongo filter: `own` -> `{nurse_field: ctx.user_id}`, `team` -> `{nurse_field: {"$in": team}}`, `all` -> `{}`.
- Admin endpoints (all `/api/v1/admin/care/nurses`, scope in brackets): `GET` list [`nurses:read`], `POST` invite [`nurses:write`] (creates user kind `nurse`, scopes from the Nurse preset, sets a one-time set-password link through the existing invite flow), `GET /{id}`, `PATCH /{id}` (name, phone, status), `PATCH /{id}/supervisor` (audited), `PATCH /{id}/adhoc-override` [`carecfg:write`], `POST /{id}/revoke-device`.
- Login: `auth.login_identifier` setting (WO-02) decides; until it exists, default `either`. If the identifier contains `@` treat as email, otherwise normalise to E.164 with `core/phone.py`.
- Only a superadmin can grant `carecfg:write` (existing rule via `SUPERADMIN_ONLY_SCOPES`).

**Tests to write.**
- `tests/test_scopes.py` (changed): registry equals the new `EXPECTED`; `carecfg:write` is superadmin-only; no scope implies another; every preset contains only valid scopes; presets contain no `carecfg:write`.
- `tests/test_care_reach.py` (unit): `reach_filter` for own, team, all; team with empty list returns a filter that matches nothing; superadmin gets all.
- `tests/test_db_nurses.py`: invite creates user and profile; duplicate phone rejected; supervisor change writes an audit row; deactivated nurse cannot get a token; `team_nurse_ids` correct.
- `tests/test_http_nurses.py`: 401 without token, 403 without `nurses:write`, supervisor reach shows only own team, nurse token cannot call admin routes, phone login works when setting is `phone` or `either` and fails when `email`.
- Existing generated guard tests must pass unchanged for the new routes (they are scanned automatically).
- Frontend: `Users` screen test: the preset button fills scopes; `carecfg:write` checkbox is disabled for non-superadmins.

**Out of scope.** Clients, visits, the nurse app.
**Done when.** CI green and the demo supervisor can be seen to have team-only reach by the HTTP test.

---

### WO-02 Care settings and the readiness checklist

**Goal.** Every variable lives in settings with a safe default.
**Spec.** 25, 17 Phase 2B. **Depends on.** WO-01.

**Environment layer.** Every key in this registry is also settable by environment variable, with the precedence, naming rule, parsing, generated docs and tests in Section 12.6. Build that in this work order.

**Files.** Change `backend/app/modules/settings/defaults.py`, `schemas.py`, `service.py`, `router.py`; new `backend/app/modules/settings/care_keys.py`; new route `GET /api/v1/admin/care/readiness` [`carecfg:read`]; frontend `features/admin/care/settings/` and `features/admin/care/readiness/`.

**Behaviour.**
- A typed registry `CARE_SETTINGS` in `care_keys.py` with, for each key: id, type, default, allowed values or range, `required_before_go_live` (bool), `overridable_at` (`org`, `team`, `client`, `place`), `group`. Use **exactly** the keys and defaults in spec 25.2, plus: `visits.sync_window_past_hours` (24), `visits.sync_window_future_days` (14), `field.geo_snap_wait_s` (3), `field.checkin_fix_wait_s` (10), `care.map_tile_url`, `care.module_b_enabled`, `care.module_c_enabled`, `care.module_d_enabled`, `thresholds.clock_skew_min` (10), `timesheets.*` as spec.
- Resolution function in `rules.py`: `resolve(key, org, team=None, client=None, place=None)` picks the narrowest override only if the key allows it.
- Writes need `carecfg:write`, are validated against type and range, and are audited with before and after.
- `GET /api/v1/field/me` (WO-04) returns resolved settings for that nurse.
- Readiness endpoint returns a list of `{id, label, blocking, status: "set"|"default"|"missing", detail}` built from spec 25.3 plus: privacy notice version set, retention values set, at least one supervisor with at least one nurse, SOS prerequisites (responder, SMS enabled, emergency numbers) when `care.module_c_enabled`, and `database_tier_ok` and `restore_test_ok` which read from two settings the owner sets by hand (`ops.database_off_m0`, `ops.restore_test_passed`).
- `sos.enabled` is **forced false in the resolved settings** while any SOS prerequisite is missing, with the reason string, regardless of the stored value.

**Tests to write.**
- `tests/test_care_settings_rules.py`: every key has a default of the right type; an out-of-range value fails validation; client override wins over team over org over default only for keys that allow it; a key that does not allow override ignores it; `sos.enabled` forced false with each prerequisite missing in turn.
- `tests/test_db_care_settings.py`: write is audited with before and after; read falls back to default.
- `tests/test_http_care_settings.py`: 403 without `carecfg:write`; `carecfg:read` can read but not write; readiness lists the blocking items as "missing" on a fresh database.
- Existing `test_settings_rules.py` must keep passing.
- Frontend: settings page renders one control per key type (toggle, number, text, list) and disables fields for users without write.

**Out of scope.** Using the settings (later work orders do).
**Done when.** CI green; readiness shows every blocking item as missing on a fresh seed.

---

### WO-03 Domain core: clients, places, stays, visits, geo

**Goal.** The data and the verification logic, with no screens.
**Spec.** 6, 6.3, 9, 12.10. **Depends on.** WO-01, WO-02.

**Files.**
- New modules `backend/app/modules/care_clients/`, `places/`, `visits/` (models, repository, rules, schemas, service; routers come in WO-05), `geo/` (`rules.py` only), `flags/` (`models.py`, `repository.py`, `rules.py`).
- `backend/migrations/0007_care_core.py` (all indexes in Section 5.3 and spec 6.3: unique `visits.id`, `visit_events.id` and `client_op_id`, `visit_notes`, `visit_photos`, `visit_flags.dedupe_key`; compound `visits {nurse_id, scheduled_start}`, `{supervisor_id, scheduled_start}`, `{status, scheduled_start}`; `places.geo` as `2dsphere`; `place_stays {client_id, starts_on:-1}`; and Mongo JSON-schema validators on the append-only collections).
- `shared/fixtures/geo_cases.json` and the TypeScript port is added in WO-07.
- Seed: three demo care clients with places and stays, a week of demo visits.

**Behaviour (rules, all pure).**
- `geo.haversine_m(lat1, lng1, lat2, lng2)` with Earth radius 6,371,008.8 m.
- `geo.verify(event, snapshot, settings)`:
```
if lat or lng is None               -> no_location
elif accuracy_m > max_accuracy_m    -> low_accuracy
elif distance_m <= radius_m + min(accuracy_m, 50) -> verified
else                                -> outside_radius
```
  Defaults `radius_m` from the **visit snapshot**, `max_accuracy_m` 100. Returns `(verification, distance_m)`; distance is `None` for `no_location`.
- `visits.rules.make_snapshot(place)` copies address, lat, lng, radius, geo. Verification always uses the snapshot. Editing a place never changes any existing visit.
- `visits.rules.next_status(visit, event)` state machine: `scheduled -> in_progress` on check-in; `in_progress -> completed` on check-out; `cancelled` and `completed` are terminal for events (a late event on them is rejected by WO-04); `missed` is set by the alerts job (WO-13) and a late check-in still moves `missed -> in_progress`.
- `flags.rules.flags_for_event(event_result, visit, settings)` returns the flag types to create: `no_location`, `low_accuracy`, `outside_radius` for non-verified check-in or out; `clock_skew` when `abs(clock_offset_s) > clock_skew_min * 60`; and for a completed visit `duration_short` (below `short_visit_pct` of scheduled) or `duration_long` (above 2 times scheduled, setting `thresholds.long_visit_pct` default 200). Dedupe key `"{visit_id}:{type}:{event_id}"`.
- `place_stays.rules.current_place(stays, on_date)` returns the stay whose `starts_on <= date < ends_on` (null end means open). `move_client(stays, new_place, starts_on)` closes the open stay the day before and rejects overlapping or backdated moves.
- Retention-safe: events and flags never store the client's name.

**`shared/fixtures/geo_cases.json`** (client place at 0.3476, 32.6130, radius 150, max accuracy 100). Write these cases exactly; distances are within 0.5 m:

| Case | lat | lng | accuracy_m | Expect | distance_m |
| --- | --- | --- | --- | --- | --- |
| exact | 0.3476 | 32.6130 | 10 | verified | 0.0 |
| 100 m, acc 20 | 0.3484993 | 32.6130 | 20 | verified | 100.0 |
| 160 m, acc 20 | 0.3490389 | 32.6130 | 20 | verified | 160.0 |
| 160 m, acc 5 | 0.3490389 | 32.6130 | 5 | outside_radius | 160.0 |
| 195 m, acc 60 | 0.3493537 | 32.6130 | 60 | verified | 195.0 |
| 205 m, acc 60 | 0.3494436 | 32.6130 | 60 | outside_radius | 205.0 |
| poor accuracy | 0.3476 | 32.6130 | 120 | low_accuracy | 0.0 |
| accuracy at limit | 0.3476 | 32.6130 | 100 | verified | 0.0 |
| far | 0.3513052 | 32.6130 | 18 | outside_radius | 412.0 |
| no fix | null | null | 0 | no_location | null |

**Tests to write.**
- `tests/test_geo_rules.py`: loads the fixture and checks every row; a known real pair (Kampala to Entebbe, about 31.97 km) within 1%; symmetry; zero distance.
- `tests/test_visit_rules.py`: every legal and illegal state transition; snapshot isolation (changing the place does not change the snapshot); late event on `cancelled` is not applicable.
- `tests/test_flag_rules.py`: each flag type from a table of inputs; clock skew at exactly the threshold does not flag, one second over does; short and long duration boundaries; dedupe keys.
- `tests/test_stay_rules.py`: current place on boundary dates; overlap and backdate rejected; moving closes the previous stay.
- `tests/test_db_care_core.py`: unique indexes reject a duplicate visit id, event id and `client_op_id`; the `2dsphere` query finds a place within a radius; migration runs twice without error; validator rejects an event with a bad `type`.
- `tests/test_db_migrations_seed.py` (changed): seed runs twice and creates no duplicates.

**Out of scope.** Endpoints and screens.
**Done when.** CI green and the geo fixture passes in Python.

---

### WO-04 Field API (the nurse-facing server, online only)

**Goal.** Everything a nurse's phone needs from the server, with the verification and flag logic wired in.
**Spec.** 7.1, 9, 11, 16. **Depends on.** WO-03.

**Files.** New `backend/app/modules/field/` (`router.py`, `schemas.py`, `service.py`, `rules.py`), changes to `app/registry.py`, `app/core/rate_limit.py` usage, `tests/` below.

**Endpoints** (prefix `/api/v1/field`, all need scope `field:use` and the caller's own user id; none take a nurse id from the request):

| Method and path | Purpose |
| --- | --- |
| `GET /me` | Profile, resolved settings (photo rules, adhoc allowed, SOS enabled, thresholds the app needs, guidance text), consents still needed, `min_app_version`. |
| `POST /consents` | Body `{type, version}`. Saves a `consents` row. |
| `GET /visits?date=YYYY-MM-DD` | The nurse's visits for that Kampala day, sorted by start, in-progress first. |
| `GET /visits/{id}` | One visit. 404 if not the caller's (never 403, so existence is not revealed). |
| `POST /visits/{id}/check-in` | See below. |
| `POST /visits/{id}/check-out` | See below. |
| `POST /visits/{id}/notes` | Body `{id, client_op_id, body, created_at_device, geo_snap}`. |
| `GET /history?page=&page_size=` | Past visits with the simple status. |
| `POST /heartbeat` | `{device_id, app_version, platform, battery_pct}`; updates `nurse_profiles` and `devices`. |
| `GET /app/version?platform=android` | `{latest, min_supported, download_path}`. |

**Check-in and check-out body:** `{id, client_op_id, device_time, sent_at_device, lat, lng, accuracy_m, source, device_info, safety_timer_minutes?}`.

**Core service functions** (the sync endpoint in WO-08 calls the same ones, so the logic exists once): `record_event(nurse, visit_id, payload, received_at) -> OpResult` and `record_note(...)`. `OpResult` is `{status: "accepted"|"duplicate"|"rejected", reason?, server?}`.

**Rules.**
1. Look up by `client_op_id`: if it exists, return `duplicate` with the original result. Insert uses the unique index, so two simultaneous identical requests produce one row and one `duplicate`.
2. The visit must exist and belong to the nurse, else `rejected visit_not_assigned`.
3. `cancelled` visit: `rejected visit_cancelled`. Check-in on an `in_progress` visit: `rejected already_checked_in`. Check-out with no check-in: `rejected not_checked_in`. Check-out on `completed`: `rejected already_checked_out`.
4. `clock_offset_s = server_received_at - sent_at_device` (seconds; positive means the phone clock is behind). The event's true time is estimated as `device_time + clock_offset_s`; the stored `device_time` is not changed.
5. Verify with `geo.verify` using the visit snapshot. Create flags from `flags_for_event`. Update `visit.status`, `check_in_at`, `check_out_at`, and, if `safety_timer_minutes` was sent on check-in, `safety_timer_until = scheduled_end + minutes` and `safety_state = armed`. Check-out sets `safety_state = confirmed_safe`.
6. Nurse-facing result shows only `verification_label`: `verified` or `needs_review`. Never distance, accuracy or flag names.
7. Every accepted action updates `last_seen_at`.
8. A nurse who has not accepted the current consent versions gets `403 consent_required` from every route except `/me` and `/consents`.
9. A revoked device (`devices.revoked_at` set) gets `401 device_revoked` and the app clears local data after sync.
10. Rate limits: `/heartbeat` 6 per minute per user; others 120 per minute per user. Use `core/rate_limit.py`.

**Field response models** contain only: client display name, place address text, latitude and longitude (for the maps link), scheduled start and end, status, instructions, `adhoc`, check-in and check-out times, `verification_label`, photo count and rules, `safety_state`. `test_field_payloads.py` pins this list.

**Tests to write.**
- `tests/test_field_rules.py`: clock offset maths (phone 5 minutes behind and 5 minutes ahead); which result each state and event pair gives (table of all combinations in rules 2 and 3); safety-timer arming.
- `tests/test_db_field.py`: duplicate `client_op_id` returns `duplicate`; two concurrent identical check-ins (`asyncio.gather`) leave exactly one event; check-in then check-out sets status and denormalised times; verification and flags saved for the five fixture cases; note saved with `in_range`.
- `tests/test_http_field.py`: 401 no token; 403 for a token with only `sos:send`; nurse A gets 404 (not 403) for nurse B's visit; consent gate; response has no distance or flag fields; revoked device 401; `/me` hides SOS when prerequisites are missing; `/visits` returns only the Kampala day (test with an event at 21:30 UTC, which is the next day in Kampala).
- `tests/test_field_payloads.py`: remove the skip; assert the exact allowed field names.
- Existing generated tests (`test_scope_enforcement`, `test_route_coverage`) pass for the new routes.

**Out of scope.** Offline sync, photos, unscheduled visits, SOS.
**Done when.** CI green.

---

### WO-05 Admin care API

**Goal.** Staff can set up care and see what happened.
**Spec.** 7.2, 12.1 to 12.6, 12.9, 12.10. **Depends on.** WO-04.

**Endpoints** (prefix `/api/v1/admin/care`; every one needs a scope and applies reach):

| Path | Methods | Scopes | Notes |
| --- | --- | --- | --- |
| `/clients` | GET, POST | `clients:read` / `clients:write` | Reach: team sees clients whose `supervisor_id` is theirs. |
| `/clients/{id}` | GET, PATCH | same | `photo_allowed`, notes (max 280), assigned nurses. |
| `/clients/{id}/places` | GET, POST | same | Validates lat -90..90, lng -180..180, radius 50..1000. |
| `/places/{id}` | PATCH | `clients:write` | Never changes existing visit snapshots. |
| `/clients/{id}/stays` | GET, POST | same | POST is "move client". Option `repoint_future_visits` re-snapshots only visits with `status = scheduled` and `scheduled_start` after the move date. |
| `/visits` | GET | `visits:read` | Filters: date range, nurse, client, status, verification, flagged only, adhoc. Page based. |
| `/visits` | POST | `visits:write` | Schedule. Nurse and client must be in the actor's reach. The place must belong to the client. End after start. Overlap for the same nurse returns `409 nurse_busy` with the clashing visit ids unless `confirm_overlap: true`. |
| `/visits/{id}` | GET | `visits:read` | Visit with events (with distance, accuracy, source), notes, flags, photo count, audit trail. |
| `/visits/{id}` | PATCH | `visits:write` | Reassign (reach check on the new nurse), change time, instructions. Only while `scheduled`. |
| `/visits/{id}/cancel` | POST | `visits:write` | Needs a reason. Never deletes. |
| `/visits/{id}/annotate` | POST | `visits:write` | Adds an audited comment. Never edits events. |
| `/flags` | GET | `flags:read` | Open first, by raised time. |
| `/flags/{id}/resolve` | POST | `flags:write` | Note required (3 to 500 characters). |
| `/team` | GET | `visits:read` | Today's status per nurse in reach: not started, in progress, completed, flagged. |
| `/reports/visits` | GET | `reports:read`; `?format=csv` also needs `reports:export` | Date range, nurse, client. Totals plus rows. |

**Rules.** Reach is applied by the repository through `reach_filter`; a route never trusts a nurse id from the query for authorisation. CSV cells that start with `=`, `+`, `-` or `@` are prefixed with a single quote. CSV is streamed. Every write calls the audit service. Photo count only; photos come in WO-09.

**Tests to write.**
- `tests/test_visit_scheduling_rules.py`: overlap detection table (touching ends do not overlap); place must belong to client; end after start.
- `tests/test_csv_export.py`: injection prefix for each dangerous first character; commas and quotes escaped; header row.
- `tests/test_db_care_admin.py`: move client closes the previous stay and re-points only future scheduled visits (a completed visit and a past visit keep their snapshot); reach filters on visits and flags; resolve flag stores note and user.
- `tests/test_http_care_admin.py`: for each endpoint: 401, 403 with the wrong scope, supervisor sees only team data (two supervisors, cross-check both directions), admin sees all, 409 overlap and the confirm flow, annotate leaves events untouched, report totals match seeded data.
- Generated guards pass for every new route.

**Out of scope.** Screens, photos, alerts.
**Done when.** CI green.

---

### WO-06 Admin screens, part 1 (setup)

**Goal.** Staff set up nurses, clients, places and the schedule.
**Spec.** 12.1 to 12.3, 12.10, 17 Phase 3. **Depends on.** WO-05. **Look.** Mockup pages: Nurses, Nurse detail, Invite nurse, Clients, Client detail, Location editor, Move client, Schedule, New visit, Reassign or cancel, My team.

**Files.** `frontend/src/features/admin/care/{nurses,clients,places,schedule,team}/`, `components/PlaceMap.tsx`, nav entries (group `care`, scopes as in WO-05), strings in `adminCare.ts`. Add `leaflet` as a **dynamic import** inside `PlaceMap`.

**Behaviour.**
- `PlaceMap`: shows a pin and a radius circle, click to move the pin, radius slider 50 to 1000 in steps of 10, address search is **text only** (no geocoding service): the admin types an address and then places the pin by hand. Tiles from `care.map_tile_url`; on tile error the component shows the schematic fallback with the pin and ring. A warning banner "Check the pin on the map" is always shown for a new place.
- Forms use react-hook-form with zod; error text is plain and sits next to the field.
- Tables use the existing table component and the page-based API.
- Supervisors see only their team because the API says so; screens add no extra filtering.

**Tests to write.**
- Vitest: each form validates (phone format, radius range, end after start); `PlaceMap` shows the fallback when the tile loader reports an error; preset and reach controls; nav items hidden without scopes (`nav.test.ts` extended with the care entries).
- Playwright `frontend/e2e/care-setup.spec.ts` (real backend): sign in as the seeded care admin, create a nurse, create a client with a place, move the client, schedule a visit, see it in the list, cancel it with a reason.
- Playwright `care-supervisor-scope.spec.ts`: a supervisor does not see another team's nurse.
- axe check on each screen.

**Out of scope.** Visits table and detail (WO-11).
**Done when.** CI green.

---

### WO-07 Nurse app, online MVP (PWA)

**Goal.** A nurse can sign in, see the day, arrive and leave. Online only.
**Spec.** 10, 11.1 to 11.10, 17 Phase 4. **Depends on.** WO-04. **Look.** Mockup pages: Sign in, Privacy and consent, Location explained, iPhone install, Today, Visit detail, Arrive sheet, Active visit, Leave sheet, History, Past visit, Profile, Permissions help, Log out guard.

**Files.** `nurse/src/...` per Section 5.4; `nurse/src/lib/geo` (TypeScript port of `haversine_m` and `verify`, display hints only); `nurse/src/lib/location/web.ts`; `nurse/src/lib/time` (Kampala formatting, `elapsed(deviceTime)`); `nurse/src/lib/api` (typed client using the generated `api.d.ts` copied from `frontend/src/types` by `scripts/copy-types.mjs`); components `Button`, `Card`, `StatusChip`, `BottomSheet`, `Timer`, `ConnectionBanner`, `EmptyState`, `Skeleton`, `Toast`, `FormField`, `TabBar`; `public/manifest.webmanifest`; `vite-plugin-pwa` precache of the app shell only.

**Behaviour.**
- Tokens: access token in memory, refresh token handling exactly as the existing admin does (copy the pattern, do not invent a new one). Session length from `/me`.
- First login: consent screen (versions from `/me`), then the location explanation, then on iPhone in a browser tab the install hint (once).
- Today: calls `GET /visits?date=today`, in-progress visit pinned. Pull to refresh.
- Arrive sheet: asks the location adapter for a fix with a **10 second** wait; Confirm is enabled at once; if there is no fix, saves with null coordinates. The optional safety timer toggle appears only when `sos.enabled` is true.
- Timer is `now - device_time` of the check-in, computed on every render, so it survives a reload.
- History shows only the simple status chip.
- Copy follows spec 10.4.
- Performance: route-level code splitting; no map library; initial JS under the budget.

**Tests to write.**
- Vitest: `geo` port against `shared/fixtures/geo_cases.json` (same rows as Python); `elapsed` after a simulated reload; Kampala date formatting across midnight UTC; each component's states; the Arrive sheet enables Confirm with no fix; no UI string is a literal (script check); consent gate blocks navigation until accepted.
- Playwright `nurse/e2e/field-online.spec.ts` (real backend, seeded nurse, `geolocation` granted and set near the demo place): consent, arrive, see the timer, leave, see "Visit saved"; admin API shows two events with `verified`. A second case sets a position 500 m away: the nurse sees "Needs review" and no distance; admin API shows the `outside_radius` flag. A third case denies location: check-in still works and the flag is `no_location`.
- Playwright `nurse/e2e/layout.spec.ts` at 360, 390, 430, 820 px: no sideways scroll, no text overflow, tap targets at least 48 px, safe-area padding present.
- `nurse/e2e/a11y.spec.ts`: axe on every screen reached.

**Out of scope.** Offline, photos, SOS, unscheduled visits, timesheets.
**Done when.** CI green; initial JS under 200 KB gzipped.

---

### WO-08 Offline-first and sync

**Goal.** Everything a nurse does works with no signal and syncs once, exactly once.
**Spec.** 8, 17 Phase 5. **Depends on.** WO-07.

**Server files.** `backend/app/modules/field/sync.py`, routes `GET /api/v1/field/sync/pull?cursor=` and `POST /api/v1/field/sync/push`.

**Pull.** Returns visits for this nurse from `now - visits.sync_window_past_hours` to `now + visits.sync_window_future_days`, each with its snapshot place fields and client display name and notes, plus `removed_visit_ids` (visits reassigned or cancelled since the cursor), resolved settings, `server_time`, and a new `cursor`. The cursor is an opaque string made from `(updated_at, id)` of the last item; an empty or invalid cursor means "from the start of the window". Server wins for schedule data.

**Push body.** `{device_id, sent_at_device, ops: [{client_op_id, kind, payload, queued_at_device}]}`. Max 50 ops and 256 KB. Kinds in this work order: `visit_event`, `visit_note`, `safety_confirm`. (`visit_create_adhoc` is WO-10; photos use their own endpoint in WO-09.) Ops are processed **in the order given**, each independently, calling the same service functions as WO-04. Response `{results: [{client_op_id, status, reason?, server?}], cursor}`. An unknown kind gives `rejected unsupported_kind`; a bad payload gives `rejected invalid_payload` and never a 500.

**Client files.** `nurse/src/lib/db/schema.ts` (Dexie tables `visits`, `clients`, `outbox`, `meta`, `photos` stub), `nurse/src/features/sync/{engine.ts, outbox.ts, backoff.ts, status.ts}`, screens Sync and the ConnectionBanner, safe logout, `navigator.storage.persist()` on first run, Workbox app-shell precache.

**Client rules.**
1. Writes go to the local database first, then the outbox, in one Dexie transaction. The UI reads only from the local database.
2. Pull on open, on regained connection, and every 5 minutes while open (setting). Push after every local write when online and on regained connection.
3. Backoff delay in seconds: `min(300, 2 * 2^attempt)` (2, 4, 8, ... 300). No random jitter in the function; add jitter only in the caller.
4. Server answer `accepted` or `duplicate`: delete the op. `rejected`: move to `needs_attention` with the plain reason text from the locale file and never retry. Network error or 5xx: keep, increase attempts.
5. An expired token while offline never touches the outbox; when online the app asks the nurse to sign in again and then continues.
6. Logout with pending ops asks for explicit confirmation (the guard sheet). Local data is cleared on logout only when the outbox is empty or the nurse confirmed.
7. `sent_at_device` is the phone clock at the moment of sending, not at queue time.
8. Banner states: offline (grey), syncing (blue), problem (amber), saved (green, 4 seconds).

**`shared/fixtures/sync_cases.json`.** A list of scenarios; each has the starting server state, the ops pushed and the expected `results`. Include: check-in then check-out in one batch; same batch pushed twice; check-out before check-in in the batch order (expect `rejected not_checked_in`); visit reassigned to another nurse (expect `rejected visit_not_assigned`); cancelled visit; unknown kind; a note on a completed visit (accepted); batch of 51 (expect 413 `too_many_ops`).

**Tests to write.**
- Backend: `tests/test_sync_rules.py` (cursor encode and decode, window maths, op ordering); `tests/test_db_sync.py` (replay the fixture file; two simultaneous identical pushes create one set of rows; push of 50 ops stays under 1 second on the test database); `tests/test_http_sync.py` (auth, size limits, malformed JSON 422, per-op isolation: one bad op does not stop the others).
- Vitest with `fake-indexeddb`: `backoff.test.ts` (exact values 2, 4, 8, ... 300); `outbox.test.ts` (order preserved, atomic write with the visit change, `accepted`/`duplicate` delete, `rejected` goes to needs attention, network error keeps and counts); `engine.test.ts` with a fake API replaying `sync_cases.json`; `logoutGuard.test.tsx`; `tokenExpiry.test.ts`.
- Playwright `nurse/e2e/offline.spec.ts`: (1) go offline, arrive, add a note, leave, go online, assert the admin API shows exactly one check-in, one note, one check-out; (2) reload the page mid-visit, assert the timer and the Leave button state; (3) push the same outbox twice by reloading during a request (use route interception to abort the response after the server handled it), assert no duplicates; (4) expire the token (intercept to 401) while offline, queue three actions, come online and sign in, assert all three arrive; (5) logout with items waiting shows the guard.
- Service-worker test `nurse/e2e/pwa.spec.ts`: after the first load, set the context offline and reload; the shell loads from the cache.

**Out of scope.** Photos, unscheduled visits.
**Done when.** CI green, including the five offline scenarios.

---

### WO-09 Photo proof

**Goal.** Photos taken with no signal are kept safely on the phone, upload to Cloudinary when a connection exists, register exactly once, stay private, and are audited.
**Spec.** 8.5, 11.12, 16.1, 17 Phase 5B. **Depends on.** WO-08. (Decision D2: Cloudinary stays, uploads are signed and private.)

**Storage module `backend/app/core/photo_store.py`.** One interface `PhotoStore` with: `sign_upload(public_id, now) -> {cloud_name, api_key, timestamp, signature, folder, type, upload_url}`, `head(public_id) -> {exists, bytes, width, height, format}`, `fetch(public_id) -> async bytes iterator`, `destroy(public_id)`. Two implementations: `CloudinaryPhotoStore` (uses `httpx`; the signature is the SHA-1 hex of the sorted `key=value` upload parameters joined with `&` plus the API secret, built with `hashlib`) and `FakePhotoStore` (in memory, used by every test and by local dev when `PHOTO_STORE=fake`). Chosen by setting `PHOTO_STORE` (`cloudinary` or `fake`). Secrets `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` are read from the environment like other secrets and never sent to the browser (only the signature, key and cloud name are).

**Server routes (nurse, scope `field:use`).**
1. `POST /api/v1/field/visits/{id}/photos/sign` body `{photo_id}`. Returns signed parameters for `public_id = nest/visits/{visit_id}/{photo_id}` and `.../{photo_id}_t` (image and thumb), `type = authenticated`, `timestamp` now, valid for 10 minutes. Same checks as rules 2 to 4 below. Rate limited. Only works online by nature.
2. `POST /api/v1/field/visits/{id}/photos` (JSON, not multipart) body `{id, client_op_id, kind, caption, captured_at_device, geo_snap, public_id, thumb_public_id}`: registers a photo already uploaded. The server calls `head()` on both ids and checks they exist, that the ids start with `nest/visits/{visit_id}/`, that bytes are at most `photos.max_bytes` (default 600,000) and thumb at most 60,000, and that the format is `jpg`. If the file is missing it returns `409 upload_missing` so the phone retries the upload. If too large, `422` and the server calls `destroy()`.

**Rules.**
1. Idempotent: an existing `client_op_id` or photo `id` returns `duplicate` with the stored record and registers nothing twice.
2. The visit must be the nurse's, not `cancelled`, and must have a check-in. Else `rejected` with `visit_not_assigned`, `visit_cancelled` or `not_checked_in`.
3. The client's `photo_allowed` must be true, else `403 photo_not_allowed`.
4. Count of non-hidden photos on the visit must be below `photos.max_per_visit` (resolved for client, team, org), else `409 photo_limit_reached`.
5. The phone checks the JPEG signature `FF D8 FF` before upload. The server relies on Cloudinary reporting format `jpg` and on the size limits; Cloudinary upload presets are set by the owner to accept images only.
6. If the metadata insert fails after the checks, the server calls `destroy()` for both ids (unless another record already uses them).
7. The nurse cannot delete or edit after registration. Hiding is staff only.
8. Abandoned uploads (a signature was issued, nothing registered after 24 hours) are listed by nightly job `run_photo_orphans`, which destroys files under `nest/visits/` that have no `visit_photos` row. The job uses `PhotoStore` only (fake in tests).

**Admin routes.** `GET /admin/care/visits/{id}/photos` [`photos:read`] returns metadata only, each with `image_path` and `thumb_path` pointing at the two routes below. `GET /admin/care/photos/{id}/image` and `/thumb` [`photos:read`, reach applies] stream the bytes from `PhotoStore.fetch()` with `Cache-Control: private, no-store` and write **one `audit_log` row per request** (`action = photo_view`). No Cloudinary URL is ever sent to a browser. `POST /admin/care/photos/{id}/hide` [`photos:hide`] needs a reason; the file stays, status becomes `hidden`, audited.

**Client.** `nurse/src/features/photos/`: camera input (`<input type="file" accept="image/*" capture="environment">`), `compress.ts` (canvas, longest side 1280, JPEG quality starting 0.7 and stepping down by 0.1 to a floor of 0.4 until the file is at most 400 KB; thumbnail 160 px), local `photos` table with state machine `pending_upload` to `uploaded` to `registered` (a photo that reached Cloudinary but not the API resumes at the register step; it never uploads twice), the uploader (sign, upload to Cloudinary with `fetch` and `FormData`, register; the blob is removed only after `accepted` or `duplicate`), thumbnails with badges, the once-a-day guidance sheet, "photo required" rule that disables Leave with the message, hide the section if `photo_allowed` is false, a warning above 20 pending photos, a `navigator.storage.estimate()` check before saving, and the Wi-Fi-only setting (on iPhone it means "wait until the nurse taps Upload now"). **Offline behaviour:** taking, viewing and queuing photos works with no signal; if Cloudinary is unreachable but the API is up, the photo stays `pending_upload` and retries with the normal backoff; the visit itself is never blocked except by the "photo required" rule, which counts a locally saved photo as satisfied.

**Tests to write.**
- Backend: `tests/test_photo_store_signing.py` (a known set of parameters and secret gives a known SHA-1 hex; parameter order; timestamp included; secret never in output); `tests/test_photo_rules.py` (size limits, id prefix check, limit counting excludes hidden); `tests/test_db_photos.py` (duplicate returns the same photo; concurrent identical registrations store one; failed insert destroys files; hide keeps the file; orphan job removes only unregistered files); `tests/test_http_photos.py` (all rejections above, using `FakePhotoStore`; `409 upload_missing`; 401/403; nurse B cannot sign or register for nurse A's visit; a public_id for another visit is refused; admin image route streams bytes, sets `no-store`, writes one audit row per request, supervisor without reach gets 404; `photos:read` without `photos:hide` cannot hide). No MinIO needed for photos.
- Vitest: queue state machine with a fake Cloudinary and fake API (offline; online; Cloudinary down but API up; resume at the register step; duplicate; rejected goes to needs attention; blob removed only after success); guidance shown once per day; Leave disabled until a photo exists when required (a locally saved one counts); section hidden when not allowed; warning at 21 pending.
- Playwright `nurse/e2e/photos.spec.ts` (real browser, so canvas works; Cloudinary upload URL is intercepted with `page.route` and answered by a stub so no real account is used): take a photo with a 3 MB test image; assert the stored image is at most 400 KB and 1280 px on the longest side; take it offline, go online, upload happens once; the admin image route returns a JPEG; a client with `photo_allowed = false` shows no camera.
- Optional, owner run only: `docs/CLOUDINARY_SMOKE.md` lists a manual check with real credentials (upload, register, view, destroy). It is not part of CI.

**Out of scope.** Video, editing, progress photos (Module D).
**Done when.** CI green.

---

### WO-10 Unscheduled visits

**Goal.** When switched on, a nurse can start an unscheduled visit for one of their own clients. Off by default.
**Spec.** 7.3, 11.13, 12.8. **Depends on.** WO-09.

**Server.** `POST /api/v1/field/visits/adhoc` and sync op kind `visit_create_adhoc`. Payload `{id, client_op_id, client_id, device_time, sent_at_device, lat, lng, accuracy_m, source, device_info}`.

**Rules.**
1. Allowed only if the nurse override is `true`, or the override is `null` and `visits.adhoc_enabled` is true. Override `false` blocks even if the organisation setting is on. Else `rejected adhoc_disabled`.
2. The client must be in the nurse's `assigned_nurse_ids`, else `rejected client_not_assigned`. No free text client.
3. The place is the client's current stay place on the Kampala date of `device_time`; none means `rejected no_current_place`.
4. Creates one visit (`adhoc = true`, `created_by` the nurse, `scheduled_start = device_time`, `scheduled_end = start + 60 minutes` (setting `visits.adhoc_default_minutes`), snapshot, `supervisor_id` from the nurse profile) **and** the check-in event in one Mongo transaction, then the `adhoc` flag. Idempotent by `client_op_id` and by visit `id`.
5. If the switch is turned off while the phone is offline, the later push is `rejected adhoc_disabled` and appears under "Needs attention".

**Client.** "Unscheduled visit" button on Today only when `/me` says allowed; the sheet lists only assigned clients (from the local cache); starting it writes a local visit and a check-in, queues one op, and opens Active visit.

**Tests to write.**
- `tests/test_adhoc_rules.py`: truth table of org setting and override (9 combinations); date-of-visit place lookup across a midnight in Kampala.
- `tests/test_db_adhoc.py`: transaction creates visit, event and flag together or not at all (force a failure after the visit insert and assert nothing remains); duplicate op returns `duplicate`; client not assigned rejected.
- `tests/test_http_adhoc.py`: 401/403; each rejection reason; the `adhoc` flag appears in the supervisor's flag list.
- Vitest: button hidden when not allowed; sheet lists only assigned clients; offline start queues one op.
- Playwright `nurse/e2e/adhoc.spec.ts`: switch the setting on by API, start an unscheduled visit offline, go online, see it in admin with the flag; switch the setting off while the phone is offline, go online, see the item under Needs attention and nothing created.

**Out of scope.** Free-text clients, cross-team clients.
**Done when.** CI green.

---

### WO-11 Admin screens, part 2 (review)

**Goal.** "Who was where, when, for how long, and was it verified."
**Spec.** 12.4 to 12.8, 17 Phase 6. **Depends on.** WO-09, WO-10. **Look.** Mockup pages: Visits, Visit detail, Visit photos, Flags, Resolve a flag, Reports, Audit log.

**Files.** `frontend/src/features/admin/care/{visits,visit-detail,photos,flags,reports,audit}/`. Visit detail shows the timeline, the read-only `PlaceMap` with the place pin, radius ring and event pins (colour by verification), distance and accuracy values, flags with Resolve, notes, photo gallery, audit trail, and an Annotate form.

**Behaviour.**
- Photo gallery requests images from the API image route only when the panel is opened (not on page load), so views are audited honestly. Images are shown from the response; nothing is cached by the browser (`no-store`).
- Reports page: date range, nurse, client; summary cards (visits, hours, percent verified, flagged); table; "Export CSV" calls the CSV endpoint (needs `reports:export`; button hidden otherwise).
- Audit log page filters: photo views, settings, permissions, corrections.

**Tests to write.**
- Vitest: timeline ordering; event pin colour mapping; Resolve requires a note of at least 3 characters; Export hidden without the scope; photo panel makes no request until opened.
- Playwright `frontend/e2e/care-review.spec.ts` (real backend; data created through the nurse API in a `beforeAll`): open the visit, see two events and the flag, resolve the flag, open photos and see the audit row appear in the audit screen, export the CSV and parse it (header, one row, no unquoted formula cells).
- axe checks.

**Out of scope.** Alerts, dashboards.
**Done when.** CI green.

---

### WO-12 Timesheets (Module B, part 1)

**Goal.** Hours generated from visits, submitted by the nurse, approved by a supervisor.
**Spec.** 22.2, 25.2 `timesheets.*`, 17 Phase 10. **Depends on.** WO-11. Switch: `care.module_b_enabled`.

**Model `timesheets`.** `id`, `nurse_id`, `period_start` and `period_end` (dates, Kampala), `entries[{visit_id, client_label, check_in, check_out, minutes, verification_label, adjusted, adjust_reason, issue}]`, `explanations[{visit_id, text}]`, `total_minutes`, `status` (`draft`/`submitted`/`approved`/`rejected`), `submitted_at`, `approved_by`, `approved_at`, `reject_reason`. Unique index `{nurse_id, period_start}`. Migration `0008_timesheets.py`.

**Pure rules (`timesheets/rules.py`).**
- `period_for(date, kind, week_start, anchor)`: weekly (start weekday from setting, default Monday), fortnightly (14-day blocks counted from `timesheets.anchor_date`, default `2026-01-05`), monthly (calendar month). All in Kampala dates.
- `entry_minutes(check_in, check_out, rounding_min)`: whole minutes `floor((out - in) / 60)`, then rounded to the nearest `rounding_min` (half rounds up) when it is 5 or 15.
- `apply_break(day_entries, break_min)`: deduct `break_min` once per Kampala day when that day's total is at least 360 minutes (decision, documented in the UI help text). Zero by default.
- A visit is **included** only when it has both a check-in and a check-out. A visit with a check-in and no check-out after `scheduled_end + missed_checkout_min` is an **issue** `open_visit`. A visit whose latest event verification is not `verified` is an issue `unverified`. Issues do not count toward minutes until explained or resolved.
- `can_submit(sheet)`: every issue has an explanation of at least 3 characters.
- `include_travel` is stored but **has no effect** in v1 (documented in the setting description).

**Endpoints.** Field: `GET /field/timesheets`, `GET /field/timesheets/{period_start}` (generates or refreshes the draft), `POST /field/timesheets/{id}/explain`, `POST /field/timesheets/{id}/submit`. Admin (scope `timesheets:read` / `timesheets:approve`, with reach and the `timesheets.approver` setting): list, detail, `POST /{id}/approve`, `POST /{id}/send-back` (reason required), `PATCH /{id}/entries/{visit_id}` (adjust minutes, reason required, only while `submitted`, audited), `GET /{id}/export?format=csv` (only `approved`, else `409 not_final`).

**Rules.** A nurse cannot type hours. Regeneration touches only `draft`. `approved` is locked: every change returns `409 locked`. `submitted` cannot be edited by the nurse. Nightly job `run_timesheet_drafts` at 04:00 builds drafts for all active nurses.

**`shared/fixtures/timesheet_cases.json`.** Cases (each with visits and settings and the expected entries and total): plain week; rounding 0, 5 and 15 on 62 and 67 minute visits; break deduction on a 6 hour day and on a 5 hour 59 minute day; an event at 21:30 UTC that falls on the next Kampala day and across a week boundary; fortnight from the anchor; month with 31 days; an open visit as an issue; an unverified visit as an issue.

**Tests to write.** `tests/test_timesheet_rules.py` (fixture file, plus period tables for each kind); `tests/test_db_timesheets.py` (unique period, regeneration leaves submitted and approved untouched, nightly job idempotent); `tests/test_http_timesheets.py` (reach and approver setting for supervisor and admin, locked after approval, export refused unless approved, adjustment needs a reason and writes audit, nurse cannot see another nurse's sheet); Vitest for the nurse timesheet screens (submit disabled until issues are explained); Playwright `nurse/e2e/timesheet.spec.ts` (complete visits, open the week, explain an issue, submit, approve in admin, see the lock); admin screen tests for approve, send back, adjust.

**Out of scope.** Pay rates, payroll, PDF export.
**Done when.** CI green.

---

### WO-13 Alerts, dashboard, notifications (Module B, part 2)

**Goal.** Exceptions reach the right person, once, and clear themselves.
**Spec.** 22.1, 22.3 to 22.5, 27.1, 17 Phase 11. **Depends on.** WO-12. Switch: `care.module_b_enabled`.

**Heartbeat change.** `/field/heartbeat` gains optional `outbox_count` and `outbox_oldest_min` (older apps omit them).

**Alert model `alerts`.** `id`, `type`, `severity` (`info`/`warning`/`critical`), `visit_id`, `nurse_id`, `supervisor_id`, `status` (`open`/`acknowledged`/`resolved`), `created_at`, `acknowledged_by`, `acknowledged_at`, `resolved_by`, `resolved_at`, `resolved_note`, `auto_resolved`, `dedupe_key`, `escalation_level`, `next_escalation_at`, `deliveries[]`, `test`. A **partial unique index** on `dedupe_key` where `status != "resolved"` guarantees one open alert per situation.

**Rules (`alerts/rules.py`, pure).** `evaluate(now, visits, devices, settings, open_alerts) -> (to_create, to_resolve)`. Thresholds come from settings (defaults in brackets). Severity and key shown.

| Type | Raised when | Severity | Dedupe key | Clears when |
| --- | --- | --- | --- | --- |
| `late_checkin` | `scheduled`, no check-in, `now > start + late_grace (10 min)` and not yet missed | info | `late:{visit}` | check-in arrives or it becomes missed |
| `missed_checkin` | `scheduled`, no check-in, `now > start + missed_checkin (30 min)` | warning | `missed_in:{visit}` | check-in arrives |
| `idle` | `in_progress` and the newest logged action (event, note, photo, geo snap) is older than `idle (60 min)` | warning | `idle:{visit}` | any new action |
| `overstay` | `in_progress` and `now > scheduled_end + overstay (30 min)` | info | `overstay:{visit}` | check-out |
| `missed_checkout` | `in_progress` and `now > scheduled_end + missed_checkout (60 min)` | warning | `missed_out:{visit}` | check-out |
| `out_of_range` | `in_progress` and the newest geo snap is not in range | warning | `range:{visit}` | an in-range snap or check-out |
| `quiet_device` | `in_progress` and the nurse's device `last_seen_at` older than `quiet_device (45 min)` | info | `quiet:{visit}` | device seen again |
| `short_visit` | on check-out, duration below `short_visit_pct` | info | `short:{visit}` | never auto; resolve by hand |
| `sync_stuck` | a device reports `outbox_oldest_min > 60` | info | `stuck:{device}` | outbox empty |
| `sos` | WO-14 | critical | `sos:{case}` | WO-14 |
| `safety_timer` | WO-14 | critical | `safety:{visit}` | WO-14 |

Alert titles use neutral words. `quiet_device` says "Last seen 38 min ago", never "idle" or "absent".

- `escalation`: pure `next_level(alert, now, chain, minutes)`. Chain default: level 0 the nurse's supervisor, level 1 users with `alerts:write` and reach `all`, level 2 users with `monitor:view` and reach `all`. The wait before moving up is `alerts.escalation_minutes` (10). Acknowledging stops escalation.
- Delivery: the dashboard always. From WO-17C every send goes through the notification dispatcher (inbox, push, SMS chosen by the catalogue); until then SMS and the dashboard only. SMS immediately for `critical`. For `warning`, SMS to the current level's people only if still unacknowledged after `alerts.sms_after_unacked_min` (new setting, default 15). `info` never sends SMS. Quiet hours (`alerts.quiet_hours`) suppress SMS for `info` and `warning`, never `critical`. The monthly cap (`sms.monthly_cap`) blocks non-critical SMS only; critical still sends and is logged.
- SMS text lives in `backend/app/modules/notifications/templates.py`: one function per message, each returns text. Rules: at most 160 characters, GSM-7 characters only (an extension character such as `[` counts as 2), contains the nurse's **first name**, a visit code (`V-` plus the last four characters of the visit id), minutes, and a link that needs login. **Never** a client name, address or any health word. `is_gsm7(text)` and `sms_length(text)` helpers are tested.
- Job `run_alerts` every minute in `app/jobs.py`: loads the working set, calls `evaluate`, applies creates and resolves, runs escalation, sends deliveries through the existing notifications service, logs to `SmsLog` (extended with `purpose`, `ref_type`, `ref_id`, `test`, `cost`). It must be safe to run twice at once (compare and set on `next_escalation_at`).

**Dashboard API** (`/api/v1/admin/care/dashboard`, scope `monitor:view`, reach applies, `?view=org|team`): `as_of`, counts, alerts needing action, nurse rows with arrived time and "last seen" text, on-call now. Count definitions: `on_time` check-in within grace; `late` check-in after grace or no check-in past grace; `not_started` scheduled and before start; `in_progress`; `completed`; `missed` flagged missed; `alerts_open`; `sos_active`. `/dashboard/executive` returns weekly series (punctuality, verified percent, average visit length, missed trend, alerts by type). `/dashboard/map` returns each nurse's last snap with its time and status colour.

**Screens.** Live dashboard (polls every 30 seconds, shows "As of hh:mm"), Executive charts (inline SVG, no chart library), Map view (read-only `PlaceMap` fallback style), Alerts list and detail (acknowledge, resolve with note, escalation chain, deliveries), Notification log with spend meter, and the nurse-side heartbeat change. Look: mockup pages Live dashboard, Executive charts, Map view, Alerts, Alert detail, Notification log.

**`shared/fixtures/alert_cases.json`.** One scenario per row of the table above, each with a fixed `now`, the visits and settings, and the expected `(to_create, to_resolve)`. Include boundary pairs (exactly at the threshold does not fire; one second over does), a visit that is late then checks in (resolved, history kept), and two evaluations in a row (second creates nothing).

**Tests to write.** `tests/test_alert_rules.py` (fixture file plus escalation table, quiet hours, cap, delivery decision table); `tests/test_sms_templates.py` and `test_no_health_in_sms.py` (every template with worst-case names: length at most 160, GSM-7, no banned words, no client name); `tests/test_db_alerts.py` (partial unique index, concurrent `run_alerts` creates one alert, acknowledge stops escalation, auto-resolve keeps history); `tests/test_dashboard_rules.py` (counts for a seeded day); `tests/test_http_alerts.py` (reach, 403, acknowledge and resolve); Vitest for the dashboard (poll interval with fake timers, "As of" text, last-seen neutral wording); Playwright `frontend/e2e/care-monitor.spec.ts` (seeded late visit raises one alert, acknowledge it, see it move).

**Out of scope.** Push notifications, WhatsApp, email alerts.
**Done when.** CI green.

---

### WO-14 Safety, SOS and on-call (Module C)

**Goal.** A nurse in danger can raise an alarm, and someone answers.
**Spec.** 23, 27.2, 27.3, 17 Phase 12. **Depends on.** WO-13. Switch: `care.module_c_enabled` plus the readiness guard (WO-02).

**Models.**
- `sos_cases` (mutable status fields only): `id`, `client_op_id`, `nurse_id`, `visit_id`, `status` (`sent`/`acknowledged`/`resolved`), `test`, `short_code`, `created_at`, `acknowledged_by`, `acknowledged_at`, `resolved_by`, `outcome` (`safe`/`assisted`/`emergency_services`/`unreachable`/`false_alarm`), `nurse_safe_at`, `current_level`, `next_escalation_at`, `last_geo`, `battery_pct`.
- `sos_events` (append-only, separate repository file `events_repository.py`): `case_id`, `kind` (`sent`, `follow_ping`, `sms_sent`, `acknowledged`, `note`, `escalated`, `nurse_safe`, `resolved`), `at`, `by`, `text`, `geo`.
- `oncall_rosters`: `id`, `scope` (`org`/`team`), `team_supervisor_id`, `name`, `contacts[{name, phone_e164, role, priority, windows[{days[0-6], start "HH:MM", end "HH:MM"}]}]`, `overrides[{from_date, to_date, replace_priority, with_contact}]`, `ack_timeout_s` (default 120).
- `nurse_profiles.sos_test_mode` (bool; only a superadmin sets it).

**Pure rules.**
- `oncall.on_call_at(roster, at_utc)`: converts to Kampala, applies overrides, returns contacts whose window covers the time, ordered by priority. A window with `start > end` crosses midnight (for example 22:00 to 06:00 belongs to the start day and the next day's early hours). `end == start` means all day.
- `oncall.coverage_gaps(roster, week_start)`: returns the list of `(weekday, from, to)` minutes with nobody on call.
- `sos.readiness(settings, rosters)` returns the list of missing prerequisites (a contact with a phone in some window, SMS enabled, emergency numbers set, module on).
- `sos.escalation_plan(case, now, rosters, supervisor_chain, ack_timeout, minutes)` returns who to notify now. Order: on-call contacts one by one (each waits `ack_timeout_s`), then the nurse's supervisor, admin, executive (each waits `alerts.escalation_minutes` for SOS, default 2). After the last level it repeats the last level every 2 minutes at most 5 times, then stops texting and keeps the banner.
- `safety.overdue(visit, now)`: `armed` and `now > safety_timer_until` and no check-out.

**Endpoints.**
- Field: `POST /field/sos` [`sos:send`] body `{id, client_op_id, visit_id, sent_at_device, lat, lng, accuracy_m, geo_age_s, battery_pct}`. The server decides `test` from the nurse profile and **ignores any client value**. Returns 403 `sos_unavailable` if readiness fails. Idempotent. `POST /field/sos/{id}/follow` (ping), `POST /field/sos/{id}/safe`, `POST /field/visits/{id}/safety/confirm`, `POST /field/visits/{id}/safety/extend`.
- Admin (`/admin/care/sos`): `GET` list [`sos:read`], `GET /{id}`, `GET /by-code/{short_code}`, `POST /{id}/acknowledge`, `POST /{id}/note`, `POST /{id}/resolve` (outcome and note required) [`sos:respond`], `POST /drill` creates a test case for a chosen nurse. `/admin/care/oncall` CRUD [`oncall:read`/`oncall:write`], `GET /oncall/now`, `GET /oncall/{id}/gaps`.

**Behaviour.** On send: create the case and the `sent` event, create a critical `sos` alert, text the first on-call contact and the supervisor at once (template without client details, with the short link), show the full-width banner on every staff dashboard. Jobs: `run_sos_escalation` every minute (compare and set), `run_safety_timers` every minute (raises critical `safety_timer` and texts the supervisor chain). **Test mode:** a case with `test = true` texts only the setting `sms.test_number` with the prefix `[TEST]`, never escalates past the first level, and is excluded from organisation counts. Acknowledgement is by the secure link (login needed) or the dashboard button; replying by SMS is not supported (D12).

**Nurse app.** `nurse/src/features/sos/`: `holdLogic.ts` (pure, takes timestamps; 2 seconds from setting), `SosButton`, `CancelWindow` (5 seconds), `SentScreen`, `OfflineAndroid`, `OfflineIphone` (call links and a prefilled `sms:` link), `FollowMode` (ping every 30 seconds for `sos.follow_minutes`), `SafetyTimer` controls on the arrive sheet and active visit. SOS sends **ahead of the outbox**, retries every 5 seconds while the app is open, and falls back by platform: Android native sends SMS (WO-17), iPhone and browsers show the manual prompts. The button is visible only when `/me` says SOS is enabled.

**Tests to write.**
- `tests/test_oncall_rules.py`: windows by weekday, a window crossing midnight, all-day window, override covering one contact for two days, no cover at 03:00, `coverage_gaps` for a roster with a known gap, daylight is irrelevant (Kampala has none) but test UTC midnight edges.
- `tests/test_sos_rules.py`: readiness with each prerequisite missing; the escalation plan at times 0, 119, 120, 121 seconds and after each level; acknowledging stops the plan; the repeat limit; test mode never plans beyond level 0.
- `tests/test_safety_rules.py`: overdue boundary; extend and confirm clear it.
- `tests/test_sos_templates.py`: text under 160 characters, GSM-7, no client name or address.
- `tests/test_db_sos.py`: idempotent send; concurrent escalation job runs notify once; `sos_events` accepts inserts only; ack and resolve stored with outcome; client-sent `test` ignored.
- `tests/test_http_sos.py`: 401/403; 403 `sos_unavailable` until the roster, SMS and numbers exist; a supervisor with team reach cannot see another team's case; drill never texts a real number (assert the `SmsLog` recipients equal only the test number).
- `tests/test_append_only.py`: now covers `sos/events_repository.py`.
- Vitest: `holdLogic` at 1999 ms (no start) and 2000 ms (start); cancel at 4999 ms sends nothing (spy on the API); SOS bypasses the outbox; retry loop; follow pings at 30 second marks and stops at the limit; platform branch chooses the correct offline screen.
- Playwright `nurse/e2e/sos.spec.ts` (real backend with the console SMS provider and seeded roster): hold the button for 2.1 seconds, wait through the countdown, see the sent screen, the admin API lists the case, `SmsLog` has the expected recipients, acknowledge and resolve through the admin API and see "Glad you're safe" after tapping safe; a second case cancels at 3 seconds and asserts no case exists; a third case runs with the setting off and asserts the button is absent.
- Admin Vitest and Playwright `frontend/e2e/care-sos.spec.ts`: banner appears, acknowledge, add note, resolve needs an outcome; roster editor shows the coverage gap row.

**Out of scope.** Voice calls from the server, two-way SMS, automated calls to emergency services.
**Done when.** CI green. The acceptance drill in spec 23.6 is a **human** checklist for real phones; this plan puts it in `docs/SOS_DRILL.md`.

---

### WO-15 Module E: convert an enquiry to a client

**Goal.** An accepted enquiry becomes a client with a place without retyping.
**Spec.** 28 (decision D11). **Depends on.** WO-06.

**Server.** `POST /api/v1/admin/care/enquiries/{id}/convert` (scopes `enquiries:write` and `clients:write`). Body `{display_name, phone, supervisor_id, notes_for_nurse, photo_allowed, place{label, address_text, lat, lng, radius_m}}`. In one transaction: create `care_client`, `place`, an open `place_stay` (reason `home`, from today), set the enquiry `status = care_started`, store `converted_client_id` on the enquiry (new optional field), add an enquiry event `status_change`, and write audit. A second call returns `409 already_converted`. The enquiry's free-text message and any health detail are **not** copied.

**Screens.** A "Convert to client" button on the existing enquiry detail page, visible only with `clients:write` (additive change, existing tests unchanged), and a convert page with the form prefilled from the enquiry and the `PlaceMap`. Mockup page: Convert to client.

**Tests to write.** `tests/test_db_enquiry_convert.py` (transaction all-or-nothing, status, link, no message copied, second call conflict); `tests/test_http_enquiry_convert.py` (scopes, supervisor reach); existing enquiry tests pass; Vitest for the convert form prefill; Playwright `frontend/e2e/care-convert.spec.ts` (submit the public form, find it in the inbox, convert, see the client and place, schedule a visit). Also add Vitest assertions on the existing public booking form: the sentence "Please do not enter medical details here" is shown, and consent must be ticked. **If either is missing, do not change the form. Ask the owner.**

**Out of scope.** A second inbox, new statuses.
**Done when.** CI green.

---

### WO-16 Compliance, retention and backups

**Goal.** The legal and safety chores run by themselves and can be proven.
**Spec.** 16, 16.1 to 16.3, 25.2 `retention.*`. **Depends on.** WO-14.

**Retention (`backend/app/modules/care_retention/`).** Job `run_care_retention` at 03:10. For each setting that is **set** (unset means do nothing and log "not configured"): clear `lat`, `lng`, `accuracy_m` and `geo_snap` on events, notes and photos older than `retention.coordinates_months`; call `PhotoStore.destroy()` for each photo and mark photos `status = expired` older than `retention.photos_months`; clear SOS locations older than `retention.sos_months` (the case record stays). These purge functions are named `purge_*`, live in `retention.py` (not in any `repository.py`), and are the **only** code that removes or clears data in append-only collections. They use a dedicated database user path in tests only if needed, and every run writes an `audit_log` summary. `test_append_only.py` gets an allow-list entry for the `retention.py` file by name.

**Data subject tools.** `GET /api/v1/admin/care/data-requests/clients/{id}/export` (JSON of the client, places, stays, visits, notes, photo metadata, consents) and `POST .../anonymise` (display name becomes "Removed client", notes cleared, photos deleted) with scope `system:manage`; both audited. Admin screen "Data and retention" shows the retention values, last job run, the export and anonymise controls, and consent records. Mockup page: Data and retention.

**Consents.** Privacy notice and location versions are settings; changing a version makes `/me` list the consent as needed again.

**Backups (GitHub Actions only).**
- `.github/workflows/backup.yml`: cron `0 23 * * *` (02:00 Kampala) and manual. Steps: install MongoDB database tools, `mongodump --archive --gzip` from secret `MONGODB_URI`, encrypt with `openssl enc -aes-256-cbc -pbkdf2` using secret `BACKUP_PASSPHRASE`, write a manifest with `python scripts/backup_manifest.py` (timestamp, collection counts, size, sha256), upload with the AWS CLI to the backup bucket using `B2_ENDPOINT`, `B2_KEY`, `B2_SECRET` with Object Lock compliance retention (30 days; setting in the workflow input), write `ops/backup-latest.json` to the **private app bucket** so the admin can show it. On any failure the job fails (GitHub emails the owner).
- `.github/workflows/restore-drill.yml`: monthly. Download the newest backup, decrypt, `mongorestore --drop` into `RESTORE_MONGODB_URI` (the second database), run `python scripts/compare_counts.py` (compares per-collection counts and a checksum of ids for the append-only collections against the manifest), and write `ops/restore-latest.json`.
- `GET /api/v1/admin/care/ops/status` [`carecfg:read`] reads those two JSON keys from storage. Admin screen "Backups and hosting" shows them, the free-tier warning from `ops.database_off_m0`, and the owner's handover checklist. Mockup page: Backups and hosting.
- Docs written by you: `docs/RESTORE_RUNBOOK.md`, `docs/INCIDENT_RUNBOOK.md` (breach steps for the PDPO, who to call, a blank form), `docs/SOS_PROCEDURE.md` (template from spec 27.3, blank values), `docs/PDPO_CHECKLIST.md` (copy of spec 16.3), `docs/HANDOVER.md`.

**Tests to write.** `tests/test_retention_rules.py` (cut-off dates for each setting; unset does nothing); `tests/test_db_care_retention.py` (coordinates cleared, record kept; photo files destroyed through the fake photo store; run twice is safe; audit summary written); `tests/test_http_data_requests.py` (scope, export shape has no secrets, anonymise irreversible and audited); `tests/test_ops_scripts.py` (manifest builder and `compare_counts` against a small temporary database: match passes, a missing document fails); `tests/test_http_ops_status.py` (reads fake storage keys; 403 without scope); a CI job `ops-scripts` that also runs `bash -n` and `shellcheck` on any shell in the workflows; Vitest for the Data and Backups screens.

**Out of scope.** Legal wording, hosting changes. Owner tasks are in Section 8.
**Done when.** CI green; the owner has run `backup.yml` once by hand and `restore-drill.yml` once by hand and both passed.

---

### WO-17 Android app with Capacitor

**Goal.** The same nurse web app, wrapped as an Android app that can send SOS texts and remind the nurse locally.
**Spec.** 11.12, 17 Phase 9, 20, D5 to D8. **Depends on.** WO-14.

**Rules.**
1. One codebase. Native code is limited to thin adapters in `nurse/src/platform/` (`location.ts`, `sms.ts`, `notify.ts`, `app-info.ts`). Each has a web implementation and a Capacitor implementation behind one interface, chosen by `Capacitor.isNativePlatform()`. All other code imports the interface only (a Vitest guard greps for direct plugin imports outside `platform/`).
2. Plugins are the owner-approved ones listed in `docs/PINS_NURSE.md`: core, android, geolocation, local notifications, app, and one **SMS sender** plugin. A background-location plugin is added **only if** the owner writes "background location approved" in that file. If not approved, the app asks for location only while in use and the prompt on arrive says "Keep the app open during the visit".
3. First run shows the **prominent location disclosure** screen before any permission prompt (text from `nurse/src/i18n/en.json` key `disclosure.location`, supplied by the owner in Section 8). The Play policy requires this; the test below checks that the permission request cannot be reached without it.
4. Local notifications schedule: visit starting in 15 minutes, arrive reminder at start time, "still working?" at scheduled end, safety timer warnings. Notifications are rebuilt whenever the visit list changes. Server-sent notifications arrive by push (WO-17C); these local ones work with no signal.
5. SOS on Android: the `sms.ts` adapter sends the SOS text to the configured contacts directly (numbers come from `/me`), in parallel with the API call. If the SMS plugin is missing, the adapter reports `unavailable` and the app uses the manual prompts.
6. Update prompt: `app-info.ts` reads the installed version code; `/field/app-version` returns `{latest, minimum, apk_url_path}`. Below `minimum` the app blocks with an "Update needed" screen; below `latest` it shows a soft banner. The APK download is an authenticated endpoint streaming from the private bucket key `apk/latest.apk` (no public link, no Firebase). Add `GET /field/app-version` and `GET /field/app/apk` with tests.
7. Sign-in inside the Android shell uses the native path (header `X-Client: native`, refresh token in secure storage) that WO-17B adds to both apps. Until WO-17B is built, the Android debug build still compiles but cannot keep a session.
7. Version code is `GITHUB_RUN_NUMBER`-based in CI; the version name comes from the git tag.

**Files.** `nurse/capacitor.config.ts`, `nurse/android/` (generated by `cap add android` in CI, not committed, except `nurse/android-overrides/` for manifest permissions and the network security config), `nurse/src/platform/*`, `nurse/src/features/disclosure/`, `nurse/src/features/update/`.

**Android manifest overrides (committed, applied by a script in CI).** Permissions: `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `POST_NOTIFICATIONS`, `SEND_SMS`, `VIBRATE`; add `ACCESS_BACKGROUND_LOCATION` and a foreground service entry **only** under background approval. `android:usesCleartextTraffic="false"`. `android:allowBackup="false"`. Script `scripts/apply_android_overrides.mjs` edits the generated manifest and fails if a permission is missing; it has its own unit test.

**Tests to write.**
- Vitest: each adapter's web implementation; interface selection with a mocked `Capacitor`; disclosure gate (permission function never called before acceptance); notification schedule builder as a pure function (`buildSchedule(visits, now)` for a day of visits, with expected times); version comparison (`10.2.0` versus `9.9.9`, equal, missing); update screen states; the import guard.
- `tests/test_http_app_version.py`: 401 without login, the shape, the APK endpoint streams bytes from fake storage and sets `Content-Disposition`, 404 when no APK uploaded.
- `scripts/__tests__/apply_android_overrides.test.mjs`: applies to a sample manifest, idempotent, fails on a missing permission.
- CI job `android-debug` (WO-00 YAML skeleton): builds the debug APK on every nurse change and uploads it as a workflow artifact. A build failure is the test.

**Out of scope.** iOS native build, Play Store listing text, push.
**Done when.** CI green, and the debug APK artifact exists.

---

### WO-17B Admin Android app, and native sign-in for both apps

**Goal.** The staff admin (including the new care screens) also installs as an Android app, built from the same code, and is **offline-first**: staff can open and use it with no signal, their safe actions are queued, and everything updates when the connection returns. Both Android apps (nurse and admin) can sign in and stay signed in inside the native shell.
**Spec.** Owner request (admin as an APK). **Depends on.** WO-17, WO-13, WO-14.

**Why a small backend change is needed.** The existing sign-in keeps the refresh token in a cookie (`nhc_refresh`, path `/api/v1/auth`) with a CSRF cookie. Inside an Android app the page origin differs from the API origin, so the browser treats those cookies as third party and may drop them. So the native apps use a **second, additive path**: a header `X-Client: native` makes the auth endpoints return and accept the refresh token in the JSON body instead of cookies. The web behaviour stays exactly as it is.

**Backend (additive, in `backend/app/modules/auth/`).**
1. `POST /auth/login` and `POST /auth/refresh`: when the request has `X-Client: native`, the response body also contains `refresh_token` and **no cookies are set**. `POST /auth/refresh` and `POST /auth/logout` accept `{refresh_token}` in the body when the header is present. Rotation, reuse detection and expiry are unchanged and use the same service functions.
2. Without the header, nothing changes. A test proves a web login response has the cookies and no `refresh_token` field.
3. CSRF: the cookie CSRF check is skipped **only** for requests that carry `X-Client: native` and a refresh token in the body (there is no cookie to forge). Every other route keeps its rules.
4. CORS: the Android shell uses the origin `https://localhost`. Add it through the existing `cors_origin_list` setting (environment value), never hard-coded. Ask the owner which API origin the app should call.
5. Rate limits on login and refresh apply to the native path the same way.

**Client side (both apps).** `platform/secure-store.ts` with a web implementation (not used for refresh tokens; web keeps cookies) and a native implementation that stores the refresh token with the Capacitor storage plugin the owner approves for secrets (ask in the question round; a plain preferences plugin is **not** acceptable for tokens). The API client adds `X-Client: native` only when `Capacitor.isNativePlatform()`. On launch the app refreshes silently. Logout clears the store and calls logout.

**Admin app shell.**
- New entry `frontend/admin-native.html` and `frontend/src/admin-native/main.tsx` that mounts **only the admin routes** (no public pages, no prerendering), reusing the existing admin route definitions. Read how the admin routes are currently mounted and import them; do not copy them. Built by `frontend/vite.admin-native.config.ts` into `frontend/dist-admin-native/`. The existing site build and its tests must not change.
- `frontend/capacitor.admin.config.ts`: app id `ug.nesthomecare.admin` (ask the owner to confirm the id), name "Nest Admin", `androidScheme: https`, web dir `dist-admin-native`. API origin from `VITE_API_URL` at build time.
- Same fonts, same design. The app uses the phone and tablet layouts from the mockup.
- **Offline-first.** See the next subsection. There is a calm "Offline" banner with the time of the last update, never a blocking error screen. A screen with nothing cached shows "Not saved on this phone yet. Open it once while online."
- **Alerts on the phone.** While the app is open it polls `/admin/care/alerts?status=open` every 30 seconds and raises a local notification for each new `critical` alert (SOS, safety timer). When the app is closed, push messages (WO-17C) alert the phone, and SOS and safety alerts still go by SMS too (WO-13, WO-14). The polling is the fallback for an open app when push is unavailable.
- Update prompt (see item 9 above) and APK download work the same as the nurse app, with keys `apk/admin-latest.apk` and `apk/admin-latest.json`, route `GET /admin/app/version` and `GET /admin/app/apk` (scope: any signed-in staff user).
- Android permissions for the admin app: `INTERNET`, `POST_NOTIFICATIONS`, `VIBRATE` only. No location, no SMS. `scripts/apply_android_overrides.mjs` takes an `--app admin|nurse` argument and checks the right list for each app.

**Offline-first admin (client and server).**

*What works offline.* Staff can read everything they last loaded, and can do the safe actions below. The server stays the authority: nothing is final until the server accepts it.

1. **Read cache.** A Dexie database `nest_admin_cache` (named per signed-in user id) keeps the last good copy of: dashboard snapshot, visits (from 14 days back to 14 days ahead), clients and places the user can reach, stays, open alerts and the last 7 days of alerts, open flags, timesheets for the current and previous period, on-call rosters, enquiries from the last 30 days, and the user's own `/me` data. Every cached record carries `fetched_at`. Screens use stale-while-revalidate: show the cached copy at once, refresh in the background when online, and show "Updated 14:05" when offline or stale. **Never cached:** photos and thumbnails (the `no-store` rule), SOS case details beyond the list row, audit log, settings values other than those `/me` returns, exports, user and scope lists.
2. **Bulk refresh.** New endpoint `GET /api/v1/admin/care/sync/pull?cursor=` (scope `monitor:view` or any care read scope; reach applies) returns changed documents of the collections above since the cursor, plus a `tombstones` list of ids that were removed or went out of reach, plus `next_cursor` and `schema_version`. The app calls it on launch, on reconnect and every 5 minutes while open and online. Use the same cursor idea as `/field/sync/pull`. Documents contain **no health detail** (same payload rules as the nurse app).
3. **Write queue (outbox).** A closed list of operation kinds may be queued offline. Each op has `id` (client UUID, also the idempotency key), `kind`, `payload`, `base_version` (the `updated_at` the screen was showing), `device_time`, `sent_at_device`, `attempts`, `state` (`pending`, `sending`, `accepted`, `duplicate`, `conflict`, `rejected`).

   | Allowed offline | Notes |
   | --- | --- |
   | `alert_acknowledge`, `alert_note`, `alert_resolve` (not for `sos` or `safety_timer` alerts) | The screen says "Waiting to send" until accepted. |
   | `flag_resolve`, `visit_annotate` | |
   | `visit_create`, `visit_edit`, `visit_cancel` | Same rules as the online routes (client in reach, nurse free, `409 nurse_busy`). |
   | `client_update`, `place_update`, `stay_create` | Basic fields only. A place move needs an online map step, so it is online only. |
   | `enquiry_note`, `enquiry_status` | |
   | `timesheet_approve`, `timesheet_send_back` | Conflict if the nurse changed it meanwhile. |

   **Online only (the button is disabled with a clear message when offline):** everything about SOS (acknowledge, resolve, drill), safety timers, users and scopes, settings, readiness, data requests and anonymise, exports, photo viewing and hiding, retention, backups, corrections to visit events, and sign-in the first time.
4. **Push endpoint.** `POST /api/v1/admin/care/sync/push` with `{ops:[...]}`, at most 50 per call. For each op the server runs the **same service function, scope check and reach check as the matching online route** (no second copy of the rules), and returns one result per op: `accepted`, `duplicate`, `conflict` (with the current server copy), or `rejected` with a reason (`forbidden`, `not_found`, `validation`, `not_allowed_offline`). If the user's scopes or reach changed while offline, those ops come back `rejected forbidden`. Conflict rule: if the record's current `updated_at` is later than `base_version`, the op is a `conflict` **except** for pure appends (`alert_note`, `visit_annotate`, `enquiry_note`) and for idempotent state moves already in the wanted state (acknowledging an alert that is already acknowledged is `duplicate`). Pushed ops write audit rows with `offline = true` and `device_time`. Order within one call is preserved; a failed op does not block later independent ops.
5. **Needs attention screen.** Lists `conflict` and `rejected` ops with the server's current copy side by side and two buttons: "Use server version" (drops the op) or "Apply again" (re-queues with the new `base_version`). Nothing is dropped silently. The outbox badge shows the number waiting.
6. **Sync engine.** Written for admin in `frontend/src/admin-native/sync/{engine.ts, outbox.ts, backoff.ts, status.ts}` by copying the **patterns** of the nurse engine (same backoff `min(300, 2*2^attempt)`, same state names, same idempotency rules). Do not refactor the nurse engine to share code. Shared fixture `shared/fixtures/admin_sync_cases.json` holds the expected result for each op kind and each outcome so server and client tests use the same cases.
7. **Offline sessions.** The refresh token stays in secure storage. While offline the app keeps working with the cached data. Setting `admin_app.offline_days` (default 7, returned by `/me`): if more than that many days pass since the last successful refresh, the app locks the cache behind a sign-in that needs the network. On logout, on refresh failure with `401`, on a changed user id, and when `schema_version` changes, the cache and outbox are wiped after warning if ops are still pending (the user can choose to try sending first). Pending ops are never sent under a different user.
8. **Device safety.** The cache contains client names and visit times. The app requires the phone to have a screen lock (check on first run and show a notice if absent). The cache is removed on logout. Whether to add an app PIN or biometric lock is a question for the owner (plan Section 0.5), not built unless approved.
9. **Updating online.** On reconnect the app: refreshes the token, pushes the outbox, pulls, then checks `GET /admin/app/version` for a new APK. The cache `schema_version` is compared on every pull so an app update that changes the cache shape triggers a clean rebuild instead of a crash.

**CI.**
- Job `android-admin-debug` in `nurse.yml` (rename the file's header comment to "android"): build `dist-admin-native`, `cap add android` with the admin config, apply overrides, `assembleDebug`, upload artifact `admin-debug-apk`.
- `android-release.yml` builds **both** apps on a `v*` tag, signs both with the same keystore, uploads to `apk/latest.apk` and `apk/admin-latest.apk` with their JSON files.

**Tests to write.**
- `tests/test_auth_native.py`: native login returns `refresh_token` and sets no cookies; web login unchanged; native refresh rotates the token and the old one is refused (reuse detection still works); native logout revokes; missing header with a body token is refused; CSRF still enforced on every other state-changing route; rate limit applies.
- `tests/test_http_admin_app_version.py`: 401 without login, shape, APK stream, 404 when absent.
- Vitest (frontend): the API client adds `X-Client: native` only on native; secure-store interface selection; offline screen shows with fake `navigator.onLine = false` and Retry re-checks; alert poller (fake timers) notifies once per new critical alert and never twice for the same id; the admin-native entry mounts the admin routes and **no** public route.
- Vitest guard: no import of a Capacitor plugin outside `platform/`.
- Build guard script `scripts/check-public-bundle.mjs`: fails if the public site build (`frontend/dist`) contains `dexie` or any `admin-native` module. Also add the setting `admin_app.offline_days` (integer, default 7, 1 to 30) to the settings registry with a test in the settings test file, and return it from `/me`.
- `scripts/__tests__/apply_android_overrides.test.mjs`: extended with the `admin` list (no location or SMS permission may appear).
- A build check in CI: `npm run build:admin-native --prefix frontend` must succeed, and `check-no-external.mjs` runs on `dist-admin-native`.
- `tests/test_admin_sync_pull.py`: cursor paging; reach respected (a supervisor sees only their team); tombstones for removed and out-of-reach records; no health fields or photo URLs in any document; `schema_version` present.
- `tests/test_admin_sync_push.py`: one case per op kind from `admin_sync_cases.json` (accepted, duplicate, conflict, rejected forbidden, not_found, validation, `not_allowed_offline` for every online-only kind including SOS and safety alerts); scopes removed between queueing and pushing returns `forbidden`; pure appends never conflict; replaying the same op id twice gives `duplicate` and one effect; 51 ops in one call is refused; audit rows carry `offline` and `device_time`; one failed op does not block the next; the push service calls the same functions as the online route (a test patches the service function and asserts it was called by both).
- `tests/test_admin_sync_parity.py`: for every allowed op kind, the result of the online route and the push op on identical data is identical (same final database state).
- Vitest (admin-native): cache read returns cached data offline and shows the "Updated" time; stale-while-revalidate refresh replaces cached data; outbox state machine with a fake API (pending to accepted, duplicate, conflict, rejected, retry with backoff, order preserved); online-only buttons disabled offline with the message; SOS actions never enqueue; Needs attention buttons (Use server version drops the op, Apply again re-queues with the new `base_version`); offline session lock after `offline_days` (fake clock); wipe on logout, on changed user, on schema change, with the pending-ops warning; ops never sent under another user; photos are never written to the cache (spy on the cache writes).
- Playwright `frontend/e2e/admin-native.spec.ts`: serve `dist-admin-native`, send the native header via a route override, sign in with a seeded staff user, see the care dashboard; go offline and still open Visits and Alerts from cache with the offline banner; acknowledge an alert and add a note offline and see "Waiting to send"; resolve a flag; try the SOS drill button and see it disabled; go online and see all ops accepted and the server state updated; create a conflict by changing the same alert through the API while offline, then see it under Needs attention and resolve it with "Use server version"; sign out and see the cache gone.

**Out of scope.** Push messages (built in WO-17C), iOS app, offline photo viewing, offline SOS handling, offline user or settings management, biometrics and app PIN (unless approved).
**Done when.** CI green and both debug APK artifacts exist.

---

### WO-17C Push notifications (Firebase Cloud Messaging)

**Goal.** Any notification that must reach a person **when the app is closed** is also sent as a push message, to the nurse app and the admin app. Push is an extra nudge. It never replaces SMS for critical alerts, and the in-app notification list is always the record.
**Spec.** Owner decision (push approved). **Depends on.** WO-17B, WO-13, WO-14.

**Principles.**
1. **Push never carries private detail.** No client name, address, health word or free text. Titles and bodies come only from `backend/app/modules/notifications/templates.py` push functions (a first name of the nurse, a visit code, minutes, a neutral verb). Tapping opens the app on the right screen, where the detail is shown after sign-in.
2. **SMS stays.** `critical` alerts (SOS, safety timer) go by SMS **and** push. Push alone is never enough for them.
3. **The inbox is the truth.** Every notification is first stored in a new `notifications` collection per user, then sent by push. If a push is lost, the item is still in the inbox when the app opens. Opening the app also triggers a sync.
4. **Offline-first still holds.** The apps work with no Firebase and no signal. Push only enhances. If push is not configured (`push.enabled` false or no credentials) nothing breaks and the readiness checklist shows "Push not configured".

**Notification catalogue (single source of truth, `notifications/catalogue.py`).** Each type has: `id`, `audience`, `severity`, `channels` (any of `inbox`, `push`, `sms`), `android_channel` (`critical` or `normal`), `mutable` (can the user mute it), `deep_link`.

| Type | Who | Severity | Channels | Mutable |
| --- | --- | --- | --- | --- |
| `sos_raised`, `safety_timer_overdue` | on-call contacts, supervisor chain, admins | critical | inbox, push, sms | no |
| `sos_acknowledged`, `sos_resolved` | the nurse who raised it | critical | inbox, push | no |
| `alert_warning` (missed check-in, missed check-out, idle, out of range) | supervisor, escalation chain | warning | inbox, push, sms (per WO-13 rules) | no for supervisor, yes for others |
| `alert_info` (late, overstay, quiet device, short visit, sync stuck) | supervisor | info | inbox, push | yes |
| `visit_assigned`, `visit_changed`, `visit_cancelled` | the nurse | normal | inbox, push | no |
| `visit_starting_soon` | the nurse | normal | local notification only (WO-17), **not** push | yes |
| `timesheet_sent_back`, `timesheet_approved` | the nurse | normal | inbox, push | yes |
| `timesheet_submitted` | the approver | normal | inbox, push | yes |
| `enquiry_new` | users with `enquiries:read` who opted in | normal | inbox, push | yes (default off) |
| `app_update_required` | all app users | normal | inbox, push | no |

Any later work that needs to notify someone **must** add a catalogue row and use the dispatcher; it must not call SMS or push directly. A test enforces this (below).

**Dispatcher (`notifications/dispatcher.py`).** `dispatch(type, recipients, params, ref)` does: build the inbox rows, decide channels from the catalogue plus settings plus user mutes, apply quiet hours and the SMS cap exactly as in WO-13 (critical ignores both), send push to each active device of each recipient, log every attempt. Pure function `plan_channels(type, user_prefs, settings, now)` returns the channel list and is the unit under test. WO-13's `run_alerts` and WO-14's SOS jobs are changed to call the dispatcher (small diff, existing behaviour and tests keep passing).

**Data.**
- `notifications`: `id`, `user_id`, `type`, `severity`, `title`, `body`, `deep_link`, `ref_type`, `ref_id`, `created_at`, `read_at`, `push_state` (`not_sent`/`sent`/`failed`/`no_device`), `test`.
- `push_devices`: `id`, `user_id`, `device_id`, `app` (`nurse`/`admin`), `platform` (`android`), `fcm_token`, `app_version`, `created_at`, `last_seen_at`, `revoked_at`. Unique on `fcm_token`. A token seen under a new user moves to that user.
- `push_log`: `id`, `notification_id`, `device_id`, `at`, `result` (`ok`, `unregistered`, `failed`, `skipped`), `http_status`, `detail` (no token values).
- `user_notification_prefs`: `user_id`, `muted_types[]`. Rejects muting a type whose catalogue row is not mutable.
- Migration `0012_push.py` (use the next free number; check the migrations folder).

**Server sender (`notifications/push.py`).** Interface `PushSender.send(token, title, body, data, android_channel, collapse_key) -> result`. `FcmPushSender` uses the FCM HTTP v1 API (`https://fcm.googleapis.com/v1/projects/{project}/messages:send`) with `httpx`. It gets an access token by signing a service-account JWT (scope `https://www.googleapis.com/auth/firebase.messaging`) with PyJWT using RS256 and exchanging it at the Google token URL; the token is cached until shortly before expiry. RS256 needs the `cryptography` package: ask the owner whether it is already installed and pinned (plan Section 0.5). `FakePushSender` records sends and is used by every test and by `PUSH_SENDER=fake`. Settings from the environment: `PUSH_SENDER` (`fcm` or `fake`), `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` (a secret, never logged). Android message rules: `priority = high` for `critical`, `normal` otherwise; `android.notification.channel_id` = `nest_critical` or `nest_normal`; `data` carries only `type`, `deep_link`, `notification_id`; a `collapse_key` per `ref` so repeated alerts for one situation replace each other; time to live 4 hours for `critical`, 24 hours otherwise. Results: HTTP 404 or error `UNREGISTERED` revokes the device; 429 and 5xx retry up to 3 times with backoff inside the job, then log `failed`; 400 is logged and not retried. One failure never blocks other recipients or the SMS.

**Endpoints.** `POST /api/v1/push/register` `{device_id, fcm_token, app, app_version}` and `POST /api/v1/push/unregister` (any signed-in user; rate limited; native header required). `GET /api/v1/notifications?cursor=` and `POST /api/v1/notifications/{id}/read` and `POST /api/v1/notifications/read-all` for the signed-in user only (own rows, 404 otherwise). `GET` and `PUT /api/v1/notifications/prefs`. Admin: `GET /admin/care/push/status` [`carecfg:read`] (configured yes or no, active device count, last send result, last 20 `push_log` rows without tokens) and `POST /admin/care/push/test` [`carecfg:write`] sends a test push to the caller's own devices only.
Settings: `push.enabled` (false by default), `push.quiet_hours` shares `alerts.quiet_hours`.

**Client (both apps), in `platform/push.ts` and a feature folder `features/notifications/`.**
- The Capacitor push plugin lives only in `platform/` (the import guard covers it). Web build has a no-op implementation.
- After sign-in and after the notifications disclosure, ask for the Android 13 notification permission, get the token, queue `push_register` (nurse: as an outbox op so it works offline; admin: through the sync outbox as an allowed kind). On token refresh, register again. On logout, call unregister (queued if offline) and wipe the token.
- Create the two Android notification channels `nest_critical` (high importance, sound, vibrate) and `nest_normal` at first start.
- When a push arrives while the app is open: add it to the inbox view, trigger a sync (nurse) or a pull (admin), show an in-app banner for `critical`. When the user taps a push: open the `deep_link` after sign-in.
- Notifications screen: list with unread dots, mark read, and the per-type mute switches for mutable types. Mockup page: Notifications, App settings.
- **"Keep alerts working" screen:** plain steps to turn off battery saving for the app on common phones (Tecno, Infinix, Samsung, Xiaomi), reachable from Settings and shown once after the first push registration. Text in the locale file.
- Admin Settings: the sentence about alerts only while open (WO-17B) is replaced by "Alerts arrive as push messages when you allow notifications" when push is configured, and kept when it is not.
- The 30 second alert polling of WO-17B stays as the fallback while the app is open.

**CI and build.**
- **All Firebase settings are environment variables. No Firebase file is committed.** Android jobs read these GitHub secrets, and `scripts/make_google_services.mjs` **generates** `google-services.json` for each app from them at build time: `FIREBASE_PROJECT_ID`, `FIREBASE_PROJECT_NUMBER`, `FIREBASE_API_KEY`, `FIREBASE_STORAGE_BUCKET` (optional), `FIREBASE_APP_ID_NURSE`, `FIREBASE_APP_ID_ADMIN` (the two Android app ids registered in the project; package names are the Capacitor app ids). The script writes the file into the generated Android project only, never into git, and fails with a clear message if a needed variable is missing **when push is requested** (`PUSH_ENABLED=true`). If the variables are absent and `PUSH_ENABLED` is not `true`, the debug build still succeeds without push (the plugin no-ops), so CI never needs a real Firebase account. `apply_android_overrides.mjs` adds the Google services Gradle plugin lines only when the generated file exists. `.gitignore` lists `google-services.json`.
- Forbidden-word guard (`check-forbidden.sh`) now allows `firebase` and `fcm.googleapis.com` only in: `backend/app/modules/notifications/push.py`, `nurse/src/platform/push.ts`, `frontend/src/admin-native/platform/push.ts`, `scripts/apply_android_overrides.mjs`, `.github/workflows/*.yml`, tests and docs. `check-no-external.mjs` still fails on any Firebase or Google host in built web output.
- **Host environment variables (server), read through the existing settings class and listed with empty values in `.env.example`:** `PUSH_SENDER` (`fcm` or `fake`), `FCM_PROJECT_ID`, and the service-account key as either `FCM_SERVICE_ACCOUNT_JSON` (the JSON text) or `FCM_SERVICE_ACCOUNT_JSON_B64` (the same JSON base64 encoded, for hosts that dislike multi-line values). The code accepts either, prefers the plain one, and never logs or returns the value. Missing or invalid values make `/admin/care/push/status` report "Push not configured" with the reason (for example `FCM_PROJECT_ID missing`), never a crash at startup.
- **GitHub secrets for builds:** the `FIREBASE_*` list above, plus `PUSH_ENABLED` as a repository variable. These are different from the host variables: the host holds the server key, GitHub holds only what the Android build needs (the app config values are not secret keys, but keep them as secrets anyway).

**Tests to write.**
- `tests/test_notification_catalogue.py`: every type has audience, severity, channels, channel id and deep link; critical types always include `sms` and `push` and are not mutable; non-mutable types reject mutes.
- `tests/test_plan_channels.py`: decision table for each severity with quiet hours on and off, SMS cap reached, push disabled, user muted a mutable type, no devices registered; critical ignores quiet hours and cap.
- `tests/test_push_templates.py`: every push template at worst-case names: title at most 60 characters, body at most 120, no client name, no address, no banned health words, contains only allowed placeholders.
- `tests/test_push_fcm_payload.py`: payload builder output for a critical and a normal message (priority, channel id, collapse key, TTL, data keys exactly `type`, `deep_link`, `notification_id`); service-account JWT claims and scope (sign with a throwaway test key generated inside the test); token cache reuse and expiry with a fake clock; result mapping for 200, 404 `UNREGISTERED`, 429, 500, 400 using a fake `httpx` transport.
- `tests/test_db_push.py`: unique token; a token that appears under a new user moves; revoke on `unregistered`; inbox row created even when no device exists (`no_device`); one failing device does not block another; `push_log` never stores a token value.
- `tests/test_http_push.py`: register and unregister need login and the native header; users can read and mark only their own notifications (404 for another user's); prefs reject muting a non-mutable type; admin status needs `carecfg:read`; test push only goes to the caller's devices (assert the fake sender received only those tokens).
- `tests/test_dispatch_only.py`: a source scan fails if any module other than `notifications/` calls the SMS provider or the push sender directly.
- Existing alert and SOS tests are updated only to assert the new dispatcher is used and that SMS behaviour is unchanged for critical alerts (SOS still texts the same recipients).
- `scripts/__tests__/make_google_services.test.mjs`: from a full set of variables it writes valid JSON with the right package name for `nurse` and for `admin`; a missing variable fails with the variable's name when `PUSH_ENABLED=true`; with push not requested and variables absent it writes nothing and exits 0; the output never contains the API key in logs (only in the file); output path is inside the generated Android folder.
- `tests/test_push_settings.py`: plain and base64 service-account variables both work; plain wins when both are set; bad base64 or bad JSON gives "not configured" with a reason and no exception; the status endpoint and logs never contain the key text; `.env.example` lists every push variable with an empty value.
- Vitest (both apps): permission asked only after the disclosure; token registered once and re-registered on refresh; registration queued offline and sent online; unregister on logout; push received while open adds to inbox and triggers sync or pull; tap opens the deep link after sign-in; channels created once; mute switches hidden for non-mutable types; battery help shown once; plugin imported only in `platform/`.
- Playwright (`nurse/e2e/notifications.spec.ts`, `frontend/e2e/admin-notifications.spec.ts`): with `PUSH_SENDER=fake`, trigger a late visit and see the inbox row appear in the admin app after sync and the fake sender record one send for the supervisor; trigger an SOS and see inbox rows plus push plus SMS log entries for the expected recipients; mute a mutable type and see no push for it; confirm a muted-by-others critical type cannot be muted.

**Out of scope.** iOS push, rich notifications with images, topic broadcasts, WhatsApp, email, push for the public site.
**Done when.** CI green, both debug APKs still build with and without the Firebase secret.

---

### WO-18 Module D: care logging (gated)

**Do not start this work order.** Spec 24.1 requires written confirmation of the legal and clinical basis first. Until the owner answers "Module D approved" with the date (saved in `docs/OWNER_DECISIONS.md`), this work order is skipped and the module switch `care.module_d_enabled` stays false and read-only in the admin. If you are told to start it without that line, ask the owner.

**Goal when approved.** Structured, non-diagnostic visit notes and care plans.
**Spec.** 24. **Depends on.** WO-16.

**Rules when approved.**
- Add scopes `care:log` and `clinical:read` and `clinical:write` to `scopes.py`, to `tests/test_scopes.py` `EXPECTED`, and to the presets table. Nothing else in the repo may mention them before this point.
- Models `care_plans` (versioned, append only) and `care_logs` (append only, corrections as new rows). Free text is allowed only inside a log and is never copied to SMS, alerts or exports unless `clinical:read`.
- Everything is behind the module switch and the legal confirmation setting `care.module_d_basis_confirmed_on` (date). If either is missing the endpoints return `403 module_disabled`.
- Tests mirror the earlier work orders: rules, DB, HTTP with scopes and reach, append-only guard, Vitest, Playwright. Write the detailed test list into `docs/NURSE_BUILD_PLAN_D.md` first and ask the owner to approve it.

---

### WO-19 Hardening and handover

**Goal.** Make it safe, accessible and fast, and hand it over.
**Spec.** 17 Phase 13, 20, 21. **Depends on.** WO-16, WO-17.

**Work.**
1. **Security headers.** Nginx or app-level headers as the repo already does them; add a CSP for the nurse app: `default-src 'self'; img-src 'self' data: blob:; connect-src 'self' <API origin>; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'`. Tile host is added to `img-src` only for the admin site from the setting. Test: a pytest that reads the header config and asserts the directives (no `*`, no `unsafe-eval`).
2. **Rate limit review.** Table of every field endpoint and its limit in `docs/RATE_LIMITS.md`; `tests/test_rate_limit_table.py` loads the route list and asserts each field route has a limit declared.
3. **Accessibility.** Playwright axe run over every nurse and admin care page at phone and desktop widths; zero serious or critical violations; touch targets at least 44 px (a Playwright check of bounding boxes on the nurse Today, Arrive, Active, SOS pages); focus visible; reduced motion respected (the SOS countdown must still work without animation).
4. **Performance.** `check-bundle-size.mjs` budget (initial JS at most 200 KB gzipped for the nurse app); Lighthouse CI is **not** used (external). Instead a Playwright test measures time to interactive on a throttled profile (4x CPU slowdown) with a generous limit of 4 seconds and stores the number as an artifact.
5. **Strings and fonts.** `check-strings.mjs` (every key in `en.json` used, none missing; no hard-coded visible text in the nurse app), `check-fonts.mjs` (only the three self-hosted families, no remote font URLs).
6. **Pen-test checklist** `docs/SECURITY_CHECKLIST.md` with automated items as tests: object-level access (nurse A cannot read nurse B's visit, photo, timesheet), mass assignment (extra fields ignored), upload abuse (wrong type, oversize, polyglot), Cloudinary signature expiry (10 minutes) and no Cloudinary URL ever returned to a browser, replay of an old sync op, CSV injection. Each item names the test that covers it. Add any missing test.
7. **Docs.** `docs/DEPLOY_NORTHFLANK.md`, `docs/ENV_VARS.md` and `docs/SETUP_FIRST_TIME.md` (Section 12), `docs/HANDOVER.md` final, `docs/USER_GUIDE_NURSE.md`, `docs/USER_GUIDE_ADMIN.md` (short, with the mockup screenshots **not** embedded), `docs/CHANGELOG.md`.
8. **Final consistency tests.** `tests/test_spec_traceability.py`: a table in `docs/TRACEABILITY.md` maps every spec section to a work order and test file; the test parses it and fails if a named test file does not exist.

**Done when.** CI green on every job in Section 4.10, the owner has done the human checks in Section 8, and the handover document is complete.

---

## 7. CI workflow skeletons

These are starting points. Adjust paths to what the repo already has. Pin action versions to the ones already used in `ci.yml`; where this plan shows `<existing pin>`, copy the pin from the existing workflow. **Never invent a version.**

### 7.1 `.github/workflows/types-fix.yml`

```yaml
name: types-fix
on:
  pull_request:
    paths: ["backend/**", "frontend/**", "nurse/**"]
permissions:
  contents: write
jobs:
  regenerate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<existing pin>
        with:
          ref: ${{ github.head_ref }}
      - uses: actions/setup-python@<existing pin>
        with: { python-version: "3.12" }
      - uses: actions/setup-node@<existing pin>
        with: { node-version-file: ".nvmrc" }
      - run: pip install -r backend/requirements.txt
      - run: python backend/scripts/export_openapi.py > shared/openapi.json
      - run: npm ci --prefix frontend && npm run gen:types --prefix frontend
      - run: npm ci --prefix nurse && npm run gen:types --prefix nurse
      - name: Commit if changed
        run: |
          git config user.name "types-bot"
          git config user.email "types-bot@users.noreply.github.com"
          git add shared frontend/src/api nurse/src/api
          git diff --cached --quiet || (git commit -m "chore: regenerate API types" && git push)
```

The script and npm script names must match what WO-00 found in the repo. If a name differs, use the real one.

### 7.2 `.github/workflows/nurse.yml` (jobs)

```yaml
name: nurse
on:
  pull_request:
  push: { branches: [main] }
jobs:
  guards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<existing pin>
      - uses: actions/setup-node@<existing pin>
        with: { node-version-file: ".nvmrc" }
      - run: node scripts/check-no-external.mjs
      - run: node scripts/check-fonts.mjs
      - run: node scripts/check-strings.mjs
      - run: bash scripts/check-forbidden.sh   # firebase outside push files, fonts.googleapis, cdn hosts, motor, cloudinary outside its allowed files
  nurse-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<existing pin>
      - uses: actions/setup-node@<existing pin>
        with: { node-version-file: ".nvmrc" }
      - run: npm ci --prefix nurse
      - run: npm run lint --prefix nurse
      - run: npm run typecheck --prefix nurse
      - run: npm run test --prefix nurse -- --run
      - run: npm run build --prefix nurse
      - run: node scripts/check-bundle-size.mjs nurse/dist
  field-e2e:
    runs-on: ubuntu-latest
    services:
      mongo:
        image: mongo:7
        ports: ["27017:27017"]
        options: >-
          --health-cmd "mongosh --eval 'db.runCommand({ping:1})'" --health-interval 5s --health-retries 10
      minio:
        image: <image used by docker-compose.dev.yml>
        ports: ["9000:9000"]
    env:
      MONGODB_URI: mongodb://localhost:27017/nest_test
      SMS_PROVIDER: console
    steps:
      - uses: actions/checkout@<existing pin>
      - uses: actions/setup-python@<existing pin>
        with: { python-version: "3.12" }
      - uses: actions/setup-node@<existing pin>
        with: { node-version-file: ".nvmrc" }
      - run: pip install -r backend/requirements.txt
      - run: python backend/scripts/seed_e2e.py     # seeds nurse, supervisor, clients, places, roster
      - run: (cd backend && uvicorn app.main:app --port 8000 &)
      - run: npm ci --prefix nurse && npx --prefix nurse playwright install --with-deps chromium
      - run: npm run e2e --prefix nurse
      - if: failure()
        uses: actions/upload-artifact@<existing pin>
        with: { name: playwright-report, path: nurse/playwright-report }
  android-debug:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<existing pin>
      - uses: actions/setup-node@<existing pin>
        with: { node-version-file: ".nvmrc" }
      - uses: actions/setup-java@<existing pin>
        with: { distribution: temurin, java-version: "17" }
      - run: npm ci --prefix nurse && npm run build --prefix nurse
      - run: cd nurse && npx cap add android && node ../scripts/apply_android_overrides.mjs && npx cap sync android
      - run: cd nurse/android && ./gradlew assembleDebug
      - uses: actions/upload-artifact@<existing pin>
        with: { name: nurse-debug-apk, path: nurse/android/app/build/outputs/apk/debug/*.apk }
```

The backend jobs (`pytest` with Mongo and MinIO services; MinIO is still used for the APK and ops files) already exist from WO-00; do not duplicate them.

### 7.3 `.github/workflows/android-release.yml` (on tag `v*`)

Same build as above but `assembleRelease`, signed with the keystore restored from secret `ANDROID_KEYSTORE_B64` (`echo "$ANDROID_KEYSTORE_B64" | base64 -d > release.jks`), passwords from `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The job uploads the APK as an artifact and also to the private bucket key `apk/latest.apk` with the AWS CLI (secrets as in 7.4) and writes `apk/latest.json` with `{version_code, version_name, sha256}`. The keystore is never printed or stored in the repo. The owner creates the keystore (Section 8).

### 7.4 Secrets and variables the owner creates in GitHub

| Name | Used by | Note |
| --- | --- | --- |
| `MONGODB_URI` | backup | read-only backup user |
| `RESTORE_MONGODB_URI` | restore-drill | a separate scratch database |
| `BACKUP_PASSPHRASE` | backup, restore | also stored by the owner offline |
| `B2_ENDPOINT`, `B2_KEY`, `B2_SECRET` | backup, apk upload | backup bucket with Object Lock |
| `APP_BUCKET`, `BACKUP_BUCKET` | backup, apk upload | names |

Runtime environment on the host (not GitHub): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `PHOTO_STORE=cloudinary`. CI never needs them.
| `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | android-release | |
| `FIREBASE_PROJECT_ID`, `FIREBASE_PROJECT_NUMBER`, `FIREBASE_API_KEY`, `FIREBASE_APP_ID_NURSE`, `FIREBASE_APP_ID_ADMIN` (optional `FIREBASE_STORAGE_BUCKET`) | android builds | generate `google-services.json`; repository variable `PUSH_ENABLED=true` turns push on in builds |

No test needs a real secret. All tests run against services started inside the job.

---

## 8. Things only the owner can do

You must not invent any of these. When one is missing and you need it, ask (Section 0.5).

1. Create `docs/PINS_NURSE.md` with exact versions of every new dependency from Section 3 (name and version, one per line), and approve the SMS sender plugin and the location plugin choice.
2. Answer ChatGPT's remaining questions (package pins, plugins, Northflank details). Settings are not questions: change any default by environment variable.
3. Set the texts, numbers and periods as environment variables (the privacy notice, the location consent text, the prominent location disclosure, photo guidance, the SOS procedure values, emergency numbers, retention periods). Their names are in the generated `docs/ENV_CARE_VARS.md`. Until set, they are empty and the readiness checklist stays red.
4. Register as a data controller if the PDPO requires it and write the date in the decisions file.
5. Create the GitHub secrets in 7.4, the backup bucket with Object Lock, the Android keystore, and the second database for restore drills.
6. Run `backup.yml` and `restore-drill.yml` once by hand.
7. Run the human SOS drill (`docs/SOS_DRILL.md`) with real phones before turning `care.module_c_enabled` on in production.
8. Decide about Module D (WO-18) with proper advice.
9. Create the Cloudinary account and an upload preset that accepts images only, switch on Cloudinary's own backup option for the account (the photos are not copied by `backup.yml`), and set the three variables on the host.
10. Create the Firebase project, register the two Android apps, set the `FIREBASE_*` GitHub secrets and the host variables `PUSH_SENDER`, `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_JSON` (or `_B64`), and confirm the `cryptography` package is pinned for the server.
11. Upload a map tile URL setting only if a tile provider is wanted; otherwise the schematic map is used.

---

## 9. Working with checkpoints and failures

### 9.1 The single pull request and the build log

One branch `nurse-module`, one pull request titled `Nurse module: full build`. The description is rebuilt at the end of Phase A in this format:

```
Work orders built: WO-00 to WO-17, WO-17B, WO-17C, WO-19 (WO-18 skipped, gated)
Per work order: files created, tests written (names)
Tests NOT written and why: (should be empty)
Decisions used: (D-numbers)
Owner answers used: see docs/OWNER_DECISIONS.md (paste it)
Not run: Written, not run. CI will run it.
```

Do not merge your own pull request. The owner merges when CI is green.

### 9.2 When CI fails

The owner pastes the failing job log into the chat with this prompt:

```
CI failed on WO-NN. The log is below. You cannot run code, so reason from the log.
1. Quote the first failing line and name the file and test.
2. Say in two sentences whether the code or the test is wrong, and why. A test is only wrong if it disagrees with the spec or the fixtures; never weaken a test just to pass.
3. Give the smallest fix. Show full replacement files for each file you touch.
4. Name any other test the fix could break and say how you checked by reading.
5. If the log is cut off or unclear, say exactly which lines you need instead of guessing.
```

If the same test fails three times in a row, stop and write a short note on what you do not understand. Do not keep patching.

### 9.3 Paste prompts

**Start of Phase A (paste once, with this file and the other docs attached):**

```
Read docs/NURSE_BUILD_PLAN.md completely, including Sections 0.0 and 0.5. First send one message with every question you need answered (each with your recommended answer) and wait for my reply. After I answer, build the whole module in one run, WO-00 to WO-17, then WO-17B, then WO-17C, then WO-19, in order, without waiting for me to say continue. For each work order: list the files, write the tests first, then the code, output every file in full with its path. Keep docs/NURSE_BUILD_LOG.md and docs/OWNER_DECISIONS.md up to date. You cannot run anything; do not claim anything passes. Pause only to ask a question in the format in Section 0.5. When a message is full, end it with "Next: WO-NN" and continue in the next message.
```

**Between messages:** nothing. The owner only answers questions.

**Phase B, after pushing and CI runs:** use the prompt in 9.2, one CI job at a time, starting with the earliest failing job (guards, then backend, then frontend and nurse unit, then end-to-end, then Android). Fixing an early job often fixes later ones.

**Phase C, corrections of behaviour or look (after CI is green):** the owner lists changes. For each, say which work order it touches, change only that, update its tests first, and note it in `docs/CHANGELOG.md`.

Order notes: WO-15 and WO-10 can be built in either order after WO-09 and WO-06.

---

## 10. Glossary

- **Reach**: how much of the data a user's scope applies to: `own`, `team` (their supervised nurses), or `all`.
- **Place / stay**: a place is a location with a radius; a stay says which client is at which place for a date range.
- **Verified / low accuracy / out of range**: results of the geo rule (Section 6, WO-03).
- **Outbox**: the phone's queue of actions waiting to be sent.
- **Op**: one queued action with a client generated id.
- **Flag**: a reviewable exception on a visit (for example `outside_radius`, `adhoc`).
- **Alert**: a monitored situation with escalation; **SOS** is the most serious alert type.
- **Kampala date**: the calendar date in Africa/Kampala (UTC+3, no daylight saving).
- **Written, not run**: the phrase you add to every output because only CI runs code.

---

## 11. Default values (changeable by environment variable)

These are the built-in defaults of the care settings. The owner can change any of them with an environment variable (Section 12.6) or later in the admin screen. They are not questions.

| # | Setting | Built-in default |
| --- | --- | --- |
| O1 | Geofence radius default | 150 m |
| O2 | Geo accuracy maximum | 100 m |
| O3 | Timesheet period | weekly, Monday start |
| O4 | Rounding | none (0) |
| O5 | Break deduction | 0 minutes |
| O6 | SOS hold time | 2 seconds |
| O7 | SOS cancel window | 5 seconds |
| O8 | On-call acknowledge timeout | 120 seconds |
| O9 | Photo retention | not set (no deletion) |
| O10 | Coordinates retention | not set (no deletion) |
| O11 | Background location | not approved |
| O12 | Unscheduled visits | off |
| O13 | Module B, C, D | off |
| O14 | Map tiles | none (schematic map) |
| O15 | SMS monthly cap | 500 (setting, owner changes) |
| O16 | Quiet hours for alerts | 22:00 to 06:00 |

---

## 12. Configuration and hosting (Northflank)

### 12.1 The rule: nothing environment-specific is hard-coded

There are exactly three homes for a value. Pick the right one. Do not invent a fourth.

| Home | What goes there | How it is read | Who changes it |
| --- | --- | --- | --- |
| **Environment variable** | Anything that differs between machines or is secret: addresses, keys, bucket and folder names, app ids, timings of background jobs, limits that protect the server, feature switches for infrastructure | `backend/app/core/config.py` `Settings` class (already in the repo, reads only the environment, `lru_cache`). Frontends read `VITE_*` at build time. | The owner, in Northflank or GitHub |
| **Care setting (database)** | Business rules staff may tune: radius, grace minutes, escalation minutes, retention, quiet hours, photo limits, SOS hold time, offline days | The settings registry from WO-02, editable in the admin, with audit | Admin users |
| **Code constant** | Facts that never change: the Earth radius in the distance formula, the GSM-7 character table, scope ids, collection names, error codes, state names, HTTP paths | In the source | Developers, with a test |

If a value is "a number someone might reasonably want to change without a developer", it is a care setting or an environment variable, never a constant.

### 12.2 New environment variables (all go into `Settings`, `.env.example` and `docs/ENV_VARS.md`)

Every variable has a safe default so the existing site never breaks when it is unset. Names in capitals; the `Settings` field is the lower-case name.

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `TZ` (existing) | `Africa/Kampala` | all date rules | **Use `get_settings().tz` everywhere.** New rule functions take the timezone as a parameter. Only the shared fixtures name Kampala. |
| `SCHEDULER_ENABLED` (existing) | `true` | jobs | See 12.4: exactly one instance runs jobs. |
| `PHOTO_STORE`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | `fake`, empty | WO-09 | Photo store choice and credentials. |
| `CLOUDINARY_FOLDER` | `nest` | WO-09 | Top folder for uploads (the `nest/visits/...` ids use it). |
| `CLOUDINARY_UPLOAD_TTL_SECONDS` | `600` | WO-09 | How long a signature is valid. |
| `PUSH_SENDER`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` or `_B64` | `fake`, empty | WO-17C | Push (Section WO-17C). |
| `PUSH_TTL_CRITICAL_SECONDS`, `PUSH_TTL_NORMAL_SECONDS` | `14400`, `86400` | WO-17C | Push time to live. |
| `PUSH_CHANNEL_CRITICAL`, `PUSH_CHANNEL_NORMAL` | `nest_critical`, `nest_normal` | WO-17C and apps (`VITE_` copies) | Android channel ids. |
| `APK_KEY_NURSE`, `APK_KEY_ADMIN` | `apk/latest.apk`, `apk/admin-latest.apk` | WO-17, WO-17B | Storage keys for the APKs and their JSON files. |
| `OPS_KEY_PREFIX` | `ops/` | WO-16 | Where backup status files are written. |
| `SYNC_PUSH_MAX_OPS` | `50` | WO-08, WO-17B | Largest batch the server accepts. |
| `SYNC_PULL_PAGE_SIZE` | `200` | WO-08, WO-17B | Page size for pulls. |
| `RATE_LIMIT_FIELD_PER_MINUTE`, `RATE_LIMIT_SOS_PER_MINUTE`, `RATE_LIMIT_AUTH_NATIVE_PER_MINUTE` | `120`, `20`, `10` | WO-04, WO-14, WO-17B | Per-user limits. The table in `docs/RATE_LIMITS.md` names the variable for each route. |
| `JOB_ALERTS_INTERVAL_SECONDS`, `JOB_SOS_INTERVAL_SECONDS`, `JOB_SAFETY_INTERVAL_SECONDS` | `60`, `60`, `60` | WO-13, WO-14 | Job frequencies. |
| `JOB_RETENTION_TIME`, `JOB_TIMESHEET_DRAFT_TIME`, `JOB_PHOTO_ORPHAN_TIME` | `03:10`, `04:00`, `03:40` | WO-16, WO-12, WO-09 | Daily job times in local time (`HH:MM`). |
| `ADMIN_APP_URL` | falls back to `FRONTEND_URL` | WO-13, WO-14 | Base of the links inside SMS and push (`/admin/...`). Never hard-code a domain. |
| `SIGNED_URL_MAX_SECONDS` | `900` (existing clamp) | storage | Make the existing clamp read this variable. |
| `PHOTO_STREAM_CACHE_SECONDS` | `0` | WO-09 | Must stay `0` (`no-store`). A test fails if it is not `0`. |
| `NATIVE_ORIGIN_EXTRA` | `https://localhost` | WO-17B | Added to the CORS origins when set. |
| `APP_ENV` (existing) | `development` | all | `production` on Northflank. |
| `TRUST_PROXY` (existing) | `false` | all | Must be `true` behind Northflank's proxy so client IPs and rate limits are right. |

Build-time (frontends and Android), read as `VITE_*` or GitHub repository variables, never committed: `VITE_API_URL` (existing), `VITE_APP_NAME_ADMIN`, `VITE_APP_NAME_NURSE`, `CAP_APP_ID_NURSE`, `CAP_APP_ID_ADMIN` (the app ids), `PUSH_ENABLED`, `FIREBASE_*` (WO-17C), `ANDROID_*` signing secrets.

**Not variables (keep as care settings):** everything under `thresholds.*`, `alerts.*`, `sos.*`, `photos.*`, `retention.*`, `timesheets.*`, `visits.*`, `care.module_*`, `admin_app.offline_days`, `sms.monthly_cap`, `sms.test_number`, `ops.*`. If you are about to add a number to a Python or TypeScript file and it is not in the "Code constant" row of 12.1, stop and put it in one of the two other homes.

### 12.3 Tests for configuration (WO-00 and every work order that adds a variable)

- `tests/test_env_example.py`: every field in `Settings` appears in `.env.example` with an empty or dummy value, and every variable in `.env.example` outside the generated block between `# BEGIN CARE SETTINGS` and `# END CARE SETTINGS` is a `Settings` field or is listed in an allow-list file `scripts/env-allowlist.txt` (for variables the server does not read, such as `PORT`). Fails with the missing name.
- `tests/test_env_docs.py`: every variable in `Settings` has a row in `docs/ENV_VARS.md`. The test parses the markdown table.
- `tests/test_settings_defaults.py`: a `Settings()` built from an empty environment works (so the existing site and CI need nothing new); `PHOTO_STREAM_CACHE_SECONDS` is `0`; `PHOTO_STORE` and `PUSH_SENDER` default to `fake`; job time values must match `HH:MM` and reject others with a clear error; invalid integers fail at startup with the variable name.
- `scripts/check-hardcoded.mjs` and `scripts/check_hardcoded.py` (run in the `guards` CI job): fail on a literal `https://` URL, on `Africa/Kampala`, or on a bare `+03:00` in `backend/app` and the app sources, except in the allow-listed files (`config.py`, tests, fixtures, docs, `scripts/external-allowlist.txt` hosts such as `fcm.googleapis.com` in `push.py`). Fails with file and line.
- Existing rule kept: secrets only in the environment, only `.env.example` committed.

### 12.4 Northflank (hosting) notes and the file `docs/DEPLOY_NORTHFLANK.md`

ChatGPT writes `docs/DEPLOY_NORTHFLANK.md` as part of WO-19. It is a checklist for the owner. It must not claim anything that is not in the repo or that the owner has not confirmed. Contents:

1. **Variables.** In Northflank, runtime variables are kept in **secret groups**, which services and jobs in the project inherit; a value set directly on a service overrides the group, and after editing a group the services must be restarted to pick up the change. The document lists the groups to create: `nest-core` (`APP_ENV=production`, `SECRET_KEY`, `MONGODB_URI`, `MONGODB_DB`, `CORS_ORIGINS`, `FRONTEND_URL`, `ADMIN_APP_URL`, `TRUST_PROXY=true`, `COOKIE_SAMESITE`, `TZ`, `IP_HASH_SALT`, `TURNSTILE_SECRET`), `nest-storage` (`S3_*`, `CLOUDINARY_*`, `PHOTO_STORE=cloudinary`), `nest-sms` (`SMS_PROVIDER=mambosms`, `MAMBOSMS_API_KEY`, `SMS_SENDER_ID`), `nest-push` (`PUSH_SENDER=fcm`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON_B64`), `nest-limits` (rate limits, job intervals and times, sync sizes). Group the values this way so a leaked group exposes less.
2. **Database.** Northflank offers a managed MongoDB addon with a connection string secret and scheduled backups. Whether to use it is a question for the owner (plan Section 0.5). If used, set `MONGODB_URI` in `nest-core` to the addon's connection string; do not assume the addon's own variable names in code. The GitHub backup workflow (WO-16) needs to reach the database from GitHub's runners: the document states clearly that this requires the database to accept outside connections, and gives the alternative (rely on Northflank's own scheduled backups plus a periodic `mongodump` run by the owner). Ask the owner which.
3. **Services.** One container image built from the backend `Dockerfile` (ask if the repo has one; do not invent a different build). Two Northflank services run the **same image**: `api` with `SCHEDULER_ENABLED=false`, any number of replicas, and `worker` with `SCHEDULER_ENABLED=true`, **exactly one replica**. This prevents duplicate jobs when the API is scaled. The compare-and-set guards in the jobs stay as a second safety net. A test (`tests/test_scheduler_flag.py`) proves no job is registered when `SCHEDULER_ENABLED=false`.
4. **Health check.** Point Northflank's health check at the existing health route (the `/health` route in `app/main.py` under the API prefix; confirm the full path in the repo). Do not add a second one.
5. **Domain and proxy.** The API runs behind Northflank's proxy: `TRUST_PROXY=true`, `COOKIE_SAMESITE` as the existing deployment already uses, and the Android apps' origin added to `CORS_ORIGINS` (or via `NATIVE_ORIGIN_EXTRA`).
6. **Release steps.** Order for a release: push the branch, wait for CI, merge, Northflank builds the image, restart `worker` and `api` after any change to a secret group, run the migration step the repo already uses, check the readiness checklist screen, then upload the APKs (WO-17).
7. **What this document must not do:** invent Northflank plan names, prices, regions or limits, or promise that any Northflank feature behaves a particular way beyond what the owner confirms.

### 12.5 Extra questions for the question round

Add to the numbered list in Section 0.5: Northflank project and service names; whether the `Dockerfile` exists and where; whether to use Northflank's MongoDB addon; whether GitHub's runners can reach the database; how many API replicas; the public API domain and the admin domain; the exact health route path; whether the frontends stay where they are hosted today.

### 12.6 Everything is settable from environment variables (owner decision: nothing is set up yet)

The owner has set up nothing yet (no hosting project, no Firebase, no Cloudinary, no texts, no thresholds). So **every value this module uses can be set with an environment variable**, including the business settings and the texts that earlier sections call "client to supply". The owner will fill them in on the host. Nothing in the app may need a developer to change a value.

**Layers and order (highest wins):**
1. A value an admin saved in the admin screen (database). This lets staff adjust things later without touching the host.
2. The environment variable for that setting.
3. The built-in default in the registry (the recommended values in Section 11 and spec 25.2).
4. For texts and phone numbers there is **no default**: they stay empty until the owner sets them. The readiness checklist shows them as "missing". Never invent them.

**Naming rule (one rule for all keys).** Take the care setting key, remove a leading `care.` if present, replace every `.` with `_`, upper-case it, and put `CARE_` in front. Examples: `thresholds.geofence_radius_m` becomes `CARE_THRESHOLDS_GEOFENCE_RADIUS_M`; `care.module_c_enabled` becomes `CARE_MODULE_C_ENABLED`; `sos.hold_ms` becomes `CARE_SOS_HOLD_MS`; `retention.photos_months` becomes `CARE_RETENTION_PHOTOS_MONTHS`. A test proves no two keys give the same name.

**Parsing by type.** `int`, `float`: plain number. `bool`: `true` or `false` only (any other text is an error). `time`: `HH:MM`. `list`: comma separated. `map` (for example emergency numbers): `Label=number;Label=number`. `text`: the text itself; multi-line is fine on the host; a `_B64` twin (for example `CARE_TEXT_PRIVACY_NOTICE_B64`) is also read for hosts that dislike multi-line values, and the plain one wins if both are set. A bad value stops the server at startup with the variable name and the allowed format. An unset or empty variable means "use the next layer".

**The texts and numbers the owner must set (all settings of type `text` or `map` in the registry, listed in the generated document).** At minimum: the privacy notice and its version, the location consent text and version, the prominent location disclosure for the Android app, photo guidance, the SOS procedure values (who responds, hand-off steps), emergency numbers, the test SMS number, retention periods. Their variable names follow the naming rule. The nurse and admin apps read them from the server, so changing a variable and restarting is enough; no rebuild.

**Admin screen behaviour.** Each setting shows its source: "Set here", "From environment" or "Built-in default". "Reset to environment value" removes the saved override. Secrets are never shown in the admin (they are not care settings).

**Generated documents (so nobody has to type 100 variable names by hand).**
- `scripts/gen_env_docs.py` reads the registry and writes two files: the care block of `.env.example` (between the markers `# BEGIN CARE SETTINGS` and `# END CARE SETTINGS`, one line per setting with its default shown as a comment and the value empty) and `docs/ENV_CARE_VARS.md` (table: variable, setting key, type, default, allowed values, whether required before go-live, which screen uses it). Required-before-go-live items are listed first.
- Workflow `.github/workflows/env-docs-fix.yml` (same pattern as `types-fix.yml`) runs the script on pull requests and commits the result if it changed, so the LLM never hand-writes these files. A test also runs the script in `--check` mode and fails if the committed files differ.
- `docs/SETUP_FIRST_TIME.md` (written by hand in WO-19): the **order** in which the owner sets things, with the variable names, grouped as: 1 to boot the server (the minimum), 2 database and storage, 3 SMS, 4 photos, 5 push, 6 Android signing and Firebase build values, 7 the care settings and texts needed before go-live, 8 turning modules on. Each step says what stays disabled until it is done and what the readiness checklist will show.

**What this changes in earlier work orders.**
- **WO-02:** the registry gains the environment layer, the source badge and the reset button, and the generator script. Add `tests/test_care_env_layer.py`: precedence (saved value beats environment beats default), each type parses (good and bad values for int, bool, time, list, map, text and `_B64`), plain text wins over `_B64`, bad value fails with the variable name, empty variable falls through, naming rule examples above, no name collisions across the whole registry, texts have no default and show as "missing" until set, the saved override can be removed to fall back to the environment, `resolve()` still honours team, client and place overrides on top of the org value. `tests/test_gen_env_docs.py`: generated output lists every key exactly once and is stable (running twice gives identical text).
- **Section 0.3 rule 6 and decision D16:** "client to supply" now means "the owner sets the environment variable". The placeholder text `client to supply` is shown only in the readiness checklist, never inside a screen a nurse or client reads.
- **Section 11 and the question round:** the recommended values are the built-in defaults. The owner changes them by environment variable at any time, so ChatGPT **does not ask** about O1 to O16 or about the texts. It still asks about package pins, plugin choices, the Northflank questions in 12.5, conflicts with the repo, and Module D.
- **WO-13, WO-14, WO-16:** every threshold, limit, time and text they use comes from the registry through `resolve()`. A source scan test `tests/test_no_magic_numbers.py` fails if a module under `backend/app/modules/care*` or `field` contains a numeric literal assigned to a name that matches a registry key suffix (for example `radius`, `grace`, `escalation`, `retention`) outside the registry file and tests.
