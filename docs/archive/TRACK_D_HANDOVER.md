# Track D handover

## What changed

Track D turns the previous table-driven care workspace into a routed care screen group while keeping the existing backend contracts and Track C safety controls as the source of truth.

Entry point: `/admin/care`  
Nested screens: `/admin/care/nurses`, `/clients`, `/places`, `/visits`, `/visits/:id`, `/flags`, `/team`, `/photos`, `/alerts`, `/timesheets`, `/sos`, `/reports/visits`, `/settings`, `/readiness`, `/data-requests`, `/audit`.

## Where to continue

- Shared screen behaviour: `frontend/src/features/admin/care/CareScreenPage.tsx`
- Visit review: `frontend/src/features/admin/care/VisitReviewPage.tsx`
- Map picker: `frontend/src/features/admin/care/components/MapPicker.tsx`
- Screen wrappers/tests: `frontend/src/features/admin/care/<screen>/`
- Admin route group: `frontend/src/features/admin/AdminApp.tsx`
- Backend audit filters/cursor: `backend/app/modules/activity/router.py` and `service.py`
- SOS test SMS: `backend/app/modules/care_ops/router.py` and `dispatch.py`

## Important rule

Do not treat this handover as a release sign-off. The implementation is **written, not run**. CI and staging must establish correctness.

## First CI follow-up order

1. Check the nurse lockfile gate.
2. Run OpenAPI/type generation and review drift.
3. Run backend/frontend unit suites.
4. Run route/scope coverage.
5. Run browser/accessibility/responsive care-screen tests.
6. Verify private photos, SMS test mode and CSV export in staging.
7. Resolve any CI findings with focused patches; do not weaken route coverage to make CI green.
