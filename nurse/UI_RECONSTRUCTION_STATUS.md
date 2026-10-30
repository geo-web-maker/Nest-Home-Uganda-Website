# Nurse UI Mockup Reconstruction — Implementation and Verification Report

**Date:** 30 October 2026  
**Target:** `repo/nurse` (React/Vite/TypeScript nurse application), with the narrowly scoped `GET /api/v1/field/me` addition in `repo/backend`.  
**Design reference:** `reference/nest-all-features-mockups.html` and `NURSE_UI_MOCKUP_PARITY_GUIDE.md` from the supplied package.

## Executive summary

A broad UI reconstruction pass has been implemented against the supplied nurse mockup and parity guide. The work replaces the old flat, action-heavy visit list with the mockup's nested-card system, adds the nurse greeting and locally derived summary/map panel, reuses visit detail and active-visit panes in the Today layout, and applies the same visual system to the other nurse-facing screens and sheets.

**This is an implementation handoff, not a green build/release sign-off.** The changes and additional tests are in the package, but the environment could not restore the pinned JavaScript or Python dependencies. The test runner, bundler, lint run, type-check and backend test collection therefore could not complete. Do not interpret the static parser result as a substitute for those checks.

## Implemented

### Shared visual system

- Added/reused the compact UI primitives under `repo/nurse/src/ui/`: SVG line icons, status chips, nested cards, rows, pill buttons, avatars, elapsed timers, banners and a map placeholder.
- Added Kampala-aware greeting/date/time helpers and a shared visit-status-to-chip mapping with unit tests.
- Ported the major mockup layout rules into the nurse styles: 96 px desktop rail, floating phone tabs, 700 px and 1040 px layout transitions, nested card surfaces, status chips, pill actions, focus outlines, dark-theme treatment, reduced-motion handling and safe-area-aware mobile navigation/sheets.
- Kept the existing design tokens and dependency set; no new package dependency was introduced.

### Screens and workflows

- **Today:** Kampala greeting and date, first-name treatment, initials avatar, 44 px refresh control, active-first schedule, single-link visit cards, embedded visit pane at tablet/desktop widths, local visit/done/next counts, and a non-tiled map placeholder. Empty state and unscheduled visit launch are restyled.
- **Visit detail / Active visit:** pane components can render embedded or full screen; map URLs retain address encoding; arrival/leave, note and photo handlers remain connected. Timer is based on saved visit timestamps and is not announced every second. Photo actions are hidden when policy disallows them. Safety-deadline chip is shown only when the server supplies a deadline.
- **Arrival sheet:** per-state GPS detail plus `Ready`, `Finding…`, `Low accuracy`, `Denied` or `Unavailable` status chip; location remains optional and does not block queued arrival. Safety timer is rendered as a real keyboard-accessible `role="switch"` checkbox.
- **Departure sheet:** shared pill actions, elapsed-time display, and a warning banner for missing required photo. Existing departure block remains in force until the photo requirement is satisfied or resolved.
- **History, Sync, Profile and Timesheets:** reorganized into cards, rows, chips and disclosures while retaining the existing data hooks, offline state, sync retry/discard/apply-again gates, profile settings, reminders, timesheet read-only behaviour and selection semantics.
- **Login and Onboarding:** shared pill actions, SVG pictograms and distinct sign-in failure messaging; consent gate remains dependent on both acknowledgements.
- **Update notice and logout guard:** brought into shared banner/sheet styling without changing update eligibility or the explicit pending-work logout choice.
- **App shell:** shared rail/tab navigation, matching `aria-current` states, quieter connection/banner treatment, toast expiry and unchanged SOS control/workflow.

### Offline profile identity

- Extended the authenticated field-profile response additively with the signed-in nurse's own display name/email and the assigned supervisor's active display name.
- Cached only those display fields under a per-user IndexedDB metadata key, rather than persisting the whole account response.
- Added ownership/account-switch protections so cached profile presentation cannot leak between nurses; existing nurse-owned pending queue/photo records are retained according to the established ownership rules.

### Tests written or expanded

