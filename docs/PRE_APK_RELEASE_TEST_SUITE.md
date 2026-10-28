# Pre-APK Release Test Suite

## Purpose

This suite is the release gate that must pass before the first production Android APKs are generated.
It tests the browser/web implementations first so that defects are fixed in the shared web code before Capacitor packaging.

The gate covers:

1. Public Well Nest Home Care Uganda website.
2. Admin web application, including the native/admin web bundle that will be packaged for Android.
3. Nurse web/PWA application.
4. Backend/API contracts, permissions, business rules, and persistence-facing tests.
5. Cross-cutting branding, accessibility, responsive behaviour, navigation, authentication, failure handling, and offline/sync behaviour.

The APKs are **not** built by this gate. APK packaging happens only after this gate is green, followed by a smaller native smoke/regression suite.

## Release gate

A release candidate is not APK-ready until all applicable stages pass:

| Gate | Coverage | Result required |
|---|---|---|
| Static validation | package/lockfile/configuration/branding contracts | PASS |
| Backend unit/integration | rules, schemas, HTTP contracts, scopes, persistence-facing tests | PASS |
| Public web | routes, navigation, forms, links, responsive layouts, accessibility | PASS |
| Admin web | authentication, navigation, permissions, settings, care operations, reports, responsive layouts | PASS |
| Nurse web/PWA | authentication, visits, offline mode, sync, touch targets, responsive layouts, accessibility | PASS |
| Browser E2E | critical user journeys and failure states | PASS |
| Production builds | public/admin and nurse production builds | PASS |
| Reference fidelity | canonical mockup/reference checks | PASS |
| Branding | user-facing brand and legal-name separation | PASS |

A failed test is a release blocker. Do not create production APKs from a failing release candidate.

## Failure scenarios that must be covered

- Slow or unavailable API.
- Offline/online transitions.
- Authentication failure, expired session, logout, and unauthorized access.
- Forbidden actions and missing scopes.
- Empty states, validation errors, duplicate submissions, and retry paths.
- HTTP 4xx/5xx responses.
- Browser refresh/back navigation.
- Small-phone, tablet, and desktop layouts.
- Keyboard/focus and accessible labels.
- Large/long content and horizontal-overflow checks.
- Nurse offline persistence and later synchronization.
- Admin system-control changes and permission enforcement.
- Critical public booking/contact flows.
- Real-backend E2E when the seeded backend environment is available.

## Commands

From the repository root:

```bash
node scripts/pre-apk-release.mjs
```

Useful modes:

```bash
node scripts/pre-apk-release.mjs --static-only
node scripts/pre-apk-release.mjs --backend-only
node scripts/pre-apk-release.mjs --web-only
node scripts/pre-apk-release.mjs --skip-e2e
```

The script stops on the first failed stage and prints the exact command that failed. It does not generate an APK.

### Browser choice

Playwright can use an installed local browser. For Chrome Beta:

```bash
# Linux/macOS
PLAYWRIGHT_CHANNEL=chrome-beta node scripts/pre-apk-release.mjs --web-only

# Windows PowerShell
$env:PLAYWRIGHT_CHANNEL='chrome-beta'; node scripts/pre-apk-release.mjs --web-only
```

## What happens after this gate

Only after this suite passes:

1. Freeze/tag the web release candidate.
2. Build the Android wrappers with Capacitor.
3. Run native smoke tests for Android lifecycle, back button, permissions, secure storage, notifications, WebView behaviour, and install/update behaviour.
4. Produce internal APKs.
5. Run acceptance testing on real Android devices.
6. Only then distribute the production APKs.

This prevents an APK from becoming the place where ordinary web bugs are discovered for the first time.
