# Nest Home Care Uganda

Monorepo: `frontend/` (React 18 + Vite + TypeScript), `backend/` (FastAPI + Beanie on PyMongo async + MongoDB), `docs/` (spec, instructions, state ledger), `reference/` (HTML previews).

Start here: `docs/STATE.md` (what is done, what is next) and `docs/BUILDER_INSTRUCTIONS.md` (rules, pinned versions, scope model, SMS).

## First time
```
bash scripts/preflight.sh                # environment check
cp .env.example .env                     # fill in locally, never commit
docker compose -f docker-compose.dev.yml up -d   # MongoDB replica set + MinIO
cd frontend && npm ci
cd ../backend && python3 -m venv .venv && . .venv/bin/activate \
  && pip install -r requirements.lock && pip install -e . --no-deps
```

## Everyday commands
| What | Command (from the folder shown) |
| --- | --- |
| Frontend dev server | `frontend`: `npm run dev` |
| Frontend checks | `frontend`: `npm run lint && npm run typecheck && npm run test && npm run build` |
| Backend dev server | `backend`: `uvicorn app.main:app --reload` |
| Backend checks | `backend`: `ruff check . && ruff format --check . && pytest -q` |
| Create indexes (run on each release) | `backend`: `python -m app.migrate` |
| Seed first superadmin and the 8 services | `backend`: `python -m app.seed` (needs `FIRST_SUPERADMIN_*` in `.env`) |
| Backend tests that need MongoDB | set `TEST_MONGODB_URI` first, then `pytest -q -rs` (without it they are skipped) |
| Orientation for a new session | `bash scripts/orient.sh` |

## Rules in one line
Exact pinned versions only (no `^`, no updates), no roles (scopes only), no Motor, no secrets in git, one commit per job.
