# S3 split into free-session phases (Well Nest Home Care frontend pattern slice)

S3 is too big for one free session because Claude re-reads the repo, the 91 KB spec and runs the full gate every time. This plan cuts S3 into **15 small phases (S3.1 to S3.15)**. Each one touches 2 to 6 files and needs only a few small uploads.

## Setup facts (read once)

- **Base branch for S3 is `s4`, not `s2`.** The Enquiries list screen needs the admin enquiries API that S4 built. Create `s3` from `s4`: `git switch s4 && git switch -c s3`. Do every S3.x phase on `s3`, one commit per phase.
- **Do not upload the whole zip** and do not upload the full spec. Each phase lists the exact files to upload. The `excerpts/` folder holds only the spec lines each phase needs (E1 to E7).
- **Paste `PASTE_FIRST.txt` first in every session**, then the phase text. **Return format for the free session:** the changed files in full, as separate files, nothing else. You copy them into your repo, run the check line, commit.
- **Cheap gate per phase** (replaces orient.sh and the full gate): `cd frontend && npm ci --silent && npx tsc --noEmit && npx eslint <changed paths> --max-warnings=0 && npx vitest run <changed test paths>`. The full gate (lint, typecheck, test, build, format:check) runs only in S3.15.
- If a session runs out of room, tell Claude "stop after the files done so far and list what is left". Every phase below lists its files, so it can be resumed.

## Paste this at the start of every session (the standing rules, short)

```
You are continuing the Well Nest Home Care Uganda frontend (React 18, Vite 7, TypeScript, react-router-dom 6.30.6, TanStack Query, CSS Modules, vitest). Do ONLY the phase below. Rules:
- Use only pinned packages already in package.json. No new libraries, no Tailwind, no UI kit, no Redux.
- No roles anywhere. Access is by scopes only (scope ids are strings like "enquiries:read").
- No hard-coded user-facing strings in components: use the copy/i18n approach given in the phase.
- Copy the style of the pattern files I upload (Button.tsx + Button.module.css + Button.test.tsx).
- Do not invent copy, prices or medical claims. Use only the strings in the excerpts.
- Do not read or ask for anything I did not upload. If something is missing, list it and stop.
- Write tests with the component. Run the check line at the end and show only the last 15 lines of output. Never say a check passed unless you ran it.
- Return the changed files in full, then a 3-line summary. No other commentary.

BUDGET RULES (this is a free session with a small limit):
1. Do not run ls, find, grep or cat on the repo. Read only what I uploaded. Do not re-read a file after editing it.
2. No plan, no narration, no restating my request. Work, then give the summary.
3. Run `npm ci --silent` at most once, only if you will run a check. Never print install output. On a failure show only the failing test name and the first error line.
4. Return changed files only. For a small edit to a large existing file (for example routes.tsx) give old and new snippets, not the whole file.
5. 4 to 6 focused tests per component (behaviour, keyboard, one error case). No snapshots. CSS only for measurements in the excerpt. No comments except one line where a rule is non-obvious.
6. Reuse exact names from uploaded files (tokens, props, i18n keys). Do not invent new ones.
7. If the excerpt does not say it, ask ONE question and stop. Never guess copy or measurements.
8. Write files in this order: component, test, CSS. If you judge you are past about 60% of your budget, finish the current file and print `RESUME: remaining files = <list>`. Never leave a file cut off. A finished component without CSS beats five half-finished files.
9. If a check cannot run, say so in one line and move on. Do not retry.
10. Before returning, list the phase's "Done when" items with yes or no.
```

## Phase map

| Phase | What | Size |
| --- | --- | --- |
| S3.1 | apiClient (public fetch, error shape) | small |
| S3.2 | OpenAPI export script and generated types | small |
| S3.3 | i18n wiring and `common` strings | small |
| S3.4 | `Seo` component (title, canonical, OG, JSON-LD) | small |
| S3.5 | Site settings and services queries | small |
| S3.6 | Header and Footer | medium |
| S3.7 | StickyBar, PublicLayout, 404 | medium |
| S3.8 | PageHero and CtaBand | small |
| S3.9 | ServiceCard | small |
| S3.10 | Services page assembled and pre-render check | medium |
| S3.11 | Admin auth: token store, login screen, refresh-on-401 | medium |
| S3.12 | Scope guard and nav config (spec 12.6 test 6) | small |
| S3.13 | AdminLayout (sidebar, bottom nav, top bar) | medium |
| S3.14 | Admin primitives: DataTable, FilterTabs, PageHeader, Pagination | medium |
| S3.15 | Enquiries list screen, full gate, ledger | medium |

