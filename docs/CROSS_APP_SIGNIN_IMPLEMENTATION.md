# Cross-app sign-in and nurse-profile repair — implementation report

**Status:** implementation prepared for owner verification; not yet production-verified  
**Scope:** Nest / Bloomwell Home Care monorepo. The Northflank multi-backend archive was inspected as a deployment reference and left unchanged.

## Executive summary

The implementation covers the core of plan sections 4–9 (Part A nurse-profile repair, Part B unified app access, Part C one-time handoff backend, Part D web handoff, Part E Android launch plumbing, and Part F other-app suggestions/install entry points). It adds compatibility-preserving endpoints and fields and does not share refresh tokens between apps.

The most important defect is addressed: a stored `field:use` grant no longer leaves a user without a `NurseProfile`. Existing eligible accounts can self-heal at `/field/me`; a migration and a superadmin/TOTP repair endpoint are also included. Scope removal deactivates the nurse profile and revokes nurse devices without deactivating a dual-use admin/staff account.

This is a source implementation, not a verified release. No Python test suite, TypeScript test suite, lint, typecheck, frontend build, migration against a live database, or Android device test was run. Static checks listed below did complete successfully.

## Implemented work

### Phase 1 — nurse profile repair and dual-account safety

- Added one `ensure_nurse_profile` provisioning path and a reusable provisional staff-number generator. Automatically created profile records are marked provisional and record their source/time. The generated number format is `STF-` plus a suffix of the user ID; admins can replace it later.
- Profile creation requires an active, non-test user with the **stored** `field:use` scope. A superadmin bypass is not treated as a stored grant. The function does not grant scopes, copy name/email, change passwords, send invites, or touch sessions.
- Added self-healing for principal-owned nurse endpoints. Missing profiles are created only for eligible users; an inactive profile is not silently reactivated by lazy access.
- User invitation and permission changes now create/reactivate profiles when `field:use` is granted. Removing the scope deactivates the profile and revokes nurse device registrations; it does not deactivate the user.
- Added migration `0018_backfill_nurse_profiles.py` to backfill eligible existing users. It is idempotent, skips test/inactive/non-nurse-scope users, and logs user IDs rather than names or email addresses. It accounts for the separate care database using `CARE_MONGODB_URI` / `CARE_MONGODB_DB` when configured.
- Added a superadmin-only, TOTP-guarded repair endpoint with dry-run as the default, plus a Push Diagnostics UI action to preview and apply repairs.
- Updated nurse-roster behavior for dual accounts: details use the real `User` identity, invite/password actions return a clear conflict instead of a misleading 404, deactivation affects only the nurse profile, and removing nurse access keeps the staff/admin user. Deletion checks visit history and removes nurse devices/profile without deleting the staff identity.
- Added staff-number editing and a visible provisional-number warning. Empty staff-number input is treated as a request for automatic assignment.
- Nurse login now distinguishes an inactive profile from the generic not-a-nurse message.

### Phase 2 — unified app-access decision

- Added `auth/app_access.py` and `GET /auth/app-access` as a single server-side view of whether an account may use the admin and nurse apps.
- App eligibility is scope-based, not role-name-based. Nurse access requires a stored `field:use` grant and an active nurse profile, or an eligible account that will be provisioned on first nurse use. Admin access excludes nurse-only and universal `mail:use` scopes unless the account is a superadmin.
- `/field/me` keeps the existing `can_switch_app` and `admin_app_url` response keys, now using the shared capability rule. The existing `/admin/care/switch-app` endpoint remains in place.

### Phase 3 — one-time handoff backend

- Added the `AppHandoff` model and migration `0019_app_handoff_indexes.py` (unique code hash and TTL expiry indexes).
- Added `POST /auth/handoff` and `POST /auth/handoff/redeem` in a separate router. The server issues random codes, stores only their hashes, applies a short expiry, atomically claims each code once, checks the target app and current access again at redemption, and audits issue/reject/redeem events without logging the code.
- Pull handoff supports a PKCE-style challenge/verifier. Redeeming creates a new independent target-app session by reusing the normal session issuance logic; it does not copy the source app's rotating refresh token.
- Web redemption uses the existing cookie helper; native redemption returns the native login-shaped response. A kill switch disables handoff endpoints with 404 while leaving ordinary password login available.
- Sandbox/test handling is retained: test accounts are not auto-provisioned by the ordinary path, and the handoff path checks the sandbox setting before allowing use.

