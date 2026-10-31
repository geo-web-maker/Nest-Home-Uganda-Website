# Nest Home Care mail setup

This guide follows `docs/NEST_MAIL_MODULE_SPEC.md`. Mail is a separate Postgres-backed subsystem; the application's existing MongoDB/Beanie databases remain unchanged.

## Current implementation status

Phases 1–5 now have substantial code in the repository: the separate Postgres foundation, internal mailbox APIs and first-pass admin/nurse screens, outbound provider adapters and durable queue, Cloudflare inbound Worker/backend ingestion, and initial polish tables/jobs. The current state is **not production-accepted**. See `docs/MAIL_PHASE2_TO_5_IMPLEMENTATION_AUDIT.md` for the implemented surface, incomplete acceptance items and checks that could not be run.

Keep `mail.enabled=false` and `mail.inbound_enabled=false` until a fresh isolated Neon migration, full backend/frontend/route tests, provider fake-server tests, Cloudflare Worker verification and owner infrastructure checks have passed. Do not enable retention purge before a successful isolated restore drill.

## Owner-supplied setup values

1. Create a Neon project for mail. Copy the pooled connection string and set it in the backend host as `NEST_PG_URL`, retaining `sslmode=require`.
2. Generate a high-entropy secret and set it as `NEST_MAIL_SECRET_KEY`. Keep a protected recovery copy. Losing or replacing this key without re-encrypting stored secrets makes those secrets unrecoverable.
3. Create a private Cloudflare R2 bucket for mail and set its bucket name as `S3_BUCKET_MAIL`. Reuse the existing S3-compatible endpoint and credentials through `S3_ENDPOINT`, `S3_KEY`, and `S3_SECRET`.
4. Keep `mail.enabled=false` until the owner has configured the domain and TOTP, reviewed the settings catalogue, and passed the Phase 2–5 integration checks. Sensitive settings operations require a verified TOTP session.
5. Choose the root mail domain only when the owner has purchased and verified it. Set it through the mail settings catalogue; no domain is hard-coded in the application.

## First deployment

1. Deploy the backend with `NEST_PG_URL`, `NEST_MAIL_SECRET_KEY`, and the private mail bucket configured. The backend lifespan creates the schema migration table, takes a transaction-scoped Postgres advisory lock (compatible with a pooled Neon URL), and applies pending `backend/mail_migrations/*.sql` files once.
2. Confirm `/api/v1/health` remains healthy. The mail database probe is non-blocking and does not cause the primary MongoDB health result to fail while mail is disabled.
3. Open Admin → Mail settings. Enrol an authenticator app, verify it, review every default, set the root domain, and replace provider, provider-webhook, inbound-webhook and backup secrets only through write-only fields.
4. Do not enable external sending or inbound routing until the relevant phases, DNS checks and provider webhooks have been completed.

## Provider and inbound setup

The intended later-phase design uses one provider interface for Resend and Brevo, with `console` as the safe initial provider. The root domain must be verified with the provider's supplied SPF/DKIM records; maintain a single SPF TXT record and merge provider includes. Add DMARC and review reports before moving from `p=none` to a stricter policy. Inbound routing uses Cloudflare Email Routing and a thin Email Worker that streams raw messages to R2 and signs its backend request with HMAC-SHA256. The backend, not the Worker, parses MIME.

The repository now includes provider adapters and Worker source, but no live provider, Cloudflare Worker or domain configuration is provisioned by this repository patch. The owner must complete the live verification steps in the Phase 2–5 audit before enabling inbound or outbound delivery.
