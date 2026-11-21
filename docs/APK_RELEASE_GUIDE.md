# APK build, branding and update guide

Covers both Android apps (nurse and admin): one-time setup, building a signed APK, shipping updates, and what the in-app **App Center** does. Names below match the workflows in `.github/workflows/`.

| | Nurse | Admin |
|---|---|---|
| App id | `ug.nesthomecare.nurse` | `ug.nesthomecare.admin` |
| Full APK tag | `nurse-vX.Y.Z` | `admin-vX.Y.Z` |
| Web-only update tag | `nurse-web-vX.Y.Z` | `admin-web-vX.Y.Z` |
| Version source | `nurse/package.json` | `admin/package.json` |

---

## 1. One-time setup

### 1.1 Create the signing keystore (once per app, keep it forever)

Losing a keystore means installed phones can never update in place. Back it up in two places outside the repo.

```bash
keytool -genkeypair -v -storetype JKS \
  -keystore nurse-release.jks -alias nurse \
  -keyalg RSA -keysize 2048 -validity 10000
# repeat with admin-release.jks and alias admin
```

Use a strong password. Never commit the `.jks`.

Encode for GitHub:

```bash
base64 -w0 nurse-release.jks    # macOS: base64 -i nurse-release.jks
```

### 1.2 GitHub secrets (Settings, Secrets and variables, Actions, Secrets)

| Secret | Value |
|---|---|
| `NURSE_KEYSTORE_BASE64` | base64 of `nurse-release.jks` |
| `NURSE_KEYSTORE_PASSWORD` | keystore password |
| `NURSE_KEY_ALIAS` | `nurse` |
| `NURSE_KEY_PASSWORD` | key password |
| `ADMIN_KEYSTORE_BASE64` / `ADMIN_KEYSTORE_PASSWORD` / `ADMIN_KEY_ALIAS` / `ADMIN_KEY_PASSWORD` | same, for admin |
| `S3_KEY`, `S3_SECRET`, `S3_REGION`, `S3_ENDPOINT`, `S3_BUCKET_PRIVATE` | the private bucket the APKs and bundles are uploaded to |
| `ADMIN_API_URL` | backend API base, e.g. `https://YOUR-HOST/nest/api/v1` (the workflows append `/app-bundles/releases`) |
| `RELEASE_PUBLISH_KEY` | the release key, see 1.4 |

### 1.3 GitHub variables (same page, Variables tab)

| Variable | Value |
|---|---|
| `VITE_API_URL` | backend origin the apps call, e.g. `https://YOUR-HOST/nest` (same value as `nurse/.env.production.example`) |
| `VITE_MAIL_STORAGE_URL` | origin only of your S3/R2 endpoint (needed for attachment uploads) |
| `MIN_NATIVE_VERSION_CODE` | optional, defaults to `1`; raise it when a web bundle needs new native code |

`VITE_API_URL` is baked in at build time. An APK built without it cannot log in. The nurse release workflow was missing it and now passes it, like the admin one.

### 1.4 The release key (replaces the old expiring token)

The last step of every release tells the backend a new version exists. It authenticates with one long random key that can publish releases and do nothing else. It does not expire and is not a user account.

1. Generate it in Termux (or anywhere): `openssl rand -hex 32` (64 characters; pkg install openssl if missing).
2. Put the same value in two places:
   - the backend environment as `NEST_RELEASE_PUBLISH_KEY`, then **redeploy the backend**, because this route is new code;
   - the GitHub secret `RELEASE_PUBLISH_KEY`.
3. If the backend variable is empty or shorter than 32 characters the route answers 404 (disabled). A wrong or missing key gets 401.

To rotate it, change both places. Releases already published are unaffected.

### 1.5 Logos and icons

Launcher icons (adaptive and round, all densities) and the splash are already generated in:

```
android-shared/branding/nurse/res/    light background
android-shared/branding/admin/res/    dark green background, so the two apps are easy to tell apart
```

`scripts/apply_android_overrides.mjs` (nurse) and `scripts/apply_admin_android_overrides.mjs` (admin) copy them over the default Capacitor artwork after `npx cap add android`. You do nothing at build time.

To change the logo: replace the PNGs in the matching `mipmap-*` folders (`ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png`), edit the colour in `values/ic_launcher_background.xml`, and the splash in `drawable/splash.xml`. Sizes per density: mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192 px; the adaptive foreground is 108/162/216/324/432 px with the logo kept inside the centre 66 percent.