### Phase 4 — web handoff

- Added mirrored, transport-agnostic app-switch helpers in the nurse and admin apps. The helper files are byte-identical across the two apps.
- Both app entry points strip an incoming handoff fragment synchronously before session restoration or route rendering, then redeem it through the backend. The nurse side uses the existing sign-in completion path and avoids discarding pending offline work; the admin side applies a normal session body and clears user-specific cached query state on account change.
- Added public `/sso` relay routes, pull buttons on login screens, and one-tap “open the other app” actions in the relevant profile/account surfaces.
- Server-provided configured app URLs are used; arbitrary return URLs are not accepted. Handoff failures land on ordinary login with a user-facing message and are not retried in a loop.

### Phase 5 — other-app suggestions and install entry points

- Added dismissible, per-user/per-target suggestion banners with a 14-day snooze. Suggestions are only shown when the other app is allowed and its configured URL is present.
- Added cross-app rows to the App Center panels and connected the native download/install flow to the existing updater logic.
- The nurse Profile suggestion is suppressed while an active visit is present. The global SOS overlay is not explicitly wired into the suggestion component's visibility guard and must be checked during UI/device acceptance.

### Phase 6 — Android handoff plumbing

- Added `AppSwitchPlugin.java` with package/scheme allow-listing, package detection, and explicit-package launch intents.
- Updated both Android override scripts to add the other package to `<queries>`, set the private app scheme intent filter inside `MainActivity`, use `singleTask`, and preserve `android:exported="true"`.
- Registered the plugin in the shared Android web-bundle script and added an Android manifest regression test.
- Added the exact dependency `@capacitor/app` version `7.0.1` to `admin/package.json`. The admin lockfile was deliberately not fabricated; the owner must run `npm install` in `admin/` and commit the generated lockfile before CI (`npm ci`) or an APK release.
- The Java plugin and manifest behavior still need real-device checks for cold start, warm start, Android package visibility, and return-from-installer behavior.

## Added tests and coverage

Backend test files added:

- `backend/tests/test_app_access.py`
- `backend/tests/test_app_handoff.py`
- `backend/tests/test_field_me_self_heal.py`
- `backend/tests/test_nurse_profile_provisioning.py`
- `backend/tests/test_nurse_repair_endpoint.py`
- `backend/tests/test_patch_nurse_dual_account.py`
- `backend/tests/test_staff_numbers.py`
- `backend/tests/test_users_scope_grant_profile.py`

Frontend/script contract tests added:

- `nurse/src/platform/appSwitch.test.ts`
- `admin/src/admin-native/appSwitch.test.ts`
- `scripts/__tests__/cross-app-mirrors.test.mjs`
- `scripts/__tests__/apply-android-overrides.test.mjs` was extended for deep-link manifest placement.

The new tests cover the principal authorization/provisioning rules, scope grant/removal, dual-account protection, handoff hashing/claiming/expiry/PKCE/capability re-check, and the mirrored helper/manifest contracts. This is not the full test matrix in the original plan: full browser/Playwright coverage for every suggestion/snooze/boot transition, a dedicated migration integration test, and full Android device automation remain outstanding.

## Static verification performed

The following commands completed with exit status 0:

```sh
python -m compileall -q backend/app backend/migrations backend/tests
node --check scripts/apply_android_overrides.mjs
node --check scripts/apply_admin_android_overrides.mjs
node --check scripts/lib/webBundleAndroid.mjs
node --check scripts/__tests__/apply-android-overrides.test.mjs
node --check scripts/__tests__/cross-app-mirrors.test.mjs
node scripts/sync-admin-shared.mjs --check
node scripts/sync-mail-rich.mjs --check
python scripts/gen_env_docs.py --check
cmp nurse/src/platform/appSwitch.ts admin/src/admin-native/appSwitch.ts
cmp nurse/src/platform/nativeAppSwitch.ts admin/src/admin-native/nativeAppSwitch.ts
cmp nurse/src/platform/appCenter.ts admin/src/admin-native/appCenter.ts
```

