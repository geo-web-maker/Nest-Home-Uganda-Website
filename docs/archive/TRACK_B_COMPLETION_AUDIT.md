# Track B completion audit — Nurse Module

**Audit date:** 2026-10-25  
**Scope:** Track B, phases B1–B17 in `NURSE_FREE_SESSION_PLAN.md`.  
**Rule:** `Written, not run. CI will run it.`  
**Status meaning:** “Implemented in source” means code and/or tests are present in this archive. It does not mean typecheck, tests, build, backend integration, accessibility, or device acceptance passed.

## Executive status

The Track B implementation has been consolidated in source: the nurse experience has an application shell and route table; session/profile hooks; Today, History, visit-detail, active-visit, arrival/departure, note, photo, sync and profile screens; offline queue/conflict handling; foreground heartbeat; hold-to-confirm SOS; safety timer state; update messaging; style and copy guards; and focused regression tests.

**Track B source work is substantially authored, but Track B is not release-verified.** In particular, the Track B work has not been run against Node, browser, Android, or a live backend. The nurse workflow currently hard-fails because `nurse/package-lock.json` is absent. The push inbox remains deliberately feature-flagged because the C5 `/field/inbox` endpoint is not part of the current backend contract. See the phase table and open items below.

## B1–B17 phase matrix

