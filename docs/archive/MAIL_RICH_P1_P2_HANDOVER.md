# Nest Mail P1/P2 implementation handover

**Status:** substantial implementation slice; **not yet acceptance-complete**.  
**Validation:** no tests, scripts, builds, or migrations were executed while preparing this change. All tests listed below are written/verification work only.

## Implemented

### Backend ingestion and safety

- Added the versioned HTML allow-list policy in `shared/mail-rich/policy/mail-html-policy.json` and the identical backend copy at `backend/app/modules/mail/html_policy.json`.
- Added `html_policy.py` with HTML sanitisation, style filtering, remote-image blocking, HTML-to-text conversion, snippets, CID checking/resolution, data-image extraction, and safe final-body composition. It uses the Python standard library; `nh3` and `css-inline` were not added because their APIs/pins were not verified.
- Added `mime_parse.py`, a recursive MIME parser that retains HTML, chooses the last HTML alternative, handles related/signed structures, classifies referenced CID images as inline, and preserves `message/rfc822` as an opaque `.eml` attachment. Unsafe/oversized files become visible blocked placeholders; filename cleanup handles paths, control characters, bidi controls and length.
- Reworked inbound ingestion to retain sanitised HTML and source metadata, derive text for HTML-only mail, preserve inline/blocked attachment metadata and hashes, and best-effort clean up objects if the database transaction fails.
- Added migration `0005_rich_content.sql` for body format, quotes, snippets, render notes, sanitizer version, CID/disposition/blocked attachment data, and separate outbox Cc/Bcc columns.
- Added bounded, idempotent old-message reprocessing from retained raw `.eml` objects, with preview/run endpoints and a Mail settings action. The selection predicate avoids repeatedly selecting text-only messages after successful reprocessing.

### Read, download, draft, reply and forward

- List responses use a snippet instead of returning full message bodies.
- Read responses use an explicit allow-list, resolving only bounded inline CID images to data URIs and avoiding exposure of internal storage/authentication/search fields.
- Signed attachment downloads use the real filename and safe content type; blocked placeholders cannot be downloaded. Added `StorageService.copy` and filename-aware signed URLs.
- Fixed the fragile `__import__('app...')` attachment-download import so the multi-site adopt rewrite can namespace it safely.
- Added the original `.eml` download route with membership/scope checks and audit logging.
- Draft writes sanitise HTML; server-generated reply/forward quotes remain opaque to the editor. Forward copies attachment objects rather than sharing keys, and forward-as-attachment uses the stored raw/sent `.eml` or a generated MIME message.
- Deleting a draft attachment/draft cleans up owned storage objects; forwards have independent copies.
- Sending freezes the final body, builds Message-ID/thread references, appends an escaped signature block, validates CID references, estimates external message size and preserves To/Cc/Bcc separately.
- Added RFC 5322 MIME construction for sent copies and `.eml` forwards. Local-only sends write their sent `.eml` in the send transaction; externally delivered sends write it after provider acceptance.
- External outbox delivery loads attachment bytes, verifies SHA-256 immediately before delivery, fails integrity mismatches without retry, and sends recipient classes and attachments through provider-neutral `OutboundMessage` adapters.

### Front ends and shared foundation

- Admin and nurse readers render the shared safe HTML viewer, show blocked-remote-image state, confirm external links, offer original `.eml` download, and use server-created forward/reply quotes.
- Nurse drafts retain Cc/Bcc and quote metadata in the existing sealed offline store; Reply all excludes Bcc. The nurse upload CSP can allow only the explicitly configured `VITE_MAIL_STORAGE_URL` origin.
- Added the Mail settings reprocess preview/confirmation and new setting labels.
- Authored shared core types, API wrapper, policy-driven client sanitiser, CSS/HTML-to-text helpers, recipient/attachment/byte/link helpers, common viewer, uploader/autosave hooks and style tokens under `shared/mail-rich/`.
- Added `scripts/sync-mail-rich.mjs` as the canonical generator for `frontend/src/shared/mail-rich/` and `nurse/src/shared/mail-rich/`, plus CI drift checks. **The sync script has not been run.** The app mirror imports will resolve only after George runs the sync command.

## Explicitly not finished / limitations

