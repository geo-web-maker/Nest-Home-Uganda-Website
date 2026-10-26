# Nurse Module build log

This log records authored work only. No application commands, tests, package installs, or builds were run in this environment. Every work order status is therefore **Written, not run. CI will run it.** This ZIP contains an initial implementation foundation, backup tooling, and scaffolding. It does not yet implement every acceptance criterion in the master plan; see `docs/NURSE_IMPLEMENTATION_STATUS.md` for the explicit remaining work.

## WO-00 - Foundations and CI

Files added include `nurse/` Vite/PWA shell and offline outbox, `shared/fixtures/geo_cases.json`, `docs/PINS_NURSE.md`, `docs/ENV_VARS.md`, `.env.example`, repository guard scripts, baseline tests, and initial GitHub workflows. Existing `ci.yml` was not comprehensively rewritten. Package-lock generation is not included because installs and commands were prohibited.

Public functions: `enqueueOperation`, `listQueuedOperations`; app component `App`.
Routes: no API routes introduced in WO-00.

Status: Written, not run. CI will run it.

## WO-01 - Scopes, reach, presets, nurse accounts

Files added: `backend/app/modules/nurses/{models,repository,schemas,service,router}.py`, `backend/migrations/0006_care_users.py`; changed `backend/app/modules/auth/scopes.py`, `backend/app/registry.py`, `backend/tests/test_scopes.py`, and route-guard tests.

Public functions: `get_profile_for_user`, `get_device`, `register_device`, `profile_for_user`, `register_user_device`, `get_nurse_profile`, `register_device`.
Routes: `GET /api/v1/admin/care/nurses/{user_id}`, `POST /api/v1/field/devices`.

Status: Written, not run. CI will run it. This is a foundation, not the complete nurse account, reach, login-identifier, and preset workflow.

## Backup and recovery

Added `scripts/backup-mongodb-to-b2.sh`, `scripts/restore-mongodb-from-b2.sh`, `.github/workflows/backup.yml`, `.github/workflows/restore-drill.yml`, and `docs/BACKUP_AND_RECOVERY_B2.md`. These follow owner choice B: the private MongoDB databases are not accessed from GitHub runners. Scripts are owner-run and require a trusted host, explicit database URI, encryption passphrase, and B2 configuration.

Status: Written, not run. CI will run it. No real backup or restore has been performed.


## Continuation after owner approval on 2026-10-25

The owner approved option B for the public booking warning. The following additional changes were authored: 

- `frontend/src/locales/en/booking.ts`: added `medicalDetailsWarning` with the exact owner-approved sentence.
- `frontend/src/features/public/booking/BookingForm.tsx` and `BookingForm.module.css`: displayed the warning next to the free-text note field with accessible note semantics and clear visual emphasis.
- `frontend/src/features/public/booking/BookingForm.test.tsx`: added a regression test that checks the warning and proves the existing contact-consent checkbox remains mandatory.
- `backend/app/core/photo_store.py`: centralized Cloudinary upload signing and asset deletion. The field and admin photo-sign routes use this helper rather than duplicating signatures and provider URLs.
- `backend/app/modules/care_retention/retention.py`: added the approved data-request removal path for photo assets and clearing visit-note free text.
- `backend/app/modules/care_ops/router.py`: added audited client data export and anonymisation routes protected by `system:manage`. Export includes client, place, stay, visit, note, event, photo metadata and matching consent rows. Anonymisation fails closed if associated photos exist but photo storage is not configured, or if provider deletion fails.
- `backend/tests/test_photo_store.py`, `backend/tests/test_http_care_admin.py`, `backend/tests/test_db_care_core.py`, and `frontend/src/features/admin/care/CareWorkspace.test.tsx`: added coverage for photo signing constraints, data-route permissions, data purge behaviour, and the admin data tools.
- `frontend/src/features/admin/care/CareWorkspace.tsx` and `care.css`: added a Data and retention view for audited export and confirmed anonymisation.
- `backend/app/modules/field/service.py` and `backend/app/modules/field_ops/router.py`: hardened idempotency handling so an operation ID reused across a different nurse or visit is rejected, and so unexpected service/database errors are not silently mislabeled as invalid payloads by the batch sync endpoint.

