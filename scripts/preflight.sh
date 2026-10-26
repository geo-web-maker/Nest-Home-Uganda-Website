#!/usr/bin/env bash
# Run first. Checks the environment can complete the build. Exit 0 only if every check passes.
fail=0
ok(){ echo "PASS  $1"; }
no(){ echo "FAIL  $1"; fail=1; }

command -v git >/dev/null && ok "git: $(git --version)" || no "git not installed"

if command -v node >/dev/null; then
  v=$(node -v | sed 's/v//;s/\..*//')
  [ "$v" -ge 22 ] && ok "node $(node -v)" || no "node must be 22 or newer, found $(node -v)"
else no "node not installed"; fi

command -v npm >/dev/null && ok "npm $(npm -v)" || no "npm not installed"

if command -v python3 >/dev/null; then
  pv=$(python3 -c 'import sys;print("%d.%d"%sys.version_info[:2])')
  case "$pv" in 3.12|3.13) ok "python $pv";; *) no "python must be 3.12 or 3.13, found $pv";; esac
else no "python3 not installed"; fi

if timeout 30 npm view react@18.3.1 version --fetch-retries=0 --fetch-timeout=20000 >/dev/null 2>&1; then
  ok "npm registry reachable"
else no "npm registry NOT reachable (registry.npmjs.org)"; fi

if timeout 30 python3 -m pip index versions fastapi >/dev/null 2>&1; then
  ok "PyPI reachable"
else no "PyPI NOT reachable (pypi.org)"; fi

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  ok "docker available"
elif [ -n "$TEST_MONGODB_URI" ] && [ -n "$TEST_S3_ENDPOINT" ]; then
  ok "no docker, but TEST_MONGODB_URI and TEST_S3_ENDPOINT are set"
else
  no "docker unavailable and TEST_MONGODB_URI / TEST_S3_ENDPOINT not set (MongoDB replica set and S3-compatible storage are required for tests)"
fi

[ $fail -eq 0 ] && echo "PREFLIGHT PASSED" || echo "PREFLIGHT FAILED"
exit $fail
