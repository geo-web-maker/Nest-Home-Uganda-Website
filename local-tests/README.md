# Run the CI checks on your own computer

These scripts do what the GitHub Actions workflows do, so you never depend on Actions minutes.

## Quick start
```
./local-tests/run.sh quick     # lint, types, unit tests, builds, guard checks. No Docker or browser needed.
./local-tests/run.sh full      # everything, including database and browser tests
./local-tests/run.sh backend   # or any single stage
```
Stages: `guards ops frontend nurse backend frontend-e2e nurse-e2e real-e2e`.
You can combine them: `./local-tests/run.sh nurse real-e2e`.
Each stage keeps going after a failure and prints a PASS/FAIL summary. Full logs are in `local-tests/logs/`.

On Windows, use `local-tests\run.bat quick` (needs Git for Windows, or WSL).

## What you need installed
| For stage | You need |
|---|---|
| guards, ops | bash, Python 3 (shellcheck optional) |
| frontend, nurse | Node 22 and npm |
| backend | Python 3.12, plus MongoDB 7 running as a replica set |
| nurse-e2e, frontend-e2e | Node 22 (Playwright downloads Chromium for you) |
| real-e2e | Node 22, Python 3.12, MongoDB replica set, Docker only for MongoDB; the S3 server is `moto`, installed automatically in `local-tests/.moto-venv` |

Docker makes the database part automatic: the script runs `docker compose -f docker-compose.dev.yml up -d mongo`.
The backend stage now checks that the database is a writable primary of replica set `rs0` before running pytest; if not, pytest and migrate+seed are reported as SKIP instead of producing hundreds of connection errors. If it keeps failing, run `docker compose -f docker-compose.dev.yml down -v` to drop a stale volume and retry. If port 27017 is already used by a local mongod, stop it first.
No Docker? Start your own MongoDB replica set, then run with `SKIP_DOCKER=1` and, if needed, `TEST_MONGODB_URI=...`.

## Android phone (Termux)
Termux can run the **quick** stages (guards, ops, frontend, nurse): install `nodejs python git`, then run `./local-tests/run.sh quick`.
It cannot run Playwright's Chromium, Docker or a MongoDB replica set. For those, use a PC, or a proot Ubuntu inside Termux (`pkg install proot-distro`), though browser tests may still not work there.

## Building the APK locally
See the steps in the main chat: `npm run build`, `npx cap add android`, `node scripts/apply_android_overrides.mjs`, `npx cap sync android`, then `./gradlew assembleDebug` in `nurse/android` (needs Java 21 and Android SDK 35).

## Reuse for other projects
Copy `run.sh`, change the stage functions to match that project's commands, and keep the `step` helper and summary.
