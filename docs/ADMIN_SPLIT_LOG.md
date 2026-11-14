# Admin split implementation log

This log records the A0–A7 work from `ADMIN_SPLIT_PLAN.md`. The supplied ZIP did not include a Git repository, so no commits/PRs were created. The source changes were applied directly to the extracted tree.

## A0 — Baseline

| Check | Result | Notes |
| --- | --- | --- |
| `frontend npm ci` | BLOCKED | Initial install timed out. Runtime was Node v22.16.0; repository lock includes dependencies requiring later Node 22 patches. |
| Frontend typecheck/lint/test/build baseline | BLOCKED | `node_modules` incomplete; typecheck fails to resolve `@testing-library/jest-dom`, `node`, `vite/client`, and `vitest/globals`. |
| Admin baseline | N/A | Original ZIP had no `admin/` app. |
| Baseline test counts | UNAVAILABLE | The locked dependency tree could not be installed in this runtime. |

## A1 — Shared dialog independence

- Moved `DialogHost`, `Modal`, `ButtonGroup` and their CSS/tests from `frontend/src/components/admin` into `frontend/src/components/dialogs` and updated importers.
- Also moved `Notice` and `SectionHeader` plus styles/tests because shared `components/security/TotpGate.tsx` depends on them; changed the security imports so public/shared code no longer depends on admin-only components.
- Agreement public page imports the shared dialog path.
- Checks: source search for `components/admin` in the public feature/site/UI import areas returned no references. Full frontend typecheck/lint/test/build remain blocked by dependency installation.

## A2 — Shared source sync

- Added `scripts/sync-admin-shared.mjs` with canonical `frontend/src` source groups and generated headers for TS/TSX/CSS.
- Added import-alias migration script `scripts/alias-admin-shared-imports.mjs`.
- Updated `scripts/sync-mail-rich.mjs` destinations for the standalone admin and nurse; removed frontend mail-rich mirror destination when public mail editor is absent.
- `node scripts/sync-admin-shared.mjs --check`: PASS — 111 files across 10 source groups.
- `node scripts/sync-mail-rich.mjs --check`: PASS (exit 0).

## A3 — Standalone admin app

- Created `admin/` with its own package metadata, lockfile, Vite/TypeScript/ESLint/Playwright configs, HTML entry, app router and copied admin/native source.
- Generated the `_shared` mirror and mail-rich mirror; converted imports to `@shared/...`.
- Replaced `vite-react-ssg`-specific `Head` use in admin auth pages with `react-helmet-async` `Helmet`.
- The lockfile was assembled from exact pinned dependency records already present in the frontend/nurse lockfiles, with `vite-plugin-pwa@1.0.3`. Added `scripts/__tests__/admin-package.test.mjs` to assert exact versions, unused dependency closure, and `package.json`/lockfile root consistency. A network-backed `npm ci` validation could not complete here. Revalidate `npm ci` in CI/Node 22.19+ before production deployment.
- Checks: shared sync checks PASS; admin `npm ci --dry-run --offline` BLOCKED because the local npm cache lacks `type-fest` registry metadata; typecheck BLOCKED because admin dependencies are not installed (`@testing-library/jest-dom`, `node`, `vite/client`, `vitest/globals` unresolved).

## A4 — PWA, Worker, native and browser tests

- Added the admin root-scope PWA manifest, install/update prompt, inject-manifest service worker, push event handling, app-shell-only navigation fallback and `/api/` denylist. The service worker now waits for the explicit `SKIP_WAITING` update action rather than skipping an update immediately; `injectRegister: null` prevents duplicate automatic registration.
- Added Cloudflare Worker API proxy and `admin/wrangler.jsonc`, static headers, legacy redirect rules and Capacitor config with `webDir: dist` / app id `ug.nesthomecare.admin`.
- Moved admin browser fixtures/specs into `admin/e2e`, including accessibility, responsive, native and reference-fidelity suites; added legacy URL redirect coverage.
- Unit tests added for the legacy URL normalizer and notification URL compatibility.
- Added `admin/src/pwa/manifest.test.ts` for `/mail`, `/` scope and standard/maskable icons. Browser/build tests BLOCKED because admin dependencies and Playwright browser binaries could not be installed in this runtime. JDK 21 is present, but `ANDROID_HOME`/`ANDROID_SDK_ROOT` are unset; no Android SDK/Gradle project was available, so no APK was built.

## A5 — Remove admin from public frontend, CI and docs

