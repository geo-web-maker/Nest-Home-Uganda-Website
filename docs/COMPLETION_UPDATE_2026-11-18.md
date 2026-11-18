# Cross-package completion update — 18 November 2026

This update covers the three supplied archives: the Multi-Site Hosting repository, the Well Nest Home Care website/Nest repository, and the Bloomwell care-forms package. It records source work completed in this pass and separates it from validations that require the owner's environment or specialist approval.

## Multi-Site Hosting

- Monitor Phase 6/8 source gaps were closed: check-history `from`/`to` filters are implemented; public status pages derive current state from recent uptime records and report `unknown` for missing/stale data; request bodies have a configurable size cap; login and selected expensive endpoints have configurable process-local rate limits.
- Tests were added for date filters, stale/missing status, invalid site lists, request-size limits, and 429 rate limiting. They were not run.
- The embedded Nest backend is synchronized with the standalone Nest backend after the care-forms and photo-gallery changes. `scripts/check_nest_sync.py` reported `In sync.` (source parity only, not a test suite).
- Montage's implementation status is source-complete per its own status file, but still depends on production MongoDB/S3 Object Lock, Cloudinary, EgoSMS, SMTP/IMAP credentials, legal review, and live browser/device checks.

## Well Nest Home Care website / Nest backend and apps

- Completed the missing Bloomwell P5 admin surfaces: patient type and completed-agreement linkage, constrained patient overrides, UNMC verification with a different admin, metadata/signature evidence view, private signed-PDF viewer, email-copy log, and admin-to-nurse switching for dual-scope users.
- Tightened UNMC signing and verification: the number and a present, valid, unexpired practising-licence expiry are required. Any nurse edit clears previous admin verification.
- Admin care-form index responses now contain metadata and signature evidence only; clinical payloads are not included in the index response. The signed PDF route remains read-only, reach-checked and `private, no-store`.
- The private-photo gallery now receives short-lived signed thumbnail paths and displays thumbnails. The server continues to proxy the private provider image, audit each view, and prevent hidden/expired assets from being streamed.
- Extended billing and public verification UI regression-test sources for filter queries, safe idempotent retries, file-hash match/mismatch, and public rate-limit handling.
- Historical website phases 0–5 are documented as closed in the existing build log. Nurse Track D/E and the Phase 14 foundation are source-authored; live validation remains outstanding.
- The nurse notification work is not being marked complete: Track C5's device token lifecycle, durable retry queue, nurse inbox list, and per-item read API exist, but the broader WO-17C catalogue/channel policy, user notification preferences, admin push status/test controls, protected allowlisted deep links, and credential-backed FCM acceptance remain outstanding. Keep `VITE_NURSE_INBOX_ENABLED` disabled until staging acceptance. WO-18 / Module D remains skipped because it is explicitly not approved in `docs/OWNER_DECISIONS.md`.

## Bloomwell care forms

- P1–P5 source implementation is complete in the standalone Nest app and embedded Hoster copy.
- P6 is **not release-approved**. Clinical lead review of `generators/forms.txt`, owner confirmation of the PDPO reference, supported WeasyPrint inspection of Forms 05/08/10/12, full automated checks, and operational smoke testing remain necessary.

## Not executed in this pass

No automated test suite, typecheck, lint suite, frontend build, backend server, migration, PDF rendering, Playwright/browser session, or native device command was run. The source-test files and handover notes are included, but no pass result is claimed.

## Remaining release/owner gates

1. Run the repository-prescribed checks in the owner's CI/local environment, including MongoDB replica set and S3/MinIO dependencies where required.
2. Generate and review OpenAPI/types through the supported generator; do not hand-edit generated artifacts.
3. Complete browser responsive/accessibility checks and the real-backend nurse/photo/push E2E flows; build/install and validate Android apps on devices before APK release.
4. Configure the real infrastructure credentials and trusted proxy/rate-limit topology; verify mail/SMS/Cloudinary/FCM integrations.
5. Obtain clinical, privacy/PDPO, retention, and legal approvals where relevant.
