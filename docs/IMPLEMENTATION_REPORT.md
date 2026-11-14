# Implementation report — standalone admin + root URL migration

## Result

I implemented the two supplied plans in dependency order:

1. Moved the staff admin into a standalone `admin/` app with its own Vite build, PWA, Worker/API proxy, root-level router, and Capacitor configuration.
2. Removed the `/admin` prefix from browser page routes while preserving `/api/v1/admin/...` backend endpoints.
3. Added backward-compatible legacy URL handling, public-site redirects, backend staff-link configuration, tests, CI/release updates, and documentation.

The code changes and static checks are included in this ZIP. **This is not yet a production acceptance sign-off**: the environment could not install the full locked dependencies, run the application builds/tests or run the live cookie/login/push and Android flows.

## Main changes

- New standalone app: `admin/` with copied admin features, native integration, mirrored shared source, dedicated lockfile/configuration and browser tests.
- Shared code split: reusable dialogs are now under `frontend/src/components/dialogs/`; generated shared-source mirror is under `admin/src/_shared/`.
- Shared sync scripts: `scripts/sync-admin-shared.mjs` and updated `scripts/sync-mail-rich.mjs`.
- PWA: root-scope manifest (`/mail`, `/`), Workbox inject-manifest service worker, update prompt, old-push URL normalization and API/asset fallback exclusions.
- Hosting: Cloudflare Worker/static assets in `admin/wrangler.jsonc`; `/api/*` is proxied before static asset fallback, API responses are no-store, and cookie Domain/Path attributes are normalized for the admin origin.
- Routes: dashboard `/`, login `/login`, mail `/mail`, care pages at root paths. The dashboard nav match is exact-only. Unknown authenticated routes redirect to `/`.
- Compatibility: old `admin.bhcug.com/admin/...` links normalize to root routes; both public sites redirect `/admin/...` to `https://admin.bhcug.com/...`.
- Backend: added `ADMIN_URL`; set-password, agreement, SOS and alert links use the standalone admin origin; mail push now points to `/mail`. API routers were not changed.
- CI/Android/docs: added admin CI job and Android workflow updates, moved admin browser specs, updated the pre-APK script, README and Android guide.

## Verified successfully

| Check | Result |
| --- | --- |
| `node --test scripts/__tests__/*.test.mjs` | PASS — 25 tests, 0 failures |
| `node scripts/sync-admin-shared.mjs --check` | PASS — 111 files across 10 groups |
| `node scripts/sync-mail-rich.mjs --check` | PASS |
| `node admin/scripts/classify-admin-prefix.mjs` | PASS — 276 literals: 271 API, 0 PAGE, 5 intentional legacy/ambiguous fixtures; 6 non-literal flags |
| `node admin/scripts/drop-admin-prefix.mjs --dry-run` | PASS — no PAGE literals remain to rewrite; API/ambiguous literals unchanged |
| `admin/scripts/dump-routes.mjs --before/--after` | PASS — 41 nav items; 53 old route paths and 54 current route paths (including explicit legacy route) |
| Nav before/after comparison | PASS — all 41 paths are exactly prefix-stripped; labels, scopes and order unchanged |
| TypeScript syntax parse | PASS — 631 TS/TSX source files, 0 parse diagnostics |
| JavaScript syntax (`node --check`) | PASS — admin/scripts JS and MJS files |
| Changed backend Python source/test `compile()` | PASS |
| GitHub workflow YAML parsing | PASS — all workflow YAML files |
| Vercel JSON config parsing | PASS |
| `python scripts/gen_env_docs.py --check` | PASS |
| Admin direct dependency metadata | PASS — 56 direct packages have matching pinned versions and lockfile entries |
| No public frontend admin source remains | PASS — no `features/admin`, `components/admin` or `admin-native` references under the acceptance grep paths |
| Generated shared UI test fixtures | PASS — browser examples now use `/` and `/care/visits/1`; only API test fixtures remain prefixed in `_shared` |

## Blocked or not performed

- `frontend` and `admin` `npm ci` / full dependency installation: BLOCKED by install timeout and unavailable npm cache/registry metadata. `admin/package-lock.json` was assembled from the exact pinned frontend/nurse package records plus `vite-plugin-pwa@1.0.3`; root metadata and every direct dependency record are checked by the added node test, but a full network-backed `npm ci` has not validated the merged lock tree.
- Frontend/admin `npm run typecheck`: BLOCKED because their `node_modules` are incomplete; missing type libraries include `@testing-library/jest-dom`, `node`, `vite/client` and `vitest/globals`.
- Full frontend/admin `lint`, Vitest, Vite build and Playwright suites: NOT RUN because dependencies/browser binaries were not installed.
- `node scripts/pre-apk-release.mjs --static-only`: BLOCKED because the supplied ZIP does not contain the required `reference/nest-all-features-mockups.html` (there is no `reference/` directory in this archive).
- Backend targeted pytest: BLOCKED while loading `backend/tests/conftest.py` because `beanie` is not installed. `ruff` is not installed.
- Real-backend e2e and MongoDB-backed workflow: NOT RUN; MongoDB service and backend dependency environment are not provisioned.
- Android: OpenJDK 21 is present, but `ANDROID_HOME` and `ANDROID_SDK_ROOT` are unset. No Android project/APK was generated.
- Live deployment/manual checks (login, refresh-cookie cycle, logout, sidebar, deep-link reload, invite email, push tap, installed PWA, redirect on Cloudflare, Android launch): NOT PERFORMED.

## Mandatory production cutover settings

1. Deploy the admin application and its `/api/*` Worker proxy first.
2. Deploy public-site redirects and set `VITE_ADMIN_URL=https://admin.bhcug.com` in both public build environments.
3. Set backend `ADMIN_URL=https://admin.bhcug.com` before deploying the backend link-builder changes. The code retains the split-plan fallback to `FRONTEND_URL`, but after page-prefix removal that fallback is **not** a safe host for root-level `/set-password`, `/agreements/...` or `/care/...` links.
4. Verify `/api/*` proxying, refresh cookies, CSRF header, and push notifications on the live admin origin. Existing push subscriptions on the old origin must be re-created; users need to re-allow notifications on the new origin.
5. Keep legacy `/admin/...` redirects indefinitely to protect old bookmarks and messages.

## Review files

- `docs/ADMIN_SPLIT_LOG.md` and `docs/ADMIN_PREFIX_LOG.md`
- `docs/admin-prefix/CLASSIFICATION-P1.md` (original source classification) and `docs/admin-prefix/CLASSIFICATION.md` (final classification)
- `docs/admin-prefix/nav-before.json`, `routes-before.json`, `nav-after.json`, `routes-after.json`
- `docs/review/PACKET_1.md`, `PACKET_2.md`, `PACKET_3.md`, `PREFIX_PACKET_1.md`, `PREFIX_PACKET_2.md`
- `docs/ADMIN_APP.md` and `docs/ADMIN_ANDROID_APP.md`

The uploaded archive had no `.git` directory, so this output contains no commits or PRs. Run the remaining dependency-backed and live checks in CI/staging before deploying to production.
