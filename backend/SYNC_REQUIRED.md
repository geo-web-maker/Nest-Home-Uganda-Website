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
