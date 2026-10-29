# Nest Home Uganda reconstruction — stages 30–38

## Scope and interpretation

This reconstruction uses the uploaded `Nest-Home-Uganda-reconstructed-stage08-29.zip` as the project baseline, then implements the intent of the stage 30–38 archives in that codebase. The stage archives primarily contain prompts, design/reference imagery, and selected source snippets rather than self-contained, ready-to-apply changes. Consequently, this is a conservative source reconstruction—not a claim of pixel-identical visual replication or a production deployment.

The implementation preserves the existing API's reach and scope checks where possible, and avoids making unsupported assumptions about external provider behavior. In particular, it does not treat SMS provider acceptance as proof of handset delivery, it does not show permanent photo-storage identifiers to the browser, and it does not load external map tiles until the operator explicitly chooses to load the map.

## Reconstructed stages

- **30 — Visits, visit detail, and photos.** Added a visit list with status and latest accepted verification/event information. The list endpoint enriches only the current page after applying visit-reach filtering. Visit detail and gallery listings expose photo metadata only; actual image content is served through short-lived signed paths and audit logged. Hiding a photo requires a reason and retains the record.
- **31 — Flags and My Team.** Added a flag resolution queue and team overview with scope-aware actions and navigation to records. Resolution/action changes are recorded through the existing audited API.
- **32 — Day/week schedule and new visit.** Added day/week schedule presentation, create/reassign/cancel flows, current-stay context, nurse-assignment checks, and conflict confirmation that is shown only for the structured `nurse_busy` 409 response. Date-only comparison and display avoid UTC/local-day shifts, and a stay ending today remains current for that day.
- **33 — Alerts, alert detail, and timesheets.** Added alert triage and timesheet views/actions using the existing care APIs and explicit action feedback.
- **34 — Live dashboard and executive charts.** Added operational snapshot cards/charts and exposed on-call coverage counts and an active-roster coverage-gap indicator.
- **35 — Last-seen positions.** Added a reach-filtered last accepted coordinate/event endpoint and map view. Coordinates are shown in a data list without loading map tiles by default; an operator must explicitly request the external map embed.
- **36 — SOS console, history, and drills.** Added response console/history/drill flows and persisted resolution outcome, responder, timestamp, and notes. The UI wording distinguishes a saved response from any separately confirmed communication outcome.
- **37 — On-call roster and SOS procedure.** Added roster editing, a pure responder-selection helper, and procedure-completeness checks before a procedure may be marked approved. An approved/active roster is restricted to system managers. Matching shifts route to listed responders; invalid, disabled, unapproved, or uncovered schedules fall back to the legacy contact list rather than silently suppressing a safety notification.
- **38 — Notification log and SMS settings.** Added a privacy-conscious notification log (masked destination hint; no body or secret values), provider-reported cost where available, SMS settings, an explicitly confirmed test-message path, and an explicit provider balance lookup. The care SMS monthly cap is separately enforced and cap skips are logged/audited. Provider balance units/currency are not inferred, and delivery receipts are reported as unsupported by this integration.

## Additional regression corrections

- Added `PUT` support to the API client and a targeted client test.
- Kept client/nurse lookup requests conditional on the caller's scopes.
- Closed a reach-check gap on direct flag resolution: the mutation now checks the linked visit's reach, matching the filtered queue behavior (inaccessible or orphaned flags return 404).
- Sorted latest visit events by server receipt time and corrected the visit-review field names to match the stored models.
- Prevented a generic HTTP 409 response from being misinterpreted as a nurse scheduling conflict.
- Kept settings write permissions separated: live roster activation/approval and SOS procedure approval require `system:manage`; monthly cap and test destination use care configuration permissions; provider credentials remain deployment-managed.

## Validation performed

Verified in the available environment:

- `python -m compileall -q backend/app` — passed.
- `PYTHONPATH=backend python backend/tests/test_care_roster.py` — **9/9 passed**. Covers shift start/end boundaries, overnight shifts, explicit and naive override expiry, fallback behavior for invalid/unapproved/disabled schedules and schedule gaps, and duplicate-number suppression.
- `PYTHONPATH=backend python backend/tests/test_care_procedure.py` — **5/5 passed**. Covers complete approval, placeholder content, incomplete escalation, and unapproved drafts.
- Added `backend/tests/test_care_admin_flag_reach.py` to ensure an out-of-reach flag cannot be resolved by direct ID; this route-level test is not runnable in this container because importing the API requires the missing `beanie` dependency.
- TypeScript `transpileModule` syntax checks — passed for all touched TS/TSX files.

## Validation not completed

A full integrated check could not run in this container. Backend imports for the full application/test harness are blocked because `beanie` is not installed. Frontend dependency installation did not complete within the available command window; global `tsc --noEmit` therefore reports missing type definitions for `@testing-library/jest-dom`, `node`, `vite/client`, and `vitest/globals`. As a result, the full React typecheck, Vitest suite, browser/e2e checks, database integration, and live SMS-provider checks remain **unverified**. Syntax transpilation is not a replacement for those checks.

## Follow-up deployment checks

Before production use, run the complete backend and frontend suites in the normal project environment; verify the configured database/indexes and server settings; exercise photo signed-link expiry and reach restrictions; inspect the UI against the supplied references at target viewport sizes; confirm provider billing/cap semantics with the configured SMS provider; and have the designated safety owner approve the actual SOS procedure and on-call contacts. The roster editor saves the legacy contact configuration and schedule through two setting writes, so operators should verify both values after saving; the UI warns if one side fails.
