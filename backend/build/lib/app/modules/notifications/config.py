"""Notification configuration from editable site settings plus deployment-only options."""

from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings, get_settings
from app.core.phone import normalise_e164
from app.modules.settings.defaults import setting_defaults
from app.modules.settings.repository import get_values as get_saved_values


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return _split(value)
    return []


@dataclass(frozen=True)
class NotifyConfig:
    staff_numbers: list[str] = field(default_factory=list)  # normalised +256
    staff_emails: list[str] = field(default_factory=list)
    application_emails: list[str] = field(default_factory=list)
    sender_id: str = "NestCare"
    category: str = "info"
    staff_enabled: bool = True
    visitor_enabled: bool = True
    email_new_enquiry: bool = True
    daily_summary: bool = True
    visitor_text: str = ""
    daily_limit: int = 200
    reminder_minutes: int = 30
    hours_from: str = "07:00"
    hours_to: str = "20:00"


async def load_config(settings: Settings | None = None) -> NotifyConfig:
    """Load the current values so admin changes affect the next notification run."""
    runtime = settings or get_settings()
    values = setting_defaults(runtime)
    values.update(await get_saved_values())
    # This is a deployment option, not a stored setting. Never read a provider/API
    # secret from Mongo.
    values["sms.provider"] = runtime.sms_provider
    numbers = [n for n in (normalise_e164(p) for p in _list(values.get("notify.sms_number"))) if n]
    emails = _list(values.get("notify.enquiry_emails"))
    visitor_text = values.get("sms.visitor_text", runtime.sms_visitor_text)
    if not isinstance(visitor_text, str):
        visitor_text = runtime.sms_visitor_text
    return NotifyConfig(
        staff_numbers=numbers,
        staff_emails=emails,
        application_emails=_list(values.get("notify.application_emails")),
        sender_id=str(values.get("sms.sender_id", runtime.sms_sender_id))[:11],
        category=str(values.get("sms.message_category", runtime.sms_message_category)),
        staff_enabled=bool(values.get("sms.staff_enabled", runtime.sms_staff_enabled)),
        visitor_enabled=bool(values.get("sms.visitor_enabled", runtime.sms_visitor_enabled)),
        email_new_enquiry=bool(values.get("notify.email_new_enquiry", True)),
        daily_summary=bool(values.get("notify.daily_summary", True)),
        visitor_text=visitor_text,
        daily_limit=int(values.get("sms.daily_limit", runtime.sms_daily_limit)),
        reminder_minutes=int(
            values.get("notify.reminder_minutes", runtime.notify_reminder_minutes)
        ),
        hours_from=str(values.get("notify.hours_from", runtime.notify_hours_from)),
        hours_to=str(values.get("notify.hours_to", runtime.notify_hours_to)),
    )
