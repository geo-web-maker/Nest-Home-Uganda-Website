# BUILD LOG

## S0 checkpoint: scaffold, pins, lockfiles, CI, orientation (2026-10-19, Claude)

### Preflight (run first, from scripts/preflight.sh)
```
PASS  git: git version 2.43.0
PASS  node v22.22.2
PASS  npm 10.9.7
PASS  python 3.12
PASS  npm registry reachable
PASS  PyPI reachable
FAIL  docker unavailable and TEST_MONGODB_URI / TEST_S3_ENDPOINT not set (MongoDB replica set and S3-compatible storage are required for tests)
PREFLIGHT FAILED
```
Only the Docker line fails in this session's sandbox (expected). MongoDB- and MinIO-backed tests, docker compose and Playwright are therefore NOT RUN here; CI is where they run.

### Gate, run from clean (node_modules and .venv deleted, installed from lockfiles only)
```
$ npm ci --no-audit --no-fund
npm warn deprecated whatwg-encoding@3.1.1: Use @exodus/bytes instead for a more spec-conformant and faster implementation

added 387 packages in 19s
-> exit 0

$ npm run lint

> nest-home-care-frontend@0.0.0 lint
> eslint . --max-warnings=0

-> exit 0

$ npm run typecheck

> nest-home-care-frontend@0.0.0 typecheck
> tsc --noEmit

-> exit 0

$ npm run test

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  04:51:29
   Duration  2.08s (transform 92ms, setup 180ms, collect 78ms, tests 232ms, environment 1.12s, prepare 181ms)

-> exit 0

$ npm run build
computing gzip size...
dist/index.html                   0.81 kB │ gzip:  0.50 kB
dist/assets/index-BaTPm8Mq.css    0.80 kB │ gzip:  0.44 kB
dist/assets/index-w0YXWjcA.js   142.66 kB │ gzip: 45.97 kB
✓ built in 2.03s
-> exit 0

$ npm run format:check

> nest-home-care-frontend@0.0.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!
-> exit 0

$ pip install -q -r requirements.lock
-> exit 0

$ pip install -q -e . --no-deps
-> exit 0

$ ruff check .
All checks passed!
-> exit 0

$ ruff format --check .
7 files already formatted
-> exit 0

$ pytest -q
..                                                                       [100%]
2 passed in 0.64s
-> exit 0

```

### Installed trees
```
nest-home-care-frontend@0.0.0 /home/claude/nest-home-care/frontend
+-- @eslint/js@10.0.1
+-- @hookform/resolvers@5.9.2
+-- @playwright/test@1.64.1
+-- @tanstack/react-query@5.104.4
+-- @testing-library/dom@10.4.2
+-- @testing-library/jest-dom@7.0.1
+-- @testing-library/react@16.3.3
+-- @testing-library/user-event@14.6.8
+-- @types/node@22.20.5
+-- @types/react-dom@18.3.7
+-- @types/react@18.3.31
+-- @vitejs/plugin-react@5.2.0
+-- ajv@8.20.0
+-- eslint-plugin-react-hooks@7.1.1
+-- eslint@10.13.0
+-- globals@17.13.0
+-- i18next@26.5.2
+-- jsdom@30.1.3
+-- openapi-typescript@7.13.0
+-- prettier@3.9.10
+-- react-dom@18.3.1
+-- react-helmet-async@3.0.0
+-- react-hook-form@7.90.0
+-- react-i18next@17.1.0
+-- react-router-dom@6.30.6
+-- react@18.3.1
+-- typescript-eslint@8.71.2
+-- typescript@5.9.3
+-- vite-react-ssg@0.9.2
+-- vite@7.3.7
+-- vitest@3.2.7
`-- zod@4.6.7

