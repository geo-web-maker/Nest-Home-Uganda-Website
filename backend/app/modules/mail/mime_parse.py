"""Loss-conscious MIME parsing for Nest Mail.

The parser never uses ``Message.walk()``: message/rfc822 is an opaque attachment, and MIME
container semantics determine which bodies and related resources are retained.
"""

from __future__ import annotations

import hashlib
import mimetypes
import re
import unicodedata
from dataclasses import dataclass, field
from email import policy
from email.message import EmailMessage, Message
from email.parser import BytesParser
from email.utils import getaddresses
from typing import Any, Literal


@dataclass
class ParsedAttachment:
    filename: str
    content_type: str
    data: bytes
    disposition: Literal["attachment", "inline"]
    content_id: str | None
    blocked_reason: str | None
    size_bytes: int = 0
    sha256: str = ""


@dataclass
class ParsedMail:
    message_id: str
    in_reply_to: str
    references: str
    from_name: str
    from_address: str
    subject: str
    to: list[str]
    cc: list[str]
    text_body: str
    html_body: str | None
    attachments: list[ParsedAttachment] = field(default_factory=list)
    notes: dict[str, Any] = field(default_factory=dict)


def _header_text(value: Any, limit: int = 998) -> str:
    return str(value or "").replace("\r", " ").replace("\n", " ").strip()[:limit]


def safe_filename(value: str, content_type: str = "application/octet-stream", index: int = 1) -> str:
    value = unicodedata.normalize("NFC", str(value or ""))
    value = value.replace("/", "_").replace("\\", "_")
    value = "".join(
        char for char in value
        if unicodedata.category(char)[0] != "C" and not (0x202A <= ord(char) <= 0x202E)
        and not (0x2066 <= ord(char) <= 0x2069)
    ).strip(" .")
    if not value:
        extension = mimetypes.guess_extension(content_type) or ".bin"
        value = f"attachment-{index}{extension}"
    if "." in value and not value.endswith("."):
        stem, extension = value.rsplit(".", 1)
        suffix = f".{extension}"
    else:
        stem, suffix = value, ""
    max_bytes = 255
    suffix_bytes = suffix.encode("utf-8")[:max_bytes]
    available = max(1, max_bytes - len(suffix_bytes))
    stem_bytes = stem.encode("utf-8")[:available]
    while True:
        try:
            trimmed_stem = stem_bytes.decode("utf-8")
            break
        except UnicodeDecodeError:
            stem_bytes = stem_bytes[:-1]
    return (trimmed_stem or "attachment") + suffix_bytes.decode("utf-8", errors="ignore")


def _decode_text(part: Message, max_bytes: int, notes: dict[str, Any], note_key: str) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        raw = part.get_payload()
        if isinstance(raw, str):
            text = raw
        else:
            text = ""
    else:
        charset = part.get_content_charset() or "utf-8"
        try:
            text = payload.decode(charset, errors="replace")
        except (LookupError, UnicodeError):
            text = payload.decode("utf-8", errors="replace")
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) > max_bytes:
        text = encoded[:max_bytes].decode("utf-8", errors="ignore")
        notes[note_key] = True
    return text


def _content_id(part: Message) -> str | None:
    value = str(part.get("Content-ID") or "").strip().strip("<>").lower()
    return value or None


def _filename(part: Message, index: int) -> str:
    raw = part.get_filename()
    if not raw:
        raw = part.get_param("name", header="content-type")
    return safe_filename(str(raw or ""), part.get_content_type().lower(), index)


