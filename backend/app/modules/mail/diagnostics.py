"""Setup checks for the mail module: what is configured, what actually works, and what still needs doing.

Passive checks never send mail. The two self-tests (internal loopback and inbound) create one clearly labelled message
in the administrator's own mailbox so the real delivery paths are exercised end to end.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
import uuid
from dataclasses import asdict, dataclass
from email.message import EmailMessage
from typing import Any, Awaitable, Callable

import httpx

PASS, WARN, FAIL, SKIP = "pass", "warn", "fail", "skip"
DOMAIN = re.compile(r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")

# Selectors the supported providers publish DKIM under. Anything else is reported as skipped, never as a failure.
DKIM_SELECTORS = {"resend": ["resend._domainkey"], "brevo": ["brevo1._domainkey", "brevo2._domainkey"]}

DnsLookup = Callable[[str, str], Awaitable["list[str] | None"]]


@dataclass(frozen=True)
class Check:
    id: str
    status: str
    detail: str

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


def summarize(checks: list[Check]) -> dict[str, int]:
    return {state: sum(1 for check in checks if check.status == state) for state in (PASS, WARN, FAIL, SKIP)}


def check_settings(values: dict[str, Any]) -> list[Check]:
    """Everything that can be judged from saved settings alone."""
    out: list[Check] = []
    enabled = bool(values.get("mail.enabled"))
    out.append(Check("enabled", PASS if enabled else FAIL, "Mail is switched on." if enabled else "Mail is switched off. Turn on Mail enabled."))

    domain = str(values.get("mail.domain") or "").strip().lower()
    if not domain:
        out.append(Check("domain", FAIL, "No mail domain is set."))
    elif not DOMAIN.match(domain):
        out.append(Check("domain", FAIL, f"{domain} does not look like a domain name."))
    else:
        out.append(Check("domain", PASS, f"Addresses use @{domain}."))

    provider = str(values.get("mail.provider") or "console").lower()
    has_key = bool(str(values.get("mail.provider_api_key") or "").strip())
    if provider == "console":
        out.append(Check("provider", WARN, "The console provider records messages but sends nothing outside Nest. Choose a real provider to send externally."))
    elif has_key:
        out.append(Check("provider", PASS, f"{provider} is selected and an API key is saved."))
    else:
        out.append(Check("provider", FAIL, f"{provider} is selected but no API key is saved."))

    if values.get("mail.suspend_all_sending"):
        out.append(Check("suspended", FAIL, "All sending is suspended. Turn off Suspend all sending."))
    else:
        out.append(Check("suspended", PASS, "Sending is not suspended."))

    external = bool(values.get("mail.external_enabled"))
    out.append(Check("external", PASS if external else WARN, "Sending to outside addresses is on." if external else "Sending to outside addresses is off, so people can only write to each other inside Nest."))

    if values.get("mail.inbound_enabled"):
        has_secret = bool(str(values.get("mail.inbound_webhook_secret") or "").strip())
        out.append(Check("inbound", PASS if has_secret else FAIL, "Inbound mail is on and its secret is saved." if has_secret else "Inbound mail is on but its secret is missing, so every incoming message will be refused."))
    else:
        out.append(Check("inbound", SKIP, "Inbound mail is off."))

    if provider == "console":
        out.append(Check("webhook", SKIP, "No provider is selected."))
    else:
        has_hook = bool(str(values.get("mail.provider_webhook_secret") or "").strip())
        out.append(Check("webhook", PASS if has_hook else WARN, "Bounce and delivery reports can be verified." if has_hook else "No webhook secret is saved, so bounces and complaints from the provider cannot be verified or recorded."))
    return out


async def check_database(conn: Any) -> list[Check]:
    out: list[Check] = []
    try:
        await conn.fetchval("SELECT 1")
        out.append(Check("database", PASS, "The mail database answers."))
    except Exception:
        return [Check("database", FAIL, "The mail database cannot be reached.")]
    count = int(await conn.fetchval("SELECT count(*) FROM mailbox") or 0)
    out.append(Check("mailboxes", PASS if count else WARN, f"{count} mailbox(es) exist." if count else "No mailboxes exist yet. Run the mailbox backfill."))
    system = await conn.fetchval("SELECT 1 FROM mailbox WHERE local_part='no-reply'")
    out.append(Check("systemMailbox", PASS if system else WARN, "The no-reply system mailbox exists." if system else "The no-reply system mailbox is missing, so invitations and password resets will not go through mail."))
    return out


async def check_storage(storage: Any, bucket: Any) -> Check:
    key = f"mail/diagnostics/{uuid.uuid4()}.txt"
    payload = b"nest mail storage check"
    try:
        await storage.put(bucket, key, payload, "text/plain")
        if await storage.get(bucket, key) != payload:
            return Check("storage", FAIL, "The file store returned different data than was written.")
        return Check("storage", PASS, "Files can be written, read and deleted.")
    except Exception:
        return Check("storage", FAIL, "The file store could not be written or read. Check the storage settings.")
    finally:
        try:
            await storage.delete(bucket, key)
        except Exception:
            pass


async def check_queue(conn: Any) -> Check:
    rows = await conn.fetch("SELECT state,count(*) n FROM outbox GROUP BY state")
    counts = {row["state"]: int(row["n"]) for row in rows}
    failed = counts.get("failed", 0)
    stuck = int(await conn.fetchval("SELECT count(*) FROM outbox WHERE state IN ('queued','deferred') AND next_attempt_at < now() - interval '10 minutes'") or 0)
    if failed:
        last = await conn.fetchval("SELECT last_error FROM outbox WHERE state='failed' AND last_error IS NOT NULL ORDER BY next_attempt_at DESC NULLS LAST LIMIT 1")
        return Check("queue", WARN, f"{failed} message(s) failed to send. Last error: {str(last or 'unknown')[:120]}")
    if stuck:
        return Check("queue", WARN, f"{stuck} message(s) have waited more than 10 minutes. The queue is processed while people use mail, so check that a scheduler is calling it.")
    return Check("queue", PASS, f"Nothing is waiting or failing ({counts.get('queued', 0)} queued).")


async def doh_lookup(name: str, record: str) -> list[str] | None:
    """Looks a DNS record up over HTTPS. None means the lookup itself could not be made."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get("https://cloudflare-dns.com/dns-query", params={"name": name, "type": record}, headers={"accept": "application/dns-json"})
        if not response.is_success:
            return None
        return [str(answer.get("data", "")).strip('"') for answer in response.json().get("Answer", [])]
    except Exception:
        return None


