# Bloomwell Home Care Admin Android app

The admin is a standalone PWA in `admin/`. The Android app is built from the same production web bundle, so web routes, authentication, scopes, API access and mobile navigation stay aligned.

## Identity

- App name: **Bloomwell Home Care Admin**
- Android application id: `ug.nesthomecare.admin`
- Web bundle: `admin/dist`
- Capacitor config: `admin/capacitor.config.ts`

## Local build

From the repository root:

```bash
cd admin
npm ci
npm run build
npx cap add android --config capacitor.config.ts
cd ..
node scripts/apply_admin_android_overrides.mjs
cd admin
npx cap sync android --config capacitor.config.ts
cd android
./gradlew assembleDebug
```

The APK is written to `admin/android/app/build/outputs/apk/debug/`. The generated `admin/android/` project is intentionally not committed; CI regenerates it from the locked web project.

## Focused tests

From `admin/`:

```bash
npm run test:admin-native
npm run test:e2e:admin-native
npm run test:reference
npm run test:a11y
npm run test:responsive
```

## Security and behaviour

The native admin login uses the existing native refresh-token endpoints and secure storage path. Admin scope checks remain server-side; the Android shell does not grant extra permissions. Push registration is enabled only after an authenticated native admin session.

The same-origin `/api/*` Worker proxy is required for web admin refresh-cookie authentication. The native build uses the existing native token flow.

## Branding

The public app label is **Bloomwell Home Care Uganda Admin**. The legal company name **Bloomwell Home Care Uganda Limited** is reserved for legal/company contexts. See `docs/BRANDING_RULES.md`.
