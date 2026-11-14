# Track C follow-up checklist

**Rule for this delivery:** Written, not run. CI will run it.

## Source changes included

- [x] C0 sync operation kinds, payload cap, durable idempotency receipt and payload-conflict rejection.
- [x] C1 app-release model, routes, semantic version rules, configured minimum precedence and migration.
- [x] C2 audited short-lived photo/thumbnail delivery and provider wrapper.
- [x] C3 nurse invite purpose, expiry, single-use acceptance, resend and revoke.
- [x] C4 server-owned scope preset API and Admin Users integration.
- [x] C5 token rotation/revocation, durable retry records/job, nurse inbox and read endpoint.
- [x] C6 report filters, cursor paging, CSV escaping and export audit.
- [x] C7 documented as pending; legacy 24-month public enquiry retention unchanged.
- [x] C8–C14 representative route-acceptance matrix and generic route scope enforcement coverage.
- [x] Added regression tests for pure rules, HTTP contracts and DB-backed workflows.
- [x] Updated implementation status and included audit/checklist/manifest.

## Required owner/deployment actions

- [ ] Decide explicitly whether `retention.requests_months` should also control legacy public enquiry retention. Do not change the current 24-month behaviour before this decision.
- [ ] Supply Firebase/FCM settings via deployment secrets; do not commit credentials.
- [ ] Confirm frontend origin used for invitation links and deployment API origin/CSP allowlist.
- [ ] Confirm real Android/web app release artifacts and safe download URLs before publishing releases.
- [ ] Confirm the chosen executive preset matches the organisation's permission model.

## CI and integration gates — not run in this delivery

- [ ] Generate/review/commit `nurse/package-lock.json`; nurse CI currently blocks without it.
- [ ] Run backend lint/type/import checks and all existing plus `test_track_c_*` pytest tests.
- [ ] Regenerate/review OpenAPI and frontend types using the approved type-generation workflow; fix snapshot drift without skipping the drift test.
- [ ] Run the complete route coverage and scope-enforcement suite; expand C8–C14 specific cases for any uncovered 404/422/reach/idempotency behaviour.
- [ ] Apply migration 0012 to a disposable MongoDB, verify unique/query indexes and rollback.
- [ ] Run the relevant frontend tests and production build after API contract/type regeneration.
- [ ] Verify photo provider upload, hidden/expired asset filtering, original/thumbnail delivery, private cache headers, view audit and deletion in staging.
- [ ] Verify FCM token rotation, device revoke, retry exhaustion, delivery cancellation, no PHI in push, inbox pagination/read state in staging.
- [ ] Verify invite issue/resend/revoke/expiry/single-use and email origin in staging.
- [ ] Verify CSV filters, spreadsheet injection escaping, export permissions, reach isolation and audit trail.
- [ ] Verify app release semver ordering, floor precedence, owner-approved download URL and forced-update behaviour.
- [ ] Run accessibility, browser and supported Android-device acceptance, including foreground heartbeat/SOS/privacy cases as applicable.
- [ ] Review all CI output before marking any test or phase as passed.

## Current confidence label

Source changes and test cases are included. None of the project test, generation, migration, build or device commands were run. ZIP structure/integrity verification is separate from application verification.