Public track: 1 to 10. Admin track: 11 to 15 (needs S3.1 and S3.2). You can alternate tracks, but keep the order inside each track.

---

## S3.1 apiClient

- **Needs:** nothing.
- **Upload:** `frontend/src/features/public/booking/bookingApi.ts`, `bookingApi.test.ts`, `frontend/src/lib/cx.ts`, `excerpts/E5-architecture-a11y.md`.
- **Task:** Create `frontend/src/lib/api/client.ts` and `client.test.ts`. A small `createApiClient({ baseUrl, fetchImpl })` with `get/post/patch`, JSON in and out, `credentials: 'include'`, an `ApiError` class carrying `status`, `code`, `message`, `fields` read from the server error shape `{error:{code,message,fields}}`. Optional `getAccessToken()` and `onUnauthorized()` hooks (used in S3.11), with at most one retry after a 401 and no loop. Export a default instance using `import.meta.env.VITE_API_URL`. Do not touch BookingForm.
- **Done when:** tests cover success, 422 fields, 429, network failure, and the single retry after 401.
- **Check:** `npx tsc --noEmit && npx eslint src/lib/api --max-warnings=0 && npx vitest run src/lib/api`

## S3.2 OpenAPI export and generated types

- **Needs:** nothing. Easiest on your own machine if the backend venv exists there.
- **Upload:** `backend/app/main.py`, `frontend/package.json`, `backend/app/core/config.py`.
- **Task:** Write `scripts/gen-types.sh` that (1) exports the OpenAPI JSON from the backend app (`app.main`, with dev env defaults) into `frontend/src/types/openapi.json`, then (2) runs `npx openapi-typescript` (already pinned, 7.13.0) to write `frontend/src/types/api.d.ts`. Add `"gen:types"` to the frontend scripts. Add `types/index.ts` re-exporting the named types later phases use (`UserPublic`, `TokenResponse`, `EnquiryListItem`, `ServicePublic`).
- **If the sandbox cannot import the backend:** Claude writes only the script and the index file; you run `bash scripts/gen-types.sh` yourself and commit the output.
- **Check:** `npx tsc --noEmit`

## S3.3 i18n wiring

- **Needs:** nothing.
- **Upload:** `frontend/src/main.tsx`, `frontend/src/locales/en/booking.ts`, `frontend/src/test-setup.ts`, `frontend/package.json`.
- **Task:** `frontend/src/lib/i18n.ts` initialising i18next 26.5.2 with react-i18next 17.1.0, English only, namespaces `common`, `booking`, `site`, `admin`, no switcher. Create `locales/en/common.ts` (nav labels: Services, About, How it works, Careers, Contact, Call, Call now, WhatsApp, Menu, Skip to content, Page not found, Home) and typed `site.ts` and `admin.ts` stubs. Load `booking.ts` into the `booking` namespace unchanged. Import i18n in `main.tsx` and `test-setup.ts`. Must work under pre-render (synchronous init, no detector).
- **Check:** `npx tsc --noEmit && npx eslint src/lib src/locales src/main.tsx --max-warnings=0 && npx vitest run 2>&1 | tail -8`

## S3.4 Seo component

- **Needs:** nothing.
- **Upload:** `frontend/src/app/routes.tsx`, `frontend/src/features/public/services/ServicesPage.tsx`, `frontend/src/features/public/home/HomePage.tsx`.
- **Task:** `frontend/src/components/site/Seo.tsx` + test. Props: `title`, `description`, `path`, optional `image`, optional `jsonLd`. Use `Head` from `vite-react-ssg` (not `react-helmet-async`, see STATE S1 deviation). Emit title, description, canonical (`VITE_SITE_URL` + path), Open Graph, Twitter tags and an `application/ld+json` script. Do not edit the pages yet.
- **Check:** `npx tsc --noEmit && npx eslint src/components/site --max-warnings=0 && npx vitest run src/components/site`

## S3.5 Queries: site settings and services

