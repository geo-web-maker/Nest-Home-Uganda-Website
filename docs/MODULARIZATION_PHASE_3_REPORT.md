# Modularisation Phase 3 Report

## Objective

Phase 3 continues from `MODULARIZATION_PHASE_2_REPORT.md`. The focus was to reduce the remaining nurse app workflow ownership, separate admin care data-governance operations, and split public booking/application form responsibilities into focused modules. The active public website remains `frontend-thread/`; the older `frontend/` copy was not modified.

## Work completed

### Nurse application

Created `nurse/src/features/history/useNurseHistory.ts`.

- Owns the cached history collection and page/has-more/loading state.
- Owns the online-only next-page request and deduplication against already-loaded visit IDs.
- Persists fetched history through the existing `cacheHistory` function.
- Preserves the existing page size of 50 and uses the existing localized history-unavailable message supplied by the app.
- Exposes the history setter to the existing offline-sync hook, so cache refresh and sync reset behaviour remain owned by the established sync lifecycle.

Created `nurse/src/features/photos/useNursePhotoWorkflow.ts`.

- Owns photo-sheet state, selected visit, selected file, server-photo loading and server-photo list.
- Owns the capture submission path: visit/photo permission guard, available-storage check, compression, local outbox enqueue, local refresh, user feedback and online sync trigger.
- Owns loading server photos when the photo sheet opens and resetting sheet state when it closes.
- Keeps the existing `compressPhotoBundle`, `PHOTO_MAX_BYTES`, `enqueuePhoto`, API route, photo type, owner user ID, and local-photo schema.
- Existing manual upload, queue retry/discard/retake safeguards and sync-engine upload policy remain in their previous workflow owners.

`nurse/src/app/App.tsx` now composes these hooks rather than implementing photo capture and history pagination inline. It remains responsible for app-level session, routing, consent, and cross-feature orchestration.

### Admin care workspace

Created `admin/src/features/admin/care/careWorkspaceConfig.ts`.

- Centralises the `CareTab` union, ordered tab list, display labels, and tabs that expose row actions.
- Keeps the endpoint map in `CareWorkspace.tsx` because it is directly coupled to the current page data loader.

Created `admin/src/features/admin/care/data/useCareClientDataTools.ts`.

- Owns the client ID, export result and data-action message state.
- Owns audited client-data export requests.
- Owns the explicit confirmation and request lifecycle for irreversible client anonymisation/photo deletion.
- Calls the existing page loader after successful anonymisation and reports errors through the parent page's existing alert state.
- Preserves the existing API paths, confirmation copy, and success/error messages.

`CareWorkspace.tsx` is now 625 lines rather than 713 in the Phase 2 archive. The remaining page still coordinates tab loading, visit review, places, scheduling, flags and the large records/actions table; those are intentionally left for a separate, more granular extraction rather than moved as one oversized component.

### Public website (`frontend-thread/`)

Created `frontend-thread/src/features/public/booking/BookingServiceSelector.tsx`.

- Owns the booking service multi-select fieldset, chip toggling and its validation message.
- Preserves React Hook Form control integration and the focus target used when service selection is invalid.

Created `frontend-thread/src/features/public/careers/ApplicationUploadFields.tsx`.

- Extracts CV file selection and accepted-format guidance.
- Extracts the hidden anti-bot honeypot field while preserving its name, hidden presentation, keyboard exclusion and controlled value.
- Leaves file validation, consent checks, request submission, rate-limit handling and success/error state in `ApplicationForm.tsx`.

The booking and application forms remain responsible for their own validation/submission state; only cohesive field groups were extracted.

## Coordinator impact

| File | Phase 2 baseline | Phase 3 result |
|---|---:|---:|
| `nurse/src/app/App.tsx` | 733 | 684 |
| `admin/src/features/admin/care/CareWorkspace.tsx` | 713 | 625 |
| `frontend-thread/src/features/public/booking/BookingForm.tsx` | 331 | 302 |
| `frontend-thread/src/features/public/careers/ApplicationForm.tsx` | 267 | 257 |

Line counts are indicators only; the important change is the separation of feature state and cohesive field groups.

## Deliberately retained

- Nurse manual photo upload override remains coupled to the offline sync engine because it must coordinate with its in-flight guard and sync state.
- Nurse photo queue retry/discard/retake remains in `useNurseOutboxActions`; it should not be duplicated in the capture hook.
- The admin care records table and its row actions remain in `CareWorkspace.tsx` because their callbacks cross visit review, flag resolution, prompts, permission-sensitive API actions and list refresh. A later extraction should move the action contract as a unit and retain all guards.
- Public booking submission and careers application validation/submission remain in their forms to avoid changing validation or anti-abuse behaviour during a presentation modularisation pass.
- Generated API declarations, locale dictionaries, and nurse form-definition catalogue remain untouched.

## Static review and verification limits

- Reviewed the changed source files and integration points.
- Checked 81 relative import references across the Phase 3 changed files; no missing relative import targets were found.
- Confirmed the nurse app composes the new history and photo workflow hooks, the care workspace composes the client-data hook/config, and the public forms use their extracted field components.
- No tests, builds, typechecks, lint, or automated formatting commands were run, as requested.
- Static import inspection does not prove TypeScript compilation, React Hook Form generic compatibility, runtime behaviour, or preservation of every edge case.

Before shipping, run the normal project checks and manually exercise nurse history pagination online/offline, photo capture with denied permissions/low storage/queue limits, photo-sheet open/close, admin client export/anonymisation confirmation and audit behaviour, booking service selection validation/focus, and careers CV/consent/rate-limit flows.
