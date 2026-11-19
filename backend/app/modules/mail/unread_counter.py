"""Per-person unread mail total kept in MongoDB, so the sidebar badge never has to wake Neon.

The number is always written as an absolute value that was just counted in Postgres, never as
+1 / -1, so it cannot drift: every code path that already has Neon awake (a delivery, a read,
a move, a delete, a mailbox list) recounts the people it affects and overwrites the figure. A
nightly recount fixes anything missed (for example a removed shared-mailbox member).

Reading is Mongo only. A missing or unreadable figure returns None and the caller falls back
to Postgres once, which also stores the figure.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any, Iterable

from beanie import Document

log = logging.getLogger("app.mail_unread")

# Unread inbox messages per member, over every open mailbox they belong to. The inner select
# picks the people who share any of the given mailboxes; the totals then cover all their boxes.
_TOTALS_SQL = """
SELECT m.user_id::text AS user_id, COALESCE(SUM(c.n), 0)::int AS unread
FROM mailbox_member m
JOIN mailbox b ON b.id = m.mailbox_id AND b.state = 'open'
LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM mailbox_message mm
    WHERE mm.mailbox_id = b.id AND mm.folder = 'inbox' AND NOT mm.is_read
) c ON true
WHERE m.user_id::text IN (
    SELECT user_id::text FROM mailbox_member WHERE mailbox_id = ANY($1::uuid[])
)
GROUP BY m.user_id
"""

_ALL_TOTALS_SQL = _TOTALS_SQL.replace(
    "WHERE m.user_id::text IN (\n    SELECT user_id::text FROM mailbox_member WHERE mailbox_id = ANY($1::uuid[])\n)\n", ""
)


class MailUnread(Document):
    id: str  # the user id
    unread: int = 0
    updated_at: datetime | None = None

    class Settings:
        name = "mail_unread"


async def get_total(user_id: str) -> int | None:
    """The stored total, or None when there is none or MongoDB cannot be read."""
    try:
        doc = await MailUnread.get(str(user_id))
    except Exception:
        log.warning("mail unread counter unreadable", exc_info=True)
        return None
    return int(doc.unread) if doc is not None else None


async def set_total(user_id: str, unread: int) -> None:
    """Overwrite the stored total. Never raises: the counter is a convenience, not the record."""
    try:
        value = max(0, int(unread))
        doc = await MailUnread.get(str(user_id))
        if doc is None:
            await MailUnread(id=str(user_id), unread=value, updated_at=datetime.now(UTC)).insert()
        elif doc.unread != value:
            doc.unread = value
            doc.updated_at = datetime.now(UTC)
            await doc.save()
    except Exception:
        log.warning("mail unread counter not saved", exc_info=True)


async def refresh_for_mailboxes(conn: Any, mailbox_ids: Iterable[Any]) -> int:
    """Recount and store the total for everyone who is a member of any of these mailboxes.

    Pass the connection that made the change: inside a transaction it sees its own uncommitted
    rows, so the figure is right even before the commit. The recount runs in a savepoint and any
    failure is swallowed, so the counter can never break delivery, reading or moving mail.
    """
    ids = [str(item) for item in dict.fromkeys(mailbox_ids)]
    if not ids:
        return 0
    try:
        async with conn.transaction():  # a savepoint when the caller is already in a transaction
            rows = await conn.fetch(_TOTALS_SQL, ids)
    except Exception:
        log.warning("mail unread recount failed", exc_info=True)
        return 0
    for row in rows:
        await set_total(row["user_id"], row["unread"])
    return len(rows)


async def recompute_all(pool: Any) -> int:
    """Nightly safety net: recount every member of every open mailbox."""
    try:
        rows = await pool.fetch(_ALL_TOTALS_SQL)
    except Exception:
        log.warning("mail unread nightly recount failed", exc_info=True)
        return 0
    for row in rows:
        await set_total(row["user_id"], row["unread"])
    return len(rows)
