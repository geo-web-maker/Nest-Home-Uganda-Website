"""Mail maintenance operations, including safe recovery of pre-rich-content mail."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from app.core.storage import Bucket, get_storage
from app.modules.mail import db
from app.modules.mail.html_policy import (
    POLICY_VERSION,
    html_to_text,
    make_snippet,
    remove_missing_cids,
    sanitize_html,
)
from app.modules.mail.mime_parse import ParsedAttachment, parse_message
from app.modules.mail.settings_service import get_value

log = logging.getLogger("app.mail.maintenance")


def _merge_notes(existing: Any, incoming: dict[str, Any]) -> dict[str, Any]:
    if isinstance(existing, str):
        try:
            existing = json.loads(existing)
        except json.JSONDecodeError:
            existing = {}
    result = dict(existing) if isinstance(existing, dict) else {}
    for key, value in incoming.items():
        # Reprocessing recomputes diagnostics; don't accumulate historical counts.
        if key == "removed_tags" and isinstance(value, dict):
            result[key] = {str(tag): int(count) for tag, count in value.items()}
        elif isinstance(value, (int, bool, str, list, dict)):
            result[key] = value
        elif value is not None:
            result[key] = value
    return result


async def reprocess_preview() -> dict[str, int]:
    """Return counts only; this endpoint does not expose message subjects or addresses."""
    pool = db.get_pool()
    count = await pool.fetchval(
        "SELECT count(*) FROM message WHERE origin='inbound' AND raw_object_key IS NOT NULL "
        "AND (sanitizer_version < $1 OR (body_html IS NULL AND sanitizer_version = 0))",
        POLICY_VERSION,
    )
    return {"count": int(count or 0)}


async def reprocess_run(limit: int = 50, actor_user_id: str | None = None) -> dict[str, int]:
    """Recover legacy MIME content in a short locked batch without changing mailbox state."""
    max_items = max(1, min(int(limit), 200))
    max_attachment_bytes = int(await get_value("mail.max_attachment_mb")) * 1024 * 1024
    max_html_bytes = int(await get_value("mail.max_html_kb")) * 1024
    blocked_extensions = {
        item.strip().lower().lstrip(".")
        for item in str(await get_value("mail.blocked_extensions") or "").split(",")
        if item.strip()
    }
    storage = get_storage()
    stored_keys: list[str] = []
    processed = 0
    skipped = 0

    try:
        pool = db.get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                rows = await conn.fetch(
                    "SELECT id,raw_object_key,body_text,render_notes FROM message "
                    "WHERE origin='inbound' AND raw_object_key IS NOT NULL "
                    "AND (sanitizer_version < $1 OR (body_html IS NULL AND sanitizer_version = 0)) "
                    "ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED",
                    POLICY_VERSION,
                    max_items,
                )
                for row in rows:
                    message_id = row["id"]
                    try:
                        raw = await storage.get(Bucket.MAIL, row["raw_object_key"])
                    except Exception:
                        notes = _merge_notes(row["render_notes"], {"raw_message_unavailable": True})
                        await conn.execute(
                            "UPDATE message SET sanitizer_version=$2,render_notes=$3::jsonb WHERE id=$1",
                            message_id,
                            POLICY_VERSION,
                            json.dumps(notes),
                        )
                        skipped += 1
                        continue

                    parsed = parse_message(
                        raw,
                        blocked_extensions=blocked_extensions,
                        max_attachment_bytes=max_attachment_bytes,
                        max_html_bytes=max_html_bytes,
                        max_text_bytes=2_000_000,
                    )
                    notes = _merge_notes({}, parsed.notes)
                    body_html = None
                    body_text = str(row["body_text"] or "")
                    if parsed.html_body is not None:
                        filtered = sanitize_html(
                            parsed.html_body,
                            block_remote_images=bool(await get_value("mail.block_remote_images")),
                            max_bytes=max_html_bytes,
                        )
                        body_html = filtered.html
                        notes = _merge_notes(notes, filtered.notes)
                        if not body_text:
                            body_text = html_to_text(body_html)
                    elif not body_text:
                        body_text = parsed.text_body

                    valid_cids = {
                        item.content_id.lower()
                        for item in parsed.attachments
                        if item.content_id and item.disposition == "inline" and not item.blocked_reason
                    }
                    if body_html:
                        body_html, missing = remove_missing_cids(body_html, valid_cids)
                        if missing:
                            notes["missing_inline_image"] = int(
                                notes.get("missing_inline_image", 0)
                            ) + missing

                    existing_rows = await conn.fetch(
                        "SELECT id,filename,sha256 FROM attachment WHERE message_id=$1",
                        message_id,
                    )
                    existing = {
                        (str(item["sha256"] or ""), str(item["filename"] or "")): item
                        for item in existing_rows
                    }
                    for attachment in parsed.attachments:
                        identity = (attachment.sha256, attachment.filename)
                        matched = existing.get(identity)
                        if matched:
                            await conn.execute(
                                "UPDATE attachment SET content_id=COALESCE($2,content_id),"
                                "disposition=$3,blocked_reason=COALESCE(blocked_reason,$4) WHERE id=$1",
                                matched["id"],
                                attachment.content_id,
                                attachment.disposition,
                                attachment.blocked_reason,
                            )
                            continue

                        object_key = None
                        if not attachment.blocked_reason:
                            object_key = f"mail/attachments/{uuid.uuid4()}"
                            await storage.put(
                                Bucket.MAIL,
                                object_key,
                                attachment.data,
                                attachment.content_type,
                            )
                            stored_keys.append(object_key)
                        await conn.execute(
                            "INSERT INTO attachment(message_id,object_key,filename,content_type,"
                            "size_bytes,sha256,scan_state,content_id,disposition,blocked_reason) "
                            "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
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

                    await conn.execute(
                        "UPDATE message SET body_html=$2,body_text=$3,body_format=$4,snippet=$5,"
                        "render_notes=$6::jsonb,sanitizer_version=$7,"
                        "references_header=COALESCE(references_header,$8) WHERE id=$1",
                        message_id,
                        body_html,
                        body_text[:2_000_000],
                        "html" if body_html is not None else "plain",
                        make_snippet(body_text),
                        json.dumps(notes),
                        POLICY_VERSION,
                        parsed.references or None,
                    )
                    processed += 1

                await conn.execute(
                    "INSERT INTO mail_audit(actor_user_id,action,detail) "
                    "VALUES($1,'mail.reprocess',jsonb_build_object('processed',$2,'skipped',$3))",
                    actor_user_id,
                    processed,
                    skipped,
                )
        return {"processed": processed, "skipped": skipped}
    except Exception:
        for object_key in stored_keys:
            try:
                await storage.delete(Bucket.MAIL, object_key)
            except Exception:
                log.warning("mail reprocess object cleanup failed")
        raise
