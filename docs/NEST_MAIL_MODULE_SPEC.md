# Nest Home Care: Mail Module Build Specification

Handoff document for the builder (ChatGPT). Read all of it before writing code. Everything marked **DECIDED** is an owner decision and must not be changed. Everything marked **ASSUMED** is a sensible default the owner can change later in the settings screen.

---

## 1. Goal

Add an in-app mail system to the Nest Home Care web app. Nurses (field PWA) and staff (admin app) get real mailboxes: inbox, sent, drafts, trash, spam, attachments, search. In-house mail is delivered inside the database and costs nothing. Only mail to or from outside addresses uses a provider.

## 2. Owner decisions (DECIDED)

1. Every user (nurse or staff) gets a **default mailbox automatically** when the account is created. Existing users are covered by a **backfill button** in the superadmin email settings.
2. **Shared mailboxes** (for example `info@`) are created by users holding the shared-manage scope, who then assign them to specific people. Only assigned members can read, send or receive as that address.
3. Permissions are **scope based**. There are no roles. This matches the existing scope registry.
4. When an account closes, its **mailbox closes**: no sending, no receiving. All messages and attachments are **kept** and can be read by users holding the archive-read scope. Every archive open is audit-logged.
5. Mail sent to a closed address **bounces**. A closed address is **never reissued** to anyone else.
6. **Retention** of closed mailboxes is a setting in superadmin email settings.
7. Privacy of staff mail is covered in staff contracts. The system still keeps an audit log.
8. **Postgres on Neon** for mail data. The rest of the app stays on MongoDB.
9. **Attachments** are stored in S3-compatible object storage (Cloudflare R2), never in a database.
10. Outbound provider is **Resend or Brevo**, selected by a setting. Both must be implemented behind one interface.
11. **Nurses may email external addresses.** A per-mailbox switch and a global switch can turn it off.
12. The **domain is not decided**. It is a setting. No domain is hard-coded anywhere.
13. The domain is bought on Cloudflare and has no existing mail. The root domain is used for addresses (`name@domain`), not a `mail.` subdomain.
14. Inbound external mail arrives through **Cloudflare Email Routing** with an Email Worker.
15. **Every value is settable in the superadmin email settings section, with defaults existing.** Section 5 is the catalogue.
16. Backfill and per-mailbox limits follow **Gmail-style limits by default**, and are settings.
17. Storage quotas are settings.
18. A name change **adds an alias**; it never renames the mailbox.
19. 2FA for sensitive mail scopes uses an **authenticator app (TOTP)**. SMS 2FA is rejected as too costly.
20. The Render instance is kept awake by an **external ping**. The system must still survive restarts.
21. Backups go to **Backblaze B2** in the owner's existing style (Section 14).
22. The Neon connection string is an **environment variable** and is never shared or committed.
23. The owner prefers **diffs over full file rewrites** when code is edited. Deliver each phase as a patch.

## 3. Non-goals

No IMAP/POP/SMTP server. No native mail-app support. No calendar or contacts sync. No end-to-end encryption. No custom spam filter (use provider signals). No catch-all mailbox.

---

## 4. How this fits the existing codebase

Verified against the uploaded repo. Follow its conventions exactly.

| Concern | Existing pattern | What the mail module does |
|---|---|---|
| Backend layout | `backend/app/modules/<name>/{models,repository,router,schemas,service}.py` | New module `backend/app/modules/mail/` with the same file split |
| Wiring | `backend/app/registry.py` is the only place routers and models are listed | Register the mail router there and nowhere else |
| Scopes | `backend/app/modules/auth/scopes.py` is the only scope list. `require_scopes(...)` in `app/core/deps.py`. A superadmin holds every scope. No scope implies another | Add the mail scopes (Section 6) |
| Primary DB | MongoDB through Beanie (`app/core/db.py`) | Do **not** touch it. Mail gets its own Postgres layer in `app/modules/mail/db.py` |
| Migrations | Numbered idempotent scripts in `backend/migrations`, run by `app/migrate.py`, tracked in a `migrations` collection | Postgres gets numbered `.sql` files in `backend/mail_migrations/`, tracked in a `schema_migrations` table, run at startup. Same idempotent, run-once discipline |
| Object storage | `app/core/storage.py`, `Bucket` enum (PUBLIC, PRIVATE), `put/get/delete/signed_url` | Add a `MAIL` bucket and reuse the same interface. Add `presigned_put` if not present |
| Scheduled jobs | APScheduler in `app/jobs.py`, started from the app lifespan, claim-with-compare-and-set | Add mail jobs there (Section 12). Claim rows in Postgres with `FOR UPDATE SKIP LOCKED` |
| Email | `app/modules/notifications/providers.py` has `EmailProvider` (`send(to, subject, html, text)`) and only `ConsoleEmailProvider`. `get_email_provider()` returns it | Add Resend and Brevo implementations and switch on the setting. Keep `send` backwards compatible. Existing callers (invites, resets, enquiry alerts) must keep working and should be routed through the outbox |
| User creation | `modules/users/service.py: invite`, `modules/nurses/service.py: invite_nurse` and `create_nurse_direct` | Call `mail.service.ensure_default_mailbox(user)` from all three. This is the only change allowed outside the mail module on the backend, plus scopes, registry and storage |
| Audit | `app/modules/audit` | Reuse it for admin-level actions. Mail also keeps its own Postgres `mail_audit` table for message-level events |
| Frontend (admin) | `frontend/src/features/admin/*`, `nav.ts`, `screens.tsx`, settings under `features/admin/settings` | Add `features/admin/mail/` and a nav entry gated by scope. Add a Mail section to settings |
| Frontend (nurse) | `nurse/src/{screens,features,components}`, PWA, offline layer | Add `nurse/src/features/mail/`. Reuse `ThemeToggle` and existing tokens |
| Theme | Shared `nest-theme` setting, dark mode everywhere | All mail screens must support light and dark using existing tokens, no hard-coded colours |
| API types | `frontend/src/types/openapi.json` and `api.d.ts` are generated, and a backend test fails if they are stale | Regenerate both after adding routes |
| Route tests | Tests check every frontend call has a backend route, and GET routes must not need write scopes unless allow-listed | Respect both. Use `iter_api_routes()` in tests, not `app.routes` |
| Hoster | `projects/nest` is the adopted, patched copy of the backend, vendored | After backend changes, the owner re-adopts. Add the new env vars to the env docs |

