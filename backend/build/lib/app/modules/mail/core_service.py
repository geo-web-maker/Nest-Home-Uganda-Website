# ruff: noqa: E501,E701,E702
"""Transactional internal-mail primitives. External delivery is delegated to the outbox worker."""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import unicodedata
import uuid
from collections import OrderedDict
from email.utils import parseaddr
from typing import Any

from app.modules.mail import db
from app.modules.mail.settings_service import get_value
from app.modules.mail.html_policy import (
    POLICY_VERSION, html_to_text, make_snippet, resolve_cid_images, sanitize_html,
)

log = logging.getLogger("app.mail.core")

_RESERVED = {"postmaster", "abuse", "admin", "administrator", "root", "webmaster", "hostmaster", "noreply", "no-reply", "mailer-daemon", "support"}
_EMAIL = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$")


def _safe_header(value: str, field: str) -> str:
    value = value.strip()
    if "\r" in value or "\n" in value or len(value) > 998:
        raise ValueError(f"Invalid {field} header")
    return value


def _local_part(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    value = re.sub(r"[^a-z0-9.-]+", ".", value)
    return re.sub(r"[.-]{2,}", ".", value).strip(".-")[:64]


async def _audit(conn: Any, actor: str | None, action: str, mailbox_id=None, message_id=None, detail=None):
    await conn.execute(
        "INSERT INTO mail_audit(actor_user_id,action,mailbox_id,message_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
        actor, action, mailbox_id, message_id, json.dumps(detail or {}),
    )


async def _assert_enabled():
    if not bool(await get_value("mail.enabled")):
        from app.core.errors import Forbidden
        raise Forbidden("Nest Mail is currently disabled by the organisation.")


async def _domain() -> str:
    value = str(await get_value("mail.domain") or "").strip().lower()
    if not value:
        raise ValueError("Set mail.domain in superadmin email settings before creating mailboxes.")
    return value


async def ensure_default_mailbox(user: Any):
    pool = db.get_pool()
    domain = await _domain()
    user_id = str(user.id)
    existing = await pool.fetchrow("SELECT * FROM mailbox WHERE owner_user_id=$1 AND kind='personal'", user_id)
    if existing:
        return dict(existing)
    pattern = str(await get_value("mail.address_pattern") or "{first}.{last}")
    bits = str(getattr(user, "name", "")).strip().split()
    staff_no = getattr(user, "staff_number", "") or ""
    if "{staff_no}" in pattern and not staff_no:
        try:
            from app.modules.nurses.models import NurseProfile
            profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
            staff_no = profile.staff_number if profile else ""
        except Exception:
            staff_no = ""
    values = {"first": bits[0] if bits else "", "last": bits[-1] if len(bits) > 1 else "", "staff_no": staff_no}
    candidate = _local_part(pattern.format(**values))
    if not candidate or candidate in _RESERVED:
        raise ValueError("User name cannot produce an available mailbox address.")
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", candidate)
            for suffix in range(1, 10000):
                local = candidate if suffix == 1 else f"{candidate}{suffix}"
                used = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM mailbox WHERE local_part=$1) OR EXISTS(SELECT 1 FROM mailbox_alias WHERE local_part=$1)", local)
                if not used:
                    row = await conn.fetchrow(
                        "INSERT INTO mailbox(local_part,kind,owner_user_id,display_name,state,closed_at) VALUES($1,'personal',$2,$3,$4,CASE WHEN $4='closed' THEN now() ELSE NULL END) RETURNING *",
                        local, user_id, str(getattr(user, "name", ""))[:160], "open" if getattr(user,"is_active",True) else "closed",
                    )
                    await conn.execute("INSERT INTO mailbox_member(mailbox_id,user_id,role,added_by) VALUES($1,$2,'owner',$2)", row['id'], user_id)
                    await _audit(conn, user_id, "mail.mailbox.create", row['id'], detail={"kind":"personal"})
                    welcome=await conn.fetchval("INSERT INTO message(from_address,from_name,subject,body_text,origin) VALUES($1,'Bloomwell Home Care Uganda','Welcome to Nest Mail','Your Nest mailbox is ready. Use it for approved work communication. Do not send client details to outside addresses.','internal') RETURNING id",f"no-reply@{domain}")
                    await conn.execute("INSERT INTO mailbox_message(mailbox_id,message_id,folder) VALUES($1,$2,'inbox')",row['id'],welcome)
                    return dict(row)
    raise ValueError("Unable to allocate a unique mailbox address.")


async def list_mailboxes(user_id: str):
    await _assert_enabled()
    pool = db.get_pool()
    domain = await _domain()
    rows = await pool.fetch("""
      SELECT b.id,b.local_part,b.kind,b.display_name,b.state,m.role,
        (SELECT count(*) FROM mailbox_message mm WHERE mm.mailbox_id=b.id AND mm.folder='inbox' AND NOT mm.is_read) unread_count
      FROM mailbox b JOIN mailbox_member m ON m.mailbox_id=b.id
      WHERE m.user_id=$1 AND b.state='open' ORDER BY (b.kind='personal') DESC,b.display_name
    """, user_id)
    return [{**dict(r), "address": f"{r['local_part']}@{domain}"} for r in rows]


async def _membership(conn: Any, mailbox_id: str, user_id: str, *, send=False):
    await _assert_enabled()
    row = await conn.fetchrow("SELECT b.*,m.role FROM mailbox b JOIN mailbox_member m ON m.mailbox_id=b.id WHERE b.id=$1 AND m.user_id=$2", mailbox_id, user_id)
    if not row or row['state'] != 'open' or (send and row['role'] not in ('owner','send_as')):
        from app.core.errors import NotFound, Forbidden
        if not row: raise NotFound("Mailbox not found.")
        raise Forbidden("You do not have permission to use this mailbox.")
    return row


async def list_messages(user_id: str, mailbox_id: str, folder: str, q: str | None, limit: int = 50, before: str | None = None):
    await _assert_enabled()
    if folder not in {"inbox", "sent", "drafts", "trash", "spam", "starred"}:
        raise ValueError("Unknown mail folder")
    pool = db.get_pool()
    async with pool.acquire() as conn:
        await _membership(conn, mailbox_id, user_id)
        params: list[Any] = [mailbox_id]
        where = "mm.mailbox_id=$1"
        if folder == "starred":
            where += " AND mm.is_starred=true"
        else:
            params.append(folder)
            where += f" AND mm.folder=${len(params)}"
        if q:
            params.append(q.strip())
            where += f" AND (m.search @@ plainto_tsquery('simple',${len(params)}) OR m.subject ILIKE '%'||${len(params)}||'%')"
        if before:
            params.append(before)
            where += f" AND mm.received_at < ${len(params)}::timestamptz"
        params.append(max(1, min(limit, 100)))
        rows = await conn.fetch(f"""SELECT mm.id mailbox_message_id,mm.folder,mm.is_read,mm.is_starred,mm.received_at,
          m.id message_id,m.from_address,m.from_name,m.subject,m.snippet,m.body_format,m.origin,m.size_bytes,
          EXISTS(SELECT 1 FROM attachment a WHERE a.message_id=m.id) AS has_attachments
          FROM mailbox_message mm JOIN message m ON m.id=mm.message_id WHERE {where}
          ORDER BY mm.received_at DESC LIMIT ${len(params)}""", *params)
        return [dict(row) for row in rows]


_INLINE_IMAGE_CACHE: OrderedDict[str, bytes] = OrderedDict()
_INLINE_IMAGE_CACHE_MAX = 128


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


async def _inline_image_data(attachment_id: str, object_key: str) -> bytes:
    cached = _INLINE_IMAGE_CACHE.get(attachment_id)
    if cached is not None:
        _INLINE_IMAGE_CACHE.move_to_end(attachment_id)
        return cached
    from app.core.storage import Bucket, get_storage

    data = await get_storage().get(Bucket.MAIL, object_key)
    _INLINE_IMAGE_CACHE[attachment_id] = data
    _INLINE_IMAGE_CACHE.move_to_end(attachment_id)
    while len(_INLINE_IMAGE_CACHE) > _INLINE_IMAGE_CACHE_MAX:
        _INLINE_IMAGE_CACHE.popitem(last=False)
    return data


