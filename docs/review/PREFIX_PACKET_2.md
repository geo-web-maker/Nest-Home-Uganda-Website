# Admin prefix review packet 2 — P2 through P6 final handover

## Current classification

- `docs/admin-prefix/CLASSIFICATION.md`: 276 matching literals in 213 TS/TSX source/test files; API 271, PAGE 0, AMBIGUOUS 5; six non-literal flags.
- The five retained ambiguous literals are intentional inputs to legacy URL normalization/redirect tests. API endpoint literals remain unchanged.
- `node admin/scripts/drop-admin-prefix.mjs --dry-run`: PASS, zero PAGE literals remaining to rewrite.

## Route and nav verification

- `docs/admin-prefix/nav-before.json` versus `nav-after.json`: 41 items; verified in order that each path is exactly its former `/admin` route with only the prefix removed (`/admin` to `/`). `labelKey` and `scopes` are unchanged.
- `docs/admin-prefix/routes-before.json`: 53 paths; `routes-after.json`: 54 paths. The extra current route is the explicit legacy `/admin/*` compatibility route.
- Key source: `admin/src/features/admin/AdminApp.tsx`, `admin/src/features/admin/nav.ts`, `admin/src/main.tsx`, `admin/src/sw.ts`, `admin/src/lib/normalizeAdminUrl.ts`, `admin/worker/index.js`, `admin/wrangler.jsonc`.
- Backend API router prefixes remain under `/api/v1/admin/...`; browser links use the standalone root paths.

## Commands and results

- Shared source sync: PASS (111 files).
- Mail-rich sync: PASS.
- Classifier/codemod dry-run: PASS (0 PAGE, 271 API unchanged, 5 legacy/ambiguous).
- `node --test scripts/__tests__/*.test.mjs`: PASS, 25 tests.
- TypeScript syntax parser: PASS, 631 files, 0 syntax errors.
- Workflow YAML and JSON config parsing: PASS.
- Backend `ADMIN_URL` tests: added, but execution BLOCKED because `beanie` is not installed.
- Full build/unit/e2e/real-backend e2e and live URL/notification/cookie checks: BLOCKED by dependency and deployment environment.

## Manual acceptance checklist

Not performed against a running deployment: login/logout, dashboard/sidebar navigation, deep-link refresh, job create/edit, care visit nested routes, mail compose, real set-password email, push tap, installed PWA upgrade, Android launch, and live old URL redirects. The router/SW helper tests and source config are in place, but do not treat source-level checks as proof of live behavior.
