"""Trace for incoming mail: every hop from the sending server to the recipient's inbox, plus a log of real attempts.

Hops: sender -> MX (Cloudflare Email Routing) -> Email Worker -> R2 -> signed POST to this backend -> ingest -> mailbox.
Cloudflare and the worker cannot be inspected from here, so the trace (a) checks everything on this side, (b) replays a
signed message over HTTP against this server's own public URL, and (c) shows what the worker really sent (inbound_log).
Secrets are shown only as a short fingerprint; compare it with the worker's MAIL_INBOUND_SECRET.
Serve only to a superadmin with a verified authenticator code.
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from email.message import EmailMessage
from typing import Any, Awaitable, Callable

import httpx

TRACE_AGENT = "nest-inbound-trace"
LOG_KEEP = 500
Getter = Callable[[str], Awaitable[Any]]


def fingerprint(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()[:8] if secret else "(none)"


async def record(pool: Any, **row: Any) -> None:
    """Never raises: logging must not break delivery."""
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO inbound_log(outcome,reason,http_status,envelope_to,routing,object_key,size_bytes,folder,message_id,remote_ip,user_agent,skew_seconds,ms) "
                "VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13)",
                row.get("outcome"), row.get("reason"), row.get("http_status"), row.get("envelope_to"),
                json.dumps(row.get("routing")) if row.get("routing") is not None else None,
                row.get("object_key"), row.get("size_bytes"), row.get("folder"), row.get("message_id"),
                row.get("remote_ip"), (row.get("user_agent") or "")[:200], row.get("skew_seconds"), row.get("ms"),
            )
            await conn.execute("DELETE FROM inbound_log WHERE id <= (SELECT max(id) FROM inbound_log) - $1", LOG_KEEP)
    except Exception:
        pass


async def recent(pool: Any, limit: int = 20) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT at,outcome,reason,http_status,envelope_to,routing,object_key,size_bytes,folder,remote_ip,user_agent,skew_seconds,ms "
            "FROM inbound_log ORDER BY id DESC LIMIT $1", limit)
    out = []
    for r in rows:
        d = dict(r)
        d["at"] = d["at"].isoformat()
        if isinstance(d.get("routing"), str):
            d["routing"] = json.loads(d["routing"])
        out.append(d)
    return out


class _Steps:
    def __init__(self) -> None:
        self.steps: list[dict[str, Any]] = []

    def add(self, step: str, ok: bool | None, detail: str, started: float | None = None, **extra: Any) -> None:
        item: dict[str, Any] = {"step": step, "ok": ok, "detail": detail, **extra}
        if started is not None:
            item["ms"] = int((time.monotonic() - started) * 1000)
        self.steps.append(item)


async def route_for(pool: Any, address: str, domain: str, accepted: list[str]) -> dict[str, Any]:
    """Explains where ingest would put a message addressed to ``address``."""
    local, sep, host = address.lower().partition("@")
    if not sep:
        return {"address": address, "status": "invalid_address"}
    if host not in {domain, *[str(a).lower() for a in accepted]}:
        return {"address": address, "status": "foreign_domain", "domain": host}
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id,state,'mailbox' AS via FROM mailbox WHERE local_part=$1 UNION ALL "
            "SELECT t.id,t.state,'alias' FROM mailbox_alias a JOIN mailbox t ON t.id=a.mailbox_id WHERE a.local_part=$1 LIMIT 1", local)
    if not row:
        return {"address": address, "status": "no_mailbox"}
    return {"address": address, "status": "delivered" if row["state"] == "open" else "mailbox_closed", "via": row["via"], "mailbox_state": row["state"]}


async def run_trace(
    get: Getter, *, pool: Any, storage: Any, bucket: Any, ingest_url: str, ingest: Callable[..., Awaitable[Any]],
    address: str | None, dns_lookup: Callable[[str, str], Awaitable["list[str] | None"]],
    http_client_factory: Callable[[], httpx.AsyncClient] | None = None,
) -> dict[str, Any]:
    from app.modules.mail.diagnostics import sign_inbound

    t = _Steps()
    notes: list[str] = []
    started = time.monotonic()
    try:
        enabled = bool(await get("mail.enabled")); inbound = bool(await get("mail.inbound_enabled"))
        domain = str(await get("mail.domain") or "").strip().lower(); secret = str(await get("mail.inbound_webhook_secret") or "")
        accepted = list(await get("mail.accepted_domains") or [])
    except Exception as exc:
        t.add("read_settings", False, f"{type(exc).__name__}: {exc}", started)
        return {"steps": t.steps, "notes": ["A saved setting could not be read. If it is the inbound secret, save it again."], "attempts": []}
    t.add("settings", enabled and inbound and bool(secret) and bool(domain),
          f"mail.enabled={enabled}, inbound_enabled={inbound}, domain={domain or '(none)'}, accepted_domains={accepted}. Secret fingerprint {fingerprint(secret)} (length {len(secret)}): the Worker's MAIL_INBOUND_SECRET must hash to the same first 8 characters of its SHA-256.",
          started, secret_fingerprint=fingerprint(secret))

    started = time.monotonic()
    mx = await dns_lookup(domain, "MX") if domain else None
    if mx is None:
        t.add("dns_mx", None, "DNS could not be checked from the server.", started)
    else:
        cf = any("mx.cloudflare.net" in m.lower() for m in mx)
        t.add("dns_mx", cf, f"MX records: {mx or 'none'}. " + ("Points at Cloudflare Email Routing." if cf else "Not pointing at *.mx.cloudflare.net, so outside mail never reaches the Email Worker."), started, records=mx)

    started = time.monotonic()
    key = f"mail/inbound/trace-{uuid.uuid4()}.eml"
    try:
        await storage.put(bucket, key, b"nest inbound trace", "message/rfc822")
        same = await storage.get(bucket, key) == b"nest inbound trace"
        t.add("storage", same, "The mail bucket the backend reads from can be written and read. The Worker's MAIL_RAW binding must point at this same bucket." if same else "The bucket returned different data.", started)
    except Exception as exc:
        t.add("storage", False, f"{type(exc).__name__}: {str(exc)[:200]}", started)
    finally:
        try:
            await storage.delete(bucket, key)
        except Exception:
            pass

    target = (address or "").strip().lower()
    started = time.monotonic()
    if target:
        route = await route_for(pool, target, domain, accepted)
        t.add("recipient_routing", route["status"] == "delivered", f"{target}: {route['status']}" + (" (alias)" if route.get("via") == "alias" else ""), started, **route)
    else:
        t.add("recipient_routing", None, "No address given. Enter the address that is not receiving mail to check its mailbox.", started)

    t.add("ingest_url", None, f"This server's inbound endpoint is {ingest_url}. The Worker's MAIL_INBOUND_URL must be exactly this.", url=ingest_url)

    probe_to = target or domain and f"setup-check@{domain}"
    started = time.monotonic()
    if not secret or not probe_to:
        t.add("signed_replay", False, "Skipped: no inbound secret or recipient to test with.", started)
    else:
        marker = f"Inbound trace {time.strftime('%Y-%m-%d %H:%M:%S')}"
        msg = EmailMessage()
        msg["From"] = f"trace@{domain}"; msg["To"] = probe_to; msg["Subject"] = marker
        msg["Message-ID"] = f"<trace-{uuid.uuid4()}@{domain}>"
        msg.set_content("Created by the inbound trace. You can delete it.")
        okey = f"mail/inbound/trace-{uuid.uuid4()}.eml"
        payload = {"object_key": okey, "envelope_to": [probe_to], "auth_results": {}}
        ts = str(int(time.time()))
        try:
            await storage.put(bucket, okey, msg.as_bytes(), "message/rfc822")
            async with (http_client_factory() if http_client_factory else httpx.AsyncClient(timeout=20, follow_redirects=False)) as client:
                resp = await client.post(ingest_url, content=json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
                                         headers={"content-type": "application/json", "x-nest-timestamp": ts, "x-nest-signature": sign_inbound(secret, ts, payload), "user-agent": TRACE_AGENT})
            body = resp.text[:300]
            t.add("signed_replay", resp.is_success, f"POST {ingest_url} answered HTTP {resp.status_code}: {body}", started, http_status=resp.status_code)
            if not resp.is_success:
                notes.append("The replay over HTTP failed, so the Worker's real requests will fail the same way. 401 means a setting or secret problem; 404/405 means the URL is wrong or the path is not mounted; 5xx means ingest crashed (see the attempts below for the reason).")
        except Exception as exc:
            t.add("signed_replay", False, f"{type(exc).__name__}: {str(exc)[:200]}", started)
            notes.append("This server could not reach its own public URL. If the URL above is wrong (http vs https, missing mount prefix), the Worker's URL is probably wrong in the same way.")

    try:
        attempts = await recent(pool, 20)
    except Exception as exc:
        attempts = []
        t.add("inbound_log", False, f"The inbound log could not be read ({type(exc).__name__}: {str(exc)[:160]}). Redeploy the hoster so migration 0007_inbound_log.sql runs.")
    real = [a for a in attempts if not str(a.get("user_agent") or "").startswith(TRACE_AGENT)]
    started = time.monotonic()
    if not real:
        t.add("worker_traffic", False, "No request from the Email Worker has ever reached this backend. The problem is before the backend: MX, the Email Routing rule/destination, the Worker deploy, or MAIL_INBOUND_URL.", started)
        notes.append("In Cloudflare: Email > Email Routing > Routing rules must send the address (or catch-all) to the Worker; then open the Worker's Logs while sending a test mail.")
    else:
        last = real[0]
        ok = last["outcome"] in ("delivered", "duplicate")
        t.add("worker_traffic", ok, f"Last real request {last['at']}: {last['outcome']}" + (f" ({last['reason']})" if last.get("reason") else "") + f". {len(real)} real request(s) in the log.", started, last=last)
        if last["outcome"] == "orphaned":
            notes.append("The message reached the backend but matched no open mailbox, so it was stored without an inbox. See 'routing' in the attempts below.")
    return {"steps": t.steps, "notes": notes, "attempts": attempts}
