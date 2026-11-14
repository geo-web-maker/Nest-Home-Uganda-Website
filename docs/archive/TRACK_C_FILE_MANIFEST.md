# Track C file manifest

Compared against `Nest-Home-Care-Nurse-Module-Track-B-updated.zip` by relative path and SHA-256. Excludes generated/cache/dependency directories (`node_modules`, `.git`, Python caches, `dist`, and `build`). This inventory is not a correctness claim.

**Summary:** 23 added files, 32 modified files, 0 deleted files relative to the Track B baseline.

Detailed purpose and follow-up information is in `docs/TRACK_C_COMPLETION_AUDIT.md`; tests and owner/CI gates are in `docs/TRACK_C_CHECKLIST.md`.

## Added files

- `backend/app/modules/app_releases/__init__.py`
- `backend/app/modules/app_releases/models.py`
- `backend/app/modules/app_releases/router.py`
- `backend/app/modules/app_releases/rules.py`
- `backend/app/modules/app_releases/schemas.py`
- `backend/app/modules/care_admin/report_rules.py`
- `backend/app/modules/field_ops/models.py`
- `backend/app/modules/field_ops/sync_rules.py`
- `backend/app/modules/push/retry.py`
- `backend/migrations/0012_care_track_c.py`
- `backend/tests/test_track_c_app_releases.py`
- `backend/tests/test_track_c_db_acceptance.py`
- `backend/tests/test_track_c_invite_lifecycle.py`
- `backend/tests/test_track_c_photo_signatures.py`
- `backend/tests/test_track_c_photo_stream.py`
- `backend/tests/test_track_c_push_retry.py`
- `backend/tests/test_track_c_report_rules.py`
- `backend/tests/test_track_c_route_matrix.py`
- `backend/tests/test_track_c_scope_presets.py`
- `backend/tests/test_track_c_sync_rules.py`
- `docs/TRACK_C_CHECKLIST.md`
- `docs/TRACK_C_COMPLETION_AUDIT.md`
- `docs/TRACK_C_FILE_MANIFEST.md`

## Modified files

- `backend/app/core/photo_store.py`
- `backend/app/jobs.py`
- `backend/app/migrate.py`
- `backend/app/modules/auth/models.py`
- `backend/app/modules/auth/router.py`
- `backend/app/modules/auth/scopes.py`
- `backend/app/modules/care_admin/router.py`
- `backend/app/modules/care_ops/models.py`
- `backend/app/modules/care_ops/router.py`
- `backend/app/modules/care_retention/retention.py`
- `backend/app/modules/field/router.py`
- `backend/app/modules/field_ops/router.py`
- `backend/app/modules/nurses/models.py`
- `backend/app/modules/nurses/repository.py`
- `backend/app/modules/nurses/router.py`
- `backend/app/modules/nurses/service.py`
- `backend/app/modules/push/dispatcher.py`
- `backend/app/modules/users/router.py`
- `backend/app/modules/users/schemas.py`
- `backend/app/modules/users/service.py`
- `backend/app/modules/visits/models.py`
- `backend/app/registry.py`
- `backend/tests/conftest.py`
- `backend/tests/test_route_coverage.py`
- `backend/tests/test_scope_enforcement.py`
- `docs/NURSE_IMPLEMENTATION_STATUS.md`
- `frontend/src/features/admin/auth/SetPasswordPage.test.tsx`
- `frontend/src/features/admin/auth/SetPasswordPage.tsx`
- `frontend/src/features/admin/users/UsersPage.test.tsx`
- `frontend/src/features/admin/users/UsersPage.tsx`
- `frontend/src/features/admin/users/types.ts`
- `nurse/src/app/App.tsx`

## Deleted files

- None

No files were intentionally deleted as part of Track C; if the comparison shows otherwise, review the package output before accepting it.
