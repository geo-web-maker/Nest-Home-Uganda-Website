# Same-origin API on Cloudflare (bhcug.com/api/*)

Why: when the site called the backend on a second hostname (for example onrender.com), some clients'
networks, DNS or blockers dropped that call and saw the N1 screen, while the page itself loaded.
Now the browser only talks to `bhcug.com`. A Worker (`frontend/worker/index.js`) forwards `/api/*`.

## Deploy
1. `frontend/wrangler.jsonc`: set `vars.BACKEND_URL` to the backend base including its mount prefix,
   for example `https://YOUR-MULTI-HOST-DOMAIN/nest` (no trailing slash).
2. Build variable `VITE_API_URL` must be EMPTY (set it to nothing, or delete it). Rebuild the frontend.
3. Deploy with `wrangler deploy` (or your Cloudflare Git build). Make sure bhcug.com is attached to this Worker as a custom domain.
4. Cloudflare dashboard: cache rule "Bypass cache" for `/api/*`, `/a/*`, `/agreement/*`; purge cache once.
5. If a WAF or bot rule is active, do not challenge `/api/*` (a challenge cannot be solved by an API call).

## What the Worker does
- Forwards method, headers and body; passes the real client IP in `cf-connecting-ip` / `x-forwarded-for` so rate limits stay per client.
- Retries GET/HEAD up to 3 times when the backend is asleep or restarting. POST is never retried.
- If the backend cannot be reached it answers a JSON 503 (`upstream_unreachable`), so the client sees
  "Something went wrong on our side" (N3), not a misleading connection message.
- Removes the backend's mount prefix and Domain from `Set-Cookie`, so login and agreement session cookies work on bhcug.com.
- Marks every API response `Cache-Control: no-store`.

## Backend settings
CORS is no longer needed for the website (same origin). Cookies can stay `Secure`; `SameSite=Lax` is enough.

## Check
Open `https://bhcug.com/api/v1/health` (or any public API path). It should answer from the backend.
