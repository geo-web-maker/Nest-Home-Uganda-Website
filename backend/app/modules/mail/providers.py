"""Provider-neutral adapters for external mail delivery.

The legacy ``send`` interface is retained for system notifications. Mailbox
messages use ``send_message`` so recipient kinds and attachments cannot be
flattened accidentally.
"""

from __future__ import annotations

import base64
import html
import logging
import re
import unicodedata
from dataclasses import dataclass, field

import httpx

from app.modules.mail.settings_service import get_value

log = logging.getLogger("app.mail.provider")


@dataclass(frozen=True)
class MailSendResult:
    ok: bool
    provider_message_id: str | None = None
    retryable: bool = False
    error: str | None = None


@dataclass(frozen=True)
class OutboundAttachment:
    filename: str
    content_type: str
    data: bytes
    content_id: str | None = None
    disposition: str = "attachment"


@dataclass(frozen=True)
class OutboundMessage:
    from_address: str
    from_name: str | None
    to: list[str]
    cc: list[str]
    bcc: list[str]
    subject: str
    html: str | None
    text: str
    reply_to: str | None = None
    headers: dict[str, str] = field(default_factory=dict)
    attachments: list[OutboundAttachment] = field(default_factory=list)
    idempotency_key: str | None = None
    rfc822: bytes | None = None
    message_id: str | None = None


class MailProvider:
    name = "console"
    supports_inline_cid = False
    supports_threading_headers = False
    max_message_bytes: int | None = None

    async def send_message(self, message: OutboundMessage) -> MailSendResult:
        recipient_count = len(message.to) + len(message.cc) + len(message.bcc)
        log.info(
            "EMAIL (console) recipients=%d attachments=%d",
            recipient_count,
            len(message.attachments),
        )
        return MailSendResult(True, "console")

    async def send(
        self,
        to,
        subject,
        html,
        text,
        *,
        from_address=None,
        from_name=None,
        reply_to=None,
        headers=None,
        attachments=None,
        idempotency_key=None,
    ):
        """Compatibility wrapper used by invite, reset and other system mail."""
        message_attachments = [
            item if isinstance(item, OutboundAttachment) else OutboundAttachment(**item)
            for item in (attachments or [])
        ]
        return await self.send_message(
            OutboundMessage(
                from_address=str(from_address or ""),
                from_name=from_name,
                to=list(to or []),
                cc=[],
                bcc=[],
                subject=str(subject or ""),
                html=html,
                text=str(text or ""),
                reply_to=reply_to,
                headers=dict(headers or {}),
                attachments=message_attachments,
                idempotency_key=idempotency_key,
            )
        )


class ResendProvider(MailProvider):
    name = "resend"
    # Resend's documented JSON attachment schema has filename/content only; it
    # does not document a Content-ID field. Keep inline images as attachments.
    supports_inline_cid = False
    supports_threading_headers = True
    max_message_bytes = 40 * 1024 * 1024

    async def send_message(self, message: OutboundMessage) -> MailSendResult:
        key = await get_value("mail.provider_api_key")
        html_body = _html_with_inline_fallback(message.html, message.attachments)
        payload = {
            "from": f"{message.from_name or 'Nest Home Care'} <{message.from_address}>",
            "to": message.to,
            "subject": message.subject,
            "text": message.text,
        }
        if html_body is not None:
            payload["html"] = html_body
        if message.cc:
            payload["cc"] = message.cc
        if message.bcc:
            payload["bcc"] = message.bcc
        if message.reply_to:
            payload["reply_to"] = message.reply_to
        if message.headers:
            payload["headers"] = message.headers
        if message.attachments:
            payload["attachments"] = [
                {
                    "filename": attachment.filename,
                    "content": base64.b64encode(attachment.data).decode("ascii"),
                }
                for attachment in message.attachments
            ]
        headers = {"Authorization": f"Bearer {key}"}
        if message.idempotency_key:
            headers["Idempotency-Key"] = message.idempotency_key
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    "https://api.resend.com/emails", json=payload, headers=headers
                )
            if response.is_success:
                return MailSendResult(True, response.json().get("id"))
            return MailSendResult(
                False,
                retryable=response.status_code == 429 or response.status_code >= 500,
                error=f"HTTP {response.status_code}",
            )
        except httpx.HTTPError as exc:
            return MailSendResult(False, retryable=True, error=type(exc).__name__)


