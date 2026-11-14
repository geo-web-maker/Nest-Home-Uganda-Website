# Well Nest Home Care Nurse Module: Free-Session Completion Plan

Based on the review of `Nest-Home-Uganda-Website-Nurse-Module-phase13-ci-integration.zip`.

**Working model:** every phase below is one Claude free-tier session. Claude writes code and tests only. Nothing is installed, built, or run. GitHub CI runs everything afterwards, and you paste CI failures back into a short "fix" session.

---

## 0. Rules for every session

1. **No execution.** Never claim a command, test, or build passed. Mark all new work: `Written, not run. CI will run it.`
2. **Diffs, not rewrites.** Edit existing files with unified diffs or `old -> new` blocks. Full files only for brand-new files.
3. **Small context.** Paste only the files listed under "Paste" for that phase, plus `docs/PINS_NURSE.md` when a dependency is touched. Do not paste the whole repo or the 100 KB spec. Quote the relevant spec section instead.
4. **Size cap per session:** at most about 6 files touched, about 400 new lines of code, and about 150 lines of tests. If a phase looks bigger, stop and split it. Say so.
5. **Tests are part of the phase.** Each phase ships its tests (Vitest / Playwright for the front end, pytest for the backend) in the same session.
6. **No invented values.** No secrets, URLs, IDs, or package versions that are not in `docs/PINS_NURSE.md`. If a new package is needed, list it as `NEEDS PIN` and stop.
7. **Respect owner decisions** (`docs/OWNER_DECISIONS.md`): no background location, Module D skipped, the SMS plugin only opens the device SMS composer, no GitHub runner connects to MongoDB, no app PIN lock.
8. **Privacy:** no client health details in SMS, notifications, logs, or notes UI copy. Visit notes stay operational.
9. **End each session with:**
   - a file list (created / edited),
   - a 3-line status entry to append to `docs/NURSE_IMPLEMENTATION_STATUS.md`,
   - what CI should prove,
   - the next phase ID.

### Session prompt template (copy/paste)

```
You are continuing the Well Nest Home Care Nurse Module. Phase: <ID> <title>.
Rules: write code and tests only; do NOT run or claim to run anything; use diffs for
existing files; no invented values or versions; follow docs/OWNER_DECISIONS.md.
Goal: <goal line from the plan>
Files I am pasting: <list>
Deliver: <deliver list>
Tests to write: <tests list>
CI should prove: <done-when>
Stop at the size cap. End with the file list, a status entry, and the next phase ID.
```

### CI-fix session template

```
Phase <ID> was written but not run. Here is the failing CI log (trimmed to the first
error per job) and the files it points to. Fix with minimal diffs. Do not refactor.
```

---

## 1. Starting state (from the review)

- **Backend:** mostly built (care settings, clients/places/stays, visits, flags, sync pull/push, photos, SOS, alerts, timesheets, retention, push scaffolding). About 400 tests authored, none run.
- **Nurse app:** one stacked-panel `App.tsx` (about 350 dense lines). It has an outbox, sync, photos, consent, and ad hoc visits. It has no router, tabs, Arrive/Leave sheets, Active visit screen, Profile, SOS, or heartbeat client.
- **Admin:** a 14-tab table workspace (`CareWorkspace.tsx`) and a visit review panel.
- **Packaging:** no nurse lockfile, no Android project, empty PWA icons, and several unused dependencies.
- **Ops:** nothing deployed or verified.

---

## 2. Recommended order

```
Track A (foundation)  ->  Track B (nurse app)  ->  Track C (backend gaps, interleave)
                                                \->  Track D (admin UI)
Track E (tests) runs after each track's screens exist
Track F (owner docs) any time, no code risk
```

A1 to A3 are done. Generate and review the lockfile through the `nurse-lockfile` workflow, get CI green, then do **B1 -> B4** (restructure before adding screens). A4 waits on owner-supplied signing secrets. C-phases are independent and can fill gaps between sessions.