```
```
annotated-doc==0.0.5
annotated-types==0.8.0
anyio==4.15.1
APScheduler==3.11.3
argon2-cffi==25.1.0
argon2-cffi-bindings==26.1.0
beanie==2.2.0
boto3==1.43.114
botocore==1.43.114
certifi==2026.10.18
cffi==2.1.1
click==8.5.0
dnspython==2.9.0
email-validator==2.3.0
fastapi==0.146.0
h11==0.16.0
httpcore==1.0.9
httptools==0.9.0
httpx==0.28.1
idna==3.20
iniconfig==2.3.1
jmespath==1.1.0
lazy-model==0.4.0
opentelemetry-api==1.45.1
packaging==26.3
pluggy==1.7.0
pycparser==3.11
pydantic==2.14.1
pydantic-settings==2.16.0
pydantic_core==2.50.1
Pygments==2.21.0
PyJWT==2.15.1
pymongo==4.19.0
pytest==9.1.1
pytest-asyncio==1.4.0
python-dateutil==2.9.0.post0
python-dotenv==1.2.4
python-multipart==0.0.32
PyYAML==6.0.3
ruff==0.17.1
s3transfer==0.19.2
six==1.17.0
starlette==1.9.0
typing-inspection==0.4.4
typing_extensions==4.16.0
tzlocal==5.4.4
urllib3==2.8.0
uvicorn==0.54.0
uvloop==0.23.0
watchfiles==1.3.0
websockets==17.2
```

### Acceptance for S0
| Clause | Result | Evidence |
| --- | --- | --- |
| Frontend lint, typecheck, test, build, format:check exit 0 from lockfile | PASS | gate output above |
| Backend ruff check, ruff format --check, pytest exit 0 from lockfile | PASS | gate output above |
| `npm ls` and pip freeze show only the pinned versions; no Motor | PASS | trees above; `grep -ci motor backend/requirements.lock` returned 0 |
| `tokens.css` matches the spec | PASS (partial check) | all 24 hex colours in tokens.css occur in spec; full value-by-value diff is part of S1 |
| CI workflow is valid YAML | PASS | parsed with PyYAML |
| CI workflow executes on GitHub | NOT RUN | no GitHub access here; first push will show it |
| docker-compose.dev.yml starts MongoDB replica set and MinIO | NOT RUN | no Docker in this sandbox |
| Playwright | NOT RUN | no tests yet, job is skipped until `frontend/e2e/` exists |
| `scripts/orient.sh` runs on the repo | PASS | run at end of session, output in STATE ledger notes |

### Deviations and additions (all recorded in docs/STATE.md)
1. **Added devDependency `ajv@8.20.0`.** Without it `npm ci` rejected the generated lockfile ("lock file's ajv@6.15.0 does not satisfy ajv@8.20.0") on npm 10.9.7 because ESLint 10 needs ajv 6 while `@hookform/resolvers` brings ajv 8. Pinning ajv 8 at the root made `npm ci` pass twice in a row. Remove only if `npm ci` still passes without it.
2. **Tooling versions not in the BUILDER_INSTRUCTIONS table were chosen here:** eslint 10.13.0, @eslint/js 10.0.1, typescript-eslint 8.71.2, eslint-plugin-react-hooks 7.1.1 (only `rules-of-hooks` and `exhaustive-deps` enabled), globals 17.13.0, prettier 3.9.10, jsdom 30.1.3, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/jest-dom 7.0.1, @testing-library/user-event 14.6.8, @types/react 18.3.31, @types/react-dom 18.3.7, @types/node 22.20.5, openapi-typescript 7.13.0. Each was checked for peer compatibility with the pinned React 18, Vite 7, TypeScript 5.9 and Vitest 3.
3. **Environment variable names.** The spec says `MAMBASMS_*`; this repo uses `MAMBOSMS_BASE_URL`, `MAMBOSMS_API_KEY` and `SMS_PROVIDER` (BUILDER_INSTRUCTIONS C7). Email provider variables (`EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_API_KEY`) and `VERCEL_DEPLOY_HOOK_URL` are placeholders because the spec names no exact keys. Revisit when the email provider is chosen.
4. **GitHub Action versions** (`checkout@v4`, `setup-node@v4`, `setup-python@v5`, `upload-artifact@v4`) are tag pins written from memory and not verified against the Marketplace today.
5. **Backend Dockerfile and render.yaml are not in S0.** They belong to deployment (S6); no Docker here to test a build.

---

## S1 checkpoint (2026-10-19, branch s1)

PHASE S1 REPORT
Commits: b6506be S1: design foundation, UI primitives and pre-render spike (base fbf150e)
Commands run and exit codes (frontend, after `rm -rf node_modules dist && npm ci`):
  npm run lint -> 0
  npm run typecheck -> 0
  npm run test -> 0   (10 files, 37 tests passed)
  npm run build -> 0  (tsc --noEmit && vite-react-ssg build)
  npm run format:check -> 0
Commands run (backend): ruff check . -> 0 ("All checks passed!"); ruff format --check . -> 0; pytest -q -> 0 ("2 passed")
Last lines of build output:
dist/services/index.html  1.25 KiB

[vite-react-ssg] Generating static loader data... (2)
dist/static-loader-data-manifest-ahinqmn27e.json  0.10 KiB

[vite-react-ssg] Build finished.
npm ls --depth=0 :
nest-home-care-frontend@0.0.0 /home/claude/nest-home-care/nest-home-care/frontend
+-- @eslint/js@10.0.1
+-- @hookform/resolvers@5.9.2
+-- @playwright/test@1.64.1
+-- @tanstack/react-query@5.104.4
+-- @testing-library/dom@10.4.2
+-- @testing-library/jest-dom@7.0.1
+-- @testing-library/react@16.3.3
+-- @testing-library/user-event@14.6.8
+-- @types/node@22.20.5
+-- @types/react-dom@18.3.7
+-- @types/react@18.3.31
+-- @vitejs/plugin-react@5.2.0
+-- ajv@8.20.0
+-- eslint-plugin-react-hooks@7.1.1
+-- eslint@10.13.0
+-- globals@17.13.0
+-- i18next@26.5.2
+-- jsdom@30.1.3
+-- openapi-typescript@7.13.0
+-- prettier@3.9.10
+-- react-dom@18.3.1
+-- react-helmet-async@3.0.0
+-- react-hook-form@7.90.0
+-- react-i18next@17.1.0
+-- react-router-dom@6.30.6
+-- react@18.3.1
+-- typescript-eslint@8.71.2
+-- typescript@5.9.3
+-- vite-react-ssg@0.9.2
+-- vite@7.3.7
+-- vitest@3.2.7
`-- zod@4.6.7
pip freeze (backend, unchanged since S0; editable install line omitted) :
annotated-doc==0.0.5
annotated-types==0.8.0
anyio==4.15.1
APScheduler==3.11.3
argon2-cffi==25.1.0
argon2-cffi-bindings==26.1.0
beanie==2.2.0
boto3==1.43.114
botocore==1.43.114
certifi==2026.10.18
cffi==2.1.1
click==8.5.0
dnspython==2.9.0
email-validator==2.3.0
fastapi==0.146.0
h11==0.16.0
httpcore==1.0.9
httptools==0.9.0
httpx==0.28.1
idna==3.20
iniconfig==2.3.1
jmespath==1.1.0
lazy-model==0.4.0
# Editable Git install with no remote (nest-home-care-backend==0.0.0)
opentelemetry-api==1.45.1
packaging==26.3
pluggy==1.7.0
pycparser==3.11
pydantic==2.14.1
pydantic-settings==2.16.0
pydantic_core==2.50.1
Pygments==2.21.0
PyJWT==2.15.1
pymongo==4.19.0
pytest==9.1.1
pytest-asyncio==1.4.0
python-dateutil==2.9.0.post0
python-dotenv==1.2.4
python-multipart==0.0.32
PyYAML==6.0.3
ruff==0.17.1
s3transfer==0.19.2
six==1.17.0
starlette==1.9.0
typing-inspection==0.4.4
typing_extensions==4.16.0
tzlocal==5.4.4
urllib3==2.8.0
uvicorn==0.54.0
uvloop==0.23.0
watchfiles==1.3.0
websockets==17.2