**Rule: do not edit any other module's behaviour.** Do not touch the public site, design tokens, Button, or unrelated admin pages.

---

## 5. Settings catalogue (all editable in superadmin email settings)

**Resolution order:** value saved in the settings screen, then environment variable, then built-in default. Settings live in the Postgres table `mail_settings` (key, value JSON, updated_by, updated_at). Reads are cached for 30 seconds. Changes apply without a redeploy.

**Each setting needs:** a label, a one-line help text, a type, a default, validation, a "reset to default" button, and an audit entry on change (secrets log "changed" only).

**Secrets** (API keys, webhook secrets, Backblaze keys) are stored encrypted with `NEST_MAIL_SECRET_KEY` (an env variable, AES-GCM or Fernet), are write-only in the UI, and show only "set" or "not set".

**Env-only (cannot live in the database):** `NEST_PG_URL`, `NEST_MAIL_SECRET_KEY`.

### 5.1 General
| Key | Default | Notes |
|---|---|---|
| `mail.enabled` | `false` | Feature flag. Superadmin only until switched on for others |
| `mail.domain` | empty | Required before any mailbox can be created. Backfill and creation refuse to run if empty |
| `mail.address_pattern` | `{first}.{last}` | Tokens: `{first}`, `{last}`, `{staff_no}`. Collisions get a number suffix |
| `mail.accepted_domains` | empty list | Extra domains accepted for inbound and treated as local (used if the domain changes) |

### 5.2 Sending
| Key | Default | Notes |
|---|---|---|
| `mail.provider` | `console` | `console`, `resend` or `brevo` |
| `mail.provider_api_key` | unset | Secret |
| `mail.from_name` | `Nest Home Care` | Display name for system mail |
| `mail.reply_to` | empty | Optional |
| `mail.external_enabled` | `false` | Global switch for external sending; enable only after provider/attachment/Bcc acceptance checks |
| `mail.provider_daily_limit` | `100` | ASSUMED conservative. Match the provider plan |
| `mail.provider_monthly_limit` | `3000` | ASSUMED. Match the provider plan |
| `mail.mailbox_daily_external_limit` | `500` | ASSUMED, Gmail-style, per mailbox per day |
| `mail.message_recipient_limit` | `100` | ASSUMED, recipients per message (to + cc + bcc) |
| `mail.warn_threshold_percent` | `80` | Superadmin alert level |
| `mail.send_rate_per_second` | `2` | Pacing to avoid provider rate limits |
| `mail.suspend_all_sending` | `false` | Emergency stop |

### 5.3 Storage
| Key | Default | Notes |
|---|---|---|
| `mail.mailbox_quota_mb` | `1024` | ASSUMED. Per mailbox, counts messages and attachments |
| `mail.max_message_mb` | `20` | Message plus attachments. Hard ceiling 25, the Cloudflare inbound limit |
| `mail.max_attachment_mb` | `15` | Per file |
| `mail.blocked_extensions` | `exe,js,jar,scr,bat,cmd,com,msi,vbs,iso,dll,ps1,lnk,docm,xlsm,pptm` | Comma list. Blocks upload, send and inbound download |
| `mail.trash_purge_days` | `30` | Auto-purge from Trash |
| `mail.spam_purge_days` | `30` | Auto-purge from Spam |

### 5.4 Retention
| Key | Default | Notes |
|---|---|---|
| `mail.retention_years` | `0` | `0` means keep closed mailboxes forever. Applies to existing closed mailboxes when changed |
| `mail.purge_enabled` | `false` | Safety lock. The purge job does nothing unless this is true |

### 5.5 Inbound and spam
| Key | Default | Notes |
|---|---|---|
| `mail.inbound_enabled` | `false` | Accept external mail |
| `mail.inbound_webhook_secret` | unset | Secret. Signs requests from the Cloudflare Worker |
| `mail.spam_score_threshold` | `5.0` | At or above goes to Spam |
| `mail.quarantine_dmarc_fail` | `true` | DMARC fail goes to Spam |
| `mail.external_sender_banner` | `true` | Banner on external mail |
| `mail.block_remote_images` | `true` | Until the user allows them per message |

### 5.6 Backfill
| Key | Default | Notes |
|---|---|---|
| `mail.backfill_include_inactive` | `false` | Inactive users are skipped by default |

Backfill itself is an action button, not a setting (Section 9).

