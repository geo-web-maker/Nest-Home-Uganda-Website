# App versions (Android app and web updates)

Every version is `<apk>.<a>.<b>`, for example `1.0.7`.

| Part | Meaning | When it changes |
| --- | --- | --- |
| `apk` | The Android app generation | Only when an APK build **succeeded** and was published. A failed build does not use its number: the retry gets the same one. |
| `a.b` | Web updates since that APK, 0.1 up to 99.99 | +1 for every published web update. A new APK starts it again at 0.0. |

Sequence: first APK `1.0.0` -> web updates `1.0.1`, `1.0.2` ... `1.0.99`, `1.1.0` ... -> next APK `2.0.0` -> web updates `2.0.1` ...
Before any APK has been published the first web update is `0.0.1`, and the first APK is `1.0.0`.

## Nothing to type

* **Web updates are automatic.** Every push to `main` that changes `admin/` or `nurse/` runs `web-bundle-release`. It asks the backend
  (`GET /app-bundles/{app}/next-version`, header `X-Release-Key`) for the next number, builds with `APP_VERSION=<number>`, uploads the
  bundle and publishes the release record, then tags `admin-web-v<number>`. Installed apps and the browser/PWA see the higher number in
  App Center without anyone changing a file.
* **Android apps**: Admin app > Builds > "Android app". The backend picks the next whole number and creates the tag
  `admin-v2.0.0` / `nurse-v2.0.0`; the tag workflow builds, signs and publishes it, taking the version from the tag. package.json is not edited.
* If a build fails nothing is published, so the same number is used by the next attempt (a leftover tag of the failed build is replaced).
* When the web counter reaches 99.99 the Builds screen asks for a new Android app.

## Where the number is shown

App Center (admin and nurse): *App version* (the APK, or the web build when running in a browser), *Web content* (the web update running
inside the APK), and, in a browser or installed web app, *Newest web version* with a "Version X is available / ready" notice.
*Client build* is a different number: the forced-upgrade gate in `client_guard.py`. It stays 1 until a change must not be skipped.

## One-off things to know

* The release workflows need the repository secrets `ADMIN_API_URL` (ending in `/api/v1`) and `RELEASE_PUBLISH_KEY`
  (the same value as `NEST_RELEASE_PUBLISH_KEY` on the backend, 32+ characters).
* A web update only reaches APKs whose versionCode is at least the newest APK's (set automatically). To force a floor, set the repository
  variable `MIN_NATIVE_VERSION_CODE`.
* Cloudflare builds the site from GitHub on its own, so after each web update the workflow saves the number in `admin/version.json` or
  `nurse/version.json` (a small automatic commit to `main`) and Cloudflare's next build shows it. Version order used by the build:
  `APP_VERSION` (release workflows) -> `version.json` -> `package.json`. If `main` is protected, allow `github-actions[bot]` to push to it.