Status for this continuation: **Written, not run. CI will run it.** No test, build, dependency installation, migration, live photo deletion, or database operation was executed.

Additional continuation notes:

- `backend/app/modules/care_ops/router.py`: added client consent recording, filtered dashboard/alert/timesheet/SOS/photo actions by the server-derived reach context, and made the admin device registration require a write-capable alert scope.
- `backend/app/modules/care_ops/models.py`, `backend/migrations/0010_care_client_consents.py`, `backend/app/migrate.py`, and `backend/tests/conftest.py`: added client-specific consent metadata and a care-database index for export.
- `backend/app/modules/field/router.py`: protected the field app version endpoint with the field scope so every field route is covered by the scope guard.
- `backend/tests/test_route_coverage.py` and `backend/tests/test_scope_enforcement.py`: included nurse PWA API calls and native auth routes in drift checking, listed the approved native auth writes, and recognised narrow action scopes such as `photos:hide` and `sos:send` as write capabilities.
- `docs/RESTORE_RUNBOOK.md`, `docs/INCIDENT_RUNBOOK.md`, `docs/SOS_PROCEDURE.md`, `docs/PDPO_CHECKLIST.md`, `docs/HANDOVER.md`, and `docs/CHANGELOG.md`: added owner-fillable handover, recovery, incident, SOS and compliance artefacts without inventing legal text or emergency contacts.

Status: Written, not run. CI will run it. The route, consent, reach and purge changes need integration review and CI feedback before release.
- `backend/app/modules/care_ops/router.py`: enforced reach checks on care dashboard, alert actions, timesheet review/export, photo hiding, and SOS list/acknowledgement; gated administrative SOS creation on the configured Module C prerequisites; made field photo registration reject cross-visit ID reuse.
- `backend/tests/test_care_ops_reach.py`: added unit coverage for own/team isolation on visits, alerts and timesheets.

## Continuation after request to complete outstanding work (2026-10-25)

Additional source changes authored in this continuation:

- `nurse/src/offline/db.ts`: added IndexedDB stores and helpers for assigned-client cache, history cache, queued photos, interrupted photo recovery, user-bound queue records, and needs-attention records.
- `nurse/src/app/App.tsx`: added offline visit-note capture, local visit history, assigned-client-only unscheduled-visit entry, queued photo capture/upload, a needs-attention panel with retry actions, user-bound sync isolation for shared devices, and best-effort server refresh-token revocation on sign-out. Consent writes are sent before visit/photo payloads, and the server's current-consent gate is checked before sensitive sync work.
- `nurse/src/features/photos/compress.ts`: client-side image re-encoding/compression before queueing, with file-type and configured-size guards; `compress.test.ts` covers invalid file input.
- `backend/app/modules/field/adhoc_rules.py`: `is_adhoc_allowed` and `active_stay_for_date` policy helpers, with `backend/tests/test_adhoc_rules.py`.
- `backend/app/modules/field/router.py`: added `GET /api/v1/field/clients` and `POST /api/v1/field/visits/adhoc`. The route checks setting/override, assignment, Kampala-local current stay, and sync time window; it creates the visit, check-in event, and flag in a Mongo transaction and handles duplicate/conflicting IDs.
- `backend/app/modules/field_ops/router.py`: `POST /api/v1/field/photos/complete` verifies Cloudinary asset metadata before marking upload complete; batch sync accepts `visit_create_adhoc` and enforces the 256 KB request cap. Photo signing and completion enforce organisation enablement and configured size limits.
- `backend/app/core/photo_store.py`: added central `verify_asset` helper for server-side Cloudinary verification.
- `backend/app/modules/settings/care_keys.py`, `.env.example`, and `docs/ENV_CARE_VARS.md`: added unscheduled-visit settings and owner-managed retention month settings. Zero retention values do not trigger automated purge/redaction.
- `backend/app/modules/care_retention/retention.py` and `backend/app/jobs.py`: added `purge_coordinates`, `purge_sos_locations`, `purge_expired_photos`, and scheduled `run_care_retention` at 03:10. The job records an audit summary and logs when a retention period is not configured.
- `backend/app/modules/visits/models.py`: added `created_by` to visits and `geo_snap` to photo metadata.
- `backend/app/modules/care_admin/router.py`: hardened client moves so the destination place must belong to the client, closes the previous open stay the day before the new stay, and commits the move in a Mongo transaction. Visit reassignment now requires an active nurse within the actor's reach and assigned to the client, and updates the supervisor snapshot.
- `frontend/src/features/admin/care/CareWorkspace.tsx` and `care.css`: added operational tabs for nurses, clients, visits, places/stays, photo review, alerts, timesheets, SOS, reports, settings, readiness, and data tools. Added basic place creation, client move, visit scheduling/reassignment/cancellation, photo hiding, alert acknowledgement/resolution, timesheet approval/send-back, SOS acknowledgement, and flag resolution.
- Tests authored or expanded: `backend/tests/test_adhoc_rules.py`, `test_retention_rules.py`, `test_db_adhoc.py`, `test_db_care_retention.py`, `test_db_care_stays.py`, `test_http_field.py`, `test_field_payloads.py`, `test_photo_store.py`, nurse offline database/photo tests, nurse app tests, and `frontend/src/features/admin/care/CareWorkspace.test.tsx`.