async def read_message(user_id: str, item_id: str, *, include_admin_diagnostics: bool = False):
    await _assert_enabled()
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("""SELECT
                mm.id AS mailbox_message_id, mm.mailbox_id, mm.folder, mm.is_read,
                mm.is_starred, mm.received_at,
                m.id AS message_id, m.thread_id, m.message_id_header, m.in_reply_to,
                m.references_header, m.from_address, m.from_name, m.subject,
                m.body_text, m.body_html, m.quoted_html, m.quote_kind, m.quote_source_message_id,
                m.body_format, m.snippet, m.render_notes, m.sanitizer_version, m.origin, m.size_bytes,
                (m.raw_object_key IS NOT NULL OR m.sent_eml_key IS NOT NULL) AS can_download_original
              FROM mailbox_message mm JOIN message m ON m.id=mm.message_id
              JOIN mailbox_member mem ON mem.mailbox_id=mm.mailbox_id
              WHERE mm.id=$1 AND mem.user_id=$2""", item_id, user_id)
            if not row:
                from app.core.errors import NotFound
                raise NotFound("Message not found.")
            await conn.execute("UPDATE mailbox_message SET is_read=true WHERE id=$1", item_id)
            await _audit(conn, user_id, "mail.read", row["mailbox_id"], row["message_id"])
            if row["folder"] in ("drafts", "sent"):
                recipients = await conn.fetch(
                    "SELECT kind,address,name FROM message_recipient WHERE message_id=$1",
                    row["message_id"],
                )
            else:
                recipients = await conn.fetch(
                    "SELECT kind,address,name FROM message_recipient WHERE message_id=$1 "
                    "AND (kind <> 'bcc' OR address=$2)",
                    row["message_id"], row["from_address"],
                )
            attachments = await conn.fetch("""SELECT id,object_key,filename,content_type,
                    size_bytes,sha256,scan_state,disposition,content_id,blocked_reason,scanned_at,scan_detail
                FROM attachment WHERE message_id=$1 ORDER BY created_at""", row["message_id"])
            delivery = None
            if row["folder"] == "sent":
                outbox_row = await conn.fetchrow(
                    "SELECT id,state,last_error,provider,provider_message_id,attempts,next_attempt_at FROM outbox "
                    "WHERE message_id=$1 ORDER BY created_at DESC LIMIT 1",
                    row["message_id"],
                )
                if outbox_row:
                    event_rows = await conn.fetch(
                        "SELECT DISTINCT ON (address) address,event,at FROM delivery_event "
                        "WHERE outbox_id=$1 ORDER BY address,at DESC,id DESC",
                        outbox_row["id"],
                    )
                    from app.modules.mail.delivery_detail import build_delivery
                    delivery = build_delivery(
                        dict(outbox_row),
                        [
                            {"address": str(item["address"]), "event": str(item["event"]), "at": item["at"]}
                            for item in event_rows
                        ],
                        include_detail=include_admin_diagnostics,
                    )

    message = dict(row)
    message["delivery"] = delivery
    render_notes = _json_object(message.pop("render_notes", {}))
    sanitizer_version = int(message.pop("sanitizer_version", 0) or 0)
    body_html = message.get("body_html")
    quoted_html = message.get("quoted_html")
    if body_html and sanitizer_version < POLICY_VERSION:
        filtered = sanitize_html(body_html)
        body_html = filtered.html
        for key, value in filtered.notes.items():
            if value:
                render_notes[key] = value
    if quoted_html and sanitizer_version < POLICY_VERSION:
        filtered_quote = sanitize_html(quoted_html)
        quoted_html = filtered_quote.html
        for key, value in filtered_quote.notes.items():
            if value:
                render_notes[key] = value
    remote_count = int(render_notes.get("blocked_remote_images", 0) or 0)
    has_remote_images = remote_count > 0

    inline_max = int(await get_value("mail.inline_image_max_kb")) * 1024
    total_max = int(await get_value("mail.inline_images_total_mb")) * 1024 * 1024
    total_inline = 0
    cid_data: dict[str, str] = {}
    output_attachments: list[dict[str, Any]] = []
    omitted_inline = 0
    for item in attachments:
        attachment = dict(item)
        object_key = attachment.pop("object_key")
        content_id = str(attachment.get("content_id") or "").strip("<>").lower()
        if (
            (body_html or quoted_html)
            and content_id
            and attachment.get("disposition") == "inline"
            and not attachment.get("blocked_reason")
            and str(attachment.get("content_type", "")).lower()
            in {"image/png", "image/jpeg", "image/gif", "image/webp"}
        ):
            size = int(attachment.get("size_bytes") or 0)
            if size <= inline_max and total_inline + size <= total_max and object_key:
                try:
                    data = await _inline_image_data(str(attachment["id"]), object_key)
                    if len(data) <= inline_max and total_inline + len(data) <= total_max:
                        encoded = base64.b64encode(data).decode("ascii")
                        cid_data[content_id] = f"data:{attachment['content_type']};base64,{encoded}"
                        total_inline += len(data)
                    else:
                        omitted_inline += 1
                except Exception:
                    omitted_inline += 1
            else:
                omitted_inline += 1
        output_attachments.append(attachment)
    if cid_data:
        if body_html:
            body_html = resolve_cid_images(body_html, cid_data)
        if quoted_html:
            quoted_html = resolve_cid_images(quoted_html, cid_data)
    if omitted_inline:
        render_notes["inline_images_not_embedded"] = omitted_inline
    message["body_html"] = body_html
    message["quoted_html"] = quoted_html
    message["render_notes"] = render_notes
    message["has_remote_images"] = has_remote_images
    message["can_download_original"] = bool(message.get("can_download_original"))
    message["recipients"] = [dict(item) for item in recipients]
    message["attachments"] = output_attachments
    message["mailbox_message_id"] = str(item_id)
    message["message_id"] = str(message["message_id"])
    # Explicit allow-list: internal object keys, raw authentication results, spam scores and
    # the generated search vector are never returned to the reader.
    return {
        key: message.get(key)
        for key in (
            "mailbox_message_id", "message_id", "mailbox_id", "folder", "is_read",
            "is_starred", "received_at", "thread_id", "message_id_header", "in_reply_to",
            "references_header", "from_address", "from_name", "subject", "body_text",
            "body_html", "quoted_html", "quote_kind", "quote_source_message_id",
            "body_format", "snippet", "origin", "size_bytes",
            "has_remote_images", "render_notes", "can_download_original", "recipients",
            "attachments", "delivery",
        )
    }


_RFC_MESSAGE_ID = re.compile(r"^<[^<>\s@]+@[^<>\s@]+>$")


def _rfc_message_id(value: Any) -> str | None:
    """Return ``value`` only when it is a well-formed RFC 5322 Message-ID such as ``<abc@host>``."""
    text = str(value or "").strip()
    return text if _RFC_MESSAGE_ID.match(text) else None


async def _threading_header(conn: Any, value: Any) -> str | None:
    """Resolve a client-supplied reply target to a real Message-ID header.

    Clients historically sent the internal message row id. Putting that into In-Reply-To makes
    some providers reject the whole send, so it is translated to the parent's header, or dropped.
    """
    text = str(value or "").strip()
    if not text:
        return None
    direct = _rfc_message_id(text)
    if direct:
        return direct
    try:
        # Compare as uuid so the primary-key index is used (id::text forced a full scan).
        message_uuid = uuid.UUID(text)
    except ValueError:
        return None
    try:
        header = await conn.fetchval(
            "SELECT message_id_header FROM message WHERE id=$1 LIMIT 1", message_uuid
        )
    except Exception:
        return None
    return _rfc_message_id(header)


