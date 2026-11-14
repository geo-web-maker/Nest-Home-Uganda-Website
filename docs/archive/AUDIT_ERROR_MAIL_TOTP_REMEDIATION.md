# Nest / Multi-Site Hoster remediation report

## Scope

This remediation starts from the latest `audit-totp-protected` packages and preserves their earlier email diagnostics, detailed API errors, audit centre, TOTP gates, automatic startup migrations, Nurse/Admin UI work, and superadmin bootstrap. The Multi-Site Hoster's `projects/nest` backend remains the authoritative production backend. The affected code in Nest's standalone `backend/app` copy has also been synchronised, while retaining its own package-specific Mongo and SQL migration directories.

## Fixes applied

### Email delivery

- Removed provider-supplied SMTP/HTTP error text from user-facing bounce/failure messages. Users receive a plain-language action; detailed provider failures remain in the protected admin delivery diagnostics/outbox.
- Outbox retry/failure transitions now write structured system audit events, including attempt number, retryability, outcome certainty, and a safe error type. They do not copy credentials, message bodies, recipient lists, or provider response bodies into audit metadata.
- Authenticated late provider delivery failures/bounces continue to be recorded as delivery events; permanent delivery failures generate a generic sender notice and an audit event.
- Prevented blind SMTP resend after an uncertain result. SMTP network exceptions are explicitly marked `outcome_unknown`; the message is moved to failed/manual-review status, the sender is told it was not automatically resent, and an admin can inspect the protected diagnostic. Resend/Brevo API transports retain retry behaviour where their idempotency key is available.
- A worker crash after the provider-send marker is committed is also treated as an unknown outcome and requires administrator reconciliation instead of retrying SMTP automatically. The sender receives the same generic status notice in this recovery path.

### Audit history and TOTP

- Activity pagination now sorts by `(at DESC, _id DESC)` to make the cursor tiebreak deterministic. Cursor requests no longer also apply the page offset.
- Repeated API 4xx audit events are sampled once per route/status/hashed-IP/minute. The throttle is shared through PostgreSQL across Hoster workers when the mail database is configured, with a bounded in-process fallback if it is unavailable. Ordinary 404 probes and unauthenticated 401 scanner traffic are skipped.
- TOTP lifecycle operations (enrolment start, confirmation, verification, reset, failures and blocked attempts) are recorded as security audit events. Views of Admin activity, Nurse activity, mail audit, visit review details and SOS drill history are recorded.
- TOTP enrol/confirm/verify/reset attempts are limited using the shared PostgreSQL `security_rate_limit` table, keyed separately by account and trusted client IP. The table is created by SQL migration `0011_security_rate_limit.sql`.
- Recovery codes are now 128-bit random values and are stored as keyed HMAC digests using the application/mail secret. Existing legacy SHA-256 hashes remain accepted once and are consumed on use for compatibility.
- TOTP session signing no longer depends on `cryptography`'s private `_signing_key`. The signed session includes the current authenticator enrollment epoch, so reset/re-enrolment invalidates old cookies, including after a later confirmation.
- Normal audit records inherit the current request ID through a context variable.
- Proxy headers are used for client-IP determination only when `NEST_TRUST_PROXY=true` and the immediate peer is within `NEST_TRUSTED_PROXY_IPS`. Otherwise the peer address is used, preventing arbitrary client-supplied `X-Forwarded-For` values from controlling the limiter key.

### Error handling and frontend capture

- The request diagnostics middleware catches unhandled exceptions, records a critical audit event with the request ID, then re-raises for normal 500 handling.
- Unhandled server tracebacks now also include that request ID in protected server logs.
- App errors, validation errors, HTTP errors and 500 responses use the same `{ "error": { "code", "message", "request_id", ... } }` envelope. Stack traces and exception internals are not returned to clients.
- `X-Request-ID` is attached to API responses and exposed through CORS so cross-origin frontends can read it.
- Both Admin and Nurse frontends have React error boundaries plus global `window.error` and `unhandledrejection` capture. Sanitised reports are sent to `POST /api/v1/client-errors`; the endpoint is rate-limited and records a `frontend.unhandled_error` event.
- The Cloudflare email worker no longer logs sender or recipient email addresses, and it logs response status rather than response body content.

### Deployment and migrations

- Corrected the embedded Hoster Mongo migration path to `projects/nest/migrations` (it previously resolved one directory too high). Startup now refuses to continue if that directory is missing/empty or if required care migrations are absent.
- PostgreSQL mail migrations include `0010_outbox_send_intent.sql` and `0011_security_rate_limit.sql` in the Hoster backend.
- The standalone Nest backend keeps its own migration layout and has corresponding `0009_inbound_log.sql`, `0010_outbox_send_intent.sql`, and `0011_security_rate_limit.sql`; its Mongo migration directory is checked at startup too.
- Existing superadmin bootstrap files and environment contract were not changed.

## Validation performed

- Hoster backend: `python -m compileall -q main.py migrate.py core modules tests` passed.
- Nest standalone backend: `python -m compileall -q app tests` passed.
- Targeted Python tests: **29 passed**. These include audit TOTP guard, email diagnostic TOTP, delivery-detail privacy, delivery events, inbound tracing, attachment download module path, and SMTP uncertain-outcome behaviour.
- Full Hoster suite could not be collected because this environment does not have `apscheduler`; tests requiring `beanie` and `aiosmtpd` were skipped because those packages are also absent.
- Nest standalone pytest run was blocked during `conftest.py` import because `beanie` is not installed.
- Frontend production builds/typechecks and live MongoDB/PostgreSQL integration tests were not run: Node dependencies and live databases are unavailable in this environment.
- Both final ZIP files were checked with `unzip -t` after packaging.

## Deployment notes

1. Deploy the Multi-Site Hoster package as the source of the production Nest backend (`projects/nest`). Deploy the Nest package for the Admin, Nurse and public frontend assets. The standalone Nest backend is kept aligned for development/standalone use but should not replace the Hoster-mounted API in the multi-site deployment.
2. Configure `NEST_PG_URL` and set `NEST_MAIL_MIGRATIONS_REQUIRED=true` wherever the mail subsystem is required. The Hoster Render blueprint already sets the required flag; mirror it on other hosts.
3. Configure `NEST_MONGODB_URI`, the main DB name, and the separate care DB URI/name. The app applies Mongo migrations at startup before serving requests.
4. If forwarding headers are needed for correct client IPs, set `NEST_TRUST_PROXY=true` and populate `NEST_TRUSTED_PROXY_IPS` with the actual proxy peer IPs/CIDRs. Leave forwarding untrusted rather than guessing proxy ranges. Without both settings, rate limits use the immediate peer address.
5. Run full CI with the project's locked Python dependencies, build both Vite frontends, and run integration tests against disposable MongoDB and PostgreSQL databases before production rollout.

## Important operational behaviour

An SMTP timeout after the send operation begins is intentionally not retried automatically. The application cannot prove whether the SMTP server accepted the message. Administrators should reconcile that event with provider/server delivery logs before manually retrying it; this avoids sending duplicates to recipients.