Status: **Written, not run. CI will run it.** This continuation reduces several gaps but does not complete every work-order acceptance criterion. See `docs/NURSE_IMPLEMENTATION_STATUS.md`.


## Continuation after request for a further completion ZIP (2026-10-25)

Additional code and regression coverage authored in this pass:

- `backend/app/modules/nurses/router.py`: added a shared fail-closed nurse reach predicate and applied it to nurse updates, supervisor changes, unscheduled-visit overrides, and device revocation. Nurse creation now checks the requested supervisor is active and restricts team-reach invitations to the acting supervisor's own team. Device revocation now uses a validated `DeviceRevocation` schema. Device registration refuses cross-account device reassignment.
- `backend/app/modules/nurses/repository.py`: device registration no longer silently transfers a device to another account or resets a revoked device. It raises domain errors for those cases.
- `backend/app/modules/nurses/schemas.py`: added `DeviceRevocation`.
- `backend/tests/test_nurse_reach_rules.py`, `backend/tests/test_http_nurses.py`, and `backend/tests/test_db_nurses.py`: added tests for fail-closed reach behaviour, out-of-reach management actions, device ownership, and revoked-device handling.
- `nurse/src/platform/push.ts`: installs push listeners before requesting registration and returns a cleanup function; registration callback failures are contained.
- `nurse/src/app/App.tsx`: stores the push-listener cleanup handle and attempts native session restoration on app startup.
- `nurse/src/lib/api/client.ts`: added `restoreNativeSession`, which rotates the secure refresh token through `/auth/native/refresh`, clears it on explicit unauthorised responses, and preserves it on network errors.

Status: **Written, not run. CI will run it.** These edits have not been compiled or exercised. The master plan remains partially implemented: dedicated admin/mobile flows, complete photo lifecycle, complete push delivery retry/revocation, generated native Android project and Gradle/release configuration, reproducible lockfile, full work-order test matrix, and owner-controlled deployment/backup acceptance are still outstanding.

## Continuation: offline logout guard and scheduled sync (2026-10-25)

- `nurse/src/app/logoutGuard.ts`: added `needsLogoutConfirmation(pendingItems)` to require explicit confirmation whenever local outbox/photo records remain.
- `nurse/src/app/logoutGuard.test.ts`: covered zero pending items, positive pending items, and invalid count values.
- `nurse/src/app/LogoutGuard.test.tsx`: covered hidden state, visible warning and choices, and explicit confirmation callback.
- `nurse/src/app/LogoutGuard.tsx`: added an accessible alert-dialog panel that explains unsynced work and offers keep-working or sign-out-and-preserve-work actions.
- `nurse/src/app/App.tsx`: the sign-out action now counts all local outbox and photo records, guards logout when any remain, and preserves those records for the same account to sync after signing in again. Added best-effort persistent storage request and five-minute online sync polling with interval cleanup.
- `nurse/src/styles.css`: added responsive layout for the guard actions.