- **Needs:** S3.1, S3.2.
- **Upload:** `frontend/src/lib/api/client.ts`, `frontend/src/types/index.ts`, `backend/app/modules/services/schemas.py`, `backend/app/modules/services/router.py`.
- **Task:** `frontend/src/lib/queries/services.ts` with `useServices()` and `useService(slug)` (TanStack Query, `staleTime: 60_000`, keys `['services']`, `['service', slug]`). `lib/queries/site.ts` with `useSiteSettings()`. The settings endpoint does not exist yet (STATE: settings module not built), so return typed defaults from one constant `DEFAULT_SITE` (business phone 0787 499 988, WhatsApp number, office text) and mark the single line to change later. Add a `createQueryClient` factory for tests. Tests use a mocked client.
- **Check:** `npx tsc --noEmit && npx eslint src/lib/queries --max-warnings=0 && npx vitest run src/lib/queries`

## S3.6 Header and Footer

- **Needs:** S3.3, S3.5.
- **Upload:** `excerpts/E1-header-footer-stickybar.md`, `frontend/src/components/brand/Logo.tsx`, `ui/Button.tsx`, `ui/Button.module.css`, `ui/Button.test.tsx`, `frontend/src/lib/phone.ts`, `frontend/src/design/tokens.css`.
- **Task:** `components/site/Header.tsx`, `Footer.tsx`, CSS Modules and tests, exactly per E1 (sticky forest header, nav aria-label "Main", Services dropdown that opens on click and focus and closes on Escape, menu button below 700px closing on route change and Escape, three-column footer). Dropdown items from `useServices()`. Strings from `common`/`site`. Tel link from `useSiteSettings()` via `phone.ts`.
- **Done when:** tests cover menu toggle, Escape, dropdown keyboard open, nav and footer links.
- **Check:** `npx tsc --noEmit && npx eslint src/components/site --max-warnings=0 && npx vitest run src/components/site`

## S3.7 StickyBar, PublicLayout, 404

- **Needs:** S3.6.
- **Upload:** `excerpts/E1-header-footer-stickybar.md`, `excerpts/E5-architecture-a11y.md`, `frontend/src/app/routes.tsx`, `routes.test.tsx`, `frontend/src/lib/whatsapp.ts`, `frontend/src/features/public/booking/bookingApi.ts` (for `trackClick`), `frontend/src/components/site/Header.tsx`.
- **Task:** `StickyBar.tsx` (+css, test; below 1040px only; Call now and WhatsApp; calls `trackClick`), `app/PublicLayout.tsx` (Header, `<main id="main" tabIndex={-1}>`, Footer, StickyBar, skip link, scroll to top and focus main on route change, 84px bottom padding on phone), `features/public/NotFoundPage.tsx`. Rewire `routes.tsx` and add the `*` route. Keep `/design` dev-only and pre-render working.
- **Check:** `npx tsc --noEmit && npx eslint src/app src/components/site src/features/public --max-warnings=0 && npx vitest run src/app src/components/site`

## S3.8 PageHero and CtaBand

- **Needs:** nothing.
- **Upload:** `excerpts/E2-servicecard-hero-cta-servicespage.md`, `ui/Rule.tsx`, `ui/AccentText.tsx`, `ui/Button.tsx`, `ui/Button.module.css`, `frontend/src/design/tokens.css`.
- **Task:** `components/site/PageHero.tsx` (Rule label, H1, lead, breadcrumb `<nav aria-label="Breadcrumb">`) and `CtaBand.tsx`, CSS Modules and tests per E2. All text through props.
- **Note:** this removes `PageHero` and `CtaBand` from ChatGPT job G3. Edit G3 in WORK_SPLIT_GUIDE.
- **Check:** `npx tsc --noEmit && npx eslint src/components/site --max-warnings=0 && npx vitest run src/components/site`

## S3.9 ServiceCard

- **Needs:** nothing.
- **Upload:** `excerpts/E2-servicecard-hero-cta-servicespage.md`, `frontend/src/design/shapes.module.css`, `tokens.css`, `ui/Chip.tsx`, `ui/Chip.module.css`, `backend/app/modules/services/schemas.py`.
- **Task:** `components/site/ServiceCard.tsx` + css + test per E2: link card, phone row layout with 68x84 arch thumb, tablet+ column layout, icon-tile fallback when no photo (physiotherapy, palliative, pediatric, hospital to home), photo when set. Props from the `ServicePublic` type. Keep icons in one `serviceIcons.tsx` map keyed by slug (S2 deviation: tiles on services 4, 5, 7, 8, owner to confirm).
- **Note:** this removes `ServiceCard` from ChatGPT job G1.
- **Check:** `npx tsc --noEmit && npx eslint src/components/site --max-warnings=0 && npx vitest run src/components/site`

