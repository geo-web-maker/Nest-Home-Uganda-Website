# Nest cross-app authentication — release and test notes

## Agreed operating model

- Switching between Admin and Nurse remains an explicit action by the person using the app.
- Automatic SSO is disabled by default at every level. It is not triggered by an app install, background task, sign-out, or unsolicited redirect.
- The signed-in user's explicit **Open Nurse app / Open Admin app** action, or **Continue with the other app** action on a login screen, may use automatic handoff only when all controls are enabled.
- Effective automatic SSO requires all four conditions: the global Superadmin master switch is ON, Superadmin has allowed that account, the user has opted in on their own profile, and the account is active. The backend checks the policy both when issuing and redeeming an automatic-mode handoff.
- Manual one-time handoff remains available if automatic SSO is disabled. Sessions remain separate and refresh tokens are not shared between apps.

## Settings and endpoints

- User preference: `GET/PATCH /api/v1/auth/auto-sso` (available in the Admin and Nurse profile pages).
- Superadmin control page: `/cross-app-auth` in the Admin app.
- Superadmin API: `GET /api/v1/admin/security/auto-sso`, `PATCH /master`, and `PATCH /users/{user_id}`. The write routes require a verified TOTP session and re-check the account's current active Superadmin role in MongoDB.
- The per-user Superadmin flag (`auto_sso_allowed`) is separate from the user's preference (`auto_sso_enabled`). Users cannot override a Superadmin denial.
- All changes are audited. The generic settings editor intentionally does not expose the private `security` setting group.

## Required deployment configuration

Backend environment variables must point to the real app origins and packages:

- `NEST_ADMIN_URL`
- `NEST_NURSE_FRONTEND_URL`
- `NEST_HANDOFF_ENABLED=true`
- `NEST_HANDOFF_CODE_SECONDS=60` (or another short duration selected by the operator)
- `NEST_ANDROID_PACKAGE_ADMIN` and `NEST_ANDROID_PACKAGE_NURSE`

Frontend build-time variables:

- `VITE_ADMIN_APP_URL`
- `VITE_NURSE_APP_URL`
- `VITE_SHOW_PULL_SSO=true` to display the explicit login-screen pull actions. Set to `false` to hide those links without disabling server-side handoff.
- `VITE_ADMIN_ANDROID_PACKAGE` and `VITE_NURSE_ANDROID_PACKAGE` must match the actual installed APK package IDs.

The example package IDs are placeholders until verified against the actual Android builds. Do not assume they match a previously released APK.

## Database migrations and staff-number preflight

- Main database migration `0021_default_auto_sso_disabled` backfills both the user opt-in and Superadmin per-user permission as false. It preserves any already-present user preference.
- Care database migration `0020_unique_nurse_staff_numbers` audits duplicate staff numbers and creates a case-insensitive unique partial index only if the string values are unique.
- Before deployment, run from the standalone repository root:

  ```fish
  set -x PYTHONPATH backend
  python scripts/audit_staff_numbers.py
  ```

  The script is read-only. It exits non-zero when duplicate groups are found and reports the affected profile/user IDs. Resolve those records using the real staff register before deploying; do not guess, merge, or delete identities to make the migration pass.
- Startup migrations are automatic in the configured app lifespan. If migration `0020` finds duplicates, the care migration fails safely and must be resolved before retrying deployment.

## Native pull and offline-work protections

- Native pull uses a 43-character PKCE challenge; the requesting app retains the verifier and the source app returns a short-lived one-time code.
- The Android plugin launches only the configured first-party package and validates the `nhc-admin` / `nhc-nurse` scheme pair.
- Pending nurse outbox records/photos are preserved for same-account handoff. An unverified or different-account handoff is blocked while pending nurse data exists.
- Confirm the package IDs, deep-link registration, app association and package visibility on actual Android devices before release.

## Verification recorded for this work

Passed in the available environment:

- Python `compileall` over backend application, migrations and tests.
- Android override JavaScript tests: 12/12.
- Admin shared-copy check: 117 files across 10 source groups match.
- Admin/Nurse shared app-switch helpers are byte-identical.
- Backend-to-hosting source parity check: `In sync.`

Not completed here:

- Mongo-backed pytest tests, because `beanie` is not installed and no test MongoDB replica set is configured.
- Browser frontend type-check/build, because the package installation did not complete in this environment.
- Java/Gradle APK builds and real Android device tests.
- Live database preflight/migrations and production provider verification.

These checks must be completed in CI or the deployment environment before production rollout.

## Admin-app access policy impact

The Admin-app capability gate intentionally does not treat Nurse-only scopes (`field:use`, `sos:send`) or `mail:use` by itself as an Admin capability. Accounts with only those scopes can use the Nurse app but cannot enter the Admin shell, including Admin Mail/App Center. Review existing role assignments before rollout and grant an appropriate Admin capability to staff who are supposed to use the Admin mailbox. See `NEST_REMAINING_IMPLEMENTATION_AND_SYNC_REPORT.md` for the complete implementation and verification record.
