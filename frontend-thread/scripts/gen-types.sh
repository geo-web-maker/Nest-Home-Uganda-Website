#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backend="$root/backend"
py="$backend/.venv/bin/python"
if [ ! -x "$py" ]; then py="$(command -v python3)"; fi

cd "$backend"
APP_ENV=development "$py" - <<'PY' > "$root/frontend-thread/src/types/openapi.json"
import json
from app.main import app

print(json.dumps(app.openapi(), indent=2, sort_keys=True))
PY

cd "$root/frontend-thread"
npm run --silent gen:types:ts
echo "Wrote frontend-thread/src/types/openapi.json and frontend-thread/src/types/api.d.ts"