### 5.7 Backups
| Key | Default | Notes |
|---|---|---|
| `mail.backup_endpoint` | empty | Backblaze B2 S3 endpoint |
| `mail.backup_bucket` | empty | Dump bucket |
| `mail.backup_attachments_bucket` | empty | Second copy of attachments |
| `mail.backup_key_id`, `mail.backup_application_key` | unset | Secrets |
| `mail.backup_retention_days` | `90` | ASSUMED. Informational for the owner script; real retention is B2 lifecycle and Object Lock |

### 5.8 Security
| Key | Default | Notes |
|---|---|---|
| `mail.require_totp_for_scopes` | `mail:shared:manage,mail:archive:read,mail:settings:manage` | Users holding these must have TOTP enabled to use them |
| `mail.new_external_send_review` | `false` | Optional: hold first external send from a new mailbox for approval |

---

## 6. Scopes

Add to `modules/auth/scopes.py`, group `Mail`. A superadmin holds all.

| Scope | Meaning |
|---|---|
| `mail:use` | Use own default mailbox and any shared mailbox the user is a member of. Granted automatically to everyone who can sign in |
| `mail:shared:manage` | Create, rename and close shared mailboxes. Add and remove members. Set member roles |
| `mail:archive:read` | Read closed mailboxes, read-only. Every open is audited |
| `mail:settings:manage` | Edit email settings, run backfill, view usage |
| `mail:audit:read` | View the mail audit log |

Member roles inside a shared mailbox (stored on `mailbox_member`, not scopes): `owner` (manage members of that mailbox), `send_as` (read, send, receive), `read_only`.

---

## 7. Data model (Postgres)

Use SQLAlchemy 2.x async with asyncpg, or asyncpg directly with SQL files. UUID primary keys (`gen_random_uuid()`). All timestamps `timestamptz`. Soft delete only where stated.

```sql
-- 0001_core.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE mailbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_part citext NOT NULL,                 -- address = local_part@<mail.domain>
  kind text NOT NULL CHECK (kind IN ('personal','shared')),
  owner_user_id text,                         -- Mongo user id, set for personal
  display_name text NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  external_allowed boolean,                   -- NULL = follow global setting
  sending_suspended boolean NOT NULL DEFAULT false,
  legal_hold boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (local_part)                          -- never reused, even when closed
);

CREATE TABLE mailbox_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailbox(id),
  local_part citext NOT NULL UNIQUE,           -- shares the namespace with mailbox.local_part (enforce in code)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mailbox_member (
  mailbox_id uuid NOT NULL REFERENCES mailbox(id),
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','send_as','read_only')),
  added_by text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mailbox_id, user_id)
);
-- A personal mailbox has exactly one member row: its owner, role 'owner'.

CREATE TABLE message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid,                              -- Phase 5
  message_id_header text,                      -- RFC 5322 Message-ID
  in_reply_to text,
  from_address text NOT NULL,
  from_name text,
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text,                              -- sanitised on write
  origin text NOT NULL CHECK (origin IN ('internal','outbound','inbound')),
  size_bytes bigint NOT NULL DEFAULT 0,
  spam_score numeric,
  auth_results jsonb,                          -- spf/dkim/dmarc from provider
  raw_object_key text,                         -- raw .eml in R2 for inbound
  created_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(body_text,'') || ' ' || coalesce(from_address,''))
  ) STORED
);
CREATE INDEX message_search_idx ON message USING gin (search);

CREATE TABLE message_recipient (
  message_id uuid NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('to','cc','bcc')),
  address text NOT NULL,
  name text,
  mailbox_id uuid REFERENCES mailbox(id),      -- set when local
  PRIMARY KEY (message_id, kind, address)
);

-- One row per message per mailbox that holds a copy.
CREATE TABLE mailbox_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailbox(id),
  message_id uuid NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  folder text NOT NULL CHECK (folder IN ('inbox','sent','drafts','trash','spam')),
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  trashed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, message_id, folder)
);
CREATE INDEX mailbox_message_list_idx ON mailbox_message (mailbox_id, folder, received_at DESC);

CREATE TABLE attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES message(id) ON DELETE CASCADE,  -- NULL while uploaded but not yet attached to a draft
  uploader_mailbox_id uuid REFERENCES mailbox(id),
  object_key text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  scan_state text NOT NULL DEFAULT 'unscanned',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES message(id),
  from_mailbox_id uuid REFERENCES mailbox(id),
  to_addresses text[] NOT NULL,                -- external recipients only
  priority smallint NOT NULL DEFAULT 5,        -- 1 account mail, 5 user mail, 9 low (notifications, auto-reply)
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','sent','deferred','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE,
  provider text,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX outbox_due_idx ON outbox (state, next_attempt_at, priority);

CREATE TABLE suppression (
  address citext PRIMARY KEY,
  reason text NOT NULL CHECK (reason IN ('hard_bounce','complaint','manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE send_counter (
  scope text NOT NULL,                         -- 'provider' or 'mailbox:<uuid>'
  window_kind text NOT NULL CHECK (window_kind IN ('day','month')),
  window_start date NOT NULL,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, window_kind, window_start)
);

CREATE TABLE mail_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  is_secret boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mail_audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id text,
  action text NOT NULL,                        -- see Section 13
  mailbox_id uuid,
  message_id uuid,
  detail jsonb,
  ip_hash text
);

CREATE TABLE totp_secret (
  user_id text PRIMARY KEY,
  secret_encrypted bytea NOT NULL,
  confirmed_at timestamptz,
  recovery_hashes text[] NOT NULL DEFAULT '{}'
);
```

