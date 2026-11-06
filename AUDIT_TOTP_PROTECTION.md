# Audit access: mandatory TOTP protection

The deployed Nest backend in `projects/nest` is the authoritative API for both the Admin and Nurse frontends. Audit-read APIs enforce TOTP on the server; the frontend gates are an additional user experience and do not replace the backend checks.

## Protected API reads

All of the following require the authenticated access token **and** a valid `mail_totp` HttpOnly cookie:

- `GET /api/v1/admin/activity` — platform/admin audit activity.
- `GET /api/v1/field/audit` — the signed-in nurse's own activity and permitted system failures.
- `GET /api/v1/mail/audit` — mail audit history.
- `GET /api/v1/admin/care/sos/drills` — recorded SOS drill audit records.
- `GET /api/v1/admin/care/visits/{visit_id}` — visit review details, including the audit entries returned with the visit.
- `GET /api/v1/admin/reports/export?type=activity` — activity-log exports in CSV or XLSX format.

Other report types and ordinary non-audit care screens retain their existing access-scope rules.

## TOTP session behaviour

- The user enrolls an authenticator through the existing `/mail/totp/*` flow.
- A successful code verification issues the signed, HttpOnly `mail_totp` cookie for up to 12 hours, using the application's existing cookie security settings.
- The signature is checked server-side, the cookie is bound to the authenticated user ID, and expiry is enforced.
- The backend checks that the user's TOTP enrollment still exists for every protected audit read. Resetting/removing TOTP therefore invalidates an already-issued audit cookie.
- Missing, invalid, expired or stale sessions are rejected. If the TOTP enrollment database cannot be checked, the API fails closed with HTTP 503; it does not return audit data.
- Superadmins are not exempt from TOTP. Existing role, site-reach and permission scopes continue to apply in addition to TOTP.

TOTP status/setup requires the existing mail/PostgreSQL database connection (`NEST_PG_URL`) because the authenticator enrollment and recovery-code records are stored there. Keep the existing mail database migration enabled during deployment.

## Frontend gates

- Admin activity history uses the shared `TotpGate` component and existing Admin shared UI components.
- The Admin care audit screen, visit-review details, and SOS history/drill records are gated before their protected data requests run.
- Activity CSV/XLSX export requires the same TOTP gate; other report exports do not.
- Nurse activity uses the existing shared Nurse `Card`, `Chip` and `PillButton` components and does not request `/field/audit` until TOTP status reports a verified session.
- Initial enrollment displays one-time recovery codes before the protected content is released.

The backend remains the security boundary: manually calling an endpoint, bypassing the frontend, or using another client does not bypass TOTP.