1. **No rich-text compose editor yet.** Admin and nurse compose still use their existing plain-text editors. TipTap packages remain `PIN_ME` in `docs/PINS_MAIL_RICH.md`; no new dependencies or lockfile changes were made. The editor extensions, lazy route loading, formatting toolbar, font size/indent controls and paste-image handling still need implementation.
2. **Shared UI consolidation is partial.** The safe viewer/core is shared, but the app-specific `MailUiKit` adapters, common attachment-list integration, and shared `useAttachmentUploader` adoption are not complete. Existing duplicated upload/list code remains.
3. **Nurse budget raised.** With the lazy-loaded TipTap editor the nurse build measures 320 KB gzip total (editor chunk 151 KB). George chose to raise the budgets from 200 KB / 80 KB to 360 KB total / 160 KB per route chunk. Do not raise them further without his explicit choice.
4. **Provider differences remain.** Both JSON adapters send file attachments and keep Cc/Bcc distinct. They do not advertise standard inline-CID support in the API shapes used here, so outgoing inline images are sent as ordinary attachments and a render note is recorded. Resend accepts custom threading headers; Brevo's transactional JSON API does not provide a verified standard `Message-ID` / `In-Reply-To` / `References` path, so recipient-side threading is not guaranteed on Brevo. Verify live provider behavior before enabling production sending.
5. **Confirmation settings need final UI wiring.** `mail.confirm_external_send` and `mail.confirm_external_links` are in the settings catalogue, but the new link confirmation UX is not yet controlled by the settings value and a pre-send external-recipient summary is not fully wired.
6. **Inline images are not guaranteed inline at external recipients.** They display inside Nest when safe and within configured limits; the current providers receive them as ordinary attachments.
7. **Old Sent messages without a stored `.eml` return 404.** New outbound messages get an `.eml` when the setting is enabled, but historical messages cannot be reconstructed unless sufficient stored body/attachment data remains.
8. **Sanitiser fallback, not third-party CSS inliner.** The current standard-library fallback keeps the implementation dependency-free and fail-safe, but complex Outlook/Word CSS fidelity needs fixture review and likely a separately pinned/verified CSS inliner.
9. **Production checks remain outstanding.** No migration, test, lint, typecheck, build, browser, CSP, bucket-CORS, provider fake-server or live delivery check was run.

## Multi-site host integration

`Multi-Site-Hosting-main/projects/nest/` is generated. It was intentionally **not hand-edited** in this patch. The source of truth is `Nest-Home-Uganda-Website-main/backend/`.

The checked-out MSH `sites.toml` still has the Nest entry commented out. After committing/tagging this Nest source repository:

1. Configure `[sites.nest]` in MSH `sites.toml` with the real private GitHub repository (`github.com/<owner>/<repo>`), a pinned tag or full commit SHA (not a branch), and `path = "backend"`.
2. Provide `GIT_TOKEN` to the host's build environment if the source repo is private.
3. From the MSH repository root, run `python scripts/fetch_sites.py --only nest`. This fetches the pinned source, runs `adopt_backend.py`, and applies the MSH Nest patches. It replaces the generated `projects/nest/` folder; do not edit that folder manually.
4. Rebuild the multi-site host and run its route/health checks.

The attachment-download import hotfix was made in the NHC source precisely so the adopt rewrite can change `app.*` imports to `projects.nest.*`. There is no actual private repository URL or release tag in the supplied archive, so neither was invented here.

## Deployment configuration

- Set `VITE_MAIL_STORAGE_URL` in the admin and nurse build environments to the exact HTTPS origin of the configured S3-compatible mail storage endpoint.
- Configure the private bucket CORS with exact admin and nurse origins, methods `PUT` and `GET`, and allowed header `Content-Type`; avoid wildcard origins. The nurse CSP includes only the configured storage origin in `connect-src`. If the deployed edge adds a separate CSP header, update that header too.
- Keep the mail bucket private and keep signed links short-lived.
- Review the new superadmin settings before enabling mail. Existing setup guidance still says to keep `mail.enabled=false` and inbound disabled until the full prior mail phases and infrastructure checks have passed.

## Exact verification checklist (not executed here)

Run from `Nest-Home-Uganda-Website-main/` after extracting the archive.

### 1. Generate the shared mirrors

```bash
node scripts/sync-mail-rich.mjs
node scripts/sync-mail-rich.mjs --check
```

### 2. Backend checks

```bash
cd backend
ruff check app/core/storage.py app/modules/mail tests/test_mail_html_policy.py tests/test_mail_mime_parse.py tests/test_mail_mime_build.py tests/test_mail_maintenance.py tests/test_mail_attachment_download_module_path.py tests/test_storage_content_disposition.py tests/test_mail_phase2_unit.py
ruff format --check app/core/storage.py app/modules/mail tests/test_mail_html_policy.py tests/test_mail_mime_parse.py tests/test_mail_mime_build.py tests/test_mail_maintenance.py tests/test_mail_attachment_download_module_path.py tests/test_storage_content_disposition.py tests/test_mail_phase2_unit.py
pytest -q tests/test_mail_html_policy.py tests/test_mail_mime_parse.py tests/test_mail_mime_build.py tests/test_mail_maintenance.py tests/test_mail_attachment_download_module_path.py tests/test_storage_content_disposition.py tests/test_mail_phase2_unit.py
```

Then run the complete backend mail and route/scope test suites, not just the focused tests above. Apply migration `0005_rich_content.sql` only to an isolated test database first.

### 3. Admin frontend checks

