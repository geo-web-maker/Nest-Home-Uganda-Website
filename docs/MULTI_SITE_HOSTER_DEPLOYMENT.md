# Deploying Nest through Multi-Site Hosting

Nest is mounted by the Multi-Site Hoster at `/nest` (`projects/nest/config.py`). The browser and native clients append `/api/v1` to `VITE_API_URL`, so configure the Admin and Nurse frontend builds with:

```dotenv
VITE_API_URL=https://<your-hoster-domain>/nest
```

Do not omit `/nest`, and do not add a trailing slash. Otherwise requests may go to the Hoster root (`/api/v1`) instead of the Nest API (`/nest/api/v1`).

On the Hoster service, set `ENABLED_APPS=monitor,nest`, configure the `NEST_MONGODB_*` and `NEST_CARE_MONGODB_*` values, and set `NEST_PG_URL` when using the dedicated mail database. The Render blueprint sets `NEST_MAIL_MIGRATIONS_REQUIRED=true`; configure the same value on other hosting providers when mail is a required production feature.

Set `NEST_CORS_ORIGINS` to the exact Admin and Nurse frontend origins. The Nest deployment expects HTTPS when cross-site cookies are enabled (`NEST_COOKIE_SAMESITE=none`) and should run behind a trusted proxy with `NEST_TRUST_PROXY=true` only when the hosting provider supplies the forwarded headers.

The Nest backend applies pending main and care MongoDB migrations from its FastAPI lifespan before Beanie initialisation and before it accepts API traffic. Mongo migrations use a distributed lock for overlapping instances. When `NEST_PG_URL` is configured, the mail database connection applies pending SQL migrations before startup completes; with `NEST_MAIL_MIGRATIONS_REQUIRED=true`, a failed connection or migration prevents the Nest instance from starting.

The Admin Audit History screen calls `/api/v1/admin/activity`; the Nurse Activity screen calls `/api/v1/field/audit`. Through the Hoster, these resolve to `/nest/api/v1/admin/activity` and `/nest/api/v1/field/audit`.