def sniff_content_type(data: bytes) -> str | None:
    """Return a MIME type for the small set of signatures we can verify safely."""
    sample = bytes(data[:16])
    if sample.startswith(b"%PDF-"):
        return "application/pdf"
    if sample.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if sample.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if sample.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(data) >= 12 and sample[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def parse_message(
    raw: bytes,
    *,
    blocked_extensions: set[str],
    max_attachment_bytes: int,
    max_html_bytes: int,
    max_text_bytes: int,
) -> ParsedMail:
    """Parse one RFC 5322 message, retaining HTML and every attachment-like MIME leaf."""
    notes: dict[str, Any] = {
        "signed": False,
        "truncated_text": False,
        "truncated_html": False,
        "parse_warnings": [],
    }
    parsed = BytesParser(policy=policy.default).parsebytes(raw)
    from_name, from_address = getaddresses([str(parsed.get("From", ""))])[0] if parsed.get("From") else ("", "")
    blocked = {item.lower().lstrip(".") for item in blocked_extensions if item.strip()}
    attachments: list[ParsedAttachment] = []
    body_text = ""
    body_html: str | None = None
    attachment_index = 0

    def add_attachment(part: Message, data: bytes, *, forced_name: str | None = None) -> None:
        nonlocal attachment_index
        attachment_index += 1
        content_type = part.get_content_type().lower()
        filename = safe_filename(forced_name or _filename(part, attachment_index), content_type, attachment_index)
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        disposition_header = (part.get_content_disposition() or "").lower()
        content_id = _content_id(part)
        declared_inline = disposition_header == "inline"
        disposition: Literal["attachment", "inline"] = "inline" if declared_inline else "attachment"
        reason = None
        if extension in blocked:
            reason = f"extension:{extension}"
        elif len(data) > max_attachment_bytes:
            reason = "size"
        digest = hashlib.sha256(data).hexdigest()
        size = len(data)
        attachments.append(
            ParsedAttachment(
                filename=filename,
                content_type=content_type,
                data=b"" if reason else data,
                disposition=disposition,
                content_id=content_id,
                blocked_reason=reason,
                size_bytes=size,
                sha256=digest,
            )
        )

    def get_rfc822_bytes(part: Message) -> tuple[bytes, str]:
        payload = part.get_payload()
        nested = payload[0] if isinstance(payload, list) and payload else None
        if isinstance(nested, Message):
            nested_subject = _header_text(nested.get("Subject"), 180)
            data = nested.as_bytes(policy=policy.default)
            return data, f"{nested_subject or 'message'}.eml"
        if isinstance(payload, bytes):
            return payload, "message.eml"
        if isinstance(payload, str):
            return payload.encode("utf-8", errors="replace"), "message.eml"
        return b"", "message.eml"

    def visit(part: Message) -> None:
        nonlocal body_text, body_html
        content_type = part.get_content_type().lower()
        disposition = (part.get_content_disposition() or "").lower()
        filename = part.get_filename() or part.get_param("name", header="content-type")

        if content_type == "message/rfc822":
            data, name = get_rfc822_bytes(part)
            # message/rfc822 remains a single opaque .eml attachment; never descend into it.
            wrapper = part
            add_attachment(wrapper, data, forced_name=name)
            return

        if part.is_multipart():
            children = part.get_payload()
            if not isinstance(children, list):
                notes["parse_warnings"].append("invalid_multipart_payload")
                return
            if content_type == "multipart/signed":
                notes["signed"] = True
                if children:
                    visit(children[0])
                for child in children[1:]:
                    add_attachment(child, child.get_payload(decode=True) or b"")
                return
            if content_type == "multipart/alternative":
                for child in children:
                    child_type = child.get_content_type().lower()
                    child_disposition = child.get_content_disposition()
                    child_filename = child.get_filename() or child.get_param("name", header="content-type")
                    if child_disposition == "attachment" or child_filename:
                        visit(child)
                    elif child_type == "text/plain":
                        body_text = _decode_text(child, max_text_bytes, notes, "truncated_text")
                    elif child_type == "text/html":
                        body_html = _decode_text(child, max_html_bytes, notes, "truncated_html")
                    elif child.is_multipart():
                        visit(child)
                return
            if content_type == "multipart/related":
                start = str(part.get_param("start", header="content-type") or "").strip("<>").lower()
                root_index = 0
                if start:
                    for index, child in enumerate(children):
                        if _content_id(child) == start:
                            root_index = index
                            break
                if children:
                    visit(children[root_index])
                for index, child in enumerate(children):
                    if index == root_index:
                        continue
                    before = len(attachments)
                    visit(child)
                    for attachment in attachments[before:]:
                        if attachment.content_id:
                            attachment.disposition = "inline"
                return
            for child in children:
                visit(child)
            return

        if filename or disposition == "attachment":
            add_attachment(part, part.get_payload(decode=True) or b"")
            return
        if content_type == "text/plain":
            if not body_text:
                body_text = _decode_text(part, max_text_bytes, notes, "truncated_text")
            return
        if content_type == "text/html":
            # For a non-alternative multipart, keep the last HTML body encountered.
            body_html = _decode_text(part, max_html_bytes, notes, "truncated_html")
            return
        data = part.get_payload(decode=True)
        if data is not None or content_type.startswith("text/"):
            add_attachment(part, data or b"")

    try:
        visit(parsed)
    except Exception as exc:
        # A malformed MIME branch should not discard the rest of the message.
        notes["parse_warnings"].append(type(exc).__name__)

    if body_html:
        referenced = {
            match.group(1).lower()
            for match in re.finditer(r"(?i)cid:([^\s\"'<>]+)", body_html)
        }
        for attachment in attachments:
            if attachment.content_id and attachment.content_id in referenced:
                attachment.disposition = "inline"

    return ParsedMail(
        message_id=_header_text(parsed.get("Message-ID")),
        in_reply_to=_header_text(parsed.get("In-Reply-To")),
        references=_header_text(parsed.get("References")),
        from_name=str(from_name or "")[:160],
        from_address=str(from_address or "").lower()[:320],
        subject=_header_text(parsed.get("Subject")),
        to=[address.lower() for _name, address in getaddresses(parsed.get_all("To", [])) if address],
        cc=[address.lower() for _name, address in getaddresses(parsed.get_all("Cc", [])) if address],
        text_body=body_text,
        html_body=body_html,
        attachments=attachments,
        notes=notes,
    )
