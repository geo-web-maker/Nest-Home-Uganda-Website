# Modularisation Final Audit Checklist (Phases 1–5)

This is a manual/static review checklist. It is not evidence that the project compiles or that runtime behaviour has passed.

## Structure and ownership

- [ ] Each extracted component has a presentation-only role or a clearly documented feature-workflow owner.
- [ ] Page coordinators remain the single owner of page selection, permission context and server refresh where appropriate.
- [ ] No second copy of session, agreement revision, or offline queue state has been introduced.
- [ ] Compatibility barrels and established import paths remain available.
- [ ] Generated API declarations, locale dictionaries and form-definition catalogues remain generated/data-owned.
- [ ] The active public site is `frontend-thread/`; legacy `frontend/` is not accidentally substituted.

## Public site

- [ ] Thread component barrel still re-exports all original thread pieces.
- [ ] Public agreement OTP and Turnstile verification still work.
- [ ] Public agreement autosave preserves `expected_revision`, serial request ordering and latest server-view updates.
- [ ] Public agreement 409 conflict refreshes the session and requests review/re-entry.
- [ ] Public agreement 429 handling preserves local edits and waits the bounded retry interval.
- [ ] Public agreement signing flushes pending edits before final signature submission.
- [ ] Booking service selector preserves multi-select validation and focus behaviour.
- [ ] Careers upload preserves accepted file types, honeypot, consent and rate-limit behaviour.

## Admin

- [ ] Agreements notification template operations retain their original routes and payload fields.
- [ ] Agreement wording source install creates a draft and does not silently replace the published version.
- [ ] Template draft save/publish remains behind the existing `agreements:templates` authority.
- [ ] Message visibility retains `agreements:notifications` / `agreements:templates` rules.
- [ ] Agreement record field revisions, 409 refresh, send, resend, countersign, amendment, void and deletion retain their existing guards.
- [ ] Care table renders the same actions for the same tabs and record statuses.
- [ ] Care table invokes callbacks only; mutation prompts/API requests remain with the coordinator.
- [ ] Care visit reassignment/cancellation, flag resolution, photo hiding, alert actions, timesheet actions and SOS acknowledgement are manually exercised.
- [ ] Timesheet API calls remain protected by server scopes; no UI extraction grants new authority.
- [ ] Client data export/anonymisation still requires the existing confirmation and audit path.
- [ ] Billing agreement option selection preserves practice/standard behaviour and editor-close cancellation.

## Nurse

- [ ] Native handoff rejects malformed/short codes.
- [ ] Account switching is blocked while outbox operations or photos remain pending.
- [ ] Same-user and different-user handoff paths are manually exercised.
- [ ] Native refresh-token storage and web CSRF credential storage remain distinct.
- [ ] Handoff profile hydration still uses the shared sign-in completion path.
- [ ] Sign-out still revokes where possible and clears the same user-scoped local stores.
- [ ] Offline sync, photo queue retry/discard/retake, history pagination and SOS flows retain their previous owners and safeguards.
- [ ] Nurse timesheets remain limited by backend `timesheets:read` and ownership enforcement.

## Release verification (not performed in these phases)

- [ ] Run the repository's prescribed formatting check.
- [ ] Run frontend/admin/nurse typechecks and production builds using the documented package-manager commands.
- [ ] Run the relevant unit/component tests.
- [ ] Run the backend test suite where API/permission contracts are involved.
- [ ] Run browser/manual end-to-end checks for the workflows above.
- [ ] Review CI output and resolve failures before deployment.

**Important:** The Phase 1–5 work intentionally did not run tests, builds, typechecks, lint or automated formatting, per the user's instruction. Complete the release-verification section before treating this archive as production-ready.
