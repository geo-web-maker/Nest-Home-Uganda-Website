"""Build RFC 5322 messages for saved sent copies and .eml forwards."""

from __future__ import annotations

import re
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import formataddr
from typing import Any, Iterable


def _set_addresses(message: EmailMessage, field: str, addresses: Iterable[str]) -> None:
    clean = [str(address).strip() for address in addresses if str(address).strip()]
    if clean:
        message[field] = ", ".join(clean)


def _content_type(value: str) -> tuple[str, str]:
    main, separator, sub = str(value or "application/octet-stream").partition("/")
    if not separator or not main or not sub:
        return "application", "octet-stream"
    return main.lower(), sub.lower()


def build_eml(
    message: Any,
    attachments: Iterable[Any],
    recipients: dict[str, list[str]] | None = None,
    headers: dict[str, str] | None = None,
) -> bytes:
    """Create an RFC-compliant email; ``message`` may be a mapping or dataclass."""
    getter = message.get if isinstance(message, dict) else lambda key, default=None: getattr(message, key, default)
    envelope = recipients or {}
    result = EmailMessage(policy=SMTP)
    from_address = getter("from_address", "")
    from_name = getter("from_name")
    result["From"] = formataddr((str(from_name or ""), str(from_address)))
    _set_addresses(result, "To", envelope.get("to", []))
    _set_addresses(result, "Cc", envelope.get("cc", []))
    # Bcc is intentionally not written into the saved public header block. The
    # transport envelope keeps it separately in the provider call.
    result["Subject"] = str(getter("subject", ""))
    if getter("reply_to"):
        result["Reply-To"] = str(getter("reply_to"))
    if getter("message_id_header"):
        result["Message-ID"] = str(getter("message_id_header"))
    reply_value = str(getter("in_reply_to") or "").strip()
    if re.match(r"^<[^<>\s@]+@[^<>\s@]+>$", reply_value):
        result["In-Reply-To"] = reply_value
    if getter("references_header"):
        result["References"] = str(getter("references_header"))
    for key, value in (headers or {}).items():
        if key.lower() not in {"from", "to", "cc", "bcc", "subject", "message-id", "in-reply-to", "references"}:
            result[key] = str(value)

    text_body = str(getter("body_text", "") or "")
    html_body = getter("body_html")
    result.set_content(text_body)
    if html_body:
        result.add_alternative(str(html_body), subtype="html")
        html_part = result.get_body(preferencelist=("html",))
    else:
        html_part = None

    attachment_items = list(attachments or [])
    for item in attachment_items:
        if isinstance(item, dict):
            field = item.get
        else:
            field = lambda key, default=None: getattr(item, key, default)
        data = field("data", b"")
        filename = str(field("filename", "attachment"))
        content_type = str(field("content_type", "application/octet-stream"))
        content_id = field("content_id")
        disposition = str(field("disposition", "attachment"))
        maintype, subtype = _content_type(content_type)
        if content_id and disposition == "inline" and html_part is not None:
            html_part.add_related(
                data,
                maintype=maintype,
                subtype=subtype,
                cid=f"<{str(content_id).strip('<>')}>",
                filename=filename,
                disposition="inline",
            )
        else:
            result.add_attachment(data, maintype=maintype, subtype=subtype, filename=filename)
    return result.as_bytes(policy=SMTP)
