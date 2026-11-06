"""Durable, restart-safe external mail queue worker."""

from __future__ import annotations

import re
import asyncio
import hashlib
import logging
from datetime import UTC, datetime, timedelta

from app.core.storage import Bucket, get_storage
from app.modules.mail import db
from app.modules.mail.providers import OutboundAttachment, OutboundMessage, get_provider
from app.modules.mail.settings_service import get_value

log = logging.getLogger("app.mail.outbox")
BACKOFF = (60, 300, 1800, 7200, 21600)
KICK_DELAY_SECONDS = 2.0
_kick_handle = None


def recipient_total(row) -> int:
    """Count envelope recipients across all header classes."""
    return sum(
        len(row.get(field) or [])
        for field in ("to_addresses", "cc_addresses", "bcc_addresses")
    )


def kick(delay: float = KICK_DELAY_SECONDS) -> bool:
    """Schedule a coalesced drain after the queuing transaction commits."""
    global _kick_handle
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return False
    if _kick_handle is not None and not _kick_handle.cancelled() and _kick_handle.when() > loop.time():
        return False

    def _run():
        global _kick_handle
        _kick_handle = None
        task = loop.create_task(_safe_drain())
        task.add_done_callback(lambda item: item.cancelled() or item.exception())

    _kick_handle = loop.call_later(delay, _run)
    return True


async def _safe_drain() -> int:
    try:
        return await drain()
    except Exception:
        log.warning("mail outbox kick failed; details omitted")
        return 0


async def _load_outbound_attachments(message_id) -> list[OutboundAttachment]:
    pool = db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id,object_key,filename,content_type,sha256,content_id,disposition,scan_state,scan_detail,blocked_reason "
            "FROM attachment WHERE message_id=$1 ORDER BY created_at",
            message_id,
        )
    storage = get_storage()
    result: list[OutboundAttachment] = []
    scan_enabled = bool(await get_value("mail.scan_enabled"))
    fail_mode = str(await get_value("mail.scan_fail_mode") or "allow")
    for row in rows:
        scan_state = str(row["scan_state"] or "unscanned")
        if row["blocked_reason"] or scan_state in {"infected", "blocked"}:
            raise ValueError("An attachment was blocked by security scanning and cannot be sent.")
        if scan_state == "pending":
            raise RuntimeError("An attachment scan is still in progress.")
        if not row["object_key"]:
            raise ValueError("attachment integrity check failed")
        try:
            data = await storage.get(Bucket.MAIL, row["object_key"])
        except Exception as exc:
            raise ValueError("attachment integrity check failed") from exc
        digest = hashlib.sha256(data).hexdigest()
        if digest != str(row["sha256"]):
            raise ValueError("attachment integrity check failed")

        # Upload confirmation and inbound queue scans are the first line of defence. Recheck
        # any non-clean attachment at the send boundary so stale/unscanned drafts cannot bypass it.
        if scan_enabled and scan_state != "clean":
            from app.modules.mail.scanner import scan_object

            verdict = await scan_object(str(row["object_key"]), digest)
            async with pool.acquire() as conn:
                if verdict.state == "infected":
                    detail = str(verdict.detail or "Threat detected")[:160]
                    await conn.execute(
                        "UPDATE attachment SET scan_state='infected',scanned_at=now(),scan_detail=$2,blocked_reason=$3 WHERE id=$1",
                        row["id"], detail, f"infected:{detail}",
                    )
                    raise ValueError("An attachment was blocked by security scanning and cannot be sent.")
                if verdict.state == "clean":
                    scan_state = "clean"
                    await conn.execute(
                        "UPDATE attachment SET scan_state='clean',scanned_at=now(),scan_detail=NULL,blocked_reason=NULL WHERE id=$1",
                        row["id"],
                    )
                else:
                    scan_state = "scan_error"
                    detail = str(verdict.detail or "Scanner unavailable")[:160]
                    await conn.execute(
                        "UPDATE attachment SET scan_state='scan_error',scanned_at=NULL,scan_detail=$2 WHERE id=$1",
                        row["id"], detail,
                    )
                    if fail_mode == "block":
                        raise RuntimeError("An attachment could not be security-scanned and sending is blocked.")
        if scan_enabled and fail_mode == "block" and scan_state != "clean":
            raise RuntimeError("An attachment must pass security scanning before it can be sent.")
        result.append(
            OutboundAttachment(
                filename=str(row["filename"]),
                content_type=str(row["content_type"]),
                data=data,
                content_id=row["content_id"] if row["disposition"] == "inline" else None,
                disposition=str(row["disposition"] or "attachment"),
            )
        )
    return result