---

## 2. Release a new APK (first install or native change)

1. Bump the version in `nurse/package.json` (or `admin/package.json`) and commit to `main`.
2. Make sure CI is green and the token in 1.4 is fresh.
3. Tag and push:

```bash
git tag nurse-v1.0.0 && git push origin nurse-v1.0.0
git tag admin-v1.0.0 && git push origin admin-v1.0.0
```

The tag format must be exactly `nurse-vN.N.N` or `admin-vN.N.N`.

The workflow then: builds the web app, generates the native project, applies overrides (icons, manifest, updater plugins, `versionCode` from the run number, `versionName` from `package.json`), builds a signed `assembleRelease` APK, uploads it to `apks/` in the private bucket, and publishes the release record.

4. Download the APK from the bucket or from the App Center (below) and install it.

`versionCode` increases automatically with every run. `versionName` must increase by you, or phones will not see the new build as newer.

### Build locally instead (debug APK to try on a phone)

```bash
cd nurse
npm ci
VITE_API_URL=https://YOUR-HOST/nest npm run build
npx cap add android
cd ..
node scripts/apply_android_overrides.mjs
cd nurse
npx cap sync android
cd android && ./gradlew assembleDebug
# output: nurse/android/app/build/outputs/apk/debug/app-debug.apk
```

Admin is the same with `apply_admin_android_overrides.mjs`, and the `admin/` folder. Needs Node 22, JDK 21 and the Android SDK (platform 35, build-tools 35.0.0).

---

## 2a. Release checks (run before every build)

Admin app, then Diagnostics, then the **Releases** tab, then **Run release checks**. It needs your authenticator code like the other diagnostics. It checks, in plain words:

| Check | What it proves |
|---|---|
| release key on backend | `NEST_RELEASE_PUBLISH_KEY` is set and long enough |
| private bucket write | the backend can write, read back and delete a file in the private bucket |
| GitHub connection, branch, Actions read | the token works and sees the repo, branch and build runs |
| GitHub tag permission | the token can create (and removes) a throwaway tag, so **Start build** will work |
| GitHub workflows | the three release workflow files are on the branch |
| nurse and admin version | `package.json` versions are readable, and warns when that version's tag is already used |
| GitHub secrets | every required secret name exists (names only) |
| GitHub variables | `VITE_API_URL` is https with no trailing slash and answers; `VITE_MAIL_STORAGE_URL` is an origin with no bucket path |

Anything marked **FIX** will break the build; **CHECK** is worth a look; **SKIPPED** means the token lacks a read-only permission for that check. Run it again after each fix until it says "Ready to build".

What it cannot do: read the *values* of GitHub secrets, so a mistyped password or key still only shows up in the build. It also cannot compare GitHub's `RELEASE_PUBLISH_KEY` with the backend's; it only confirms the backend's side.

---

## 2b. Start and watch builds from the Admin app

Admin app, then App releases, then **Build and publish an app**. Pick what to build, type the version and tap **Start build**. The page tags the latest code on GitHub, GitHub builds and publishes it, and **Recent builds** shows the status (waiting, building, published, failed) with a link to the GitHub log. While a build runs the list refreshes by itself.

Each build target uses the same tags as section 2 and 3:

| Choice | Tag created |
|---|---|
| Nurse Android app | `nurse-vX.Y.Z` |
| Admin Android app | `admin-vX.Y.Z` |
| Nurse web update | `nurse-web-vX.Y.Z` |
| Admin web update | `admin-web-vX.Y.Z` |

Rules the page enforces: only a superadmin can use it, the version must equal `version` in that app's `package.json` on GitHub (change it there first and commit), and a tag that already exists is refused. The old manual policy form is still below it, for rare hand-published policies.

One-time setup on the backend (Render):

1. On GitHub: Settings, Developer settings, Personal access tokens, **Fine-grained tokens**, Generate new token.
   - Repository access: **Only select repositories**, choose this repo.
   - Permissions: **Contents: Read and write**, **Actions: Read-only**, and for the release checks **Secrets: Read-only** (names only, never values) and **Variables: Read-only**. Metadata is added for you.
   - Expiry: the longest allowed. Note the date; when it lapses the page says GitHub refused the token and you make a new one.
