# Nest Home Care Uganda: Builder Instructions

**For:** the implementing model. **Reviewer:** Claude (reviews every phase before the next starts).
**Read this file completely before running any command.** It overrides nothing in the build spec except where Section 3 says so.

---

## 1. Your job in one paragraph

Build the Nest Home Care Uganda website exactly as described in `docs/NEST_HOME_CARE_BUILD_SPEC.md` (v1.1): a React 18 + Vite + TypeScript frontend and a FastAPI + MongoDB backend, in a monorepo, modular on both sides. You work through **all phases in order, without waiting for approval** (Section 6). A phase may start only after its self-check gate passes (Section 6.1). You do not decide anything: every open question is already answered in Section 11. You stop only for the hard blockers in Section 7.

## 2. Hard rules (violating any one fails the phase)

1. **Source of truth order:** (a) this file, (b) the build spec, (c) `reference/nest-home-care-complete.html` for look and behaviour (it wins over the spec on any measured value), (d) the other docs. Never use memory or "common practice" to settle a conflict. Stop and ask.
2. **Do not reopen decisions.** Spec Section 0.3 lists 14 decisions. They are final.
3. **Do not invent content.** Copy, prices, licences, nurse names, testimonials, legal text and the seven non-postnatal service bodies are "client to supply". Use the exact placeholder strings in the spec (Section 12). Never write medical claims.
4. **Do not add features, libraries, pages, fields or settings** not in the spec. No Tailwind, no UI kit, no Redux, no Next.js, no Motor, no SQL.
5. **Use only the pinned versions in Section 4.** Do not run `npm update`, `npm install <pkg>@latest`, or `pip install <pkg>` without a version. Do not change a pin without asking.
6. **Production CSS uses media queries** at `min-width: 700px` and `min-width: 1040px`. Never copy `@container` rules or `cqi` units from the reference (use `vw` where the reference uses `cqi`).
7. **Never claim something works unless you ran it.** Every claim in your report needs the command and its real output (Section 8). If you did not run it, write "NOT RUN".
8. **Never store secrets in the repo.** Only `.env.example` with empty or dummy values.
9. **Never edit** files under `docs/`, `reference/` or `design/` (read-only inputs).
10. **No silent fallbacks.** If a step fails, do not work around it with a different approach. Report the exact error and stop.
11. **Edits to existing files are small diffs, not full rewrites.** Rewrite a file in full only if you created it in the current phase.
12. **Text style in code, comments and UI strings:** plain English, short sentences. No emojis. Use a normal hyphen or a comma, never an em dash.

## 3. Corrections to the spec (these override it)

| # | Spec says | Do this instead | Reason |
| --- | --- | --- | --- |
| C1 | Backend: "Beanie (async ODM on Motor)" | Beanie **2.2.0** with **PyMongo async** (`from pymongo import AsyncMongoClient`). **Do not install `motor`.** | Beanie 2.x depends on PyMongo, not Motor (verified from its package metadata). |
| C2 | "React Router 6" | `react-router-dom` **6.30.6** only. Never 7. | `vite-react-ssg@0.9.2` peers on `react-router-dom ^6.14.1`. |
| C3 | "TypeScript (strict)" | TypeScript **5.9.3** only. Never 6 or 7. | Newest major is a rewrite; tooling not guaranteed. |
| C4 | Pre-render tool "left open" | Use **`vite-react-ssg` 0.9.2** for public routes. Admin routes are NOT pre-rendered (client-only). | Decision made for you so the build is deterministic. |
| C5 | Reference uses container queries | Use media queries (Rule 6). | Spec 0.2. |
| C6 | Admin users have roles (owner, manager, coordinator, editor), role tables in spec 7.7, 7.1, 9.5, enum `user_role`, `require_roles(...)` | **No roles anywhere.** Users carry a list of **scopes** plus an `is_superadmin` flag. Build exactly what Section 12 says. Wherever the spec says "role", a "Roles" column, or Owner, Manager, Coordinator, Editor as a permission concept, apply Section 12 instead. | Owner decision: access is scope-based so each client is set up by granting scopes. |
| C7 | SMS provider "MambaSMS"; visitor SMS off by default; SMS keys in the Notifications tab | Provider is **MamboSMS**. SMS goes to **both staff and visitors**, both switches default **on**, and all SMS settings are editable only with scope `system:manage` (superadmin). Build exactly what Section 13 says. | Owner decision. |

