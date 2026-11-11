# Bloomwell Home Care Uganda - Thread frontend

This is the Thread redesign of the public website. It is an isolated application in `frontend-thread/` and runs beside the existing `frontend/`. Both frontends use the same backend API. The existing frontend, backend, admin, nurse app, database and agreement workflows are not replaced by this project.

The consolidated T1-T14 source implementation is present. The browser/build release gates have not been signed off in this environment because npm dependency installation could not complete; see [`../docs/THREAD_T1-T14_IMPLEMENTATION_REPORT.md`](../docs/THREAD_T1-T14_IMPLEMENTATION_REPORT.md) for exact validation status.

## Requirements and local setup

Use Node.js `22.22.2` or newer and npm. The minimum is pinned in `package.json` and CI.

```sh
cp .env.example .env.local
npm ci
npm run dev
```

Thread runs at `http://localhost:5174`. The existing frontend runs at `http://localhost:5173`.

## Important deployment note

The normal Thread build is indexable by default. For a separate review/comparison deployment, set `VITE_NOINDEX=true` and use `vercel.review.json` to add `X-Robots-Tag: noindex, nofollow`. Do not use the review configuration for production. Follow [`../docs/THREAD_REDESIGN.md`](../docs/THREAD_REDESIGN.md) for environment setup, testing, comparison and rollback.
