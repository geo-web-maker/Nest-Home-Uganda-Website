"""Scheduled jobs (APScheduler, in process; spec 3). Started from the app lifespan.

One backend instance is assumed (the planned Render setup). Reminders are still safe if a
second instance runs: each slot is claimed with a compare-and-set in the database.
"""

import logging
from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import get_settings
from app.modules.enquiries import repository as enquiries_repo
from app.modules.enquiries import rules
from app.modules.notifications import service as notifications

log = logging.getLogger("app.jobs")


async def run_reminders() -> None:
    try:
        count = await notifications.send_reminders()
        if count:
            log.info("enquiry reminders sent: %d", count)
    except Exception:
        log.exception("reminder job failed")


async def run_retention(now: datetime | None = None) -> int:
    """Anonymise enquiries older than 24 months unless the family became a client (9.7)."""
    now = now or datetime.now(UTC)
    try:
        count = await enquiries_repo.anonymise_before(rules.retention_cutoff(now), now)
    except Exception:
        log.exception("retention job failed")
        return 0
    if count:
        log.info("enquiries anonymised: %d", count)
    return count


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=get_settings().tz)
    scheduler.add_job(
        run_reminders, "interval", minutes=1, id="enquiry_reminders", max_instances=1, coalesce=True
    )
    scheduler.add_job(
        run_retention, "cron", hour=3, minute=0, id="retention", max_instances=1, coalesce=True
    )
    return scheduler
