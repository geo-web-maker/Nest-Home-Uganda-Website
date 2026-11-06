# Environment variables for the Nurse Module

Values are owner-supplied at deployment time. Never commit secrets or production `.env` files. Names below are a working inventory; keep it synchronized with `Settings`, `.env.example`, and deployment secrets as each work order lands.

## Existing application

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Existing primary MongoDB connection string. |
| `MONGODB_DB` | Existing primary database name. |
| `SECRET_KEY` | JWT signing secret. |
| `VITE_API_URL` | Backend base URL used by the Admin, Nurse and native builds. For Multi-Site Hosting, use `https://<hoster-domain>/nest` (no trailing slash), because the clients append `/api/v1`. |
| `VITE_SITE_URL` | Public site origin (canonical and og:url). Set to the new domain; no domain is hardcoded. |
| `FRONTEND_URL` | Public site origin used by the backend for links in emails and SMS. Set to the new domain. |
| `SITE_REBUILD_HOOK_URL` | Optional Cloudflare Pages or Vercel deploy hook URL. The backend POSTs to it after an admin edits public content so the pre-rendered pages are rebuilt. Secret; empty disables it. |
| `SITE_REBUILD_DEBOUNCE_SECONDS` | Quiet time after the last public edit before the hook is called (default 300). Several edits in that window cause one build. |
| `BUSINESS_EMAIL` | Default public contact email (seeds `business.email`). Set to an address on the new domain; editable later in admin Settings. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_KEY`, `S3_SECRET` | Existing S3-compatible object storage. |
| `S3_BUCKET_MAIL` | Dedicated private R2 bucket for mail attachments and raw inbound messages. |
| `NEST_PG_URL` | Required Neon Postgres pooled URL for the mail data plane; keep `sslmode=require`. |
| `MAIL_MIGRATIONS_REQUIRED` | When `true`, a configured mail database must connect and apply pending SQL migrations before the API starts; recommended for production deployments with mail enabled. Defaults to `false`. |
| `NEST_MAIL_SECRET_KEY` | Required encryption key for secrets stored in `mail_settings`; environment-only and never commit it. |
| `NEST_MAIL_DOMAIN` | Optional bootstrap fallback for the mail root domain; saved settings take precedence. |
| `NEST_MAIL_PROVIDER` | Optional bootstrap fallback for `console`, `resend` or `brevo` (default `console`). |
| `NEST_MAIL_API_KEY` | Optional bootstrap provider API key; secret and write-only when shown in settings. |
| `NEST_MAIL_PROVIDER_WEBHOOK_SECRET` | Optional bootstrap Resend Svix/Brevo webhook signing secret; stored encrypted if saved in settings. |
| `NEST_MAIL_INBOUND_WEBHOOK_SECRET` | Optional bootstrap HMAC secret shared with the Cloudflare Email Worker; stored encrypted if saved in settings. |
| `BACKUP_PASSPHRASE`, `B2_ENDPOINT`, `B2_KEY`, `B2_SECRET`, `BACKUP_BUCKET` | Owner-run encrypted mail database backups to Backblaze B2; never add to CI. |
| `MAIL_BACKUP_ATTACHMENTS_BUCKET` | Second B2 bucket for the owner-run mail attachment mirror. |

## Nurse/care configuration

All settings must be added to the Pydantic settings model and `.env.example` with an empty secret value or documented default. Care thresholds and user-facing text are configurable; do not hard-code customer legal or clinical wording.

| Variable | Purpose |
| --- | --- |
| `CARE_MONGODB_URI` | Optional separate connection string for the second external care database, if the deployment keeps the care data in a separate database/cluster. |
| `CARE_MONGODB_DB` | Care database name, owner-supplied. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name. |
| `CLOUDINARY_API_KEY` | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Cloudinary signing secret. |
| `PUSH_SENDER` | `fake` or `fcm`, defaults to `fake`. |
| `FCM_PROJECT_ID` | Firebase project ID. |
| `FCM_SERVICE_ACCOUNT_JSON` | Service-account JSON secret; never log. |
| `FCM_SERVICE_ACCOUNT_JSON_B64` | Optional base64 form of the service-account JSON. |
| `PUSH_TTL_CRITICAL_SECONDS` | Critical push TTL. |
| `PUSH_TTL_NORMAL_SECONDS` | Normal push TTL. |
| `PUSH_CHANNEL_CRITICAL` | Android critical notification channel. |
| `PUSH_CHANNEL_NORMAL` | Android normal notification channel. |
| `CAP_APP_ID_NURSE` | Nurse Android application ID. |
| `CAP_APP_ID_ADMIN` | Admin Android application ID. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_PROJECT_NUMBER`, `FIREBASE_API_KEY`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_APP_ID_NURSE`, `FIREBASE_APP_ID_ADMIN` | Build-time Firebase registration values; GitHub secrets/variables only. |
| `B2_ENDPOINT` | Backblaze B2 S3-compatible endpoint. |
| `B2_KEY` | B2 application key ID. |
| `B2_SECRET` | B2 application key secret. |
| `BACKUP_BUCKET` | B2 bucket for encrypted backups. |
| `BACKUP_PASSPHRASE` | Secret passphrase for backup encryption. Store a recovery copy offline. |
| `BACKUP_SOURCE_URI_PRIMARY` | Optional owner-run backup source URI for the primary database. Do not expose it to GitHub-hosted runners. |
| `BACKUP_SOURCE_URI_CARE` | Optional owner-run backup source URI for the care database. Do not expose it to GitHub-hosted runners. |
| `BACKUP_RESTORE_URI` | Owner-controlled isolated restore target URI. Never point a restore drill at production. |

## Two-database rule

The owner must identify both MongoDB databases in the backup inventory. The backup script takes explicit database labels and source URIs and produces independent encrypted artifacts. Never assume the two databases share a cluster or credentials. The owner-run process must execute from a trusted host that can reach each private database. GitHub-hosted runners are not granted direct database connectivity under the selected decision.


## New care settings (database settings, not secrets)

These values are organisation-managed care settings rather than environment secrets. They are listed here to keep deployment and readiness reviews explicit:

- `visits.adhoc_enabled` and `visits.adhoc_default_minutes`: control unscheduled visits. The nurse-specific override takes precedence over the organisation setting.
- `retention.coordinates_months`, `retention.photos_months`, and `retention.sos_months`: retention periods must be explicitly reviewed and set by the owner. A value of zero disables that automated purge/redaction path; it must not be interpreted as a recommended retention period.
- `retention.requests_months`: the existing public-enquiry retention job remains a separate path; align it with the organisation's approved policy before relying on the care retention settings for it.

No retention period is a legal recommendation. Obtain the organisation's approved policy before enabling automated deletion.

## Mail module configuration

The mail system uses a separate Neon Postgres database and the existing S3-compatible storage adapter with a dedicated private mail bucket. The mail feature flag defaults to `false`; configuring `NEST_PG_URL` alone does not expose mail to end users. All editable mail values are stored in `mail_settings` and resolve in this order: saved database value, matching `NEST_MAIL_*` environment variable, then the built-in default. `NEST_PG_URL` and `NEST_MAIL_SECRET_KEY` are environment-only. Secrets saved through the settings API are encrypted and are returned only as `set` / `not set`.

Do not add `NEST_PG_URL`, `NEST_MAIL_SECRET_KEY`, provider API keys, or real bucket credentials to GitHub Actions. Database access and backup/restore scripts are owner-run.
