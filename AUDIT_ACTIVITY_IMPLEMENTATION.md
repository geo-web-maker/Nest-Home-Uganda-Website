# Audit & System Activity Centre

## What is implemented

The audit log is a shared backend record stream used by the Admin Activity screen and the Nurse **My activity & errors** screen.

### Event coverage

- Existing admin and care-management writes continue to write audit records. Care operation and care admin audit helpers now attach the authenticated actor ID and authorising scope where available.
- Nurse visit check-in/check-out, visit-note creation and successful photo completion are attributable to the nurse account. Note text, photo bytes and clinical payloads are not copied into audit metadata.
- The API request middleware records HTTP failures (4xx and 5xx) with a request ID, route template, method, status, source and severity. It does not record request bodies, query strings, bearer tokens or raw exception text.
- Scheduler failures for reminders, retention, abandoned-photo cleanup, care alerts, SOS escalation, timesheet generation, mail outbox, mail scanning, mail housekeeping, mail retention and mail quota checks are written as system events. Scheduler events are still logged if audit persistence itself fails.
- System events without a human actor are labelled as system/scheduler/integration events rather than being attributed to a nurse or administrator.

## User interfaces

### Admin

The existing Admin **Care → Audit history** screen uses the existing shared `PageHeader`, `FilterBar`, `Field`, `Button`, `CareTable`, `CareSheet` and `Notice` components. It supports filters for actor, entity, date range, severity, event type, source and outcome. The Inspect action shows the full event record, including request correlation ID and HTTP status when present.

Access remains protected by the existing `activity:read` scope. Superadmin access continues to follow the existing scope bypass; the superadmin bootstrap and role model are not changed.

### Nurse

The Nurse app has an **Activity** navigation entry and `/audit` route. It uses the existing shared Nurse `Card`, `Chip` and `PillButton` components. The API returns only events associated with the signed-in nurse plus sanitised critical/error events from system, scheduler and integration sources. It does not expose another nurse's activity history.

## Data model and retention

`AuditLog` now carries structured `event_type`, `severity`, `source`, `outcome`, `message`, `request_id`, `endpoint`, `http_status` and optional `site_id` fields. Existing records remain readable because every new field has a backwards-compatible default.

The existing 730-day MongoDB TTL retention policy remains in force. Migration `0015_audit_event_indexes.py` adds indexes for event type, severity, source and request ID. **No manual migration command is required during deployment.** The FastAPI startup lifecycle applies pending main-site and care MongoDB migrations before initialising Beanie or accepting traffic. When `NEST_PG_URL` is configured, the same startup lifecycle also applies pending mail SQL migrations. MongoDB migrations use a shared database lock so overlapping application instances do not execute the same migration concurrently. The `python -m app.migrate` command remains available for controlled manual/local use and now also applies mail SQL migrations when `NEST_PG_URL` is set.

The Render blueprint sets `MAIL_MIGRATIONS_REQUIRED=true`: when a mail database URL is configured, a connection or SQL migration failure stops the new instance from starting, so the deployment cannot silently run against an outdated mail schema. Other deployments default to optional mail startup (`MAIL_MIGRATIONS_REQUIRED=false`) unless they explicitly enable strict mail migration gating.

There are no new audit mutation endpoints. The application exposes read-only views; existing retention is automatic. This is append-only at the application/API level, not a cryptographic external WORM archive. Database operators with direct database privileges remain outside that guarantee.

## Privacy and security

- All exposed audit-read APIs require a valid, user-bound TOTP session in addition to the existing authentication and permission scopes. This includes Admin activity, Nurse activity, mail audit, SOS drill audit, visit detail/audit responses and activity CSV/XLSX exports. The backend checks the signed HttpOnly `mail_totp` cookie and confirms the user's authenticator enrollment still exists; resetting TOTP invalidates old audit sessions. Superadmins are also required to verify TOTP.
- The Admin shared-component `TotpGate` protects activity history, the care audit screen, visit review, SOS history/drills and activity exports. The Nurse Activity screen verifies TOTP before it sends the audit request. Backend checks remain authoritative if a client bypasses the UI.
- TOTP enrollment is stored in the existing mail PostgreSQL database. If that database cannot be checked, audit APIs fail closed with HTTP 503 and return no audit data.
- Never write passwords, access/refresh tokens, TOTP secrets, full clinical notes, medical record contents, attachment bytes or message bodies into audit metadata.
- API error entries store route templates instead of concrete path values and omit query strings and request bodies.
- Request IDs connect the user-visible event to server-side logs. Stack traces remain in protected server logs, not in user-facing audit rows.
- Nurse history is server-filtered by the authenticated principal. Admin history requires `activity:read`.
- Audit persistence is fail-open for request handling and scheduler work: an audit database failure is logged but does not convert a successful business operation into a failed one.

## Verification status

- Python source and migration syntax compilation passed with `python -m compileall`.
- The backend pytest suite could not be run in this environment because the `beanie` dependency is not installed (`ModuleNotFoundError: beanie`).
- Frontend typecheck/build could not be completed because project dependencies are not installed (`react`, Vite, Vitest and related type packages are missing). Run `npm ci && npm test && npm run typecheck && npm run build` in both `frontend/` and `nurse/` before deployment.
- The project should be deployed backend-first, then the Admin/Nurse frontend builds. Existing clients remain compatible with the expanded activity response.