If you find another conflict, do not decide. Use Section 7.

## 4. Pinned versions (all verified to exist on the registries on 2026-10-19)

**Runtime:** Node 22 or newer, Python 3.12 or 3.13 (Beanie 2.2.0 supports both). Do not use Python 3.14.

**Frontend (`frontend/package.json`, use exact versions, no `^` or `~`):**

| Package | Version |
| --- | --- |
| react, react-dom | 18.3.1 |
| react-router-dom | 6.30.6 |
| vite | 7.3.7 |
| @vitejs/plugin-react | 5.2.0 (peer range includes vite 7; already resolved, no lookup needed) |
| typescript | 5.9.3 |
| vite-react-ssg | 0.9.2 |
| @tanstack/react-query | 5.104.4 |
| react-hook-form | 7.90.0 |
| zod | 4.6.7 |
| @hookform/resolvers | 5.9.2 |
| i18next | 26.5.2 |
| react-i18next | 17.1.0 |
| react-helmet-async | 3.0.0 |
| vitest | 3.2.7 |
| @playwright/test | 1.64.1 |

Install with `npm install --save-exact <pkg>@<version>`. After installing, run `npm ls --depth=0` and paste the output in your report. Any `UNMET PEER DEPENDENCY` or `invalid` line is a stop (Section 7).

**Backend (`backend/pyproject.toml`, exact `==` pins):**

| Package | Version |
| --- | --- |
| fastapi | 0.146.0 |
| uvicorn[standard] | 0.54.0 |
| beanie | 2.2.0 |
| pymongo | 4.19.0 |
| pydantic | 2.14.1 |
| pydantic-settings | 2.16.0 |
| argon2-cffi | 25.1.0 |
| pyjwt | 2.15.1 |
| apscheduler | 3.11.3 |
| boto3 | 1.43.114 |
| python-multipart | 0.0.32 |
| httpx | 0.28.1 |
| pytest | 9.1.1 |

Also pin `pytest-asyncio==1.4.0`, `email-validator==2.3.0` and `ruff==0.17.1`. No version in this table needs a lookup; install exactly what is listed. After install run `pip freeze` and paste it in your report.

## 5. Repository setup (do exactly this, in order)

0. **Preflight (first command of the whole job).** Run `bash preflight.sh` from the folder containing this file. It checks git, Node, Python, npm registry, PyPI, and Docker (or `TEST_MONGODB_URI` plus `TEST_S3_ENDPOINT`). If it exits non-zero, raise **one** stop S6 immediately that lists **every** FAIL line, paste the full script output into `docs/BUILD_LOG.md`, and do nothing else. Do not discover missing capabilities one at a time later.
1. The folder `nest-home-care-design-package/` is already extracted next to this file; do not unzip anything. Create the monorepo in a new sibling folder `nest-home-care/` from spec Section 1.2 with these exact top-level folders: `frontend/`, `backend/`, `docs/`, `reference/`, plus `design/` and `assets/` copied unchanged from the package.
2. Copy `nest-home-care-design-package/docs/*` and `nest-home-care-design-package/reference/*` into the monorepo's `docs/` and `reference/` unchanged.
3. Copy `nest-home-care-design-package/design/tokens.css` to `frontend/src/design/tokens.css`. Then diff it against spec Section 2. If any value differs, **stop** (Section 7).
4. Copy the four JPGs from `nest-home-care-design-package/assets/images/` to `frontend/public/images/services/` with the same filenames.
5. `git init`, make a first commit named `chore: import design package`.
6. Create `.env.example` listing every variable in spec Section 9.9 and the two frontend variables `VITE_API_URL`, `VITE_SITE_URL`. Values empty.
7. One commit per numbered work item in Section 6. Commit message format: `phase<N>: <what>`.

## 6. Work orders (run all phases in order; each must pass its gate before the next starts)

Read the listed spec sections **before** writing code for that phase. "Done when" lines are the acceptance gate. Do not start the next phase until every "Done when" line of the current phase is PASS with evidence.

### 6.1 Self-check gate (run at the end of every phase, automatically)

