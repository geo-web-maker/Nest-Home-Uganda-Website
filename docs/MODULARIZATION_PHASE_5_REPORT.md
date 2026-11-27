# Modularisation Phase 5 Report

## Objective

Phase 5 is the final planned coordinator-focused pass after Phases 1–4. It targets the remaining high-value workflow boundaries while preserving the active public site (`frontend-thread/`), API routes, payloads, permission enforcement, confirmation boundaries, and offline/session safety.

## Work completed

### 1. Admin agreements: notification and wording lifecycle

Created `admin/src/features/admin/agreements/useAgreementMessageTemplates.ts`.

Moved the message-template and agreement-wording lifecycle out of `AgreementsPage.tsx`:

- message stage/channel selection and loading;
- editing, saving, previewing, test sending and resetting notification templates;
- loading the current agreement wording and individual versions;
- installing source wording as a draft;
- parsing/saving draft clause JSON;
- publishing a selected draft version;
- API error field formatting for template operations.

The hook receives the page's busy/error/notice setters. `AgreementsPage.tsx` still owns agreement records, selection, permission-derived tab visibility, field revisions/conflicts, agreement delivery, countersigning, void/delete/amendment actions and record refresh. The `agreements:notifications` and `agreements:templates` visibility rules remain in the page; backend authorization remains authoritative.

### 2. Admin care: records table and action contract

Created `admin/src/features/admin/care/CareRecordsTable.tsx`.

- Extracted the records table, visible-column filtering, cell formatting, row keys and action-button presentation.
- Added a typed callback contract for visit review/reassignment/cancellation, flag resolution, photo hiding, alert acknowledgement/resolution, timesheet approval/send-back and SOS acknowledgement.
- Kept prompts, API calls, busy/error state, refresh and action messages in `CareWorkspace.tsx`.
- Kept row visibility/status conditions in the table so the same actions appear for the same record states as before.

The component is presentation-only and does not call privileged APIs. Existing server-side permission checks and nurse ownership restrictions are unchanged.

### 3. Nurse app: native cross-app handoff lifecycle

Created `nurse/src/features/authentication/useNurseNativeHandoff.ts`.

- Owns registration/cleanup of the `nhc:native-handoff` event listener.
- Validates the handoff code format before processing.
- Refuses account switching while the local outbox or photo queue contains unsent data.
- Preserves native refresh-token versus web CSRF-token handling.
- Preserves previous-user local sign-out/profile clearing before a different account is accepted.
- Delegates profile hydration, push registration and initial sync to the existing `completeSignIn` callback.

`nurse/src/app/App.tsx` remains the top-level composition owner for session, sign-in/sign-out cleanup, consent, offline sync, routes and cross-feature state. Those operations span several durable stores and safety boundaries, so they were not split into a generic “app controller”.

### 4. Active public agreement: revision-aware autosave lifecycle

Created `frontend-thread/src/features/public/agreements/useAgreementDraftAutosave.ts`.

Moved the field autosave lifecycle out of `AgreementPublicPage.tsx`:

- tracks dirty client/either-owned fields against the latest server view;
- sends `expected_revision` with each field change;
- serialises requests through a single save queue;
- updates the shared latest-view ref after successful saves;
- records per-field saving/saved/error state;
- reports server-rejected fields;
- on HTTP 409, reloads the latest signed-review session and asks the client to review/re-enter changes;
- on HTTP 429, observes the bounded retry delay, keeps local edits and schedules a later retry;
- autosaves after 1,200ms of inactivity, saves on field commit, supports explicit retry/flush before signing, and warns before leaving with unsaved/in-flight edits.

The page retains session creation/recovery, OTP, Turnstile, signature/passkey evidence, consent, assistance mode, final signing and session-replacement decisions. The hook receives the current `viewRef`, `loadReview`, and state setters so it does not become a second owner of the agreement session.

## Coordinator impact

Line counts in the Phase 4 archive compared with Phase 5:

| File | Phase 4 | Phase 5 |
|---|---:|---:|
| `admin/src/features/admin/agreements/AgreementsPage.tsx` | 812 | 661 |
| `admin/src/features/admin/care/CareWorkspace.tsx` | 625 | 498 |
| `nurse/src/app/App.tsx` | 684 | 650 |
| `frontend-thread/src/features/public/agreements/AgreementPublicPage.tsx` | 533 | 438 |

Line counts are an orientation aid, not a quality metric. The main result is clearer state/effect ownership and a smaller presentation/action surface in the care workspace.

## New modules added in Phase 5

- `admin/src/features/admin/agreements/useAgreementMessageTemplates.ts`
- `admin/src/features/admin/care/CareRecordsTable.tsx`
- `nurse/src/features/authentication/useNurseNativeHandoff.ts`
- `frontend-thread/src/features/public/agreements/useAgreementDraftAutosave.ts`

## Deliberately retained after Phase 5

- Admin agreement record lifecycle remains in `AgreementsPage.tsx`: record selection, field revision conflict handling, send/resend, countersigning, amendment, void and deletion share selected-record state and permission boundaries.
- Admin care mutation authority remains in `CareWorkspace.tsx`; the extracted table only renders available actions and invokes callbacks.
- Nurse sign-in, sign-out, offline sync, consent acceptance, outbox recovery, visit state and route composition remain composed at the app level because they coordinate durable local stores, token state and multiple feature hooks.
- Public agreement OTP/session recovery, Turnstile, signature/passkey evidence and final signing remain page-owned. The autosave hook does not own or replace the session lifecycle.
- Generated API declarations, locale dictionaries, nurse form definitions, and the older `frontend/` public-site copy remain untouched.

## Static review

- Inspected all eight changed/new source files and their integration points.
- Checked 91 relative import references across those files; no missing relative import targets were found.
- Confirmed the agreements page composes the new message-template hook and the message panel receives its existing values/callbacks.
- Confirmed the care workspace composes the presentation-only records table and retains the action handlers/API calls.
- Confirmed the nurse app composes the native handoff hook and retains sign-in/sign-out owners.
- Confirmed the public agreement page composes the autosave hook and continues to own the shared session view ref and signing flow.

## Verification limits

As requested, **no tests were run**. No builds, typechecks, lint, or automated formatting commands were run either. Static import inspection is not proof of TypeScript compilation, React hook correctness, browser/native runtime behaviour, or unchanged end-to-end behaviour.

Before shipping, manually verify:

1. Admin message-template load/edit/save/preview/test-send/reset, server field errors, template source install, draft version load/save and publish permissions.
2. Admin care table action visibility by tab/status; visit reassignment/cancellation; flag/photo/alert/timesheet/SOS actions; confirmation text; refresh/error feedback; and server-side authorization.
3. Nurse native handoff with malformed codes, empty queue, pending outbox/photo queue, same-user and different-user handoff, native refresh token, web CSRF token, and failed profile hydration.
4. Public agreement autosave after 1,200ms and field blur; multiple queued edits; server-refused fields; 409 concurrent edit; 429 retry; navigation warning; explicit retry; and final signing after pending edits flush.
5. Previously documented Phase 1–4 regressions: nurse offline/photo/SOS/mail/history flows, admin permission-sensitive operations and billing, public booking/careers validation, and agreement OTP/signing.
