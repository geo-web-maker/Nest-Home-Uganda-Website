# Test accounts and Diagnostics

All diagnostics now live on one admin page, **Diagnostics and test accounts** (`/diagnostics`, Setup group).
It is for the superadmin only. The authenticator (TOTP) is set up, verified and reset in its own section here; every protected action opens a code pop-up on click.

Sections: Authenticator, Test accounts, Email (setup check, outbound, SMTP and inbound traces), SMS (test message, provider balance), Agreements (readiness, workflow, delivery).
These were removed from the Users, Mail settings, SMS settings and Agreements screens.

## Test accounts
- **Master switch** (`POST /admin/test-accounts/master`). Off by default. Off = both accounts are switched off, cannot sign in, and everything they made is deleted. Accounts can only be switched on while it is on.
- **Scopes are variable per account**: pick a scenario, or set each account's preset, individual scopes, reach and supervisor link. `system:manage` and `carecfg:write` are never allowed. Changes apply at the next sign-in.
- **Nothing is kept**: data is deleted when an account is switched off, when the master switch goes off, on "Delete test data now", and when the first account is switched on (clean start).
- **No access by email or any other channel**: invite, reset and temporary-password flows refuse test accounts; login refuses them while the master switch is off or when a temporary password exists; mail from outside never reaches their mailboxes. The password is shown once, to the superadmin, when an account is switched on.
- **Delivery** (`PUT /admin/test-accounts/config`):
  - `sink` (default): test-account email and SMS go nowhere (console sink), push never leaves.
  - `allowlist`: email and SMS sent by a test account are really delivered, but only to up to 5 addresses and 5 numbers you list (your own). Email subjects get `[TEST]`, SMS text gets `[TEST]`. A test account's own address can never be on the list.
- Mail between the two test mailboxes still works internally in both modes.

Tests: `backend/tests/test_test_sandbox.py` and `backend/tests/test_test_client.py` (the database ones need `TEST_MONGODB_URI`).

## Test client and day controls
A test client for the test nurse, so the nurse side can be walked through end to end. Superadmin only, in Diagnostics, Test accounts, **Test client and days** (`admin/src/features/admin/diagnostics/TestClientPanel.tsx`). All endpoints are under `/admin/test-accounts/client/*` and need the authenticator session.

- **Switch on / off** (`POST /client/enable`, `/client/disable`). The client is created when both test accounts are on and is deleted with everything on it when switched off. The wish for a client survives "Delete test data now" and the client comes back from the default scenario.
- **Skip days** (`POST /client/days` with `days`, or `back_to_today`). The test world moves by shifting the test nurse's own records (visits, events, notes, photos, flags, alerts, SOS cases, care forms and signatures, inbox) the opposite way. The real clock is not touched, so check-in, sync and the scheduler keep working on real time. One step is up to 14 days either way; "Back to today" undoes the whole offset. Skipping forward also runs the checks below.
- **Scenarios** (`POST /client/scenario`): a normal day, a visit every day this week, a missed visit, checked in but never checked out, three visits back to back, and a week of finished visits for the timesheet. Applying one puts the days back to today.
- **Add a visit** (`POST /client/visits`): any day from 14 days ago to 21 ahead, a time, a length, and a state (scheduled, in progress, completed, checked in but never out).
- **Run checks now** (`POST /client/checks`): runs the late-visit, safety-timer and weekly-timesheet jobs for the test nurse only, instead of waiting for the scheduler (alerts every minute, timesheets at 02:15).
- **Client home** (`POST /client/location`) and **patient type** (`POST /client/type`: General, Mama, Baby), so check-in distance and the care forms can be tried both ways.
- **Alerts stay in the sandbox.** The scheduler's late-visit and safety-timer alerts about a test nurse are acted on inside the sandbox (`sandbox.acting_as`), so a seeded missed visit cannot text the real on-call numbers.
- Updates reach the nurse app through the app itself, so nothing here depends on a separate update channel.

Known gaps: `test_scope_enforcement.py` still fails on every `test-accounts` route (they use superadmin plus authenticator, not a scope, and the test has no exception for that); the panel has been type-checked, linted and unit tested but not clicked through in a browser; the database tests were run on a stand-in database (FerretDB), not real MongoDB.

## Hidden from real staff
While a test account is on, what it creates (visits, events, notes, photos, alerts, SOS cases, timesheets, flags, clients, places, and the test nurse's profile) is hidden from every real signed-in user, so live dashboards, the SOS console and nurse lists stay clean. The filter is applied in the queries themselves (`hide_test_data` in `core/sandbox.py`). A test account sees what its own reach allows, and the Diagnostics test-account screens see everything so they can reset it.