### Pre-render spike (raw HTML, grep, no browser)
```
dist/index.html
  h1:    <h1>Care that comes home to you.</h1>
  title: <title data-rh="true">Nest Home Care Uganda | Compassionate Home Care in Kampala</title> (count 1)
  desc:  <meta data-rh="true" name="description" content="Trained nurses for elderly care, ..."> (count 1)
dist/services/index.html
  h1:    <h1>Eight kinds of care, one trusted team.</h1>
  title: <title data-rh="true">Home Care Services in Kampala | Nest Home Care Uganda</title> (count 1)
  desc:  <meta data-rh="true" name="description" content="Everything your family needs, delivered at home. ..."> (count 1)
```
Problems found and fixed during the spike:
1. Default output was dist/services.html. Fixed with ssgOptions { dirStyle: 'nested' } in vite.config.ts.
2. Title and description were duplicated (index.html defaults next to Head output). Removed them from index.html; the layout route now has a default Head that each page overrides.
Finding: vite-react-ssg 0.9.2 bundles its own react-helmet-async 1.3.0 and exports Head from it. The pinned react-helmet-async 3.0.0 does NOT work with the pre-render: a test page using its Helmet failed the build with "TypeError: Cannot read properties of undefined (reading 'add')" (test reverted). All pages must use Head from vite-react-ssg. The 3.0.0 pin is unused. See deviations.

### Acceptance for S1
| Clause | Result | Evidence |
| --- | --- | --- |
| lint, typecheck, test, build exit 0 | PASS | commands above |
| Spike: dist/index.html and dist/services/index.html each have a real h1, title, meta description in raw HTML | PASS | grep output above |
| /design dev-only route shows every component | PASS | Chromium screenshots at 390, 820, 1024, 1280, 1920 px in light and dark, no console errors, no horizontal scroll, all 6 font faces loaded. /design is absent from dist (grep for its text returned nothing) |
| tokens.css matches spec Section 2 value by value | PASS | script compared all 12 colours light and dark, 5 fixed colours, egg, arch, container, 3 font stacks: 0 mismatches. tokens.css is unchanged from design/tokens.css |
| Pages match the reference at 5 widths | NOT RUN | no public pages yet (S3). Only the design page was screenshotted |
| Keyboard open and close of Accordion (Enter, Space) | NOT RUN | jsdom does not implement it; tab focus is tested. Add to Playwright flows in S6 |
| Hydration of the pre-rendered pages in a browser | NOT RUN | not loaded from dist in a browser this session |
| CI, docker compose, Playwright suite | NOT RUN | unchanged from S0 |