1. Run, from clean: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` in `frontend/`; `ruff check`, `pytest -q` in `backend/`. All must exit 0.
2. Run every command named in that phase's "Done when" lines.
3. Append a checkpoint to `docs/BUILD_LOG.md` using the Section 8 format, with real output.
4. If any check fails: fix it and rerun, up to **3 attempts per failure**. Fix the code, never the test's intent, never by weakening an assertion, skipping a test, or deleting a check.
5. If it still fails after 3 attempts, raise stop S5 (Section 7). Do not move to the next phase.
6. Only when everything is PASS, commit with message `phase<N>: complete` and start the next phase.

### Phase 0: foundations (spec 1, 2, 3, 4.1 to 4.4, 4.16, 13)
Build: repo, lint and format config, CI workflow (lint, typecheck, unit tests, build), `tokens.css`, `global.css`, `shapes.module.css`, fonts (self-hosted WOFF2, `font-display: swap`), `Logo`, `Weave`, `Button`, `Rule`, `AccentText`, `Chip`, `Field`, `Badge`, `Accordion`.
**Pre-render spike (mandatory, first):** create one route `/` and one route `/services` with `vite-react-ssg`, run `npm run build`, and show that `dist/index.html` and `dist/services/index.html` each contain a real `<h1>`, `<title>` and `<meta name="description">` in the raw HTML (`curl`-style check with `grep`, not a browser). If this fails, stop and report the exact error. Do not substitute another tool.
Done when: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all exit 0; a `/design` dev-only route shows every component; the spike check passes.

### Phase 1: public core + enquiry capture (spec 4, 5.1 to 5.4, 5.11, 6, 8, 9.1 to 9.3, 9.6 to 9.9)
Build: Header, Footer, StickyBar, PageHero, Strip, Eggs (three eggs), ServiceCard, Rings, Steps, CtaBand, Home, Services overview, Service detail (all 8 slugs from spec 12.1, only postnatal has real sample copy), About, Contact; BookingForm with the exact fields and validation in spec 6.1 and 6.4; the hybrid submit flow in 6.2 (save, then offer "Continue on WhatsApp"); backend modules `settings`, `services`, `enquiries`, `health`; MongoDB collections and indexes; seed script; Dockerfile.
Done when: the booking form creates an `enquiries` document with status `new` and a reference number; honeypot, rate limit and consent checks reject bad input (tests prove it); pages match the reference at 390, 820, 1024, 1280 and 1920 px (screenshots attached); `docker build` succeeds.

### Phase 2: admin core (spec 7.1 to 7.4, 7.8, 7.10, 9.4, 9.5, 9.8)
Build: scope model (Section 12), login with refresh cookie, Dashboard, Enquiries (list, detail, status, notes, assign), Site settings, activity log, notifications through the provider interface **with a `ConsoleProvider` for SMS and email only**. `MamboSmsProvider` is implemented per Section 13.1 and tested with mocked HTTP only.
Done when: scopes are enforced server-side (Section 12.6 tests); every admin write creates an audit entry; the cookie flow works from a different origin (state the two origins you tested).

### Phase 3: remaining content (spec 5.5 to 5.9, 5.12, 7.6, 12, 17)
Build: Team, How it works and pricing ("Free assessment", "Your quote", "Your care plan", no prices), Areas, FAQ, Privacy, remaining services, Content manager, Media library, language registry and `react-i18next` wiring (English only enabled; switcher hidden).
Done when: all 11 page types render with placeholders marked as in spec 12; no hard-coded user-facing string exists outside `locales/` or the database (grep proof).

### Phase 4: careers and hiring (spec 5.10, 6.3, 7.5, 7.7, 7.9)
Build: Careers pages, application form with CV upload (PDF or Word, under 5 MB, private bucket, time-limited links), Applications pipeline, Users and scopes screen (Section 12.5), Reports (CSV).
Done when: an upload over 5 MB or of a wrong type is rejected by the server (tests); CV links expire.

### Phase 5: search and polish (spec 10.3, 11, 10.5, 13.2)
Build: pre-render every public route, sitemap, robots, canonical and JSON-LD per spec 11, `noindex` on the Vercel review domain, deploy-hook call on publish, Playwright critical flows.
Done when: raw HTML of every public route contains its own title, description, canonical and JSON-LD (grep proof for all routes); Playwright flows in spec 13.2 pass.

## 7. Stop list (hard blockers only)

Everything not on this list you must resolve yourself using Section 11 and the spec. Do not stop for questions already answered.

| Id | Stop when |
| --- | --- |
| S2 | A spec value and the reference HTML disagree and Section 3 does not cover it. Reference wins on measured values: log it under "Deviations" and continue. Stop only if the reference itself is ambiguous. |
| S3 | A pinned package fails to install, shows a peer warning, or a pin does not exist. |
| S4 | The spec contradicts itself on something you must build and Section 11 does not decide it. |
| S5 | A self-check still fails after 3 attempts (Section 6.1). |
| S6 | Preflight fails, or a credential, account or external service you cannot create yourself is required (for example a real MongoDB Atlas URI). Use local Docker MongoDB and MinIO for development and tests; if Docker is missing, tests need `TEST_MONGODB_URI` (a replica set) and `TEST_S3_ENDPOINT` supplied by the owner. Never replace MongoDB with a mock or another database to get tests passing. |

On stop, write to `docs/BUILD_LOG.md` and to the chat: `STOP <id>: <one-sentence problem>. Spec section: <n>. Options: <A>, <B>. My recommendation: <A or B>.` Then halt all work.

---

## 8. Checkpoint format (append to `docs/BUILD_LOG.md` after every phase; send the final one in chat when all phases are done)

```
PHASE <n> REPORT
Commits: <hash and message per commit>
Commands run and exit codes:
  <command> -> <exit code>
  <paste final 10 lines of output for each of: lint, typecheck, test, build, pytest>
