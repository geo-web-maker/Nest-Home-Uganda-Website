# Nurse Module implementation status

## Current delivery summary

This ZIP contains the existing Well Nest Home Care website plus a growing additive Nurse Module implementation. It includes care settings/readiness endpoints, care clients/places/stays/visits, field operations, scope/reach scaffolding, alerts/timesheets/SOS, push-dispatch scaffolding, owner-run B2 backup tooling, and the nurse PWA. The latest continuations add real nurse-side note capture, local history, assigned-client caching, queued photo capture/upload, a needs-attention panel, user-bound local queues and cache isolation for shared devices, best-effort server token revocation on sign-out, native session restoration, push-listener cleanup, the first end-to-end unscheduled-visit route, server-side Cloudinary upload completion verification, a scheduled care-retention job, additional nurse reach/device-ownership safeguards, guarded logout with periodic sync, and shared sync-failure classification with a single-flight guard.

The public booking form includes the owner-approved warning: “Please do not enter medical details here”, with a regression test retaining the existing required consent.

## Implemented in this continuation, but not run

- **Offline field UI:** note capture stores an outbox operation locally; history and assigned clients are cached in IndexedDB; queued photo blobs are stored locally and recovered if an upload was interrupted.
- **Unscheduled visits:** added `GET /api/v1/field/clients`, `POST /api/v1/field/visits/adhoc`, a pure setting-override rule, active-stay selection based on the Kampala-local visit date, client assignment validation, and a Mongo transaction that creates the visit, check-in event, and flag. The sync-push schema accepts the unscheduled operation and enforces a 256 KB request cap.
- **Photo proof:** client-side compression is added; the server signs upload requests, verifies Cloudinary asset metadata before marking a photo uploaded, and audits completion. Photo upload errors in the 4xx range are routed to needs-attention rather than retried forever.
- **Retention:** added `run_care_retention` scheduled at 03:10, with owner-configured month settings for coordinate redaction, SOS location redaction, and photo expiry. Zero means the corresponding automated purge/redaction does not run. Every successful run writes an audit summary.
- **Regression coverage authored:** unscheduled-visit setting and stay-date rules, retention cutoff rules, image input validation, offline cache tests, and a minimal field-payload guard.

## Latest continuation: offline logout protection

- Added an accessible logout confirmation when any outbox or photo record remains, including records marked for attention. The user can keep working or sign out while preserving the local work for the same account to sync after sign-in.
- Added unit coverage for the logout confirmation policy and dialog rendering/explicit confirmation.
- Added a best-effort request for persistent browser storage and a five-minute online sync interval; both are enhancements and do not replace the offline local store.
- These additions are **Written, not run. CI will run it.** The logout dialog has not been exercised in a browser or on Android.

## Latest continuation: sync failure policy and single-flight protection (2026-10-25)

- Added `nurse/src/offline/syncPolicy.ts` to consistently classify failures for queued writes and photo uploads. Network errors, HTTP 401 (session may need restoration), 408, 425, 429, and 5xx failures remain retryable; definitive 4xx failures are moved to needs-attention so they do not indefinitely block later queued work.
- Consent and visit outbox error handling now records server detail where available. Definitively rejected unscheduled visits are also marked `needs_attention` in the local visit cache.
- Added a single-flight sync guard so manual, online-event, and periodic sync triggers cannot run overlapping outbox processing concurrently.
- Added unit tests for transient/permanent classification and error-message extraction. These are authored but not run.

## Still not complete or not acceptance-verified

