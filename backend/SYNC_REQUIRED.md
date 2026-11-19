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

2026-11-19: test client and day controls: `modules/test_accounts/client.py` (new), new config fields in `models.py`, `/admin/test-accounts/client/*` in `router.py`, purge and reset hooks in `service.py`, `core/sandbox.py` `acting_as`, `care_ops/dispatch.py`, and `jobs.py` (`run_care_alerts` / `run_timesheet_generation` take `nurse_ids`) applied to both copies; test_test_client.py and test_test_sandbox.py added to both copies; parity check passes ("In sync."). Hosting copy: the database tests there need the `mongo` fixture from the Nest repo's conftest, so they run in the Nest repo.

2026-11-19 (mail 500 fix): bare `$n` parameters inside `jsonb_build_object` now cast (attachment download, original download, spam report, attachment-infected audit, reprocess, quota warning, purge, outbox render notes); test_mail_audit_sql_casts.py added to both copies; parity check passes ("In sync.").

2026-11-20 (Neon autosuspend, both copies): the Mongo wake markers existed only in the hosting copy, so this repo still polled Neon every 5/10 minutes, pinged and drained Neon from every `/health`, ran the quota check hourly and wrote a Neon row per audited 4xx error, which kept the compute awake. Ported to this repo from `projects/nest`: `core/wake_state.py`, `core/audit_throttle.py`, `modules/mail/wake_rules.py` (new); `jobs.py` (outbox/scan ticks read the Mongo marker first, quota check once a day at 00:05), `modules/mail/{outbox,scan_queue,db,inbound,router,settings_service}.py`, `main.py`, `registry.py` (registers `WakeState`, `AuditThrottle`); tests `test_wake_state.py`, `test_audit_throttle.py`, `test_nurse_invite_link.py`, `test_password_policy.py` and the updated outbox-poll test. Parity check passes ("In sync."). Rule of thumb: nothing that runs on a timer, from `/health` or from a badge poll may query Neon unless a Mongo marker says work is due.

2026-11-20 (pool): `modules/mail/db.py` asyncpg pool now `min_size=0` in both copies, so the mail pool holds no standing Postgres connection while idle (family tree already opens connections lazily). Parity check passes ("In sync.").
2026-11-20 (pool, later): `max_inactive_connection_lifetime=60` added next to `min_size=0` in both copies. asyncpg's default idle lifetime is 300 seconds, the same as Neon's 5-minute suspend window, so it is now set explicitly to 60 seconds. Parity check passes ("In sync.").
2026-11-20 (pool, final): `max_inactive_connection_lifetime` lowered from 60 to 30 seconds in both copies (with `min_size=0`), so the mail pool shows no idle Postgres connection for long. Parity check passes ("In sync.").
