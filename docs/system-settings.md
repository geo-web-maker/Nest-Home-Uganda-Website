# Admin system controls

The Admin → Site settings → **System controls** section exposes operational platform configuration.

## Access scope

All controls require the `system:manage` scope. This is intentionally separate from `settings:read` / `settings:write` because these values can affect platform availability, security, integrations and operational capacity. Changes are persisted in the settings collection and recorded in the existing settings audit trail.

## Controls

- `MAINTENANCE_MODE` — boolean maintenance switch.
- `ENABLE_USER_REGISTRATION` — boolean registration switch.
- `ENABLE_BETA_FEATURES` — boolean experimental-feature switch.
- `MAX_DAILY_VISITS` / `MAX_ITEMS_PER_USER` — operational caps.
- `SESSION_TIMEOUT_MINUTES` — inactivity timeout.
- `MAX_UPLOAD_SIZE_MB` — upload size limit.
- `DEFAULT_SENDER_EMAIL` — default system sender.
- `SMS_NOTIFICATIONS_ENABLED` — global SMS switch.
- `WEBHOOK_RETRY_ATTEMPTS` — failed webhook retry count.
- `PAYMENT_GATEWAY_MODE` — `sandbox` or `production`.
- `API_REQUEST_TIMEOUT_SEC` — third-party request timeout.
- `SYNC_CRON_INTERVAL_MIN` — background sync interval.
- `PLATFORM_SITE_NAME` — platform display name.
- `DEFAULT_TIMEZONE` — IANA timezone, e.g. `Africa/Kampala`.
- `SUPPORT_CONTACT_EMAIL` — support contact address.

The backend validates numeric ranges and selected values before persisting changes. The UI is designed to be editable only by a principal carrying `system:manage`; ordinary `settings:read`/`settings:write` users do not receive the system tab or system values.
