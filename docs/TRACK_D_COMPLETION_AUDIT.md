# Track D completion audit

**Checkpoint:** 2026-10-26  
**Baseline:** `Nest-Home-Care-Nurse-Module-Track-C-updated.zip`  
**Delivery rule:** **Written, not run. CI will run it.**

This checkpoint covers the Track D admin UI work described in `docs/NURSE_FREE_SESSION_PLAN.md` (D1–D13). The implementation is additive to Track C. Project commands, dependency installation, generated OpenAPI/type regeneration, browser tests, migrations and live-provider calls were not executed in this delivery.

## D1 — Routed care screens skeleton

**Implemented in source.**

- Added a dedicated `/admin/care/*` route group instead of continuing to expose only one table workspace route.
- Added a screen registry with explicit read scopes for nurses, clients, places, visits, flags, team, photos, alerts, timesheets, SOS, reports, settings, readiness, data requests and audit history.
- Added one thin page component/test pair per Track D screen and a shared `CareScreenPage` implementation so the screens can be split further without duplicating API/list behaviour.
- Existing `/admin/care` remains the entry point and nested screens are reachable below it.
- Scope filtering is fail-closed: the care sub-navigation only exposes screens for which the signed-in user has the required scope, and each screen is independently guarded.

**CI follow-up:** verify route rendering and nav visibility with the existing admin test harness.

## D2 — Nurses

**Implemented in source.**

- Nurse list loads from the existing nurse administration API.
- Invite form validates required name, email, phone and staff number fields through the API contract.
- Added resend-invite action.
- Added device-revocation action with an explicit confirmation prompt for the device ID.
- Added activate/deactivate action using the existing nurse patch route.
- Added supervisor assignment action.
- Existing server-side reach checks remain authoritative; out-of-reach responses are surfaced in the page error area.

**Not claimed:** a full device inventory drawer was not added because the current API exposes device revocation as an action rather than a separate device-list endpoint.

## D3 — Clients, places and stays

**Implemented in source.**

- Client creation remains available on the dedicated Clients screen.
- Places screen uses a reusable `MapPicker` component with the configured `care.map_tile_url` value when available.
- Latitude, longitude and radius are validated client-side before submission; coordinates are rounded to six decimal places.
- Server validation remains authoritative: latitude/longitude ranges and 50–1000 m radius are enforced by the existing API model.
- Added stay movement form using the existing client stay endpoint.
- The map implementation does not inject an external map script; it only uses the owner-configured tile URL as a background image.

**CI follow-up:** run the repository external-resource guard and verify the configured tile URL against the existing allowlist.

## D4 — Schedule

**Implemented in source.**

- Scheduling moved toward pickers rather than free-form IDs: clients and nurses are loaded from their existing scoped list endpoints and places are loaded for the selected client.
- Existing schedule validation remains server-side.
- Reassignment action is available from the visit list.
- The existing backend overlap response is surfaced as an error rather than silently accepting a conflicting visit.
- Cancel remains available through the existing backend workflow.

**CI follow-up:** add/execute the overlap-specific UI assertion and verify supervisor reach isolation with representative accounts.

## D5 — Visit review

**Implemented in source.**

- Added `/admin/care/visits/:id` review route.
- Review loads the existing visit-detail contract and displays ordered events, notes, flags, photos and annotations.
- Event rows display verification and distance information when present.
- Event coordinates are shown through the reusable map component; visits without coordinates explicitly display the no-coordinate state.
- Annotation form requires non-trivial content before posting.
- Existing server-side audit/reach behaviour is reused.

**Not claimed:** the map is a lightweight configured-tile preview rather than a full interactive third-party mapping SDK.

## D6 — Flags queue

**Implemented in source.**

- Dedicated flags screen.
- Filter/search field.
- Resolve action requires a resolution note of at least three characters before the request is sent.
- Existing API scope and visit reach checks remain authoritative.
- Visit IDs remain visible in the table data so the queue can be connected to the visit review route.

## D7 — Photo review gallery

**Implemented in source.**

- Dedicated photo review screen uses the Track C private photo listing endpoint.
- Hidden/expired photos remain excluded by the server.
- Hide action requires a reason.
- Existing signed stream endpoints remain the source of truth for private image delivery.
- The UI explicitly communicates that viewing is audited and short-lived.

