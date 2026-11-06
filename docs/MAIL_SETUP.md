# Bloomwell Home Care mail setup

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

1. Deploy the backend with `NEST_PG_URL`, `NEST_MAIL_SECRET_KEY`, and the private mail bucket configured. The backend lifespan creates the schema migration table, takes a transaction-scoped Postgres advisory lock (compatible with a pooled Neon URL), and applies pending `backend/mail_migrations/*.sql` files before the API accepts traffic. Set `MAIL_MIGRATIONS_REQUIRED=true` in production so a configured-but-unavailable mail database or failed SQL migration blocks the new instance from starting instead of silently leaving the mail schema behind.
2. Confirm `/api/v1/health` remains healthy. The mail database probe is non-blocking and does not cause the primary MongoDB health result to fail while mail is disabled.
3. Open Admin → Mail settings. Enrol an authenticator app, verify it, review every default, set the root domain, and replace provider, provider-webhook, inbound-webhook and backup secrets only through write-only fields.
4. Do not enable external sending or inbound routing until the relevant phases, DNS checks and provider webhooks have been completed.

## Provider and inbound setup

The intended later-phase design uses one provider interface for Resend and Brevo, with `console` as the safe initial provider. The root domain must be verified with the provider's supplied SPF/DKIM records; maintain a single SPF TXT record and merge provider includes. Add DMARC and review reports before moving from `p=none` to a stricter policy. Inbound routing uses Cloudflare Email Routing and a thin Email Worker that streams raw messages to R2 and signs its backend request with HMAC-SHA256. The backend, not the Worker, parses MIME.

The repository now includes provider adapters and Worker source, but no live provider, Cloudflare Worker or domain configuration is provisioned by this repository patch. The owner must complete the live verification steps in the Phase 2–5 audit before enabling inbound or outbound delivery.

## Rich mail content and browser uploads (P1/P2)

The rich-content migration is `backend/mail_migrations/0005_rich_content.sql`. It adds HTML/quote metadata, inline-image metadata, blocked-attachment placeholders, separate Cc/Bcc outbox columns and sent-original metadata. Keep the mail bucket private. Inbound HTML is allow-list sanitised on the server; remote images remain blocked by default. Inline CID images are resolved into bounded data URIs for reading. Oversized or blocked content is kept as a visible attachment/note rather than silently discarded.

### Browser upload origin and bucket CORS

Set `VITE_MAIL_STORAGE_URL` in both the admin and nurse build environments to the exact HTTPS origin of the S3-compatible storage endpoint used by presigned attachment PUTs (for example, the origin only, not a bucket object URL). The nurse CSP build plugin adds only that configured origin to `connect-src`; deploy-specific CSP headers must preserve the same exact origin. Do not use `*` or a broad `https:` source.

Configure the private R2/S3-compatible bucket CORS with:

- **Allowed origins:** the exact production admin origin and exact production nurse origin (plus exact staging origins only when needed). The nurse Capacitor configuration sets `androidScheme: "https"`; include `https://localhost` for its local WebView origin. Include `capacitor://localhost` only if a separate build actually uses that scheme.
- **Allowed methods:** `PUT`, `GET`.
- **Allowed headers:** `Content-Type`.
- **Exposed headers:** none are required by the current browser upload flow.
- **Max age:** 3600 seconds is sufficient for the current uploader.

Example policy shape (replace both production origins; do not leave placeholders or use `*`):

```json
[{ "AllowedOrigins": ["https://<admin-origin>", "https://<nurse-origin>", "https://localhost"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```

The backend validates the upload again at confirmation time. A browser-side CORS rule is not an authorization boundary; keep presigned URLs short-lived and the bucket private.

### Settings and safety defaults

Review the rich-content settings in Admin → Mail settings before enabling mail: `mail.rich_text_enabled`, `mail.max_html_kb`, `mail.inline_image_max_kb`, `mail.inline_images_total_mb`, `mail.provider_max_message_mb`, `mail.confirm_external_send`, `mail.confirm_external_links`, `mail.allow_forward_as_attachment`, and `mail.store_sent_eml`. Remote image blocking remains enabled by default. Both admin and nurse composers now lazy-load the shared TipTap editor, use the shared attachment uploader/list, preserve a separate quoted-message block, and use the shared safe message viewer. The nurse editor uses the lite toolbar profile. Measure its route bundle against the documented budgets before enabling rich text in production.

### Recovering existing received mail

Use **Rebuild formatting for received mail** in Mail settings to preview and then reprocess a bounded batch of existing inbound messages from their retained raw `.eml` objects. The operation is idempotent, leaves mailbox read/starred/folder state untouched and reports counts only. Messages whose raw object has expired are skipped.


### Scanning service deployment (BE-13)

The optional ClamAV scanner is disabled by default (`mail.scan_enabled=false`); external sending also defaults off (`mail.external_enabled=false`) until the acceptance checks pass. Existing installations may retain a previously stored `true` value; inspect and turn it off explicitly before production verification. Choose and secure a host before enabling it. Deploy the `scanner/` compose stack on a separate host or private network; keep `clamd` private, put an HTTPS reverse proxy in front of the scanner API, and set a high-entropy bearer token. Supply a dedicated read-only R2/S3 access key limited to the mail attachment bucket/prefix. The backend sends only the object key and expected SHA-256 to the scanner. Never send contract contents to VirusTotal or another third-party scanner. See `docs/MAIL_SCANNING.md` for firewall, reverse-proxy, memory, credentials and smoke-test instructions.

After the scanner endpoint and token are configured through protected mail settings, enable scanning with `mail.scan_enabled=true`, `mail.scan_mode=http`, `mail.scan_url`, `mail.scan_token`, a bounded `mail.scan_timeout_seconds`, and `mail.scan_fail_mode=block` for contract workflows. Keep `mail.scan_block_unscanned_download=true` where the operational policy requires it. Do not enable external contract sending until the scan path, queue worker, download gate and fail-closed behavior have been verified in the deployed environment.

### Delivery events and provider transport

Brevo SMTP is the preferred transport when `mail.provider=brevo` and `mail.brevo_transport=smtp`; configure its SMTP login/key separately from the REST API key. The SMTP adapter sends the frozen RFC 5322 message and passes To/Cc/Bcc as the envelope, keeping Bcc out of visible headers. Use the provider's supported TLS port and verify the domain's SPF/DKIM before sending. `mail.brevo_transport=api` selects the JSON API fallback, whose inline-CID/threading behavior is more limited.

Configure the Brevo transactional webhook URL with URL Basic Authentication with username `nest` and the write-only `mail.provider_webhook_secret`; configure the Resend webhook with Svix signing and its signing secret. The backend stores deduplicated per-recipient events; soft bounces/deferred events are not treated as permanent address suppression. Before enabling delivery, send controlled test messages to external mailboxes, verify attachment receipt and Bcc privacy, and confirm delivered/deferred/soft-bounce/hard-bounce events appear against the correct Sent item.

The repository includes configuration paths and webhook handlers, but cannot create provider webhooks, validate sender domains, access SMTP/API secrets or verify live delivery. These remain owner-side acceptance steps.

### Multi-site hoster adoption

This package retains the Nest source and the supplied Multi-Site-Hosting source tree. The hoster registry must be configured with the owner's private repository URL and an immutable commit/tag before running the hoster's fetch/build process. No private Git URL or release ref is invented here. Preserve the hoster's existing superadmin bootstrap and keep its site bootstrap/tenant routing logic unchanged while wiring the Nest site entry.
