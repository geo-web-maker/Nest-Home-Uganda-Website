# Track D follow-up checklist

**Delivery rule:** Written, not run. CI will run it.

## Source coverage

- [x] D1 routed care screen group and shared list/screen implementation
- [x] D2 nurses list/invite/edit/deactivate/supervisor/device revoke actions
- [x] D3 clients, places, map picker validation and stay movement
- [x] D4 schedule pickers, reassignment/cancellation and overlap-error surfacing
- [x] D5 visit detail/review timeline, verification/distance and event-coordinate map
- [x] D6 flags filters and required-note resolution
- [x] D7 private photo review surface and hide-with-reason action
- [x] D8 alerts/team status surface and acknowledge/resolve actions
- [x] D9 timesheet weekly/list workflow actions, adjustment reason and locked-export rule
- [x] D10 SOS list/acknowledge, on-call roster and test SMS
- [x] D11 filtered care report preview and CSV download
- [x] D12 schema-driven settings and readiness views
- [x] D13 actor/entity/date audit filters and cursor paging
- [x] Dedicated route smoke-test files for every D screen
- [x] Backend contract test for activity cursor/filter support and test-SMS isolation

## CI gates — not run

- [ ] `nurse/package-lock.json` reviewed/committed if required by current CI
- [ ] `bash scripts/gen-types.sh` run and generated OpenAPI/frontend types reviewed
- [ ] Backend lint/type/import checks
- [ ] Existing backend tests plus Track C and Track D tests
- [ ] Frontend lint/typecheck/test/build
- [ ] Route coverage and scope-enforcement suite
- [ ] Playwright route rendering for every D screen
- [ ] Accessibility: serious/critical axe violations = zero
- [ ] Responsive matrix at the repository's required widths
- [ ] Map tile URL checked by external-resource guard
- [ ] Visit overlap warning and supervisor reach acceptance
- [ ] Private photo signed URL, hide and audit acceptance
- [ ] Timesheet adjustment/approval/send-back/export lock acceptance
- [ ] SOS test-SMS provider acceptance and no-case/no-alert invariant
- [ ] On-call roster E.164 validation acceptance
- [ ] Report filter/cursor/CSV audit acceptance
- [ ] Settings schema types and readiness blockers acceptance
- [ ] Audit cursor ordering under equal timestamps

## Owner/deployment gates

- [ ] Confirm owner-approved `care.map_tile_url` and allowlist entry
- [ ] Confirm on-call contact list and `sms.test_number`
- [ ] Confirm care-reports export policy
- [ ] Confirm privacy/legal wording remains supplied by owner/legal adviser rather than authored in code
- [ ] Confirm production frontend origin and API/CSP settings

## Confidence label

Track D files are source-authored and structurally packaged. No application command, browser run, build, migration, provider call or generated-type workflow was executed in this delivery.