1. **Dependency reproducibility:** `nurse/package-lock.json` is not present. Package pins and transitive resolution are unvalidated. This must be resolved in an environment permitted to install dependencies.
2. **Nurse accounts and access:** the base login service already supports email/phone/either mode, but the complete invite lifecycle, scope presets, full invitation/edit lifecycle acceptance, scope presets across every account type, remaining team/supervisor workflows, device revocation lifecycle acceptance, and their complete HTTP/database test matrix remain incomplete. A further pass now applies reach checks to nurse update, supervisor change, unscheduled-visit override, and device-revocation routes and prevents device reassignment/revival in the repository; these tests remain unrun.
3. **Domain and API acceptance:** many care routes exist, but not every route has the specified success, 401, wrong-scope 403, 404, 422, idempotency, concurrency, reach-isolation, transaction-failure, and exact-response tests. Replica-set tests have now been authored for unscheduled-visit rollback, duplicate operations, disabled setting, unassigned client, and missing stay. CI must run them; midnight/date-boundary unit coverage exists but needs end-to-end confirmation.
4. **Admin UI:** `CareWorkspace` is still a general workspace. The workspace now exposes separate operational tabs for nurses, clients, visits, places, team, photo review, alerts, timesheets, SOS, reports, settings, readiness, and data tools. Basic place creation and stay movement, visit scheduling, scheduled-visit reassignment/cancellation, photo hiding, alert acknowledgement/resolution, timesheet approval/send-back, SOS acknowledgement, and flag resolution are authored. It is still a table-driven workspace rather than the full set of dedicated approved mockup screens; nurse invite/edit, detailed client and visit review, photo streaming/viewing, audit history UI, on-call roster, and other workflow-specific UI actions remain incomplete.
5. **Field experience:** note capture, history, and photo queue UI are now present, but the full approved Today/detail/arrival/active/leave/history/profile/permissions/logout flow is incomplete. Local visit reminders are now authored through a native adapter with explicit permission opt-in, schedule rebuilds, and foreground recovery. The schedule covers 15-minute, start-time, and scheduled-end reminders without client details. Safety-timer-specific scheduling and real-device acceptance remain incomplete. Full conflict-resolution UI and all background/foreground recovery cases still need work. Cursor-based pull and removal tombstones are now authored, but require CI and end-to-end acceptance.
6. **Photo lifecycle:** upload completion verification and compression are authored, but audited photo streaming/viewing, cleanup retries, EXIF/location stripping, per-client consent and per-visit limit edge cases, and end-to-end offline upload tests remain incomplete. No live Cloudinary upload was performed.
7. **Retention and privacy:** the care retention scheduler and database tests for coordinate redaction, photo expiry, provider failure retryability, and idempotent reruns have been authored. They remain unrun, and audit-summary execution plus all owner-supplied retention periods still need CI/operational confirmation. The existing public-enquiry retention job is deliberately unchanged pending an explicit compatibility decision for `retention.requests_months`; this is documented in `docs/OWNER_DECISIONS.md`.
8. **Native Android:** Capacitor configuration and Android override files exist, but the generated native Android project, Gradle wrapper/build configuration, release signing pipeline, and device testing are not complete. Refresh-token rotation exists in the server service and client retry path; this pass adds startup refresh-token restoration and push-listener cleanup. Full device revocation/logout/session lifecycle acceptance remains outstanding.
9. **Push notifications:** dispatcher/FCM scaffolding exists, but full FCM token rotation/revocation, durable delivery retry/backoff, native receipt behaviour, and the complete push acceptance matrix remain incomplete. The client now attaches listeners before registration and removes them on sign-out/unmount. This phase also adds push-received and push-tap callbacks that trigger sync, and native local visit reminders with explicit permission opt-in. Protected deep-link navigation, full token rotation/revocation, durable delivery retry/backoff, inbox UI/API acceptance, and real-device push acceptance remain incomplete.
10. **CI and release checks:** all Playwright/axe scenarios, bundle checks, generated OpenAPI/type reconciliation, lint/typecheck/build, and full backend/frontend test suites need to run in CI. The current nurse app does not yet have a reproducible lockfile, so its `npm ci` workflow needs correction before CI can be considered reliable.
11. **Operations:** no real provider backup, B2 Object Lock validation, restore drill, Northflank deployment, Cloudinary configuration, Firebase configuration, or Android release was executed. Owner-controlled configuration and operational acceptance remain required.

