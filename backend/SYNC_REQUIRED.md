# SYNC REQUIRED: Nest backend and Multi-Site-Hosting copy

The Nest backend exists in TWO places and the two copies MUST be kept in sync at all times:

- Nest-Home-Uganda-Website:  `backend/app/...`  (imports use `app.`)
- Multi-Site-Hosting:        `projects/nest/...`  (imports use `projects.nest.`)

Rules
1. Every backend change (agreements, storage, mail, config, jobs, models, schemas, migrations) goes into BOTH copies in the same change.
2. The only intended difference is the import prefix (`app.` versus `projects.nest.`).
3. Before every release run the parity check from the Multi-Site-Hosting root:
   `python scripts/check_nest_sync.py <path-to-Nest>/backend/app projects/nest`
   It lists files that differ (ignoring the import prefix) and exits with an error if any do.
4. Never ship one zip without the other.

## Last full sync
2026-11-08: both copies were brought level. The Multi-Site copy gained the audit, TOTP, mail-outcome and invite work from here; this repo gained `local_expiry_date`, the agreement failure reasons and their tests, plus `docs/AGREEMENT_LINKS.md`.

2026-11-09: agreement OTP resend cooldown, readable certificate, public signed-PDF download and the `/verify` authenticity check (adds `segno`) were applied to both copies; parity check passes.

2026-11-10: `TotpRequired` error, `modules/test_accounts` and the seed hook were applied to both copies; parity check passes.
2026-11-10 (later): test accounts reworked to nurse + admin; mail sandbox (`mailbox.is_test`, migration 0013), `User.is_test`, purge and relationship endpoints applied to both copies; parity check passes.
2026-11-10 (later still): scope-based test-account access/scenarios/link, core/sandbox.py (SMS, push, system mail guards), created_by on care clients and places, photo-file purge applied to both copies; parity check passes.
2026-11-14: standalone-admin backend changes (`admin_url`, root-path staff links, passkey RP/origins) and the sandbox/test-accounts + pin-first-places work are both in this copy and in Multi-Site-Hosting `projects/nest`; parity check passes.
