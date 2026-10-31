# Nest Home Care Mail — Phases 2–5 implementation audit

**Audit date:** 2026-10-31  
**Baseline:** `Nest-Home-Uganda-Website-Mail-Phase1.zip`  
**Status:** Substantial implementation added; production acceptance is **not yet achieved**. This document distinguishes code added from infrastructure and end-to-end behaviour that has not been verified.

## Phase 2 — Internal mail

### Implemented in this patch

- `mail:use` is added to the nurse/staff presets and is automatically included in authenticated principals so legacy accounts receive the capability without a mass user-document rewrite.
- Idempotent personal mailbox creation, owner membership, generated address allocation, numeric collision suffixes, reserved local-part checks, welcome message, closed mailbox creation for inactive accounts, and automatic name-change alias helper.
- Hooks from staff invite, nurse invite and direct nurse creation. Mail failures are caught so an optional mail database does not block existing MongoDB account creation.
- Staff/nurse deactivation closes a personal mailbox; reactivation reopens the same mailbox.
- Preview/run backfill endpoints, repeat-safe mailbox creation, 200-user batches, skip summaries and run audit.
- Shared mailbox create/update/close and member add/remove endpoints. Member roles are `owner`, `send_as` and `read_only`; send-as is checked on compose/draft operations.
- Transactional local routing, deduplication across To/Cc/Bcc, local inbox copies, sender Sent copy, local self-send, alias resolution, closed/unknown local-address bounce notice, and no provider call for local-only delivery.
- Draft create/update/delete/send; folder list/search, read marking, star/folder updates, trash, spam reporting, mailbox-specific sender blocks, bcc visibility limited to the sender's own copy.
- Attachment presign/confirm/attach/download routes, file-size and extension checks, checksum confirmation, mailbox quota preflight and audited five-minute download links.
- Closed-mailbox archive list/message reads with a TOTP session check and an audit row for each archive open.
- Admin mailbox, compose, settings, backfill, usage and TOTP screens; nurse mailbox screen with cached read-only last messages and a single pending local draft send queue.
- Locale strings for the new admin and nurse screens.

### Acceptance still not met

- No real Neon/Postgres service was available. SQL router, quota, lifecycle, concurrent allocation, IDOR, attachment and archive flows have not been integration-tested against real Postgres.
- Nurse offline drafts use a local browser-storage queue, not the full existing IndexedDB/outbox conventions; only one pending draft slot is retained. The queue is not yet a complete multi-draft offline mail outbox.
- Admin/nurse screens are a functional first pass, not the full reference UI: no unread navigation badge, complete mobile pane navigation in every screen, swipe actions, keyboard shortcuts, full reply/reply-all/forward flows, recipient autocomplete, complete attachment compose UX, or exhaustive per-screen skeleton/error/quota/suspension/closed/offline states.
- The nav item is scope-gated, but the `mail.enabled` feature flag is enforced by the mailbox API rather than dynamically hiding the navigation entry before settings are enabled.
- Staff profile name editing is not present in the existing user update schema; the alias helper is wired where nurse profile names can change.
- User deletion remains dependent on the repository's existing account soft-delete lifecycle; no new deletion workflow was invented.

## Phase 3 — Outbound external mail

### Implemented in this patch

- HTTP-only Resend and Brevo adapters behind one provider selection interface; `console` remains the default safe provider.
- Durable Postgres outbox worker, claim with `FOR UPDATE SKIP LOCKED`, ten-minute worker leases with restart recovery, idempotency keys, bounded exponential retry schedule, retryable/permanent error classification, final-failure notice, pacing and persisted queue state.
- Provider daily/monthly recipient counter reservations and deferral, per-mailbox daily external recipient limit, recipient cap, global and per-mailbox sending suspension, and suppression checks.
- Hard-bounce/complaint webhook endpoint with timestamp/signature checks and suppression persistence. A separate encrypted `mail.provider_webhook_secret` setting was added because provider API credentials are not webhook signing secrets. The settings catalogue now contains 40 unique keys.
- Existing `get_email_provider().send(...)` callers now use a compatibility adapter that queues priority-1 system mail when mail is enabled and falls back to the console provider if the optional mail service fails.
- RFC 6238 TOTP enrolment/confirmation, one-time recovery codes, recovery-code consumption, and a 12-hour signed HttpOnly verification cookie for sensitive mail management/archive operations.
- Outbox drain runs every 15 seconds and opportunistically from the health ping.

### Acceptance still not met

- Resend/Brevo API requests, provider idempotency semantics, signatures, bounces and complaint payloads have not been tested against the live providers or a fake HTTP server in this environment.
- Provider attachments are not yet serialised into provider-specific payloads.
- Auto-suspend based on abnormal hourly send rate/bounce spikes, low-priority 90%-cap deferral, complete usage alerts and all race conditions around provider quota reservations need real Postgres concurrency tests.
- `mail.new_external_send_review` and configurable `mail.require_totp_for_scopes` are present in settings but their complete approval/policy orchestration is not implemented; sensitive management endpoints currently enforce TOTP conservatively.
- The existing system-email fallback is safe against a mail outage, but real delivery of invites/resets/enquiry alerts remains unverified until provider credentials and the queue are configured.

## Phase 4 — Inbound external mail

