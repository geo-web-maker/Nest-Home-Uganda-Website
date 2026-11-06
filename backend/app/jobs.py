# ruff: noqa: E501,E701,E702
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

async def _audit_job_failure(job_name: str) -> None:
    """Record scheduler failures without allowing audit storage to stop other jobs."""
    try:
        from app.modules.audit.service import record_system_event
        await record_system_event(
            action=f"scheduler.{job_name}.failed",
            message=f"The scheduled job '{job_name}' failed. Review backend logs using the job name and timestamp.",
            severity="error", source="scheduler", outcome="failure",
            details={"job": job_name}, event_type="error",
        )
    except Exception:
        log.exception("could not persist scheduler failure audit event: %s", job_name)



async def run_reminders() -> None:
    try:
        count = await notifications.send_reminders()
        if count:
            log.info("enquiry reminders sent: %d", count)
    except Exception:
        log.exception("reminder job failed")
        await _audit_job_failure("run_reminders")


async def run_retention(now: datetime | None = None) -> int:
    """Anonymise enquiries older than 24 months unless the family became a client (9.7)."""
    now = now or datetime.now(UTC)
    try:
        count = await enquiries_repo.anonymise_before(rules.retention_cutoff(now), now)
    except Exception:
        log.exception("retention job failed")
        await _audit_job_failure("run_retention")
        return 0
    if count:
        log.info("enquiries anonymised: %d", count)
    return count


async def run_photo_orphans(now: datetime | None = None) -> int:
    """Destroy abandoned pending photo uploads older than 24 hours and mark them expired."""
    now = now or datetime.now(UTC)
    try:
        from app.modules.care_retention.retention import purge_abandoned_photo_uploads

        return await purge_abandoned_photo_uploads(now, get_settings())
    except Exception:
        log.exception("photo orphan cleanup job failed")
        await _audit_job_failure("run_photo_orphans")
        return 0


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
        await _audit_job_failure("run_care_alerts")
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
        await _audit_job_failure("run_sos_escalation")
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
        await _audit_job_failure("run_timesheet_generation")
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
    # Mail workers are persisted in Neon and claim with SKIP LOCKED, so overlapping
    # instances cannot process the same outbox row concurrently.
    # Sends are triggered by outbox.kick(); this slow poll only picks up retries so Neon can suspend.
    scheduler.add_job(run_mail_outbox, "interval", minutes=5, id="mail_outbox_drain", max_instances=1, coalesce=True)
    scheduler.add_job(run_mail_scan_queue, "interval", minutes=10, id="mail_scan_queue", max_instances=1, coalesce=True)
    scheduler.add_job(run_mail_housekeeping, "cron", hour=0, minute=5, id="mail_housekeeping", max_instances=1, coalesce=True)
    scheduler.add_job(run_mail_retention, "cron", hour=0, minute=25, id="mail_retention_purge", max_instances=1, coalesce=True)
    scheduler.add_job(run_mail_quota_check, "interval", hours=1, id="mail_quota_check", max_instances=1, coalesce=True)
    return scheduler


async def run_mail_outbox() -> int:
    try:
        from app.modules.mail.outbox import drain
        return await drain()
    except Exception:
        log.warning("mail outbox job unavailable; details omitted")
        await _audit_job_failure("run_mail_outbox")
        return 0


async def run_mail_scan_queue() -> int:
    try:
        from app.modules.mail.scan_queue import drain
        return await drain(limit=10)
    except Exception:
        log.warning("mail attachment scan job unavailable; details omitted")
        await _audit_job_failure("run_mail_scan_queue")
        return 0


async def run_mail_housekeeping() -> int:
    """Purge expired Trash/Spam copies and delete orphaned R2 objects safely."""
    try:
        from app.modules.mail import db as mail_db
        from app.modules.mail.settings_service import get_value
        from app.core.storage import Bucket, get_storage
        pool=mail_db.get_pool(); removed=0
        async with pool.acquire() as conn:
            candidates=[]
            for folder,key in (("trash","mail.trash_purge_days"),("spam","mail.spam_purge_days")):
                days=int(await get_value(key))
                candidates += await conn.fetch("SELECT id,message_id FROM mailbox_message WHERE folder=$1 AND trashed_at < now()-($2::text||' days')::interval",folder,days)
        for item in candidates:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute("DELETE FROM mailbox_message WHERE id=$1",item['id'])
                    still_used=await conn.fetchval("SELECT EXISTS(SELECT 1 FROM mailbox_message WHERE message_id=$1) OR EXISTS(SELECT 1 FROM outbox WHERE message_id=$1)",item['message_id'])
                    if not still_used:
                        objects=await conn.fetch("SELECT object_key FROM attachment WHERE message_id=$1",item['message_id'])
                        for obj in objects:
                            try: await get_storage().delete(Bucket.MAIL,obj['object_key'])
                            except Exception: log.warning("mail attachment purge failed; details omitted")
                        await conn.execute("DELETE FROM attachment WHERE message_id=$1",item['message_id'])
                        await conn.execute("DELETE FROM message_recipient WHERE message_id=$1",item['message_id'])
                        await conn.execute("DELETE FROM message WHERE id=$1",item['message_id'])
                    removed+=1
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM send_counter WHERE window_start < current_date-62")
        return removed
    except Exception:
        log.warning("mail housekeeping job unavailable; details omitted")
        await _audit_job_failure("run_mail_housekeeping")
        return 0