## Backup and database decisions

The owner selected two external MongoDB databases, private database connectivity option B, and Backblaze B2. The backup scripts are designed for a trusted owner-controlled host; GitHub-hosted runners do not connect to production MongoDB. B2 bucket retention/Object Lock must be configured and verified by the owner. No real backup or restore drill has been performed.

## Latest continuation (2026-10-25)

Additional code authored after the prior completion pass:

- Nurse administration endpoints now apply a fail-closed reach predicate to update, supervisor change, unscheduled-visit override, and device revocation. Team-reach invitations are restricted to the acting supervisor's team and require an active supervisor.
- Device registration no longer permits a device ID to be reassigned across accounts or a revoked device to be revived. Device revocation input now has a validated schema.
- Regression tests were added for the reach predicate, out-of-reach admin actions, device ownership, and revoked-device handling.
- Native push listeners are installed before registration and cleaned up on sign-out/unmount. Native startup attempts secure refresh-token restoration; network failure does not erase the secure token.

These changes are authored only and have not been executed. Additional gaps remain in the dedicated admin and mobile screens, complete offline sync/conflict behaviour, audited photo streaming and cleanup, durable push retry/revocation, generated Android/Gradle/release setup, lockfile generation, complete CI acceptance, and owner-run deployment/backup verification.

## Phase 12 continuation (2026-10-25)

- Added native local visit reminders with explicit user opt-in and generic privacy-preserving message text.
- Added app-resume sync, push receipt/tap listeners, listener cleanup, and pure schedule tests.
- No background location permission or background service was introduced.
- Safety-timer-specific reminders, deep-link routing, FCM lifecycle acceptance, and Android device testing remain outstanding.

## Validation statement

Per `CHATGPT_PROMPT.txt`, no application command, dependency installation, build, or test suite was run. All new code and tests are **Written, not run. CI will run it.** Archive integrity is not equivalent to a successful build. Do not deploy this ZIP as release-ready until the remaining work above is completed and CI plus owner-controlled operational checks have been reviewed.


## Latest continuation: retry backoff and due-work scheduling (2026-10-25)

- Added exponential retry scheduling for transient nurse outbox and photo-upload failures. Delays start at 2 seconds, double per attempt, and cap at 5 minutes. Retry timestamps are persisted with the IndexedDB records.
- Queue readers now return only queued records whose retry time has arrived. The total waiting count continues to include deferred records so the nurse can see that work remains pending.
- Manual retry clears the scheduled delay and makes the selected operation/photo eligible immediately. Permanent failures continue to move to Needs attention.
- Added tests for backoff values, deterministic retry timestamps, and due/not-yet-due queue filtering. These tests are authored but not run.
- This improves retry pacing. A later continuation now adds cursor-based pull and removal tombstones, but the complete conflict-resolution UI and end-to-end sync acceptance remain outstanding.


## Latest continuation: cursor pull and removal tombstones (2026-10-25)

- Authored an opaque cursor helper based on `(updated_at, stable key)` with malformed-cursor fallback and stable tie ordering. The endpoint uses bounded indexed reads from visit and tombstone streams before merging each page.
- Added visit update timestamps and a registered `VisitSyncTombstone` model so cancellation and reassignment can tell the previous nurse's device to remove a stale visit.
- Reworked the nurse pull endpoint to return changed visits, removal IDs, a cursor, and `has_more`; current schedule-window bounds come from the care settings registry.
- The PWA now pages through cursor responses, persists the cursor per account, applies each page and cursor atomically in IndexedDB, removes tombstoned visits, flags pending actions attached to removed visits for review, and clears the cursor whenever its local cache is cleared. The Today screen filters the wider cached window to Kampala calendar day while retaining active visits.
- Authored pure cursor tests, database-backed paging coverage, an unauthenticated route test, and local database page/tombstone tests.

