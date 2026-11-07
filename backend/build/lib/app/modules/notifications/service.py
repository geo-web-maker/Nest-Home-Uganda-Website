"""Sends alerts for enquiries. Nothing here may raise into a request: failures are logged.

Order of work for a new enquiry: staff SMS, staff email, then the visitor SMS. The visitor
SMS needs a consent tick and a valid Uganda mobile, and is attempted once per enquiry.
"""

import asyncio
import html
import logging
from datetime import UTC, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import get_settings
from app.core.phone import is_mobile, mask, to_local
from app.modules.audit import service as audit
from app.modules.audit.models import AuditLog
from app.modules.enquiries import repository as enquiries_repo
from app.modules.enquiries import rules
from app.modules.enquiries.models import Enquiry, EnquiryEvent
from app.modules.notifications.config import NotifyConfig, load_config
from app.modules.notifications.models import SmsLog
from app.modules.notifications.providers import (
    EmailProvider,
    SmsProvider,
    get_email_provider,
    get_sms_provider,
)

log = logging.getLogger("app.notifications")

RETRY_DELAYS: tuple[float, ...] = (2.0, 5.0)  # at most 2 retries (13.2); tests set (0, 0)
LIMIT_ACTION = "sms.daily_limit_reached"


def local_tz() -> tzinfo:
    try:
        return ZoneInfo(get_settings().tz)
    except ZoneInfoNotFoundError:  # no tz database in a slim image: Kampala has no DST
        return timezone(timedelta(hours=3), "EAT")


def _day_start(now: datetime) -> datetime:
    local = now.astimezone(local_tz())
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)


async def _within_daily_limit(config: NotifyConfig, now: datetime) -> bool:
    start = _day_start(now)
    sent = await SmsLog.find(SmsLog.status == "sent", SmsLog.at >= start).count()
    if sent < config.daily_limit:
        return True
    already = await AuditLog.find_one(AuditLog.action == LIMIT_ACTION, AuditLog.at >= start)
    if already is None:
        await audit.record(None, LIMIT_ACTION, "sms", item_label=f"limit {config.daily_limit}")
    return False


async def _within_care_monthly_limit(cap: int, now: datetime) -> bool:
    """Cap care-operation SMS separately from enquiry/visitor messaging."""
    local = now.astimezone(local_tz())
    start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
    rows = await SmsLog.find(SmsLog.at >= start).to_list()
    sent = sum(row.status == "sent" and row.template.startswith("care_") for row in rows)
    if sent < cap:
        return True
    already = await AuditLog.find_one(
        AuditLog.action == "sms.care_monthly_cap_reached", AuditLog.at >= start
    )
    if already is None:
        await audit.record(
            None, "sms.care_monthly_cap_reached", "sms", item_label=f"monthly care cap {cap}"
        )
    return False


async def _log(
    provider: SmsProvider, audience: str, template: str, to: str, status: str,
    error: str | None, enquiry: Enquiry | None, cost: float | None = None,
) -> None:  # fmt: skip
    await SmsLog(
        provider=provider.name,
        audience=audience,
        template=template,
        to_hint=mask(to_local(to)),
        status=status,
        cost=cost,
        error=error,
        related_type="enquiry" if enquiry else None,
        related_id=str(enquiry.id) if enquiry else None,
    ).insert()


async def send_sms(
    provider: SmsProvider,
    config: NotifyConfig,
    *,
    to: str,
    text: str,
    audience: str,
    template: str,
    enquiry: Enquiry | None,
    monthly_cap: int | None = None,
) -> bool:
    """One recipient, with at most 2 retries for failures a retry could fix. Never raises."""
    try:
        now = datetime.now(UTC)
        if (
            monthly_cap is not None
            and template.startswith("care_")
            and not await _within_care_monthly_limit(monthly_cap, now)
        ):
            await _log(
                provider, audience, template, to, "skipped", "monthly care SMS cap reached", enquiry
            )
            return False
        if not await _within_daily_limit(config, now):
            await _log(provider, audience, template, to, "skipped", "daily limit reached", enquiry)
            return False
        error: str | None = None
        attempts = 0
        for delay in (0.0, *RETRY_DELAYS):
            if delay:
                await asyncio.sleep(delay)
            attempts += 1
            result = await provider.send([to], text, config.sender_id, config.category)
            await _log(
                provider, audience, template, to, "sent" if result.ok else "failed", result.error,
                enquiry,
                result.cost if result.ok else None,
            )  # fmt: skip
            if result.ok:
                error = None
                break
            error = result.error or "failed"
            if not result.retryable:
                break
        if enquiry is not None:
            await enquiries_repo.push_event(
                enquiry.id,
                EnquiryEvent(
                    kind="alert_sent",
                    data={
                        "channel": "sms",
                        "audience": audience,
                        "template": template,
                        "status": "sent" if error is None else "failed",
                        "attempts": attempts,
                        "error": error,
                    },
                    text=f"SMS to {audience}: {'sent' if error is None else 'failed'}",
                ),
            )
        return error is None
    except Exception:
        log.exception("sms send crashed (template=%s)", template)
        return False


