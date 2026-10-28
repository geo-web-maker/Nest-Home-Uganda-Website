# Pre-APK test additions

- `docs/PRE_APK_RELEASE_TEST_SUITE.md` — release-gate policy, coverage and failure matrix.
- `scripts/pre-apk-release.mjs` — local release-gate orchestrator; stops on the first failure and never creates an APK.
- `.github/workflows/pre-apk-release.yml` — CI gate for pull requests/main/manual runs.
- `frontend/package.json` — `test:pre-apk` convenience command.
- `nurse/package.json` — `test:pre-apk` convenience command.

The gate deliberately reuses the existing frontend/nurse/backend test suites rather than creating duplicate tests that can drift from the application. New failures should be added to the closest application-specific suite and then included by the gate.
