# Northflank deployment checklist

This is an owner checklist, not a claim that a Northflank project exists. The project and service names have not been supplied.

## Topology

- Keep the existing public frontend where it is hosted today unless the owner chooses to move it.
- Deploy the existing FastAPI backend as a Northflank service only after the owner creates the project and confirms its service name.
- Keep the main site database and care database external and private. Configure `MONGODB_URI` plus `MONGODB_DB`, and `CARE_MONGODB_URI` plus `CARE_MONGODB_DB`. The care database URI may point to a separate cluster. The care database name must differ from the main database name.
- Do not allow GitHub-hosted runners to connect to either private database. The runner runs tests against its own CI MongoDB service only.
- The current health path is `/api/v1/health`. The public API domain is owner-supplied and has not been invented here.

## Before first deploy

1. Add backend service variables and secrets from `.env.example` in the provider secret store. Never paste secrets into Git.
2. Set `APP_ENV=production`, `MONGODB_URI`, `MONGODB_DB`, `CARE_MONGODB_URI`, `CARE_MONGODB_DB`, `SECRET_KEY`, `IP_HASH_SALT`, `CORS_ORIGINS`, and `FRONTEND_URL`.
3. Confirm both MongoDB users have least-privilege access and TLS is enabled. The care account must not have access to unrelated production databases.
4. Run `python -m app.migrate` from a controlled release job or owner-controlled host that can reach both databases. Main-site migrations run against the main database; care migrations run against the care database.
5. Confirm `/api/v1/health` reports both databases healthy. The endpoint returns status metadata only.
6. Configure owner-run encrypted backups for both databases to Backblaze B2 following `docs/BACKUP_AND_RECOVERY_B2.md`. GitHub Actions does not run database dumps.
7. Configure Cloudinary, SMS, and push credentials only after the owner creates those accounts and provides real values. Keep `PUSH_SENDER=fake` until FCM setup is complete.
8. Do not enable care modules until the readiness checklist is clear and the restore drill has been completed.

## Private database connectivity decision

Selected option B: GitHub-hosted runners have no direct database access. Run production backup and restore commands only on an owner-controlled host or private runner that has network access to the databases. Do not place production database URIs in GitHub Actions secrets for hosted runners.

## Rollback

- Keep the previous backend image available until the new deployment passes smoke checks.
- Migrations are additive and include `down` functions, but do not automatically run destructive downgrades in production. Restore from a verified backup if rollback requires data restoration.
- If either database is unhealthy, stop enabling care modules and follow the recovery runbook.