---

## Track A: Foundation and CI hygiene

### A1: Dependency cleanup and lockfile workflow (S) - DONE (written, not run)
- **Goal:** deterministic nurse installs and no dead dependencies.
- **Paste:** `nurse/package.json`, `nurse/vitest.config.ts`, `docs/PINS_NURSE.md`, `.github/workflows/nurse.yml`, `.github/workflows/types-fix.yml` (as a pattern).
- **Deliver (as built):** removed `i18next`, `react-i18next`, `react-hook-form`, `zod`, `@tanstack/react-query` and `@capacitor/preferences`. Kept `react-router-dom` (B3) and `@byteowls/capacitor-sms` (B13) on a documented allow-list. Added the missing test tooling at the frontend's pins (`jsdom`, `@testing-library/dom`, `@testing-library/react`, `@types/node`, `@eslint/js`). `nurse-lockfile.yml` runs on manual dispatch and whenever `nurse/package.json` changes on `main` or `nurse-module`. `nurse.yml` now fails with instructions when the lockfile is missing. New test: `scripts/__tests__/nurse-package.test.mjs`.
- **Original scope:**
  - diff removing unused deps (`react-router-dom`, `i18next`, `react-i18next`, `react-hook-form`, `zod`, `@tanstack/react-query`, `@capacitor/preferences`). **Keep** `react-router-dom` if B3 is next; decide in this session and note it.
  - new `.github/workflows/nurse-lockfile.yml` (`workflow_dispatch`) that generates `nurse/package-lock.json` and commits it, mirroring the existing `*-fix.yml` pattern.
  - a diff to `nurse.yml` so it fails if the lockfile is missing instead of generating one.
  - add testing devDeps only if missing and pinned (`jsdom`, `@testing-library/react`); otherwise list `NEEDS PIN`.
- **Tests:** a small script test (`scripts/__tests__/`) asserting the nurse `package.json` has no `^`/`~` ranges.
- **CI proves:** lockfile workflow runs once, then `npm ci` succeeds.

### A2: PWA manifest and icons (S) - DONE (written, not run)
- **Goal:** installable PWA, single source of truth for the manifest.
- **Paste:** `nurse/vite.config.ts`, `nurse/public/manifest.webmanifest`, `nurse/index.html`, `design/tokens.json`.
- **Deliver (as built):** the duplicate `public/manifest.webmanifest` was deleted. The manifest now lives in `nurse/src/pwa/manifest.ts` and is passed to `vite-plugin-pwa`, with colours from `design/tokens.json`. Brand-mark PNG icons (192, 512, maskable 512, apple-touch 180) and an SVG favicon are committed under `nurse/public/icons/`, so no icon generator is needed in CI. `index.html` was cleaned (it had triplicated meta tags and a hand-written manifest link) and `src/vite-env.d.ts` was added so `import.meta.env` typechecks.
- **Tests (as built):** `src/pwa/manifest.test.ts` checks the manifest fields, token colours, real PNG sizes and that no second manifest exists. `e2e/pwa.spec.ts` fetches the served manifest and every icon.
- **CI proves:** the manifest test passes and the bundle-size check still passes.

### A3: Android project generation in CI (M) - DONE (written, not run)
- **Goal:** a debug APK built in CI. No local Android needed.
- **Paste:** `nurse/capacitor.config.ts`, `nurse/android-overrides/*`, `.github/workflows/nurse.yml`, `docs/PINS_NURSE.md`.
- **Deliver (as built):** `scripts/apply_android_overrides.mjs` merges the override fragments into the generated project (permissions, `allowBackup=false`, no cleartext, network security config), writes the `ic_stat_nest` notification icon and stamps `versionCode`/`versionName`. `.github/workflows/nurse-android.yml` builds the debug APK on JDK 21. `nurse/android/` is git-ignored. Test: `scripts/__tests__/apply-android-overrides.test.mjs`.
- **Original scope:**
  - `scripts/apply_android_overrides.mjs` (copies the manifest and network config into the generated project, sets `versionCode` from `GITHUB_RUN_NUMBER`).
  - new `.github/workflows/nurse-android.yml`: setup Node + JDK, `npx cap add android`, apply overrides, `./gradlew assembleDebug`, upload the APK artifact.
  - **No signing and no secrets** in this phase.