npm ls --depth=0 : <pasted>
pip freeze : <pasted>
Acceptance gate (copy each "Done when" clause):
  <clause> -> PASS or FAIL or NOT RUN, with evidence (command output or screenshot path)
Files created or changed (paths only):
Deviations from spec: <none, or list with spec section and reason>
Stops raised: <none, or list>
NOT DONE: <anything unfinished>
```

A checkpoint with a missing section is rejected. Do not summarise or paraphrase command output. "Should work" and "looks fine" are not evidence.

## 9. Quality bars that apply to every phase

- **Accessibility:** spec 10.4 checklist. Visible focus ring, 44 px minimum tap targets, labels on every field, `alt` on every image, colour contrast per tokens.
- **Performance:** no image over 200 KB; no font other than the three in spec 1.1; no third-party script except what spec 10.5 lists.
- **Privacy:** the booking form collects only the fields in spec 6.1. No medical detail anywhere. Consent text exactly as spec 6.1.
- **Modularity (spec 1.3):** each backend module exposes one router; modules talk to each other only through `service.py`. Each frontend feature exposes one route object. A cross-module deep import is a failure.
- **Tests:** every endpoint has at least one success and one failure test. Every form has validation tests.
- **Types:** frontend API types are generated from the backend OpenAPI schema (spec 1.2 `types/`); do not hand-write them.

## 10. What the reviewer already knows

- The pins in Section 4 were checked for existence and peer compatibility, but **the full build has not been run**. That is why the Phase 0 spike is mandatory and first.
- Claude reviews the finished `docs/BUILD_LOG.md` and the repo after the last phase. Weak or missing evidence in the log is treated as NOT DONE.

## 11. Resolved questions (spec Section 16; these are final, do not ask again)

| # | Question | Answer you must build to |
| --- | --- | --- |
| 1 | SEO tooling | `vite-react-ssg` 0.9.2 pre-render of public routes; `sitemap.xml` listing every public route per enabled language; `robots.txt`; per-page title, description, canonical, Open Graph and JSON-LD (`LocalBusiness`, plus `Service` on service pages). `noindex` while `SEO_INDEX=false`. |
| 2 | Local languages | Registry holds `en` (enabled), then `lg` (Luganda), `sw` (Swahili), `nyn` (Runyankole), `ach` (Acholi) as **disabled** (owner confirmed defaults). Nothing but English is translated or enabled. Never machine-translate. |
| 3 | International languages | Registry also holds `fr` (French) as **disabled**. **No `ar` entry** (Arabic is undecided). Write layout CSS with logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline`, `text-align: start`) so right-to-left can be added later without a rewrite. Switcher stays hidden until a second language is enabled. |
| 4 | Render or Northflank | Render (default, treated as confirmed). Deliver one `backend/Dockerfile` and a `render.yaml`. No Northflank-specific code. Health check `/api/v1/health`. |
| 5 | MamboSMS | See Section 13. Visitor and staff SMS both on; switchable only with `system:manage`. |
| 6 | Alert contacts | Depend on the client. Stored in admin settings keys `notify.enquiry_emails`, `notify.application_emails`, `notify.sms_number` (spec 7.8), editable with `settings:write`. Seed them from env `ALERT_EMAILS` and `ALERT_PHONES` (comma separated, empty allowed, empty in `.env.example`). Never hard-code. |
| 7 | Retention | Confirmed by owner. Applicant data kept 12 months, then deleted. Unconverted enquiries anonymised after 24 months. Implement as an APScheduler daily job with tests using a mocked clock. |
| 8 | Testimonials and blog | Default confirmed. Phase 5 scope only as far as admin content type and public list; empty state when none approved. |
| 9 | WhatsApp | Confirmed by owner (the API costs money). Click-to-chat links (`https://wa.me/256787499988?text=...`). No Business API. |
| 10 | Content owner and first user | Depends on the client: a client is set up by creating a login and granting scopes (Section 12). The seed script creates the first **superadmin** from env `FIRST_SUPERADMIN_EMAIL` and `FIRST_SUPERADMIN_PASSWORD` (these replace `FIRST_OWNER_*` everywhere). Fail the seed if either is empty. Never print the password. |
| 11 | Database | MongoDB. Development and tests use a local `mongo:7` container with a replica set (needed for transactions). Atlas is production only. |
| 12 | Storage | S3-compatible via `boto3`. Development and tests use a local MinIO container. Two buckets: public media and private CVs. |
| 13 | Pricing | "Free assessment", "Your quote", "Your care plan". No prices anywhere. |
| 14 | Domain | None yet. Frontend uses `VITE_SITE_URL`. Review site is on a Vercel free domain, `noindex`. |
| 15 | Cross-site cookie | Implement the Vercel rewrite fallback from spec Section 15 as a documented option, and make the API client base URL configurable so either setup works. |