async def check_dns(domain: str, provider: str, lookup: DnsLookup = doh_lookup) -> list[Check]:
    """Advisory only: DNS can lag behind a change, so a missing record is a warning, never a failure."""
    if not DOMAIN.match(domain or ""):
        return [Check(id, SKIP, "Set a valid mail domain first.") for id in ("dnsMx", "dnsSpf", "dnsDmarc", "dnsDkim")]
    out: list[Check] = []

    async def record(id: str, name: str, kind: str, test: Callable[[str], bool], found: str, missing: str) -> None:
        answers = await lookup(name, kind)
        if answers is None:
            out.append(Check(id, SKIP, "DNS could not be checked from the server."))
        elif any(test(answer) for answer in answers):
            out.append(Check(id, PASS, found))
        else:
            out.append(Check(id, WARN, missing))

    await record("dnsMx", domain, "MX", bool, "Incoming mail has a destination (MX record found).", "No MX record, so outside senders cannot deliver to this domain.")
    await record("dnsSpf", domain, "TXT", lambda text: text.lower().startswith("v=spf1"), "An SPF record is published.", "No SPF record. Add one that includes your provider, or messages are likelier to land in spam.")
    await record("dnsDmarc", f"_dmarc.{domain}", "TXT", lambda text: text.upper().startswith("V=DMARC1"), "A DMARC record is published.", "No DMARC record. Publish one to protect the domain from impersonation.")
    selectors = DKIM_SELECTORS.get(provider)
    if not selectors:
        out.append(Check("dnsDkim", SKIP, "Choose Resend or Brevo to check DKIM."))
    else:
        reachable = False
        found = False
        for selector in selectors:
            answers = await lookup(f"{selector}.{domain}", "TXT")
            cname = await lookup(f"{selector}.{domain}", "CNAME") if not answers else None
            reachable = reachable or answers is not None or cname is not None
            if answers or cname:
                found = True
                break
        if found:
            out.append(Check("dnsDkim", PASS, f"A DKIM record is published for {provider}."))
        elif not reachable:
            out.append(Check("dnsDkim", SKIP, "DNS could not be checked from the server."))
        else:
            out.append(Check("dnsDkim", WARN, f"No DKIM record found for {provider}. Add the records the provider shows for this domain."))
    return out