- **Tests:** a Node test for the overrides script against a temp fixture directory.
- **CI proves:** a debug APK artifact is produced.

### A4: Release signing and distribution workflow (S, owner-secret dependent)
- **Goal:** signed release build path, with secrets read from GitHub Secrets names only.
- **Paste:** `nurse-android.yml`, `docs/OWNER_DECISIONS.md`.
- **Deliver:** a `workflow_dispatch` release job that decodes the keystore from a secret, builds a signed release APK/AAB, and optionally uploads to Firebase App Distribution if the secrets exist. Add `docs/ANDROID_RELEASE.md` listing the secret names the owner must create.
- **Tests:** a workflow lint step (actionlint or YAML parse) only.
- **CI proves:** the workflow parses. The real run waits on owner secrets.

---

## Track B: Nurse app (spec section 11)

Strategy: first make `App.tsx` small and testable with no behaviour change, then add screens one at a time.

### B1: Extract the sync engine (M)
- **Paste:** `nurse/src/app/App.tsx` (lines 20-200, the sync section), `nurse/src/offline/db.ts`, `syncPolicy.ts`.
- **Deliver:** `nurse/src/offline/syncEngine.ts` exposing `runSync(deps)`. Pure functions with injected `apiRequest`, db, and clock. `App.tsx` calls it. Diff only.
- **Tests:** Vitest with `fake-indexeddb` and a stub API: consent-first ordering, owner mismatch becomes needs_attention, retryable vs permanent, single-flight, cursor paging.
- **CI proves:** the new tests pass and the existing `App.test.tsx` is unchanged.

### B2: Extract session and profile state (S)
- **Deliver:** `nurse/src/app/useSession.ts` (login, native/web token handling, sign-out with the logout guard) and `useFieldProfile.ts`. Remove that code from `App.tsx` by diff.
- **Tests:** hook tests for sign-in success and failure, cache-owner switch clears the DB, sign-out revoke fallback message.

### B3: Router, shell and bottom tabs (M)
- **Paste:** `App.tsx`, `nurse/src/styles.css`, `design/tokens.css`, spec section 10.2 and 11.
- **Deliver:** use `react-router-dom` (pinned). Add `AppShell.tsx` with the tabs Today / History / Profile, a `ConnectionBanner`, safe-area padding, and a sync-status chip. Route table in `routes.tsx`. Layout and styles use tokens only.
- **Tests:** route rendering tests, tab `aria-current`, banner state online/offline. Playwright shell spec updated.

### B4: Login and onboarding/permissions (S)
- **Deliver:** `LoginScreen.tsx` per spec 11.1. `Onboarding.tsx` with the location prominent disclosure (reuse `features/disclosure/Disclosure.tsx`). Notification opt-in. Foreground location only.
- **Tests:** disclosure must be accepted before any permission call (spy on the platform adapter). Login error states.

### B5: Today screen and Visit card (S)
- **Deliver:** `TodayScreen.tsx` (Kampala-day filter already in `lib/time`), `VisitCard.tsx`, empty and loading states, the ad hoc button gated by `adhoc_allowed`.
- **Tests:** day-boundary filtering, active visit pinned on top, cancelled/removed visits hidden.

### B6: Visit detail screen (S)
- **Deliver:** `VisitDetail.tsx` (instructions, `notes_for_nurse`, address text, action buttons by status). Links to note and photo actions.
- **Tests:** button matrix per status (scheduled / in_progress / completed / cancelled).