async def drain(limit: int = 20) -> int:
    if not bool(await get_value("mail.enabled")) or bool(await get_value("mail.suspend_all_sending")):
        return 0
    pool = db.get_pool()
    sent = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            stale = await conn.fetch(
                "SELECT id,to_addresses,cc_addresses,bcc_addresses,counter_reserved,"
                "counter_day,counter_month FROM outbox WHERE state='sending' "
                "AND (claimed_at IS NULL OR claimed_at < now()-interval '10 minutes') "
                "FOR UPDATE SKIP LOCKED"
            )
            for old in stale:
                if old["counter_reserved"]:
                    count = recipient_total(old)
                    await conn.execute(
                        "UPDATE send_counter SET count=greatest(0,count-$1) "
                        "WHERE scope='provider' AND window_kind='day' AND window_start=$2",
                        count,
                        old["counter_day"],
                    )
                    await conn.execute(
                        "UPDATE send_counter SET count=greatest(0,count-$1) "
                        "WHERE scope='provider' AND window_kind='month' AND window_start=$2",
                        count,
                        old["counter_month"],
                    )
                await conn.execute(
                    "UPDATE outbox SET state='deferred',next_attempt_at=now(),claimed_at=NULL,"
                    "counter_reserved=false,counter_day=NULL,counter_month=NULL,"
                    "last_error='worker lease expired' WHERE id=$1",
                    old["id"],
                )
            rows = await conn.fetch(
                """SELECT o.*,m.subject,m.body_text,m.body_html,m.message_id_header,
                         m.in_reply_to,m.references_header,m.render_notes,
                         b.local_part,b.sending_suspended,b.state AS mailbox_state
                   FROM outbox o JOIN message m ON m.id=o.message_id
                   LEFT JOIN mailbox b ON b.id=o.from_mailbox_id
                   WHERE o.state IN ('queued','deferred') AND o.next_attempt_at<=now()
                   ORDER BY o.priority,o.created_at
                   LIMIT $1 FOR UPDATE OF o SKIP LOCKED""",
                max(1, min(limit, 100)),
            )
            ids = [row["id"] for row in rows]
            if ids:
                await conn.execute(
                    "UPDATE outbox SET state='sending',attempts=attempts+1,claimed_at=now() "
                    "WHERE id=ANY($1::uuid[])",
                    ids,
                )

    for row in rows:
        reserved = False
        counter_day = None
        counter_month = None
        recipient_count = recipient_total(row)
        try:
            if row["mailbox_state"] == "closed":
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE outbox SET state='cancelled',claimed_at=NULL,"
                        "last_error='sender mailbox closed' WHERE id=$1",
                        row["id"],
                    )
                continue
            if not bool(await get_value("mail.external_enabled")) or row["sending_suspended"]:
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE outbox SET state='queued',next_attempt_at=now(),claimed_at=NULL "
                        "WHERE id=$1",
                        row["id"],
                    )
                continue

            provider_day = int(await get_value("mail.provider_daily_limit"))
            provider_month = int(await get_value("mail.provider_monthly_limit"))
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute("SELECT pg_advisory_xact_lock($1)", 0x4E455354 + 1)
                    today = int(
                        await conn.fetchval(
                            "SELECT coalesce(sum(count),0) FROM send_counter "
                            "WHERE scope='provider' AND window_kind='day' AND window_start=current_date"
                        )
                    )
                    month = int(
                        await conn.fetchval(
                            "SELECT coalesce(sum(count),0) FROM send_counter "
                            "WHERE scope='provider' AND window_kind='month' "
                            "AND window_start=date_trunc('month',current_date)::date"
                        )
                    )
                    if today + recipient_count > provider_day or month + recipient_count > provider_month:
                        next_time = await conn.fetchval(
                            "SELECT date_trunc($1,now()) + CASE WHEN $1='month' "
                            "THEN interval '1 month' ELSE interval '1 day' END",
                            "month" if month + recipient_count > provider_month else "day",
                        )
                        await conn.execute(
                            "UPDATE outbox SET state='deferred',next_attempt_at=$2,claimed_at=NULL "
                            "WHERE id=$1",
                            row["id"],
                            next_time,
                        )
                        continue
                    await conn.execute(
                        "INSERT INTO send_counter(scope,window_kind,window_start,count) "
                        "VALUES('provider','day',current_date,$1) ON CONFLICT(scope,window_kind,window_start) "
                        "DO UPDATE SET count=send_counter.count+EXCLUDED.count",
                        recipient_count,
                    )
                    await conn.execute(
                        "INSERT INTO send_counter(scope,window_kind,window_start,count) "
                        "VALUES('provider','month',date_trunc('month',current_date)::date,$1) "
                        "ON CONFLICT(scope,window_kind,window_start) "
                        "DO UPDATE SET count=send_counter.count+EXCLUDED.count",
                        recipient_count,
                    )
                    counter_day = await conn.fetchval("SELECT current_date")
                    counter_month = await conn.fetchval(
                        "SELECT date_trunc('month',current_date)::date"
                    )
                    await conn.execute(
                        "UPDATE outbox SET counter_reserved=true,counter_day=$2,counter_month=$3 "
                        "WHERE id=$1",
                        row["id"],
                        counter_day,
                        counter_month,
                    )
                    reserved = True

            provider = await get_provider()
            attachments = await _load_outbound_attachments(row["message_id"])
            domain = str(await get_value("mail.domain") or "")
            from_address = f"{row['local_part']}@{domain}" if row["local_part"] else ""
            headers = {"X-Mailin-custom": str(row["id"])}
            stable_message_id = str(row["message_id_header"] or f"<{row['id']}@{domain or 'nest.local'}>")
            reply_value = str(row["in_reply_to"] or "").strip()
            if re.match(r"^<[^<>\s@]+@[^<>\s@]+>$", reply_value):
                headers["In-Reply-To"] = reply_value
            if row["references_header"]:
                headers["References"] = str(row["references_header"])
            elif row["message_id_header"]:
                headers["References"] = str(row["message_id_header"])
            message = OutboundMessage(
                from_address=from_address,
                from_name=await get_value("mail.from_name"),
                to=list(row["to_addresses"] or []),
                cc=list(row["cc_addresses"] or []),
                bcc=list(row["bcc_addresses"] or []),
                subject=str(row["subject"] or ""),
                html=row["body_html"],
                text=str(row["body_text"] or ""),
                reply_to=await get_value("mail.reply_to"),
                headers=headers if provider.supports_threading_headers else {},
                attachments=attachments,
                idempotency_key=row["idempotency_key"],
                message_id=stable_message_id,
            )
            from app.modules.mail.mime_build import build_eml
            sent_eml = build_eml(
                {
                    "from_address": from_address,
                    "from_name": await get_value("mail.from_name"),
                    "subject": row["subject"],
                    "body_text": row["body_text"],
                    "body_html": row["body_html"],
                    "reply_to": await get_value("mail.reply_to"),
                    "message_id_header": stable_message_id,
                    "in_reply_to": row["in_reply_to"],
                    "references_header": row["references_header"],
                },
                attachments,
                {"to": message.to, "cc": message.cc},
                headers=headers,
            )
            message = __import__("dataclasses").replace(message, rfc822=sent_eml)
            provider_transport = str(await get_value("mail.brevo_transport") or "smtp").lower()
            json_transport = provider.name == "resend" or (provider.name == "brevo" and provider_transport == "api")
            if json_transport:
                import unicodedata
                import re
                simplified = 0
                inline_degraded = sum(1 for item in attachments if item.disposition == "inline")
                if provider.name == "brevo":
                    for item in attachments:
                        stem, dot, suffix = item.filename.rpartition(".")
                        if not dot:
                            stem, suffix = item.filename, ""
                        ascii_stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode("ascii")
                        ascii_stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", ascii_stem).strip(" ._") or "attachment"
                        sent_name = f"{ascii_stem}.{suffix}" if suffix else ascii_stem
                        if sent_name != item.filename:
                            simplified += 1
                if simplified or inline_degraded:
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE message SET render_notes=coalesce(render_notes,'{}'::jsonb) || "
                            "jsonb_build_object('provider_filename_simplifications',$2,'provider_inline_images_attached_separately',$3) WHERE id=$1",
                            row["message_id"], simplified, inline_degraded,
                        )
            result = await provider.send_message(message)
            async with pool.acquire() as conn:
                if result.ok:
                    if bool(await get_value("mail.store_sent_eml")):
                        try:
                            sent_key = f"mail/sent/{row['message_id']}.eml"
                            await get_storage().put(Bucket.MAIL, sent_key, sent_eml, "message/rfc822")
                            await conn.execute(
                                "UPDATE message SET sent_eml_key=$2 WHERE id=$1",
                                row["message_id"],
                                sent_key,
                            )
                        except Exception as eml_error:
                            log.warning(
                                "sent message copy could not be stored type=%s",
                                type(eml_error).__name__,
                            )
                    await conn.execute(
                        "UPDATE outbox SET state='sent',provider=$2,provider_message_id=$3,"
                        "sent_at=now(),claimed_at=NULL,counter_reserved=false,counter_day=NULL,"
                        "counter_month=NULL,last_error=NULL WHERE id=$1",
                        row["id"],
                        provider.name,
                        result.provider_message_id,
                    )
                    sent += 1
                else:
                    if reserved:
                        await _release_counter_reservation(
                            conn, recipient_count, counter_day, counter_month, row["id"]
                        )
                    await _fail(conn, row, result.error or "provider failure", result.retryable)
        except ValueError as exc:
            async with pool.acquire() as conn:
                if reserved:
                    await _release_counter_reservation(
                        conn, recipient_count, counter_day, counter_month, row["id"]
                    )
                await _fail(conn, row, str(exc), False)
        except Exception as exc:
            async with pool.acquire() as conn:
                if reserved:
                    await _release_counter_reservation(
                        conn, recipient_count, counter_day, counter_month, row["id"]
                    )
                await _fail(conn, row, type(exc).__name__, True)
            log.warning("mail outbox delivery failed id=%s type=%s", row["id"], type(exc).__name__)
        await asyncio.sleep(1 / max(1, float(await get_value("mail.send_rate_per_second"))))
    return sent


