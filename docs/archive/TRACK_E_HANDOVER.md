# Track E handover

## What changed

Track E is the QA/integration layer on top of Track D. It does not replace the existing Track B, C or D tests. It adds browser fixtures, accessibility scanning, responsive checks, a real-backend CI entry point, admin care component coverage and stronger bundle guards.

## First CI pass

1. Resolve the two package graphs with `npm ci`.
2. Run nurse and frontend unit/component suites.
3. Run the mocked Playwright suites.
4. Run axe suites.
5. Run responsive suites.
6. Run bundle guards.
7. Start the E4 MongoDB/MinIO services, seed the E2E fixture and run the real-backend suite.
8. Review all failures before changing tests.

## Failure handling

Do not weaken assertions just to obtain a green build. If a failure is caused by an actual UI/API contract mismatch, fix the implementation. If it is caused by a seed/environment assumption, update the seed or CI environment deliberately and document the reason.

## Important generated-file rule

Do not hand-edit `openapi.json` or generated `api.d.ts`. Continue using the repository's `scripts/gen-types.sh`/`types-fix` workflow.

## Credentials

E4 uses environment variables for credentials. No real account password, Firebase key, Cloudinary secret or SMS credential belongs in this archive.

## Current confidence

Source-authored and packageable. Not runtime-verified.
