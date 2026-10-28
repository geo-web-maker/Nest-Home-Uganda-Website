#!/usr/bin/env bash
# Runs the same checks as the GitHub Actions workflows, on your own machine.
# Usage:  ./local-tests/run.sh [quick|full|stage ...]
#   quick  = guards ops frontend nurse            (no Docker, no browser, no database)
#   full   = every stage below
# Stages: guards ops frontend nurse backend frontend-e2e nurse-e2e real-e2e
# Each stage runs even if an earlier one fails; a summary is printed at the end.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOG_DIR="$ROOT/local-tests/logs"; mkdir -p "$LOG_DIR"
RESULTS=()
API_PID=""

PY="$(command -v python3.12 || command -v python3 || command -v python || true)"
COMPOSE="docker compose -f docker-compose.dev.yml"
# Test MongoDB runs in this standalone container (not the compose service). Override with MONGO_CONTAINER=...
MONGO_CONTAINER="${MONGO_CONTAINER:-mongo-local}"
MONGO_VOLUME="${MONGO_VOLUME:-mongo-data}"
TEST_MONGODB_URI="${TEST_MONGODB_URI:-mongodb://localhost:27017/?replicaSet=rs0&directConnection=true}"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing tool: $1 ($2)"; return 1; }; }

# step "label" command...   runs in the current directory; records pass/fail; never aborts the script
step() {
  local label="$1"; shift
  local logfile="$LOG_DIR/$(echo "$label" | tr ' /:' '___').log"
  echo "-> $label"
  if "$@" >"$logfile" 2>&1; then RESULTS+=("PASS  $label")
  else RESULTS+=("FAIL  $label   (log: ${logfile#$ROOT/})"); tail -n 15 "$logfile" | sed 's/^/     /'; fi
}
# like step, but returns the command's status so callers can gate later steps
step_ok() { local n=${#RESULTS[@]}; step "$@"; case "${RESULTS[$n]}" in PASS*) return 0;; *) return 1;; esac; }
in_dir() { local d="$1"; shift; ( cd "$ROOT/$d" && "$@" ); }

# ---------- stage: guards (ci.yml "guards" job; works with or without a .git folder) ----------
scan() { # scan <label> <regex> <extra-filter-regex-for-allowed-paths>
  local label="$1" re="$2" allow="${3:-^$}"
  local hits
  hits="$(grep -rInE "$re" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv --exclude-dir=.venv-local --exclude-dir=dist --exclude-dir=dist-admin-native \
          --exclude-dir=local-tests --exclude-dir=test-results --exclude-dir=playwright-report \
          --include='*.py' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.css' --include='*.html' 2>/dev/null \
          | grep -vE "$allow" || true)"
  if [ -n "$hits" ]; then echo "$hits" | head -20; return 1; fi
}
stage_guards() {
  say "guards"
  step "guards: no .env or dependency folders tracked" bash -c '! { [ -d .git ] && git ls-files | grep -E "(^|/)\.env$|node_modules|\.venv"; }'
  step "guards: Motor is not used" bash -c '! grep -rniE "^motor==|import motor|from motor" backend --include=*.py --include=*.lock --include=*.toml --exclude-dir=.venv --exclude-dir=.venv-local'
  step "guards: Firebase only in approved files" scan x 'firebase|googleapis.com/oauth2|fcm.googleapis.com' '^\./(backend/app/modules/push/|nurse/src/platform/push.ts|frontend/src/admin-native/push.ts|docs/|reference/|\.github/|\.env\.example)'
  step "guards: no remote fonts or CDN" scan x 'fonts\.(googleapis|gstatic)\.com|unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com' '^\./(docs/|reference/|\.github/)'
  step "guards: no roles (scopes only)" bash -c '! grep -rnE "require_roles|user_role|UserRole" backend/app frontend/src'
}

# ---------- stage: ops (ci.yml "ops-scripts") ----------
stage_ops() {
  say "ops scripts"
  step "ops: bash syntax" bash -c 'bash -n scripts/backup-mongodb-to-b2.sh && bash -n scripts/restore-mongodb-from-b2.sh'
  if command -v shellcheck >/dev/null; then step "ops: shellcheck" shellcheck scripts/backup-mongodb-to-b2.sh scripts/restore-mongodb-from-b2.sh
  else RESULTS+=("SKIP  ops: shellcheck (not installed)"); fi
  [ -n "$PY" ] && step "ops: env docs up to date" "$PY" scripts/gen_env_docs.py --check
}

# ---------- stage: frontend (ci.yml "frontend") ----------
stage_frontend() {
  say "frontend"; need npm "install Node 22" || { RESULTS+=("FAIL  frontend: npm missing"); return; }
  step "frontend: npm ci"        in_dir frontend npm ci
  step "frontend: lint"          in_dir frontend npm run lint
  step "frontend: typecheck"     in_dir frontend npm run typecheck
  step "frontend: unit tests"    in_dir frontend npm run test
  step "frontend: build"         in_dir frontend npm run build
  step "frontend: build admin-native" in_dir frontend npm run build:admin-native
  step "frontend: format check"  in_dir frontend npm run format:check
}

# ---------- stage: nurse (nurse.yml, everything except the browser tests) ----------
stage_nurse() {
  say "nurse app"; need npm "install Node 22" || { RESULTS+=("FAIL  nurse: npm missing"); return; }
  step "nurse: script tests" node --test scripts/__tests__/nurse-package.test.mjs scripts/__tests__/apply-android-overrides.test.mjs scripts/__tests__/check-nurse-styles.test.mjs
  step "nurse: npm ci"       in_dir nurse npm ci --no-audit --no-fund
  step "nurse: lint"         in_dir nurse npm run lint
  step "nurse: typecheck"    in_dir nurse npm run typecheck
  step "nurse: unit tests"   in_dir nurse npm test
  step "nurse: build"        in_dir nurse npm run build
  step "nurse: check no external" in_dir nurse node ../scripts/check-no-external.mjs dist
  step "nurse: check bundle size" in_dir nurse node ../scripts/check-bundle-size.mjs dist
  step "nurse: check fonts"       in_dir nurse node ../scripts/check-fonts.mjs
  step "nurse: check strings"     in_dir nurse node ../scripts/check-strings.mjs dist
  step "nurse: check styles"      in_dir nurse node ../scripts/check-nurse-styles.mjs src/styles.css
}

playwright_install() { # $1 = dir
  if [ "$(uname -s)" = "Linux" ]; then in_dir "$1" npx playwright install --with-deps chromium || in_dir "$1" npx playwright install chromium
  else in_dir "$1" npx playwright install chromium; fi
}

# ---------- Mongo / venv helpers ----------
mongo_sh() { docker exec -i "$MONGO_CONTAINER" mongosh --quiet "$@"; }
start_mongo() {
  need docker "install Docker Desktop (or Docker Engine)" || return 1
  if docker inspect "$MONGO_CONTAINER" >/dev/null 2>&1; then
    docker start "$MONGO_CONTAINER" >/dev/null || return 1
  else
    # nofile=64000: mongod crashes (fassert 50853) with Docker's default 2048 once tests create many collections/indexes
    docker run -d --name "$MONGO_CONTAINER" --ulimit nofile=64000:64000 --restart unless-stopped \
      -p 27017:27017 -v "$MONGO_VOLUME":/data/db \
      mongo:7 --replSet rs0 --bind_ip_all >/dev/null || return 1
  fi
  echo "waiting for MongoDB replica set..."
  for _ in $(seq 1 40); do
    # explicit, idempotent initiate (do not rely only on the compose healthcheck)
    mongo_sh --eval "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}).ok }" >/dev/null 2>&1
    # ready only when this node reports itself as a writable primary of rs0
    if [ "$(mongo_sh --eval "const h=db.hello(); (h.setName==='rs0' && h.isWritablePrimary) ? 'READY' : 'NOT_READY'" 2>/dev/null | tr -d '\r' | tail -n1)" = "READY" ]; then
      echo "MongoDB replica set rs0 is primary"; return 0
    fi
    sleep 3
  done
  echo "MongoDB did not become a primary of rs0; container logs:"; docker logs --tail 40 "$MONGO_CONTAINER" 2>&1
  return 1
}
# Verifies the URI the tests will actually use (host side), not just the container.
check_mongo_uri() {
  # uses the activated backend venv (pymongo lives there), not the system python
  python - "$TEST_MONGODB_URI" <<'PYEOF'
import sys
from pymongo import MongoClient
c = MongoClient(sys.argv[1], serverSelectionTimeoutMS=8000)
h = c.admin.command("hello")
assert h.get("setName") == "rs0" and h.get("isWritablePrimary"), f"not a primary of rs0: {h}"
print("TEST_MONGODB_URI OK:", h.get("setName"))
PYEOF
}
# S3-compatible server for the real-backend e2e (same tool as .github/workflows/e2e-real-backend.yml). No Docker image needed.
MOTO_VENV="$ROOT/local-tests/.moto-venv"
start_moto() {
  [ -n "$PY" ] || { echo "Python 3.12 not found"; return 1; }
  [ -d "$MOTO_VENV" ] || "$PY" -m venv "$MOTO_VENV" || return 1
  "$MOTO_VENV/bin/pip" install -q "moto[server]" || return 1
  if ! curl -fsS http://127.0.0.1:9000/moto-api/ >/dev/null 2>&1; then
    nohup "$MOTO_VENV/bin/moto_server" -H 127.0.0.1 -p 9000 >"$LOG_DIR/moto.log" 2>&1 &
    echo $! >"$LOG_DIR/moto.pid"
  fi
  for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:9000/moto-api/ >/dev/null 2>&1 && break; sleep 2; done
  "$MOTO_VENV/bin/python" - <<'PYEOF'
import boto3
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:9000", region_name="us-east-1",
                  aws_access_key_id="minioadmin", aws_secret_access_key="minioadmin")
have = {b["Name"] for b in s3.list_buckets()["Buckets"]}
for name in ("nest-public", "nest-private"):
    if name not in have:
        s3.create_bucket(Bucket=name)
PYEOF
}
stop_moto() { [ -f "$LOG_DIR/moto.pid" ] && kill "$(cat "$LOG_DIR/moto.pid")" 2>/dev/null; rm -f "$LOG_DIR/moto.pid"; }
backend_venv() {
  [ -n "$PY" ] || { echo "Python 3.12 not found"; return 1; }
  [ -d backend/.venv-local ] || "$PY" -m venv backend/.venv-local || return 1
  # shellcheck disable=SC1091
  . backend/.venv-local/bin/activate 2>/dev/null || . backend/.venv-local/Scripts/activate
  ( cd backend && pip install -q -r requirements.lock && pip install -q -e . --no-deps )
}

# ---------- stage: backend (ci.yml "backend") ----------
stage_backend() {
  say "backend"
  if [ -z "${SKIP_DOCKER:-}" ]; then step "backend: start MongoDB (docker)" start_mongo; fi
  step "backend: install deps" backend_venv
  . backend/.venv-local/bin/activate 2>/dev/null || . backend/.venv-local/Scripts/activate 2>/dev/null || true
  export TEST_MONGODB_URI
  if ! step_ok "backend: MongoDB reachable as replica set (host URI)" check_mongo_uri; then
    RESULTS+=("SKIP  backend: pytest and migrate+seed (MongoDB replica set not reachable at $TEST_MONGODB_URI)")
    step "backend: ruff check"        in_dir backend ruff check .
    step "backend: ruff format check" in_dir backend ruff format --check .
    return
  fi
  step "backend: ruff check"        in_dir backend ruff check .
  step "backend: ruff format check" in_dir backend ruff format --check .
  step "backend: pytest"            in_dir backend pytest -q -rs
  step "backend: migrate + seed smoke" in_dir backend env MONGODB_URI="$TEST_MONGODB_URI" MONGODB_DB=nhc_local_smoke \
      SECRET_KEY=local-only-secret-key-not-used-anywhere-else-0123456789 FIRST_SUPERADMIN_EMAIL=ci@example.com \
      FIRST_SUPERADMIN_PASSWORD=ci-dummy-password-123 bash -c 'python -m app.migrate && python -m app.migrate && python -m app.seed && python -m app.seed'
}

# ---------- stage: frontend-e2e / nurse-e2e (Playwright, no backend) ----------
stage_frontend_e2e() {
  say "frontend browser tests"
  if [ ! -d frontend/e2e ] || [ -z "$(ls -A frontend/e2e 2>/dev/null)" ]; then RESULTS+=("SKIP  frontend-e2e (no frontend/e2e)"); return; fi
  step "frontend-e2e: install npm"      in_dir frontend npm ci
  step "frontend-e2e: install Chromium" playwright_install frontend
  step "frontend-e2e: build"            in_dir frontend npm run build
  step "frontend-e2e: playwright"       in_dir frontend npm run test:e2e
}
stage_nurse_e2e() {
  say "nurse browser tests"
  step "nurse-e2e: npm ci"            in_dir nurse npm ci --no-audit --no-fund
  step "nurse-e2e: install Chromium"  playwright_install nurse
  step "nurse-e2e: acceptance tests"  in_dir nurse npm run test:e2e
}

# ---------- stage: real-e2e (e2e-real-backend.yml) ----------
stop_api() { [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null; API_PID=""; }
stage_real_e2e() {
  say "real-backend e2e"
  [ -z "${SKIP_DOCKER:-}" ] && { step "real-e2e: start MongoDB (docker)" start_mongo; }
  step "real-e2e: start S3 server (moto)" start_moto
  step "real-e2e: install backend" backend_venv
  . backend/.venv-local/bin/activate 2>/dev/null || . backend/.venv-local/Scripts/activate 2>/dev/null || true
  export TEST_MONGODB_URI
  step_ok "real-e2e: MongoDB reachable as replica set (host URI)" check_mongo_uri || { RESULTS+=("SKIP  real-e2e (no MongoDB replica set)"); return; }
  export MONGODB_URI="$TEST_MONGODB_URI" MONGODB_DB=nhc_e2e CARE_MONGODB_DB=nhc_e2e_care \
    SECRET_KEY=e2e-only-secret-key-not-used-anywhere-else-0123456789 IP_HASH_SALT=e2e-only-salt \
    CORS_ORIGINS=http://127.0.0.1:4173 FRONTEND_URL=http://127.0.0.1:4173 \
    FIRST_SUPERADMIN_EMAIL=e2e-admin@example.test FIRST_SUPERADMIN_PASSWORD='E2E-Only-Password-Change-Me!' \
    SCHEDULER_ENABLED=false SMS_PROVIDER=console PUSH_SENDER=fake S3_ENDPOINT=http://127.0.0.1:9000 \
    S3_REGION=us-east-1 S3_BUCKET_PUBLIC=nest-public S3_BUCKET_PRIVATE=nest-private S3_KEY=minioadmin S3_SECRET=minioadmin \
    E2E_BASE_URL=http://127.0.0.1:4173 E2E_API_URL=http://127.0.0.1:8000
  # start from a clean e2e database so reruns behave like CI
  step "real-e2e: reset e2e databases" in_dir backend python -c "
import os; from pymongo import MongoClient
c = MongoClient(os.environ['MONGODB_URI'])
for d in (os.environ['MONGODB_DB'], os.environ['CARE_MONGODB_DB']): c.drop_database(d)"
  step "real-e2e: migrate" in_dir backend python -m app.migrate
  step "real-e2e: seed fixture" in_dir backend python scripts/seed_e2e.py
  ( cd backend && nohup python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 > "$LOG_DIR/api.log" 2>&1 & echo $! > "$LOG_DIR/api.pid" )
  API_PID="$(cat "$LOG_DIR/api.pid")"; trap 'stop_api; stop_moto' EXIT
  for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1 && break; sleep 2; done
  step "real-e2e: API health" curl -fsS http://127.0.0.1:8000/api/v1/health
  step "real-e2e: build nurse against local API" in_dir nurse env VITE_API_URL=http://127.0.0.1:8000 bash -c 'npm ci --no-audit --no-fund && npm run build'
  step "real-e2e: install Chromium" playwright_install nurse
  step "real-e2e: playwright real-backend" in_dir nurse npx playwright test e2e/real-backend.spec.ts
  stop_api; stop_moto
}

# ---------- main ----------
ARGS=("$@"); [ ${#ARGS[@]} -eq 0 ] && ARGS=(quick)
STAGES=()
for a in "${ARGS[@]}"; do
  case "$a" in
    quick) STAGES+=(guards ops frontend nurse) ;;
    full)  STAGES+=(guards ops frontend nurse backend frontend-e2e nurse-e2e real-e2e) ;;
    guards|ops|frontend|nurse|backend|frontend-e2e|nurse-e2e|real-e2e) STAGES+=("$a") ;;
    *) echo "Unknown stage: $a"; sed -n 2,8p "$0"; exit 2 ;;
  esac
done
for s in "${STAGES[@]}"; do "stage_${s//-/_}"; done

say "SUMMARY"; printf '%s\n' "${RESULTS[@]}"
if printf '%s\n' "${RESULTS[@]}" | grep -q '^FAIL'; then echo; echo "Some checks failed. Logs: local-tests/logs/"; exit 1; fi
echo; echo "All selected checks passed."
