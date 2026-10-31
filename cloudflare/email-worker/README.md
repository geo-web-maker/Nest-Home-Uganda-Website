# Cloudflare inbound email Worker

1. Create the private R2 bucket and bind it as `MAIL_RAW`.
2. Set `MAIL_INBOUND_URL` to the backend inbound endpoint.
3. Run `wrangler secret put MAIL_INBOUND_SECRET` with the same secret configured in superadmin mail settings.
4. Configure Cloudflare Email Routing's catch-all destination to this Worker and deploy with `wrangler deploy`.
5. Test with a controlled mailbox before enabling `mail.inbound_enabled`.

The Worker stores the raw RFC 5322 stream in R2 and sends only envelope metadata to the API. It does not parse MIME. The backend validates a timestamped HMAC and performs idempotent delivery. Do not expose the R2 bucket publicly.