### B7: Arrive and Leave bottom sheets (M)
- **Deliver:** `ArriveSheet.tsx` and `LeaveSheet.tsx` per spec 11.4 and 11.6, with an honest location state (acquiring / low accuracy / denied / unavailable). The "hints only" copy. Offline-safe: always queue the op.
- **Tests:** low-accuracy path still queues, denied-permission path queues with `source` and no coordinates, double-tap does not enqueue twice.

### B8: Active visit screen and timer (S)
- **Deliver:** `ActiveVisit.tsx` with an elapsed timer derived from the stored `check_in` time, so it survives app kills. Quick actions: note, photo, leave.
- **Tests:** the timer is correct after a simulated reload (injected clock).

### B9: Notes and photo UI refactor into screens (S)
- **Deliver:** move the existing note and photo panels into `NoteSheet.tsx` and `PhotoSheet.tsx` using the already-built `compress.ts` / `enqueuePhoto`. Render the stored thumbnail. Add a Wi-Fi-only upload toggle (local preference) and a pending-photo count.
- **Tests:** the Wi-Fi-only toggle blocks the upload stage only, the over-20-pending warning, thumbnail rendering.

### B10: History tab (S)
- **Deliver:** `HistoryScreen.tsx` with paginated cached history and a pull-to-load-more via the existing `/field/history`.
- **Tests:** pagination and an empty state.

### B11: Sync screen and Needs-attention actions (M)
- **Deliver:** `SyncScreen.tsx` per spec 11.8 (queued, deferred with next retry time, needs attention). Actions: retry now, discard (with confirmation and an audit-style local note), copy error detail.
- **Tests:** retry clears `retryAfter`, discard requires confirmation, owner-scoped lists.

### B12: Conflict resolution UI (M)
- **Deliver:** handle the `rejected` reasons (`visit_not_assigned`, `adhoc_disabled`, removed visit) with plain-language cards and "apply again / discard" where valid. Extend `syncPolicy.ts` with a reason-to-message map.
- **Tests:** a reason table test, and apply-again re-queues with a new `client_op_id`.

### B13: SOS button and flow (M)
- **Paste:** `field_ops/router.py` (the `/sos` route), `field/schemas.py`, spec section 23.1.
- **Deliver:** an always-reachable SOS control in `AppShell` (hold-to-confirm), `SosSheet.tsx`, offline queue kind for SOS, and the native SMS fallback via `@byteowls/capacitor-sms` that **opens the composer only**. `features/sos/` module. Message text contains **no health details**.
- **Tests:** hold-to-confirm cannot fire on a single tap, the offline path queues and shows the SMS fallback, and the composed text matches a no-health-terms check (reuse the pattern from `test_no_health_in_sms.py`).
- **Backend check:** if the nurse needs a sync op kind for SOS, add it in C-phase C0 first (see below).

### B14: Safety timer and heartbeat client (S)
- **Paste:** `field/router.py` (`/heartbeat`), `field/schemas.py`, `jobs.py` alert section.
- **Deliver:** `useHeartbeat.ts` sending while a visit is active (foreground, with an interval and app-resume send), and an end-of-timer prompt per spec 23.4. No background service.
- **Tests:** interval and cleanup with fake timers, stops on check-out, never runs when no active visit.

### B15: Profile screen, push inbox and app update notice (S)
- **Deliver:** `ProfileScreen.tsx` (account, device, consents versions, notification opt-in, sign-out), `UpdateNotice.tsx` wired to `/field/app/version` and `min_app_version`, a push inbox list (needs the C5 endpoint, otherwise stub behind a flag).
- **Tests:** a version comparator test (reuse or add in `lib`), forced-update blocking state.

### B16: Design polish pass (M, optional)
- **Deliver:** a minimalist, token-driven `styles.css` rewrite by diff sections. Motion with `prefers-reduced-motion` respected. No new dependencies.
- **Tests:** a snapshot-free CSS lint (a script asserting only token variables are used for colour).