## S3.10 Services page assembled

- **Needs:** S3.4, S3.5, S3.7, S3.8, S3.9.
- **Upload:** `excerpts/E2-servicecard-hero-cta-servicespage.md`, `frontend/src/features/public/services/ServicesPage.tsx`, `index.ts`, `frontend/src/app/routes.tsx`, `frontend/vite.config.ts`.
- **Task:** Real `ServicesPage`: `Seo`, `PageHero` (rule "Services", H1 "Eight kinds of care, one trusted team.", lead, breadcrumb "Home / Services"), 1/2/4 column grid of `ServiceCard` from `useServices()`, loading skeleton, error state, `CtaBand` "Not sure which care you need?". Say whether pre-render fetches data at build time or ships a shell that hydrates, and record it as a decision. Strings in `locales/en/site.ts`. Test: 8 cards from a mocked API; loading and error states.
- **Check:** `npx tsc --noEmit && npx eslint src/features/public/services --max-warnings=0 && npx vitest run src/features/public/services && npm run build 2>&1 | tail -15` (then grep `dist/services/index.html` for the `<h1>`)

## S3.11 Admin auth: token store, login, refresh-on-401

- **Needs:** S3.1, S3.2, S3.3.
- **Upload:** `frontend/src/lib/api/client.ts`, `backend/app/modules/auth/router.py`, `schemas.py`, `excerpts/E4-admin-routes-login-enquiries.md`, `excerpts/E3-admin-components.md`, `ui/Field.tsx`, `ui/Button.tsx`.
- **Task:** `features/admin/auth/authStore.ts` (access token, user and scopes in memory only; no state library), `useAuth.tsx` provider, `refreshSession()` calling `POST /auth/refresh` with the `X-CSRF-Token` header. The CSRF cookie is HttpOnly, so the page cannot read it: the header comes from the `csrf_token` in the login and refresh response body (see STATE, S3.11 decision), wire `onUnauthorized` into the client, and `LoginPage.tsx` (email, password, `role="alert"` errors, 429 and lockout messages, redirect to the first reachable route). Login card per E3. Tests: login success, wrong password, one refresh then back to login.
- **Not built (S2 deviation):** TOTP, forgot, reset, invite. Do not add them.
- **Check:** `npx tsc --noEmit && npx eslint src/features/admin --max-warnings=0 && npx vitest run src/features/admin`

## S3.12 Scope guard and nav config

- **Needs:** S3.11.
- **Upload:** `excerpts/E7-scope-routes.md`, `excerpts/E3-admin-components.md`, `frontend/src/features/admin/auth/authStore.ts`, `useAuth.tsx`, `backend/app/modules/auth/scopes.py`.
- **Task:** `features/admin/nav.ts`: the single list of admin routes with `path`, `label`, `scopes[]`, icon key, in spec navigation order. `RequireAuth` and `RequireScopes`, `hasScopes(user, needed)` (a superadmin passes everything). The "No access has been granted to this account" page with the business phone. `visibleNav(user)` and `bottomNav(user)` (first four reachable plus More). This is **spec 12.6 test 6**: tests with a mocked scope list that show and hide items and block routes.
- **Check:** `npx tsc --noEmit && npx eslint src/features/admin --max-warnings=0 && npx vitest run src/features/admin`

## S3.13 AdminLayout

- **Needs:** S3.12.
- **Upload:** `excerpts/E3-admin-components.md`, `frontend/src/features/admin/nav.ts`, the `RequireAuth` file, `frontend/src/app/routes.tsx`, `frontend/src/design/tokens.css`.
- **Task:** `features/admin/AdminLayout.tsx` + css + test: sidebar (hidden below 700, icon-only 700 to 1039, 244px labelled from 1040, Work and Manage groups, sign out pinned), phone bottom nav with "More" list, 58px top bar with title and user initial circle, page padding and max-width per E3. Icons as small inline SVGs in one file. Register `/admin/login` and `/admin/*` in `routes.tsx` with `React.lazy` so the public bundle does not grow, and confirm admin is not pre-rendered.
- **Check:** `npx tsc --noEmit && npx eslint src/features/admin src/app --max-warnings=0 && npx vitest run src/features/admin src/app && npm run build 2>&1 | tail -15`