**Limitations:** no tests, build, typecheck, package installation, or device validation were run. Migration `0011_visit_sync_cursor.py` now backfills legacy `updated_at` values and adds cursor indexes, but its execution against a deployed database is not confirmed. Full concurrent/replay conflict tests remain outstanding. The current UI can discard a pending action tied to a removed visit, but it does not yet offer a general server-version/apply-again resolution workflow.

## Latest continuation: photo lifecycle hardening (2026-10-25)

- Photo preparation now re-encodes images to JPEG at a 1280 px longest-side limit and quality steps from 0.7 to 0.4 until the image is at most 400 KiB. It creates a 160 px thumbnail capped at 60 KiB and validates the JPEG byte signature instead of trusting MIME metadata. Browsers without safe image decoding fail closed. Canvas re-encoding strips embedded metadata where supported.
- The IndexedDB photo record now persists a thumbnail and upload checkpoint. Once the provider upload succeeds, the checkpoint is saved before the API completion call, so a later retry can resume at completion instead of repeating the upload.
- Saving a photo now checks browser storage availability when supported and warns when more than 20 photos are pending.
- Added a scheduled abandoned-upload cleanup at 03:40. It retries deletion of pending photo registrations older than 24 hours; provider failures leave the record pending for the next run.
- Added regression coverage for JPEG signature checks, approved compression limits, local thumbnail/upload-stage persistence, stale pending cleanup, and retry after provider deletion failure.

### Remaining photo lifecycle gaps

Audited admin image streaming and thumbnail routes, enforced authenticated/private Cloudinary delivery end-to-end, true provider-side enumeration of assets with no metadata row, full thumbnail rendering and Wi-Fi-only/manual upload preference, and the full Playwright offline-photo scenarios are still incomplete. Tests and builds remain unrun. This phase is source-authored only and is not release-verified.


## Phase 11 continuation: care visit review interface

The admin care workspace now has an initial visit-review panel that loads the existing visit-detail API on demand and presents the visit summary, ordered events, notes, flags, photo metadata, annotations, and audit entries. Reviewers can add annotations and resolve flags with a note. Scheduled reassignment now uses the existing PATCH route. Regression tests were authored but not run.

Remaining in this area: audited private photo streaming and thumbnail routes, actual map/radius/event-pin visualisation, richer report filtering and audited CSV download handling, dedicated route-level screens matching all approved mockups, and full browser/axe acceptance.

Written, not run. CI will run it.


## Phase 13 status: CI and integration coverage

Implemented in source, not run:

- The full repository CI workflow now triggers on the `nurse-module` branch.
- Removed duplicate CI workflow job/step definitions and added the planned Google-hosted CSS/font guard.
- Nurse CI now installs Chromium, runs `npm run test:e2e` after build/bundle checks, and uploads Playwright diagnostics.
- The nurse offline browser test now loads the page online before simulating disconnection and verifies offline and reconnect transitions.
- Playwright CI reporting includes HTML output, failure traces and screenshots.

Outstanding acceptance/integration work:

- No nurse Android Gradle project or `scripts/apply_android_overrides.mjs` is present, so Android debug APK CI is not yet enabled.
- No committed nurse package lockfile exists; CI creates one on the runner. Commit a reviewed lockfile before relying on deterministic transitive dependency resolution.
- Real-backend nurse E2E, responsive layout matrix, accessibility checks, FCM backend inbox integration, and token rotation/revocation acceptance remain incomplete.
- Cloudinary integration references currently exist in router/model/retention code outside `backend/app/core/photo_store.py`; do not enable the strict planned path guard until those references are consolidated safely.

**Written, not run. CI will run it.**


## Phase 14: foundation A1 to A3 (2026-10-25)

Source-authored, not run. Plan: `docs/NURSE_FREE_SESSION_PLAN.md`.

