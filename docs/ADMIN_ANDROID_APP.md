# Well Nest Home Care Admin Android app

The admin frontend now has a dedicated Capacitor Android target using the same React admin screens,
authentication, scopes, API and mobile navigation as the web admin.

## Identity

- App name: **Well Nest Home Care Admin**
- Android application id: `ug.nesthomecare.admin`
- Web bundle: `frontend/dist-admin-native`
- Capacitor config: `frontend/capacitor.admin.config.ts`

## Local build

From `frontend/`:

```bash
npm ci
npm run build:admin-native
npx cap add android --config capacitor.admin.config.ts
node ../scripts/apply_admin_android_overrides.mjs
npx cap sync android --config capacitor.admin.config.ts
cd android
./gradlew assembleDebug
```

The APK is written to `frontend/android/app/build/outputs/apk/debug/`.
The generated `frontend/android/` project is intentionally not committed; CI regenerates it from the
locked web project.

## Focused tests

```bash
npm run test:admin-native
npm run test:e2e:admin-native
```

The broader admin reference, accessibility and responsive suites remain required too.

## Security/behaviour

The native admin login uses the existing native refresh-token endpoints and secure storage path.
Admin scope checks remain server-side; the Android shell does not grant extra permissions. Push
registration is enabled only after an authenticated native admin session.


## Branding

The public app label is **Well Nest Home Care Uganda Admin**. The legal company name **Well Nest Home Care Uganda Ltd** is reserved for legal/company contexts. See `docs/BRANDING_RULES.md`.
