# Modularisation Phase 2 Report

## Objective

Phase 2 continues the modularisation from `MODULARIZATION_REPORT.md`. The focus was to separate the nurse application's operational workflows from the app coordinator, while keeping API contracts, offline-first data rules, user-facing flows, and permission boundaries in place. A focused admin-mail workflow was also extracted where its lifecycle was self-contained.

## Nurse application: workflow extraction

### Offline synchronisation and local cache

Created `nurse/src/features/offline/useNurseOfflineSync.ts`.

It now owns:

- Refreshing cached visits, clients, history, outbox records, and locally queued photos.
- Filtering local photo records by the active cached account owner.
- Online/offline event handling and the foreground sync interval.
- Native app-resume sync handling.
- Interrupted-operation and interrupted-photo recovery.
- The sync-engine call, consent-block handling, photo signing/upload/completion, checkout photo requirement checks, pull-sync, history/client refresh, and care-form cache refresh.
- The sync-in-flight guard and manual photo-upload override reference.

The API endpoints, sync engine, upload policy, photo rules, and account-owner checks were not replaced. The hook composes the existing modules.

### Offline queue recovery and photo actions

Created `nurse/src/features/offline/useNurseOutboxActions.ts`.

It now owns retry, discard, audit and retake actions for queued operations and photos, including:

- Re-queuing failed operations and photos.
- Applying a rejected operation again with a new operation ID.
- Repairing optimistic visit state for replayed check-in/check-out operations in the existing IndexedDB transaction.
- Keeping the existing audit metadata for confirmed discards.
- Blocking photo discard/retake while sync is active, while a photo is sending, or after upload has completed.
- Reopening the relevant visit photo sheet after a successful retake reset.

The photo capture/compression and explicit manual-upload override remain in the app coordinator because they span the capture UI and sync control.

### Native session restoration

Created `nurse/src/features/authentication/useNativeSessionRestore.ts`.

It now owns:

- Native cold-start cache restoration using the stored refresh token and cached account owner.
- Consent filtering against locally accepted consent versions.
- Upgrading an offline-trusted cached session to a live session when possible.
- Retry on network restoration and native app resume.

The existing session provider remains responsible for sign-in/sign-out state and token mutation.

### SOS workflow

Created `nurse/src/features/sos/useNurseSos.ts`.

It now owns:

- Online SOS dispatch and local outbox fallback.
- SMS fallback URL construction and optional location enrichment.
- Starting live follow, sending location pings, and confirming safe-now with the server.

The SOS screens remain responsible for their own presentation and user confirmation.

### Visit workflow

Created `nurse/src/features/visits/useNurseVisitWorkflow.ts`.

It now owns:

- Ad-hoc visit creation and local-first persistence.
- Local-first visit notes.
- Check-in/check-out outbox writes and optimistic visit-state updates.
- Location disclosure gating and the pending-action flow.
- Location acquisition state, action-sheet state, and visit confirmation.
- Safety timer configuration and checkout notes.

Existing visit screen and route components remain presentation-focused.

### Version/update gate

Created `nurse/src/features/update/useNurseAppVersion.ts`.

It now owns installed-version detection, authenticated version checks, Android release metadata lookup, the pre-login native minimum-version check, and the derived forced-update gate.

### Push, reminders and inbox

Created `nurse/src/features/notifications/useNurseNotifications.ts` and `safeNotificationPath.ts`.

They now own push registration/cleanup, per-user device identity storage, push action routing through an allow-listed path, visit reminder scheduling and preferences, and the optional inbox fetch lifecycle.

## Admin application: delayed mail sending

Created `admin/src/features/admin/mail/useUndoSend.ts` and updated `MailPage.tsx` to compose it.

The hook owns the 8-second delayed-send window, undo/send-now actions, retry of transient dropped-connection failures, notice reporting, refresh after send, and the page-hide/unmount flush that prevents a pending draft from being stranded. Mailbox API paths and server-side idempotent-send assumptions remain unchanged.

## Coordinator impact

| File | Before Phase 2 | After Phase 2 |
|---|---:|---:|
| `nurse/src/app/App.tsx` | 836 lines | 733 lines |
| `admin/src/features/admin/mail/MailPage.tsx` | 539 lines | 486 lines |

The nurse app coordinator is now about 733 lines, compared with about 1,389 lines before the earlier Phase 1 presentation extractions. Line count is an indicator only; the important change is that independent lifecycle and workflow responsibilities now have explicit owners.

## Deliberately retained in coordinators

The nurse app coordinator still owns sign-in/sign-out and cross-app handoff orchestration, consent acceptance, photo capture/compression, photo-sheet server loading, manual photo-upload initiation, history pagination, and route/view prop composition. These operations cross UI, session, platform and offline boundaries; moving them wholesale would create additional abstraction without a demonstrated benefit.

The admin `CareWorkspace.tsx`, agreement coordinators, and remaining mail-page data/presentation logic remain candidates for a later targeted pass. The public booking form was not changed in Phase 2. This phase prioritised the nurse operational workflows identified in the Phase 2 plan and one self-contained admin workflow; it does not claim that every large source file has been modularised.

Generated API declaration files, locale dictionaries, and the nurse form-definition catalogue remain untouched to avoid hand-editing generated/data-owned content.

## Static review and verification limits

- Reviewed the changed nurse and mail modules and their integration points.
- Checked 96 relative import references across 11 changed files; no missing relative import targets were found.
- Confirmed the nurse app and admin mail page now import the extracted workflow modules.
- No tests, builds, typechecks, lint, or automated formatting commands were run, as requested.
- Static import inspection does not prove TypeScript compilation, native plugin behaviour, runtime correctness, or preservation of all edge cases.

Before shipping, run the normal project checks and manually exercise native cold-start restoration, offline recovery, photo upload/retake/discard, visit check-in/check-out, SOS live follow, push/reminder opt-in and sign-out, plus delayed mail send/undo/page-exit behaviour.
