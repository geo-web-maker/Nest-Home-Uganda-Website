# ruff: noqa: E501,E701,E702
"""HTTP-only Resend/Brevo adapters. Console remains the safe default."""
from dataclasses import dataclass
import httpx
import logging
from app.modules.mail.settings_service import get_value

@dataclass(frozen=True)
class MailSendResult:
    ok: bool
    provider_message_id: str | None = None
    retryable: bool = False
    error: str | None = None

log = logging.getLogger("app.mail.provider")

class MailProvider:
    name = "console"
    async def send(self, to, subject, html, text, *, from_address=None, from_name=None, reply_to=None, headers=None, attachments=None, idempotency_key=None):
        log.info("EMAIL (console) to=%d recipient(s) subject=%r",len(to),subject)
        return MailSendResult(True, "console")

class ResendProvider(MailProvider):
    name = "resend"
    async def send(self, to, subject, html, text, *, from_address=None, from_name=None, reply_to=None, headers=None, attachments=None, idempotency_key=None):
        key = await get_value("mail.provider_api_key")
        payload = {"from": f"{from_name or 'Nest Home Care'} <{from_address}>", "to": to, "subject": subject, "html": html or "", "text": text or ""}
        if reply_to: payload["reply_to"] = reply_to
        if headers: payload["headers"] = headers
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post("https://api.resend.com/emails", json=payload, headers={"Authorization": f"Bearer {key}", "Idempotency-Key": idempotency_key or ""})
            if response.is_success: return MailSendResult(True, response.json().get("id"))
            return MailSendResult(False, retryable=response.status_code == 429 or response.status_code >= 500, error=f"HTTP {response.status_code}")
        except httpx.HTTPError as exc: return MailSendResult(False, retryable=True, error=type(exc).__name__)

class BrevoProvider(MailProvider):
    name = "brevo"
    async def send(self, to, subject, html, text, *, from_address=None, from_name=None, reply_to=None, headers=None, attachments=None, idempotency_key=None):
        key = await get_value("mail.provider_api_key")
        payload = {"sender": {"name": from_name or "Nest Home Care", "email": from_address}, "to": [{"email": x} for x in to], "subject": subject, "htmlContent": html or "", "textContent": text or ""}
        if reply_to: payload["replyTo"] = {"email": reply_to}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post("https://api.brevo.com/v3/smtp/email", json=payload, headers={"api-key": key, "Idempotency-Key": idempotency_key or ""})
            if response.is_success: return MailSendResult(True, response.json().get("messageId"))
            return MailSendResult(False, retryable=response.status_code == 429 or response.status_code >= 500, error=f"HTTP {response.status_code}")
        except httpx.HTTPError as exc: return MailSendResult(False, retryable=True, error=type(exc).__name__)

async def get_provider():
    choice = str(await get_value("mail.provider") or "console").lower()
    return ResendProvider() if choice == "resend" else BrevoProvider() if choice == "brevo" else MailProvider()

class SystemMailOutboxAdapter(MailProvider):
    """Compatibility adapter for legacy invite/reset/alert callers; falls back to console."""
    name = "mail-outbox"
    async def send(self, to, subject, html, text, *, from_address=None, from_name=None, reply_to=None, headers=None, attachments=None, idempotency_key=None):
        from app.modules.mail import db
        from app.modules.mail.settings_service import get_value
        try:
            if not bool(await get_value('mail.enabled')):
                return await MailProvider().send(to,subject,html,text)
            domain=str(await get_value('mail.domain') or '').lower()
            if not domain: return await MailProvider().send(to,subject,html,text)
            pool=db.get_pool()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    box=await conn.fetchrow("SELECT id FROM mailbox WHERE local_part='no-reply'")
                    if not box:
                        box=await conn.fetchrow("INSERT INTO mailbox(local_part,kind,display_name) VALUES('no-reply','shared','Nest Home Care') RETURNING id")
                    mid=await conn.fetchval("INSERT INTO message(from_address,from_name,subject,body_text,body_html,origin) VALUES($1,$2,$3,$4,$5,'outbound') RETURNING id",f"no-reply@{domain}",from_name or await get_value('mail.from_name'),subject,text,html)
                    for address in to:
                        await conn.execute("INSERT INTO message_recipient(message_id,kind,address) VALUES($1,'to',$2) ON CONFLICT DO NOTHING",mid,address.lower())
                    await conn.execute("INSERT INTO outbox(message_id,from_mailbox_id,to_addresses,priority,idempotency_key) VALUES($1,$2,$3,1,$4)",mid,box['id'],to,idempotency_key or f"system:{mid}")
            return MailSendResult(True,"queued")
        except Exception:
            # Account creation/reset must not be blocked by an optional mail service outage.
            return await MailProvider().send(to,subject,html,text)