### B17: Copy centralisation and string guard (S)
- **Deliver:** move all user-facing strings into `nurse/src/copy.ts`. Make sure `scripts/check-strings.mjs` runs on the nurse build and passes.
- **Tests:** the string-guard fixture test.

---

## Track C: Backend gaps

Each phase: write the model/router/service change plus pytest (pure rule tests, HTTP tests, DB tests). Use existing patterns (`tests/test_http_field.py`, `test_db_field.py`).

### C0: Sync push op kinds for SOS and photo metadata (S)
- **Paste:** `field_ops/router.py`, `field/schemas.py`, `field/service.py`.
- **Deliver:** extend the `kind` pattern (`sos`, optional `visit_photo` metadata), keep idempotency by `client_op_id`, and return `duplicate`/`rejected` per spec 7.1.
- **Tests:** duplicate returns `duplicate`, an unassigned visit is rejected, and the payload size cap is unchanged.

### C1: App releases endpoint (S)
- **Deliver:** `app_releases` model, `POST/GET /admin/app-releases` (super_admin), latest/min lookup used by `/field/app/version`, and a migration `0012`.
- **Tests:** scope enforcement (wrong scope 403), semver ordering, `min_app_version` precedence.

### C2: Audited admin photo streaming and thumbnails (M)
- **Paste:** `care_ops/router.py` (photos), `core/photo_store.py`, `retention`, spec 7.3 and 8.5.
- **Deliver:** `GET /admin/visits/{id}/photos` returning short-lived signed delivery URLs, plus a thumbnail route. Every view writes an `audit_log` entry. Consolidate Cloudinary references behind `photo_store.py` (needed to enable the planned path guard).
- **Tests:** unauthorised user rejected, out-of-reach supervisor rejected, a hidden photo never returned, each view audited, and URL TTL set.

### C3: Nurse invite lifecycle (M)
- **Deliver:** invite token model, `POST /admin/nurses/{id}/invite`, `POST /auth/accept-invite` (set password), expiry and single use, resend, and revoke. Team-reach rules reused.
- **Tests:** expiry, reuse rejected, out-of-reach invite rejected, the existing set-password flow is unaffected.

### C4: Scope presets (S)
- **Paste:** `auth/scopes.py`, `tests/test_scopes.py`.
- **Deliver:** named presets (nurse, supervisor, admin, super_admin) as pure data plus an admin endpoint listing them, applied on user create/invite.
- **Tests:** a preset-to-scope table test, no preset grants more than its role.

### C5: Push lifecycle (M)
- **Deliver:** FCM token rotation (replace by device), revocation on sign-out/device revoke, durable delivery records with retry/backoff in a job, and `GET /field/inbox` + mark-read.
- **Tests:** rotation replaces rather than duplicates, a revoked device gets no push, backoff schedule is pure and tested, and the inbox is scoped to the nurse.

### C6: Reports filters and audited CSV (S)
- **Deliver:** `nurse`, `client`, `from/to`, `format=csv|json` on `/admin/care/reports/visits`. CSV export writes an audit entry. Cursor pagination on JSON.
- **Tests:** filter combinations, CSV injection escaping (leading `= + - @`), an audit row per export.

### C7: Retention decision implementation (S, needs your decision)
- **Deliver:** if you decide on `retention.requests_months` compatibility, a diff to the legacy enquiry retention that honours it with the 24-month default preserved. Otherwise just document.
- **Tests:** the existing 24-month tests remain unchanged and new tests cover the override.

### C8 to C14: Route acceptance matrices (one module per session, S each)
Add the missing 401 / wrong-scope 403 / 404 / 422 / idempotency / reach-isolation tests for:
- **C8** field (`/field/*`)
- **C9** field_ops (`/sync/*`, photos, sos, device)
- **C10** care_admin clients/places/stays
- **C11** care_admin visits (schedule/reassign/cancel/annotate)
- **C12** care_ops alerts and timesheets
- **C13** care_ops sos and data requests
- **C14** nurses admin (reach, supervisor, override, revoke)

