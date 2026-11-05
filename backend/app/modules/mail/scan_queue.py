"""Restart-safe scanner queue for inbound and forwarded message attachments."""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from app.modules.mail import db
from app.modules.mail.scanner import scan_object
from app.modules.mail.settings_service import get_value

log = logging.getLogger("app.mail.scan_queue")
_kick_handle = None


def kick(delay: float = 1.5) -> bool:
    global _kick_handle
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return False
    if _kick_handle is not None and not _kick_handle.cancelled() and _kick_handle.when() > loop.time():
        return False

    def run() -> None:
        global _kick_handle
        _kick_handle = None
        task = loop.create_task(_safe_drain())
        task.add_done_callback(lambda item: item.cancelled() or item.exception())

    _kick_handle = loop.call_later(delay, run)
    return True


async def _safe_drain() -> int:
    try:
        return await drain()
    except Exception:
        log.warning("mail attachment scan queue failed; details omitted")
        return 0


async def drain(limit: int = 20) -> int:
    if not bool(await get_value("mail.scan_enabled")):
        return 0
    pool = db.get_pool()
    processed = 0
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE attachment SET scan_state='scan_error',scan_detail='Previous scan worker stopped' "
            "WHERE scan_state='pending' AND message_id IS NOT NULL "
            "AND created_at < now()-interval '20 minutes'"
        )
    for _ in range(max(1, min(limit, 100))):
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """SELECT a.id,a.object_key,a.sha256,a.message_id
                       FROM attachment a
                       WHERE (a.scan_state='unscanned' OR (
                               a.scan_state='scan_error'
                               AND coalesce(a.scanned_at, a.created_at) < now()-interval '10 minutes'
                             ))
                         AND a.object_key IS NOT NULL AND a.message_id IS NOT NULL
                       ORDER BY a.created_at
                       LIMIT 1 FOR UPDATE SKIP LOCKED"""
                )
                if not row:
                    break
                await conn.execute(
                    "UPDATE attachment SET scan_state='pending',scan_detail='Scan in progress' WHERE id=$1",
                    row["id"],
                )
        try:
            result = await scan_object(str(row["object_key"]), str(row["sha256"]))
        except Exception as exc:
            result = type("ScanFailure", (), {"state": "error", "detail": type(exc).__name__})()
        now = datetime.now(UTC)
        async with pool.acquire() as conn:
            if result.state == "clean":
                await conn.execute(
                    "UPDATE attachment SET scan_state='clean',scanned_at=$2,scan_detail=NULL WHERE id=$1",
                    row["id"], now,
                )
            elif result.state == "infected":
                safe_detail = str(result.detail or "Threat detected")[:160]
                await conn.execute(
                    "UPDATE attachment SET scan_state='infected',scanned_at=$2,scan_detail=$3,"
                    "blocked_reason=$4 WHERE id=$1",
                    row["id"], now, safe_detail, f"infected:{safe_detail}",
                )
                await conn.execute(
                    "UPDATE message SET render_notes=coalesce(render_notes,'{}'::jsonb) || "
                    "jsonb_build_object('infected_attachments',coalesce((render_notes->>'infected_attachments')::int,0)+1) "
                    "WHERE id=$1",
                    row["message_id"],
                )
            else:
                await conn.execute(
                    "UPDATE attachment SET scan_state='scan_error',scanned_at=$2,scan_detail=$3 WHERE id=$1",
                    row["id"], now, str(result.detail or "Scanner unavailable")[:160],
                )
        processed += 1
    return processed
