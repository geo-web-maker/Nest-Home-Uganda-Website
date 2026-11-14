# Standalone admin application

## Overview

The staff application is a standalone React/Vite app under `admin/`, deployed on its own origin:

- Production origin: `https://admin.bhcug.com`
- Cloudflare Worker/static-assets application: `admin/wrangler.jsonc`
- Worker entry and same-origin API proxy: `admin/worker/index.js`
- Web build: `admin/dist/`
- Android/Capacitor config: `admin/capacitor.config.ts`
- Android application id: `ug.nesthomecare.admin`

The public applications remain in `frontend/` and `frontend-thread/`. The admin source is not mounted in either public frontend. The canonical shared source is still in `frontend/src`; generated copies live under `admin/src/_shared/`.

## Local development and checks

Use Node 22.19 or newer in the Node 22 line (the lockfile is generated from the pinned repository versions). From the repository root:

```sh
cd admin
npm ci
npm run dev                 # http://localhost:5175
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:admin-native
npm run test:e2e
```

For the complete pre-APK release gate, use `node scripts/pre-apk-release.mjs` from the repository root. It covers the frontend, admin, nurse app, backend and selected browser journeys; it does not build an APK.

## Shared-source mirrors

Edit canonical shared source in `frontend/src`, not in `admin/src/_shared`. To regenerate the admin mirror:

```sh
node scripts/sync-admin-shared.mjs
node scripts/sync-mail-rich.mjs
```

To verify the committed/generated copies have not drifted:

```sh
node scripts/sync-admin-shared.mjs --check
node scripts/sync-mail-rich.mjs --check
```

The scripts preserve relative subpaths and remove stale generated files. Generated TS/TSX/CSS files carry a header that identifies the canonical source. The admin must not import files from outside `admin/` at runtime; use `@shared/...` for its generated shared copy.

## URL scheme and API contract

Admin browser pages are rooted at the admin origin:

| Purpose | URL |
| --- | --- |
| Dashboard | `/` |
| Login | `/login` |
| Set password | `/set-password` |
| Mail | `/mail` |
| Care clients | `/care/clients` |
| Agreements | `/agreements` |

Old browser links beginning `/admin/...` are retained as compatibility URLs and redirect to the corresponding root path. The compatibility path is covered by the router and `admin/public/_redirects`. Public links on both public sites redirect to `https://admin.bhcug.com`.

**The backend API path is unchanged.** Browser requests still use `/api/*` through the admin-origin Worker, and backend routes remain `/api/v1/admin/...`. Do not strip `/admin` from API paths. The API Worker runs first for `/api/*`, forwards the request headers (including `X-CSRF-Token`), and forwards response cookies while removing an upstream `Domain` attribute and adjusting the cookie path for the backend mount prefix. The Worker also avoids caching API responses.

In production set:

- `BACKEND_URL` in the admin Worker to the backend origin/base path (the checked-in `admin/wrangler.jsonc` currently matches the frontend Worker value).
- `ADMIN_URL=https://admin.bhcug.com` in the backend before deploying link-generation changes.
- `VITE_ADMIN_URL=https://admin.bhcug.com` in both public frontend build environments for the staff-login link.
- `WEBAUTHN_ORIGINS` / `WEBAUTHN_RP_ID` (optional): by default the passkey origins are the public site plus `ADMIN_URL`, and the RP ID is their shared domain suffix (e.g. `bhcug.com`). Set them explicitly only to override. Passkeys already registered under a different RP ID will not match.
- Leave the production admin `VITE_API_URL` empty so calls use same-origin `/api/*`; configure `VITE_MAIL_STORAGE_URL` to the HTTPS mail-attachment storage origin when that service is enabled.

`ADMIN_URL` currently falls back to `FRONTEND_URL` when unset, as required by the split plan's compatibility default. **After the page-prefix removal, this fallback is not a safe production value for staff links**: a root path such as `/set-password` or `/care/sos/...` must resolve on `admin.bhcug.com`. Explicitly set `ADMIN_URL` to the admin origin before deploying the backend. Do not rely on the fallback for the production cutover.

## PWA, push and offline behaviour

The PWA starts at `/mail`, has root scope `/`, and is an app-shell-only offline experience. The service worker does not runtime-cache API data and its navigation fallback excludes `/api/`, `/assets/`, `/sw.js`, and the manifest. Push notifications continue to post `nest-mail-push` to open windows; an old `/admin/...` URL in an existing push payload is normalized before display/navigation.

Because the admin has a new origin, existing push subscriptions on the old public-site origin do not transfer. Users must open/install the new admin PWA and grant notification permission again. Installed copies may retain the previous manifest until the browser applies the updated service worker/manifest.

## Deployment order

1. Configure the Cloudflare route/zone and `BACKEND_URL` for `admin.bhcug.com`.
2. Deploy the standalone admin Worker and static assets. Confirm login, refresh, logout, deep links, `/api/*` proxying, and the legacy `/admin/...` redirect on the live host.
3. Deploy public-site redirect and staff-login link changes to both public sites.
4. Set `ADMIN_URL=https://admin.bhcug.com` in the backend environment, then deploy the backend link changes.
5. Ask existing admin PWA users to reinstall/reopen the new origin and re-enable push notifications.

Deploy the admin before the backend so the destination paths exist before newly generated emails, SMS and push payloads use them. Retain the legacy redirects indefinitely; they are inexpensive and protect old bookmarks and messages.

## Verification notes

Unit tests cover path normalization (including `/administrator` remaining unchanged, query/hash preservation, and external-origin rejection), legacy router redirects, root dashboard nav matching, and backend link construction. See `docs/ADMIN_SPLIT_LOG.md`, `docs/ADMIN_PREFIX_LOG.md`, `docs/admin-prefix/CLASSIFICATION.md` and `IMPLEMENTATION_REPORT.md` for what could be executed in the implementation environment and remaining release checks.