Rules: tests only (plus small fixes if a test exposes a bug), and use the existing `conftest.py` fixtures. Extend `test_route_coverage.py` so any route without a test fails CI.

---

## Track D: Admin UI (spec section 12)

Strategy: first split the workspace into routed screens, then fill each screen.

### D1: Routed care screens skeleton (M)
- **Paste:** `CareWorkspace.tsx`, `features/admin/nav.ts`, `screens.tsx`, `AdminApp.tsx`, `locales/en/adminCare.ts`.
- **Deliver:** a `care/` route group with one screen component per tab (initially thin wrappers around the current table), new nav entries behind the existing scope checks, and shared `useCareList` hook.
- **Tests:** nav scope visibility (extend `nav.test.ts`), each route renders.

### D2: Nurses screen: list, invite, edit, supervisor (M)
- Uses C3 and C4. Forms with validation. Deactivate, device revoke with confirm.
- **Tests:** form validation, confirm dialogs, out-of-reach errors displayed.

### D3: Clients and places with map picker (M)
- **Deliver:** `MapPicker.tsx` using the configured `care.map_tile_url` (no external script; check against `scripts/check-no-external.mjs` and the allowlist), pin plus radius. Stay movement form.
- **Tests:** coordinate and radius validation, and the picker emits a rounded lat/lng.

### D4: Schedule screen (M)
- **Deliver:** replace the "use IDs" form with pickers for client / nurse / place, a week list, and reassign/cancel actions.
- **Tests:** picker filters by supervisor reach, overlap warning display.

### D5: Visit review upgrade (M)
- **Deliver:** an event timeline with distance and verification badges, an event-pin map (reuse D3 map code), and annotate.
- **Tests:** ordering, verification badge states, the map renders pins with no coordinates handled.

### D6: Flags queue (S)
- Filters, resolve with a required note, and a link to the visit.

### D7: Photo review gallery (M)
- Uses C2. Thumbnail grid, a full view that requests a signed URL on demand, hide with a reason, and a lazy audit notice.

### D8: Alerts and dashboard (M)
- Team/org views, alert acknowledge/resolve, and a "last seen" freshness display.

### D9: Timesheets (M)
- Weekly view, adjust with a required reason, approve/send back, and final export locked until approved.

### D10: SOS console and on-call roster (M)
- **Deliver:** SOS case list and acknowledge, a roster editor writing the `sos.on_call_contacts` setting with validation, and a test-SMS button using `sms.test_number`.
- **Tests:** roster validation (E.164), acknowledge permission.

### D11: Reports screen (S)
- Uses C6. Filters, a preview table, and CSV download with an audit notice.

### D12: Settings and readiness screens (M)
- Schema-driven settings form (from the registry), a readiness checklist with deep links, and scope-resolution display.

### D13: Audit history viewer (S)
- Filter by actor/entity/date, cursor paging, read-only.

---

## Track E: Test and QA infrastructure

### E1: Nurse Playwright with mocked API (M)
- **Deliver:** `nurse/e2e/fixtures.ts` using `page.route` to fake `/api/v1/...`. Scenarios: login, today list, check-in offline then reconnect (single `duplicate`-safe sync), note, photo queue, logout guard.

### E2: Accessibility (axe) (S)
- Add `@axe-core/playwright` (**NEEDS PIN**). Run on each nurse screen and each admin care screen. Fail on serious/critical.

### E3: Responsive matrix (S)
- Playwright projects: 360x640, 390x844, 768x1024, 1280x800. Assert no horizontal scroll, bottom tabs visible, and the SOS control reachable.

### E4: Real-backend E2E workflow (L, split in two sessions)
- **E4a:** a workflow starting Mongo replica set + backend with seed data (existing `seed.py` plus a nurse seed), health wait.
- **E4b:** a Playwright suite against it: nurse login, check-in, admin sees the verified event.