**CI follow-up:** browser acceptance must verify that a signed stream is requested on demand and that cache/privacy headers are preserved.

## D8 — Alerts and dashboard

**Implemented in source.**

- Dedicated alerts screen with open/status filtering.
- Acknowledge and resolve actions are wired to the existing scoped endpoints.
- Team status screen exposes last-seen information from the existing team endpoint.
- The existing care dashboard API remains available for organisation/team summary data.

## D9 — Timesheets

**Implemented in source.**

- Dedicated timesheet list with nurse/status filters.
- Approve and send-back actions are available.
- Adjustment action requires minutes and a reason.
- UI states that approved sheets are locked and export is only valid after approval.
- Existing backend enforces the final approval/export rule.

## D10 — SOS and on-call

**Implemented in source.**

- Dedicated SOS case list and acknowledge action.
- Added an on-call roster editor backed by `sos.on_call_contacts`.
- Added a dedicated test-SMS endpoint that sends only to `sms.test_number` and does **not** create an SOS case or alert.
- Test-SMS action is protected by `carecfg:write` and is audited.
- The existing production SOS path remains unchanged.

**CI/staging follow-up:** verify E.164 validation, provider behaviour and that the test action never creates a production SOS record.

## D11 — Reports

**Implemented in source.**

- Dedicated care reports screen.
- Nurse, client and Kampala-local date filters are available.
- JSON preview uses the existing filtered report endpoint.
- CSV download carries the same filters and remains protected by `care-reports:export` on the backend.
- Existing Track C CSV escaping/audit behaviour remains authoritative.

## D12 — Settings and readiness

**Implemented in source.**

- Settings screen consumes the care settings registry response rather than maintaining a second frontend schema.
- Values display their source/group metadata.
- Save operations use the existing typed care-setting endpoint.
- Readiness screen displays blocking status and server-provided detail.
- Data-request tools remain behind `system:manage` and continue using the existing export/anonymisation routes.

**CI follow-up:** verify boolean/choice/list/map control rendering for every registry type; the current implementation is intentionally schema-driven but uses compact controls rather than bespoke widgets for every type.

## D13 — Audit history viewer

**Implemented in source.**

- Dedicated audit history route under `/admin/care/audit`.
- Activity API now accepts actor, entity type, entity ID and date filters.
- Activity API returns a signed/opaque cursor token for the next page.
- Existing read-only activity scope remains `activity:read`.
- The UI has no mutation controls for audit records.

**CI follow-up:** run pagination tests against equal timestamps and multiple ObjectIds to confirm stable ordering.

## New tests authored

- `frontend/src/features/admin/care/CareScreenPage.test.tsx`
- One route-presence test for each D2–D13 screen under `frontend/src/features/admin/care/**/Page.test.tsx`
- `backend/tests/test_track_d_activity_and_sms.py`

The existing Track C route matrix and scope-enforcement suites remain the broader acceptance layer. No tests were executed in this session.

## Generated artifacts deliberately not changed

The repository rule says OpenAPI and generated frontend types must be regenerated with the approved `scripts/gen-types.sh` process and must not be hand-edited. Because this delivery is **written, not run**, the committed generated snapshot may now be stale and remains an explicit CI gate.

Likewise, the repository's nurse lockfile requirement remains outstanding if `nurse/package-lock.json` is still absent from the baseline.

## Release blockers after Track D

1. Generate/review/commit `nurse/package-lock.json` if still absent.
2. Run the approved OpenAPI/type-generation workflow and commit only reviewed generated output.
3. Run frontend lint/typecheck/unit tests/build.
4. Run backend lint/type checks and all existing plus Track C/Track D tests.
5. Run the complete route/scope coverage suite and expand endpoint-specific cases where CI exposes missing 404/422/reach/idempotency coverage.
6. Validate map tile configuration and external-resource policy.
7. Validate private photo viewing, alert/timesheet/SOS actions and CSV export in staging.
8. Validate SMS test mode and confirm it cannot create an SOS case.
9. Run browser/accessibility/responsive acceptance for every care screen.
10. Keep all owner decisions in `docs/OWNER_DECISIONS.md`; do not invent legal/privacy wording.

## Final status

**Track D source work is authored into this archive. It is not runtime-verified. Written, not run. CI will run it.**