- **A1:** removed six unused nurse dependencies, added the test tooling the existing tests already import (`jsdom`, `@testing-library/*`, `@types/node`, `@eslint/js`) at the frontend's pins, added `src/vite-env.d.ts`, added the `nurse-lockfile` workflow and made `nurse.yml` require a committed lockfile. New guard test `scripts/__tests__/nurse-package.test.mjs`.
- **A2:** single PWA manifest in `src/pwa/manifest.ts`, committed brand-mark icons, cleaned `index.html`, manifest unit test and `e2e/pwa.spec.ts`.
- **A3:** `scripts/apply_android_overrides.mjs`, its test, and `nurse-android.yml` (debug APK). Overrides now also set `allowBackup="false"`. Removed the obsolete `bundledWebRuntime` key from `capacitor.config.ts`.

**Open items created by this phase:** the lockfile must be generated by the workflow and reviewed once; the Android SDK component names in `nurse-android.yml` are unverified; `nurse/vercel.json` `connect-src` does not yet include the API origin.

**Written, not run. CI will run it.**

## Track B consolidation checkpoint (2026-10-25)

This appendix records the current nurse-app source state. It supplements earlier historical “still incomplete” entries rather than deleting those entries; where this checkpoint now covers the earlier field-experience gap, the old entry remains historical context. See `docs/TRACK_B_COMPLETION_AUDIT.md` for the B1–B17 matrix and `docs/TRACK_B_CHECKLIST.md` for acceptance steps.

- **B1–B3:** injected sync engine, cursor-paging helper, session/profile hooks, route table and shell/navigation are present.
- **B4–B10:** login/onboarding, Today/visit/detail/arrival/departure/active-visit, note/photo and History flows are connected to the Nurse workspace.
- **B11–B12:** owner-scoped queued/deferred/attention lists, retry/discard and plain-language conflict policy are present; blind apply-again is blocked for removed/unassigned or malformed actions.
- **B13–B15:** shell SOS and SMS-composer fallback, foreground heartbeat and safety timer pending/confirmed states, Profile and update notice are present. Push inbox UI stays behind `VITE_NURSE_INBOX_ENABLED` until Track C5 supplies the `/field/inbox` contract.
- **B16–B17:** token-driven/reduced-motion styling and string/copy guard infrastructure are present. Visit state labels, outbox operation labels and the visible SOS label use central copy helpers; `nurse/src/copy.test.ts` covers the label maps. New regression cases cover screens, session/owner switching, sync safety, offline merge, conflict visibility, photo/update flows and safety timer state.
- Offline data safety tightened: pending local arrival/departure survives stale pull data; checkout and its final note are persisted atomically; a safety timer is not called server-monitored until the server confirms it; one-time upload override is limited to a selected photo.

**Outstanding acceptance:** `nurse/package-lock.json` is absent, so `.github/workflows/nurse.yml` currently stops at its lockfile gate. No app commands, install, build, test suite, backend suite or device validation were run. The added tests are authored, not passed. Android lifecycle, push, SOS provider and actual server timer remain integration/device gates. The deployment API origin in `nurse/vercel.json` must be verified from owner-controlled configuration.

**Next phase:** lockfile generation/review, then CI fix sessions and the manual/device checklist. **Written, not run. CI will run it.**

## Track C consolidation checkpoint (2026-10-26)

This checkpoint adds the Track C backend contracts and acceptance tests on top of the Track B archive. See `docs/TRACK_C_COMPLETION_AUDIT.md` for the C0–C14 implementation details and known blockers, `docs/TRACK_C_CHECKLIST.md` for the handover sequence, and `docs/TRACK_C_FILE_MANIFEST.md` for the changed-file inventory.

