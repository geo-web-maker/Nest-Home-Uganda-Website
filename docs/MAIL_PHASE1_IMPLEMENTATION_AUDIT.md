# Nest Home Care mail module — Phase 1 implementation audit

**Patch scope:** Phase 1 foundations from `docs/NEST_MAIL_MODULE_SPEC.md`  
**Audit date:** 2026-10-31  
**Status:** Foundation code added; live acceptance verification remains pending.

## Implemented in this patch

- A separate asyncpg pool for mail Postgres; MongoDB/Beanie remains the primary application database. Migration file resolution supports both the source checkout and an installed backend package.
- Startup migration runner for numbered SQL files, a `schema_migrations` ledger, and a transaction-scoped Postgres advisory lock (safe with Neon transaction pooling) so concurrent app instances do not race migrations. The asyncpg statement cache is disabled for the pooled connection mode.
- `backend/mail_migrations/0001_core.sql` with the initial mail tables, indexes, search vector, UUIDs, audit store, TOTP secret store, and case-insensitive address namespace. A database trigger prevents mailbox addresses and aliases from colliding, including concurrent allocations.
- Mail settings catalogue covering the Section 5 keys and stated defaults. Values resolve from saved Postgres settings, then `NEST_MAIL_*` environment fallbacks, then built-in defaults. Runtime reads are cached for 30 seconds.
- Validation for setting types, configured limits, domains, address patterns, finite numeric values, and CR/LF in mail sender/reply-to header values.
- Fernet-encrypted secrets using `NEST_MAIL_SECRET_KEY`; secret values are write-only in the settings response. Settings changes and resets create value-free audit details.
- Scope registry entries for all five mail scopes. The shared-manage, archive-read and settings-manage scopes remain superadmin-only until the TOTP implementation exists.
- Mail settings API routes: `GET /api/v1/mail/settings`, `PATCH /api/v1/mail/settings`, and `POST /api/v1/mail/settings/{key}/reset`. Management routes also fail closed for non-superadmins during this foundation phase.
- `Bucket.MAIL` and presigned PUT support in the existing S3-compatible storage adapter.
- Docker image inclusion for `backend/mail_migrations`, plus Render and Northflank environment inventories for the mail connection, encryption key and mail bucket.
- A non-blocking mail Postgres probe/reconnect initiated by `/api/v1/health`. An unavailable optional mail database does not prevent the existing Mongo-backed app from starting.
- `.env.example`, `docs/ENV_VARS.md`, setup guidance, B2 backup/restore guidance, owner-run backup/restore/attachment-mirror scripts, and a secret-key rotation utility.
- Initial OpenAPI JSON and `api.d.ts` entries for the three settings routes. These were updated in the patch, but regeneration by the repository's normal generator remains to be run in a fully installed environment.

## Validation performed in this environment

| Check | Result |
|---|---|
| Focused mail settings unit tests | **10 passed** (run isolated from the repository's app-wide `conftest.py`) |
| Python compile/AST parsing for changed mail modules, integration files and tests | **Passed** |
| Shell syntax for the three B2 scripts (`bash -n`) | **Passed** |
| Parse `frontend/src/types/openapi.json` as JSON | **Passed** |
| Standalone TypeScript syntax check for `frontend/src/types/api.d.ts` | **Passed** |
| Parse backend TOML and Render YAML deployment configuration | **Passed** |
| Build backend wheel without resolving runtime dependencies and verify packaged SQL migration inclusion | **Passed** |
| Compare live mail-router OpenAPI paths, operations, responses and `MailSettingsPatch` schema with committed export | **Passed** |
| ASGI smoke test for unauthenticated, missing-scope, delegated-admin and superadmin behaviour | **Passed** |
| Full backend pytest suite and route-coverage tests | **Not run** — installed runtime lacks project dependencies including Beanie and asyncpg; package installation could not reach the package index |
| Ruff | **Not run** — Ruff is not installed and package installation is offline |
| Full TypeScript/frontend tests and build | **Not run** — project frontend dependencies are not installed and cannot be fetched; standalone `api.d.ts` syntax was checked successfully |
| Docker image build | **Not run** — Docker is not available in this execution environment; the Dockerfile now copies the SQL migrations |
| Fresh Neon migration, real R2 upload, provider send, Cloudflare Worker, B2 restore drill | **Not run** — no owner infrastructure credentials or live services were provided |

The ten focused tests cover settings precedence, authenticated encryption and missing-key failure, settings validation, domain normalisation, header-injection rejection, secret masking, encrypted persistence/audit redaction, initial schema/address-namespace guard, and ordered/idempotent migration-runner behaviour with the transaction-scoped lock. The ASGI smoke test exercised actual route dependencies and the temporary superadmin-only restriction. These checks are not a substitute for the full backend suite or real Postgres tests.

## Explicitly not implemented yet

This patch is **not the complete mail product**. Work remains in later phases:

### Phase 2 — Internal mail

- Automatically grant `mail:use` to every existing and newly created account.
- Create the default mailbox from staff and nurse account creation flows; close/reopen it on account deactivation/reactivation.
- Add preview/run backfill endpoints and mailbox allocation/address-alias logic.
- Add shared mailbox management and membership permissions.
- Implement internal routing, sent/inbox copies, bounces, drafts, search, read/star/folder actions, attachment presign/confirm/download, quota enforcement and audited archive access.
- Build the admin and nurse mailbox UIs, settings UI, locale strings, offline nurse draft queue, responsive states and accessibility behaviours.
- Add the Phase 2 API types from actual generated OpenAPI output and run route-coverage/IDOR tests against real Postgres.

### Phase 3 — Outbound mail

- Resend and Brevo providers, provider selection through one interface, outbox workers, retry/backoff/idempotency, counters/limits, suppression, provider webhooks and usage alerts.
- TOTP enrolment/confirmation/verified-session enforcement and release of delegated sensitive scopes.
- Route existing system notifications through the outbox while preserving fallback behaviour.

### Phase 4 — Inbound mail

- Cloudflare Email Worker source and deployment files, HMAC-authenticated inbound endpoint, MIME parsing, spam/DMARC handling, safe rendering, remote-image blocking, report-spam and block-list functions.

### Phase 5 — Polish

- Threads, labels, signatures, auto-reply, forwarding rules, address book, push alerts, quota/retention/trash jobs, and a successful owner-run restore drill.

## Deployment guardrails

1. Leave `mail.enabled=false` and `mail.inbound_enabled=false`.
2. Keep `NEST_PG_URL` and `NEST_MAIL_SECRET_KEY` in the backend host's secret store only. Do not put them in GitHub Actions or commit real values.
3. Configure a private R2 bucket in `S3_BUCKET_MAIL`; no real upload was performed by this patch.
4. Do not enable provider delivery or configure public DNS until Phases 3 and 4 are complete and their acceptance tests pass.
5. Before relying on this foundation in production, run the migrations on a fresh isolated Neon database, regenerate OpenAPI/type files with the project's supported generator, run the full backend/frontend/route checks, and review the migration and backup results with the owner.


> Follow-on work: see `docs/MAIL_PHASE2_TO_5_IMPLEMENTATION_AUDIT.md` for the later implementation pass and remaining production acceptance blockers.
