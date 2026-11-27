# Nest Home Care UI Modularisation Architecture Map

This map records the ownership boundaries established across Phases 1–5. It is an orientation aid, not a claim that every feature is fully decomposed or runtime-verified.

## Active public website: `frontend-thread/`

| Area | Page/coordinator | Focused modules and ownership |
|---|---|---|
| Thread presentation | Thread components | `ThreadDecorations`, `ThreadRail`, `ThreadHang`, `ThreadStory`, `ThreadContent`, `ThreadSignals`; `ThreadParts.tsx` remains a compatibility barrel |
| Public agreements | `AgreementPublicPage.tsx` | OTP/signing/assistance/signed-view panels; `useAgreementSignatureCanvas` owns drawing; `useAgreementDraftAutosave` owns revision-aware serialised field saves and conflict/rate-limit handling |
| Booking | `BookingForm.tsx` | `BookingServiceSelector` owns the service multi-select field group; the form owns validation and submission |
| Careers | `ApplicationForm.tsx` | `ApplicationUploadFields` owns CV input and honeypot presentation; the form owns validation, consent, rate limiting, and submission |

The older `frontend/` directory is retained as a separate/legacy copy and was not modified by these modularisation passes.

## Admin application: `admin/`

| Area | Page/coordinator | Focused modules and ownership |
|---|---|---|
| Agreements | `AgreementsPage.tsx` | `useAgreementMessageTemplates` owns message-template and agreement-wording lifecycle; panels own schedule, preview/PDF, timeline, delivery and lifecycle presentation; page owns agreement records, permissions and record mutations |
| Billing | `BillingPage.tsx` | Invoice editor/detail, service-date helpers, document/download rules, billing types, `useBillingAgreementOptions` |
| Care screens | `CareScreenPage.tsx` | Screen configuration, row/column rendering, settings/readiness/data panels |
| Care workspace | `CareWorkspace.tsx` | `CareRecordsTable` is presentation-only with a typed action callback contract; page owns prompts, API mutations, permission context, errors and refresh; `useCareClientDataTools` owns client export/anonymisation workflow |
| User management | `UsersPage.tsx` | Credentials, password reset, invitation, access editor, delivery helpers |
| Mail | `MailPage.tsx` | Delayed-send undo lifecycle extracted in Phase 2 |

Permission checks and API mutation ownership remain explicit in the admin page or a hook that receives the relevant permission result and refresh/error callbacks. Never move a UI action in a way that grants authority beyond the backend scope.

## Nurse application: `nurse/`

| Area | Coordinator | Focused modules and ownership |
|---|---|---|
| Main app | `app/App.tsx` | Route composition, session, sign-in/sign-out, consent, offline-sync composition and cross-feature orchestration |
| Native handoff | App composes `useNurseNativeHandoff` | Event listener lifecycle, handoff-code validation, pending-queue guard, native refresh-token/web CSRF exchange; profile hydration remains delegated to app callback |
| History | App composes `useNurseHistory` | Cached history, online pagination, deduplication and persistence |
| Photos | App composes `useNursePhotoWorkflow` | Capture sheet, permission/storage checks, compression, local outbox enqueue and server-photo retrieval |
| Offline | App composes offline-sync/outbox hooks | Sync lifecycle, cache refresh, recovery, retry/discard/retake safeguards |
| Visits | App composes visit workflow and route view modules | Visit actions, route views, action sheets |
| SOS | Feature workflow modules | Dispatch/live-follow/safe-now paths; retain server authorization and safety confirmations |
| Mail | `features/mail/MailScreen.tsx` | Mailbox orchestration; draft autosave and undo-send hooks own the local draft lifecycle |

The nurse client must not bypass backend scopes. In particular, timesheet visibility remains controlled by the server's `timesheets:read` permission and nurse ownership rules.

## Shared and generated material

- Shared API clients, generated API declarations, locale dictionaries, and form-definition catalogues remain authoritative in their existing locations.
- Generated declarations and large data catalogues are not candidates for manual JSX-style splitting.
- Compatibility barrels remain where established import paths are in use.

## Cross-cutting ownership rules

1. Page coordinators own navigation, page-level query selection, and composition.
2. Feature hooks own a cohesive state/effect lifecycle with explicit inputs and callbacks.
3. Presentational components receive values and callbacks; they should not independently call privileged APIs.
4. API routes, payload shapes, idempotency keys, permission checks, audit behaviour, and irreversible-action confirmations must remain unchanged unless a separately approved functional change is requested.
5. Offline queues must preserve retry classification, idempotency, and user-visible recovery paths.
6. A smaller line count is not by itself proof of better modularity; each module needs one clear responsibility and a documented owner.
7. Session and revision state should have one authoritative owner. Hooks may coordinate it, but should not create competing copies.

## Remaining deliberate boundaries

- Admin agreement record lifecycle remains with its coordinator because field revisions, selected-record refresh, countersigning and lifecycle actions share record state and scope checks.
- Nurse app sign-in/out and offline cleanup remain composed at the app level because they span tokens, durable stores, push registration and feature state.
- Public agreement OTP, session replacement, Turnstile and signing remain page-owned; autosave is extracted only as a subordinate revision-aware workflow.

See `MODULARIZATION_PHASE_5_REPORT.md` for the final pass and `MODULARIZATION_FINAL_AUDIT_CHECKLIST.md` for the recommended pre-release review. No tests/builds/typechecks/lint/formatters were run during these passes under the user's instruction.
