# UI reference and design-fidelity guide

## Canonical reference

`reference/nest-all-features-mockups.html` is the source of truth for the public website, the nurse app shell, and the admin navigation model. Use it before changing shared layout, typography, spacing, colours, navigation order, or responsive behavior. The other files in `reference/` are supplementary previews and must not override this file where the two differ.

The mockup is a visual and information-architecture reference, not a promise that every illustrated feature is already implemented. In particular, its demo data and sample client/staff names are mock content. Do not add a production navigation item that leads to a fake, non-working screen just to make the feature map appear complete.

## Public website

The primary header navigation follows the mockup order: **Home, Services, About, How it works, Team, Areas, FAQ, Contact**. Services is an expandable menu. The footer groups also follow the reference exactly: **Explore** contains Services, How it works and Contact; **Company** contains Our team, Areas we serve, FAQ and care tips, About us, Privacy and terms, and Staff login. Careers is a direct-route recruitment experience, not a primary-header or footer link. Header navigation stays collapsible on phone and tablet and changes to the inline desktop navigation at 1040px.

Public page coverage includes Home, Services and service detail, About, How it works, Team, Areas, FAQ and article detail, Privacy, Careers and job detail, and Contact. The careers listing uses a responsive role-card grid (one column on narrow phones, two at tablet widths, three on desktop); application forms live in the job/general-interest flow rather than beside the entire listing. Keep one main page heading, useful title/description metadata, the shared header/footer, and no horizontal overflow at the reference widths (320/390 phone, 820 tablet, 1280 desktop). The Home composition follows the mockup's hero, location strip, services, promise, how-it-works and CTA sections; testimonials/team content remains configuration-driven where the product already supports it.

Use the design tokens in `frontend/src/design/tokens.css`. The reference palette is light-only; OS dark-mode preference must not silently replace the reviewed mockup palette. If a dark theme is designed later, it should be a deliberate, documented design variant rather than an implicit browser preference.

## Nurse application

The nurse app uses the same light palette and tokens. On phones it uses a fixed bottom navigation for Today, History and Profile. From the 820px tablet breakpoint up it uses a persistent left rail, removes the bottom tab bar, and gives Today a schedule/active-visit master-detail arrangement when a visit is in progress. The offline/connection banner and SOS action remain visible. Mobile must preserve the 320px minimum layout without horizontal scrolling.

The Today and active-visit experiences must remain usable without a network, and the desktop detail panel is a companion to—not a replacement for—the visit cards/actions. Keep client information limited to what is needed for the current task; do not add clinical details to operational notes.

## Admin information architecture

The implemented navigation is grouped to match the mockup:

| Mockup group | Implemented route coverage |
| --- | --- |
| Website | Dashboard, Enquiries, Careers, Applications, Content, Site settings, Users and scopes, Reports, Audit log / activity history |
| Care operations | Clients, Places & stays, Nurses, Visits, Flags, My team |
| Monitoring | Alerts, Timesheets, Photo review, Care reports |
| Safety | SOS |
| Setup | Care settings, Go-live checklist, Data requests |
| Care records (gated) | Patients, medications and adherence are deliberately not presented as working pages until their screens, APIs, and security policy are implemented. |

Each sidebar link has a matching required scope, and the route guard checks the scope again. Scope-filtered links must not be shown to users who cannot access them. The four phone shortcuts are Today/Dashboard, Visits, Alerts and SOS when those routes are permitted; remaining reachable screens go under More. More is scrollable on short phones. On wide screens, grouped sidebar navigation replaces the compact in-page care route switcher.

System Controls is a Site settings tab reserved for `system:manage`. It includes all 16 system settings described in `docs/system-settings.md`; general `settings:read`/`settings:write` access alone must not expose the tab or its endpoints. Payment gateway mode is a constrained Sandbox/Production selector, not an arbitrary text field.

The reference also illustrates a live care dashboard, notifications, a distinct day/week Schedule screen, SOS history/on-call/procedure pages, app releases, detailed permissions, backup/retention screens, and a few other setup workflows. Those are **not all represented as independent implemented routes in this repository yet**. Where functionality already exists inside a combined screen (for example, Visit schedule & review or the SMS/System Controls settings tabs), the navigation links to that real implementation. Do not make an unfinished mockup-only screen appear complete by linking it to an unrelated page. Treat those remaining entries as implementation gaps, not styling regressions.

## UI test map

The new `reference-fidelity.spec.ts` files make the design source explicit in browser tests:

- `frontend/e2e/reference-fidelity.spec.ts`: public-header order, exact footer-group links, no Careers link in the global navigation, mobile/tablet menu behavior, reference headlines and careers-card grid columns across phone/tablet/desktop widths, no horizontal overflow across the mockup page registry, palette stability under a dark OS preference, all implemented admin navigation routes and their page headings, admin phone/tablet/desktop shell behavior, System Controls edit/save behavior, and entry into a care workflow.
- `nurse/e2e/reference-fidelity.spec.ts`: phone bottom tabs versus the desktop rail, the in-progress master/detail pane, a functional active-visit link, palette stability, and no 320px horizontal overflow.
- `frontend/src/features/admin/nav.test.ts`: group membership, per-scope visibility, data-request authorization, mobile shortcuts and gated-out care records.
- `frontend/src/features/admin/settings/SettingsPage.test.tsx`: System Controls scope behavior and the constrained payment gateway selector.
- Existing public route, responsive, accessibility, booking, care, admin, nurse offline, shell, touch-target and PWA tests remain part of the coverage; do not replace them with the reference tests.

## Run locally

Use Node 22 or newer as required by each frontend package. Install dependencies in each application independently; no live backend is needed for the mocked reference browser tests.

```bash
# Public website and admin
cd frontend
npm ci
# Option A: install Playwright's Chromium once if you do not have a supported browser installed
npx playwright install chromium
npm run build
npm run test
npm run test:reference
# or the complete browser suite:
npm run test:e2e
npm run test:a11y
npm run test:responsive
```

```bash
# Nurse application
cd ../nurse
npm ci
# Option A: install Playwright's Chromium once if you do not have a supported browser installed
npx playwright install chromium
npm run build
npm run test
npm run test:reference
# or the complete browser suite:
npm run test:e2e
npm run test:a11y
npm run test:responsive
```

The end-to-end projects start their own local preview/static server on port 4173 and intercept `/api/v1/*` with deterministic test responses. Run the two applications' browser suites separately because they both use port 4173. `test:reference` is the fast, focused suite to use when changing layout or navigation.

To use an already-installed **Google Chrome Beta** instead of downloading Playwright's Chromium, set `PLAYWRIGHT_CHANNEL=chrome-beta` before running a browser-test command. In PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = "chrome-beta"
npm run test:reference
```

In Windows Command Prompt:

```bat
set PLAYWRIGHT_CHANNEL=chrome-beta && npm run test:reference
```

The test suite and the new reference checks were **not run during this change**, as requested. Run the commands above on the target machine to execute them.
