# Nest Home Care Uganda — Stage 13–19 Reconstruction Audit

**Reconstruction date:** 29 October 2026  
**Baseline:** `Nest-Home-Uganda-Website-reconstructed-stage08-12.zip`  
**Scope:** Consolidation and corrective implementation for the supplied Stage 13–19 archives.  
**Status:** Source reconstruction and targeted static/pure-rule validation complete; full integration and frontend test suites remain environment-blocked and are not claimed as passing.

## 1. Reconstruction approach and source-of-truth rules

The Stage 08–12 project was kept as the baseline. The supplied Stage 13–19 archives contain `PROMPT.txt`, mockups, fallback tests, and `attach/` files; they are not complete snapshots of the application. Several attachments are older/shorter than the corresponding baseline files. Copying every attachment into the project would roll back existing work, so implementation was reconciled against the live project, the nurse-module specification, backend models/routes, existing tests, and the mockups.

`if-tests-fail/` files in the stage archives were treated as fallback suggestions, not as proof that tests had run or as a replacement for the project's tests. New tests were added to the project's normal test directories where appropriate. Design additions use existing design tokens and keep touch targets accessible. New location and photo behavior is tied to server-authoritative state rather than simulated confirmations.

## 2. Work reconstructed by stage

### Stage 13 — Arrive, leave, and visit notes

- Reconciled the arrival, departure, and note sheets with shared sheet styling and accessible action targets.
- Preserved the offline-first action queue and distinguishes locally saved work from server-confirmed changes.
- Added a photo evidence policy that is configurable at organisation level (`photos.required`) and optionally overridable for a client (`photo_required`). Supported policy modes are `none`, `arrival`, `departure`, `either`, and `both`; a client value of `null` inherits the organisation setting.
- The server now validates required evidence during checkout and only counts photos registered as uploaded for the assigned nurse and visit. Unknown/corrupt server policy is rejected rather than silently bypassed.
- The nurse sheet uses both already-registered server evidence and current local evidence to guide the user. Local evidence alone is not treated as server acceptance.
- Corrected the sync order: after current-consent checks pass, queued photos are uploaded/registered before checkout writes. If required evidence cannot be registered, checkout remains queued instead of being marked complete or sent repeatedly only to be rejected by the server.
- Unscheduled visits now inherit the selected client's photo policy/guidance in local cached metadata; the assigned-client response provides the necessary safe, client-scoped fields.

### Stage 14 — History, sync status, profile, and logout guard

- Reconstructed the read-only history view with client labels, scheduled time, actual arrival/departure timestamps, grouped history, details, and pending-sync awareness.
- History verification labels are derived from attendance events. A completed status alone does not make a visit “verified”; missing or unverified attendance evidence is labelled for review. No distance measurements are shown in history.
- Retained nurse-owned cache separation and logout-with-pending-work warnings; syncing status distinguishes queued, deferred, and needs-attention items.
- The profile/help UI exposes configured contact/support details only when present and avoids implying that missing capabilities are active.

### Stage 15 — Photo guidance, capture, list, and viewer

- Added per-client guidance with organisation fallback and acknowledgement stored per Kampala-local calendar day.
- Added capture/review before saving, explicit `arrival` / `departure` / `other` classification, local thumbnail previews, registered-photo previews, and a viewer for saved items.
- Preserved compression and the Wi-Fi-only upload choice. Added visible warnings when more than 20 photos are waiting locally.
- Added confirmation-gated **retake** and **delete local image** actions only while the photo is still local and has not entered the remote-upload stage. Remote registered photos cannot be deleted through the nurse UI.
- A photo whose object upload occurred but whose server registration is pending must be retried; the app prevents local discard at that stage to avoid orphaning an already-transferred object.
- Registered photo viewing is nurse/visit-owned, audited, and uses short-lived signed delivery paths. Client guidance and policy values are bounded/validated by the backend.

### Stage 16 — Deliberate SOS hold, countdown, sent/no-data states

- SOS initiation requires a deliberate, configurable hold (default two seconds) before the cancellation/countdown sheet opens (default five seconds).
- Added an animated progress ring during the hold, a reduced-motion rule, and test coverage for short taps and configured durations.
- The UI distinguishes an SOS confirmed by the server from one merely queued on the device. A queue confirmation is not described as a delivered alert.
- Call links are emitted only for telephone numbers passing validation. The user can still open the SMS composer when service is unavailable; the application does **not** claim that it automatically sent an SMS.
- “I’m safe now” requires a server-confirmed action and stops live follow, but does not silently resolve the supervisor's SOS case.

### Stage 17 — Safety timer, permissions/help, and install guidance

- Kept the server-backed lone-worker safety timer tied to check-in/checkout state and surfaced configured SOS hold/cancel durations.
- Added permission and install/help guidance that describes actual browser/device behavior.
- The profile/help copy explicitly states that background location capture is not implemented in this build. Live follow is foreground-only and pauses when the app is not visible; it is not represented as a background geolocation service.

