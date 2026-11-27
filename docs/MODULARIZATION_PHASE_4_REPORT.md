# Modularisation Phase 4 Report

## Objective

Phase 4 continues from the Phase 3 modular archive. This pass targets three remaining workflow-heavy areas: nurse mail draft lifecycle, public agreement signature capture, and admin billing agreement selection. The active public website remains `frontend-thread/`; the older `frontend/` copy is not modified.

The intent is to move cohesive state/effect ownership into feature hooks while keeping page-level orchestration, API contracts, permissions, and user-facing flows stable.

## Work completed

### 1. Nurse mail lifecycle

Created `nurse/src/features/mail/useNurseMailDraftAutosave.ts`.

- Owns the composer idle-save effect and its 750ms debounce.
- Preserves recipient parsing for To/CC/BCC, HTML/plain body metadata, quote/reply metadata, server draft ID, attachments, draft state, and saved timestamp.
- Uses the existing `putDraft` persistence function and refreshes the existing draft list after saving.
- Preserves the existing localized local-draft failure message.

Created `nurse/src/features/mail/useNurseMailUndoSend.ts`.

- Owns the pending undo record, timer, undo action, and explicit “Send now” flush action.
- Preserves the 8-second undo interval.
- Preserves the previous behaviour when a second send is initiated during an existing undo window: the previous pending message is released before the new one takes its place.
- Preserves the screen-unmount safeguard: a pending message is written to the local queue rather than abandoned.
- Leaves actual queue delivery, retry classification, API calls, and refresh logic with the existing mail coordinator through the `releaseSend` callback.

`MailScreen.tsx` now composes these hooks. It remains the owner of mailbox navigation, message operations, attachment upload, draft editing, and send-queue orchestration.

### 2. Public agreement signature capture

Created `frontend-thread/src/features/public/agreements/useAgreementSignatureCanvas.ts`.

- Owns the canvas ref, pointer coordinate conversion, drawing state, ink-presence flag, stroke lifecycle, and clear action.
- Preserves the canvas coordinate scaling against the rendered canvas bounds.
- Preserves pointer capture, line width/cap/join/stroke colour, and PNG data extraction through the existing canvas ref.
- Exposes the same `hasInk` guard used by the signing submission path. The page still owns signature method selection, credential/passkey evidence, consent, and final signing API request.

`AgreementPublicPage.tsx` now composes this hook and no longer contains the pointer-drawing implementation.

### 3. Admin billing agreement options

Created `admin/src/features/admin/billing/useBillingAgreementOptions.ts`.

- Owns the agreement-options query lifecycle for the invoice editor.
- Preserves the existing endpoint `/admin/billing/agreement-options` and `practice` query parameter.
- Preserves cancellation protection for an editor that closes or changes practice mode before the request completes.
- Owns the loaded agreement choices, load-error state, selection note, and selection handler.
- Delegates the selected agreement to the page so the page continues to own invoice form fields and service-period application.

`BillingPage.tsx` continues to own invoice/payment mutations, permissions, totals, document operations, and modal lifecycle. No billing API payload or route was intentionally changed.

## Coordinator impact

| File | Phase 3 baseline | Phase 4 result |
|---|---:|---:|
| `nurse/src/features/mail/MailScreen.tsx` | 587 | 554 |
| `frontend-thread/src/features/public/agreements/AgreementPublicPage.tsx` | 564 | 533 |
| `admin/src/features/admin/billing/BillingPage.tsx` | 985 | 963 |

Line counts are a rough indicator. The primary gain is that the autosave/undo lifecycle, signature drawing lifecycle, and billing agreement-option lifecycle now have explicit owners.

## New modules

- `nurse/src/features/mail/useNurseMailDraftAutosave.ts`
- `nurse/src/features/mail/useNurseMailUndoSend.ts`
- `frontend-thread/src/features/public/agreements/useAgreementSignatureCanvas.ts`
- `admin/src/features/admin/billing/useBillingAgreementOptions.ts`

## Deliberately retained

- Nurse mail send-queue delivery remains in `MailScreen.tsx` because it coordinates server draft creation/update, send attempts, permanent/transient failure classification, and refresh state. The undo hook only releases a draft through the existing callback.
- Nurse mail attachment upload remains in its existing workflow because it spans upload state, server draft synchronisation, attachment disposition, and composer updates.
- Public agreement field autosave, OTP, session recovery, credential/passkey signing and change requests remain in `AgreementPublicPage.tsx` or their existing dedicated components. Those flows share session and revision state and should be extracted as a complete contract, not split piecemeal.
- Admin billing invoice/payment mutations and document lifecycle remain in `BillingPage.tsx`; moving them safely requires a separately reviewed state contract that retains all scope checks and idempotency behaviour.
- The nurse top-level `App.tsx`, admin agreements page, and admin care workspace remain candidates for future coordinator-focused passes. Avoid extracting their callbacks without carrying permission checks, confirmation boundaries, and refresh/error ownership with them.
- Generated API declarations, locale dictionaries, and nurse form-definition catalogue remain untouched.

## Static review

- Reviewed the changed source files and their integration points.
- Confirmed the new hooks are imported and composed by their intended page coordinators.
- Confirmed the old inline signature pointer handlers and billing agreement-options fetch block are no longer present in their page files.
- Checked relative import targets for all seven changed/new source files; no missing relative targets were found.
- Checked the archive contents and ZIP integrity after packaging.

## Verification limits

As previously requested, **no tests were run**. No builds, typechecks, lint, or automated formatting commands were run either. This report does not claim that the project compiles or that runtime behaviour has been verified.

Before shipping, manually exercise:

1. Nurse mail draft autosave after the 750ms idle period, local-storage failure feedback, queued-send undo, “Send now”, replacing an active undo window, and leaving the screen while the undo window is active.
2. Public agreement drawn signature on mouse and touch/pointer input, clear-and-redraw, empty-signature rejection, and successful PNG evidence generation in the signing flow.
3. Admin billing agreement options for standard and practice invoices, failed loading, editor close during loading, choosing an agreement, preserving manually populated service periods, and clearing/replacing the selected agreement.
4. The previously documented Phase 1–3 regression scenarios, especially nurse offline/photo/SOS flows, permission-sensitive admin actions, public booking/careers validation, and agreement autosave/signing.

## Suggested Phase 5 scope

A final coordinator and architecture pass should be planned separately. Highest-value candidates are:

- `admin/src/features/admin/agreements/AgreementsPage.tsx`: split message/template lifecycle from agreement record lifecycle without weakening scope checks.
- `admin/src/features/admin/care/CareWorkspace.tsx`: extract the records/action table with a typed action contract that retains review/flag guards and list refresh.
- `nurse/src/app/App.tsx`: map and separate only the remaining cross-feature orchestration that can be given a clear owner; keep session, consent, permission, and offline-sync boundaries explicit.
- Public agreement page: consider a dedicated autosave/session hook only after documenting revision conflict, retry, and session-replacement semantics.
- Add an architecture map and a final non-test static audit checklist covering all modules created in Phases 1–4.
