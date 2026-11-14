"""Web Push for new mail in the admin PWA. Never raises: a failed push must not affect delivery."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.modules.mail import db
from app.modules.mail.settings_service import get_value

log = logging.getLogger("app.mail.notify")
_MAX_FAILURES = 5
ADMIN_MAIL_PUSH_URL = "/mail"
_background: set[asyncio.Task[Any]] = set()


async def public_key() -> str | None:
    if not bool(await get_value("mail.push_enabled")):
        return None
    key = str(await get_value("mail.push_vapid_public") or "").strip()
    return key or None


async def save_subscription(user_id: str, sub: dict[str, Any], user_agent: str | None) -> None:
    keys = sub.get("keys") or {}
    await db.get_pool().execute(
        "INSERT INTO web_push_subscription(user_id,endpoint,p256dh,auth,user_agent) VALUES($1,$2,$3,$4,$5) "
        "ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,"
        "auth=EXCLUDED.auth,user_agent=EXCLUDED.user_agent,failure_count=0",
        user_id, sub["endpoint"], keys["p256dh"], keys["auth"], (user_agent or "")[:300] or None,
    )


async def remove_subscription(user_id: str, endpoint: str) -> None:
    await db.get_pool().execute(
        "DELETE FROM web_push_subscription WHERE user_id=$1 AND endpoint=$2", user_id, endpoint
    )


def _send_one(row: dict[str, Any], payload: str, private_key: str, subject: str) -> int | None:
    """Returns None on success, else the HTTP status (0 when the request itself failed)."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}},
            data=payload,
            vapid_private_key=private_key,
            vapid_claims={"sub": subject},
            ttl=3600,
            timeout=10,
        )
        return None
    except WebPushException as exc:
        return int(getattr(getattr(exc, "response", None), "status_code", 0) or 0)
    except Exception:
        return 0


async def _notify(mailbox_ids: list[str], exclude_user_id: str | None, sender: str, subject: str) -> None:
    if not mailbox_ids or not bool(await get_value("mail.push_enabled")):
        return
    private_key = str(await get_value("mail.push_vapid_private") or "").strip()
    if not private_key or not await public_key():
        return
    contact = str(await get_value("mail.push_subject") or "").strip() or "mailto:admin@example.com"
    preview = bool(await get_value("mail.push_show_preview"))
    pool = db.get_pool()
    rows = await pool.fetch(
        "SELECT DISTINCT s.id,s.user_id,s.endpoint,s.p256dh,s.auth,b.address_label FROM web_push_subscription s "
        "JOIN mailbox_member m ON m.user_id=s.user_id "
        "JOIN (SELECT id, local_part AS address_label FROM mailbox) b ON b.id=m.mailbox_id "
        "WHERE m.mailbox_id=ANY($1::uuid[]) AND s.failure_count < $2",
        mailbox_ids, _MAX_FAILURES,
    )
    for row in rows:
        if exclude_user_id and row["user_id"] == exclude_user_id:
            continue
        payload = json.dumps(
            {
                "title": f"New mail for {row['address_label']}" if not preview else (sender or "New mail"),
                "body": "You have a new message." if not preview else (subject or "(no subject)")[:120],
                "url": ADMIN_MAIL_PUSH_URL,
                "tag": "nest-mail",
            }
        )
        status = await asyncio.to_thread(_send_one, dict(row), payload, private_key, contact)
        if status is None:
            await pool.execute(
                "UPDATE web_push_subscription SET last_success_at=now(),failure_count=0 WHERE id=$1", row["id"]
            )
        elif status in (404, 410):
            await pool.execute("DELETE FROM web_push_subscription WHERE id=$1", row["id"])
        else:
            await pool.execute(
                "UPDATE web_push_subscription SET failure_count=failure_count+1 WHERE id=$1", row["id"]
            )


def notify_new_mail(
    mailbox_ids: list[Any], *, sender: str = "", subject: str = "", exclude_user_id: str | None = None
) -> None:
    """Fire and forget; call after the delivery transaction has committed."""
    ids = [str(item) for item in dict.fromkeys(mailbox_ids)]
    if not ids:
        return

    async def run() -> None:
        try:
            await _notify(ids, exclude_user_id, sender, subject)
        except Exception:
            log.warning("mail push notification failed", exc_info=True)

    try:
        task = asyncio.get_running_loop().create_task(run())
    except RuntimeError:
        return
    _background.add(task)
    task.add_done_callback(_background.discard)