(`citext` also needs `CREATE EXTENSION IF NOT EXISTS citext;`. Neon supports all four extensions.)

Notes:
- **Body HTML is sanitised on write** (allow-list, strip scripts and event handlers, rewrite remote image URLs so they can be blocked).
- **bcc** recipients are stored but only the sender's copy shows them.
- Message size counts toward quota for each mailbox holding a copy, but the attachment file is stored once.
- Users are referenced by their Mongo user id string. Never duplicate user data except `display_name`.

---

## 8. Address rules

- Address = `local_part@<mail.domain>`. Compare case-insensitively.
- Default personal address from `mail.address_pattern`. On collision append `2`, `3` and so on. Strip accents, lower-case, keep `a-z 0-9 . -`, collapse repeats.
- Reserved local parts that cannot be personal or shared: `postmaster`, `abuse`, `admin`, `administrator`, `root`, `webmaster`, `hostmaster`, `noreply`, `no-reply`, `mailer-daemon`, `support` (shared mailboxes may be created with these names by `mail:shared:manage`, but never auto-generated).
- **A name change adds an alias** (`mailbox_alias`) for the new pattern and leaves the original local part as primary. Mail to either arrives in the same mailbox. Never rename.
- **Never reuse** any `local_part` or alias, including closed ones.
- If `mail.domain` changes: existing rows are unchanged (only the local part is stored), and the old domain goes into `mail.accepted_domains` so inbound to the old address still routes.

---

## 9. Mailbox lifecycle

### 9.1 Creation
`ensure_default_mailbox(user)` is idempotent: if the user already has a personal mailbox it returns it. It creates the mailbox, an `owner` member row and a welcome message from the system mailbox. It is called from `invite`, `invite_nurse` and `create_nurse_direct`.

### 9.2 Backfill (button in email settings)
- Endpoint requires `mail:settings:manage`.
- **Preview first:** returns the count of users without a mailbox and a sample of 10 names. Refuses with a clear message if `mail.domain` is empty.
- **Run:** creates missing mailboxes for active users only (unless `mail.backfill_include_inactive` is true), in batches of 200, each in its own transaction. Safe to repeat.
- **Result:** created count, skipped list with reasons (no name, collision unresolved, inactive).
- One audit row per run (`mail.backfill`) with actor and counts.
- Inactive users are skipped by default because their mailboxes would be created closed.

### 9.3 Closing
When a user is deactivated or deleted, set `mailbox.state='closed'` and `closed_at`. Hook this where user deactivation happens (the users module update path). User deletion must be a soft delete so the link survives.
- Closed: cannot send, cannot receive (bounce), not listed in compose pickers.
- Messages and attachments stay.
- **Reactivating the user reopens the same mailbox.**
- Shared mailboxes can be closed by `mail:shared:manage` the same way.

### 9.4 Archive reading
Closed mailboxes are readable only with `mail:archive:read`, read-only, never composable. Each open writes `mail.archive.open` to `mail_audit` with actor, mailbox and time. The archive list endpoint also audits.

### 9.5 Retention purge
Daily job. Runs only if `mail.purge_enabled` is true and `mail.retention_years > 0`. Purges mailboxes closed longer than the period unless `legal_hold`. Deletes R2 attachment objects, then rows. Writes `mail.purge` to the audit log with counts. The audit log itself is never purged by this job.

---

## 10. The internal router

One function, `route_message(message, sender_mailbox)`, used by every send. It runs inside a single database transaction for local delivery.

```
for each recipient address (to, cc, bcc, deduplicated, lower-cased):
    local = resolve(address)            # mailbox or alias on mail.domain or accepted_domains
    if local and local.state == 'open':
        insert mailbox_message(folder='inbox') for that mailbox
    elif local and local.state == 'closed':
        queue bounce to sender: "This mailbox is closed."
    elif address domain is ours but no mailbox:
        queue bounce to sender: "No such mailbox."
    else:
        external.append(address)

always: insert mailbox_message(folder='sent', is_read=true) for the sender mailbox

if external:
    check external allowed (global, mailbox, suspended flags)
    drop suppressed addresses, report them to the sender in a system message
    check recipient cap, mailbox daily cap, provider caps (the limit manager)
    insert one outbox row (idempotency key = message id + hash of external recipients)
```

Rules:
- **Local delivery never calls a provider and never touches send counters.**
- Bounces to the sender are system messages delivered locally (from `mailer-daemon`), not provider mail.
- A user can only send **as** a mailbox where they are `owner` or `send_as`.
- The sender's own address in to/cc is delivered normally.
- Sending from a closed mailbox, a suspended mailbox or a `read_only` membership is rejected with a clear error.
- Drafts are `mailbox_message(folder='drafts')` with a message row that is not routed until sent.

---

## 11. Outbound external

### 11.1 Provider interface
Extend the existing protocol without breaking callers:

```python
class EmailProvider(Protocol):
    name: str
    async def send(self, to: list[str], subject: str, html: str, text: str, *,
                   from_address: str | None = None, from_name: str | None = None,
                   reply_to: str | None = None, headers: dict[str, str] | None = None,
                   attachments: list[AttachmentPayload] | None = None,
                   idempotency_key: str | None = None) -> SendResult: ...
```

Implement `ResendEmailProvider` and `BrevoEmailProvider` over HTTPS with `httpx` (**never SMTP**, since the free host blocks SMTP). `get_email_provider()` reads `mail.provider` and the encrypted key from settings. Provider failures map to retryable (network, 429, 5xx) or permanent (4xx validation). Include a plain-text part always.