### Stage 18 — Timesheets list and week view

- **Intentionally not added to the nurse UI.** Inspection found the existing timesheets endpoint is under `/api/v1/admin/care/timesheets` and requires `timesheets:read`; the nurse scope preset does not grant `timesheets:read` or `timesheets:write`. Wiring the nurse UI to that route would either fail authorization or require an unsafe scope change.
- Added a scope regression test asserting that the nurse preset cannot read or write admin timesheets. A nurse-safe, own-record timesheet API must be designed and authorized before implementing a timesheet screen.

### Stage 19 — SOS live follow backend and nurse flow

- Added a server-configured, opt-in live-follow session with bounded duration (1–120 minutes) and bounded interval (15–300 seconds). The default is disabled.
- Nurse start/ping/stop/safe actions verify the SOS case is owned by the nurse, is in an eligible state, and remains inside the server deadline. Pings are rate-limited and tagged as foreground captures.
- Added a responder-side snapshots endpoint requiring `alerts:read` and checking responder access to the case. Coordinates are omitted from audit payloads, and retention cleanup clears stale SOS location coordinates from event/legacy payloads.
- The nurse app only starts following after explicit opt-in and server confirmation. It sends pings while visible, observes the server-supplied interval/deadline, and stops local follow after timeout or a server-confirmed safe action.
- A responder-side map/viewer is not included in this stage: the supplied Stage 19 requirement is backend-focused and the added endpoint returns the bounded snapshots needed by a later authorized UI.

## 3. Important security and correctness decisions

1. **No blanket overlay.** Stage attachments are stale in places; the baseline is preserved where a stage file would roll back unrelated work.
2. **Server owns final attendance/photo decisions.** Frontend gating improves usability, but checkout validation checks registered photos again on the server.
3. **Consent before uploads.** The photo preflight is executed after the current-consent gate but before normal visit writes.
4. **No fabricated verification.** History labels follow recorded attendance events and do not infer verification from a status flag alone.
5. **No nurse access escalation.** Timesheets remain unimplemented for nurses until a purpose-built endpoint with nurse-scoped authorization exists.
6. **No false SOS delivery claim.** Offline queueing and an SMS composer are described as such; no automatic SMS delivery guarantee is asserted.
7. **No false background-location claim.** Live follow is foreground-only; background collection has not been added.
8. **Remote photos are not user-deletable.** Only eligible local pre-upload items expose retake/delete actions. Uploaded-but-unregistered items must be retried.

## 4. Files added or materially updated

### Backend

- `backend/app/modules/care_ops/models.py` — bounded live-follow timestamps/state.
- `backend/app/modules/care_ops/router.py` — responder-side live-follow snapshots and access checks.
- `backend/app/modules/care_clients/models.py` and `backend/app/modules/care_admin/router.py` — optional per-client photo policy/guidance with validation/audit.
- `backend/app/modules/field/router.py` — nurse history, registered photo listing/signing, visit photo metadata and assigned-client policy metadata.
- `backend/app/modules/field/service.py` — authoritative checkout photo evidence enforcement.
- `backend/app/modules/field/schemas.py` and `backend/app/modules/visits/models.py` — photo-rule/evidence types.
- `backend/app/modules/visits/photo_rules.py` — shared pure checkout policy rules.
- `backend/app/modules/settings/care_keys.py` — photo policy and bounded SOS live-follow/hold/cancel settings.
- `backend/app/modules/field_ops/router.py` — SOS live-follow lifecycle, safe signal, ownership checks, rate limiting, and audits.
- `backend/app/modules/sos_events/rules.py` — pure live-follow boundary rules.
- `backend/app/modules/care_retention/retention.py` — SOS coordinate retention cleanup.
- Added/updated backend tests include `test_sos_live_follow_rules.py`, `test_visit_photo_rules.py`, `test_care_photo_settings.py`, `test_care_client_photo_guidance.py`, `test_track_c_scope_presets.py`, and endpoint scope tests.

### Nurse frontend

- `nurse/src/screens/HistoryScreen.tsx` and `HistoryScreen.test.tsx` — read-only history.
- `nurse/src/screens/PhotoSheet.tsx` and `PhotoSheet.test.tsx` — guidance, review, local/registered gallery/viewer and safe local photo actions.
- `nurse/src/screens/ProfileScreen.tsx` and `ProfileScreen.test.tsx` — permissions/help/install guidance.
- `nurse/src/features/sos/SosSheet.tsx` and `SosSheet.test.tsx` — hold ring/countdown, server-vs-queued states, live follow and safe confirmation.
- `nurse/src/features/photos/requirements.ts` and `.test.ts` — frontend policy mirror that fails closed for unknown policy values.
- `nurse/src/app/App.tsx`, `AppShell.tsx`, `useFieldProfile.ts`, `nurse/src/offline/db.ts`, `nurse/src/offline/syncEngine.ts`, and associated tests — metadata, offline policy, and correct photo-before-checkout preflight.
- `nurse/src/screens/SyncScreen.tsx` and `.test.tsx` — retry/discard rules, including preventing discard once remote upload is pending registration.
- `nurse/src/lib/api/client.ts`, `nurse/src/copy.ts`, and `nurse/src/styles.css` — signed-asset URL handling, truthful copy, token-based UI styles, touch sizing, reduced motion, and SOS progress ring.