Files created or changed (paths only):
  frontend/index.html, package.json, vite.config.ts, eslint.config.js, src/main.tsx
  frontend/src/app/routes.tsx, routes.test.tsx (App.tsx and App.test.tsx removed)
  frontend/src/features/public/home/*, features/public/services/*, features/dev/DesignPage.*
  frontend/src/design/fonts.css, global.css, shapes.module.css
  frontend/src/lib/cx.ts
  frontend/src/components/brand/Logo.*, Weave.*
  frontend/src/components/ui/Button.*, Rule.*, AccentText.*, Chip.*, Field.*, Badge.*, Accordion.*
  frontend/public/fonts/*.woff2, LICENSES.txt

Deviations from spec:
1. Build script is now `tsc --noEmit && vite-react-ssg build`; vite.config.ts has ssgOptions.dirStyle 'nested' (BUILDER_INSTRUCTIONS C4, Phase 0 spike).
2. Per-page head uses Head from vite-react-ssg, not react-helmet-async 3.0.0 (spec 10.3). Reason in the finding above. Decision for the owner: keep or remove the unused 3.0.0 pin.
3. Fonts: WOFF2 files taken from @fontsource 5.3.0 packages (fraunces, figtree, cormorant-garamond), latin subset, OFL licence copied to public/fonts/LICENSES.txt. Packages were not added as dependencies. Total 88 KB. Two are preloaded (Fraunces 700, Figtree 400).
4. eslint.config.js: no-unused-vars now has ignoreRestSiblings: true (needed for the prop-omit pattern in Button and Field).
5. Button accepts a `type` prop (default "button") so form submit buttons can use it. Spec 4.1 only names button and link.
6. Chip has two variants (care toggle, area static) because spec 4.15 and 4.16 define both and the ui/ list has one Chip.
7. Field: a required field must be given requiredLabel (typed), so "(required)" is not hard-coded in the component. Uses aria-required, not the native required attribute, so react-hook-form and Zod own validation.
8. Logo takes name and subtitle as props (business data, not hard-coded).
9. The index.html title and description defaults moved into a layout-level Head (see spike problem 2).
10. App.test.tsx (S0 placeholder shell test) replaced by routes.test.tsx because App.tsx was replaced by the router.
11. tests that render pages mock Head (provider is added only by ViteReactSSG at runtime).

Stops raised: none
NOT DONE: Sections and layouts (S3), i18n wiring (S3), admin-only components Toggle, Tabs, Table, Modal (not in the S1 list).

---

## S2 checkpoint (2026-10-19, branch s2, base 9ca26b9)

PHASE S2 REPORT
Commits: 0e815eb S2: backend pattern slice (core, auth with scope model, audit, services module, migrations, seed)
Commands run and exit codes (frontend after `npm ci`; backend in a venv built from requirements.lock):
  npm run lint -> 0
  npm run typecheck -> 0
  npm run test -> 0   (Test Files 10 passed, Tests 37 passed)
  npm run build -> 0  ("[vite-react-ssg] Build finished.")
  npm run format:check -> 0
  ruff check . -> 0   ("All checks passed!")
  ruff format --check . -> 0   ("46 files already formatted")
  pytest -q -rs -> 0   ("103 passed, 34 skipped"; every skip is "TEST_MONGODB_URI is not set")
npm ls --depth=0 : unchanged since S1 (no frontend dependency changed)
pip freeze : identical to backend/requirements.lock (diff empty); no dependency added; no Motor
Acceptance gate (S2 definition in docs/WORK_SPLIT_GUIDE.md section 3, plus BUILDER_INSTRUCTIONS 12.6):
  Core: config, db, security, errors, rate limit, storage -> PASS (written; unit tests in tests/test_core.py run and pass: argon2id, JWT expiry/tamper/alg=none/wrong type, short SECRET_KEY refused, IP hash, rate-limit window, language fallback)
  Auth with the scope model (login, refresh rotation, logout, me, GET /admin/scopes) -> PARTIAL. HTTP contract tests that need no database PASS (error shape, CSRF double-submit, login rate limit 429, 401/403). Login, lockout, rotation, reuse detection, scope re-read on refresh, sign-out: tests written, NOT RUN (need MongoDB)
  12.6 test 1, every admin endpoint 401/403/read-only-403 generated from the registered routes -> PASS (tests/test_scope_enforcement.py, no database needed). The "right scope succeeds" half only proves the call is not 401 or 403; the handler result with a real database is NOT RUN
  12.6 test 2, superadmin passes every endpoint -> PASS for authorisation (not 401 or 403); full success NOT RUN
  12.6 test 3, escalation rules (cannot grant a scope you lack, cannot grant system:manage, cannot edit own scopes) -> PASS as pure-function tests (tests/test_scopes.py). The Users endpoints that call them do not exist yet (later phase)
  12.6 test 4, last-superadmin protection -> PASS as a pure function; endpoint not built yet
  12.6 test 5, changing scopes signs the user out -> NOT RUN (tests/test_db_auth.py::test_changing_scopes_signs_the_user_out needs MongoDB)
  Audit log -> code written; every admin write in the services module calls it; test NOT RUN (needs MongoDB)
  `services` module (router, schemas, models, repository, service, tests, seed) -> schema and seed-content tests PASS; API tests (tests/test_db_services.py, 15 tests) NOT RUN
  Migration script runs twice without change and indexes exist -> NOT RUN (needs MongoDB). CI now runs `python -m app.migrate` twice and `python -m app.seed` twice against the real database
  Seed fails when FIRST_SUPERADMIN_* is empty, never prints the password -> NOT RUN against a database; the empty-value check runs before any connection in `app.seed._main`
  CI, docker compose, Playwright -> NOT RUN (unchanged)
Files created or changed (paths only):
  backend/app/main.py, registry.py, migrate.py, seed.py
  backend/app/core/config.py, db.py, deps.py, errors.py, i18n.py, models.py, pagination.py, rate_limit.py, security.py, storage.py
  backend/app/modules/auth/{models,schemas,repository,service,router,scopes}.py
  backend/app/modules/audit/{models,service}.py
  backend/app/modules/services/{models,schemas,repository,service,router,seed}.py
  backend/migrations/0001_indexes.py
  backend/tests/conftest.py, test_core.py, test_scopes.py, test_scope_enforcement.py, test_http_contract.py, test_services_schemas.py, test_db_auth.py, test_db_services.py, test_db_migrations_seed.py
  backend/pyproject.toml, .env.example, .github/workflows/ci.yml, README.md
Deviations from spec:
1. users gets `last_failed_at` (not in spec 8.3). Needed to apply "5 failures in 15 minutes" (spec 7.2) with the existing `failed_logins` counter.
2. Auth endpoints built in S2: login, refresh, logout, me, and GET /admin/scopes only. Forgot, reset, accept-invite, change-password and TOTP (spec 9.4) are NOT DONE. A user with `totp_secret` set cannot sign in yet (fails closed).
3. CSRF double-submit: the CSRF value is set as a cookie and also returned in the login and refresh JSON body, and the client sends it in `X-CSRF-Token`. A page on another origin cannot read the API's cookie, so the body copy is what makes the check work cross-origin (decision 15).
4. Rate limiter is in process memory (correct for one Render instance). Replace the store if the backend ever runs on several instances.
5. Access tokens are trusted without a database read per request. A scope change reaches the user within `ACCESS_TOKEN_MINUTES` (15) for access, and ends their refresh sessions at once. Refresh re-reads scopes from the database (12.1.5).
6. Seed publishes all eight services (the overview needs eight cards, spec 5.2) but only postnatal has detail copy; the other seven show "Content needed" in admin. `photo_media_id` is not seeded because the media module does not exist yet. `icon_key` is set for services 4, 5, 7, 8 (physiotherapy, palliative, pediatric, hospital-to-home) following spec 12.1 and 4.9. Spec line 287 says services 3, 4, 6, 7 use icon tiles, which disagrees with 12.1; 12.1 was followed. Owner to confirm.
7. Public service detail does not include FAQs yet (faqs module is job G10). Admin `q` filter matches a slug prefix only (anchored, indexed), because spec 9.5 forbids unbounded $regex.
8. Spec 9.5 `POST /content/{type}/{id}/undo` and `/reorder` are NOT DONE. Versions are saved (last 10) so undo can be added later.
9. `0001_indexes.py` creates indexes only for collections that exist so far (users, refresh_tokens, password_resets, services, audit_log, content_versions). Later modules add numbered scripts.
10. ruff config: `extend-immutable-calls` for FastAPI Depends/Query/Header/Cookie (B008), tests ignore S105 and S106 (dummy passwords). pytest turns unraisable-exception warnings into errors.
11. New env names `TRUST_PROXY` and `COOKIE_SAMESITE` (default lax; use none for a cross-site frontend). Added to `.env.example`.
12. `/docs` and the OpenAPI JSON are served only when APP_ENV is development.
13. `GET /api/v1/health` response gains a `database` field (off, ok or down) and returns 503 when a configured database does not answer.
14. TimestampedDocument stamps created_at and updated_at in Beanie events, so every model gets them without repeating code.
Stops raised: none
NOT DONE: everything marked NOT RUN above; auth endpoints listed in deviation 2; undo and reorder; services FAQs and photos; Users endpoints; Dockerfile and render.yaml (S6); generating frontend API types from the OpenAPI schema (S3).

---

## S4 checkpoint (2026-10-19, branch s4, base f20ab7f = tip of s2)

Built as a standalone branch from s2 so S3 can be built and merged beside it. S4 touches no file S3 owns except docs/STATE.md and docs/BUILD_LOG.md (kept in their own commit).

PHASE S4 REPORT
Commits: see `git log s2..s4` (code commit, then ledger commit)
Commands run and exit codes (frontend after `npm ci`; backend in the S2 venv from requirements.lock):
  npm run lint -> 0
  npm run typecheck -> 0
  npm run test -> 0   (Test Files 14 passed, Tests 65 passed; was 10 and 37 in S2)
  npm run build -> 0  ("[vite-react-ssg] Build finished.")
  npm run format:check -> 0
  ruff check . -> 0
  ruff format --check . -> 0   (72 files already formatted)
  pytest -q -rs -> 0   (216 passed, 49 skipped; every skip is "TEST_MONGODB_URI is not set")
npm ls / pip freeze: no dependency added or changed (apscheduler, httpx, zod, react-hook-form were already pinned)
Acceptance gate (S4 definition in docs/WORK_SPLIT_GUIDE.md section 3, plus BUILDER_INSTRUCTIONS 13):
  Enquiry create (POST /public/enquiries): schema, honeypot, consent, rate limit 5 per IP per hour, 429, friendly message -> PASS without a database (tests/test_http_enquiries.py, test_enquiry_schemas.py). Saving, reference numbers, service lookup, WhatsApp URL from a real save -> tests written, NOT RUN (need MongoDB)
  Admin enquiries API (list with filters and search, detail, PATCH status and assignee, notes, manual entry) -> scope enforcement PASS (the generated 12.6 tests cover the new routes); handlers NOT RUN (need MongoDB). Status rules PASS as pure functions
  Click tracking (POST /public/clicks) -> validation PASS; upsert NOT RUN
  SmsProvider, ConsoleSmsProvider, MamboSmsProvider -> PASS with httpx.MockTransport: exact request format, 200 with success false, 401, 500, timeout, unsupported contacts, bad input refused before any request, balance. The real API was never called
  Retry (at most 2, transient failures only), daily limit, never-raise -> PASS with the database stubbed (tests/test_notification_flow.py); with a real database NOT RUN
  Visitor SMS once per enquiry, only with consent and a valid Uganda mobile; sms_log and timeline entries -> NOT RUN (need MongoDB)
  Scheduler (reminders every minute, retention daily 03:00) -> jobs registered PASS; reminder claim, working hours, three-reminder limit, retention run against MongoDB NOT RUN. The rules are PASS as pure functions (tests/test_enquiry_rules.py)
  Migration 0002 (enquiries, click_stats, sms_log indexes) -> NOT RUN. CI already runs `python -m app.migrate` twice
  BookingForm (fields, Zod and server validation, focus on first error, role=alert errors, thank-you focus, WhatsApp continue, failure keeps data, honeypot) -> PASS in jsdom (11 tests). Real browser, 390 to 1920 px layout, popup behaviour of window.open, sendBeacon CORS preflight -> NOT RUN
  CI, docker compose, Playwright -> NOT RUN (unchanged)
Files created or changed (paths only):
  backend/app/core/phone.py, config.py; backend/app/jobs.py, main.py, registry.py
  backend/app/modules/enquiries/{models,schemas,rules,repository,service,router}.py
  backend/app/modules/notifications/{models,config,providers,service}.py
  backend/app/modules/clicks/{models,schemas,router}.py
  backend/migrations/0002_enquiries.py
  backend/tests/test_phone.py, test_enquiry_rules.py, test_enquiry_schemas.py, test_sms_providers.py, test_notification_flow.py, test_http_enquiries.py, test_db_enquiries.py
  frontend/src/lib/phone.ts, whatsapp.ts (+ tests); frontend/src/locales/en/booking.ts
  frontend/src/features/public/booking/{BookingForm.tsx,BookingForm.module.css,BookingForm.test.tsx,bookingSchema.ts,bookingApi.ts,bookingApi.test.ts}
  .env.example, docs/MAMBOSMS_NOTES.md
Deviations from spec:
1. The settings module does not exist yet, so notification, SMS and form values (`notify.*`, `sms.*`, `forms.whatsapp_prefix`, `business.whatsapp`) come from environment variables with the spec defaults. `backend/app/modules/notifications/config.py` `load_config` is the single place to change when settings exist. The SMS settings tab, SMS balance figure and "Send test SMS" button are NOT built. New env names are in `.env.example`.
2. A filled honeypot returns 422 with the generic "We couldn't send that" message (spec 6.4 says rejected), not a fake success.
3. Cloudflare Turnstile or proof-of-work (spec 6.4, "configurable") is NOT built. `TURNSTILE_SECRET` is still unused.
4. The reference counter is not in a transaction with the insert (spec 8.1 suggests one). A failed insert leaves a gap in the numbers; the unique index prevents duplicates.
5. Status transitions are my decision (the spec lists statuses only): new to contacted, assessment_booked, not_proceeding or spam; contacted to assessment_booked, not_proceeding or spam; assessment_booked to contacted, care_started or not_proceeding; care_started is final; not_proceeding can go back to contacted; spam can go back to new. "Not proceeding" needs a reason. Owner to confirm.
6. `enquiries` gets four fields not in spec 8.3: `visitor_sms_done`, `reminders_sent`, `last_reminder_at`, `anonymised_at`.
7. Admin list supports q (reference, phone or text index), status, service, assigned_to, from, to, sort. The `area` filter and `GET /enquiries/export` are NOT built (export needs reports).
8. Staff SMS alerts use the same retry rule as the visitor SMS (at most 2 retries, transient failures only). BUILDER 13.2 states the rule for the visitor SMS only.
9. Email goes through `EmailProvider` with `ConsoleEmailProvider` only (no provider chosen). The daily summary email and the new-application email are NOT built (no applications module).
10. Spec 9.8 names `LogOnlySmsProvider`; BUILDER 13 overrides with `ConsoleProvider`. Built as `ConsoleSmsProvider`.
11. Retention: enquiries older than 24 months are anonymised daily at 03:00 Kampala unless status is care_started. Name, phones, note, ip hash, user agent, reason and the whole timeline are cleared; reference, services, area, status and dates stay so reports still work. `sms_log` expires by TTL after 180 days. Applicant deletion is not built (no applications module).
12. The daily SMS limit counts `sent` rows in `sms_log` per Kampala calendar day. At the limit sends are logged as `skipped` and one `sms.daily_limit_reached` audit entry is written per day.
13. `ClickStat.hits` maps to the stored field `count` (a field named `count` shadows Beanie's `Document.count`).
14. Frontend: `BookingForm` takes `submit` and `copy` as props and has its own `bookingApi.ts` fetch, so it needs nothing from S3. S3 or the Contact page job should pass `(p) => apiClient...` and move the copy into its i18n wiring. The Contact page, the service-page card, the Areas suggestions and the settings fetch are NOT built. Types are not generated from the OpenAPI schema.
15. Staff SMS text carries reference, name, area and phone only. The note and anything medical never go into an SMS.
Stops raised: none
NOT DONE: everything marked NOT RUN above; deviations 1, 3, 7, 9, 14; a real MamboSMS test message (see docs/MAMBOSMS_NOTES.md).


## S3 checkpoint (2026-10-20, branch s3, base s4)

PHASE S3 REPORT
Commits: S3.1 to S3.15, one per phase (`git log s4..s3`), plus ledger commits.
Commands run and exit codes (frontend, after `rm -rf node_modules dist && npm ci`):
  npm ci -> 0
  npm run lint -> 0
  npm run typecheck -> 0
  npm run test -> 0 (39 files, 218 tests passed)
  npm run build -> 0 (vite-react-ssg: Rendering Pages (2): dist/index.html, dist/services/index.html; AdminApp is its own chunk, 139 kB, 44 kB gzip)
  npm run format:check -> 0
Backend: not touched in S3 (no backend gate run in this phase).
Acceptance gate:
  Public track (apiClient, types, i18n, Seo, queries, Header, Footer, StickyBar, PublicLayout, 404, PageHero, CtaBand, ServiceCard, Services page) -> PASS in jsdom and on the raw pre-rendered HTML (h1, title, description, Open Graph on `/` and `/services`)
  Admin track (auth store and refresh with CSRF header, LoginPage, scope guards and nav, AdminLayout, primitives, Enquiries list) -> PASS in jsdom
  Admin is code-split and not pre-rendered -> PASS (no `dist/admin`, no admin chunk named in public HTML)
  Spec 12.6 test 6 (navigation and route guard from a mocked scope list) -> PASS (nav.test.ts, guards.test.tsx, AdminLayout.test.tsx)
  Hydration of dist, layouts at 390 to 1920 px, real API round trips (login, refresh cookie with X-CSRF-Token across origins, enquiries list), Playwright, CI -> NOT RUN
Files created or changed: see `git diff --stat s4..s3`.
Deviations from spec: all recorded in docs/STATE.md, entries S3.1 to S3.15.
Stops raised: none
NOT DONE: S3 browser checks; the enquiry detail screen (job G14); user-name lookup for the Assigned column; everything marked NOT RUN above.

## S5.12 Backend lint and schema tests
  `ruff check app tests` -> PASS (all checks passed, ruff 0.17.1)
  `pytest -q` -> PASS (216 passed, 49 skipped; the skips are the MongoDB tests that run in CI)
Files changed: none besides this log. No lint or test fixes were needed.
Stops raised: none
NOT DONE: the 49 MongoDB tests (need a database; CI).

## S5.12 (redo) and S5.13
  S5.12 first ran on main without the batch-01 backend; batch-01 is now merged into main and the check re-run.
  `ruff check app tests` -> was 194 errors (115 E501, 51 E701, 28 I001); fixed with `ruff format` and import sort on the 73 batch files -> PASS
  `pytest -q` -> was 1 failure (`test_openapi_has_no_role_words` hit the team job-title field `role`, spec 7.x); the test now ignores `role` on Team schemas only -> 563 passed, 75 skipped
  S5.13 review of team, faqs, testimonials against services: scopes, audit and version calls, soft delete, publish rules, public schemas and registry all match.
  Small fixes: removed a dead `aliases` branch in faqs and testimonials services; `q` on the team admin list now has max_length 80.
  Review list (not fixed): (1) faqs `service_id` is not checked to exist (services checks `related`); needs a cross-module lookup, decide in S5.14. (2) Team has no unique or slug rule (spec has none). (3) Testimonials approve needs `content:publish` and written permission (spec 7.6), as intended.
  Not run: the 75 MongoDB tests (CI).

## S5.14 areas, pricing, migration 0003
  Review against services: scopes, audit and version calls, soft delete, public schemas, registry and migration 0003 (collection names match the models; pricing `key` unique) all match. Areas have no publish flag (spec 7.x: chips), so no publish rule applies.
  Small fixes: area names are stripped and must be 1 to 100 characters; PATCH on a pricing block now also requires an English title (the create schema already did). Two tests added.
  Review list (not fixed): (1) areas `GET /admin/areas?active=` is accepted and ignored (`active: None` in router, repo discards it); remove with the S5.22 type regeneration. (2) The global "Show prices publicly" switch (spec 7.x Pricing) belongs to the S5.19 settings module; until then every shown block returns its `price_text`, and the seed sets it to "client to supply" with show true, so the public pricing cards would display that placeholder. Decide in S5.19 or empty `price_text` in the seed. (3) Area names are not unique.
  Not run: the MongoDB tests (CI), migration 0003 against a database.

## S5.15 Verify `articles`, `pages` (2026-10-20)
Reviewed against `services`. Fixed: unpublishing (articles `published_at` to null, pages `published` to false) was not gated by `content:publish`; now any change needs it, as in `services`. Required-field null check now uses `_REQUIRED` in both modules (it was unused); dead `aliases` branches removed; pages 404 text "Page not found."; `ContentPageIn.published` defaults to False like `ServiceIn`. Added 3 MongoDB tests per module (publish gating, public visibility after soft delete, null and duplicate rules) and 1 schema test.
Checked OK: all admin routes have `require_scopes`, writes call `audit.record` and `save_version`, soft delete, public schemas hide admin fields, unique indexes in migration 0003, no cross-module imports.
Left as is (one line each): `image_media_id` is not checked against `media`; articles public list returns the full body (no card schema); `pages.public_list` has no route; content undo route still missing (S5.11 note).
Run: ruff clean on both modules, pytest 697 passed, 92 skipped (MongoDB), 1 failed outside scope: `test_settings_rules.py::test_theme_rejects_colours_that_fail_contrast` (S5.19). New DB tests NOT RUN (no MongoDB here).

## S5.16 Verify `media` (2026-10-20)
Checked OK: file type comes from magic bytes (JPEG, PNG, WebP; SVG refused), 10 MB limit read as limit+1 bytes, empty file refused, storage key is `media/<uuid>.<ext>` so the client file name is never used, stored ContentType is the detected one, writes need `media:write`, audited and versioned.
Fixed: private signed links had no upper bound; `clamp_expiry` caps them at 900 s in both S3 and Memory storage. A failed DB insert now deletes the just-stored object (no orphans). Added tests: no `media:write` gets 403, hostile file name, insert failure cleanup, link expiry cap.
Left (known): no image decoding, so a file with a valid header but bad body is accepted; `public_url`, width/height and variants are still TODO (needs an image library); media delete does not check whether a service or article still uses the image; the CV upload path (private bucket) arrives with S5.18. MongoDB-backed new tests NOT RUN here.
