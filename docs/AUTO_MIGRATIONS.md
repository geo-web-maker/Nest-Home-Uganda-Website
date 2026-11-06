# Automatic database migrations

The backend applies schema migrations as part of its FastAPI lifespan. This is the
single deployment path for the Docker image and for hosts that launch Uvicorn directly.
The server does not begin accepting HTTP traffic until required startup migrations finish.

## What runs

1. Main-site MongoDB migrations from `backend/migrations/`.
2. Care MongoDB migrations against the configured care database.
3. Mail PostgreSQL migrations from `backend/mail_migrations/` when `NEST_PG_URL` is set.

Each MongoDB migration is recorded in the database's `migrations` collection. A shared
lock document serializes migration execution across replicas during rolling deployments;
the lock lease expires after five minutes if a process crashes and is refreshed every
minute while migrations are active. Mail PostgreSQL migrations use the existing transaction-scoped advisory lock
and `schema_migrations` table.

## Failure behavior

- A configured MongoDB migration failure stops application startup. The deployment should
  remain unhealthy instead of serving requests against an outdated primary schema.
- Mail migrations are attempted whenever `NEST_PG_URL` is configured.
- Set `MAIL_MIGRATIONS_REQUIRED=true` to make a configured mail database a startup
  requirement. This is enabled in `render.yaml`. If the mail database is unavailable or a
  mail SQL migration fails, the new application instance does not start.
- With `MAIL_MIGRATIONS_REQUIRED=false` (the default outside the Render blueprint), the
  main care API may start while mail is unavailable. The health hook retries the mail
  connection and pending migrations in the background.
- If a migration fails partway through, the app does not mark it as complete. Fix the cause
  and redeploy; migration scripts must remain safe to retry and must be idempotent.

## Manual use

Normal deployment requires no manual migration step. For local or controlled maintenance,
run this from `backend/` with the same database environment variables as the application:

```bash
python -m app.migrate
```

This command applies main-site and care MongoDB migrations and, when `NEST_PG_URL` is set,
mail PostgreSQL migrations too. It is safe to repeat.

## Deployment ordering

For a release containing backend schema changes, deploy the backend first. The platform
starts a new instance, the startup lifecycle applies pending migrations, and only then does
Uvicorn accept traffic. Deploy dependent Admin and Nurse frontend changes after the backend
is healthy. Use backward-compatible, expand/contract migrations when an old and new app
instance may overlap during a rolling deploy.