`ruff` could not be run because the environment does not have the `ruff` module installed. The archive has no `node_modules` in either frontend, so npm lint/typecheck/test/build commands were not runnable here. Per the repository plan, no pytest/Vitest/Playwright tests were run and no tests are being represented as passing. A live database migration and real-provider behavior were not exercised.

## Deliberately not enabled / remaining limitations

- The optional admin-app access gate (plan D4) is not enabled. It changes visibility for existing nurse-only accounts and was explicitly marked as an owner decision.
- Optional native pull/ping-pong (plan E4) is not implemented. Native one-tap push handoff is implemented; each target APK must be opened at least once to receive the handoff.
- Optional partial unique index for `staff_number` is not added. Existing code performs uniqueness checks, but a database-level unique index would need owner approval and a duplicate-data review.
- Optional automatic SSO (`VITE_AUTO_SSO`) is not enabled.
- The push handoff URL-fragment flow does not include PKCE because the source app creates the code and cannot have a verifier pre-established at the target. Its protections are the short lifetime, hashed storage, one-time atomic redemption, fragment delivery, and capability re-check. The pull flow does use PKCE.
- The nurse offline-work guard is intentionally conservative: the current implementation may block handoff whenever unsent nurse records/photos exist, not only when the handoff would change users. This protects offline records but may be stricter than the plan's ideal per-user decision.
- Auto-provisioned nurse profiles have no supervisor by default. Consumers should continue treating `supervisor_id` as nullable; supervisor routing should be verified with a real operational account.
- The old heuristic for `can_switch_app` is replaced by the shared capability policy. Nurse-only accounts that previously saw an admin-app link due to the older broad heuristic will no longer see that link unless they genuinely have admin-app capability.
- No Git commit was created because the supplied source archive has no `.git` metadata. One-commit-per-phase can only be done after importing these changes into the owner's Git clone.
- `multi/` was not modified. `multi/projects/nest/` remains generated and should not be hand-edited.

## Owner actions before release

1. **Review and configure origins.** In the Nest backend set `ADMIN_URL` and `NURSE_FRONTEND_URL` to the actual deployed origins. In the multi host, set the adopted equivalents (`NEST_ADMIN_URL`, `NEST_NURSE_FRONTEND_URL`). Configure `NEST_HANDOFF_ENABLED=true` (or use `false` for an immediate rollback), `NEST_HANDOFF_CODE_SECONDS` within 15–120 seconds, and package IDs matching the actual APKs (`NEST_ANDROID_PACKAGE_ADMIN`, `NEST_ANDROID_PACKAGE_NURSE`).
2. **Set frontend origins.** Set `VITE_ADMIN_APP_URL` and `VITE_NURSE_APP_URL` in both frontend build environments. `VITE_SHOW_PULL_SSO` is optional. Leave auto-SSO off unless it is separately reviewed.
3. **Regenerate the admin lockfile.** In `admin/`, run `npm install` and commit the resulting `package-lock.json` change before using `npm ci` or building an admin APK.
4. **Run owner verification** (commands below). Use a non-production test database and valid test secrets. The backend test suite needs `TEST_MONGODB_URI` and any required paired care database settings.
5. **Verify real data before migration rollout.** Back up both primary and care databases, confirm the four affected accounts are active/non-test and hold the stored `field:use` scope, then deploy the backfill. Confirm the provisional staff-number format is acceptable and replace it with the organisation's real staff-number convention.
6. **Promote the Nest backend into multi.** Commit/tag the Nest repository; update `ref` in `multi/sites.toml`; run `python scripts/check_nest_sync.py`; rebuild/redeploy multi. Do not edit the generated `multi/projects/nest/` directory directly.
7. **Build and test both APKs.** Publish new nurse and admin APKs. On a real phone install both, test warm and cold app starts in both directions, uninstall/reinstall the other app, installer permission prompts, and old-APK web fallback.
8. **Run acceptance checks** for expired/reused codes, sign-out independence, user deactivation, nurse-only/admin-only visibility, pending offline records, active visits/SOS UI, and the four repaired accounts.

### Owner-run commands (fish-friendly)

From the repository root:

