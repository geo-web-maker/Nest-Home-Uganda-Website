# S5 and S6 split into free-session phases (Well Nest Home Care, remaining work)

Same idea as `S3_PLAN.md`: every phase is one fresh free session, touches 1 to 6 files, needs only the uploads it lists, and ends with one cheap check line and one commit.

## What the zip showed (read once)

Measured on `nest-home-care-S5-corrected.zip`, branch `main`, from a clean `npm ci`:

- `docs/STATE.md` says G1 to G22 are all TODO, but the tree holds **88 uncommitted, never-verified files**: 8 backend content modules with tests and migration 0003, 9 presentational components, 12 public pages, 9 admin screens, extended `locales/en/*.ts`, and edits to `routes.tsx`, `AdminApp.tsx`, `screens.tsx`, `registry.py`, `seed.py`. This is the returned ChatGPT batch (G1 to G20, parts of G21 and G22). Treat all of it as **UNVERIFIED**.
- Frontend gate on that tree: `tsc` 2 syntax errors (`admin/users/UsersPage.tsx` lines 35 and 36), `eslint` 2 errors (unused `CtaBand` in `ServiceDetailPage.tsx` and one more), `vitest` **21 files and 55 tests failing**, 4 unhandled errors from `Head` (vite-react-ssg's helmet crashes when a page test does not mock it, see S3.4 note).
- Backend: not run (this sandbox had no ruff or pytest). The 8 modules and migration 0003 have never executed.
- Admin screens already call endpoints that **no backend module provides**: `/admin/jobs`, `/public/jobs`, `/admin/applications` (and the public apply POST), `/admin/dashboard`, `/admin/reports/summary`, `/admin/activity`, `/admin/users`, `/admin/settings`, `/public/site`. `backend/app/modules/jobs/` holds only `seed.py`.
- `ContentPage` calls both `/admin/${tab}` and `/admin/content/${tab}/...`; only the first matches the backend routers.
- `job-detail/` has no `index.ts`; `enquiry-detail`, `jobs/JobEditorPage` and `ApplicantDetailPage` are not all registered as routes.

## Setup facts

- **Do not send new work to ChatGPT.** The returned batch is the ChatGPT output; from here Claude (free) does the fixing and the missing parts. Group A of this plan replaces "VERIFY batch-01" from `WORK_SPLIT_GUIDE.md` section 6.
- **Step 0 (you, not Claude, 2 minutes):** `git switch -c batch-01 && git add -A && git commit -m "batch-01: returned ChatGPT files, UNVERIFIED"`. This protects the 88 files. Set G1 to G20 to RETURNED in `docs/STATE.md` (S5.0 below does it properly).
- Each phase uses branch `batch-01`, one commit per phase, message `S5.n: <what>`. `main` stays green.
- **Paste `PASTE_FIRST.txt` first**, then the matching block below (A for frontend fixes, B for backend), then the phase text. Return format: changed files in full, nothing else.
- **Failing-test phases need the failure text.** Run the check line on your machine first and paste only the **first error line per failing test** (about 15 lines). Claude then needs no npm run.
- **Never upload** `package-lock.json`, `requirements.lock`, `openapi.json`, `api.d.ts`, images, fonts, `.git`, or the 91 KB spec. Paste the one spec section a phase names (the excerpts folder covers E1 to E7; for sections not in an excerpt, paste only the lines named).

### Standing block A (frontend fixes, add under PASTE_FIRST)

```
This is a FIX phase on files that already exist. Change only what the failure text and the phase name. Do not redesign, rename, or add features. Keep every exported name and prop. Return changed files in full. If a test is wrong rather than the component, change the test and say so in one line. List the "Done when" items yes or no.
```

### Standing block B (backend, replaces the frontend wording in PASTE_FIRST)

```
You are continuing the Well Nest Home Care Uganda backend (Python 3.12, FastAPI, Beanie on MongoDB, pytest, ruff). Copy the structure of backend/app/modules/services/ (models, schemas, repository, service, router, seed) that I upload. No roles, scopes only (`require_scopes`). Every admin route needs a scope and an audit entry on change. No new libraries. Register routers and models only in app/registry.py. Tests that need MongoDB are marked like test_db_services.py and may skip here. Never claim a check passed unless you ran it. Return changed files in full, then 3 lines. Same BUDGET RULES as PASTE_FIRST.
```

## Phase map

| Phase | What | Size | Needs |
| --- | --- | --- | --- |
| S5.0 | Ledger: record the batch, correct STATE | small | step 0 |
| **A. Stabilise the returned frontend** | | | |
| S5.1 | Syntax and lint (`UsersPage`, unused imports) | small | S5.0 |
| S5.2 | One shared `Head` mock so page tests stop crashing | small | S5.1 |
| S5.3 | Components: `MapPlaceholder`, `Steps` | small | S5.2 |
| S5.4 | Public pages a: About, HowItWorks, Privacy, Home | medium | S5.2 |
| S5.5 | Public pages b: ServiceDetail, Article (FAQ), `routes.test` | medium | S5.2 |
| S5.6 | Careers: CareersPage, ApplicationForm, JobDetail (+ `index.ts`) | medium | S5.2 |
| S5.7 | Admin a: EnquiryDetail, route registration | medium | S5.2 |
| S5.8 | Admin b: Jobs list, JobEditor, route registration | medium | S5.2 |
| S5.9 | Admin c: Applications, ApplicantDetail | medium | S5.2 |
| S5.10 | Admin d: Reports, Activity, Dashboard | medium | S5.2 |
| S5.11 | Admin e: Content tabs (route shape), Settings, Users | medium | S5.2 |
| **B. Backend: verify what exists** | | | |
| S5.12 | Run ruff and pytest on the batch; fix lint and schema tests | small | Python venv |
| S5.13 | Verify `team`, `faqs`, `testimonials` | small | S5.12 |
| S5.14 | Verify `areas`, `pricing`, migration 0003 | small | S5.12 |
| S5.15 | Verify `articles`, `pages` | small | S5.12 |
| S5.16 | Verify `media` (upload validation, private links) | medium | S5.12 |
| **C. Backend: missing modules** | | | |
| S5.17 | `jobs` module (public list and detail, admin CRUD) | medium | S5.13 |
| S5.18 | `applications` module (public apply, admin list and detail, CV link) | medium | S5.17, S5.16 |
| S5.19 | `settings` module and `GET /public/site` (replaces `DEFAULT_SITE`) | medium | S5.13 |
| S5.20 | Admin users API (list, create, patch, scopes) | medium | S5.13 |
| S5.21 | `dashboard`, `reports/summary`, `activity` endpoints | medium | S5.17 to S5.20 |
| S5.22 | Regenerate types, fix type drift, scope-coverage test (12.6) | small | S5.21 |
| **D. Strings, seed, wiring** | | | |
| S5.23 | Hard-coded string audit (spec definition of done 5) | small | A done |
| S5.24 | Seed files check (G22): services, areas, FAQ, pricing, jobs | small | S5.17 |
| S5.25 | Public site wiring: Contact page, `useSiteSettings` from API | medium | S5.19 |
| **E. S6** | | | |
| S6.1 | Push, first CI run, paste failures | you | all of S5 |
| S6.2 | Fix `.github/workflows/ci.yml` from the real log | small | S6.1 |
| S6.3 | Pre-render every public route (loaders, 404.html) | medium | S6.2 |
| S6.4 | Raw-HTML SEO check script | small | S6.3 |
| S6.5 | Playwright: booking, login, enquiries flows | medium | S6.2 |
| S6.6 | Playwright: screenshots at 390, 820, 1024, 1280, 1920 | small | S6.5 |
| S6.7 | Backend Dockerfile and `render.yaml` | small | S6.2 |
| S6.8 | Deploy config and env checklist | small | S6.7 |
| S6.9 | Final review: definition-of-done greps | medium | all |

Order inside a track is fixed. A (frontend) and B and C (backend) can alternate. D after A and C. E last.

---

## Recommended follow-ups (added 2026-10-20, found in the S5.7 review; none blocks S5.8 to S5.11)

| # | Item | Do it in | Why it waits |
| --- | --- | --- | --- |
| R1 | **DONE in S5.18 (not run).** **Honeypot on the Careers form.** `ApplicationForm` has no honeypot input, although spec 6.3 lists one and the copy already has a `website` key (`locales/en/site.ts`, label "Leave this field empty"; `ApplicationForm.module.css` already has `.honeypot`). Add the hidden input, send it with the apply POST, and test that a filled value is sent. | **S5.18** (applications module), so the backend rejects it the same way `enquiries` does (422) | A frontend-only honeypot has nothing to pair with until the apply endpoint exists |
| R2 | **Closing-date label.** `careers.closes` is `Closes {{date}}`, but `JobCard` prints `{closingLabel}: {closesOn}`, so a closing date shows as "Closes {{date}}: 2026-...". Fix: `CareersPage` passes `t('careers.closes', { date: job.closes_on })` and `JobCard` prints that string alone (drop the colon). Update `JobCard.test.tsx` and `CareersPage.test.tsx`. | The next session that touches careers (S5.6 follow-up or S5.18 wiring) | Cosmetic, only visible for a job with a closing date; seed jobs have none |
| R3 | **Label changes need owner sign-off.** Spec 6.3 is the authority for the changed Careers form labels. Add them to the owner-confirm list. | **S6.9** owner-confirm list | Needs the owner, not code |

## S5.0 Ledger

- **Upload:** `docs/STATE.md` (paste the "ChatGPT jobs" table and "Next action" only).
- **Task:** set G1 to G20 to RETURNED (G17 and G18 note "tabs: see S5.11"), G21 and G22 to "partial". Replace Next action with the S5.1 line. Add one Decisions line: "batch-01 holds the unverified returned files; verification follows S5_PLAN.md".
- **Check:** none.

## A. Stabilise the returned frontend (use standing block A)

Each A phase: upload the failing test file, its component, its `types.ts`, and the first-error lines. Check line is the same shape each time, with paths swapped:
`cd frontend && npx tsc --noEmit && npx eslint <paths> --max-warnings=0 && npx vitest run <paths> 2>&1 | tail -15`

### S5.1 Syntax and lint
- **Upload:** `features/admin/users/UsersPage.tsx`, `features/public/services/ServiceDetailPage.tsx`, the second eslint error file (run `npx eslint src --max-warnings=0` and paste the file name).
- **Task:** lines 35 and 36 of `UsersPage.tsx` are single enormous lines with a missing comma; reformat with prettier and fix the syntax. Remove the unused `CtaBand` import (or use it, if the spec 5.3 page ends with the CTA band; check the ServiceDetail test). Fix the other lint error.
- **Done when:** `tsc` and `eslint src` print nothing.

### S5.2 One `Head` mock
- **Upload:** `components/site/Seo.test.tsx` (how it mocks `Head`), `test-setup.ts`, one failing page test (`ArticlePage.test.tsx`).
- **Task:** the crash is `react-helmet-async` reading `add` of undefined when a page renders `Seo` without a mock. Add one mock of `vite-react-ssg`'s `Head` in `test-setup.ts` (render children nowhere) and remove duplicate mocks from tests that have one. `Seo.test.tsx` must still prove the tags.
- **Done when:** no "Cannot read properties of undefined (reading 'add')" in a full `npx vitest run 2>&1 | grep -c "reading 'add'"`.

### S5.3 Components
- **Upload:** `components/site/MapPlaceholder.tsx` and test, `Steps.tsx` and test, the failure lines, spec 4.15 and 4.11 text (paste).
- **Done when:** both test files pass.

### S5.4 to S5.6 Public pages
- **Upload per phase:** the failing tests and components named in the map, each page's `types.ts`, `locales/en/site.ts` (paste only the keys the page reads), `ServicesPage.tsx` as the pattern. S5.6 also adds `job-detail/index.ts` and checks the careers routes in `routes.tsx` (paste the changed lines).
- **Rule:** a page test mocks `apiClient`, not the hook (STATE pattern line). If a failure is "no such i18n key", the missing key goes into `site.ts` using only text the spec gives; otherwise stop and ask one question.
- **Done when:** the listed test files pass and the page appears in `routes.tsx`.

### S5.7 to S5.11 Admin screens
- **Upload per phase:** failing tests and components named in the map, `EnquiriesPage.tsx` and `useEnquiries.ts` as the pattern, `features/admin/AdminApp.tsx`, `screens.tsx`, `nav.ts`.
- **Decisions to make inside the phase (record in the commit message):**
  - S5.7/S5.8/S5.9: register `enquiries/:id`, `careers/:id`, `applications/:id` inside `AdminApp.tsx`; the list rows already link there.
  - S5.11 Content: pick **one** route shape. Recommended: `/admin/${tab}` everywhere (that is what the backend routers provide); change `ContentPage` and its test, not the backend.
  - S5.11 Settings: the SMS tab shows only with `system:manage`; the backend (S5.19) is not built, so tests mock the client.
  - S5.11 Content, found in review: `ContentPage` calls `POST /admin/content/${tab}/${id}/undo`, and **no backend router has an undo or restore route**. Do not change the backend. Recommended: hide the Undo button until a versions endpoint exists (and add "undo" to the S5.15 review list), or keep it marked TODO. Record the choice in the commit message.
  - Already registered in `AdminApp.tsx`: `enquiries/:id`, `careers/new`, `careers/:id`, `applications/:id`. S5.8 and S5.9 only confirm that, they do not add it.
- **Done when:** listed tests pass; `adminScreens` and `AdminApp` routes cover every nav path.

After S5.11 run the **full frontend gate once** on your machine: `npm run lint && npm run typecheck && npm run test && npm run build && npm run format:check`, paste the last 15 lines of anything that fails, and fix in a "S5.11b" session.

## B. Backend: verify what exists (use standing block B)

Run once on your machine: `cd backend && pip install -r requirements.lock -q && ruff check app tests && pytest -q 2>&1 | tail -15`. Tests marked for MongoDB skip locally (49 skipped before this batch) and run in CI.

### S5.12 Lint and schema tests
- **Upload:** only the files ruff and pytest name, with the first error lines.
- **Done when:** `ruff check app tests` is clean and `pytest -q` shows no failures (skips allowed).

### S5.13 to S5.15 Module review
- **Upload per phase (each module):** `models.py`, `schemas.py`, `service.py`, `router.py`, its `test_db_*.py`, and the `services` module's `router.py` and `service.py` as the pattern, plus `auth/scopes.py`.
- **Task:** compare against the pattern only: every admin route has `require_scopes`, every write calls the audit service and saves a content version where `services` does, soft delete and publish rules match, public routes return public schemas with no admin fields, nothing imports another module's internals. Fix small differences; list bigger ones in one line each.
- **Done when:** the module's schema tests pass and the review list is written.

### S5.16 `media`
- **Upload:** `media/*.py`, `test_media_upload.py`, `core/storage.py`, `auth/scopes.py`.
- **Task:** check upload validation (type by content, size limit, filename sanitising) and that private files are served only by short-lived links. This is the security-rule class from WORK_SPLIT "never give to ChatGPT", so fix rather than rework.
- **Done when:** upload tests pass for a bad type, an oversize file and a good file.

## C. Backend: missing modules (use standing block B)

Each phase creates `models, schemas, repository, service, router`, a seed where the spec has one, a schema test and a `test_db_*.py`, and registers in `registry.py`. Upload the `services` module files as the pattern, the spec 8.3 rows for the collection (paste), and the frontend `types.ts` and page that call it, so the API matches what the screen already expects.

### S5.17 `jobs`
- **Task:** `GET /public/jobs`, `GET /public/jobs/{slug}`; `/admin/jobs` list, create, get, patch (scopes `jobs:read` and `jobs:write`, check `scopes.py` for the real ids). Existing `modules/jobs/seed.py` is the seed.

### S5.18 `applications`
- **Task:** public apply POST (consent, honeypot, rate limit as in `enquiries`; also do **R1**, the frontend honeypot input, so both sides land together), admin list and detail, status change, CV link. CV storage and links follow `media` (S5.16). The daily new-application email in S4 deviation 9 stays out.

### S5.19 `settings`
- **Task:** key/value settings with the groups the `SettingsPage` tabs read, `GET /public/site` (public subset), `PATCH /admin/settings/{tab}`, `POST /admin/settings/theme/reset`. The SMS tab and secrets need `system:manage`. Then switch `lib/queries/site.ts` from `DEFAULT_SITE` to the API (one line marked TODO) and point `notifications/config.py` `load_config` at settings (the single place S4 named).

### S5.20 Users
- **Task:** `/admin/users` list, create, patch, scopes assignment. **Claude only** (WORK_SPLIT never-list): argon2 hashing, last-superadmin protection, audit entries, 12.6 test for each route.

### S5.21 Dashboard, reports, activity
- **Task:** read-only aggregates built from `enquiries`, `applications`, `audit`. Shapes come from the frontend `types.ts` of those three screens. Scopes from spec 12.3.

### S5.22 Types and scope coverage
- **Run on your machine:** `bash scripts/gen-types.sh`. Upload only the `tsc` errors it causes. Fix drift in `types/index.ts` and callers. Check the parametrised scope test (BUILDER 12.6) covers every new route via `iter_api_routes()`.

## D. Strings, seed, wiring

- **S5.23:** upload `grep -rn` output (see check line) and the files it names. `grep -rnE ">[A-Z][a-z]+ [a-z]+" src --include=*.tsx | grep -v test | grep -v locales` and `grep -rniE "\brole\b" src ../backend/app | grep -v scopes`. Move any hard-coded user text to `locales/en/*`; remove any role wording.
- **S5.24:** upload the seed files and `test_db_migrations_seed.py`. Task: seed shapes match schemas; placeholders exactly as spec 12 gives (no invented prices or medical claims).
- **S5.25:** upload `routes.tsx`, `BookingForm.tsx`, `bookingApi.ts`, `lib/queries/site.ts`, spec 5.2 Contact (paste). Task: Contact page passes `submit` and `copy` to `BookingForm` (S4 deviation 14), Footer links to pages that now exist.

## E. S6 (Claude and CI)

### S6.1 Push and first CI run (you)
`git push`, wait for CI, then for each failing step paste `CI FAILED` plus the last 80 lines. CI has never run; expect workflow fixes (action tags, mongo replica init, MinIO bucket).

### S6.2 CI fixes
- **Upload:** `.github/workflows/ci.yml`, `docker-compose.dev.yml`, the 80-line logs.

### S6.3 Pre-render every route
- **Upload:** `vite.config.ts`, `app/routes.tsx`, `features/public/services/ServicesPage.tsx`, STATE S3.7 and S3.10 decisions.
- **Task:** pre-render all public routes, not only `/` and `/services`; decide the build-time `loader` for services and service pages (S3.10 named it), emit `404.html`. Admin stays unrendered.

### S6.4 Raw-HTML SEO check
- **Task:** `scripts/check-seo.sh` greps each `dist/**/index.html` for title, description, canonical and JSON-LD (WORK_SPLIT section 7, step 5). Wire it into CI.

### S6.5 Playwright flows
- **Task:** booking submit, admin login and refresh, enquiries list to detail and a status change. These are the browser checks listed under "Not verified yet" in STATE.

### S6.6 Screenshots
- **Task:** artifacts at the five widths for Home, Services, one service page, Contact, admin Enquiries and Settings (definition of done 4). You download and upload the images for review.

### S6.7 and S6.8 Deploy
- **Task:** backend `Dockerfile`, `render.yaml`, env checklist from `.env.example`, CORS and cookie settings for the real origins. This also settles the open **CSRF storage decision** (STATE S3.11): same-site cookie or keep `localStorage`.

### S6.9 Final review
- **Task:** the ten definition-of-done checks in WORK_SPLIT section 10, each with grep proof, recorded in `BUILD_LOG.md`. Then resolve the owner-confirm list from STATE (copy wording, status transitions, nav labels, "Users and roles" label, service icon tiles, **R3** the Careers form label changes from spec 6.3).

---

## Tips for a free session (same as S3, plus these)

1. One phase per fresh chat; put standing rules, block A or B, the phase text and the uploads in the first message.
2. Run the check line **yourself first** and paste only the failure lines. A fix phase then needs no `npm ci` in the session.
3. Batch tiny phases only if they touch the same files (S5.1 and S5.2 can share a session; S5.13 to S5.15 can share one if each module is small).
4. If a session stops, use the same resume protocol as `S3_PLAN.md`.
5. Touch `STATE.md` only at the end of a track (after S5.11, S5.16, S5.22, S5.25, S6.9).

## STATE.md next-action line to use now

`On branch batch-01 (committed UNVERIFIED), do S5.1 to S5.11 from docs/S5_PLAN.md in order, one commit each, then the full frontend gate. Then B and C backend phases, then S6.`
