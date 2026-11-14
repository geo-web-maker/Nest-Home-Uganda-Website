# Track E follow-up checklist

**Delivery rule:** Written, not run. CI will run it.

## Source coverage

- [x] E1 nurse Playwright mocked API fixture and workflow coverage
- [x] E2 axe accessibility dependency and nurse/admin care scans
- [x] E3 responsive matrix and nurse touch-target smoke coverage
- [x] E4 real-backend seed entry point and browser workflow
- [x] E5 additional admin care component/table/form coverage
- [x] E6 bundle budget guard and regression tests

## CI gates

- [ ] `npm ci --prefix nurse` resolves the exact axe pin and the existing package graph.
- [ ] `npm ci --prefix frontend` resolves the exact axe pin and the existing package graph.
- [ ] Nurse lint, typecheck, Vitest and build pass.
- [ ] Frontend lint, typecheck, Vitest and build pass.
- [ ] Nurse Playwright mocked suite passes.
- [ ] Nurse axe suite passes with zero serious/critical violations.
- [ ] Admin care axe suite passes with zero serious/critical violations.
- [ ] Responsive suites pass at 360/390/768/1280.
- [ ] Real-backend E2E starts MongoDB/MinIO, runs `backend/scripts/seed_e2e.py`, starts the backend and completes the nurse/admin workflow.
- [ ] Bundle guard passes the 200 KiB aggregate and 80 KiB nurse route-chunk limits.
- [ ] Nurse bundle contains no Leaflet.
- [ ] Existing route/scope and Track C/Track D tests remain green.

## Human acceptance

- [ ] Review axe findings and decide whether any best-practice-only issues should be addressed separately.
- [ ] Verify responsive layouts on physical Android devices, not only Playwright viewports.
- [ ] Verify geolocation permissions and offline browser behaviour on a supported device.
- [ ] Verify real photo upload flow separately in staging.
- [ ] Verify no test credentials or provider secrets are committed.

## Release gate

Track E is not a production sign-off until the CI and human acceptance items above are complete.
