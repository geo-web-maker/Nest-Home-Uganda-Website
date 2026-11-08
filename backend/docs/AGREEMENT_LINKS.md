# Agreement public links

## How a link works now
* Each agreement has ONE stable link, for example `https://bhcug.com/a/7KQM-3XPD-9F2R-WT4H`.
* The code is derived from the agreement and a generation number. Sending, resending, reminders
  and staff edits all use the same link, so a newer message can never break an older one.
* Case, hyphens, spaces and look-alike letters (O/0, I/L/1) do not matter. The last character is a checksum, so a
  truncated or mistyped link is recognised without a database lookup.
* Links already in inboxes (long `/agreement/<43 characters>` form) keep working until the agreement closes.
* Staff: Admin > Agreements > Send tab > **Client link** > **Copy link** gives the link for WhatsApp without sending.
  **Withdraw all links and create a new one** is the only action that stops older links.

## Support reference on the client screen
Format: `CODE-LINKID-WEB.API`, for example `L3-9F2A1C-k3j2.7c3d`.

| Code | Meaning |
|---|---|
| L1 | Not a link (wrong characters or far too short) |
| L2 | Looks like a Bloomwell link but a character is missing or wrong (checksum failed) |
| L3 | Well formed, but no agreement has this link (never issued, or another environment) |
| L4 | Replaced (kept for completeness) |
| L5 | Expired |
| L6 | Already signed |
| L7 | Withdrawn by staff, or agreement voided |
| L8 | Agreement not open for signing (draft, or changes requested) |
| N1 | Browser could not reach the server |
| N2 | Rate limited (too many requests from that device) |
| N3 | Server error (the second part is the request id) |
| N4 | Reply was not understood (usually a stale cached page, or a proxy page) |
| N5 | Server answered 404 with no link reason (an old backend, or the wrong host) |

* **LINKID** is a fingerprint of the link. It matches the Link ID shown in admin. Two devices showing different IDs
  opened different links. The same ID with different results points at cache or a different backend.
* **WEB** is the build id of the page the visitor loaded; **API** is the first 7 characters of the server release.
  If WEB differs between two computers, one is showing a cached copy.

## Copy/paste repair
* Spaces, line breaks, `%20`, zero-width characters, wrapping `< >` and a pasted full URL are cleaned before checking.
* A new-style link that is off by ONE character (one wrong, missing or extra) connects automatically when it is
  within one character of exactly one open agreement. More than one candidate, or two or more errors, is not repaired
  (it shows L2/L3). The client still has to pass the verification code. Repaired opens are returned with `corrected: true`.
* 16 characters means one wrong character is 93.75% similar, so "95%" is applied as "at most one character different".
  Older 43-character links are never fuzzy-matched (only a hash is stored).

## Cloudflare
`public/_headers` sets `Cache-Control: no-store` on `/a/*` and `/agreement/*`. If you use Cloudflare cache rules, bypass
cache for `/a/*`, `/agreement/*` and `/api/*`.