Status: **Written, not run. CI will run it.** No tests, typecheck, build, package installation, or device run was performed.


## Continuation: offline sync failure handling and overlap guard (2026-10-25)

- Added a shared sync-failure policy for offline queued writes and photo uploads. Network failures, expired-session responses, throttling, request timeouts, and server failures remain queued for retry; definitive 4xx rejections move to needs-attention rather than repeatedly blocking later queued actions.
- Queued consent and visit operations now use the same error classification and display server-provided error detail when available. An unscheduled visit is marked needs-attention when a definitive rejection occurs. Photo uploads now use the shared policy rather than treating every 4xx status identically.
- Added a single-flight guard to prevent the online event, manual sync, and periodic timer from running overlapping sync passes against the same IndexedDB outbox.
- Added unit tests for transient/permanent status classification, network errors, server-detail messaging, and status extraction.
- **Written, not run. CI will run it.** No package installation, app build, lint, typecheck, or test command was executed.


## Latest continuation: retry backoff and due-work scheduling (2026-10-25)

- Added exponential retry scheduling for transient nurse outbox and photo-upload failures. Delays start at 2 seconds, double per attempt, and cap at 5 minutes. Retry timestamps are persisted with the IndexedDB records.
- Queue readers now return only queued records whose retry time has arrived. The total waiting count continues to include deferred records so the nurse can see that work remains pending.
- Manual retry clears the scheduled delay and makes the selected operation/photo eligible immediately. Permanent failures continue to move to Needs attention.
- Added tests for backoff values, deterministic retry timestamps, and due/not-yet-due queue filtering. These tests are authored but not run.
- This improves retry pacing; it does **not** complete cursor-based pull synchronisation or a conflict-resolution UI. Those remain outstanding.


## Continuation: cursor-based nurse schedule pull and removal handling (2026-10-25)

- Added `backend/app/modules/field/sync_cursor.py` with opaque UTC timestamp/key cursors, malformed-cursor fallback, and deterministic tie ordering.
- Added `updated_at` to visits and update timestamps when field events, admin edits/cancellations, and care-alert jobs change visit state.
- Added `VisitSyncTombstone` to the care model registry. Admin cancellation and nurse reassignment now write a tombstone alongside the visit change in a Mongo transaction, allowing the previous nurse's cache to remove the stale visit.
- Reworked `GET /api/v1/field/sync/pull` to page current-window visit updates and removal tombstones with `cursor`, `limit`, and `has_more`, while keeping the previous `since` parameter usable for older clients.
- The nurse app stores a cursor per signed-in user in IndexedDB and applies each page's visit updates, tombstones, outbox attention state, and cursor in one transaction. It continues through pages with a bounded per-pass limit.
- Tombstoned visits are removed from the local schedule. Pending operations for the same visit and same local account move to Needs attention rather than being blindly retried.
- Added backend cursor-rule tests, a database-backed pull pagination test, an unauthenticated pull-route test, and IndexedDB page/cursor/tombstone tests.

Status: **Written, not run. CI will run it.** Cursor pull is an incremental foundation, not proof of full offline acceptance. End-to-end replay, reassignment/cancellation under real concurrent load, schema migration/backfill for older visit documents, and full conflict-resolution actions still require CI and integration review.

- Added migration `0011_visit_sync_cursor.py` to backfill `updated_at` on existing visits and index visit/tombstone cursor scans. Wired it into the care-database migration allowlist and test fixture.
- Added a narrow Needs attention resolution for tombstone conflicts: the nurse can discard the stale saved action instead of being offered a retry that cannot succeed. Added policy coverage for detecting this conflict.
- Cursor metadata is now cleared when the cache owner changes or the nurse signs out, ensuring the next sign-in rebuilds the cache instead of trusting a cursor whose local data was cleared.
- The pull endpoint now queries indexed visit and tombstone streams with bounded `limit + 1` reads before merging a page, rather than loading every visit/tombstone for the nurse. Cursor decoding rejects unknown key prefixes. The Today view filters the wider cached sync window to Kampala's current day while retaining an active visit.