### 11.2 Outbox worker
- APScheduler job every 15 seconds, plus an opportunistic drain from the `/health` endpoint (the owner pings it to keep Render awake).
- Claim rows with `SELECT ... WHERE state IN ('queued','deferred') AND next_attempt_at <= now() ORDER BY priority, created_at FOR UPDATE SKIP LOCKED LIMIT n`.
- Retry with exponential backoff (1m, 5m, 30m, 2h, 6h), give up after 6 attempts, set `failed`, and deliver a bounce message to the sender.
- Idempotency key prevents double sends after a restart.
- A restart must lose nothing, because the outbox is in Postgres.

### 11.3 Limit manager
- **Counters:** increment `send_counter` for `provider` (day, month) and `mailbox:<id>` (day) per external **recipient**.
- **Priority:** 1 = account mail (invites, password resets), 5 = user mail, 9 = low priority (notifications, auto-replies).
- **Near cap:** at `warn_threshold_percent`, create a superadmin alert. When the provider daily cap is reached, set outbox rows to `deferred` with `next_attempt_at` at the next window start. Low priority defers first (at 90% of the cap). **Nothing is dropped.**
- **Per mailbox:** reject at send time with a clear message when the mailbox daily cap or recipient cap is exceeded.
- **Pacing:** token bucket at `send_rate_per_second`.
- **Usage panel** in the settings screen: today, this month, per-mailbox top senders, queue depth, deferred count, failed count.
- `mail.suspend_all_sending` and per-mailbox `sending_suspended` stop sends immediately and leave rows queued.
- **Auto-suspend:** if a mailbox exceeds 3x its normal hourly rate or hits a spike of bounces, suspend its external sending and alert a superadmin.

### 11.4 Existing system emails
Invites, password resets and enquiry alerts currently call `get_email_provider().send(...)`. Route them through the outbox at priority 1 and deliver them from a system mailbox (`no-reply`). Keep a fallback so a mail-module failure never blocks an invite.

### 11.5 Bounce and complaint webhooks
`POST /api/v1/mail/webhooks/{provider}`. Verify the provider signature (Resend uses Svix signatures, Brevo uses a shared secret or IP allow-list; confirm against current docs). Hard bounce and complaint events insert into `suppression`. Soft bounces retry. Log everything; never trust unauthenticated payloads.

---

## 12. Inbound external

### 12.1 Cloudflare side
- Cloudflare Email Routing on the domain, one **catch-all rule** to an **Email Worker**. Adding mailboxes never needs a Cloudflare change.
- The Worker stays thin: stream the raw message to R2 (`mail/inbound/<yyyy>/<mm>/<uuid>.eml`) and `POST` a small JSON to the backend with the object key, envelope from/to, size and Cloudflare's auth results. Sign the request with HMAC-SHA256 using `mail.inbound_webhook_secret`, include a timestamp, and reject requests older than 5 minutes.
- Do **not** parse MIME in the Worker (free-plan CPU limits). Messages over 25 MiB are rejected by Cloudflare.
- Provide the Worker source (`cloudflare/email-worker/src/index.ts`), `wrangler.toml` and a README.

### 12.2 Backend side
`POST /api/v1/mail/inbound` (HMAC-verified, rate-limited):
1. Fetch the raw `.eml` from R2.
2. Parse MIME (`email` stdlib or `mail-parser`), extract text, HTML, headers and attachments.
3. Resolve each envelope recipient. Unknown local part: respond rejected (no catch-all). Closed mailbox: bounce. Open mailbox: deliver.
4. Evaluate spam: provider or Cloudflare auth results plus `mail.spam_score_threshold` and `mail.quarantine_dmarc_fail`. Failures go to the **Spam** folder, never bounced (bouncing spam hits forged senders).
5. Store attachments in R2, block risky extensions (store a placeholder note instead), sanitise HTML.
6. Insert `message`, `message_recipient`, `mailbox_message`.
7. Return 200 quickly. The Worker retries on non-2xx, so make delivery idempotent on `message_id_header` plus the R2 key.

### 12.3 Safety
External sender banner, remote images blocked by default, a confirmation dialog before opening any link in external mail, a "Report spam" button (moves to Spam and adds a per-mailbox block entry), and attachments are download-only. CID-referenced inline images are displayed only after the server resolves them to bounded data URIs; remote images are not proxied. Large inline images remain downloadable attachments with a visible note.

---

## 13. API surface

Prefix `/api/v1`. All routes use `require_scopes`. Responses use the existing error shape and pagination helpers. Add every route to the OpenAPI types.

**Mailboxes**
- `GET /mail/mailboxes`: mailboxes the caller can use (own plus shared memberships) with unread counts. Scope `mail:use`.
- `GET /mail/mailboxes/{id}/messages?folder=&q=&cursor=`: list. Cursor pagination.
- `GET /mail/messages/{mailbox_message_id}`: read, marks read.
- `PATCH /mail/messages/{mailbox_message_id}`: move folder, star, read.
- `DELETE /mail/messages/{mailbox_message_id}`: to Trash, or purge if already in Trash.

**Compose**
- `POST /mail/drafts`, `PUT /mail/drafts/{id}`, `DELETE /mail/drafts/{id}`.
- `POST /mail/drafts/{id}/send`: routes the message. Body includes `from_mailbox_id`.
- `POST /mail/attachments/presign`: returns a presigned PUT and an attachment id. Validates size and extension first.
- `POST /mail/attachments/{id}/confirm`: after upload, verifies size and records sha256.
- `GET /mail/attachments/{id}/download`: short-lived signed URL, membership checked, audited.

