# Attachment malware scanning

Nest supports an optional private ClamAV sidecar. It is **disabled by default** (`mail.scan_enabled=false`) until George selects and operates a host. No contract file is sent to VirusTotal or another hosted scanning provider. The backend sends only an object key and expected SHA-256 to the sidecar; the sidecar uses its own read-only R2 credentials to fetch the object and streams bytes to local `clamd`.

## Deployment

1. Choose a host with at least 4 GiB RAM (ClamAV signatures can use about 1 GiB resident and reload peaks can exceed 2.4 GiB). Options: an Oracle Cloud Always Free Arm VM if capacity and idle-reclamation risk are acceptable; a small paid 4 GiB VPS; or a continuously available, monitored machine you operate.
2. Create a dedicated R2 key with **read-only access to the mail bucket**. Never reuse the backend's write credentials.
3. Set the variables shown in `scanner/docker-compose.yml`, generate a long random `SCAN_BEARER_TOKEN`, and run `docker compose up -d --build`.
4. Put the scanner service behind HTTPS before connecting the backend. The compose file publishes only Caddy on ports 80/443; the scanner API and `clamd` remain on the private Compose network and are not published directly. Restrict inbound traffic to the backend where possible.
5. Set `mail.scan_url`, `mail.scan_token`, `mail.scan_enabled=true`, and a bounded `mail.scan_timeout_seconds` in Nest mail settings. Keep `mail.scan_fail_mode=block` and `mail.scan_block_unscanned_download=true` for contract attachments after the sidecar is verified. Use `allow` only for a documented continuity decision; an unavailable verdict remains visibly Not scanned. Test `/health`, the Setup check, and a clean/infected test object in the deployed environment before enabling external contract delivery.

`mail.scan_mode=clamd` is reserved for local development; production should use the authenticated HTTPS sidecar. The service rejects keys outside `mail/attachments/`, verifies SHA-256, enforces a maximum size, and avoids logging object keys, filenames, or contents.

## Verdict semantics and limitations

ClamAV detects known signatures; it is not a sandbox, is weaker against brand-new malware and unseen macros, and cannot inspect password-protected archives. It is one defensive layer alongside blocked-extension rules, not a guarantee. The safe default is `scan_fail_mode=block`: a failed or unavailable scan holds new uploads/sends until a clean result is available. Use `allow` only after an explicit, documented continuity decision; failed scans remain visibly **Not scanned**. Infected inbound files remain retained for administrator review but must not be downloadable or forwarded. Outgoing files rejected at upload confirmation are deleted from temporary storage and the attachment reservation is removed. Do not automatically move the whole message to Spam solely because an attachment is infected.

Do not upload the EICAR test file to this repository. Obtain it from the official EICAR site only when performing the manual acceptance test.

## Local development profile

The repository-root `docker-compose.dev.yml` has an optional `scanner` profile. Configure the same environment variables shown in `scanner/.env.example`, then start it with `docker compose -f docker-compose.dev.yml --profile scanner up -d --build scanner clamav`. The development API is bound to `127.0.0.1:8080` only and is plain HTTP; use it only from a local backend development process with `mail.scan_mode=http` and a local URL. Production must use the standalone `scanner/docker-compose.yml` stack behind HTTPS.
