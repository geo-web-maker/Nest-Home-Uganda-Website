# Nest remaining implementation and backend sync report

**Prepared:** 27 November 2026  
**Scope:** Complete the previously deferred cross-app work, implement the agreed automatic-SSO controls, and regenerate the Multi-Site-Hosting Nest backend from the standalone Nest source.

## 1. Overall result

The remaining source changes have been applied to the standalone Nest project and the generated backend in Multi-Site-Hosting has been regenerated and checked against it.

The implementation preserves the agreed operating model:

- Switching between Admin and Nurse is always initiated by an explicit user action.
- Automatic SSO is disabled by default. There is no background launch, unsolicited redirect, automatic sign-in after sign-out, or sharing of refresh tokens between apps.
- A deliberate app-switch or login-screen “Continue with the other app” action can request automatic-mode handoff only when the global master, Superadmin per-user permission, the user's own profile preference, and account-active checks all pass.
- When automatic SSO is not permitted, the manual, one-time handoff remains available.

The implementation work is applied, but this is **not a production validation certificate**. The database-backed test suite, frontend build, APK build, live migration, and real-device acceptance still need to be completed in the target CI/deployment environment.

## 2. Three phases applied

### Phase 1 — Access and data-integrity safeguards

- Enabled the server-side Admin-app access gate using a central capability policy. The Admin frontend also checks `/auth/app-access` before rendering the protected shell and fails closed if that check cannot be completed.
- Nurse-app access requires the `field:use` scope and an active Nurse profile (or the permitted profile-provisioning path). Superadmin does not automatically bypass the Nurse-profile check.
- Preserved the safe profile-provisioning rule: a supervisor relationship is not invented. `supervisor_id` remains unset until a real validated assignment is made.
- Added case-insensitive staff-number conflict handling in the Nurse profile service.
- Added the read-only staff-number duplicate audit and the care-database migration that creates a case-insensitive unique partial index only after the duplicate audit is clear. The migration aborts rather than changing or deleting existing records if duplicates are found.

**Important Admin Mail impact:** the Admin-app gate does not treat Nurse-only scopes (`field:use`, `sos:send`) or `mail:use` by itself as an Admin capability. A user with only those scopes can continue to use the Nurse app but will be blocked from the Admin shell, including Admin Mail/App Center. Check existing account scope assignments and grant an appropriate Admin capability to people who are meant to use the Admin mailbox. This is an access-policy effect and must be reviewed before rollout.

### Phase 2 — Cross-app switching and automatic-SSO controls

- Added automatic SSO preference controls to both Admin and Nurse profile screens, with a warning explaining the security implications and the default-off behaviour.
- Added a Superadmin **Cross-App Authentication** page at `/cross-app-auth` with a master switch and searchable per-user permission controls.
- Kept two separate per-user fields: `auto_sso_enabled` is the user's own preference; `auto_sso_allowed` is the Superadmin's permission. A user cannot override a Superadmin denial.
- Effective automatic SSO requires all of the following:
  1. Global master switch ON.
  2. Superadmin has allowed that user.
  3. User has opted in through their profile.
  4. User account is active.
- The backend checks the automatic-SSO policy at both handoff issuance and redemption. If an administrator disables permission after a one-time code is issued, redemption is rejected.
- Superadmin write endpoints require a verified TOTP session and re-check the current active Superadmin role in the database. Changes to the master, per-user permission, and user preference are audited.
- The private master setting is not exposed through the generic settings catalogue.
- Added explicit native pull/request-response handoff in both app directions. The requester retains a PKCE verifier; the source app returns a short-lived one-time code. App switching is still triggered by a user action.
- Android launch handling is limited to configured first-party package IDs and the expected app URL schemes. The Android override scripts declare the corresponding package visibility and deep-link intent filters.
- Kept the native pull controls visible in the supplied build examples (`VITE_SHOW_PULL_SSO=true`); those are manual actions, not automatic login.
- Pending Nurse outbox records/photos are preserved for a same-account handoff. Handoffs with unverified or different identity are blocked while pending Nurse data exists.

### Phase 3 — Migrations, verification and release preparation

- Added main-database migration `0021_default_auto_sso_disabled`, which sets missing user opt-in and Superadmin permission fields to `false` without overwriting a pre-existing value.
- Added care-database migration `0020_unique_nurse_staff_numbers`, with duplicate detection and abort-on-duplicates behaviour.
- Added a read-only preflight script: `scripts/audit_staff_numbers.py`.
- Fixed the Admin package lockfile so `@capacitor/app` is consistently declared and locked at `7.0.1`.
- Regenerated the Multi-Site-Hosting `projects/nest` backend from the standalone `backend/app` source using the repository's adoption workflow, restored host-owned files, and reapplied the documented mounting patch.
- Updated the host sync notes and release instructions.

## 3. Automatic SSO controls and API

User endpoints:

- `GET /api/v1/auth/auto-sso`
- `PATCH /api/v1/auth/auto-sso`

Superadmin endpoints:

