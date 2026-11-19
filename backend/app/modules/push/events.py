"""Fire-and-forget push to staff devices. A failed push must never fail the request that caused it.

Messages carry no client names, addresses or health details; the app fetches details after it opens.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

log = logging.getLogger("app.push.events")
_background: set[asyncio.Task[Any]] = set()


def notify_staff(
    user_ids: list[Any],
    category: str,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
    *,
    critical: bool = False,
) -> None:
    """Queue a push (and inbox item) for each user; call after the change has been saved."""
    ids = [str(item) for item in dict.fromkeys(user_ids) if item]
    if not ids:
        return

    async def run() -> None:
        try:
            from app.modules.push.dispatcher import dispatch

            await dispatch(ids, category, title, body, data, critical=critical)
        except Exception:
            log.warning("staff push failed", exc_info=True)

    try:
        task = asyncio.get_running_loop().create_task(run())
    except RuntimeError:
        return
    _background.add(task)
    task.add_done_callback(_background.discard)
