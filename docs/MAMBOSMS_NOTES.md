# MamboSMS notes

Source: BUILDER_INSTRUCTIONS section 13.1, verified from https://www.mambosms.com/api on 2026-10-19.
All of this lives in `backend/app/modules/notifications/providers.py` and nowhere else.

## API facts the code relies on
- Base URL `https://api-mongolia.mambosms.com/v1` (env `MAMBOSMS_BASE_URL`).
- Auth: header `Authorization: <api key>`, the key alone, no `Bearer`. Key from env `MAMBOSMS_API_KEY` only. Never stored in the database, logs or any screen.
- Send: `POST {base}/send-sms`, JSON body, all four fields required: `message`, `recipients` (comma-separated, local `07XXXXXXXX`, never `+256`), `message_category` (`non_customised`, `info`, `customised`), `sender_id` (max 11 characters).
- Balance: `GET {base}/accounts/balance`, same header, returns `data.balance`.
- Success shape: `{statusCode: 201, success: true, messages, data: {recipients_count, message_count, sms_sent, sms_cost, new_balance, unsupported_contacts_count, unsupported_contacts}}`.
- Failure shape: `{statusCode, success: false, messages, data: []}`. The HTTP status can be 200 while `success` is false.

## How the code decides success
A send is a success only when HTTP is 2xx AND `success` is true AND `unsupported_contacts_count` is 0. Anything else is a failure and `messages` becomes the error text.

| Outcome | Retried? |
| --- | --- |
| timeout, network error, HTTP 5xx | yes, at most 2 retries (2 s then 5 s) |
| 401, other 4xx, HTTP 200 with `success: false`, unsupported contact | no (a retry cannot fix it) |

The provider itself never retries. `notifications/service.py` does.

## Not documented, so not assumed and not built
Rate limits, retries, delivery reports, webhooks, whether `+256` is accepted, per-message length limits, a sandbox. Nothing here depends on any of them.

## Testing rule
Tests use `httpx.MockTransport` (`backend/tests/test_sms_providers.py`). Tests and CI never call the real API. `SMS_PROVIDER=console` is the default and only logs a masked hint and the message length.

## Before going live
Send one real test message with `SMS_PROVIDER=mambosms` and a real key, and write down the result here. This has not been done.