## S3.14 Admin primitives

- **Needs:** S3.3 only. Can run any time after it.
- **Upload:** `excerpts/E3-admin-components.md`, `ui/Badge.tsx`, `Badge.module.css`, `Badge.test.tsx`, `ui/Chip.tsx`, `frontend/src/design/tokens.css`.
- **Task:** in `frontend/src/components/admin/`: `PageHeader`, `FilterTabs` (scrollable pills, `role="tablist"`), `Pagination`, and `DataTable` (real table from 1040px; cards with `label:` prefixes below; optional clickable rows; generic over a column array; empty and loading states). CSS Modules and tests. Strings via props.
- **Check:** `npx tsc --noEmit && npx eslint src/components/admin --max-warnings=0 && npx vitest run src/components/admin`

## S3.15 Enquiries list screen, full gate, ledger

- **Needs:** S3.2, S3.11 to S3.14.
- **Upload:** `excerpts/E4-admin-routes-login-enquiries.md`, `backend/app/modules/enquiries/schemas.py`, `backend/app/modules/enquiries/router.py` (admin list handler), `frontend/src/lib/api/client.ts`, the four admin primitives, `frontend/src/features/admin/nav.ts`, `docs/STATE.md`.
- **Task:** `features/admin/enquiries/EnquiriesPage.tsx` + `useEnquiries(params)`: search (q), status tabs (All, New, Contacted, Assessment booked, Care started, Not proceeding), service filter, date range, sort, 25 per page, columns Name, Phone, Service, Area, Status (Badge), Received, Assigned, rows link to `/admin/enquiries/:id` (the detail screen is job G14), "Export CSV" **hidden** (not built, S4 deviation 7). Needs `enquiries:read`. Strings in `locales/en/admin.ts`. This is the pattern screen for ChatGPT jobs G13 to G20.
- **Then the full gate once:** `npm ci && npm run lint && npm run typecheck && npm run test && npm run build && npm run format:check`.
- **Ledger:** update `docs/STATE.md` (S3 DONE with commit; fill in the "Public page pattern" and "Admin screen pattern" lines with real paths; append deviations) and add an S3 checkpoint to `docs/BUILD_LOG.md`.

---

## Tips to save tokens in a free session (for you)

1. One phase per session, fresh chat each time. Long chats cost more per message because the history is re-sent.
2. Put everything in the FIRST message: the standing rules block, the phase text copied from this file, and the uploads. Free sessions often cap by message count, so avoid back and forth.
3. Upload only the listed files. Attached text files go straight into the conversation, so the 91 KB spec alone would use up a session. Paste files under about 40 lines as text instead of attaching.
4. Never upload `package-lock.json`, images, fonts, `node_modules` or `.git`.
5. Keep `| tail -15` on long commands.
6. If `npm ci` is slow or fails, or the session is nearly out, tell Claude to write the files and tests without running them, then run the check line yourself and paste back only the last 15 lines if it fails.
7. Commit after every phase with `S3.n: <what>`. Touch STATE.md only in S3.15.

## If a session stops early (resume protocol)

1. Copy whatever files it finished into the repo. Do not discard partial work.
2. Look for the `RESUME: remaining files = ...` line. If there is none, compare the phase's file list with what you received.
3. Open a fresh chat. Paste the standing rules, the same phase text, and add one line: `Already done (uploaded): <files>. Do only: <remaining files>.` Upload the finished files so names and props stay consistent.
4. Run the phase's check line once everything is in.

## Small-phase fallback

If a "medium" phase still runs out, split it by file in this order and run each as its own session:
- S3.6: Header (a), Footer (b)
- S3.7: StickyBar (a), PublicLayout and 404 and routes (b)
- S3.10: ServicesPage (a), pre-render check and fixes (b)
- S3.11: authStore and refresh (a), LoginPage (b)
- S3.13: AdminLayout (a), lazy routes and build check (b)
- S3.14: DataTable (a), PageHeader, FilterTabs, Pagination (b)
- S3.15: EnquiriesPage and hook (a), full gate and ledger (b)

## STATE.md next-action line to use now

`Create branch s3 from s4. Do S3.1 to S3.15 from docs/S3_PLAN.md in order, one commit each. Then merge s1, s2, s3, s4 and push.`
