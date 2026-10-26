#!/usr/bin/env bash
# Orientation for any Claude session. Run from the folder that contains .git (the repo root).
# Prints facts only. Changes nothing.
echo "=== 1. LOCATION ==="; pwd
[ -d .git ] || { echo "FAIL: no .git here. Wrong folder or .git was left out of the zip."; exit 1; }
echo; echo "=== 2. REPO HEALTH ==="
git fsck --no-progress 2>&1 | tail -3; echo "fsck exit: ${PIPESTATUS[0]}"
git config user.name  >/dev/null || git config user.name  "Claude"
git config user.email >/dev/null || git config user.email "noreply@anthropic.com"
echo; echo "=== 3. BRANCH AND STATE ==="
git branch --show-current; git branch -a | head -20
echo "--- uncommitted changes ---"; git status --porcelain | head -30
echo "--- stashes ---"; git stash list | head
echo; echo "=== 4. LAST 15 COMMITS ==="; git log --oneline --decorate -15
echo; echo "=== 5. STATE LEDGER (docs/STATE.md) ==="
[ -f docs/STATE.md ] && cat docs/STATE.md || echo "MISSING docs/STATE.md (create it from templates/STATE.md)"
echo; echo "=== 6. BUILD LOG TAIL ==="
[ -f docs/BUILD_LOG.md ] && tail -40 docs/BUILD_LOG.md || echo "none yet"
echo; echo "=== 7. LAYOUT ==="
for d in frontend backend docs reference .github; do [ -e "$d" ] && echo "present: $d" || echo "ABSENT:  $d"; done
echo "frontend src files: $(find frontend/src -type f 2>/dev/null | wc -l)"
echo "backend py files:   $(find backend/app -name '*.py' 2>/dev/null | wc -l)"
echo "lockfiles: $(ls frontend/package-lock.json backend/requirements*.lock backend/uv.lock 2>/dev/null | tr '\n' ' ')"
echo; echo "=== 8. SAFETY CHECKS ==="
git ls-files | grep -E '(^|/)\.env$' && echo "FAIL: .env is tracked" || echo "ok: no .env tracked"
git ls-files | grep -E 'node_modules|\.venv' | head -1 | grep -q . && echo "FAIL: dependencies tracked" || echo "ok: no dependency folders tracked"
grep -rIl --exclude-dir=.git --exclude-dir=node_modules -E '(MAMBOSMS_API_KEY|SECRET_KEY)=.+' . 2>/dev/null | grep -v '.env.example' | head -3 | sed 's/^/FAIL: possible secret in /' ; echo "secret scan done"
echo; echo "=== 9. TOOLS IN THIS SESSION ==="
node -v 2>&1; npm -v 2>&1; python3 --version 2>&1
command -v docker >/dev/null && echo "docker: present" || echo "docker: ABSENT"
timeout 20 npm view react@18.3.1 version --fetch-retries=0 --fetch-timeout=15000 >/dev/null 2>&1 && echo "npm registry: reachable" || echo "npm registry: UNREACHABLE"