```bash
cd ../frontend
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

### 4. Nurse checks and hard budgets

```bash
cd ../nurse
npm ci
npm run typecheck
npm run lint
npm test
npm run build
node scripts/check-bundle-size.mjs
node scripts/check-no-external.mjs
node scripts/check-strings.mjs
node scripts/check-nurse-styles.mjs
```

Do not accept a bundle-budget failure by silently changing the limits.

### 5. Deployment smoke checks

- Confirm migration 0005 is recorded exactly once.
- Receive HTML-only and mixed HTML/plain test mail; verify formatting, inline CID, blocked remote images, blocked-file placeholders and `.eml` preservation.
- Download a non-ASCII filename attachment and confirm the browser uses the original name; confirm blocked placeholders return a non-downloadable response.
- Reply, Reply all, forward, and forward-as-attachment; verify To/Cc/Bcc privacy, copied objects, message threading, and exact SHA-256 bytes.
- Use provider fake-server tests to inspect actual JSON payloads and prove Bcc is in the envelope but not in visible recipient headers. Test provider size limits and retry/failure behavior.
- Verify the R2 CORS and nurse CSP from both production origins; test offline nurse reply/forward sync.
- Exercise reprocess preview/run twice and confirm no second pass changes counts or duplicates attachments.
- Run mail backup and isolated restore checks before enabling retention purge.

## Changed paths

The archive includes the complete modified NHC source tree. The primary touched files are:

- `backend/app/core/storage.py`
- `backend/app/modules/mail/{core_service.py,defaults.py,inbound.py,outbox.py,providers.py,router.py}`
- New backend modules: `html_policy.py`, `html_policy.json`, `maintenance.py`, `mime_build.py`, `mime_parse.py`
- `backend/mail_migrations/0005_rich_content.sql`
- New backend tests: `test_mail_attachment_download_module_path.py`, `test_mail_html_policy.py`, `test_mail_maintenance.py`, `test_mail_mime_build.py`, `test_mail_mime_parse.py`, `test_storage_content_disposition.py`; updated `test_mail_phase2_unit.py`
- Admin: `MailCompose.tsx`, `MailPage.tsx`, `MailSettingsPage.tsx`, `recipients.ts`, `types.ts`, `locales/en/admin.ts`
- Nurse: `MailComposeSheet.tsx`, `MailScreen.tsx`, `mailStore.ts`, `copy.ts`, `vite.config.ts`
- Shared foundation: `shared/mail-rich/**`, `scripts/sync-mail-rich.mjs`
- CI and docs: `.github/workflows/ci.yml`, `.github/workflows/nurse.yml`, `docs/MAIL_SETUP.md`, `docs/NEST_MAIL_MODULE_SPEC.md`, `docs/PINS_MAIL_RICH.md`

The MSH host source and generated `projects/nest/` are included unchanged; regenerate the Nest mount from the pinned Nest repository after publishing this change.

## Continuation update — private scanner foundation

Added `scanner/app.py`, a small authenticated FastAPI sidecar that fetches attachment objects from R2 using dedicated read-only credentials, verifies SHA-256, bounds object size, and streams to local ClamAV using INSTREAM. Added a loopback-only compose deployment, scanner Dockerfile/requirements, `backend/app/modules/mail/scanner.py` HTTP client, scanner deployment/security guide, and written-but-not-run tests. This is a deployable foundation, not an enabled production scanner: no scanner host has been selected, backend scan settings remain disabled by default, and the attachment-confirm/inbound queue/send/download lifecycle still requires integration and tests before turning it on. Do not expose clamd or the sidecar without HTTPS and network restrictions.

---

## Continuation update — 5 November 2026

The follow-on mail implementation work is now present in the source tree and supersedes the earlier “not finished” checklist above for the items below. See the delivery-root `IMPLEMENTATION_HANDOVER.md` for the complete implementation summary, deployment steps and verification checklist.

- Added migration `0006_mail_delivery_scanning.sql`, persistent recipient-level delivery events and webhook event normalization/deduplication for Resend and Brevo.
- Added Brevo SMTP transport (frozen RFC 5322 bytes, To/Cc/Bcc envelope recipients, Bcc omitted from visible headers), with Brevo JSON API fallback and Resend JSON transport retained.
- Connected attachment scan confirmation, asynchronous inbound/forward-copy scan queue, send-boundary checks and download gating to the optional private ClamAV sidecar.
- Added the full lazy TipTap editor, bounded tables, formatting controls, sanitized paste, inline-image-to-attachment fallback and a separately controlled/collapsible quoted-message block.
- Admin and nurse now use the shared editor, uploader, attachment list and safe message viewer through their own UI-kit adapters. Nurse rich drafts remain in the encrypted offline draft store.
- Added Sent delivery status UI, compose/send/close confirmation guards, setup diagnostics labels, admin/nurse Playwright acceptance specs and the optional local Docker scanner profile.
- `node scripts/sync-mail-rich.mjs` has been run and the frontend/nurse mirrors are included.

**Still not validated here:** npm lockfile reconciliation (install is required in each app), test/build/typecheck/lint and nurse bundle budgets, staging migrations, actual R2 CORS/CSP, scanner-host operation, Brevo SMTP authentication and real delivery/webhook receipt. The test files are written but were not run. External contract sending and scanning remain disabled by safe defaults until the owner configures and verifies the infrastructure.