- Component and helper coverage for UI primitives, greetings/initials, status mapping, Kampala time formatting and timer presentation.
- Screen tests for Today, VisitCard, VisitDetail, ActiveVisit, History, Sync, Profile, Login, Timesheets, Onboarding, ArriveSheet and LeaveSheet.
- Regression tests for GPS state chips, non-blocking arrival, safety switch changes, required-photo departure blocking, map address encoding, photo permission hiding, identity cache ownership and account-switch behaviour.
- Playwright coverage expanded for responsive geometry, reference fidelity, 44 px touch targets, light/dark accessibility scans, nav state consistency, timer semantics and mobile/desktop layout behaviour.
- Backend contract test added for the minimal nurse/supervisor display identity fields.

## Verification performed

| Check | Result | Evidence / explanation |
|---|---|---|
| TypeScript/TSX syntax and transpilation | **PASS** | Global TypeScript parser walked 120 nurse `src` and `e2e` implementation/test files; 0 syntax/transpilation diagnostics. This is not a semantic type-check. |
| Relative import resolution | **PASS** | Static scan of 120 TypeScript files found 0 unresolved relative imports. |
| CSS brace balance | **PASS** | `repo/nurse/src/styles.css` has balanced CSS blocks. This is not a full CSS/PostCSS validation. |
| Backend Python bytecode compilation | **PASS** | `python -m compileall -q repo/backend/app repo/backend/tests` completed successfully. |
| Frontend dependency restore | **BLOCKED** | `npm ci --no-audit --no-fund` retries failed against the npm registry with DNS `EAI_AGAIN`; local `node_modules` was left incomplete. |
| Type-check / build | **BLOCKED** | TypeScript reported missing type definition packages (`react`, `react-dom`, `node`, and other transitive type libraries) from the incomplete install. Build stops at the same `tsc --noEmit` gate. |
| ESLint | **BLOCKED** | `eslint` executable is not installed in the partial dependency tree (`eslint: not found`). |
| Vitest | **BLOCKED** | `vitest` executable is not installed (`vitest: not found`). Test files are authored but not executed. |
| Playwright E2E | **BLOCKED** | The incomplete Playwright CLI responded `error: unknown command 'test'`; the browser specs were not run. |
| Backend pytest | **BLOCKED** | Collection stops at `ModuleNotFoundError: No module named 'beanie'` while loading backend `conftest.py`. |
| Browser screenshot comparison | **NOT PERFORMED** | No successful browser run was available to capture app screenshots beside the 390/820/1280 mockup frames in light and dark themes. |

## Known intentional deviations / scope boundaries

1. **No live map tiles or route distance.** The mockup itself marks the map as a placeholder for the real build; this implementation stays local and does not invent coordinates, distances or map data.
2. **Quick note fallback.** The one-line quick-note treatment remains a button-like input surface that opens the existing NoteSheet. The longer note/offline save path was not bypassed or replaced; the guide explicitly accepts this fallback for v1.
3. **Photo state remains data-backed.** Existing photo counts/actions are used. No queued/synced state or thumbnail is fabricated when the underlying data does not expose it.
4. **Timesheets data model is unchanged.** It remains the current read-only nurse timesheet workflow, with presentation improvements only.
5. **Optional iPhone install hint is not added.** The guide marks it as optional and separate from the core parity pass.
6. **No visual sign-off yet.** Screenshot inspection at 390, 820 and 1280 px in light and dark modes remains a required human/browser verification step.

## Restore dependencies and run the full verification suite

From a machine with npm registry access:

```bash
cd repo/nurse
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:reference
npm run test:a11y
npm run test:responsive
npm run test:e2e
```

Then run the backend contract tests in an environment with the project's backend dependencies installed:

```bash
cd repo/backend
pytest -q app/modules/field
```

Finally, capture and compare screenshots using the mock API fixture at **390 px, 820 px and 1280 px**, in **light and dark** themes, for Today, Visit detail, Active visit, History, Sync, Profile and Timesheets. Check spacing, card nesting/radii, typography, chips, mobile sheet behaviour, focus visibility, SOS position above the mobile tabs, and horizontal overflow.

## Handoff recommendation

The reconstruction source and regression coverage are packaged, and static syntax/import/Python checks pass. Before merging or deploying, restore the dependencies and make every blocked check above green; then complete the screenshot review. Any TypeScript, axe, Vitest, Playwright or backend failures found in that environment should be treated as open defects rather than assumed to be caused only by this container.