- Removed the admin route/source/native shell/config and admin-specific public assets from `frontend/` after copying to `admin/`.
- Added root-origin redirects in `frontend/` and `frontend-thread/` redirect configs; changed the frontend staff-login link to use `VITE_ADMIN_URL` (with `/admin/login` fallback).
- Split admin tests into `admin/e2e`; kept the public reference tests under `frontend/e2e`.
- Updated CI, admin Android workflow, pre-APK workflow/script, Android override script, README and Android docs.
- `python scripts/gen_env_docs.py --check`: PASS. JSON configs were parsed successfully; YAML syntax is included in final validation report.
- `frontend npm run typecheck`: BLOCKED by incomplete `node_modules` (missing type definitions). CI workflow has an independent `admin` job and runs the shared sync checks.

## A6 — Backend links and environment

- Added `ADMIN_URL`, defaulting to `FRONTEND_URL` when empty, and changed set-password, agreement, care alert/SOS links to use the configured admin origin.
- Mail push payload now uses `/mail` for the root-route admin app.
- Added `backend/tests/test_admin_url_links.py` covering default/override and each generated link type.
- `python scripts/gen_env_docs.py --check`: PASS.
- Targeted pytest BLOCKED during conftest import because `beanie` is not installed. `ruff` is unavailable in the runtime.
- Production requirement: set `ADMIN_URL=https://admin.bhcug.com` before backend rollout. The fallback is retained for the split plan but is not a valid post-prefix-removal production host for root-level admin pages.

## A7 — Final verification

- `node --test scripts/__tests__/*.test.mjs`: PASS — 25 tests after adding the admin package-lock/dependency guard.
- `node scripts/sync-admin-shared.mjs --check`: PASS (111 files).
- `node scripts/sync-mail-rich.mjs --check`: PASS.
- `node admin/scripts/classify-admin-prefix.mjs`: PASS (276 literals; 271 API, 0 PAGE, 5 intentional legacy/ambiguous cases; 6 non-literal flags).
- `node admin/scripts/drop-admin-prefix.mjs --dry-run`: PASS (0 page literals remain to rewrite; API and legacy literals unchanged).
- `python scripts/gen_env_docs.py --check`: PASS.
- `admin/scripts/dump-routes.mjs --before` and `--after`: PASS (41 nav items; 53 and 54 route paths in the generated snapshots respectively).
- TypeScript parser scan: PASS — 631 TS/TSX source files, 0 syntax parse diagnostics. JavaScript `node --check`: PASS. Changed backend modules/tests compile with Python `compile()`: PASS. All GitHub workflow YAML files parse: PASS.
- `node scripts/pre-apk-release.mjs --static-only`: BLOCKED because the uploaded repository does not contain the required `reference/nest-all-features-mockups.html` file/directory. Full typecheck/lint/unit/build/e2e and real-backend workflow remain unverified because dependency installation and MongoDB services are unavailable. No live login/refresh/logout, push, installed PWA or preview-deployment checklist was performed.

## Merge of sandbox and pin-first-places work (2026-11-14)

- Brought the test-sandbox Nest line into the split tree: backend sandbox/test-accounts (`core/sandbox.py`, `modules/test_accounts`, mail migration 0013, TOTP prompt), pin-first places (backend `location_source`, nurse app, admin `MapPicker`/client detail/visit review), generated API types.
- Admin-side files were merged three-way (base = pre-split frontend after the same import/prefix transforms) into `admin/src`; shared files (`lib/api/client.ts`, `lib/totpPrompt.ts`, `components/security/TotpPromptHost.tsx`, types) went to `frontend/src` and were re-synced into `admin/src/_shared`.
- `leaflet@1.9.4` and `@types/leaflet@1.9.12` added to `admin/` (they were added to `frontend/` in the sandbox line; the public site does not use them).
- Checks run: shared sync `--check` PASS (113 files), script tests PASS (25), backend parity vs Multi-Site-Hosting `check_nest_sync` PASS. Typecheck/lint/build/pytest not run (no dependencies in this environment).

## Verification pass after merge (2026-11-14)

Static checks run over the merged trees: TypeScript syntax parse of admin/frontend/nurse/frontend-thread (0 errors), Python AST parse of 1005 files, all YAML/JSON parse, import resolution for admin/frontend/nurse, Python import resolution for `app.` and `projects.nest.`, shared-source sync, script tests (25), Nest/hosting backend parity.
Fixed in this pass: `@shared/lib/normalizeAdminUrl` mis-aliasing (the alias script now skips files that exist locally in `admin/src`), `TestAccountsSection` imports of the moved dialog components, missing `vite-plugin-pwa/react` type reference, CSP blocking the inline theme script (now allowed by hash), stale `test_agreement_blocks` in the hosting copy.
Not run: typecheck, lint, Vitest, build, Playwright, pytest (no dependencies installable here).
