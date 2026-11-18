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

2026-11-15: agreement "ask Bloomwell to fill in" assistance flow (fill mode, assistance-requested email, staff-entered fields, "details ready" notify), billing A4 invoice/receipt render changes (stamp, per-page verify block/footer, centred QR) applied to both copies; billing modules brought to the same formatting; test_agreement_assistance.py added to both; parity check passes ("In sync.").

2026-11-15 (later): billing Delete (issued/void invoice, receipt) with released numbers, `billing_deletions` record and `POST /admin/billing/{invoices,payments}/{id}/delete`, `GET /admin/billing/deletions`; `storage_ref`/`number_generation` on invoices and receipts; new `BillingDeletion` model registered; test_billing_delete.py added to both copies; parity check passes ("In sync.").

2026-11-15 (evening): agreement field autosave limit raised to 240 per 15 minutes per session; a refused field no longer blocks the others (response carries `rejected`); test_agreement_partial_save.py added to both copies; parity check passes ("In sync.").

2026-11-18: care forms backend (P1-P3): `modules/care_forms` (models, rules, context, render, service, router, templates), UNMC fields on `NurseProfile`, `patient_type`/`agreement_id`/`patient_overrides` on `CareClient`, `care_forms.*` care settings, check-in/check-out gates in `field/service.py`, new models registered, `jinja2` added; care_forms tests added to both copies.