| Phase | Source result in this archive | Regression coverage authored | Verification state / caveat |
|---|---|---|---|
| **B1 — Sync engine** | `nurse/src/offline/syncEngine.ts` centralises sync policy behind injected dependencies; `App.tsx` calls it. Cursor pulling is isolated in `pullSyncPages.ts`. Retry classification, exponential backoff, due-work selection, owner-mismatch handling, and permanent failures move work to attention. | `syncEngine.test.ts`, `syncPolicy.test.ts`, `pullSyncPages.test.ts`, `db.test.ts` | Written, not run. CI must prove consent-first ordering, single flight, retries, paging and transaction behaviour. |
| **B2 — Session/profile state** | `app/useSession.ts`, `app/useFieldProfile.ts` separate session and field-profile operations; logout guard remains in place; secure token restoration is best-effort and does not erase a token on network failure. | `useSession.test.tsx`, `useFieldProfile.test.tsx`, `LogoutGuard.test.tsx`, `logoutGuard.test.ts` | Written, not run. Native secure storage, account switching and revoke fallback require CI/device validation. |
| **B3 — Router/shell/tabs** | `app/routes.tsx`, `AppShell.tsx` and `App.tsx` connect login, Today, onboarding, History, Profile, Sync, visit detail and active visit routes. Shell includes connection/waiting state, Today/History/Profile tabs and an SOS dock. Styling includes safe-area and reduced-motion treatment. | `routes.test.tsx`, `AppShell.test.tsx`, route/shell related `App.test.tsx` | Written, not run. Browser navigation, all responsive breakpoints, keyboard navigation and accessibility acceptance remain to be demonstrated. |
| **B4 — Login/onboarding/permissions** | `LoginScreen.tsx` and `Onboarding.tsx` provide login, a prominent location disclosure and notification opt-in. Location is foreground-only. A pending arrival/departure intent is retained while onboarding is completed. | `LoginScreen.test.tsx`, `Onboarding.test.tsx`, `useSession.test.tsx` | Written, not run. Native permission prompts must be validated on real Android/iOS targets; no background location is introduced. |
| **B5 — Today/visit cards** | `TodayScreen.tsx` and `VisitCard.tsx` provide today list, active visit emphasis, empty/loading/adhoc gating states. The app uses the Kampala calendar-day key and retains in-progress visits. | `TodayScreen.test.tsx`, `VisitCard.test.tsx` | Written, not run. Kampala midnight/DST-equivalent boundary and cancelled/reassigned tombstone scenarios still need end-to-end acceptance. |
| **B6 — Visit detail** | `VisitDetail.tsx` shows address/instructions/notes and status-sensitive actions, with routes to visit actions. | `VisitDetail.test.tsx` | Written, not run. Verify against live payloads and the approved reference at every visit status. |
| **B7 — Arrival/departure sheets** | `ArriveSheet.tsx`, `LeaveSheet.tsx` show explicit location status (`acquiring`, `good`, `low_accuracy`, `denied`, `unavailable`). Location is treated as a hint; an offline action can still be queued. Visit state and optional checkout note are written in a single local transaction to avoid partial/duplicate operations. | `ArriveSheet.test.tsx`, `LeaveSheet.test.tsx`, `db.test.ts` | Written, not run. Double taps, permission denial and transaction failure require automated and device validation. A required photo governed by organisation settings is explained instead of presenting an impossible action. |
| **B8 — Active visit/timer** | `ActiveVisit.tsx` derives elapsed time from persisted check-in time (not mount time), offers note/photo/leave actions and displays safety state honestly. | `ActiveVisit.test.tsx`, `SafetyTimerPrompt.test.tsx` | Written, not run. App-kill/reopen behaviour and Android lifecycle behaviour require device testing. |
| **B9 — Notes/photos** | `NoteSheet.tsx`, `PhotoSheet.tsx` and photo feature modules use offline notes/photo records, image compression and thumbnails, pending-count warning, a Wi-Fi-only preference, and a one-photo/one-shot manual upload override. | `NoteSheet.test.tsx`, `PhotoSheet.test.tsx`, `features/photos/compress.test.ts`, `uploadPolicy.test.ts` | Written, not run. No real provider upload ran. Check EXIF stripping, storage pressure and retries with browser/device integration tests. |
| **B10 — History** | `HistoryScreen.tsx` uses cached history and load-more/pagination state; app retrieval calls `/field/history`. | `HistoryScreen.test.tsx` | Written, not run. Validate the actual backend’s page/cursor contract, duplicates, and empty page behaviour in integration tests. |
| **B11 — Sync/needs attention** | `SyncScreen.tsx` separates queued, deferred and needs-attention work; lists are scoped to current owner; retry controls, discard confirmation, error copying and photo-specific upload override are wired. | `SyncScreen.test.tsx`, `syncEngine.test.ts`, `syncPolicy.test.ts`, `useFieldProfile.test.tsx` | Written, not run. Owner-scoping and discard/audit semantics must be confirmed in CI against the current DB schema. |
| **B12 — Conflict resolution** | `syncPolicy.ts` maps server reason codes to plain language. Apply-again requeues under a new ID/client operation ID; removed/reassigned visits and invalid payloads cannot be blindly re-applied. | `syncPolicy.test.ts`, `SyncScreen.test.tsx`, `db.test.ts`, `syncEngine.test.ts` | Written, not run. Backend rejection response shapes and the full apply-again/discard lifecycle need integration acceptance. |
| **B13 — SOS** | `features/sos/SosSheet.tsx` supplies hold-to-confirm and a cancel window. The app tries the online `/field/sos` endpoint; offline/unavailable handling preserves a queued SOS and opens an SMS composer. SMS is never silently sent and contains no health details. SOS is reachable from the shell. | `SosSheet.test.tsx`, `sosMessage.test.ts` | Written, not run. No actual emergency call, real SMS dispatch or live SOS endpoint call was performed. The owner must configure/verify the actual recipient workflow. |
| **B14 — Safety timer/heartbeat** | `features/heartbeat/useHeartbeat.ts` sends foreground heartbeat while an active visit exists and reacts to app resume. `SafetyTimerPrompt.tsx` distinguishes local `pending_sync` from server-confirmed monitoring; server deadline/state is returned in field sync/detail responses. No background service was added. | `useHeartbeat.test.tsx`, `SafetyTimerPrompt.test.tsx`, `backend/tests/test_db_sync_pull.py` | Written, not run. A locally queued timer is explicitly not described as remotely armed until server confirmation. Validate alert job timing and lifecycle on a real device. |
| **B15 — Profile/inbox/update** | `ProfileScreen.tsx` includes account/device/version, reminders, inbox state and sign-out. `UpdateNotice.tsx` handles newer versions and minimum-supported blocking. Version comparison is isolated in `lib/version.ts`. | `UpdateNotice.test.tsx`, `lib/version.test.ts`, `useSession.test.tsx` | Written, not run. **Inbox is feature-flagged** with `VITE_NURSE_INBOX_ENABLED`; `/field/inbox` and mark-read lifecycle depend on Track C5, so the flag must remain off until the endpoint contract is implemented and verified. |
| **B16 — Design polish** | `nurse/src/styles.css` uses design tokens, safe-area-aware layout and reduced-motion rules; style guard is provided in `scripts/check-nurse-styles.mjs`. | `scripts/__tests__/check-nurse-styles.test.mjs` | Written, not run. Static guard does not replace visual review at actual device sizes or accessibility testing. |
| **B17 — Copy/string guard** | `nurse/src/copy.ts` centralises shared app, workflow, sync, safety, photo and notification wording. Visit states and outbox operation labels are now mapped through central helpers; the SOS visible label is also centralised. Relevant modules import the shared copy; `scripts/check-strings.mjs` is wired into the nurse workflow. | `nurse/src/copy.test.ts`, `scripts/__tests__/check-strings.test.mjs` and related module tests | Written, not run. The string guard operates on the built output, so it cannot be considered passed before CI runs the build and guard. A final manual source-string sweep can still catch minor residual literal UI text. |

