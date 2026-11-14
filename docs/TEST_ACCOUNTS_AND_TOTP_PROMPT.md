# Test accounts and the authenticator prompt

## Authenticator prompt (all TOTP-locked actions)
- Backend: every TOTP gate raises `TotpRequired` (403, code `totp_required`; still a `Forbidden`) in `core/errors.py`, `core/totp_guard.py`, `modules/mail/router.py`.
- Frontend: `lib/api/client.ts` sees that code, opens `TotpPromptHost` (in `AdminLayout`), and repeats the request once if the code is accepted. The error only shows if the person cancels. Not enrolled yet: the same dialog offers setup.
- After a cancel, requests within 8 seconds fail straight away so retries do not reopen it (`lib/totpPrompt.ts`). `TotpGate` pages and the nurse audit screen are unchanged.

## Test accounts (nurse + admin)
- `test.nurse@<domain>` and `test.admin@<domain>` (`TEST_ACCOUNT_DOMAIN`, default `example.com`), `User.is_test = true`. Inactive until a superadmin with a verified authenticator session switches one on (`/admin/test-accounts`). Switching on sets a random password, shown once.
- **Relationship is scope based.** Per account: a preset (nurse, supervisor, admin, executive, lawyer) or an explicit scope list, plus reach (own/team/all) via `POST /{key}/access`. The supervisor link is `POST /link {supervises}`. `POST /scenario {name}` sets all three at once: separate, supervised, admin_team, admin_all, executive_view, lawyer_view. Switch any time; changes apply at the account's next sign-in (its sessions are revoked). `system:manage` and `carecfg:write` are never allowed on a test account.
- **Mail sandbox** (`mailbox.is_test`, migration `0013`): mail only between the two accounts, external sends accepted but sent to the console sink, inbound blocked. System email (invites, resets) never goes to the test addresses, and system email triggered by a test account is not sent.
- **Nothing reaches real people**: `core/sandbox.py` marks every request from a test account (`get_principal` calls `bind`). While marked, `send_sms` skips (logged as `skipped: test sandbox`) and push/inbox notifications to non-test users are skipped. SMS-based steps such as an agreement OTP to a client number therefore cannot complete from a test account.
- **Temporary data**: switching off the last active test account, or "Delete test data now", deletes visits, events, notes, photo records and the stored photo files, flags, alerts, timesheets, SOS cases, notifications, consents, push, devices, clients and places they created (`created_by` is now stored on both), their audit rows (`test_account.*` stay) and their mail.
- Remaining limits: test accounts created before this change have no `created_by` on earlier clients/places; push or SMS started by a background job that does not run inside the test account's request is not marked; other record types (for example agreements or enquiries a test admin creates) are not purged.
- UI: Users page, "Test accounts" (superadmin only); loads on click so the code prompt comes first.

Not run here: frontend typecheck/tests, the Python suite, and the SQL or purge paths against live Mongo/Postgres. Apply mail migration 0013 before deploying.