**Shared mailbox admin** (`mail:shared:manage`)
- `POST /mail/shared`, `PATCH /mail/shared/{id}`, `POST /mail/shared/{id}/close`
- `PUT /mail/shared/{id}/members/{user_id}` with role, `DELETE` to remove.

**Archive** (`mail:archive:read`)
- `GET /mail/archive/mailboxes`, `GET /mail/archive/mailboxes/{id}/messages`, `GET /mail/archive/messages/{id}`. All audited.

**Settings** (`mail:settings:manage`)
- `GET /mail/settings` (secrets masked), `PATCH /mail/settings`, `POST /mail/settings/{key}/reset`
- `GET /mail/usage`, `POST /mail/backfill/preview`, `POST /mail/backfill/run`
- `POST /mail/settings/test-send`: sends a test message through the active provider to an address the admin enters.

**Audit** (`mail:audit:read`): `GET /mail/audit`.

**Webhooks and inbound:** `POST /mail/webhooks/{provider}`, `POST /mail/inbound`. HMAC or provider signature, no user scope.

**2FA:** `POST /mail/totp/enroll`, `POST /mail/totp/confirm`, `POST /mail/totp/verify`. Users holding a scope in `mail.require_totp_for_scopes` get 403 with a clear code on those routes until TOTP is confirmed and a verified session is present (re-verify every 12 hours).

**Health:** the existing health route also kicks the outbox drain (non-blocking).

**Audit actions** to record: `mail.send`, `mail.read.shared`, `mail.attachment.download`, `mail.shared.create`, `mail.member.add`, `mail.member.remove`, `mail.mailbox.close`, `mail.mailbox.reopen`, `mail.archive.open`, `mail.settings.change`, `mail.backfill`, `mail.purge`, `mail.suspend`, `mail.totp.enable`.

---

## 14. Backups (Backblaze B2, owner style)

Match `docs/BACKUP_AND_RECOVERY_B2.md`: **owner-run scripts, encrypted artifacts, B2 S3 API, restore drill, no GitHub runner connecting to the database.** Create `docs/MAIL_BACKUP_AND_RECOVERY_B2.md` and these scripts:

- `scripts/backup-mail-postgres-to-b2.sh`: `pg_dump --format=custom` using `NEST_PG_URL`, encrypt with `openssl enc -aes-256-cbc -pbkdf2` using `BACKUP_PASSPHRASE`, write a checksum file, upload with `aws s3 cp --endpoint-url $B2_ENDPOINT`.
- `scripts/restore-mail-postgres-from-b2.sh`: requires `RESTORE_TARGET_ISOLATED=yes`, `BACKUP_RESTORE_URI` and `BACKUP_OBJECT_KEY`. Never uses `--clean` against anything but the isolated target.
- `scripts/sync-mail-attachments-to-b2.sh`: `aws s3 sync` from the R2 mail bucket to the second B2 bucket.
- Neon's own point-in-time restore is the first line of defence for recent mistakes. B2 Object Lock and retention are configured by the owner in the B2 console.
- Never log secrets or message content. Test a restore monthly and record the date, object key, row counts and duration (no personal data).
- Enable R2 object versioning for the mail bucket.

The backup values in 5.7 are for documentation and the owner's convenience. The scripts read environment variables, as the existing Mongo scripts do.

---

## 15. Security requirements

- Authorisation on **every** mailbox read: the caller must be a member of that mailbox (or hold `mail:archive:read` for closed ones). Test for IDOR on every route.
- Sanitise HTML with an allow-list library on write and escape on render. No inline scripts. Strict CSP on the mail iframe or container.
- Attachment downloads go through signed URLs of 5 minutes, membership checked, audited.
- Rate-limit compose, send, attachment presign, login-adjacent routes and webhooks using `core/rate_limit.py`.
- Webhook and inbound requests: HMAC with timestamp, constant-time compare, replay window 5 minutes.
- Header injection: reject CR/LF in addresses, subjects and names.
- Secrets encrypted at rest with `NEST_MAIL_SECRET_KEY`. Rotating the key needs a re-encrypt command (include it).
- Nothing sensitive in logs. Log message ids, never bodies.
- Client data rule: mail is not a patient record. Show a one-line reminder in compose for external recipients: "Do not send client details to outside addresses." (A warning, not a block.)
- Nurses default to the global external switch. A per-mailbox override exists for superadmins.
- Closed address bounce text must not reveal the former user's name.

---

## 16. UI specification

Mobile-first, 360px baseline. Reuse existing design tokens, `Button`, `Checkbox`, `Badge`, sheets and the theme system. Light and dark must both work. No hard-coded colours or durations.

