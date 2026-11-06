# Changelog

## 2026-11-06 - Mail reply send fix and fewer dialogs

- Reply drafts no longer store the internal message id as `In-Reply-To`; the server resolves it to the parent's Message-ID header, keeps it across autosaves, and the outbound/MIME code drops malformed values.
- Compose (admin and nurse): draft writes are serialised, send errors close the review popup and show beside Send, closing keeps the draft, and the review popup only appears for Bcc, attachments or more than 3 recipients.
- Admin dialogs: inline-validated reason prompts, a single Adjust form, no second confirm when cancelling a visit, named confirm buttons, focus kept on autofocused fields.
- `render.yaml` (both): added missing mail, storage, cookie and first-admin variables.
- Not run: tests and type-check (dependencies not installed here); only syntax checks and Python compilation.

## 2026-10-31 - Mail module Phase 1 foundation

- Added a dedicated async Postgres pool for mail (PgBouncer-safe statement cache settings), transaction-locked numbered idempotent migrations, and the complete initial mail schema (mailboxes, members, messages, mailbox copies, attachments, outbox, suppression, counters, settings, audit and TOTP storage).
- Added the mail settings catalogue with database > environment > default precedence, 30-second reads, typed validation, encrypted write-only secrets, reset-to-fallback behaviour and change auditing.
- Registered the five scope-based mail capabilities and restricted sensitive management scopes to superadmins until the TOTP phase is delivered.
- Added the private R2 mail bucket and short-lived presigned PUT support to the existing storage adapter; included mail SQL migrations in the backend Docker image.
- Added the mail settings API, Postgres startup migration hook and non-blocking mail database health probe/reconnect; a Neon outage does not stop the Mongo-backed app from starting.
- Documented mail environment variables in `.env.example`, `docs/ENV_VARS.md`, Render and Northflank deployment guidance, plus initial setup and owner-run Backblaze B2 backup/restore operations.

Validation: 10 isolated mail-settings unit tests passed; mail router authentication/scope fail-closed smoke checks and mail-route OpenAPI/schema comparisons passed. Python source compilation, shell syntax checks, OpenAPI JSON parsing, standalone `api.d.ts` syntax checking, deployment TOML/YAML parsing and backend wheel/migration packaging passed. The full backend suite, route tests, generated-type regeneration and frontend checks could not be run in this environment because the uploaded project has no installed frontend dependencies, backend dependencies (including Beanie and asyncpg) could not be fetched without network access, and no Neon/R2 credentials were supplied. A live Neon migration, real R2 upload, provider account, Cloudflare Worker and end-to-end mailbox flow are not verified.

## 2026-10-25 - Owner-approved privacy warning and care data safeguards

- Added the exact public booking warning `Please do not enter medical details here` beside the short-note field. The existing contact-consent checkbox remains required.
- Added a dedicated regression test for the warning and consent requirement.
- Centralised Cloudinary upload signing and deletion in the backend photo-store helper.
- Added audited client data export and anonymisation endpoints, including client-specific consent records, and a Data and retention admin panel.
- Added an approved purge path for client-associated photo assets and free-text visit notes.
- Rejected idempotency keys reused by another nurse or visit and prevented batch sync from converting unexpected server errors into invalid-payload responses.
- Extended route-call drift scanning to include nurse PWA source and native authentication routes.

Validation: written, not run. CI and owner-controlled deployment checks have not yet been executed.

## 2026-10-31 - Mail module Phases 2–5 implementation pass

- Added personal mailbox allocation/lifecycle hooks, backfill, shared mailbox membership, internal routing, drafts, folders, search, archive, attachment routes, contacts, signatures, labels and thread primitives.
- Added a first-pass responsive admin and nurse mail UI, mail settings/backfill/usage/TOTP screens, locale copy and a local nurse offline draft-send queue.
- Added Resend/Brevo HTTP adapters, compatibility routing for existing system emails, durable outbox processing, retries, provider/mailbox counters, suppression and signed provider webhook handling.
- Added TOTP enrolment, confirmation, one-time recovery codes and 12-hour verified-session cookies for sensitive management/archive operations.
- Added Cloudflare Email Worker source and backend HMAC/MIME ingestion, external-origin warning and report-spam action.
- Added mail productivity schema migrations, trash/spam cleanup, guarded closed-mailbox retention purge and quota-warning audit jobs.
- Extended OpenAPI mail paths/schemas, mail scope route tests, and added focused unit tests. Added the Phase 2–5 implementation audit and deployment guardrails.

Validation: 16 isolated mail unit tests passed; Python compilation, B2 shell syntax, OpenAPI JSON, backend/Worker TOML parsing and mail-route/OpenAPI path parity passed. Full backend/frontend suites, authoritative type regeneration, Ruff, real Postgres/Neon, R2, Cloudflare, provider and B2 restore checks were not run because required packages, tools and owner credentials were unavailable. This is substantial implementation, not production acceptance; see `docs/MAIL_PHASE2_TO_5_IMPLEMENTATION_AUDIT.md`.
