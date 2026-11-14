# Admin split review packet 3 — A6 through A7

## Status

- A6: IMPLEMENTED IN SOURCE — `ADMIN_URL`, backend links and tests, environment docs updated.
- A7: STATIC VALIDATION PARTIAL — script tests and code-structure checks passed; dependency-backed builds/tests, live backend e2e and manual deployed checks are BLOCKED.

## Files for review

- `backend/app/core/config.py`
- `backend/app/modules/users/service.py`
- `backend/app/modules/agreements/service.py`
- `backend/app/modules/care_ops/dispatch.py`
- `backend/app/modules/mail/notify.py`
- `backend/tests/test_admin_url_links.py`
- `.env.example`, `docs/ENV_VARS.md`, `docs/ADMIN_APP.md`, `README.md`, `docs/ADMIN_ANDROID_APP.md`

## Commands and results

- `node --test scripts/__tests__/*.test.mjs` — PASS, 25 tests.
- TypeScript parser — PASS, 631 TS/TSX files, zero parse diagnostics.
- JavaScript `node --check` — PASS for admin and scripts JS/MJS sources.
- Python `compile()` on all changed backend modules and added test — PASS.
- `python scripts/gen_env_docs.py --check` — PASS.
- Targeted backend pytest — BLOCKED importing `beanie` from test conftest.
- `ruff` — unavailable.
- Frontend/admin typecheck — BLOCKED by incomplete `node_modules`.
- `node scripts/pre-apk-release.mjs --static-only` — BLOCKED because this ZIP does not include `reference/nest-all-features-mockups.html`.

## Deploy gate

Set `ADMIN_URL=https://admin.bhcug.com` before the backend cutover. The `FRONTEND_URL` fallback exists for split-plan backward compatibility, but is not suitable for root-path staff URLs after `/admin` is removed. Deploy admin and public redirects before the backend link changes.
