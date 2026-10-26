# Nurse module exact package pins

Existing shared React package pins are copied from `frontend/package.json` and must remain identical. New pins below are proposed for the approved implementation. CI and package registry resolution have not been run in this environment, so these are written, not validated.

| Package | Target | Pin |
| --- | --- | --- |
| `dexie` | nurse, frontend admin-native | `4.0.11` |
| `vite-plugin-pwa` | nurse | `1.0.3` |
| `fake-indexeddb` | nurse and frontend dev | `6.2.4` |
| `@axe-core/playwright` | frontend and nurse dev | `4.10.2` |
| `leaflet` | frontend admin map | `1.9.4` |
| `@capacitor/core` | nurse | `7.4.3` |
| `@capacitor/cli` | nurse dev | `7.4.3` |
| `@capacitor/android` | nurse | `7.4.3` |
| `@capacitor/geolocation` | nurse | `7.1.5` |
| `@capacitor/local-notifications` | nurse | `7.0.3` |
| `@capacitor/app` | nurse | `7.0.1` |
| `@capacitor/preferences` | nurse | `7.0.1` |
| `@capacitor/push-notifications` | nurse and admin native | `7.0.3` |
| `capacitor-secure-storage-plugin` | nurse and admin native | `0.13.0` |
| `@byteowls/capacitor-sms` | nurse | `7.0.0` |
| `react` | nurse | `18.3.1` (match frontend) |
| `react-dom` | nurse | `18.3.1` (match frontend) |
| `react-router-dom` | nurse | `6.30.6` (match frontend) |
| `react-i18next` | nurse | `17.1.0` (match frontend) |
| `i18next` | nurse | `26.5.2` (match frontend) |
| `zod` | nurse | `4.6.7` (match frontend) |
| `react-hook-form` | nurse | `7.90.0` (match frontend) |
| `@tanstack/react-query` | nurse | `5.104.4` (match frontend) |
| `typescript` | nurse dev | `5.9.3` (match frontend) |
| `vite` | nurse dev | `7.3.7` (match frontend) |
| `@vitejs/plugin-react` | nurse dev | `5.2.0` (match frontend) |
| `vitest` | nurse dev | `3.2.7` (match frontend) |
| `@playwright/test` | nurse dev | `1.64.1` (match frontend) |
| `@eslint/js` | nurse dev | `10.0.1` (match frontend) |
| `@testing-library/dom` | nurse dev | `10.4.2` (match frontend) |
| `@testing-library/react` | nurse dev | `16.3.3` (match frontend; already imported by `App.test.tsx`) |
| `jsdom` | nurse dev | `30.1.3` (match frontend; required by `environment: 'jsdom'` in `vitest.config.ts`) |
| `@types/node` | nurse dev | `22.20.5` (match frontend; needed by tests that read files) |
| `cryptography` | backend | `46.0.3` |

No background-location package is included because the owner did not approve background location. No Cloudinary SDK, Motor, or additional SMS library is included. Package versions above are not registry-verified in this run; CI must resolve and validate them before release.

Phase A1 removed `i18next`, `react-i18next`, `react-hook-form`, `zod`, `@tanstack/react-query` and `@capacitor/preferences` from the nurse app because nothing imports them. Re-add each at its pin above only in the phase that uses it. `react-router-dom` (phase B3) and `@byteowls/capacitor-sms` (phase B13) stay declared on purpose.
