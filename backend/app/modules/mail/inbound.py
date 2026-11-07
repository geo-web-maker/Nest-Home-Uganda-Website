"""Authenticated Cloudflare Email Worker ingestion with loss-conscious MIME handling."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
import uuid
from email.utils import getaddresses
from typing import Any

from app.core.storage import Bucket, get_storage
from app.modules.mail import db
from app.modules.mail.html_policy import POLICY_VERSION, html_to_text, make_snippet, remove_missing_cids, sanitize_html
from app.modules.mail.mime_parse import ParsedAttachment, parse_message
from app.modules.mail.settings_service import get_value

log = logging.getLogger("app.mail.inbound")


async def ingest(payload: dict[str, Any], timestamp: str, signature: str) -> dict[str, Any]:
    if not bool(await get_value("mail.enabled")) or not bool(await get_value("mail.inbound_enabled")):
        raise PermissionError("Inbound mail is disabled")
    secret = str(await get_value("mail.inbound_webhook_secret") or "")
    if not secret:
        raise PermissionError("Inbound webhook is not configured")
    if not timestamp.isdigit() or abs(int(time.time()) - int(timestamp)) > 300:
        raise PermissionError("Expired inbound request")

    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    expected = hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise PermissionError("Invalid inbound signature")

    raw_key = str(payload.get("object_key", ""))
    if not raw_key.startswith("mail/inbound/") or ".." in raw_key:
        raise ValueError("Invalid raw object key")
    raw = await get_storage().get(Bucket.MAIL, raw_key)
    if len(raw) > 25 * 1024 * 1024:
        raise ValueError("Inbound message exceeds 25 MiB")

    max_attachment_bytes = int(await get_value("mail.max_attachment_mb")) * 1024 * 1024
    max_html_bytes = int(await get_value("mail.max_html_kb")) * 1024
    blocked_extensions = {
        item.strip().lower().lstrip(".")
        for item in str(await get_value("mail.blocked_extensions") or "").split(",")
        if item.strip()
    }
    parsed = parse_message(
        raw,
        blocked_extensions=blocked_extensions,
        max_attachment_bytes=max_attachment_bytes,
        max_html_bytes=max_html_bytes,
        max_text_bytes=2_000_000,
    )

    render_notes: dict[str, Any] = dict(parsed.notes)
    body_html: str | None = None
    body_text = parsed.text_body
    if parsed.html_body is not None:
        filtered = sanitize_html(
            parsed.html_body,
            block_remote_images=bool(await get_value("mail.block_remote_images")),
            max_bytes=max_html_bytes,
        )
        body_html = filtered.html
        for key, value in filtered.notes.items():
            if key == "removed_tags":
                merged = dict(render_notes.get(key, {}))
                for tag, count in value.items():
                    merged[tag] = int(merged.get(tag, 0)) + int(count)
                render_notes[key] = merged
            elif isinstance(value, int) and not isinstance(value, bool):
                render_notes[key] = int(render_notes.get(key, 0)) + value
            elif value:
                render_notes[key] = value
        if not body_text:
            body_text = html_to_text(body_html)

    valid_cids = {
        attachment.content_id.lower()
        for attachment in parsed.attachments
        if attachment.content_id and attachment.disposition == "inline" and not attachment.blocked_reason
    }
    if body_html:
        body_html, missing = remove_missing_cids(body_html, valid_cids)
        if missing:
            render_notes["missing_inline_image"] = int(render_notes.get("missing_inline_image", 0)) + missing
    if parsed.notes.get("signed"):
        render_notes["signed"] = True
    snippet = make_snippet(body_text)
    envelope_to = [
        str(item).strip().lower()
        for item in payload.get("envelope_to", [])
        if isinstance(item, str) and "@" in item
    ]
    pool = db.get_pool()
    domain = str(await get_value("mail.domain") or "").lower()
    auth_results = payload.get("auth_results") or {}
    spam = 10.0 if (
        str(auth_results.get("dmarc", "")).lower() == "fail"
        and bool(await get_value("mail.quarantine_dmarc_fail"))
    ) else 0.0
    folder = "spam" if spam >= float(await get_value("mail.spam_score_threshold")) else "inbox"
    stored_keys: list[str] = []

    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                duplicate = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM message WHERE "
                    "($1::text IS NOT NULL AND message_id_header=$1) OR raw_object_key=$2)",
                    parsed.message_id or None,
                    raw_key,
                )
                if duplicate:
                    return {"duplicate": True}

                # Store only allowed attachment bytes. Blocked files remain metadata-only rows;
                # the original raw MIME remains in inbound storage for administrator recovery.
                stored: list[tuple[ParsedAttachment, str | None]] = []
                for attachment in parsed.attachments:
                    object_key = None
                    if not attachment.blocked_reason:
                        object_key = f"mail/attachments/{uuid.uuid4()}"
                        await get_storage().put(
                            Bucket.MAIL, object_key, attachment.data, attachment.content_type
                        )
                        stored_keys.append(object_key)
                    stored.append((attachment, object_key))

                message_id = await conn.fetchval(
                    """INSERT INTO message(
                         message_id_header,in_reply_to,references_header,thread_id,
                         from_address,from_name,subject,body_text,body_html,body_format,
                         snippet,render_notes,sanitizer_version,origin,size_bytes,raw_object_key
                       ) VALUES(
                         $1,$2,$3,
                         (SELECT COALESCE(thread_id,id) FROM message WHERE message_id_header=$2 LIMIT 1),
                         $4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,'inbound',$13,$14
                       ) RETURNING id""",
                    parsed.message_id or None,
                    parsed.in_reply_to or None,
                    parsed.references or None,
                    parsed.from_address or "unknown@invalid.local",
                    parsed.from_name or None,
                    parsed.subject,
                    body_text[:2_000_000],
                    body_html,
                    "html" if body_html is not None else "plain",
                    snippet,
                    json.dumps(render_notes),
                    POLICY_VERSION,
                    len(raw),
                    raw_key,
                )

                # Preserve header recipients separately from envelope delivery recipients.
                for kind, addresses in (("to", parsed.to), ("cc", parsed.cc)):
                    for address in addresses:
                        await conn.execute(
                            "INSERT INTO message_recipient(message_id,kind,address) "
                            "VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                            message_id,
                            kind,
                            address,
                        )

                for attachment, object_key in stored:
                    await conn.execute(
                        """INSERT INTO attachment(
                             message_id,object_key,filename,content_type,size_bytes,sha256,
                             scan_state,content_id,disposition,blocked_reason
                           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
                        message_id,
                        object_key,
                        attachment.filename,
                        attachment.content_type,
                        attachment.size_bytes,
                        attachment.sha256,
                        "blocked" if attachment.blocked_reason else "unscanned",
                        attachment.content_id,
                        attachment.disposition,
                        attachment.blocked_reason,
                    )

                delivered = 0
                routing: list[dict[str, str]] = []
                notify_ids: list = []
                if not envelope_to:
                    routing.append({"address": "", "status": "no_envelope_to"})
                for address in envelope_to:
                    local_part, separator, recipient_domain = address.partition("@")
                    accepted = await get_value("mail.accepted_domains") or []
                    if not separator or recipient_domain not in {
                        domain,
                        *[str(item).lower() for item in accepted],
                    }:
                        routing.append({"address": address, "status": "foreign_domain"})
                        continue
                    mailbox = await conn.fetchrow(
                        """SELECT id,state,local_part::text AS local_part FROM mailbox WHERE local_part=$1
                           UNION ALL
                           SELECT target.id,target.state,target.local_part::text FROM mailbox_alias alias
                           JOIN mailbox target ON target.id=alias.mailbox_id
                           WHERE alias.local_part=$1 LIMIT 1""",
                        local_part,
                    )
                    if mailbox and str(mailbox["local_part"]).lower() == "no-reply":
                        # System sender: it is shared so staff can view what was sent, but it
                        # never receives mail, whether addressed directly or through an alias.
                        routing.append({"address": address, "status": "receive_blocked"})
                        continue
                    if not mailbox or mailbox["state"] != "open":
                        routing.append({"address": address, "status": "no_mailbox" if not mailbox else "mailbox_closed"})
                        continue
                    await conn.execute(
                        "INSERT INTO message_recipient(message_id,kind,address,mailbox_id) "
                        "VALUES($1,'to',$2,$3) ON CONFLICT DO NOTHING",
                        message_id,
                        address,
                        mailbox["id"],
                    )
                    await conn.execute(
                        "INSERT INTO mailbox_message(mailbox_id,message_id,folder) "
                        "VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                        mailbox["id"],
                        message_id,
                        folder,
                    )
                    delivered += 1
                    notify_ids.append(mailbox["id"])
                    routing.append({"address": address, "status": "delivered"})

                await conn.execute(
                    "UPDATE message SET spam_score=$2,auth_results=$3::jsonb WHERE id=$1",
                    message_id,
                    spam,
                    json.dumps(auth_results),
                )
                if folder == "inbox" and notify_ids:
                    from app.modules.mail.notify import notify_new_mail

                    notify_new_mail(notify_ids, sender=parsed.from_address or "", subject=parsed.subject or "")
                return {"delivered": delivered, "folder": folder, "message_id": str(message_id), "routing": routing}
    except Exception:
        for object_key in stored_keys:
            try:
                await get_storage().delete(Bucket.MAIL, object_key)
            except Exception:
                log.warning("mail inbound object cleanup failed")
        raise
