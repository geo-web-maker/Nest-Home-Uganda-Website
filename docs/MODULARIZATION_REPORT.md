# UI Modularisation Report

## Scope and approach

This pass continues from `Nest-Home-Uganda-Website-ui-fixes-2.zip` and focuses on separating presentation responsibilities from page-level state, data loading, permissions, and workflow orchestration.

The active public website is `frontend-thread/`, as clarified in the project discussion. The older `frontend/` public-site copy was left untouched. Admin and nurse app modules were also reorganised where the source had large, mixed-responsibility React components.

The refactor is intended to preserve existing API routes, payloads, permission checks, and user-facing flows. Components receive their data and callbacks from their owning page/coordinator; API and mutation authority stays in the existing parent where practical.

## Work completed

### Public site: `frontend-thread/`

- Split `src/components/thread/ThreadParts.tsx` into six focused modules:
  - `ThreadDecorations.tsx`
  - `ThreadRail.tsx`
  - `ThreadHang.tsx`
  - `ThreadStory.tsx`
  - `ThreadContent.tsx`
  - `ThreadSignals.tsx`
- Kept `ThreadParts.tsx` as a compatibility barrel that re-exports the original named components, preserving existing imports.
- Split the public agreement flow into modules for shared agreement types/primitives, signed agreement display, signing UI, client-editable fields, OTP verification, and assisted-completion choices.
- Kept `AgreementPublicPage.tsx` as the owner of session state, loading, autosave, validation, and server actions.
- Reflowed the remaining long expressions in the public agreement page so JSX and nearby logic are easier to inspect.

### Admin application

- Agreements:
  - Extracted message-template, delivery, countersign, lifecycle-action, field-editor, schedule, preview/PDF, timeline, and secure-link responsibilities.
  - Moved shared field types to `agreementFieldTypes.ts`.
  - Kept `AgreementsPage.tsx` as the coordinator for queries, selection, permissions, and server mutations.
- Billing:
  - Extracted `BillingInvoiceEditor`, `BillingInvoiceDetail`, and shared billing types.
  - Reduced `BillingPage.tsx` from 1,292 lines to 985 lines.
- Care:
  - Moved screen route/scope/endpoint/title configuration into `careScreenConfig.ts`.
  - Extracted row/column and per-row action rendering into `CareScreenColumns.tsx`.
  - Extracted settings, readiness, and data-export panels into `CareScreenPanels.tsx`.
  - Reduced `CareScreenPage.tsx` from 1,087 lines to 695 lines.
- User management:
  - Extracted the issued-credentials display, password-reset panel, invitation panel, access editor, and shared delivery helpers.
  - Reduced `UsersPage.tsx` from 612 lines to 355 lines. The page retains queries, mutations, permissions, and state ownership.
- Reflowed long JSX and long inline expressions in the agreements, care, and user-management coordinators.

### Nurse application

- Extracted primary route-node construction into `primaryRouteViews.tsx`.
- Extracted visit route composition into `visitRouteViews.tsx`.
- Extracted the access/update/consent gate into `NurseAccessGate.tsx`.
- Extracted visit action sheets into `VisitActionSheets.tsx`.
- In the subsequent Phase 2 pass, extracted offline synchronisation/cache refresh, offline queue recovery and photo actions, native session restoration, SOS dispatch/live-follow, visit workflows, app-version gating, push/reminder/inbox lifecycle, and safe notification path validation into focused feature modules.
- The nurse coordinator continues to own sign-in/sign-out, cross-app handoff, consent acceptance, manual upload initiation, and route/view composition. Phase 3 moved photo capture/sheet state and history pagination into dedicated hooks.
- See `MODULARIZATION_PHASE_2_REPORT.md` for the detailed Phase 2 module map and verification limits.

## File size reference

Selected coordinator changes (line counts in the uploaded archive compared with this working copy):

| File | Before | After |
|---|---:|---:|
| `frontend-thread/src/components/thread/ThreadParts.tsx` | 625 | 10 |
| `frontend-thread/src/features/public/agreements/AgreementPublicPage.tsx` | 658 | 564 |
| `admin/src/features/admin/billing/BillingPage.tsx` | 1,292 | 985 |
| `admin/src/features/admin/care/CareScreenPage.tsx` | 1,087 | 695 |
| `admin/src/features/admin/users/UsersPage.tsx` | 612 | 355 |

Line counts are a rough indicator only. Some files have more lines after long single-line expressions were expanded for readability.

## Deliberately not split

The following large files are generated declarations or data catalogues, not hand-maintained UI components. They were left intact to avoid breaking regeneration or data ordering:

- `admin/src/_shared/types/api.d.ts`
- `frontend/src/types/api.d.ts`
- `frontend-thread/src/types/api.d.ts`
- `nurse/src/features/careforms/formDefs.ts`
- locale dictionaries under `locales/`

Some hand-maintained coordinators remain substantial by design, including the admin agreement and billing pages, nurse `app/App.tsx`, and the mail page coordinators. Their remaining work crosses record revisions, permission boundaries, durable offline stores, or multiple feature lifecycles. Phase 5 extracted the highest-value independent workflows while retaining those shared-state boundaries; see `MODULARIZATION_ARCHITECTURE_MAP.md` for the current ownership map.

## Verification limits

As requested, **no tests were run**. No build, typecheck, lint, or automated formatter was run either.

The work was reviewed at source level. A static inspection confirmed that all 37 newly added modules exist and that their relative import targets resolve. The thread compatibility barrel still contains its six module re-exports. These checks do **not** prove that the project compiles or that runtime behaviour is unchanged.

Before shipping, run the normal project checks and manually exercise the extracted public agreement, admin agreement/billing/care/user, and nurse visit/offline/SOS flows in their respective environments.

## Phase 2 continuation

The later workflow extraction pass is documented in `MODULARIZATION_PHASE_2_REPORT.md`. It reduces `nurse/src/app/App.tsx` to 733 lines and separates the admin mail delayed-send workflow into `useUndoSend.ts`. No test/build/typecheck/lint commands were run in that phase.


## Phase 3 continuation

Phase 3 further separates nurse photo capture and history pagination, admin care client-data export/anonymisation, and public booking/careers field groups. See `MODULARIZATION_PHASE_3_REPORT.md` for the detailed module map and verification limits. No test/build/typecheck/lint commands were run in Phase 3.

## Phase 4 continuation

Phase 4 separates nurse mail draft autosave and undo-send lifecycle into dedicated hooks, extracts public agreement signature-canvas handling, and moves admin billing agreement-option loading/selection into a focused hook. See `MODULARIZATION_PHASE_4_REPORT.md` for the detailed module map, retained boundaries, and verification limits. No tests, builds, typechecks, lint, or formatter commands were run in Phase 4.

## Phase 5 continuation

Phase 5 extracted the admin agreement message/template lifecycle, the admin care records table with a typed callback contract, the nurse native cross-app handoff lifecycle, and the active public agreement's revision-aware autosave lifecycle. The detailed implementation and verification limits are in `MODULARIZATION_PHASE_5_REPORT.md`. The updated ownership map is `MODULARIZATION_ARCHITECTURE_MAP.md`, and the final pre-release manual audit is `MODULARIZATION_FINAL_AUDIT_CHECKLIST.md`. No tests, builds, typechecks, lint or automated formatting commands were run, as requested.