Include a `docker-compose.dev.yml` at repo root running `mongo:7` (replica set initiated) and MinIO, and a `README.md` with the exact commands to start dev, run tests and build.

## 12. Scope model (replaces all roles; overrides spec 7.1, 7.7, 9.1, 9.5, 8.2 `user_role`, 8.3 `users`)

### 12.1 Rules
1. There is **no `role` field, no role enum, no role names, no role badge** anywhere (database, API, UI, tests, seed, docs). Remove the Owner and Manager badges from the UI. The top bar shows the user's name and, only for superadmins, the label "Superadmin".
2. A user document has `scopes: list[str]` and `is_superadmin: bool` (default false) in place of `role`. All other `users` fields in spec 8.3 stay.
3. `is_superadmin` implies every scope in the registry, including `system:manage`. **No scope implies another** (`enquiries:write` does not grant `enquiries:read`). The Users screen auto-ticks the matching read scope when a write scope is ticked, but the server checks each scope separately.
4. The scope registry is one Python file, `backend/app/modules/auth/scopes.py`, with each scope's id, group and label. The frontend loads it from `GET /admin/scopes` (needs `users:read`). Never duplicate the list in the frontend.
5. Access tokens carry the user's `scopes` and `is_superadmin`. Refreshing a token re-reads them from the database. Changing a user's scopes also signs that user out (the existing `POST /users/{id}/sign-out` logic).
6. The server is the authority. Hiding things in the frontend by scope is convenience only.

### 12.2 Scope registry (exact ids; add none, remove none)

