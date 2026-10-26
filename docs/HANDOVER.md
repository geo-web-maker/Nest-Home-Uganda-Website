# Nurse Module handover

## Delivery state

This ZIP is a best-effort additive implementation snapshot. It is not a production release. See `docs/NURSE_IMPLEMENTATION_STATUS.md` and `docs/NURSE_BUILD_LOG.md` for the current scope and unverified items.

## Owner decisions

- Keep both MongoDB databases external and private.
- GitHub-hosted runners must not access production MongoDB.
- Use owner-controlled encrypted backups to Backblaze B2 and perform isolated restore drills.
- Keep Module D / WO-18 disabled.
- Use Northflank for the backend and the existing Vercel frontend.
- Use the owner-approved Android application IDs recorded in `docs/OWNER_DECISIONS.md`.
- The public booking form displays `Please do not enter medical details here`; contact consent remains required.

## Before any production use

- [ ] Resolve every remaining item in `docs/NURSE_IMPLEMENTATION_STATUS.md`.
- [ ] Create and validate a deterministic nurse-app package lockfile.
- [ ] Run all backend tests against CI's disposable MongoDB replica set and all frontend/nurse tests.
- [ ] Run TypeScript, lint, production builds, route/OpenAPI drift checks, external URL/font/string guards and Playwright/axe coverage.
- [ ] Review and fix every CI failure without weakening tests.
- [ ] Configure the actual private MongoDB URIs and confirm the two databases remain separate.
- [ ] Confirm backup passphrase escrow, B2 Object Lock/retention, owner-run backups for both databases, and a successful isolated restore drill.
- [ ] Configure Cloudinary and test upload, view, deletion and retention using non-production images.
- [ ] Configure MamboSMS test delivery, FCM credentials, Android signing and device revocation.
- [ ] Supply legal/privacy text, retention values, emergency numbers, on-call contacts, photo guidance and all other `client to supply` values.
- [ ] Confirm PDPO registration and legal review before entering real client data.
- [ ] Verify accessibility and install the Android builds on the target devices.
- [ ] Complete a pilot with owner-approved test users and document go/no-go.

## Secret and account ownership

All provider accounts, API keys, database URIs, backup passphrases, Firebase service-account credentials, Android keystores and signing keys remain owner-controlled. None should be committed to the repository or copied into incident notes.

## Validation statement

No application tests, builds, package installs, migrations, live provider calls, photo deletions, backup runs, or restore drills were executed for this archive. All new work is **Written, not run. CI will run it.**