class BrevoProvider(MailProvider):
    name = "brevo"
    max_message_bytes = 20 * 1024 * 1024
    # get_provider() enables RFC header preservation only for SMTP; the JSON
    # fallback deliberately degrades threading and CID images.

    async def send_message(self, message: OutboundMessage) -> MailSendResult:
        transport = str(await get_value("mail.brevo_transport") or "smtp").lower()
        if transport == "smtp":
            return await self._send_smtp(message)
        return await self._send_api(message)

    async def _send_smtp(self, message: OutboundMessage) -> MailSendResult:
        """Send frozen RFC 5322 bytes; Bcc is envelope-only, never a header."""
        host = str(await get_value("mail.smtp_host") or "smtp-relay.brevo.com")
        port = int(await get_value("mail.smtp_port") or 587)
        username = str(await get_value("mail.smtp_username") or "")
        password = str(await get_value("mail.smtp_password") or "")
        if not username or not password:
            return MailSendResult(False, retryable=False, error="smtp_credentials_missing")
        raw = message.rfc822
        if not raw:
            # Legacy system mail/test-send callers do not carry a frozen RFC 5322
            # copy. Build one at the transport boundary; mailbox sends already
            # provide the persisted, frozen copy from the outbox worker.
            try:
                from email.utils import make_msgid
                from app.modules.mail.mime_build import build_eml

                raw = build_eml(
                    {
                        "from_address": message.from_address,
                        "from_name": message.from_name,
                        "subject": message.subject,
                        "body_text": message.text,
                        "body_html": message.html,
                        "reply_to": message.reply_to,
                        "message_id_header": message.message_id or make_msgid(),
                    },
                    message.attachments,
                    {"to": message.to, "cc": message.cc},
                    headers=message.headers,
                )
            except Exception as exc:
                return MailSendResult(False, retryable=False, error=f"message_build_{type(exc).__name__}")
        recipients = list(dict.fromkeys([*message.to, *message.cc, *message.bcc]))
        if not recipients:
            return MailSendResult(False, retryable=False, error="recipient_missing")
        try:
            from aiosmtplib import send as smtp_send

            await smtp_send(
                raw,
                sender=message.from_address,
                recipients=recipients,
                hostname=host,
                port=port,
                username=username,
                password=password,
                use_tls=port == 465,
                start_tls=port != 465,
                timeout=45,
            )
            return MailSendResult(True, message.message_id)
        except Exception as exc:
            # Never persist SMTP exception text: it may contain server data or addresses.
            retryable = type(exc).__name__ not in {"SMTPAuthenticationError", "SMTPNotSupported"}
            return MailSendResult(False, retryable=retryable, error=f"smtp_{type(exc).__name__}")

    async def _send_api(self, message: OutboundMessage) -> MailSendResult:
        """Brevo JSON fallback. Its documented limitations are recorded in render_notes."""
        key = await get_value("mail.provider_api_key")
        if not key:
            return MailSendResult(False, retryable=False, error="provider_api_key_missing")
        html_body = _html_with_inline_fallback(message.html, message.attachments)
        payload = {
            "sender": {"name": message.from_name or "Nest Home Care", "email": message.from_address},
            "to": [{"email": address, "contactPixelTrackingConsent": False} for address in message.to],
            "subject": message.subject,
            "htmlContent": html_body or f"<pre>{html.escape(message.text)}</pre>",
        }
        if message.cc:
            payload["cc"] = [{"email": address, "contactPixelTrackingConsent": False} for address in message.cc]
        if message.bcc:
            payload["bcc"] = [{"email": address, "contactPixelTrackingConsent": False} for address in message.bcc]
        if message.reply_to:
            payload["replyTo"] = {"email": message.reply_to}
        if message.attachments:
            payload["attachment"] = [
                {"name": _ascii_attachment_name(item.filename), "content": base64.b64encode(item.data).decode("ascii")}
                for item in message.attachments
            ]
        headers = {"api-key": str(key)}
        if message.idempotency_key:
            payload["headers"] = {"X-Mailin-custom": message.idempotency_key}
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post("https://api.brevo.com/v3/smtp/email", json=payload, headers=headers)
            if response.is_success:
                return MailSendResult(True, response.json().get("messageId"))
            return MailSendResult(
                False,
                retryable=response.status_code == 429 or response.status_code >= 500,
                error=f"HTTP {response.status_code}",
            )
        except httpx.HTTPError as exc:
            return MailSendResult(False, retryable=True, error=type(exc).__name__)