- `GET /api/v1/admin/security/auto-sso`
- `PATCH /api/v1/admin/security/auto-sso/master`
- `PATCH /api/v1/admin/security/auto-sso/users/{user_id}`

The profile setting is not sufficient by itself to enable automatic SSO. Superadmin permission and the global master switch are independently enforced by the backend. Existing sessions do not bypass the checks on handoff redemption.

## 4. Database preflight and deployment

Before deploying the care unique-index migration, run the read-only audit from the standalone repository root using fish:

```fish
set -x PYTHONPATH backend
python scripts/audit_staff_numbers.py
```

If duplicates are reported, use the actual staff register to resolve them before deploying. Do not guess, merge, or delete nurse identities merely to satisfy the index. The migration is designed to fail without modifying those records if duplicates remain.

The app startup migration runner includes `0020_unique_nurse_staff_numbers` in the care-database migration set. Migration `0021_default_auto_sso_disabled` is applied to the main database. The care database must remain separate from the public/main database as required by the existing migration runner.

Configure these backend settings for the real deployment:

- `NEST_ADMIN_URL`
- `NEST_NURSE_FRONTEND_URL`
- `NEST_HANDOFF_ENABLED=true`
- `NEST_HANDOFF_CODE_SECONDS` (the example is 60 seconds)
- `NEST_ANDROID_PACKAGE_ADMIN`
- `NEST_ANDROID_PACKAGE_NURSE`

Configure the frontend build-time values:

- `VITE_ADMIN_APP_URL`
- `VITE_NURSE_APP_URL`
- `VITE_SHOW_PULL_SSO=true` to show explicit login-screen pull actions
- `VITE_ADMIN_ANDROID_PACKAGE`
- `VITE_NURSE_ANDROID_PACKAGE`

The example Android package IDs are not proof of the IDs in the already-released APKs. Verify package IDs, URL schemes, deep links, and app origins against the actual Android artifacts before release. Replace any `.example.invalid` or placeholder host values with the real deployment origins.

## 5. Verification results

### Passed in this environment

- Python `compileall` over standalone backend app, migrations, tests, and the staff-number audit script.
- Python `compileall` over the generated Multi-Site-Hosting `projects/nest` backend.
- Multi-Site-Hosting `scripts/check_nest_sync.py`: **In sync.**
- Admin shared translation/source-copy check: **117 files across 10 source groups match.**
- Android override Node tests: **12 passed, 0 failed.**
- Node syntax checks for the Android override scripts and web-bundle helper.
- Admin/Nurse app-switch helper source files are byte-identical.
- The standalone and generated-hosting copies of migrations `0020` and `0021` are byte-identical.
- Admin `package.json` and `package-lock.json` agree on `@capacitor/app` `7.0.1`.

### Not completed; do not interpret as passing

- Targeted pytest suite could not load because this runtime does not have `beanie` installed (`ModuleNotFoundError: No module named 'beanie'`). Mongo-backed handoff, app-access, migration and Nurse provisioning tests therefore did not execute.
- No test MongoDB replica set was available. The staff-number audit was not run against a live or staging database, and no database migration was executed.
- Admin `npm ci` did not finish within the available command time limit. The environment runs Node `22.16.0`; several locked dependencies require Node `22.19.0` or `22.22.2+`. Admin/Nurse frontend type-checks, unit tests, lint and production builds therefore remain unverified. Use Node `22.22.2+` (or a compatible supported Node 24 release) and rerun clean installs and builds in CI.
- No Gradle Android project was generated in this workspace, so no APK/AAB build or emulator/physical-device handoff test was run.
- No live deployment, production configuration, provider verification, or production database migration was performed.

## 6. Release blockers / operator checks

1. Review the Admin-app scope gate against real user roles, especially users who need Mail but currently have only `mail:use` and Nurse scopes.
2. Run the read-only staff-number preflight against the actual care database. Resolve any duplicates from authoritative staff records before migration `0020` is allowed to run.
3. Set and verify actual frontend origins and Android package IDs; do not ship the example values unverified.
4. Run the Mongo-backed pytest suite with the project's declared backend dependencies and a replica-set test MongoDB.
5. Run clean Admin and Nurse dependency installation, type-check, frontend tests, lint and production builds under a supported Node version.
6. Generate Android projects, build APK/AAB artifacts, and test Admin-to-Nurse and Nurse-to-Admin manual pull/push on real devices, including pending offline records, sign-out, expired code, revoked permission and master-switch-off scenarios.
7. Verify Superadmin TOTP and audit records in staging before enabling the master SSO switch. Keep it OFF for initial deployment.

## 7. Source-of-truth and sync notes

- Standalone Nest backend is the source of truth.
- Multi-Site-Hosting `projects/nest` is generated from standalone `backend/app` using `scripts/adopt_backend.py`, then the documented mounting patch is applied.
- Host-owned documentation/tests were preserved. The host-specific `projects/nest/tests` are not a replacement for the standalone backend test suite.
- No Git commits were created because the provided source archives do not contain `.git` metadata.

**Status:** implementation and source synchronization applied; static checks passed; runtime, database, frontend-build, and Android release verification remain outstanding.