- Cursor follow-up: cursor keys now use a tombstone prefix that sorts after visit keys at the same timestamp, malformed/unsupported cursors clear from IndexedDB when the server requests a full resync, and the legacy `next_since` response field is retained for older callers. Added coverage for unsupported cursors and clearing stale cursor state.
- Added a Kampala calendar-day helper and test; the Today screen shows visits scheduled for the current Kampala day plus any active visit, even though the local sync cache contains the wider server window.

Status: **Written, not run. CI will run it.** Only the ZIP archive will be checked for integrity; application commands and tests remain intentionally unrun under the build instructions.

## Phase 10 continuation: photo queue lifecycle hardening (2026-10-25)

- `nurse/src/features/photos/compress.ts`: added `compressPhotoBundle`, `hasJpegSignature`, and pinned image preparation limits. Photos are re-encoded to JPEG at up to 1280 px on the longest side and quality steps from 0.7 down to 0.4 until at most 400 KiB; a 160 px thumbnail is produced with a 60 KiB cap. Canvas re-encoding strips embedded image metadata where supported. Unsupported decoding fails closed instead of storing an unprocessed original.
- `nurse/src/offline/db.ts`: `LocalPhoto` now stores an optional local thumbnail and a persisted `uploadStage` (`pending_upload` or `uploaded`) separate from the retry state.
- `nurse/src/app/App.tsx`: photo sync now records the successful Cloudinary upload stage before API completion. If registration/completion is interrupted, the next sync retries completion without uploading the same queued blob again. Photo capture checks available browser storage where the API is supported and displays a warning when more than 20 photos are waiting.
- `backend/app/modules/care_retention/retention.py`: added `purge_abandoned_photo_uploads`, which retries deletion for pending photo registrations older than 24 hours and marks them expired only after provider deletion is confirmed. Provider failures leave records pending for the next scheduled run.
- `backend/app/jobs.py`: added `run_photo_orphans`, scheduled daily at 03:40 local scheduler time, to retry cleanup of abandoned pending uploads.
- Added `backend/tests/test_db_photo_orphans.py`, expanded `nurse/src/features/photos/compress.test.ts`, and expanded the offline photo DB tests to cover JPEG signatures, size/dimension policy constants, local thumbnail persistence, and the uploaded-stage checkpoint.

Limitations: the cleanup job handles stale pending metadata registrations; it does not yet enumerate Cloudinary assets that have no metadata row at all. Audited admin image streaming, authenticated Cloudinary delivery, full client-side thumbnail display, and the complete Playwright photo flow remain outstanding. Status: **Written, not run. CI will run it.**


## Phase 11: Care visit review interface continuation (2026-10-25)

- Added an in-workspace visit review panel backed by `GET /api/v1/admin/care/visits/{visit_id}`. It shows visit summary fields, a chronologically sorted event timeline, nurse notes, flags, photo-record metadata, annotations, and audit entries.
- Added annotation submission through `POST /api/v1/admin/care/visits/{visit_id}/annotate` with client-side minimum length validation, plus a flag-resolution action requiring a note of at least three characters. Server-side validation and scope enforcement remain authoritative.
- Photo metadata is collapsed until the reviewer opens the photo-record panel. Actual image preview is intentionally not fabricated: the audited authenticated/private image streaming endpoint is not present yet.
- Corrected scheduled visit reassignment to use the existing `PATCH /api/v1/admin/care/visits/{visit_id}` endpoint rather than POST.
- Added frontend regression tests for review data, chronological event ordering, collapsed photo metadata, and annotation submission.

Written, not run. CI will run it.


## Phase 12: Native notifications and foreground recovery (2026-10-25)