async def run_passive_checks(values: dict[str, Any], pool: Any, storage: Any, bucket: Any, lookup: DnsLookup = doh_lookup) -> list[Check]:
    checks = check_settings(values)
    async with pool.acquire() as conn:
        checks.extend(await check_database(conn))
        if any(check.id == "database" and check.status == PASS for check in checks):
            checks.append(await check_queue(conn))
    checks.append(await check_storage(storage, bucket))
    checks.extend(await check_dns(str(values.get("mail.domain") or "").strip().lower(), str(values.get("mail.provider") or "console").lower(), lookup))
    return checks


async def _inbox_has(pool: Any, mailbox_id: str, marker: str) -> bool:
    async with pool.acquire() as conn:
        found = await conn.fetchval(
            "SELECT 1 FROM mailbox_message mm JOIN message m ON m.id=mm.message_id WHERE mm.mailbox_id=$1 AND mm.folder='inbox' AND m.subject=$2 LIMIT 1",
            mailbox_id,
            marker,
        )
    return bool(found)


async def loopback(user_id: str, mailbox: dict[str, Any], pool: Any, core: Any) -> Check:
    """Sends from the administrator's mailbox to itself through the normal draft and send path, then looks for it."""
    marker = f"Setup check {time.strftime('%Y-%m-%d %H:%M:%S')}"
    try:
        draft = await core.create_draft(user_id, str(mailbox["id"]), {"to": [mailbox["address"]], "subject": marker, "body_text": "This message was created by the mail setup check. You can delete it."})
        await core.send_draft(user_id, draft["id"], str(mailbox["id"]))
    except Exception as error:
        return Check("loopback", FAIL, f"Sending inside Nest failed: {str(error)[:140] or type(error).__name__}")
    if await _inbox_has(pool, str(mailbox["id"]), marker):
        return Check("loopback", PASS, f'Sending inside Nest works. "{marker}" arrived in {mailbox["address"]}.')
    return Check("loopback", FAIL, "The message was sent but did not arrive in the inbox.")


def sign_inbound(secret: str, timestamp: str, payload: dict[str, Any]) -> str:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    return hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()


async def inbound_selftest(mailbox: dict[str, Any], domain: str, secret: str, pool: Any, storage: Any, bucket: Any, ingest: Callable[..., Awaitable[Any]]) -> Check:
    """Feeds a signed message through the same ingest function the email worker calls."""
    if not secret:
        return Check("inboundTest", FAIL, "The inbound secret is not saved, so the email worker would be refused.")
    marker = f"Inbound check {time.strftime('%Y-%m-%d %H:%M:%S')}"
    message = EmailMessage()
    message["From"] = f"setup-check@{domain}"
    message["To"] = mailbox["address"]
    message["Subject"] = marker
    message["Message-ID"] = f"<setup-{uuid.uuid4()}@{domain}>"
    message.set_content("This message was created by the mail setup check. You can delete it.")
    key = f"mail/inbound/selftest-{uuid.uuid4()}.eml"
    payload = {"object_key": key, "envelope_to": [str(mailbox["address"]).lower()], "auth_results": {}}
    timestamp = str(int(time.time()))
    try:
        await storage.put(bucket, key, message.as_bytes(), "message/rfc822")
        await ingest(payload, timestamp, sign_inbound(secret, timestamp, payload))
    except PermissionError as error:
        return Check("inboundTest", FAIL, f"Inbound mail was refused: {error}")
    except Exception as error:
        return Check("inboundTest", FAIL, f"Inbound mail could not be processed: {str(error)[:140] or type(error).__name__}")
    if await _inbox_has(pool, str(mailbox["id"]), marker):
        return Check("inboundTest", PASS, f'Inbound mail works. "{marker}" arrived in {mailbox["address"]}.')
    return Check("inboundTest", FAIL, "The message was accepted but did not reach the inbox.")