async def create_draft(user_id: str, mailbox_id: str, payload: dict[str, Any], draft_id: str | None = None):
    """Create or update a draft, optionally composing a server-built reply/forward quote."""
    from html import escape

    from app.core.storage import Bucket, get_storage
    from app.modules.mail.html_policy import extract_data_images

    await _assert_enabled()
    if draft_id and payload.get("quote"):
        raise ValueError("A quote can only be supplied when creating a draft.")
    if not draft_id and payload.get("remove_quote"):
        raise ValueError("There is no saved quote to remove from a new draft.")

    pool = db.get_pool()
    stored_keys: list[str] = []
    old_inline_keys: list[str] = []
    copied_attachment_rows: list[dict[str, Any]] = []
    inline_image_keys: list[str] = []
    storage = get_storage()
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                box = await _membership(conn, mailbox_id, user_id, send=True)
                subject = _safe_header(str(payload.get("subject", "")), "subject")
                text = str(payload.get("body_text", ""))
                body_format = str(
                    payload.get("format", "html" if payload.get("body_html") is not None else "plain")
                )
                if body_format not in {"plain", "html"}:
                    raise ValueError("Unsupported message format.")
                if body_format == "html" and not bool(await get_value("mail.rich_text_enabled")):
                    raise ValueError("Rich-text mail is disabled by the administrator.")

                body_html: str | None = None
                render_notes: dict[str, Any] = {}
                new_inline_images = []
                max_html_bytes = int(await get_value("mail.max_html_kb")) * 1024
                if body_format == "html" and payload.get("body_html") is not None:
                    filtered = sanitize_html(
                        str(payload.get("body_html") or ""),
                        block_remote_images=bool(await get_value("mail.block_remote_images")),
                        max_bytes=max_html_bytes,
                    )
                    body_html = filtered.html
                    render_notes = filtered.notes
                    max_inline_bytes = int(await get_value("mail.inline_image_max_kb")) * 1024
                    allowed_images = {"image/png", "image/jpeg", "image/gif", "image/webp"}
                    before_data_images = len(re.findall(r"(?is)data:image/", body_html))
                    body_html, new_inline_images = extract_data_images(
                        body_html,
                        max_each=max_inline_bytes,
                        allowed=allowed_images,
                    )
                    rejected_images = max(0, before_data_images - len(new_inline_images))
                    if rejected_images:
                        render_notes["blocked_data_images"] = rejected_images
                    text = html_to_text(body_html)
                else:
                    body_format = "plain"
                    body_html = None

                quoted_html: str | None = None
                quote_kind: str | None = None
                quote_source_message_id = None
                copied_attachments = 0
                copied_attachment_bytes = 0
                quote = payload.get("quote")
                if quote:
                    quote_kind_requested = str(quote.get("kind") or "")
                    if quote_kind_requested not in {"reply", "reply_all", "forward", "forward_attachment"}:
                        raise ValueError("Unsupported reply or forward action.")
                    if quote_kind_requested == "forward_attachment" and not bool(
                        await get_value("mail.allow_forward_as_attachment")
                    ):
                        raise ValueError("Forward as attachment is disabled by the administrator.")
                    source = await conn.fetchrow(
                        """SELECT mm.id AS mailbox_message_id,mm.mailbox_id,mm.received_at,
                                  m.id AS message_id,m.message_id_header,m.in_reply_to,
                                  m.references_header,m.from_address,m.from_name,m.subject,
                                  m.body_text,m.body_html,m.body_format,m.sanitizer_version,
                                  m.raw_object_key,m.sent_eml_key,m.size_bytes,m.created_at
                           FROM mailbox_message mm JOIN message m ON m.id=mm.message_id
                           JOIN mailbox_member member ON member.mailbox_id=mm.mailbox_id
                           WHERE mm.id=$1 AND member.user_id=$2""",
                        str(quote.get("source_id") or ""),
                        user_id,
                    )
                    if not source:
                        from app.core.errors import NotFound

                        raise NotFound("The source message is not available.")
                    quote_source_message_id = source["message_id"]
                    source_attachments = await conn.fetch(
                        "SELECT id,object_key,filename,content_type,size_bytes,sha256,scan_state,"
                        "disposition,content_id,blocked_reason FROM attachment "
                        "WHERE message_id=$1 ORDER BY created_at",
                        source["message_id"],
                    )
                    source_recipients = await conn.fetch(
                        "SELECT kind,address,name FROM message_recipient WHERE message_id=$1 "
                        "AND kind IN ('to','cc') ORDER BY CASE kind WHEN 'to' THEN 1 ELSE 2 END",
                        source["message_id"],
                    )
                    source_html = source["body_html"]
                    source_sanitizer_version = int(source["sanitizer_version"] or 0)
                    if source_html and source_sanitizer_version < POLICY_VERSION:
                        source_html = sanitize_html(source_html).html
                    if not source_html:
                        source_html = f"<pre>{escape(str(source['body_text'] or ''))}</pre>"

                    if quote_kind_requested in {"reply", "reply_all"}:
                        labels = quote.get("labels") or {}
                        wrote_on = str(labels.get("wrote_on") or "On {date}, {who} wrote:")
                        source_date = source["received_at"] or source["created_at"]
                        date_text = source_date.strftime("%Y-%m-%d %H:%M") if source_date else ""
                        who_text = str(source["from_name"] or source["from_address"] or "the sender")
                        try:
                            wrote_on_text = wrote_on.format(date=date_text, who=who_text)
                        except (KeyError, ValueError):
                            wrote_on_text = f"On {date_text}, {who_text} wrote:"
                        quote_label = escape(wrote_on_text)
                        quoted_html = (
                            f'<div class="mail-quote"><p>{quote_label}</p>'
                            f"<blockquote>{source_html}</blockquote></div>"
                        )
                        quote_kind = "reply"
                        payload["in_reply_to"] = source["message_id_header"] or str(source["message_id"])
                        for attachment in source_attachments:
                            if (
                                attachment["disposition"] != "inline"
                                or attachment["blocked_reason"]
                                or attachment["scan_state"] in {"blocked", "infected"}
                            ):
                                continue
                            if not attachment["object_key"]:
                                render_notes["reply_missing_inline_images"] = int(
                                    render_notes.get("reply_missing_inline_images", 0)
                                ) + 1
                                continue
                            object_size = int(attachment["size_bytes"] or 0)
                            if object_size > int(await get_value("mail.max_attachment_mb")) * 1024 * 1024:
                                raise ValueError("A quoted inline image exceeds the attachment limit.")
                            new_key = f"mail/attachments/{uuid.uuid4()}"
                            await storage.copy(Bucket.MAIL, attachment["object_key"], new_key)
                            stored_keys.append(new_key)
                            copied_attachment_rows.append({
                                "object_key": new_key,
                                "filename": attachment["filename"],
                                "content_type": attachment["content_type"],
                                "size_bytes": object_size,
                                "sha256": attachment["sha256"],
                                "scan_state": attachment["scan_state"],
                                "content_id": attachment["content_id"],
                                "disposition": "inline",
                                "source_attachment_id": attachment["id"],
                            })
                            copied_attachments += 1
                            copied_attachment_bytes += object_size
                    elif quote_kind_requested == "forward":
                        labels = quote.get("labels") or {}
                        from_label = escape(str(labels.get("from") or labels.get("from_") or "From"))
                        date_label = escape(str(labels.get("date") or "Date"))
                        subject_label = escape(str(labels.get("subject") or "Subject"))
                        to_label = escape(str(labels.get("to") or "To"))
                        cc_label = escape(str(labels.get("cc") or "Cc"))
                        date_value = source["received_at"] or source["created_at"]
                        date_text = date_value.strftime("%Y-%m-%d %H:%M") if date_value else ""
                        to_values = [item["address"] for item in source_recipients if item["kind"] == "to"]
                        cc_values = [item["address"] for item in source_recipients if item["kind"] == "cc"]
                        header_rows = [
                            (from_label, source["from_address"]),
                            (date_label, date_text),
                            (subject_label, source["subject"]),
                            (to_label, ", ".join(to_values)),
                        ]
                        if cc_values:
                            header_rows.append((cc_label, ", ".join(cc_values)))
                        rows_html = "".join(
                            f"<tr><th>{label}</th><td>{escape(str(value or ''))}</td></tr>"
                            for label, value in header_rows
                        )
                        forwarded_label = escape(
                            str(labels.get("forwarded") or "---------- Forwarded message ----------")
                        )
                        quoted_html = (
                            '<div class="mail-forwarded"><p>' + forwarded_label + "</p>"
                            f"<table>{rows_html}</table>{source_html}</div>"
                        )
                        quote_kind = "forward"
                        if bool(quote.get("include_attachments", True)):
                            skipped = 0
                            for attachment in source_attachments:
                                if attachment["blocked_reason"] or attachment["scan_state"] in {"blocked", "infected"}:
                                    skipped += 1
                                    continue
                                if not attachment["object_key"]:
                                    skipped += 1
                                    continue
                                object_size = int(attachment["size_bytes"] or 0)
                                if object_size > int(await get_value("mail.max_attachment_mb")) * 1024 * 1024:
                                    raise ValueError(
                                        "A forwarded attachment exceeds the configured per-file limit."
                                    )
                                new_key = f"mail/attachments/{uuid.uuid4()}"
                                await storage.copy(Bucket.MAIL, attachment["object_key"], new_key)
                                stored_keys.append(new_key)
                                copied_attachment_rows.append({
                                    "object_key": new_key,
                                    "filename": attachment["filename"],
                                    "content_type": attachment["content_type"],
                                    "size_bytes": object_size,
                                    "sha256": attachment["sha256"],
                                    "scan_state": attachment["scan_state"],
                                    "content_id": attachment["content_id"],
                                    "disposition": attachment["disposition"],
                                    "source_attachment_id": attachment["id"],
                                })
                                copied_attachments += 1
                                copied_attachment_bytes += object_size
                            if skipped:
                                render_notes["forward_skipped_attachments"] = skipped
                    else:
                        original_key = source["raw_object_key"] or source["sent_eml_key"]
                        if original_key:
                            original_bytes = await storage.get(Bucket.MAIL, original_key)
                        else:
                            from app.modules.mail.mime_build import build_eml
                            from app.modules.mail.providers import OutboundAttachment

                            eml_attachments = []
                            for attachment in source_attachments:
                                if attachment["blocked_reason"] or attachment["scan_state"] in {"blocked", "infected"} or not attachment["object_key"]:
                                    continue
                                data = await storage.get(Bucket.MAIL, attachment["object_key"])
                                if hashlib.sha256(data).hexdigest() != str(attachment["sha256"]):
                                    raise ValueError("The original message attachment failed its integrity check.")
                                eml_attachments.append(
                                    OutboundAttachment(
                                        filename=attachment["filename"],
                                        content_type=attachment["content_type"],
                                        data=data,
                                        content_id=attachment["content_id"],
                                        disposition=attachment["disposition"],
                                    )
                                )
                            original_bytes = build_eml(
                                {
                                    "from_address": source["from_address"],
                                    "from_name": source["from_name"],
                                    "subject": source["subject"],
                                    "body_text": source["body_text"],
                                    "body_html": source_html,
                                    "message_id_header": source["message_id_header"],
                                    "in_reply_to": source["in_reply_to"],
                                    "references_header": source["references_header"],
                                },
                                eml_attachments,
                                {
                                    "to": [item["address"] for item in source_recipients if item["kind"] == "to"],
                                    "cc": [item["address"] for item in source_recipients if item["kind"] == "cc"],
                                },
                            )
                        if len(original_bytes) > int(await get_value("mail.max_attachment_mb")) * 1024 * 1024:
                            raise ValueError("The original .eml exceeds the configured attachment limit.")
                        new_key = f"mail/attachments/{uuid.uuid4()}"
                        if original_key:
                            await storage.copy(Bucket.MAIL, original_key, new_key)
                        else:
                            await storage.put(Bucket.MAIL, new_key, original_bytes, "message/rfc822")
                        stored_keys.append(new_key)
                        eml_filename = re.sub(
                            r"[\\/\r\n\x00-\x1f]+", "_", str(source["subject"] or "original")
                        )[:180].strip(" .") or "original"
                        copied_attachment_rows.append({
                            "object_key": new_key,
                            "filename": f"{eml_filename}.eml",
                            "content_type": "message/rfc822",
                            "size_bytes": len(original_bytes),
                            "sha256": hashlib.sha256(original_bytes).hexdigest(),
                            "scan_state": "unscanned",
                            "content_id": None,
                            "disposition": "attachment",
                            "source_attachment_id": None,
                        })
                        copied_attachments = 1
                        copied_attachment_bytes = len(original_bytes)
                        quote_kind = "forward"

                for image in new_inline_images:
                    key = f"mail/attachments/{uuid.uuid4()}"
                    await storage.put(Bucket.MAIL, key, image.data, image.content_type)
                    stored_keys.append(key)
                    inline_image_keys.append(key)

                reply_header = await _threading_header(conn, payload.get("in_reply_to"))
                if draft_id:
                    current = await conn.fetchrow(
                        "SELECT message_id,folder FROM mailbox_message "
                        "WHERE id=$1 AND mailbox_id=$2 AND folder='drafts' FOR UPDATE",
                        draft_id,
                        mailbox_id,
                    )
                    if not current:
                        from app.core.errors import NotFound

                        raise NotFound("Draft not found.")
                    mid = current["message_id"]
                    draft_item_id = draft_id
                    existing_quote = await conn.fetchrow(
                        "SELECT quoted_html,quote_kind,quote_source_message_id FROM message WHERE id=$1",
                        mid,
                    )
                    preserved_quote_html = (
                        None if payload.get("remove_quote") else existing_quote["quoted_html"]
                    )
                    preserved_quote_kind = (
                        None if payload.get("remove_quote") else existing_quote["quote_kind"]
                    )
                    preserved_quote_source = (
                        None if payload.get("remove_quote") else existing_quote["quote_source_message_id"]
                    )
                    old_images = await conn.fetch(
                        "SELECT id,object_key,size_bytes FROM attachment "
                        "WHERE message_id=$1 AND disposition='inline' AND source_attachment_id IS NULL",
                        mid,
                    )
                    old_inline_keys = [item["object_key"] for item in old_images if item["object_key"]]
                    await conn.execute(
                        "DELETE FROM attachment WHERE message_id=$1 AND disposition='inline' "
                        "AND source_attachment_id IS NULL",
                        mid,
                    )
                    await conn.execute(
                        "DELETE FROM message_recipient WHERE message_id=$1", mid
                    )
                else:
                    mid = await conn.fetchval(
                        """INSERT INTO message(
                             from_address,from_name,subject,body_text,body_html,body_format,
                             snippet,render_notes,sanitizer_version,origin,size_bytes,in_reply_to,
                             quoted_html,quote_kind,quote_source_message_id
                           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'internal',$10,$11,$12,$13,$14)
                           RETURNING id""",
                        f"{box['local_part']}@{await _domain()}",
                        box["display_name"],
                        subject,
                        text,
                        body_html,
                        body_format,
                        make_snippet(text),
                        json.dumps(render_notes),
                        POLICY_VERSION,
                        len(text.encode("utf-8")) + len((body_html or "").encode("utf-8")),
                        reply_header,
                        quoted_html,
                        quote_kind,
                        quote_source_message_id,
                    )
                    draft_item_id = await conn.fetchval(
                        "INSERT INTO mailbox_message(mailbox_id,message_id,folder) "
                        "VALUES($1,$2,'drafts') RETURNING id",
                        mailbox_id,
                        mid,
                    )
                    preserved_quote_html = quoted_html
                    preserved_quote_kind = quote_kind
                    preserved_quote_source = quote_source_message_id

                for copied in copied_attachment_rows:
                    await conn.execute(
                        """INSERT INTO attachment(
                             message_id,uploader_mailbox_id,object_key,filename,content_type,
                             size_bytes,sha256,scan_state,content_id,disposition,source_attachment_id
                           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
                        mid,
                        mailbox_id,
                        copied["object_key"],
                        copied["filename"],
                        copied["content_type"],
                        copied["size_bytes"],
                        copied["sha256"],
                        copied["scan_state"],
                        copied["content_id"],
                        copied["disposition"],
                        copied["source_attachment_id"],
                    )

                for image, key in zip(new_inline_images, inline_image_keys, strict=True):
                    await conn.execute(
                        """INSERT INTO attachment(
                             message_id,uploader_mailbox_id,object_key,filename,content_type,
                             size_bytes,sha256,scan_state,content_id,disposition
                           ) VALUES($1,$2,$3,$4,$5,$6,$7,'unscanned',$8,'inline')""",
                        mid,
                        mailbox_id,
                        key,
                        image.filename,
                        image.content_type,
                        len(image.data),
                        hashlib.sha256(image.data).hexdigest(),
                        image.content_id,
                    )

                for kind in ("to", "cc", "bcc"):
                    for address_value in payload.get(kind, []) or []:
                        address = _safe_header(str(address_value), "recipient").lower()
                        if not _EMAIL.fullmatch(address):
                            raise ValueError("Invalid recipient address")
                        await conn.execute(
                            "INSERT INTO message_recipient(message_id,kind,address) "
                            "VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                            mid,
                            kind,
                            address,
                        )

                existing_attachment_bytes = await conn.fetchval(
                    "SELECT coalesce(sum(size_bytes),0) FROM attachment WHERE message_id=$1", mid
                )
                body_size = len(text.encode("utf-8")) + len((body_html or "").encode("utf-8"))
                quoted_size = len((preserved_quote_html or "").encode("utf-8"))
                total_size = body_size + quoted_size + int(existing_attachment_bytes or 0)
                maximum_message = int(await get_value("mail.max_message_mb")) * 1024 * 1024
                if total_size > maximum_message:
                    raise ValueError("Message exceeds the configured maximum size.")
                quota_bytes = int(await get_value("mail.mailbox_quota_mb")) * 1024 * 1024
                used_bytes = await conn.fetchval(
                    """SELECT coalesce(sum(m.size_bytes),0) + coalesce((
                         SELECT sum(a.size_bytes) FROM attachment a
                         WHERE a.uploader_mailbox_id=$1 AND a.message_id IS NULL
                       ),0)
                       FROM mailbox_message mm JOIN message m ON m.id=mm.message_id
                       WHERE mm.mailbox_id=$1 AND m.id<>$2""",
                    mailbox_id,
                    mid,
                )
                if int(used_bytes or 0) + total_size > quota_bytes:
                    raise ValueError("Mailbox storage quota would be exceeded.")
                if draft_id:
                    if payload.get("remove_quote"):
                        await conn.execute(
                            """UPDATE message SET subject=$2,body_text=$3,body_html=$4,body_format=$5,
                               snippet=$6,render_notes=$7::jsonb,sanitizer_version=$8,size_bytes=$9,
                               in_reply_to=COALESCE($10,in_reply_to),quoted_html=NULL,quote_kind=NULL,quote_source_message_id=NULL
                               WHERE id=$1""",
                            mid, subject, text, body_html, body_format, make_snippet(text),
                            json.dumps(render_notes), POLICY_VERSION, total_size, reply_header,
                        )
                    else:
                        await conn.execute(
                            """UPDATE message SET subject=$2,body_text=$3,body_html=$4,body_format=$5,
                               snippet=$6,render_notes=$7::jsonb,sanitizer_version=$8,size_bytes=$9,
                               in_reply_to=COALESCE($10,in_reply_to) WHERE id=$1""",
                            mid, subject, text, body_html, body_format, make_snippet(text),
                            json.dumps(render_notes), POLICY_VERSION, total_size, reply_header,
                        )
                else:
                    await conn.execute(
                        """UPDATE message SET subject=$2,body_text=$3,body_html=$4,body_format=$5,
                           snippet=$6,render_notes=$7::jsonb,sanitizer_version=$8,size_bytes=$9,
                           in_reply_to=$10,quoted_html=$11,quote_kind=$12,quote_source_message_id=$13
                           WHERE id=$1""",
                        mid, subject, text, body_html, body_format, make_snippet(text),
                        json.dumps(render_notes), POLICY_VERSION, total_size, reply_header,
                        quoted_html, quote_kind, quote_source_message_id,
                    )
                if quote:
                    action = "mail.reply.create" if quote_kind_requested in {"reply", "reply_all"} else "mail.forward.create"
                    await _audit(
                        conn,
                        user_id,
                        action,
                        mailbox_id,
                        mid,
                        {"attachments": copied_attachments, "bytes": copied_attachment_bytes},
                    )

                attachment_output = await conn.fetch(
                    "SELECT id,filename,content_type,size_bytes,sha256,scan_state,disposition,"
                    "content_id,blocked_reason FROM attachment WHERE message_id=$1 ORDER BY created_at",
                    mid,
                )
                return_value = {
                    "id": str(draft_item_id),
                    "message_id": str(mid),
                    "status": "draft",
                    "body_html": body_html,
                    "body_text": text,
                    "quoted_html": preserved_quote_html,
                    "attachments": [dict(item) for item in attachment_output],
                }
        # Deleting old inline image objects after commit avoids orphaning references on rollback.
        for key in old_inline_keys:
            try:
                await storage.delete(Bucket.MAIL, key)
            except Exception:
                pass
        if copied_attachment_rows or new_inline_images:
            from app.modules.mail.scan_queue import kick as kick_scan
            kick_scan()
        return return_value
    except Exception:
        for key in stored_keys:
            try:
                await storage.delete(Bucket.MAIL, key)
            except Exception:
                pass
        raise


async def send_draft(user_id: str, draft_id: str, mailbox_id: str):
    """Freeze a draft, preserve recipient kinds, and queue external delivery."""
    from html import escape

    from app.modules.mail.html_policy import compose_final_html, remove_missing_cids

    await _assert_enabled()
    pool = db.get_pool()
    domain = await _domain()
    async with pool.acquire() as conn:
        async with conn.transaction():
            box = await _membership(conn, mailbox_id, user_id, send=True)
            draft = await conn.fetchrow(
                "SELECT mm.message_id,mm.folder,m.* FROM mailbox_message mm "
                "JOIN message m ON m.id=mm.message_id "
                "WHERE mm.id=$1 AND mm.mailbox_id=$2 AND mm.folder IN ('drafts','sent') FOR UPDATE",
                draft_id,
                mailbox_id,
            )
            if draft and draft["folder"] == "sent":
                return {"message_id": str(draft["message_id"]), "already_sent": True}
            if not draft:
                from app.core.errors import NotFound

                raise NotFound("Draft not found.")

            # Use an escaped plain-text wrapper if this draft has not opted into HTML.
            body_html = draft["body_html"]
            if body_html is None and draft["quoted_html"]:
                body_html = f"<pre>{escape(str(draft['body_text'] or ''))}</pre>"
            signature = await conn.fetchval(
                "SELECT body_text FROM mailbox_signature WHERE mailbox_id=$1", mailbox_id
            )
            if signature and str(signature).strip():
                signature_html = f"<div class=\"mail-signature\"><pre>{escape(str(signature))}</pre></div>"
                body_html = (body_html or f"<pre>{escape(str(draft['body_text'] or ''))}</pre>") + signature_html
            final_html = compose_final_html(
                body_html=body_html or "",
                quoted_html=draft["quoted_html"],
            ) if body_html is not None or draft["quoted_html"] else None
            render_notes = _json_object(draft.get("render_notes"))
            if final_html:
                attachment_cids = await conn.fetch(
                    "SELECT content_id FROM attachment WHERE message_id=$1 "
                    "AND disposition='inline' AND blocked_reason IS NULL",
                    draft["message_id"],
                )
                valid_cids = {str(item["content_id"]).strip("<>").lower() for item in attachment_cids if item["content_id"]}
                final_html, missing_cids = remove_missing_cids(final_html, valid_cids)
                if missing_cids:
                    render_notes["missing_inline_image"] = int(render_notes.get("missing_inline_image", 0)) + missing_cids
                provider_name = str(await get_value("mail.provider") or "console").lower()
                if provider_name in {"resend", "brevo"}:
                    inline_count = await conn.fetchval(
                        "SELECT count(*) FROM attachment WHERE message_id=$1 "
                        "AND disposition='inline' AND blocked_reason IS NULL",
                        draft["message_id"],
                    )
                    if int(inline_count or 0):
                        render_notes["inline_images_sent_as_attachments"] = int(inline_count)
                final_text = html_to_text(final_html)
            else:
                final_text = str(draft["body_text"] or "")
                if signature and str(signature).strip():
                    final_text = f"{final_text}\n\n{str(signature)}".strip()

            message_id_header = str(draft.get("message_id_header") or f"<{draft['message_id']}@{domain}>")
            parent = None
            reply_header = _rfc_message_id(draft["in_reply_to"])
            if draft["in_reply_to"]:
                # Threading is best effort: a lookup problem must never stop the message from being sent.
                # The lookups are split so each can use an index (an OR across a cast id and the header
                # forced a scan of the whole message table on every reply).
                try:
                    async with conn.transaction():
                        target = str(draft["in_reply_to"]).strip()
                        # The draft already remembers which message it answers. Primary-key lookup:
                        # no search, and it does not depend on header text matching.
                        source_id = draft["quote_source_message_id"]
                        if source_id:
                            parent = await conn.fetchrow(
                                "SELECT id,thread_id,message_id_header,references_header FROM message "
                                "WHERE id=$1 LIMIT 1",
                                source_id,
                            )
                        if not parent:
                            # Fallback for drafts without a stored source; served by message_header_idx.
                            parent = await conn.fetchrow(
                                "SELECT id,thread_id,message_id_header,references_header FROM message "
                                "WHERE message_id_header=$1 LIMIT 1",
                                target,
                            )
                        if not parent:
                            try:
                                parent_uuid = uuid.UUID(target)
                            except ValueError:
                                parent_uuid = None
                            if parent_uuid:
                                parent = await conn.fetchrow(
                                    "SELECT id,thread_id,message_id_header,references_header FROM message "
                                    "WHERE id=$1 LIMIT 1",
                                    parent_uuid,
                                )
                        if parent:
                            await conn.execute(
                                "UPDATE message SET thread_id=COALESCE($2::uuid,$3::uuid) WHERE id=$1",
                                draft["message_id"],
                                parent["thread_id"],
                                parent["id"],
                            )
                except Exception as threading_error:
                    parent = None
                    log.warning("reply threading skipped type=%s", type(threading_error).__name__)
            else:
                await conn.execute(
                    "UPDATE message SET thread_id=COALESCE(thread_id,id) WHERE id=$1",
                    draft["message_id"],
                )
            if parent and _rfc_message_id(parent["message_id_header"]):
                reply_header = _rfc_message_id(parent["message_id_header"])
            references = []
            if parent and parent["references_header"]:
                references.extend(str(parent["references_header"]).split())
            if parent and parent["message_id_header"]:
                parent_id = str(parent["message_id_header"])
                if parent_id not in references:
                    references.append(parent_id)
            references_header = " ".join(references) or draft.get("references_header")

            all_recipients = await conn.fetch(
                "SELECT kind,address FROM message_recipient WHERE message_id=$1 "
                "ORDER BY CASE kind WHEN 'to' THEN 1 WHEN 'cc' THEN 2 ELSE 3 END",
                draft["message_id"],
            )
            unique_recipients = []
            seen = set()
            for recipient in all_recipients:
                address = str(recipient["address"]).lower()
                if address not in seen:
                    seen.add(address)
                    unique_recipients.append({"kind": recipient["kind"], "address": address})
            if not unique_recipients:
                raise ValueError("Add at least one recipient before sending.")
            if len(unique_recipients) > int(await get_value("mail.message_recipient_limit")):
                raise ValueError("Recipient limit exceeded.")

            local_domains = {
                domain,
                *[str(item).lower() for item in (await get_value("mail.accepted_domains") or [])],
            }
            local = []
            external_by_kind = {"to": [], "cc": [], "bcc": []}
            for recipient in unique_recipients:
                address = recipient["address"]
                localpart, _, recipient_domain = address.partition("@")
                if recipient_domain in local_domains:
                    target = await conn.fetchrow(
                        "SELECT id,state FROM mailbox WHERE local_part=$1 "
                        "UNION ALL SELECT b.id,b.state FROM mailbox_alias a "
                        "JOIN mailbox b ON b.id=a.mailbox_id WHERE a.local_part=$1 LIMIT 1",
                        localpart,
                    )
                    if target and target["state"] == "open":
                        local.append((target["id"], address))
                        await conn.execute(
                            "UPDATE message_recipient SET mailbox_id=$3 "
                            "WHERE message_id=$1 AND address=$2",
                            draft["message_id"],
                            address,
                            target["id"],
                        )
                    else:
                        reason = "This mailbox is closed." if target else "No such mailbox."
                        bounce = await conn.fetchval(
                            "INSERT INTO message(from_address,from_name,subject,body_text,origin) "
                            "VALUES($1,'Mail Delivery Subsystem','Delivery status notification',$2,'internal') RETURNING id",
                            f"mailer-daemon@{domain}",
                            reason,
                        )
                        await conn.execute(
                            "INSERT INTO mailbox_message(mailbox_id,message_id,folder) "
                            "VALUES($1,$2,'inbox') ON CONFLICT DO NOTHING",
                            mailbox_id,
                            bounce,
                        )
                else:
                    external_by_kind[recipient["kind"]].append(address)

            external_addresses = [
                address
                for kind in ("to", "cc", "bcc")
                for address in external_by_kind[kind]
            ]
            if external_addresses:
                global_enabled = bool(await get_value("mail.external_enabled"))
                allowed = global_enabled and box["external_allowed"] is not False
                if not allowed or box["sending_suspended"] or bool(await get_value("mail.suspend_all_sending")):
                    raise ValueError("External sending is disabled or suspended for this mailbox.")
                suppressed = await conn.fetch(
                    "SELECT address FROM suppression WHERE address=ANY($1::citext[])",
                    external_addresses,
                )
                local_blocks = await conn.fetch(
                    "SELECT address FROM mailbox_blocked_sender "
                    "WHERE mailbox_id=$1 AND address=ANY($2::citext[])",
                    mailbox_id,
                    external_addresses,
                )
                blocked = {str(item["address"]).lower() for item in [*suppressed, *local_blocks]}
                filtered_by_kind = {
                    kind: [address for address in addresses if address not in blocked]
                    for kind, addresses in external_by_kind.items()
                }
                blocked_count = sum(
                    len(external_by_kind[kind]) - len(filtered_by_kind[kind])
                    for kind in external_by_kind
                )
                external_by_kind = filtered_by_kind
                external_addresses = [
                    address
                    for kind in ("to", "cc", "bcc")
                    for address in external_by_kind[kind]
                ]
                if blocked_count:
                    notice = await conn.fetchval(
                        "INSERT INTO message(from_address,from_name,subject,body_text,origin) "
                        "VALUES($1,'Bloomwell Home Care Uganda','Some recipients were not sent',$2,'internal') RETURNING id",
                        f"no-reply@{domain}",
                        f"{blocked_count} external recipient(s) were suppressed or blocked. No message was sent to them.",
                    )
                    await conn.execute(
                        "INSERT INTO mailbox_message(mailbox_id,message_id,folder) VALUES($1,$2,'inbox')",
                        mailbox_id,
                        notice,
                    )
                if external_addresses:
                    attachment_rows = await conn.fetch(
                        "SELECT size_bytes,scan_state,blocked_reason FROM attachment WHERE message_id=$1",
                        draft["message_id"],
                    )
                    if any(item["blocked_reason"] or item["scan_state"] in {"blocked", "infected"} for item in attachment_rows):
                        raise ValueError("A blocked attachment must be removed before sending.")
                    if any(item["scan_state"] == "pending" for item in attachment_rows):
                        raise ValueError("An attachment is still being processed. Please retry shortly.")
                    if bool(await get_value("mail.scan_enabled")) and str(await get_value("mail.scan_fail_mode") or "allow") == "block" and any(item["scan_state"] != "clean" for item in attachment_rows):
                        raise ValueError("Every attachment must pass security scanning before sending.")
                    attachment_bytes = sum(int(item["size_bytes"] or 0) for item in attachment_rows)
                    html_bytes = len((final_html or "").encode("utf-8"))
                    text_bytes = len(final_text.encode("utf-8"))
                    estimated_bytes = html_bytes + text_bytes + ((attachment_bytes * 4 + 2) // 3)
                    configured_limit = min(
                        int(await get_value("mail.max_message_mb")),
                        int(await get_value("mail.provider_max_message_mb")),
                    ) * 1024 * 1024
                    if estimated_bytes > configured_limit:
                        actual_mb = estimated_bytes / (1024 * 1024)
                        limit_mb = configured_limit / (1024 * 1024)
                        raise ValueError(
                            f"This message is about {actual_mb:.1f} MB; the limit for external mail is {limit_mb:.0f} MB."
                        )
                    daily_limit = int(await get_value("mail.mailbox_daily_external_limit"))
                    day_count = await conn.fetchval(
                        "INSERT INTO send_counter(scope,window_kind,window_start,count) "
                        "VALUES($1,'day',current_date,$2) ON CONFLICT(scope,window_kind,window_start) "
                        "DO UPDATE SET count=send_counter.count+EXCLUDED.count RETURNING count",
                        f"mailbox:{mailbox_id}",
                        len(external_addresses),
                    )
                    if int(day_count) > daily_limit:
                        raise ValueError("This mailbox has reached its daily external recipient limit.")
                    key_material = "|".join(
                        f"{kind}:{','.join(external_by_kind[kind])}" for kind in ("to", "cc", "bcc")
                    )
                    key = hashlib.sha256((str(draft["message_id"]) + "|" + key_material).encode()).hexdigest()
                    await conn.execute(
                        "INSERT INTO outbox(message_id,from_mailbox_id,to_addresses,cc_addresses,"
                        "bcc_addresses,idempotency_key,priority) VALUES($1,$2,$3,$4,$5,$6,5) "
                        "ON CONFLICT(idempotency_key) DO NOTHING",
                        draft["message_id"],
                        mailbox_id,
                        external_by_kind["to"],
                        external_by_kind["cc"],
                        external_by_kind["bcc"],
                        key,
                    )
                    await conn.execute(
                        "UPDATE message SET origin='outbound' WHERE id=$1", draft["message_id"]
                    )

            attachment_rows = await conn.fetch(
                "SELECT size_bytes FROM attachment WHERE message_id=$1 AND blocked_reason IS NULL",
                draft["message_id"],
            )
            attachment_bytes = sum(int(item["size_bytes"] or 0) for item in attachment_rows)
            size_bytes = len(final_text.encode("utf-8")) + len((final_html or "").encode("utf-8")) + attachment_bytes
            await conn.execute(
                "UPDATE message SET body_text=$2,body_html=$3,body_format=$4,quoted_html=NULL,"
                "message_id_header=$5,references_header=$6,snippet=$7,render_notes=$8::jsonb,"
                "sanitizer_version=$9,size_bytes=$10,in_reply_to=$11 WHERE id=$1",
                draft["message_id"],
                final_text,
                final_html,
                "html" if final_html is not None else "plain",
                message_id_header,
                references_header,
                make_snippet(final_text),
                json.dumps(render_notes),
                POLICY_VERSION,
                size_bytes,
                reply_header,
            )
            for target, _address in local:
                await conn.execute(
                    "INSERT INTO mailbox_message(mailbox_id,message_id,folder) "
                    "VALUES($1,$2,'inbox') ON CONFLICT DO NOTHING",
                    target,
                    draft["message_id"],
                )
            if local:
                from app.modules.mail.notify import notify_new_mail

                notify_new_mail(
                    [target for target, _address in local if str(target) != str(mailbox_id)],
                    sender=str(draft["from_address"] or ""),
                    subject=str(draft["subject"] or ""),
                    exclude_user_id=user_id,
                )
            for recipient in unique_recipients:
                await conn.execute(
                    "INSERT INTO mailbox_contact(mailbox_id,address,last_used_at) "
                    "VALUES($1,$2,now()) ON CONFLICT(mailbox_id,address) "
                    "DO UPDATE SET last_used_at=now()",
                    mailbox_id,
                    recipient["address"],
                )
            await conn.execute(
                "UPDATE mailbox_message SET folder='sent',is_read=true WHERE id=$1", draft_id
            )

            # Local-only sends have no outbox worker to create the frozen .eml.
            # Save that copy here as well; failures must never undo a successful
            # internal delivery. External sends are saved by outbox.drain after
            # the provider accepts the exact payload.
            if not external_addresses and bool(await get_value("mail.store_sent_eml")):
                sent_key = f"mail/sent/{draft['message_id']}.eml"
                try:
                    from app.core.storage import Bucket, get_storage
                    from app.modules.mail.mime_build import build_eml

                    sent_attachments = []
                    stored_rows = await conn.fetch(
                        "SELECT object_key,filename,content_type,sha256,content_id,disposition "
                        "FROM attachment WHERE message_id=$1 AND blocked_reason IS NULL "
                        "ORDER BY created_at",
                        draft["message_id"],
                    )
                    storage = get_storage()
                    for item in stored_rows:
                        if not item["object_key"]:
                            raise ValueError("sent copy attachment unavailable")
                        data = await storage.get(Bucket.MAIL, item["object_key"])
                        if hashlib.sha256(data).hexdigest() != str(item["sha256"]):
                            raise ValueError("sent copy attachment integrity check failed")
                        sent_attachments.append(
                            {
                                "data": data,
                                "filename": item["filename"],
                                "content_type": item["content_type"],
                                "content_id": item["content_id"],
                                "disposition": item["disposition"],
                            }
                        )
                    sent_recipients = {
                        kind: [item["address"] for item in unique_recipients if item["kind"] == kind]
                        for kind in ("to", "cc", "bcc")
                    }
                    eml = build_eml(
                        {
                            "from_address": f"{box['local_part']}@{domain}",
                            "from_name": box.get("display_name") or await get_value("mail.from_name"),
                            "subject": draft["subject"],
                            "body_text": final_text,
                            "body_html": final_html,
                            "message_id_header": message_id_header,
                            "in_reply_to": reply_header,
                            "references_header": references_header,
                        },
                        sent_attachments,
                        sent_recipients,
                    )
                    await storage.put(Bucket.MAIL, sent_key, eml, "message/rfc822")
                    await conn.execute(
                        "UPDATE message SET sent_eml_key=$2 WHERE id=$1",
                        draft["message_id"],
                        sent_key,
                    )
                except Exception as eml_error:
                    log.warning(
                        "local sent message copy could not be stored type=%s",
                        type(eml_error).__name__,
                    )
            await _audit(
                conn,
                user_id,
                "mail.send",
                mailbox_id,
                draft["message_id"],
                {
                    "local": len(local),
                    "external": len(external_addresses),
                    "attachments": len(attachment_rows),
                    "bytes": size_bytes,
                },
            )
            return {
                "message_id": str(draft["message_id"]),
                "local_deliveries": len(local),
                "external_queued": len(external_addresses),
            }


async def ensure_default_mailbox_if_configured(user: Any):
    """Account lifecycle hook: never make Mongo account creation depend on optional mail infra."""
    if not str(await get_value("mail.domain") or "").strip():
        return None
    return await ensure_default_mailbox(user)


async def close_personal_mailbox(user_id: str, closed: bool = True):
    pool=db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("UPDATE mailbox SET state=$2,closed_at=CASE WHEN $2='closed' THEN now() ELSE NULL END WHERE owner_user_id=$1 AND kind='personal' RETURNING id",user_id,"closed" if closed else "open")
        if row:
            await _audit(conn,user_id,"mail.mailbox.close" if closed else "mail.mailbox.reopen",row['id'])
        return dict(row) if row else None


async def add_name_alias(user: Any):
    pool=db.get_pool(); domain=await _domain(); user_id=str(user.id)
    box=await pool.fetchrow("SELECT id,local_part FROM mailbox WHERE owner_user_id=$1 AND kind='personal' AND state='open'",user_id)
    if not box: return None
    pattern=str(await get_value('mail.address_pattern') or '{first}.{last}')
    bits=str(getattr(user,'name','')).strip().split()
    staff_no=getattr(user,'staff_number','') or ''
    if '{staff_no}' in pattern and not staff_no:
        try:
            from app.modules.nurses.models import NurseProfile
            profile=await NurseProfile.find_one(NurseProfile.user_id == user_id)
            staff_no=profile.staff_number if profile else ''
        except Exception:
            staff_no=''
    base=_local_part(pattern.format(first=bits[0] if bits else '',last=bits[-1] if len(bits)>1 else '',staff_no=staff_no))
    if not base or base in _RESERVED: return None
    async with pool.acquire() as conn:
        async with conn.transaction():
            for suffix in range(1,10000):
                candidate=base if suffix==1 else f'{base}{suffix}'
                await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",candidate)
                used=await conn.fetchval("SELECT EXISTS(SELECT 1 FROM mailbox WHERE local_part=$1) OR EXISTS(SELECT 1 FROM mailbox_alias WHERE local_part=$1)",candidate)
                if not used:
                    await conn.execute("INSERT INTO mailbox_alias(mailbox_id,local_part) VALUES($1,$2)",box['id'],candidate)
                    await _audit(conn,user_id,'mail.mailbox.alias',box['id'],detail={'alias_added':True})
                    return f'{candidate}@{domain}'
    return None


async def remove_draft_attachment(user_id: str, draft_id: str, attachment_id: str) -> dict[str, Any]:
    """Detach and delete a file from a draft the person may send from. Sent mail is never changed."""
    from app.core.errors import NotFound

    await _assert_enabled()
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            draft = await conn.fetchrow("SELECT mailbox_id,message_id FROM mailbox_message WHERE id=$1 AND folder='drafts'", draft_id)
            if not draft:
                raise NotFound("Draft not found.")
            await _membership(conn, draft["mailbox_id"], user_id, send=True)
            attachment = await conn.fetchrow(
                "SELECT id,object_key,size_bytes FROM attachment WHERE id=$1 AND message_id=$2",
                attachment_id, draft["message_id"],
            )
            if not attachment:
                raise NotFound("Attachment not found on this draft.")
            await conn.execute(
                "UPDATE message SET size_bytes=greatest(0,size_bytes-$2) WHERE id=$1",
                draft["message_id"], attachment["size_bytes"],
            )
            await conn.execute("DELETE FROM attachment WHERE id=$1", attachment_id)
            await _audit(conn, user_id, "mail.attachment.remove", draft["mailbox_id"], draft["message_id"], {"attachment_id": str(attachment_id)})
    try:
        from app.core.storage import Bucket, get_storage

        await get_storage().delete(Bucket.MAIL, attachment["object_key"])
    except Exception:  # The row is gone, so the file can no longer be reached; a leftover object is cleaned up by retention.
        pass
    return {"removed": True}


async def suggest_contacts(user_id: str, q: str | None, limit: int | None = None) -> dict[str, list[dict[str, Any]]]:
    """Address suggestions for the compose fields: people this user mailed recently, then the in-house directory."""
    await _assert_enabled()
    cap = int(limit or await get_value("mail.contacts_suggestion_limit") or 8)
    cap = max(1, min(cap, 25))
    needle = (q or "").strip().lower()
    like = f"%{needle.replace(chr(92), chr(92) * 2).replace('%', chr(92) + '%').replace('_', chr(92) + '_')}%" if needle else None
    pool = db.get_pool()
    recent: list[dict[str, Any]] = []
    directory: list[dict[str, Any]] = []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """WITH mine AS (SELECT mailbox_id FROM mailbox_member WHERE user_id=$1),
                    seen AS (
                      SELECT r.address::text AS address, max(r.name) AS name, max(mm.received_at) AS at
                        FROM mailbox_message mm JOIN mine ON mine.mailbox_id=mm.mailbox_id
                        JOIN message_recipient r ON r.message_id=mm.message_id
                       WHERE mm.folder='sent' AND r.kind IN ('to','cc')
                       GROUP BY r.address
                      UNION ALL
                      SELECT m.from_address::text, max(m.from_name), max(mm.received_at)
                        FROM mailbox_message mm JOIN mine ON mine.mailbox_id=mm.mailbox_id
                        JOIN message m ON m.id=mm.message_id
                       WHERE mm.folder='inbox' AND m.origin <> 'internal'
                       GROUP BY m.from_address)
               SELECT address, max(name) AS name, max(at) AS at FROM seen
                WHERE ($2::text IS NULL OR address ILIKE $2 ESCAPE '\\' OR coalesce(name,'') ILIKE $2 ESCAPE '\\')
                GROUP BY address ORDER BY max(at) DESC LIMIT $3""",
            user_id, like, cap,
        )
        recent = [{"address": str(r["address"]).lower(), "name": r["name"] or None, "source": "recent"} for r in rows]
        if bool(await get_value("mail.contacts_directory_enabled")) and needle:
            domain = await _domain()
            rows = await conn.fetch(
                """SELECT b.local_part, b.display_name, b.kind, b.owner_user_id FROM mailbox b
                    WHERE b.state='open' AND b.local_part <> 'no-reply'
                      AND (b.local_part ILIKE $1 ESCAPE '\\' OR coalesce(b.display_name,'') ILIKE $1 ESCAPE '\\')
                    ORDER BY b.display_name NULLS LAST, b.local_part LIMIT $2""",
                like, cap,
            )
            taken = {item["address"] for item in recent}
            from app.modules.mail.mailbox_admin import existing_user_ids
            alive = await existing_user_ids([r["owner_user_id"] for r in rows if r["kind"] == "personal" and r["owner_user_id"]])
            for r in rows:
                if r["kind"] == "personal" and r["owner_user_id"] not in alive:
                    continue
                address = f"{r['local_part']}@{domain}".lower()
                if address not in taken:
                    directory.append({"address": address, "name": r["display_name"] or None, "source": "directory"})
    return {"recent": recent, "directory": directory}


async def retry_delivery(user_id: str, item_id: str) -> dict:
    """Re-queue a deferred/failed/queued outbound message the caller can see in Sent."""
    from app.core.errors import Forbidden, NotFound
    await _assert_enabled()
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT mm.mailbox_id, mm.message_id, mm.folder FROM mailbox_message mm "
                "JOIN mailbox_member mem ON mem.mailbox_id=mm.mailbox_id "
                "WHERE mm.id=$1 AND mem.user_id=$2",
                item_id, user_id,
            )
            if not row or row["folder"] != "sent":
                raise NotFound("Message not found.")
            outbox_row = await conn.fetchrow(
                "SELECT id,state FROM outbox WHERE message_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
                row["message_id"],
            )
            if not outbox_row:
                raise NotFound("This message has no delivery record.")
            if outbox_row["state"] not in ("deferred", "failed", "queued"):
                raise Forbidden("This message is not waiting to be delivered.")
            await conn.execute(
                "UPDATE outbox SET state='queued',attempts=0,next_attempt_at=now(),claimed_at=NULL,last_error=NULL "
                "WHERE id=$1",
                outbox_row["id"],
            )
            await _audit(conn, user_id, "mail.retry_delivery", row["mailbox_id"], row["message_id"])
    try:
        from app.modules.mail.outbox import kick
        kick()
    except Exception:
        log.warning("mail retry kick failed; the worker will pick it up")
    return {"queued": True}