def _html_with_inline_fallback(body: str | None, attachments: list[OutboundAttachment]) -> str | None:
    """Replace CID image markup with a clear note for JSON transports without CID support."""
    if body is None:
        return None
    inline_ids = {str(item.content_id).strip("<>") for item in attachments if item.content_id}
    if not inline_ids:
        return body
    def replace_image(match: re.Match[str]) -> str:
        tag = match.group(0)
        cid_match = re.search(r"\bsrc\s*=\s*([\"'])cid:([^\"']+)\1", tag, re.I)
        if not cid_match or cid_match.group(2).strip("<>") not in inline_ids:
            return tag
        alt_match = re.search(r"\balt\s*=\s*([\"'])(.*?)\1", tag, re.I | re.S)
        label = html.escape(html.unescape(alt_match.group(2)).strip()) if alt_match else "Inline image"
        return f"<p>[{label or 'Inline image'} attached separately]</p>"
    return re.sub(r"<img\b[^>]*>", replace_image, body, flags=re.I | re.S)


def _ascii_attachment_name(filename: str) -> str:
    """Brevo API fallback only: keep extension while simplifying unsupported names."""
    original = str(filename or "attachment")
    stem, dot, suffix = original.rpartition(".")
    if not dot:
        stem, suffix = original, ""
    ascii_stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode("ascii")
    ascii_stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", ascii_stem).strip(" ._") or "attachment"
    return f"{ascii_stem}.{suffix}" if suffix else ascii_stem


async def get_provider() -> MailProvider:
    choice = str(await get_value("mail.provider") or "console").lower()
    if choice == "resend":
        return ResendProvider()
    if choice == "brevo":
        provider = BrevoProvider()
        smtp = str(await get_value("mail.brevo_transport") or "smtp").lower() == "smtp"
        provider.supports_threading_headers = smtp
        provider.supports_inline_cid = smtp
        return provider
    return MailProvider()


class SystemMailOutboxAdapter(MailProvider):
    """Compatibility adapter for legacy invite/reset/alert callers."""

    name = "mail-outbox"

    async def send(
        self,
        to,
        subject,
        html,
        text,
        *,
        from_address=None,
        from_name=None,
        reply_to=None,
        headers=None,
        attachments=None,
        idempotency_key=None,
    ):
        from app.modules.mail import db

        try:
            if not bool(await get_value("mail.enabled")):
                return await MailProvider().send(to, subject, html, text)
            domain = str(await get_value("mail.domain") or "").lower()
            if not domain:
                return await MailProvider().send(to, subject, html, text)
            pool = db.get_pool()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    box = await conn.fetchrow(
                        "SELECT id FROM mailbox WHERE local_part='no-reply'"
                    )
                    if not box:
                        box = await conn.fetchrow(
                            "INSERT INTO mailbox(local_part,kind,display_name) "
                            "VALUES('no-reply','shared','Nest Home Care') RETURNING id"
                        )
                    message_id = await conn.fetchval(
                        "INSERT INTO message(from_address,from_name,subject,body_text,body_html,origin) "
                        "VALUES($1,$2,$3,$4,$5,'outbound') RETURNING id",
                        f"no-reply@{domain}",
                        from_name or await get_value("mail.from_name"),
                        subject,
                        text,
                        html,
                    )
                    for address in to:
                        await conn.execute(
                            "INSERT INTO message_recipient(message_id,kind,address) "
                            "VALUES($1,'to',$2) ON CONFLICT DO NOTHING",
                            message_id,
                            address.lower(),
                        )
                    await conn.execute(
                        "INSERT INTO outbox(message_id,from_mailbox_id,to_addresses,priority,"
                        "idempotency_key) VALUES($1,$2,$3,1,$4)",
                        message_id,
                        box["id"],
                        to,
                        idempotency_key or f"system:{message_id}",
                    )
            from app.modules.mail.outbox import kick

            kick()
            return MailSendResult(True, "queued")
        except Exception:
            # Account creation/reset must not depend on optional mail service health.
            return await MailProvider().send(to, subject, html, text)
