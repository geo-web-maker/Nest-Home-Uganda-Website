# ZIP manifest summary

This archive preserves the supplied repository and adds the Nurse Module implementation foundation, owner decisions, build notes, configuration guidance, care APIs, nurse PWA, offline data stores, photo-store helpers, data-subject tools, care-retention scaffolding, tests, and owner-controlled Backblaze B2 backup/restore scripts.

Latest continuation adds offline visit-note capture and history, assigned-client cache, queued/compressed photo proof with server-side upload completion verification, a needs-attention panel, assigned-client-only unscheduled visits with transactional server creation, and a scheduled care-retention job.

The public booking form displays the exact owner-approved warning: “Please do not enter medical details here”. The existing consent checkbox remains mandatory and has a dedicated regression test.

See `docs/NURSE_BUILD_LOG.md` for authored changes and `docs/NURSE_IMPLEMENTATION_STATUS.md` for outstanding implementation and validation limits. This is a best-effort implementation snapshot, not a claim that every master-plan acceptance criterion has passed.

Latest continuation (2026-10-25): adds persisted exponential retry backoff for transient outbox and photo-upload failures, queue filtering by retry eligibility, immediate manual retry reset, and tests for delay calculation and due-work filtering. Backoff starts at 2 seconds and caps at 5 minutes. This does not complete cursor-based pull sync or conflict resolution; all new application tests remain unrun.


Latest continuation (2026-10-25): adds cursor-based nurse schedule pull, stable timestamp/key cursor encoding, visit update timestamps, transactional removal tombstones for cancellation/reassignment, per-account IndexedDB cursors, and pending-operation review when a visit is removed. Regression tests are authored but not run. Full conflict-resolution UI, deployment execution of the legacy-data migration/backfill, and end-to-end sync acceptance remain outstanding.

This continuation also includes migration `0011_visit_sync_cursor.py` to backfill legacy visit timestamps and add cursor indexes, plus an explicit discard action for pending operations tied to cancelled/reassigned visits. The sync cursor is cleared when the corresponding local cache is cleared.

The pull endpoint uses bounded indexed reads from both record streams. The nurse Today screen continues to show the Kampala current-day schedule (and any active visit) even though the local cache includes the wider sync window. Cursor state is cleared with its local cache.

Additional cursor safeguards in this pass: malformed/unsupported cursor state is cleared for a full resync, the legacy `next_since` field remains in the API response, and tombstone cursor keys sort after visit keys at equal timestamps. Added a Kampala-day filter helper for the Today screen. No application tests or build were run.

Latest continuation (2026-10-25): hardens the photo lifecycle with 1280 px / 400 KiB JPEG re-encoding, 160 px local thumbnails, JPEG signature validation, a persisted upload-completed checkpoint to resume registration without a second upload, a low-storage check, a pending-photo warning, and scheduled retry cleanup for pending photo registrations older than 24 hours. Tests were authored but not run. Audited photo streaming, authenticated/private delivery acceptance, metadata-less provider orphan enumeration, and end-to-end photo tests remain outstanding.


## Phase 11 additions
- `frontend/src/features/admin/care/CareWorkspace.tsx`: visit review panel, annotation flow, flag resolution from review, and corrected reassignment method.
- `frontend/src/features/admin/care/CareWorkspace.test.tsx`: review-panel, timeline, photo-record disclosure, and annotation tests.
- `frontend/src/features/admin/care/care.css`: review layout and timeline styling.
- `docs/NURSE_BUILD_LOG.md`, `docs/NURSE_IMPLEMENTATION_STATUS.md`: Phase 11 implementation record and outstanding limitations.

Written, not run. CI will run it.


## Phase 12 additions
- `nurse/src/platform/notify.ts`: native local notification adapter and pure visit reminder schedule builder.
- `nurse/src/platform/notify.test.ts`: reminder timing, stable IDs, invalid/past visits, and private-detail exclusion tests.
- `nurse/src/platform/push.ts`: foreground receipt and tap listeners with cleanup.
- `nurse/src/app/App.tsx`: explicit local reminder opt-in, schedule refresh on local visit changes, and native foreground sync.
- `docs/NURSE_BUILD_LOG.md`, `docs/NURSE_IMPLEMENTATION_STATUS.md`: Phase 12 record and limitations.

Written, not run. CI will run it. The archive can be integrity-checked, but no application build, test, package installation, or Android device test was performed.


## Phase 13 additions

- `.github/workflows/ci.yml`: nurse-module branch trigger, duplicate CI definition cleanup, Google-hosted CSS/font guard.
- `.github/workflows/nurse.yml`: Chromium setup, nurse Playwright E2E execution, failure artifact upload, lockfile/cache setup correction.
- `nurse/playwright.config.ts`: CI reporting, retries, trace and screenshot diagnostics.
- `nurse/e2e/offline.spec.ts`: online-to-offline-to-online browser acceptance coverage.
- `docs/NURSE_BUILD_LOG.md` and `docs/NURSE_IMPLEMENTATION_STATUS.md`: Phase 13 record and remaining integration gaps.

Written, not run. CI will run it.