## 5. Validation performed in this environment

| Check | Result | Meaning |
|---|---|---|
| `python -m compileall -q backend/app backend/tests` | **PASS** | Backend application/test Python files compile syntactically. |
| Isolated pure backend rules/settings suite | **19 passed** | Four SOS live-follow tests, four photo-rule tests, and eleven photo-setting default/valid/invalid cases passed. These tests were copied to `/tmp` so the repository's `conftest.py` would not import unavailable web/database dependencies. |
| TypeScript `transpileModule` syntax check | **PASS — 102 `.ts`/`.tsx` files; 0 syntax diagnostics** | Syntax-only transpilation; not a substitute for TypeScript semantic checking. Declaration files were excluded. |
| `node scripts/check-nurse-styles.mjs` | **PASS** | Token-based CSS and reduced-motion guards passed. |
| `node scripts/check-strings.mjs nurse/src` | **PASS** | No disallowed emoji-like Unicode in the checked source tree. |
| `node scripts/check-no-external.mjs nurse/src` | **PASS** | No unexpected external URLs in the checked source tree. |

### Tests that could not be verified here

- Full backend pytest cannot initialize: the environment lacks `beanie` (`ModuleNotFoundError: No module named 'beanie'` when the test configuration is loaded). Therefore endpoint integration tests, database-backed authorization tests, retention integration, and MongoDB behavior are **not claimed as passed**.
- Frontend `npm ci` timed out before dependencies were fully installed. `nurse/node_modules/.bin/vitest` and `.bin/tsc` are absent; `npm run typecheck` therefore fails due to missing type packages rather than providing a valid semantic check of the changes. The available Node runtime is `v22.16.0`; install output warned that several locked dependencies require a newer Node 22 patch release. Frontend Vitest, ESLint, build, Playwright reference/accessibility/responsive/E2E tests, and device tests were **not run**.
- No live MongoDB/API deployment, Android device, SMS provider, or remote photo storage account was available here. Runtime behavior and visual fidelity on physical devices still require the documented follow-up run.

## 6. Required follow-up verification on a complete development environment

1. Install a Node version satisfying all locked package engine requirements, then run from `nurse/`:
   ```sh
   npm ci
   npm run typecheck
   npm run lint
   npm run test
   npm run build
   npm run test:reference
   npm run test:a11y
   npm run test:responsive
   npm run test:e2e
   ```
   The aggregate is `npm run test:pre-apk` once individual failures are resolved.
2. Install the backend's locked dependencies and run the full backend suite against a configured test database. Exercise photo-sign/upload/complete followed by checkout under all five policy modes, including failed upload/registration and offline retry.
3. Verify SOS start/ping/stop/safe and responder access with an integration test database; test retention against both new event details and legacy stored events.
4. On a physical Android device, check hold/cancel timing, reduced-motion behavior, permission denial, app background/foreground, offline queueing, emergency-call/SMS-composer behavior, and Wi-Fi-only photo upload.
5. Before a nurse-facing timesheet screen is implemented, add an explicitly scoped nurse-owned API and authorization tests; do not broaden the nurse's admin scopes.

## 7. Remaining product-level gaps (not hidden by the reconstruction)

- Background location capture is still not implemented. Live follow is foreground-only and bounded.
- The SMS action opens a composer; the current dependency does not establish unattended SMS delivery. Do not market this as an automatic fallback until a compliant native delivery pathway and delivery-state tests exist.
- There is no nurse-scoped timesheets endpoint, so Stage 18's timesheets list/week view is intentionally withheld.
- Remote object uploads can succeed immediately before the app crashes and before the local `uploadStage` marker is persisted. The current client prevents deletion once the marker is present, but a complete production solution should also have storage-side expiry/cleanup for unregistered orphan objects and integration coverage for that crash window.
- Stage 19 provides backend live-follow snapshots, not a responder map UI. A map must be built only in the responder surface with the same access checks and time bounds.
- Full semantic type checking, component tests, Playwright tests, database integration tests and physical-device checks remain to be performed in an environment with the correct dependencies/services.

This audit intentionally separates implemented source changes from checks actually executed. A syntax pass is not represented as a passing application build, and the 19 passing isolated tests are not represented as a passing full backend suite.