async def _fail(conn, row, error, retryable):
    attempts = int(row["attempts"]) + 1
    if retryable and attempts < 6:
        delay = BACKOFF[min(attempts - 1, len(BACKOFF) - 1)]
        await conn.execute(
            "UPDATE outbox SET state='deferred',next_attempt_at=$2,claimed_at=NULL,last_error=$3 "
            "WHERE id=$1",
            row["id"],
            datetime.now(UTC) + timedelta(seconds=delay),
            error[:300],
        )
    else:
        await conn.execute(
            "UPDATE outbox SET state='failed',claimed_at=NULL,last_error=$2 WHERE id=$1",
            row["id"],
            error[:300],
        )
        if row.get("from_mailbox_id"):
            sender = await conn.fetchrow(
                "SELECT id,local_part FROM mailbox WHERE id=$1", row["from_mailbox_id"]
            )
            if sender:
                domain = str(await get_value("mail.domain") or "invalid.local")
                notice = await conn.fetchval(
                    "INSERT INTO message(from_address,from_name,subject,body_text,origin) "
                    "VALUES($1,'Mail Delivery Subsystem','Delivery failed','Your message could not be "
                    "delivered. Review the recipient address or contact an administrator.','internal') "
                    "RETURNING id",
                    f"mailer-daemon@{domain}",
                )
                await conn.execute(
                    "INSERT INTO mailbox_message(mailbox_id,message_id,folder) "
                    "VALUES($1,$2,'inbox') ON CONFLICT DO NOTHING",
                    sender["id"],
                    notice,
                )


async def _release_counter_reservation(conn, count: int, day, month, outbox_id):
    await conn.execute(
        "UPDATE send_counter SET count=greatest(0,count-$1) "
        "WHERE scope='provider' AND window_kind='day' AND window_start=$2",
        count,
        day,
    )
    await conn.execute(
        "UPDATE send_counter SET count=greatest(0,count-$1) "
        "WHERE scope='provider' AND window_kind='month' AND window_start=$2",
        count,
        month,
    )
    await conn.execute(
        "UPDATE outbox SET counter_reserved=false,counter_day=NULL,counter_month=NULL WHERE id=$1",
        outbox_id,
    )
