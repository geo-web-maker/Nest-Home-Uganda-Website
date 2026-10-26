"""Scheduled jobs (APScheduler, in process; spec 3). Started from the app lifespan.

One backend instance is assumed (the planned Render setup). Reminders are still safe if a
second instance runs: each slot is claimed with a compare-and-set in the database.
"""

import logging
from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import get_settings
from app.modules.care_ops.dispatch import notify_alert
from app.modules.care_ops.models import CareAlert, CareTimesheet, SOSCase, SOSEvent
from app.modules.care_ops.rules import period_bounds
from app.modules.enquiries import repository as enquiries_repo
from app.modules.enquiries import rules
from app.modules.notifications import service as notifications
from app.modules.nurses.models import NurseProfile
from app.modules.push.dispatcher import run_push_deliveries
from app.modules.visits.models import Visit

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


async def run_care_alerts(now: datetime | None = None) -> int:
    """Create idempotent late-visit and safety-timer alerts (no client details in messages)."""
    now = now or datetime.now(UTC)
    created = 0
    try:
        visits = await Visit.find().to_list()
        for visit in visits:
            if (
                visit.status == "scheduled"
                and visit.scheduled_start < now
                and (now - visit.scheduled_start).total_seconds() >= 30 * 60
            ):
                alert_id = f"late:{visit.id}"
                if not await CareAlert.find_one(CareAlert.id == alert_id):
                    alert = CareAlert(
                        id=alert_id,
                        type="late_visit",
                        severity="warning",
                        visit_id=visit.id,
                        nurse_id=visit.nurse_id,
                        supervisor_id=visit.supervisor_id,
                        message="A scheduled visit has not started.",
                    )
                    await alert.insert()
                    await notify_alert(alert)
                    created += 1
                visit.status = "missed"
                visit.updated_at = now
                await visit.save()
            if (
                visit.safety_state == "armed"
                and visit.safety_timer_until
                and visit.safety_timer_until <= now
            ):
                alert_id = f"safety:{visit.id}"
                if not await CareAlert.find_one(CareAlert.id == alert_id):
                    visit.safety_state = "triggered"
                    visit.updated_at = now
                    await visit.save()
                    alert = CareAlert(
                        id=alert_id,
                        type="safety_timer",
                        severity="critical",
                        visit_id=visit.id,
                        nurse_id=visit.nurse_id,
                        supervisor_id=visit.supervisor_id,
                        message="A staff safety timer needs review.",
                    )
                    await alert.insert()
                    await notify_alert(alert)
                    created += 1
    except Exception:
        log.exception("care alert job failed")
    return created


async def run_sos_escalation(now: datetime | None = None) -> int:
    """Append an escalation event for unacknowledged SOS cases; the dispatcher delivers it."""
    now = now or datetime.now(UTC)
    count = 0
    try:
        cases = await SOSCase.find(SOSCase.status == "sent").to_list()
        for case in cases:
            if (now - case.created_at).total_seconds() < 120:
                continue
            case.status = "escalated"
            case.events.append({"type": "escalated", "at": now.isoformat()})
            await case.save()
            await SOSEvent(
                id=f"{case.id}:escalated", case_id=case.id, type="escalated", details={"level": 1}
            ).insert()
            count += 1
    except Exception:
        log.exception("SOS escalation job failed")
    return count


async def run_timesheet_generation(today=None) -> int:
    """Regenerate draft timesheets idempotently; submitted/approved ones never change."""
    day = today or datetime.now(UTC).date()
    start, end = period_bounds(day, "weekly")
    created = 0
    try:
        for profile in await NurseProfile.find(NurseProfile.active == True).to_list():  # noqa: E712
            visits = await Visit.find(
                Visit.nurse_id == profile.user_id, Visit.status == "completed"
            ).to_list()
            in_period = [
                v
                for v in visits
                if start.isoformat() <= v.scheduled_start.date().isoformat() <= end.isoformat()
            ]
            total = sum(
                max(0, int((v.check_out_at - v.check_in_at).total_seconds() / 60))
                for v in in_period
                if v.check_in_at and v.check_out_at
            )
            issues = []
            if any(v.check_in_at is None or v.check_out_at is None for v in in_period):
                issues.append("missing_time_event")
            sheet_id = f"{profile.user_id}:{start.isoformat()}:{end.isoformat()}"
            existing = await CareTimesheet.find_one(CareTimesheet.id == sheet_id)
            if existing and existing.status in {"submitted", "approved"}:
                continue
            if existing:
                existing.completed_visits = len(in_period)
                existing.total_minutes = total
                existing.issue_ids = issues
                await existing.save()
            else:
                await CareTimesheet(
                    id=sheet_id,
                    nurse_id=profile.user_id,
                    period_start=start.isoformat(),
                    period_end=end.isoformat(),
                    period_kind="weekly",
                    completed_visits=len(in_period),
                    total_minutes=total,
                    issue_ids=issues,
                ).insert()
                created += 1
    except Exception:
        log.exception("timesheet generation job failed")
    return created


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=get_settings().tz)
    scheduler.add_job(
        run_reminders, "interval", minutes=1, id="enquiry_reminders", max_instances=1, coalesce=True
    )
    scheduler.add_job(
        run_care_alerts, "interval", minutes=1, id="care_alerts", max_instances=1, coalesce=True
    )
    scheduler.add_job(
        run_sos_escalation,
        "interval",
        minutes=1,
        id="sos_escalation",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        run_timesheet_generation,
        "cron",
        hour=2,
        minute=15,
        id="care_timesheets",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        run_push_deliveries,
        "interval",
        minutes=1,
        id="push_delivery_retry",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        run_retention, "cron", hour=3, minute=0, id="retention", max_instances=1, coalesce=True
    )
    from app.modules.care_retention.retention import run_care_retention

    scheduler.add_job(
        run_care_retention,
        "cron",
        hour=3,
        minute=10,
        id="care_retention",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        run_photo_orphans,
        "cron",
        hour=3,
        minute=40,
        id="photo_orphans",
        max_instances=1,
        coalesce=True,
    )
    return scheduler


async def run_photo_orphans(now: datetime | None = None) -> int:
    """Retry cleanup of photo uploads abandoned before registration completed."""
    from app.core.config import get_settings
    from app.modules.care_retention.retention import purge_abandoned_photo_uploads

    try:
        count = await purge_abandoned_photo_uploads(now or datetime.now(UTC), get_settings())
        if count:
            log.info("abandoned care photo uploads cleaned: %d", count)
        return count
    except Exception:
        log.exception("photo orphan cleanup job failed")
        return 0