| Group | Scope | Allows |
| --- | --- | --- |
| Dashboard | `dashboard:view` | `GET /dashboard` and the `/admin` screen |
| Enquiries | `enquiries:read` | list and detail |
| | `enquiries:write` | change status, assign, add notes, create manually |
| Careers | `jobs:read` | list and open jobs |
| | `jobs:write` | create, edit, publish, close, delete jobs |
| Applications | `applications:read` | list, detail, CV link |
| | `applications:write` | change stage, rating, decline reason, notes |
| Content | `content:read` | view content tabs |
| | `content:write` | edit drafts, reorder, undo last change |
| | `content:publish` | publish content (triggers the deploy hook) |
| Media | `media:write` | upload, edit alt text, delete (listing needs `content:read`) |
| Translations | `translations:write` | edit translated text |
| | `translations:review` | mark a translation as reviewed |
| Settings | `settings:read` | view site settings tabs except SMS |
| | `settings:write` | edit Business, Homepage, Forms, Notifications recipients and reminder timing, Appearance, SEO, Languages |
| Users | `users:read` | list users, read the scope registry |
| | `users:write` | invite, edit scopes, deactivate, reset password, force sign-out |
| Reports | `reports:read` | summary |
| | `reports:export` | CSV and Excel export |
| Activity | `activity:read` | activity log |
| System | `system:manage` | SMS settings (Section 13) and retention settings. Only a superadmin can grant it. |

### 12.3 Route to scope map (replaces the "Roles" column in spec 7.1)

A route is visible and reachable only if the user has **all** scopes listed.

| Route | Needs |
| --- | --- |
| `/admin` | `dashboard:view` |
| `/admin/enquiries`, `/admin/enquiries/:id` | `enquiries:read` (actions need `enquiries:write`) |
| `/admin/careers`, `/admin/careers/new`, `/admin/careers/:id` | `jobs:read` (editing needs `jobs:write`) |
| `/admin/applications`, `/admin/applications/:id` | `applications:read` (actions need `applications:write`) |
| `/admin/content` | `content:read` (editing `content:write`, publishing `content:publish`, uploads `media:write`) |
| `/admin/settings` | `settings:read` (saving `settings:write`; the SMS tab needs `system:manage`) |
| `/admin/users` | `users:read` (changes need `users:write`) |
| `/admin/reports` | `reports:read` (export buttons need `reports:export`) |
| `/admin/activity` | `activity:read` |

Navigation shows only reachable items. A user who can reach none sees a plain page: "No access has been granted to this account", with the business phone number. The phone bottom nav shows the first four reachable items plus "More".

### 12.4 API enforcement
Replace `require_roles(...)` with `require_scopes(*scopes)` (all listed scopes required; superadmin passes). Map every endpoint in spec 9.5 to the registry using the read and write split: GET needs the read scope; POST, PATCH, PUT, DELETE need the write scope. The activity log records the acting user and the scope that authorised the action.

### 12.5 Users and scopes screen (replaces spec 7.7)
List columns: Name, Email, Access (number of scopes, or "Superadmin"), Last login, Status (Active, Invited). "+ Invite user" sends an email invite (valid 7 days) and shows a scope checklist grouped by the Group column in 12.2, with a plain-language label per scope. The server enforces:
- A user can grant or remove only scopes they hold themselves, and only with `users:write`.
- `system:manage` and `is_superadmin` can be granted or changed only by a superadmin.
- The last active superadmin cannot be deactivated, demoted or deleted.
- A user cannot change their own scopes.
- The TOTP prompt at login (when TOTP is enabled) applies to anyone with `users:write` or `system:manage`, and to superadmins.

### 12.6 Required tests
1. For every admin endpoint (parametrised, generated from the registered routes so a new endpoint without a scope fails): right scope succeeds; no scopes returns 403; only the matching read scope on a write endpoint returns 403.
2. A superadmin passes every endpoint.
3. Escalation: a `users:write` user cannot grant a scope they lack, cannot grant `system:manage`, cannot edit their own scopes.
4. Last-superadmin protections.
5. Changing a user's scopes invalidates that user's refresh token.
6. Frontend: navigation and route guard show or hide items from a mocked scope list.

## 13. SMS (MamboSMS) (overrides spec 9.8 and the SMS rows of 7.8)

### 13.1 MamboSMS API (verified from https://www.mambosms.com/api on 2026-10-19; implement exactly this)

- **Base URL:** `https://api-mongolia.mambosms.com/v1` (env `MAMBOSMS_BASE_URL`, this value as default).
- **Auth:** header `Authorization: <api key>` with the key alone. **No `Bearer` prefix.** Key from env `MAMBOSMS_API_KEY` (empty in `.env.example`). Never store it in the database, logs or any admin screen.
- **Send:** `POST {base}/send-sms`, `Content-Type: application/json`, body fields (all required):