2. On Render, add `NEST_GITHUB_REPO` (`owner/name`) and `NEST_GITHUB_TOKEN` (the token), then redeploy.
3. Optional `NEST_GITHUB_BRANCH` if your default branch is not `main`.

The token can create tags and read runs in that one repository only. It cannot read secrets or change workflows. Keep it only in the backend environment, never in the app or the repo. Builds still need all the GitHub secrets and variables from section 1; this page only starts and watches them.

---

## 3. Ship an update without a new APK (web-only)

For UI and logic changes that need no new native code:

1. Bump `version` in `<app>/package.json` (must be higher than the version baked into installed APKs).
2. Tag: `git tag nurse-web-v1.0.1 && git push origin nurse-web-v1.0.1` (or `admin-web-...`). The tag version must equal `package.json`, otherwise the job stops.

Installed apps pick it up in the App Center and apply it with the Update button. If the bundle needs a newer native layer, set `MIN_NATIVE_VERSION_CODE` to the `versionCode` of the APK that first has it; older installs are then offered the full APK instead.

---

## 4. In-app App Center

Nurse: Profile, then App Center (`/app-center`). Admin: Profile page section, or `/app-center`.

It shows how the app is running (Android app, installed web app, or browser) and the current version, then checks three things:

- **Newer Android build** from `GET /api/v1/app-bundles/{app}/apk?current=<version>`. Update downloads it, verifies the sha256, and opens the system installer.
- **Quick web-content update** from `GET /api/v1/app-bundles/{app}/latest`. Update applies it in place.
- **Web app (PWA) update**. Update reloads to the newest service-worker version.

In a plain browser it shows a download link for the Android app. Both endpoints are public on purpose so the check works on the login screen. Downloads use short-lived signed URLs.

---

## 5. Installing and troubleshooting

**Phone blocks the install ("unknown sources").** Allow the app that opened the APK (Chrome, Files, or the Nest app itself) to install unknown apps in Android settings. The manifest declares `REQUEST_INSTALL_PACKAGES` and the file provider already.

**"App not installed" over an existing install.** The signature differs. Debug and release builds, or different keystores, cannot update each other. Uninstall, then install the signed release.

**"There was a problem parsing the package".** Incomplete download, or an unsigned APK. Use the `assembleRelease` output from the release workflow and confirm the sha256 matches the release record.

**Login fails or "built without an API address".** `VITE_API_URL` was empty at build time. Set the variable (1.3) and tag a new version.

**Attachments fail with "Failed to fetch".** `VITE_MAIL_STORAGE_URL` is missing, or the bucket CORS does not allow the app origin (methods PUT, GET; header Content-Type).

**Update never appears.** The new `versionName` is not higher than the installed one; the release record is missing (check the publish step in the Actions log); or the release key is wrong (1.4).

**Publish step returns 409.** That release id already exists. Bump the version and tag again; do not reuse a tag.

**Publish step returns 404.** The backend has no `NEST_RELEASE_PUBLISH_KEY` (or it is under 32 characters), or the backend was not redeployed with this version.

**Publish step returns 401.** `RELEASE_PUBLISH_KEY` in GitHub differs from `NEST_RELEASE_PUBLISH_KEY` on the backend.

**Workflow fails at "Decode keystore" or Gradle signing.** Re-encode with `base64 -w0`, and check the alias and both passwords exactly.

---

## 6. Checklist before every tag

- [ ] Diagnostics, Releases tab: **Run release checks** says Ready to build
- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass in `nurse/` and `admin/`
- [ ] Version bumped in `package.json`
- [ ] `VITE_API_URL` and `VITE_MAIL_STORAGE_URL` variables set
- [ ] Backend redeployed with `NEST_RELEASE_PUBLISH_KEY`, same value in GitHub as `RELEASE_PUBLISH_KEY`
- [ ] Tag matches the format in the table at the top

## 7. Known limits

- A real Gradle build and a device install have not been run in this environment. Do a debug build and install once before the first tagged release.
- App Center has no dedicated tests yet.
- The Builds panel and the release checks have unit tests with GitHub mocked; neither has been run against the real GitHub API.
- The release-key route has unit tests for the disabled, wrong-key and only-route cases. A full end-to-end publish needs a live MongoDB and was not run here; two older release tests that need MongoDB also fail in the original zip.
- The admin app has 177 failing unit tests that also fail in the original zip. They are not caused by the App Center or branding changes and are not fixed.