async def run_mail_retention() -> int:
    """Purge eligible closed mailboxes only when both retention and the safety switch allow it."""
    try:
        from app.modules.mail import db as mail_db
        from app.modules.mail.settings_service import get_value
        from app.core.storage import Bucket, get_storage
        if not bool(await get_value("mail.purge_enabled")): return 0
        years=int(await get_value("mail.retention_years"))
        if years<=0: return 0
        pool=mail_db.get_pool()
        async with pool.acquire() as conn:
            boxes=await conn.fetch("SELECT id FROM mailbox WHERE state='closed' AND legal_hold=false AND closed_at < now()-($1::text||' years')::interval",years)
        purged=0
        for box in boxes:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    mids=await conn.fetch("SELECT DISTINCT message_id FROM mailbox_message WHERE mailbox_id=$1",box['id'])
                    await conn.execute("UPDATE message_recipient SET mailbox_id=NULL WHERE mailbox_id=$1",box['id'])
                    await conn.execute("DELETE FROM mailbox_message WHERE mailbox_id=$1",box['id'])
                    await conn.execute("DELETE FROM mailbox_alias WHERE mailbox_id=$1",box['id'])
                    await conn.execute("DELETE FROM mailbox_member WHERE mailbox_id=$1",box['id'])
                    await conn.execute("UPDATE outbox SET from_mailbox_id=NULL,state=CASE WHEN state IN ('queued','deferred','sending') THEN 'cancelled' ELSE state END WHERE from_mailbox_id=$1",box['id'])
                    unattached=await conn.fetch("SELECT object_key FROM attachment WHERE uploader_mailbox_id=$1 AND message_id IS NULL",box['id'])
                    for obj in unattached:
                        try: await get_storage().delete(Bucket.MAIL,obj['object_key'])
                        except Exception: log.warning("mail unattached object deletion failed; details omitted")
                    await conn.execute("DELETE FROM attachment WHERE uploader_mailbox_id=$1 AND message_id IS NULL",box['id'])
                    await conn.execute("UPDATE attachment SET uploader_mailbox_id=NULL WHERE uploader_mailbox_id=$1",box['id'])
                    await conn.execute("DELETE FROM mailbox WHERE id=$1",box['id'])
                    for item in mids:
                        mid=item['message_id']
                        used=await conn.fetchval("SELECT EXISTS(SELECT 1 FROM mailbox_message WHERE message_id=$1)",mid)
                        if not used:
                            await conn.execute("DELETE FROM outbox WHERE message_id=$1",mid)
                            objects=await conn.fetch("SELECT object_key FROM attachment WHERE message_id=$1",mid)
                            for obj in objects:
                                try: await get_storage().delete(Bucket.MAIL,obj['object_key'])
                                except Exception: log.warning("mail retention object deletion failed; details omitted")
                            await conn.execute("DELETE FROM attachment WHERE message_id=$1",mid)
                            await conn.execute("DELETE FROM message_recipient WHERE message_id=$1",mid)
                            await conn.execute("DELETE FROM message WHERE id=$1",mid)
                    await conn.execute("INSERT INTO mail_audit(action,detail) VALUES('mail.purge',jsonb_build_object('mailbox_id',$1::text,'messages',$2))",box['id'],len(mids))
                    purged+=1
        return purged
    except Exception:
        log.warning("mail retention purge failed; details omitted")
        await _audit_job_failure("run_mail_retention")
        return 0


async def run_mail_quota_check() -> int:
    """Record threshold crossings without exposing mailbox contents or message subjects."""
    try:
        from app.modules.mail import db as mail_db
        from app.modules.mail.settings_service import get_value
        pool=mail_db.get_pool(); quota=int(await get_value("mail.mailbox_quota_mb"))*1024*1024
        async with pool.acquire() as conn:
            rows=await conn.fetch("""SELECT b.id,
              coalesce((SELECT sum(m.size_bytes) FROM message m WHERE m.id IN (SELECT DISTINCT message_id FROM mailbox_message WHERE mailbox_id=b.id)),0)
              + coalesce((SELECT sum(a.size_bytes) FROM attachment a WHERE a.message_id IN (SELECT DISTINCT message_id FROM mailbox_message WHERE mailbox_id=b.id) OR a.uploader_mailbox_id=b.id),0) used
              FROM mailbox b WHERE b.state='open'""")
            for row in rows:
                if row['used'] >= quota*0.9:
                    await conn.execute("INSERT INTO mail_audit(action,mailbox_id,detail) VALUES('mail.quota.warning',$1,jsonb_build_object('used_bytes',$2))",row['id'],row['used'])
        return sum(1 for row in rows if row['used']>=quota*0.9)
    except Exception:
        log.warning("mail quota check unavailable; details omitted")
        await _audit_job_failure("run_mail_quota_check")
        return 0