### 16.1 Admin app (`frontend/src/features/admin/mail/`)
- Nav item **Mail** with an unread badge, shown when `mail.enabled` and the user holds `mail:use`.
- **Layout:** desktop three panes (folders and mailboxes, message list, reading pane). Phone: one pane at a time with a back button.
- **Mailbox switcher** at the top of the folder pane: own mailbox first, then shared ones, each with an unread count.
- **Folders:** Inbox, Sent, Drafts, Trash, Spam, Starred.
- **List row:** sender, subject, snippet, time, attachment icon, unread dot, star. Swipe actions on touch (archive-to-trash, mark read).
- **Reading pane:** headers, external sender banner, safe HTML body, attachment chips (download), Reply, Reply all, Forward, Delete, Report spam.
- **Compose:** full screen on phone, sheet or modal on desktop. From picker (only mailboxes the user may send as), To/Cc/Bcc chips with address autocomplete from local mailboxes, subject, body (plain with basic formatting), attach button with progress, autosave drafts every 5 seconds, recipient count against the cap, external reminder, Send disabled until valid.
- **Search** box with folder scope.
- **Shared mailbox manager** (`mail:shared:manage`): list, create, close, add or remove members, pick role.
- **Archive viewer** (`mail:archive:read`): read-only, with a persistent "Archived mailbox. Access is logged." banner.
- **Settings page** (`mail:settings:manage`), grouped by Section 5, each field with help text and Reset. Secret fields show "set / not set" with a Replace button. Usage panel with day and month bars, queue depth and top senders. **Backfill card:** shows the preview count, a Run button with confirm, and the result summary. **Test send** card.
- **Audit view** (`mail:audit:read`): filterable table.
- **2FA enrol screen** with QR code, confirm field and one-time recovery codes.

### 16.2 Nurse app (`nurse/src/features/mail/`)
- A Mail entry in the main navigation with an unread badge, below the existing primary actions so field workflows (visit, SOS) are not displaced.
- Same screens as admin except settings, shared-manage, archive and audit. Single-pane flow, large touch targets (44px minimum).
- Offline: the mailbox list and last-opened messages are cached read-only; compose queues drafts locally and sends when online. Show a clear offline indicator. Follow the existing offline module's conventions.
- Respect the existing compact theme toggle placement.

### 16.3 States every screen needs
Loading skeleton, empty state per folder, error with retry, quota-exceeded message, sending-suspended banner, closed-mailbox banner, offline banner.

### 16.4 Accessibility
Labelled controls, visible focus, screen-reader text for unread and starred state, keyboard shortcuts on desktop (c compose, r reply, / search, Esc close), reduced-motion respected.

### 16.5 Copy
Add all strings to the existing locale files. No hard-coded English in components.

---

## 17. Jobs (APScheduler, `app/jobs.py`)

| Job | Interval | Purpose |
|---|---|---|
| `mail_outbox_drain` | 15 s | Send due outbox rows |
| `mail_counter_rollover` | daily 00:05 UTC | Release deferred rows, delete counters older than 62 days |
| `mail_trash_purge` | daily | Purge Trash and Spam older than the configured days |
| `mail_retention_purge` | daily | Section 9.5 |
| `mail_quota_check` | hourly | Alert mailboxes above 90% of quota |
| `mail_usage_alert` | 10 min | Create superadmin alerts at the warn threshold |
| `mail_backup_reminder` | weekly | Remind the owner if no recent restore drill is recorded |

Each job is idempotent and safe if two instances run (row claims with `SKIP LOCKED`).

---

## 18. Environment variables

Only these are env-only or bootstrap. Everything else is in settings with env fallback using the same name upper-cased with `NEST_MAIL_` (for example `NEST_MAIL_DOMAIN`).

| Variable | Required | Purpose |
|---|---|---|
| `NEST_PG_URL` | yes | Neon connection string (use the pooled URL with `sslmode=require`) |
| `NEST_MAIL_SECRET_KEY` | yes | Key for encrypting stored secrets |
| `NEST_MAIL_DOMAIN`, `NEST_MAIL_PROVIDER`, `NEST_MAIL_API_KEY` | optional | Bootstrap fallbacks for the settings |
| `NEST_S3_*` | existing | Add a mail bucket name setting |

Document these in `docs/ENV_VARS.md` and the hoster env list. The hoster uses the `NEST_` prefix.

---

## 19. DNS and provider setup guide (write as `docs/MAIL_SETUP.md`)

