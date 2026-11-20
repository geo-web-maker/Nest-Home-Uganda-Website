# Client control (mail routes that can reach Neon)

Why: a stray app (an old tab, installed web app or APK) that calls the mailbox list about once a minute keeps the Neon compute awake. The guard shows who calls and lets the administrator slow, force-update or pause them without a redeploy.

Guarded routes: `GET /api/v1/mail/mailboxes` and `GET /api/v1/mail/unread`. The guard reads MongoDB and memory only, so it never wakes Neon, and it fails open if MongoDB cannot be read.

Clients send `X-Client-Build: <whole number>` on signed-in requests. A missing or malformed header means an unversioned (oldest) client.

| Rule (admin: Setup > Client control) | Effect |
|---|---|
| Older apps may refresh mail at most once every N seconds (default 300, 0 = off) | A second call inside N seconds gets 429 with `Retry-After`. Current builds are never limited. |
| Lowest build allowed | Lower builds (and unversioned ones) get 426 `upgrade_required`. 0 = allow all. |
| Refuse apps that send no build number | Unversioned clients get 426. Turn on only after the new admin and nurse apps are live. |
| Pause a person | That person gets 403 `client_blocked` on these two routes only. Everything else keeps working. |

Who is calling: the table on the same screen (`GET /mail/admin/client-traffic`) lists each distinct caller (person, route, build, user agent, hashed IP), how often, the gap between its last two calls and the last answer. A caller with no build and a short gap is the stray. It lives in memory, so it resets on every restart, and raw IPs are never stored. Each caller is also written to the log at most once every 10 minutes.

Changing the rules needs `mail:settings:manage` and the authenticator code. Reading needs `mail:settings:manage` only. Changes apply within 30 seconds.

Clients: the admin app reloads once per session on 426 (it clears its service worker and caches first). The nurse Android app cannot update itself, so its App Center shows an update notice and the nurse installs the new APK. Both App Centers show the client build.