| Field | Type | Rule |
| --- | --- | --- |
| `message` | string | SMS text |
| `recipients` | string | comma-separated numbers; send as `07XXXXXXXX` local format exactly like the docs examples; never `+256` |
| `message_category` | string | `non_customised` (random sender number), `info` (prefixed with INFO sender ID) or `customised` (registered sender ID on MTN, Airtel, UTL) |
| `sender_id` | string | maximum 11 characters |

- **Success shape:** `{"statusCode": 201, "success": true, "messages": [...], "data": {"recipients_count", "message_count", "sms_sent", "sms_cost", "new_balance", "unsupported_contacts_count", "unsupported_contacts": []}}`.
- **Balance:** `GET {base}/accounts/balance`, same header, no body. Returns `data.balance` (integer).
- **Failure shape:** `{"statusCode": ..., "success": false, "messages": [...], "data": []}`. **The HTTP status can be 200 while `success` is false** (for example "Account is inactive or suspended"). **Treat a send as successful only when HTTP is 2xx AND `success` is `true` AND `unsupported_contacts_count` is 0 for that recipient.** Anything else is a failure: store `messages` as the error. Documented codes: 400 bad request, 401 invalid or missing key, 405 wrong method, 500 server error.
- **Not documented, so do not assume:** rate limits, retries, delivery reports, webhooks, whether `+256` is accepted, per-message length limits, a sandbox. Do not build features that need them.

Build:
1. `SmsProvider.send(to: list[str], text: str, sender_id: str, category: str) -> SendResult` and `SmsProvider.balance() -> int`.
2. `ConsoleProvider` (default when `SMS_PROVIDER=console`) logs instead of sending.
3. `MamboSmsProvider` (when `SMS_PROVIDER=mambosms`) using `httpx.AsyncClient`, timeout 10 seconds, no automatic retry inside the provider (retries are the caller's job, Section 13.2).
4. Normalise every phone to Uganda local format `07XXXXXXXX` before sending (use the spec's phone normalisation; reject anything that is not a valid Uganda mobile).
5. Tests use `httpx.MockTransport` with these exact response shapes: success, 401, 200 with `success: false`, 500, timeout, and `unsupported_contacts_count > 0`. **Tests and CI must never call the real API.**
6. Keep each visitor SMS to one segment: the default text is under 160 characters; the SMS settings screen shows a character counter and warns above 160.
7. Create `docs/MAMBOSMS_NOTES.md` recording the facts above and the "not documented" list.

### 13.2 Behaviour (both audiences, on by default)

| Trigger | Staff SMS | Visitor SMS |
| --- | --- | --- |
| New enquiry | to every number in `notify.sms_number` (a list) when `sms.staff_enabled` | to the enquiry's normalised phone when `sms.visitor_enabled`, text from `sms.visitor_text`, default: "Thank you for contacting Nest Home Care. A nurse will call you shortly." |
| Enquiry still New after `notify.reminder_minutes` in working hours | reminder, up to 3 times (spec 9.8) | none |
| New application | email only | none |

- Sending runs as a background task after the enquiry is saved. **A failed or slow SMS must never fail or delay the enquiry submission.** Record each attempt (provider, to, status, error, time) on the enquiry timeline and in an `sms_log` collection.
- Visitor SMS is sent once per enquiry, retried at most 2 times, and only when the phone normalises to a valid Uganda mobile number and the consent box was ticked.
- Never put medical details or the visitor's note in any SMS.
- `notify.hours_from` and `notify.hours_to` apply only to reminders, not to the first alert.

### 13.3 Settings (new Settings tab "SMS", visible and editable only with `system:manage`)
Keys: `sms.provider` (read-only display of the env value), `sms.sender_id` (max 11 characters), `sms.message_category` (`non_customised`, `info` or `customised`; default `info`), `sms.staff_enabled` (default true), `sms.visitor_enabled` (default true), `sms.visitor_text`, `sms.daily_limit` (default 200; at the limit, stop sending and write an activity-log entry), a read-only "SMS balance" figure fetched from the balance endpoint (cached 5 minutes; shows "unavailable" on any error), and a "Send test SMS" button that sends to one number entered by the superadmin and shows the result. Remove `notify.sms_new_enquiry` and `notify.sms_confirm_visitor` from the Notifications tab (replaced by the two switches above). `notify.sms_number` and `notify.reminder_minutes` stay in Notifications under `settings:write`.