## Key reliability and safety changes in the consolidation

- **Offline pull merge:** a stale server snapshot no longer overwrites a locally queued check-in/check-out state. A server-confirmed checkout can clear the local pending safety warning; an unconfirmed timer stays visibly pending.
- **Atomic local writes:** visit state, queued action and optional final note are persisted together, avoiding a saved action with a missing note or duplicate note after partial failure.
- **Timer claim integrity:** a queued timer is not represented as remotely monitored unless a server response actually confirms the armed state and deadline.
- **Photo data use:** “upload now” overrides Wi-Fi-only preference for the selected photo only and only for one sync attempt; it does not enable all queued photos on mobile data.
- **Account separation:** queue/photo summaries and sync-screen records are filtered by the signed-in owner. Local pending work is preserved on account switch rather than transferred to another nurse.
- **SOS privacy:** offline fallback opens the SMS composer only; copy does not contain a diagnosis or other health details. No emergency recipient was invented.
- **Foreground-only location:** no background location permission or background location service was introduced.
- **Bad conflicts:** invalid payloads and removed/unassigned visits do not get the “apply again” shortcut.

## CI and acceptance blockers

1. `nurse/package-lock.json` is absent. `.github/workflows/nurse.yml` explicitly fails before installation when that file is missing. Run the approved `nurse-lockfile` workflow in GitHub, review the generated lockfile and commit it before expecting nurse CI to proceed.
2. No package install, lint, typecheck, unit test, build, Playwright run, backend pytest run, Android build or real-device check was performed during this change. All tests in this archive are **written, not run**.
3. `VITE_NURSE_INBOX_ENABLED` must remain unset/false until the C5 backend inbox API and mark-read behaviour are implemented and verified. UI presence does not make the endpoint available.
4. Verify the API `connect-src` configuration in `nurse/vercel.json` against the deployment’s real API origin; do not invent the origin to make the policy appear complete.
5. Android debug workflow SDK package names and native permission/lifecycle behaviour remain unverified. This Track B archive does not claim a signed release.
6. Backend SOS, heartbeat, safety timer alerts, sync push/pull, note actions and photo upload need integration acceptance against a test backend. Provider credentials and real push/SMS are not exercised by unit tests.
7. Accessibility, keyboard reachability, small-screen/large-text layout, photo-storage exhaustion, interrupted uploads, offline/online transitions and concurrent sync require the CI/device matrix.

## Minimum follow-up after handoff

1. Generate/review/commit `nurse/package-lock.json` with the existing lockfile workflow.
2. Allow GitHub CI to run: repo-level nurse package/style/Android-override tests; nurse lint; typecheck; Vitest; Vite build; external URL, bundle-size, font, string, and style guards; Playwright browser acceptance.
3. Run backend pytest for the added field sync safety fields and the affected SOS/heartbeat/visit routes against the approved test database configuration. Do not point CI at production MongoDB.
4. Fix every first-failing CI item in a small follow-up diff; do not treat an authored test as evidence of a passing feature.
5. Validate notification, foreground heartbeat, location denial, SOS composer, safety-timer cancellation/expiry, offline check-in/out, account switch and photo upload on a real supported device.
6. Implement/verify Track C5 inbox API before enabling the inbox flag. Keep release signing and operational credentials owner-controlled.

## Final status

**Track B source consolidation: authored. Track B CI/device acceptance: pending.**  
**Written, not run. CI will run it.**
