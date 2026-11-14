# Final stages 39–43 reconstruction audit

## Implemented in this pass
- Added a guarded read-only app-release inventory backed by the documented `GET /admin/app-releases` contract.
- Added a backups/hosting page with explicit “Not connected yet” and “Not recorded” states; it does not fabricate live infrastructure health.
- Added a permissions entry that routes administrators to existing Users and scopes and explicitly avoids making unverified grants.
- Added navigation and English labels for these screens.
- Added token-based focus, reduced-motion, mobile touch-target, and form contrast refinements for nurse and admin styling.
- Updated navigation expectations for the additional entries.

## Important remaining work
- Stage 39's setting catalogue and full retention/consent screen are not yet implemented as dedicated screens; the existing care settings/readiness/data-request screens are preserved to avoid replacing later Stage 30–38 functionality with the older Stage 39 attachment.
- Stage 40's editable resource-by-person permission matrix and release creation/adoption analytics are not implemented. No guessed backend contract was introduced.
- Stage 42/43 exact screenshot matching is not verifiable because the stage bundles request fresh app screenshots but none were supplied. Visual changes are accessibility/theme refinements, not a claim of pixel-perfect matching.
- Full frontend typecheck, lint, Vitest, backend integration and browser tests have not run because dependencies are absent in the supplied environment.

## Manual validation required
1. Install dependencies and run `cd frontend && npm run typecheck && npm run lint && npm test`.
2. Test `/admin/app-releases` as a superadmin and a non-superadmin; confirm the backend's `system:manage` guard remains authoritative.
3. Confirm `/admin/backups` clearly reports disconnected state and does not imply backup success.
4. Compare nurse and admin screenshots in light and dark themes on narrow and desktop viewports.

## Follow-up gap-closure pass (2026-10-29)

### Gaps closed in source
- Added a dedicated **Care setting catalogue** route, backed by `GET /admin/care/settings`. It renders the server-provided schema/current value/default/source/override levels/required-before-go-live metadata; it is read-only and links back to the existing editable settings screen.
- Added a dedicated **Data and retention** route. It reads the four configured retention values and the existing readiness response, and explicitly distinguishes configured policy from proof that a retention job actually ran. Existing data-request and care-settings screens remain the workflow entry points for requests and consent/privacy configuration.
- Replaced the placeholder permissions screen with a **read-only user-by-scope matrix** sourced from `/admin/users` and `/admin/scopes`, including search, status, and explicit superadmin markers. Changes still happen through the existing Users and scopes flow; the matrix never grants access.
- Completed the app release screen's **publish form** using the existing owner-only `POST /admin/app-releases` contract, semantic-version checks, same-origin/HTTPS download-path validation, pending/error/success states, release notes, and cache invalidation. The API remains the final validator and audit authority.
- Added explicit **adoption analytics unavailable** messaging because the current release API has no device/version telemetry; the UI does not invent rollout or adoption metrics.
- Added navigation and English labels for the two new routes and updated nav tests for the resulting route inventory.
- Added responsive form/table styles and keyboard-focus treatment using design tokens.

### Validation performed in this follow-up
- TypeScript transpile/syntax checks passed for the changed governance screen, screen registry, navigation, navigation tests, and English admin locale.
- `npm ci --ignore-scripts --no-audit --no-fund` timed out after partial installation. A full `tsc --noEmit` was attempted and is blocked by missing `@testing-library/jest-dom`, `node`, `vite/client`, and `vitest/globals` type definitions. Vitest, ESLint, browser tests, and integrated backend tests therefore remain unverified.
- This is syntax validation, not a claim of a successful full TypeScript typecheck or a passing application test suite.

### Remaining external/system gaps (not safely closable in this source-only environment)
1. **Backup/hosting health remains informational**: no authenticated provider health, backup result, retention execution, or restore-drill evidence API is available. The page intentionally says “Not connected yet”/“Not recorded.” Connect a real provider/API and record a verified restore test before claiming backup health.
2. **Release adoption telemetry is unavailable** in the existing API. The release publication workflow now works against the current endpoint, but adoption counts, installed versions, rollout percentages, and release rollback/deactivation endpoints are not available here.
3. **Permission matrix is read-only and limited to the API's first 100 users**. The backend's existing user-update endpoints remain the supported write path; a purpose-built paginated permission-matrix API and explicit presets/custom resource-by-person editor are still needed for a full match to the mockup. Do not add client-only grants.
4. **Retention execution and consent evidence**: configured retention periods and readiness checks are visible, but no execution history for a retention job or consent-record management API is exposed by these screens. Do not infer successful deletion or recorded consent from configuration.
5. **Visual fidelity and runtime tests**: no complete screenshot/browser run could be made because dependencies did not finish installing and the runtime requires newer Node than this environment (installed packages warned that Node 22.16 is below their declared minimums). Compare Stage 42/43 light/dark screenshots on actual target viewports after running under the supported Node version.

### Next validation commands
From `frontend/` using the Node version declared by the package/toolchain:
`npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run test:reference && npm run test:a11y && npm run test:responsive && npm run test:e2e`.
Also run backend tests in the project environment with locked backend dependencies and verify release publish access as both a superadmin and a non-superadmin.
