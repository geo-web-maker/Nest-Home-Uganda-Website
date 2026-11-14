# Track C completion audit

**Checkpoint:** 2026-10-26  
**Baseline:** `Nest-Home-Care-Nurse-Module-Track-B-updated.zip`  
**Rule:** `Written, not run. CI will run it.`

This document records the Track C changes added on top of the Track B archive. It is intentionally additive: earlier phase-history notes in `NURSE_IMPLEMENTATION_STATUS.md` are preserved. The supplied build plan forbids executing project commands in this session, so every new test and integration remains unrun. ZIP integrity is checked separately and does not prove application correctness.

## Summary

Track C adds backend contracts and tests for sync-push idempotency, app release policy, private and audited photo delivery, nurse invite lifecycle, server-owned scope presets, durable push delivery retries and inbox APIs, filtered visit reports and CSV safety, and route-acceptance coverage across the Track C module areas.

### C0 — Sync push operation kinds and idempotency

**Implemented in source; tests authored, not run.**

- Added/retained `sos` and `visit_photo` operation kinds alongside visit operations.
- Enforces the 256 KiB payload limit and bounded operation batch.
- Writes a `SyncPushReceipt` using `(user_id, client_op_id)` uniqueness.
- Stores a canonical payload hash; reuse of an idempotency key with different payload content is rejected as `idempotency_key_conflict`, while same-content replay is reported as a duplicate.
- Validates assigned-visit reach before accepting visit-linked actions. SOS and photo metadata use explicit operation handling rather than silently falling through.
- Migration `0012_care_track_c.py` adds the receipt indexes.

**Follow-up:** review the DB-backed replay/race tests in CI, including duplicate key races and rejected-then-corrected action behaviour against the production MongoDB version.

### C1 — App release policy

**Implemented in source; tests authored, not run.**

- Added `app_releases` model, schemas, semantic-version comparison helpers, and superadmin-only list/publish endpoints.
- `/field/app/version` uses the latest active release for the platform and applies the stricter effective minimum between the published release floor and configured `care.min_app_version`.
- Release creation validates semantic version values, safe relative download paths, duplicate release identifiers and `min_supported_version <= version`.
- Added migration and registry wiring; release publication is audited.

**Follow-up:** confirm the API response fields match the released nurse/admin client contract; choose real release artifacts and URLs only through owner-approved deployment configuration. This does not publish an app binary or prove store delivery.

### C2 — Audited private photo delivery

**Implemented in source; tests authored, not run.**

- Added short-lived HMAC-bound delivery links for the original and thumbnail variants.
- Enforces visit reach and photo visibility before creating delivery links; hidden/expired photos are omitted.
- Streams are limited to approved image content types and a configured maximum size, return `private, no-store` cache policy, and audit successful views.
- Cloudinary provider upload/sign/verify/delete/delivery URL logic is centralised behind `backend/app/core/photo_store.py`; retention passes the correct delivery type when deleting assets.
- Existing/legacy photos retain a default `delivery_type` value so older stored records remain readable.

**Follow-up:** verify the provider's actual signed transformations, private delivery mode, thumbnail behaviour and asset deletion in a non-production Cloudinary account. Confirm reverse-proxy response-size/time limits and that legacy publicly uploaded assets are not inadvertently exposed. The signed stream is intentionally the only admin-route exception to ordinary scope dependencies; the URL is issued only after scope/reach checks and is short-lived.

### C3 — Nurse invitation lifecycle

**Implemented in source; tests authored, not run.**

- Invite links have a distinct purpose and short expiry; acceptance is separate from password-reset links.
- Acceptance is single-use and records the invite acceptance timestamp.
- Nurse administrators can resend invitations and revoke outstanding invitation links, subject to existing team-reach rules.
- Revoking an unaccepted invitation invalidates the link without automatically disabling the nurse record; a new invitation may be issued when policy permits.
- The admin set-password page selects the invite acceptance endpoint when the link purpose is `invite`.

**Follow-up:** verify the real mail delivery provider/template, token lifecycle and resend rate limits. Confirm that the public invite URL is built from the owner-controlled frontend origin. Existing set-password/reset paths must pass the regression suite.

### C4 — Server-owned scope presets

**Implemented in source; tests authored, not run.**

- Exposes `GET /admin/scope-presets` behind `users:read`.
- Invite input accepts a named preset (`nurse`, `supervisor`, `admin`, `executive`, `super_admin`) or an explicit scope list, but not both at once.
- Preset expansion lives in `auth/scopes.py`; scope values are checked against the registered scope set, and superadmin-only grants remain restricted.
- The admin Users page fetches presets from the API instead of maintaining a separate hard-coded grant matrix. When a chosen bundle is unchanged, it submits the preset name; manually edited scopes are submitted explicitly.
- The executive preset is read-only and does not include export/write/hide scopes.

**Follow-up:** confirm the business meaning of every non-required `executive` bundle with the owner, and ensure scope changes are audited through the existing user-management service.

### C5 — Push-token lifecycle, durable retry and inbox

**Implemented in source; tests authored, not run.**