def _email_body(doc: Enquiry, heading: str) -> tuple[str, str]:
    lines = [
        heading,
        f"Reference: {doc.reference}",
        f"Name: {doc.name}",
        f"Phone: {doc.phone_raw}",
        f"Area: {doc.area}",
        f"Care needed: {', '.join(s.name_snapshot for s in doc.services)}",
        f"Who needs care: {doc.relationship}",
    ]
    if doc.preferred_start:
        lines.append(f"Preferred start: {doc.preferred_start}")
    if doc.note:
        lines.append(f"Note: {doc.note}")
    text = "\n".join(lines)
    markup = "".join(f"<p>{html.escape(line)}</p>" for line in lines)
    return markup, text


async def _staff_email(
    email: EmailProvider, config: NotifyConfig, doc: Enquiry, subject: str, heading: str
) -> None:
    if not config.staff_emails:
        return
    markup, text = _email_body(doc, heading)
    result = await email.send(config.staff_emails, subject, markup, text)
    await enquiries_repo.push_event(
        doc.id,
        EnquiryEvent(
            kind="alert_sent",
            data={
                "channel": "email",
                "audience": "staff",
                "status": "sent" if result.ok else "failed",
            },
            text=f"Email to staff: {'sent' if result.ok else 'failed'}",
        ),
    )


async def notify_new_enquiry(
    enquiry_id: str,
    sms: SmsProvider | None = None,
    email: EmailProvider | None = None,
    config: NotifyConfig | None = None,
) -> None:
    """Background task queued by the public POST. Never raises."""
    try:
        doc = await enquiries_repo.get(enquiry_id)
        if doc is None:
            return
        config = config or await load_config()
        sms = sms or get_sms_provider()
        email = email or get_email_provider()

        if config.staff_enabled:
            text = rules.staff_new_enquiry_sms(
                doc.reference, doc.name, doc.area, to_local(doc.phone_e164)
            )
            for number in config.staff_numbers:
                await send_sms(
                    sms, config, to=number, text=text, audience="staff",
                    template="new_enquiry", enquiry=doc,
                )  # fmt: skip
        if config.email_new_enquiry:
            await _staff_email(
                email, config, doc, f"New enquiry {doc.reference}", "A new enquiry arrived."
            )

        if (
            config.visitor_enabled
            and doc.consent
            and is_mobile(doc.phone_e164)
            and await enquiries_repo.claim_visitor_sms(doc.id)
        ):
            await send_sms(
                sms, config, to=doc.phone_e164, text=config.visitor_text, audience="visitor",
                template="visitor_confirm", enquiry=doc,
            )  # fmt: skip
    except Exception:
        log.exception("notify_new_enquiry failed for %s", enquiry_id)


async def send_reminders(
    now: datetime | None = None,
    sms: SmsProvider | None = None,
    email: EmailProvider | None = None,
    config: NotifyConfig | None = None,
) -> int:
    """Reminder for enquiries still New after the interval, in working hours, up to 3 times."""
    now = now or datetime.now(UTC)
    config = config or await load_config()
    in_hours = rules.within_hours(now.astimezone(local_tz()), config.hours_from, config.hours_to)
    if not in_hours:
        return 0
    sms = sms or get_sms_provider()
    email = email or get_email_provider()
    interval = timedelta(minutes=config.reminder_minutes)
    sent = 0
    for doc in await enquiries_repo.candidates_for_reminder(now - interval, rules.REMINDER_MAX):
        due = rules.reminder_due(
            status=doc.status,
            created_at=doc.created_at,
            last_reminder_at=doc.last_reminder_at,
            reminders_sent=doc.reminders_sent,
            now=now,
            interval_minutes=config.reminder_minutes,
            in_working_hours=in_hours,
        )
        if not due or not await enquiries_repo.claim_reminder(doc, now):
            continue
        sent += 1
        waiting = int((now - doc.created_at).total_seconds() // 60)
        if config.staff_enabled:
            text = rules.staff_reminder_sms(
                doc.reference, doc.name, to_local(doc.phone_e164), waiting
            )
            for number in config.staff_numbers:
                await send_sms(
                    sms, config, to=number, text=text, audience="staff",
                    template="reminder", enquiry=doc,
                )  # fmt: skip
        await _staff_email(
            email, config, doc, f"Reminder: {doc.reference} still new",
            f"This enquiry has waited {waiting} minutes without a reply.",
        )  # fmt: skip
    return sent
