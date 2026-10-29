# Reconstruction audit — Stages 20–29

**Baseline:** `Nest-Home-Uganda-reconstructed-stage08-19.zip`  
**Consolidated range:** Stages 08–29  
**Audit date:** 2026-10-29  
**Result:** implementation and static checks advanced; full integration/release verification is still blocked by missing installed dependencies in this runtime.

## 1. Reconstruction method and merge decisions

The supplied Stage 20–29 archives are stage bundles, not ten complete, independently authoritative repository snapshots. They overlap with a reconstructed Stage 08–19 project. The reconstruction therefore retained the newer baseline version where an attachment was older or simply duplicated an already integrated file, then applied the changes that were genuinely missing. A blind “unzip all stages in order” overlay would have rolled back valid work.

Notable merge decisions:

- **Stage 20 — SOS live follow:** retained the newer SOS-sheet implementation already in the baseline rather than replacing it with the stale Stage 20 attachment. Live-follow remains bounded by the server’s existing window and remains distinct from closing an SOS case.
- **Stage 21 — admin layout and navigation:** retained the existing layout/theme implementation; the supplied layout copy was older and removed theme behavior.
- **Stages 22–24 — dashboard, enquiries, careers/applications, content/settings/reports/activation:** retained the versions already present in the consolidated baseline where files overlapped or were unchanged. These archive attachments were not treated as permission to overwrite newer versions.
- **Stage 25 — shared care UI primitives:** retained the shared `CareTable`, `CareSheet`, and `CareScreenNav` wrappers used by the care screens.
- **Stages 26–27 — care workspace extraction:** extracted reusable panel components from `CareWorkspace.tsx` while keeping state, API calls, and mutation handlers in the parent to avoid a broad behavioral rewrite. New components are `PlacesPanel`, `ScheduleVisitPanel`, `CreateClientPanel`, `ResolveFlagPanel`, `DataToolsPanel`, and `VisitReviewPanel`. The active production care route is still `CareScreenPage.tsx`; it also received the scope-gating corrections described below.
- **Stage 28 — client detail/location:** added a routed client detail view with client notes, photo policy/guidance, places, stay history, location editing, and a move-client sheet. Mutations remain behind the matching client/place scopes and are sent to the audited backend routes.
- **Stage 29 — nurse details/invite:** added a routed nurse detail view for profile/assignment, device-registration health, and consent history. Nurse invites require a supervisor ID in both the form and backend request schema; the backend validates that the supervisor is active and that the assignment is within the actor’s permitted reach.

## 2. Timesheets security fix — primary requirement

The nurse preset remains exactly `{"field:use", "sos:send"}`. It does **not** receive `timesheets:read` or `timesheets:write`.

### Admin and nurse routes are separated

- `GET /api/v1/admin/care/timesheets` remains behind `timesheets:read` and the existing admin reach check. The admin submit/review actions continue to require their admin scopes.
- `GET /api/v1/field/timesheets` is a separate, read-only field route guarded by `field:use`.
- The field route obtains the active nurse profile from the authenticated principal. It accepts no nurse identifier in the query/body, so a caller-supplied `nurse_id` cannot select another employee’s records.
- The database query is restricted to `CareTimesheet.nurse_id == profile.user_id`.
- A typed response model allow-lists the fields returned to the nurse. It excludes the internal nurse ID, approver ID, adjustment records, raw issue/visit reference IDs, and other admin-only fields. Issues are represented by ordinal number, explanation state, and the nurse-facing explanation.
- The nurse timesheet screen calls only `/field/timesheets`. It is read-only, exposes no admin approve/adjust/submit controls, and does not pretend to cache timesheets while offline.

### Regression coverage added

- Nurse preset cannot gain admin timesheet read or write scopes.
- A `field:use`-only token is rejected by the admin-wide list and admin review endpoints.
- The field endpoint requires `field:use`.
- Database-backed acceptance test tries a forged `?nurse_id=...` for a second nurse and expects only the authenticated owner’s period.
- The ownership test asserts the response does not include the other nurse, approver, adjustment or raw issue/visit identifiers.
- Nurse UI tests assert that only the field route is used, the view is read-only, and offline state does not make a false caching claim.
- Admin UI regression tests assert that an account with `timesheets:read` can inspect timesheets but sees no Approve/Send back/Adjust controls without `timesheets:write`; those controls appear only when write scope is present.

## 3. Additional access-control corrections

`CareScreenPage.tsx` previously displayed some mutating controls to read-only users and delegated denial to the API. The UI now checks the exact write scope before presenting mutation actions:

| Action | Required scope in UI |
| --- | --- |
| Nurse invite/resend, activate/deactivate, device revocation, supervisor assignment | `nurses:write` |
| Visit reassignment/scheduling | `visits:write` |
| Resolve a flag | `flags:write` |
| Hide a photo | `photos:hide` |
| Acknowledge/resolve alert or acknowledge SOS | `alerts:write` |
| Approve/send back/adjust timesheet | `timesheets:write` |
| Create client / edit client / move client | `clients:write` |
| Create place | `places:write` |
| Test SMS / change care settings and on-call roster | `carecfg:write` |
| Export report CSV | `care-reports:export` |

These are presentation guards, **not substitutes for backend authorization**. Backend endpoints remain responsible for denying unauthorized requests. Read-only details and list views remain available under their read scopes.

## 4. Nurse profile privacy and invitation controls

The new `GET /api/v1/admin/care/nurses/{user_id}/details` response is reach-filtered and typed. Its device data includes device ID, platform, registration/revocation timestamps, push-token update time, and a boolean indicating whether a token exists. It never returns the push-token secret. The API schema and TypeScript OpenAPI declaration were updated for this route.

`NurseInvite.supervisor_id` is now required with length constraints at the Pydantic request-schema level, and is required in the TypeScript/API snapshot as well as the form. The route checks that the referenced supervisor is active and that the actor is allowed to make that assignment. A required field in a browser alone would not be a security control; the backend validation is authoritative.

## 5. Location validation and privacy note

The map picker now refuses to treat blank latitude/longitude strings as zero. Client-side validation requires an explicit latitude in `[-90, 90]`, longitude in `[-180, 180]`, and radius between 50 and 1000 metres; the client detail save handler repeats these checks before submitting to the server. Tests cover blank coordinates, out-of-range latitude, and the fact that geocoding happens only after an explicit user action.

**Deployment/privacy follow-up:** address search sends the entered query to OpenStreetMap Nominatim, and its map preview sends selected coordinates to OpenStreetMap. A warning is shown in the UI, but the organisation must still review provider usage terms, rate-limiting, hosting/configuration, and whether this third-party disclosure is acceptable under its client privacy policy before production use. Avoid searching by client name or other identifying details. This implementation must not be described as a privacy-reviewed geocoding service.

## 6. Verification performed in this reconstruction pass

| Check | Result | Interpretation |
| --- | --- | --- |
| `python -m compileall -q backend/app backend/tests` | **PASS** | Backend app/test Python files compile syntactically. |
| TypeScript `transpileModule` syntax scan | **PASS: 365 `.ts`/`.tsx` files, zero syntax diagnostics** | Syntax/transpilation check only; not a full TypeScript typecheck. |
| Relative-import existence scan | **PASS: 368 TypeScript/TSX source entries scanned, zero missing relative imports** | Checks relative path resolution, not package exports or type compatibility. |
| Nurse preset and OpenAPI static assertions | **PASS** | Confirmed the preset omits both timesheet scopes; field route response ref and nurse-details path exist in the committed JSON snapshot; supervisor is required in the invite schema. |
| Required stage feature files | **PASS** | Client detail, nurse detail, invite sheet, map-picker tests, and nurse timesheet tests are present. |
| Backend pytest | **BLOCKED BEFORE TEST COLLECTION** | `backend/tests/conftest.py` imports `beanie`; this runtime raises `ModuleNotFoundError: No module named 'beanie'`. No pytest suite is claimed as passing in this pass. |
| Frontend Vitest, typecheck, lint, build, Prettier | **NOT RUN** | `frontend/node_modules` and `nurse/node_modules` are not installed in this runtime. Source syntax checks do not replace these checks. |
| MongoDB and physical-device acceptance | **NOT RUN** | Requires installed backend dependencies, configured MongoDB/test environment, and device/browser execution. |

The previous Stage 13–19 audit contains its own verification record. Its recorded results are not counted as freshly rerun by this Stage 20–29 pass.

## 7. Next verification sequence

Run these in an environment with the repository’s locked dependencies installed:

1. `cd backend && pytest -q` with the documented test MongoDB environment.
2. `cd frontend && npm ci && npm run lint && npm run typecheck && npm run test && npm run build`.
3. In the nurse workspace, run its locked install and test/typecheck/build scripts as documented in `nurse/package.json`.
4. Run OpenAPI regeneration (`scripts/gen-types.sh` or the documented `npm run gen:types`) and inspect the diff; then run the committed OpenAPI drift test.
5. Run authenticated end-to-end cases with two nurse accounts: (a) the nurse can see their own field timesheets, (b) a forged nurse ID cannot expose another nurse, and (c) the same field token receives 403 from admin list/review endpoints.
6. Test SOS follow start/stop against a real backend and a supported mobile/browser target. Confirm location pings stop on cancel, safe-report, timeout, and app visibility rules.
7. Complete a privacy review of OpenStreetMap/Nominatim before using real client addresses/coordinates.

Until those checks run, this ZIP is a reconstructed engineering candidate, not a release-certified build.