### Implemented in this patch

- Cloudflare Email Worker source, `wrangler.toml` and deployment README. The Worker streams raw RFC 5322 messages to a private R2 binding and posts signed envelope metadata to the backend.
- Timestamped HMAC-SHA256 validation with a five-minute replay window and constant-time comparison.
- Backend raw-object retrieval, MIME parsing, plain-text extraction, basic attachment extraction, extension blocking, idempotency by Message-ID, local mailbox/alias delivery, DMARC-fail quarantine when auth metadata is supplied, and Spam folder placement.
- External-origin metadata is surfaced in the admin/nurse readers with an external sender warning. HTML content is conservatively stripped rather than rendered as active HTML, and attachments are download-only.
- Report-spam action moves the message to Spam and stores a mailbox-specific sender block.

### Acceptance still not met

- The Worker has not been deployed, and Cloudflare Email Routing, R2 bindings, HMAC secret, MIME edge cases and provider authentication metadata were not exercised live.
- Cloudflare authentication results are not yet extracted/passed by the Worker, so SPF/DKIM/DMARC assessment is incomplete. The backend only quarantines DMARC failure when an authenticated `auth_results` object is supplied.
- Unknown/closed inbound recipients are currently not fully handled to the specification's exact rejection/bounce semantics; delivery currently skips unresolved/closed targets rather than implementing a production-grade SMTP-style reject/bounce exchange.
- There is no malware-scanning service integration. Risky extensions are blocked, but safe-looking files remain unscanned; a production malware scanning decision and quarantine pipeline are still required.
- Remote HTML is stripped, which is safer than allowing remote images, but the full per-message “allow remote images” experience is not implemented.
- Full inbound rate limiting and raw-object orphan cleanup are not yet integrated.

## Phase 5 — Polish

### Implemented in this patch

- Migration 0002 adds mailbox sender blocks, labels/label links, signatures, and forwarding-rule storage.
- Migration 0003 adds mailbox contacts and auto-reply settings storage.
- Thread IDs are assigned for outgoing messages and linked from inbound `In-Reply-To` headers where the parent is known; a thread read endpoint is provided.
- Label create/list/attach endpoints, signature get/update endpoints, contact lookup/save endpoints and auto-reply settings endpoints.
- Daily Trash/Spam cleanup, closed-mailbox retention purge guarded by `mail.purge_enabled` and `legal_hold`, hourly quota warning audit events, and retained audit history.
- Owner-run Backblaze B2 backup, isolated restore and attachment mirror scripts from Phase 1 remain included; the backup/recovery guide explains the required owner-run restore drill.

### Acceptance still not met

- Auto-reply and forwarding rules are stored but are not yet executed by inbound/outbound workers.
- No unread push-notification integration for mail has been wired into the existing push dispatcher.
- Labels, signatures, contacts and thread APIs have backend support but only a subset is surfaced in the frontends.
- Quota checks currently block attachment preflight and emit warning audit rows; full quota enforcement across all message-copy/draft paths and superadmin alert presentation remains incomplete.
- B2 restore drills, R2 object-versioning, B2 Object Lock and retention configuration are owner infrastructure tasks and have not been performed.

## Security and deployment guardrails

1. Keep `mail.enabled=false` until the owner has configured Neon, the secret-encryption key, domain, private R2 bucket, TOTP and provider settings and has run the isolated integration tests.
2. Keep `mail.inbound_enabled=false` until the Cloudflare Worker and inbound signature flow have passed live verification.
3. Do not publish a mail domain's DNS records or enable Resend/Brevo delivery based only on this code patch.
4. `NEST_PG_URL`, `NEST_MAIL_SECRET_KEY`, provider credentials and webhook secrets must remain in the host secret store/settings encryption. No real secret belongs in Git or CI.
5. Review the SQL migrations and the retention purge against a fresh isolated Neon database before enabling `mail.purge_enabled`.

## Validation performed for this patch

| Check | Result |
|---|---|
| Isolated Phase 1 settings tests plus new mail unit tests | **16 passed** |
| Python compileall / AST parse for backend source and tests | **Passed** |
| Shell syntax (`bash -n`) for B2 scripts | **Passed** |
| JSON parse for committed OpenAPI | **Passed** |
| TOML parse for backend project and Cloudflare Worker config | **Passed** |
| Mail router decorator paths vs committed OpenAPI mail paths | **37 paths, exact match** |
| Focused backend suite / real Postgres router tests | **Not run** — Beanie and asyncpg are not installed in the execution environment |
| Full frontend typecheck/build/tests/lint | **Not run** — frontend and nurse node_modules are absent; TypeScript stops on missing React/Vite/Vitest type packages |
| Ruff | **Not run** — Ruff is not installed |
| Cloudflare Worker typecheck/deploy | **Not run** — Wrangler and Cloudflare credentials are not available |
| Live Neon/R2/Resend/Brevo/B2 tests | **Not run** — owner infrastructure credentials/services were not supplied |

`frontend/src/types/openapi.json` has been extended to include the mail routes and request schemas. `api.d.ts` includes compatibility path/schema declarations for the new mail surface, but these are not a substitute for the repository's authoritative `bash scripts/gen-types.sh` run. Regenerate both in the fully installed project environment before merging/deploying.