- **C0:** sync push handles SOS and visit-photo metadata, keeps the payload cap, persists idempotency receipts, and rejects reuse of one client operation key with changed payload.
- **C1:** app release model, semantic-version ordering, superadmin release routes, `/field/app/version` minimum-floor policy and migration 0012 are present.
- **C2:** admin photo/thumbnail delivery uses short-lived signed links, reach/visibility checks, private no-store responses and audit entries; provider operations are centralised in `photo_store.py`.
- **C3:** invitation purpose, expiry, single-use acceptance, resend and revoke flows are present; team reach is reused.
- **C4:** server scope presets are exposed by an admin endpoint and the Admin Users page uses the API rather than its own hard-coded scope bundle list.
- **C5:** device token rotation/revocation, durable push delivery/retry, scheduled retry job and signed-in-nurse inbox/read APIs are present. The UI remains feature-flagged until staging acceptance.
- **C6:** filtered visit JSON/CSV, stable cursor paging, CSV formula-injection escaping and export audit are present.
- **C7:** explicitly pending owner decision; legacy 24-month public enquiry retention is unchanged.
- **C8–C14:** route-generated scope/auth tests remain in place; a new representative route matrix and module-specific DB-backed tests cover the new behaviours. This is not a claim that every endpoint-specific status/reach combination has already passed.

**Acceptance blockers:** the nurse lockfile must be generated and reviewed; committed OpenAPI/types need regeneration and review; migration/provider/FCM/invite/report tests need CI and staging execution; owner settings and real artifact URLs must be supplied where applicable. No project tests, generation, migration, build or device commands were run for this checkpoint.

**Status: Written, not run. CI will run it.**

## Track D checkpoint (2026-10-26)

Track D admin UI work is now source-authored on top of Track C. See `docs/TRACK_D_COMPLETION_AUDIT.md`, `docs/TRACK_D_CHECKLIST.md`, and `docs/TRACK_D_HANDOVER.md`.

- D1 routed `/admin/care/*` screen group with explicit per-screen read scopes and shared care-list behaviour.
- D2 nurses: invite, resend, activate/deactivate, supervisor and device-revocation actions.
- D3 clients/places/stays: validated coordinate/radius picker and stay movement.
- D4 scheduling: client/nurse/place pickers, reassignment/cancellation and server overlap handling.
- D5 visit review: event timeline, verification/distance display, coordinate map and annotation.
- D6 flags: filter and required-note resolution.
- D7 photos: private review surface and hide-with-reason workflow using Track C signed delivery.
- D8 alerts/team: acknowledge/resolve and last-seen surfaces.
- D9 timesheets: review actions, reasoned adjustments and approved-export rule.
- D10 SOS: case acknowledgement, on-call roster setting and isolated test-SMS endpoint.
- D11 reports: filtered preview and audited CSV path.
- D12 settings/readiness: registry-driven settings and readiness checklist.
- D13 audit: actor/entity/date filters with cursor pagination.

Generated OpenAPI/frontend types were intentionally not hand-edited. No project tests, builds, browser sessions, migrations, provider calls or dependency installs were run. **Written, not run. CI will run it.**

## Track E - Test and QA infrastructure (2026-10-26)

- E1 added a deterministic nurse Playwright mocked-API fixture and mocked workflow scenarios for login, today data, offline/online transitions and logout baseline.
- E2 added the pinned `@axe-core/playwright` dependency and accessibility suites for nurse and admin care screens, failing on serious/critical violations.
- E3 added 360/390/768/1280 responsive browser coverage plus a nurse touch-target smoke guard.
- E4 added a CI-oriented E2E seed entry point and a real-backend nurse workflow that is opt-in through `E2E_BASE_URL`.
- E5 expanded admin care component coverage for the core table/form screen families.
- E6 strengthened the bundle guard with a 200 KiB aggregate budget, an 80 KiB nurse route-chunk budget and a no-Leaflet-in-nurse-bundle rule.
- Track E is **written, not run**. Package installation, browser execution, real MongoDB/MinIO integration and all CI gates remain pending.