- Device token registration replaces/updates a device token and tracks when it was last updated.
- Sign-out/device revocation clears the token; revoked devices are excluded from delivery.
- Introduces durable per-device `PushDelivery` records with bounded retries/backoff and a scheduled dispatch job.
- Adds nurse-scoped `GET /field/inbox` and mark-read endpoint. Push content is generic and does not include client health details.
- The nurse inbox UI is available behind `VITE_NURSE_INBOX_ENABLED`; leave this disabled until deployment/provider and user-facing acceptance are complete.

**Follow-up:** provide Firebase credentials only through environment secrets; verify real FCM delivery, token rotation, revoked-token suppression, retry scheduling and inbox read state in a staging environment. No credentials are committed by this change.

### C6 — Filtered visits report and safe CSV export

**Implemented in source; tests authored, not run.**

- Adds nurse, client, date-from/date-to, format and cursor/limit filters to the care visit report endpoint.
- JSON uses stable cursor pagination and a filtered summary; CSV covers the requested filtered result set.
- CSV cells beginning with `=`, `+`, `-` or `@` are escaped to mitigate spreadsheet formula injection.
- Export is gated by `care-reports:export` and records an audit event. Existing reach checks apply to selected rows.

**Follow-up:** verify CSV downloads in supported clients, large-result memory behaviour and timezone boundaries in Kampala-local dates. Confirm report visibility with supervisor and admin roles.

### C7 — Legacy retention compatibility

**Intentionally blocked on owner decision; no legacy retention behaviour changed.**

The owner decision table still marks `retention.requests_months` compatibility as pending. The current legacy public enquiry retention remains at 24 months, with the existing tests and care-specific retention kept separate. No migration or change was made to alter enquiry deletion based on `retention.requests_months`.

**Follow-up:** obtain an explicit owner decision. If approved, implement the compatible setting while preserving 24 months as default and add override tests; until then, keep this item documented only.

### C8–C14 — Route acceptance coverage

**Coverage added; not run.**

- `test_scope_enforcement.py` derives protected admin/field paths from the registered API routes and checks declared scopes, no-token/garbage-token failures, missing/unrelated-scope failures, read-vs-write separation and exact-scope/superadmin authorisation.
- `test_route_coverage.py` guards the committed route/OpenAPI coverage contract.
- `test_track_c_route_matrix.py` adds representative route families for field (C8), field operations (C9), clients/places/stays (C10), visits (C11), alerts/timesheets (C12), SOS/data requests (C13), and nurse administration (C14). It includes anonymous and wrong-scope responses, invalid bodies, out-of-reach visit hiding, hidden photo filtering/auditing, invite expiry/single use, out-of-reach invite rejection and nurse-scoped inbox checks.
- Separate DB-backed acceptance tests cover sync idempotency, unassigned check-in rejection, app-release minimum precedence, device token rotation/revocation, push suppression, report filters/cursor/CSV/audit, invite revocation/resend and photo-stream TTL/cache/audit.

**Coverage limitation:** the new C8–C14 matrix tests representative endpoints per family, not every path/method combination with every status code. Generic scope enforcement is route-generated and broad, but CI may expose further endpoint-specific 404/422/idempotency/reach combinations. Extend the relevant module test when a route or behaviour fails; do not weaken/delete route coverage to obtain a green run.

## New test files

- `backend/tests/test_track_c_app_releases.py`
- `backend/tests/test_track_c_db_acceptance.py`
- `backend/tests/test_track_c_invite_lifecycle.py`
- `backend/tests/test_track_c_photo_signatures.py`
- `backend/tests/test_track_c_photo_stream.py`
- `backend/tests/test_track_c_push_retry.py`
- `backend/tests/test_track_c_report_rules.py`
- `backend/tests/test_track_c_route_matrix.py`
- `backend/tests/test_track_c_scope_presets.py`
- `backend/tests/test_track_c_sync_rules.py`

## Explicit blockers before release

1. Generate and commit a reviewed `nurse/package-lock.json`; the current nurse workflow stops at this lockfile gate.
2. Regenerate/review the committed OpenAPI snapshot and generated frontend types with the repository's approved `scripts/gen-types.sh` process. The snapshot may be stale after adding these endpoints; do not hand-edit generated output or skip its drift test.
3. Run CI against the target Python/Node versions and fix all reported failures in focused follow-up patches.
4. Run MongoDB-backed migration `0012_care_track_c.py` on a disposable/staging database, confirm indexes, then verify the migration rollback in a disposable environment.
5. Run provider acceptance for private photo upload/delivery/deletion and FCM send/retry/revoke in staging.
6. Verify invite email links, app release URL policy and real deployment origins through owner-controlled settings.
7. Complete role/reach, CSV, privacy and mobile-device acceptance. Track C source completion is not a production release sign-off.
8. Keep `retention.requests_months` compatibility untouched until the owner decides.

**Final status:** Track C source and regression tests are authored into this archive. No application tests, package install, OpenAPI generation, migrations, builds, or live-provider calls were run. **Written, not run. CI will run it.**