- Added `nurse/src/platform/notify.ts` as the local-notification adapter. `buildVisitReminderSchedule` is a pure schedule builder for a visit starting in 15 minutes, the scheduled start time, and the scheduled end time. Reminder messages deliberately exclude client names, addresses, instructions, and health details. Completed, cancelled, invalid, and past reminders are omitted.
- Added an explicit native-app **Enable visit reminders** action. It requests notification permission only after the user chooses to enable reminders, creates the `nest_normal` Android channel when supported, and persists the local preference. The web implementation remains a no-op.
- Reminders are rebuilt when the local visit list changes and when the native app returns to the foreground. Only notification IDs reserved for this feature are cancelled and replaced. Signing out cancels these reminders and disables the preference to avoid carrying one account's schedule into another session.
- Extended `nurse/src/platform/push.ts` to listen for foreground push receipt and notification taps, with safe callbacks and cleanup for every listener. The app triggers schedule sync when a push arrives or is opened. Protected detail routing remains incomplete because the nurse app does not yet have a deep-link router.
- Added a Capacitor app-state listener to refresh connectivity and run sync when the app returns to the foreground. The five-minute foreground sync remains; no background-location permission or background service was added.
- Added `nurse/src/platform/notify.test.ts` covering reminder timing, omission of past and invalid visits, stable IDs, and exclusion of private visit details.

Limitations: safety-timer-specific local reminder times are not yet represented in the cached visit model, so this pass does not invent them. Android notification channels, device lifecycle behaviour, push delivery/tap behaviour, permission prompts, and scheduling still need CI and real-device acceptance. FCM token rotation/revocation, backend inbox-to-client API integration, and allowlisted deep-link navigation remain outstanding. **Written, not run. CI will run it.**


## Phase 13: CI and nurse integration coverage (2026-10-25)

- Updated `.github/workflows/ci.yml` so the full repository CI workflow also triggers on pushes to `nurse-module`; removed duplicated Firebase guard, lockfile-generation step, and duplicate `ops-scripts` job definitions that could obscure the intended workflow structure.
- Added the planned tracked-file guard against Google-hosted CSS and fonts.
- Updated `.github/workflows/nurse.yml` to avoid `setup-node` npm caching before a nurse lockfile exists, retain the CI-generated package lock/install sequence, and run the existing nurse Playwright E2E suite after the production build and bundle guards.
- Added Chromium installation and Playwright diagnostic artifact upload (14-day retention) to the nurse CI job.
- Updated `nurse/playwright.config.ts` with CI retry, `forbidOnly`, HTML report, trace-on-failure, and screenshot-on-failure settings.
- Corrected `nurse/e2e/offline.spec.ts` to load the app while online first, then toggle offline and back online, asserting both state transitions and the saved-locally message. The previous test attempted to navigate to the preview server after taking the browser offline, which could fail before the app was loaded.

Validation status: **Written, not run. CI will run it.** No install, lint, typecheck, test, build, or workflow command was executed locally.

Known CI integration gaps intentionally not represented as passing: the repository does not currently contain a generated `nurse/android` Gradle project or the planned `scripts/apply_android_overrides.mjs`, so the Android debug CI job cannot be safely enabled in this pass. The nurse app also has no committed `package-lock.json`; CI still generates it on the runner, so transitive dependency resolution is not fully reproducible until a reviewed lockfile is committed. The full real-backend field E2E, layout matrix, and accessibility job described in the master plan remain outstanding. Existing Cloudinary references outside the narrowly approved photo-store module also need a coordinated refactor before enforcing the plan's strict Cloudinary-location guard without breaking current functionality.


## Phase 14: A1 to A3 foundation (2026-10-25)

- Dependencies: removed `i18next`, `react-i18next`, `react-hook-form`, `zod`, `@tanstack/react-query`, `@capacitor/preferences`; added `@eslint/js`, `@testing-library/dom`, `@testing-library/react`, `@types/node`, `jsdom` (pins recorded in `docs/PINS_NURSE.md`).
- CI: new `nurse-lockfile.yml` and `nurse-android.yml`; `nurse.yml` requires a committed lockfile, uses npm caching, and runs the two new Node script tests before install.
- PWA: manifest moved to `src/pwa/manifest.ts`; `public/manifest.webmanifest` deleted; icons added; `index.html` de-duplicated.
- Android: override merge script plus tests; `nurse/android/` git-ignored.

Validation status: **Written, not run. CI will run it.**