```fish
cd backend
ruff check .
ruff format --check .
set -x TEST_MONGODB_URI "mongodb://<test-host>/<test-database>"
pytest -q -rs
```

After the test database is ready, run frontend checks:

```fish
cd admin
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

Commit the admin lockfile generated by `npm install`. Then:

```fish
cd nurse
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

From the repository root after frontend changes:

```fish
node scripts/sync-admin-shared.mjs --check
node scripts/sync-mail-rich.mjs --check
python scripts/gen_env_docs.py --check
bash scripts/gen-types.sh
node scripts/pre-apk-release.mjs
```

Run the Android build workflows only after the admin lockfile is refreshed. `gen-types.sh` should be run after the backend API changes so generated admin API types are current. If API type generation fails in the owner's environment, regenerate and review `admin/src/_shared/types/openapi.json` and `admin/src/_shared/types/api.d.ts` before release.

## Changed and added source files

The implementation changes 41 existing files and adds 26 files. Generated admin locale copies were updated through the canonical frontend locale source and synchronization script.

### Existing files modified (41)

```text
.env.example
admin/package.json
admin/src/_shared/locales/en/admin.ts
admin/src/features/admin/AdminApp.tsx
admin/src/features/admin/AdminLayout.tsx
admin/src/features/admin/AppCenterPanel.tsx
admin/src/features/admin/ProfilePage.tsx
admin/src/features/admin/auth/LoginPage.tsx
admin/src/features/admin/auth/session.ts
admin/src/features/admin/care/CareScreenPage.tsx
admin/src/features/admin/care/nurses/NurseDetailPage.tsx
admin/src/features/admin/diagnostics/PushDiagnosticsSection.tsx
admin/src/main.tsx
backend/app/core/config.py
backend/app/modules/auth/models.py
backend/app/modules/field/router.py
backend/app/modules/field/service.py
backend/app/modules/nurses/models.py
backend/app/modules/nurses/router.py
backend/app/modules/nurses/schemas.py
backend/app/modules/nurses/service.py
backend/app/modules/push/diagnostics.py
backend/app/modules/users/service.py
backend/app/registry.py
docs/APP_VERSIONING.md
docs/ENV_CARE_VARS.md
docs/ENV_VARS.md
frontend/src/locales/en/admin.ts
nurse/android-overrides/AndroidManifest.xml
nurse/src/app/App.tsx
nurse/src/copy.ts
nurse/src/features/careforms/ProfileCareSection.tsx
nurse/src/lib/api/client.ts
nurse/src/main.tsx
nurse/src/screens/AppCenterScreen.tsx
nurse/src/screens/LoginScreen.tsx
nurse/src/screens/ProfileScreen.tsx
scripts/__tests__/apply-android-overrides.test.mjs
scripts/apply_admin_android_overrides.mjs
scripts/apply_android_overrides.mjs
scripts/lib/webBundleAndroid.mjs
```

### New files added (26)

```text
admin/src/admin-native/appSwitch.test.ts
admin/src/admin-native/appSwitch.ts
admin/src/admin-native/nativeAppSwitch.ts
admin/src/features/admin/OtherAppSuggestion.tsx
admin/src/features/admin/auth/SsoRelay.tsx
android-shared/AppSwitchPlugin.java
backend/app/modules/auth/app_access.py
backend/app/modules/auth/handoff_router.py
backend/app/modules/nurses/deps.py
backend/app/modules/nurses/staff_numbers.py
backend/migrations/0018_backfill_nurse_profiles.py
backend/migrations/0019_app_handoff_indexes.py
backend/tests/test_app_access.py
backend/tests/test_app_handoff.py
backend/tests/test_field_me_self_heal.py
backend/tests/test_nurse_profile_provisioning.py
backend/tests/test_nurse_repair_endpoint.py
backend/tests/test_patch_nurse_dual_account.py
backend/tests/test_staff_numbers.py
backend/tests/test_users_scope_grant_profile.py
nurse/src/app/SsoRelay.tsx
nurse/src/features/careforms/OtherAppSuggestion.tsx
nurse/src/platform/appSwitch.test.ts
nurse/src/platform/appSwitch.ts
nurse/src/platform/nativeAppSwitch.ts
scripts/__tests__/cross-app-mirrors.test.mjs
```
