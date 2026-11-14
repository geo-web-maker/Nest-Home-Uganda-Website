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

Not run: no tests, build or browser check were done. New unit tests are in `backend/tests/test_test_sandbox.py`.

## Hidden from real staff
While a test account is on, what it creates (visits, events, notes, photos, alerts, SOS cases, timesheets, flags, clients, places, and the test nurse's profile) is hidden from every real signed-in user, so live dashboards, the SOS console and nurse lists stay clean. The filter is applied in the queries themselves (`hide_test_data` in `core/sandbox.py`). A test account sees what its own reach allows, and the Diagnostics test-account screens see everything so they can reset it.
