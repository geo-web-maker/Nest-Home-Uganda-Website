# Environment variables for the Nurse Module

Values are owner-supplied at deployment time. Never commit secrets or production `.env` files. Names below are a working inventory; keep it synchronized with `Settings`, `.env.example`, and deployment secrets as each work order lands.

## Existing application

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Existing primary MongoDB connection string. |
| `MONGODB_DB` | Existing primary database name. |
| `SECRET_KEY` | JWT signing secret. |
| `VITE_API_URL` | API origin used by frontends and native apps at build time. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_KEY`, `S3_SECRET` | Existing S3-compatible object storage. |

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
