#!/usr/bin/env bash
# Exports the OpenAPI JSON from the backend app, then generates TypeScript types from it.
# Run from anywhere: bash scripts/gen-types.sh   Commit the two generated files.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
py="$root/backend/.venv/bin/python"
[ -x "$py" ] || py="$(command -v python3)"

cd "$root/backend"
APP_ENV=development "$py" - <<'PY' > "$root/frontend/src/types/openapi.json"
import json
from app.main import app

print(json.dumps(app.openapi(), indent=2, sort_keys=True))
PY

cd "$root/frontend"
npm run --silent gen:types:ts
echo "Wrote src/types/openapi.json and src/types/api.d.ts"
