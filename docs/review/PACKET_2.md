# Admin split review packet 2 — A4 through A5

## Status

- A4: IMPLEMENTED IN SOURCE — PWA, Worker API proxy, root-scope manifest, service worker, Capacitor config, and admin browser specs moved. Build/native/browser acceptance blocked by missing installed dependencies and Android SDK.
- A5: IMPLEMENTED IN SOURCE — admin source/native shells removed from `frontend/`; both public sites redirect `/admin` URLs to the standalone origin; CI and release scripts updated.

## Files for review

- `admin/src/pwa/manifest.ts`, `admin/src/pwa/InstallHint.tsx`, `admin/src/sw.ts`, `admin/worker/index.js`, `admin/wrangler.jsonc`, `admin/public/_headers`, `admin/public/_redirects`
- `admin/capacitor.config.ts`, `admin/src/admin-native/identity.ts`
- `admin/e2e/**`, `admin/playwright.config.ts`
- `frontend/public/_redirects`, `frontend/vercel.json`, `frontend-thread/public/_redirects`, `frontend-thread/vercel.json`, `frontend-thread/vercel.review.json`
- `.github/workflows/ci.yml`, `.github/workflows/admin-android.yml`, `.github/workflows/pre-apk-release.yml`
- `scripts/pre-apk-release.mjs`, `scripts/apply_admin_android_overrides.mjs`, `frontend/scripts/make-admin-shell.mjs`

## Commands and results

- `node --test scripts/__tests__/*.test.mjs` — PASS, 25 tests (includes new admin dependency/lockfile checks).
- Workflow YAML parsing — PASS, all `.github/workflows/*.yml` parsed.
- Public Vercel JSON configs — PASS, parsed by Python JSON loader.
- `python scripts/gen_env_docs.py --check` — PASS.
- `java -version` — OpenJDK 21 available; `ANDROID_HOME` and `ANDROID_SDK_ROOT` unset, so APK not built.

## Reviewer attention

Confirm Cloudflare route/zone and Worker deployment behavior in the live account. The API proxy is explicitly first for `/api/*`; the Worker code only proxies API paths and sends all other paths to static assets. Check production cookie refresh and notification permission re-registration on the new origin.