### E5: Admin care component tests (S each, two sessions)
- Fill the gap (the current care workspace has about 5 tests). One session for tables and forms, one for the review panel and dialogs.

### E6: Bundle and performance budget (S)
- Update `check-bundle-size.mjs` thresholds for the nurse app per spec 26, and add a Lighthouse-style check only if it needs no external service.

---

## Track F: Owner-only documentation (no risky code)

Each is a doc-only session. Output goes in `docs/`.

- **F1:** Northflank deployment checklist (env vars from `ENV_VARS.md`, health check, scheduler single-instance warning).
- **F2:** B2 Object Lock and the restore drill runbook, tied to `scripts/*b2*.sh`.
- **F3:** Firebase two-app setup and the App Distribution tester group guide.
- **F4:** Cloudinary private delivery configuration and usage alerts.
- **F5:** PDPO registration and consent template checklist, linked to the privacy notice version settings.
- **F6:** Nurse install guides (Android APK, iOS PWA) and a pilot plan with a go/no-go sheet.
- **F7:** SOS response procedure and the on-call roster template (needed before enabling SOS).

---

## 3. Progress tracker

Copy this into `docs/NURSE_IMPLEMENTATION_STATUS.md` or keep it alongside the plan.

- [x] A1 Deps and lockfile
- [x] A2 PWA manifest and icons
- [x] A3 Android CI build
- [ ] A4 Release signing workflow
- [ ] B1 Sync engine
- [ ] B2 Session hooks
- [ ] B3 Router and shell
- [ ] B4 Login and onboarding
- [ ] B5 Today
- [ ] B6 Visit detail
- [ ] B7 Arrive and Leave sheets
- [ ] B8 Active visit
- [ ] B9 Notes and photo UI
- [ ] B10 History
- [ ] B11 Sync screen
- [ ] B12 Conflict UI
- [ ] B13 SOS
- [ ] B14 Safety timer
- [ ] B15 Profile, inbox, update
- [ ] B16 Design polish
- [ ] B17 Copy and strings
- [ ] C0 Sync op kinds
- [ ] C1 App releases
- [ ] C2 Photo streaming
- [ ] C3 Invites
- [ ] C4 Scope presets
- [ ] C5 Push lifecycle
- [ ] C6 Reports and CSV
- [ ] C7 Retention decision
- [ ] C8 to C14 Route matrices
- [ ] D1 Routed skeleton
- [ ] D2 to D13 Admin screens
- [ ] E1 to E6 Test infrastructure
- [ ] F1 to F7 Owner docs

## 4. After each batch of phases

Push to the `nurse-module` branch and let CI run. Paste only the **first failing error per job** into a CI-fix session. Do not start the next track until the previous track's CI is green. Phases written on top of red CI compound failures.

## 5. Known risks to keep in mind

- Pinned versions in `package.json` were never validated. Expect A1 to surface a few resolution errors.
- Replica-set tests depend on the Mongo service in `ci.yml`. If they fail, fix the CI service first.
- Android and push can only be accepted on real devices (at least 3 brands per spec Phase 7). CI proves only that the APK builds.
- Phase 8 (pilot) stays gated on PDPO registration, a passed restore drill, and a production database off the free tier.
- **Deployed CSP will likely block the API.** `nurse/vercel.json` sets `connect-src 'self' https://api.cloudinary.com`, so calls to the Northflank API origin will be refused in production. Add the API origin (owner-supplied) in a short fix session before the pilot.
- **Do the lockfile step first.** After unzipping, push to `nurse-module`. The `nurse-lockfile` workflow generates `nurse/package-lock.json`. Review and keep it, then re-run the nurse workflows. Until then `nurse-app` and `nurse-android` fail on purpose.
- **Android SDK step is unverified.** The `sdkmanager` package names for Capacitor 7 (`platforms;android-35`, `build-tools;35.0.0`) may need adjusting after the first CI run.