1. Buy the domain on Cloudflare.
2. Create a Neon project, copy the pooled connection string into Render as `NEST_PG_URL`.
3. Create an R2 bucket for mail and a B2 bucket pair for backups.
4. Create a Resend or Brevo account, verify the **root domain** (add the DKIM and SPF records they give, set the records to **DNS only**, grey cloud). One SPF record only, merge includes.
5. Add DMARC: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<an address>`. Move to `quarantine` after a few weeks of clean reports.
6. Turn on Cloudflare Email Routing, add the catch-all rule to the Email Worker, deploy the Worker with the shared secret.
7. In superadmin email settings: set the domain, provider, key, then run **Test send**, then **Backfill preview** and **Run**.
8. Turn on `mail.enabled`, then `mail.inbound_enabled`.
9. Ping `/health` from an external monitor every 10 minutes to keep the Render instance awake.

---

## 20. Testing requirements

Write tests with the repo's patterns. Use a real Postgres in tests (service container or local), not mocks, for router and quota logic.

- **Router:** local-only, mixed local and external, unknown local, closed mailbox bounce, self-send, duplicate recipients, bcc privacy, alias delivery, no provider call for local mail.
- **Scopes and IDOR:** every route denies a non-member, a read-only member sending, and a missing scope. Archive routes deny without `mail:archive:read`.
- **Lifecycle:** create on invite, on direct create and on staff create; backfill preview and run, idempotent repeat; close on deactivate; reopen on reactivate; address never reused; alias on name change.
- **Limits:** counters, deferral at the cap, priority order, per-mailbox caps, suspend switches, suppression list.
- **Outbox:** retry and backoff, idempotency after restart, bounce on final failure, concurrency with two workers.
- **Providers:** Resend and Brevo request shapes with a fake HTTP server (`respx`), error mapping, webhook signature verification.
- **Inbound:** HMAC accept and reject, replay window, spam and DMARC to Spam, risky attachments blocked, unknown local rejected, idempotent redelivery.
- **Settings:** precedence (saved, env, default), reset, secrets never returned, audit on change.
- **Security:** HTML sanitiser cases, header injection, signed URL expiry.
- **Retention:** purge disabled by default, legal hold respected, R2 deletion called.
- **Frontend:** compose, list, folder moves, settings fields, backfill card, theme in light and dark, 360px layout, nurse offline queue.
- **Repo gates:** `tsc` clean, regenerated `openapi.json` and `api.d.ts`, the route-coverage test passing, existing tests still passing.

---

## 21. Phases and acceptance criteria

Deliver each phase as a **patch** (diff against the previous state), with tests, and update the env docs.

### Phase 1: Foundations
Postgres layer and migrations, settings store with encryption, scopes, audit tables, R2 mail bucket, feature flag, settings API, `/health` hook.
**Accept:** migrations run on a fresh Neon database, settings precedence tests pass, scopes registered, nothing else in the app changed.

### Phase 2: Internal mail
Default mailbox hooks, backfill, shared mailboxes and members, router, compose, drafts, attachments, search, closing and archive, settings screen, admin and nurse UIs.
**Accept:** a new nurse gets a mailbox; two users exchange mail with zero provider calls; a shared mailbox works only for members; a closed account bounces and its archive opens only with the scope and is audited; backfill is repeatable; all screens work in light and dark at 360px.

### Phase 3: Outbound external
Resend and Brevo providers, outbox, limit manager, usage panel, suppression, webhooks, TOTP, send-as, DNS guide.
**Accept:** switching provider needs only a settings change; a restart mid-queue loses nothing; hitting the daily cap defers instead of dropping; a hard bounce suppresses the address.

### Phase 4: Inbound external
Email Worker, inbound endpoint, spam handling, safe rendering, external banner, report spam, block list.
**Accept:** mail from Gmail reaches the right mailbox; spoofed mail lands in Spam; unknown addresses are rejected; a risky attachment is blocked; remote images stay blocked until allowed.

### Phase 5: Polish
Threads, labels, signatures, auto-reply, forwarding rules, address book, unread push alerts, retention and trash jobs, Backblaze backup scripts and doc, quota enforcement.
**Accept:** purge jobs honour their locks and legal hold; a restore drill succeeds into an isolated database; quota warnings appear.

---

## 22. Rules for the builder

1. Do not change behaviour outside the mail module except the listed integration points: scopes, registry, storage bucket, user-creation and deactivation hooks, jobs, `/health`, locale strings, nav, and the system-email routing.
2. Do not invent product decisions. If something is unclear, choose the safe default, make it a setting, and list it in the phase notes.
3. Never hard-code a domain, provider, limit, quota, retention period or secret.
4. Never log message bodies or secrets.
5. Keep files small and match the repo's existing style, naming and test layout.
6. Run `tsc`, the backend suite and the frontend suite before declaring a phase done, and report real results. Do not claim a pass that was not run.
7. State plainly what was not tested (for example anything needing real Neon, Cloudflare, Resend or Brevo accounts).
8. Update `docs/ENV_VARS.md`, add `docs/MAIL_SETUP.md` and `docs/MAIL_BACKUP_AND_RECOVERY_B2.md`, and append to the changelog.

## 23. Items still open (all are settings, none blocks the build)

- Domain name.
- Final provider choice (Resend or Brevo). Build both.
- Real values for the ASSUMED defaults (limits, quota, retention).
- Whether inbound should also support a Brevo or Resend inbound route later (not needed now).
- Owner to confirm the Cloudflare Email Routing and Workers limits at deployment time, since they change.


### P1/P2 rich-content implementation note

Migration `0005_rich_content.sql` adds `body_format`, `quoted_html`, `render_notes`, `snippet`, sanitizer versioning, attachment CID/disposition/blocked metadata, and distinct outbox Cc/Bcc arrays. The backend parses MIME recursively (including opaque `message/rfc822` attachments), sanitises inbound and client-supplied HTML using the allow-list policy at `shared/mail-rich/policy/mail-html-policy.json`, and stores a mirrored backend policy JSON checked by a unit test. Attachment downloads use the original safe filename in the signed response; blocked placeholders cannot be downloaded. Replies/forwards are represented by server-built opaque quoted HTML; forward attachments are copied to independent storage objects. `GET /mail/messages/{id}/original` provides a short-lived link to the original inbound or stored sent `.eml` when available.

The shared TypeScript sanitiser/viewer and common core helpers are authored under `shared/mail-rich/`; run `node scripts/sync-mail-rich.mjs` to regenerate the committed admin/nurse mirrors. The current implementation now includes the lazy TipTap composer (formatting, bounded tables, safe paste, quoted-message separation), app-specific UI-kit adapters, shared uploader/attachment list/viewer in both admin and nurse, offline nurse drafts, external-send review dialogs, scanner queue integration, SMTP/API provider adapters and delivery-event timelines. These additions are documented in `IMPLEMENTATION_HANDOVER.md` at the project delivery root and `docs/MAIL_RICH_P1_P2_HANDOVER.md`. Tests are authored but not executed in this handover. Browser, bundle, database migration, storage/CORS and provider acceptance remain owner-side checks.
