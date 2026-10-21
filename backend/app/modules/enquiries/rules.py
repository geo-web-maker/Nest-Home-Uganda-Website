"""Pure business rules for enquiries: no database, no I/O. Unit-tested without MongoDB."""

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from app.modules.enquiries.models import Status

REFERENCE_PREFIX = "NHC-"
REMINDER_MAX = 3
RETENTION_DAYS = 730  # 24 months (spec 9.7; owner confirmed in 16 decision 7)
SMS_MAX_CHARS = 160

# Where a status may go next. care_started is final. Closed-without-care can be reopened.
TRANSITIONS: dict[Status, frozenset[Status]] = {
    "new": frozenset({"contacted", "assessment_booked", "not_proceeding", "spam"}),
    "contacted": frozenset({"assessment_booked", "not_proceeding", "spam"}),
    "assessment_booked": frozenset({"contacted", "care_started", "not_proceeding"}),
    "care_started": frozenset(),
    "not_proceeding": frozenset({"contacted"}),
    "spam": frozenset({"new"}),
}
CLOSING: frozenset[Status] = frozenset({"care_started", "not_proceeding", "spam"})


def can_transition(current: Status, target: Status) -> bool:
    return target in TRANSITIONS[current]


def format_reference(seq: int) -> str:
    return f"{REFERENCE_PREFIX}{seq:06d}"


def whatsapp_message(prefix: str, services: list[str], name: str, area: str, ref: str) -> str:
    """Spec 6.2: `<prefix>: <services>. Name: <name>. Area: <area>. Ref: <ref>.`"""
    return f"{prefix}: {', '.join(services)}. Name: {name}. Area: {area}. Ref: {ref}."


def whatsapp_url(digits: str, message: str) -> str:
    return f"https://wa.me/{digits}?text={quote(message, safe='')}"


def _fit(text: str, room: int) -> str:
    return text if len(text) <= room else text[: max(room - 1, 0)].rstrip() + "."


def staff_new_enquiry_sms(ref: str, name: str, area: str, phone_local: str) -> str:
    """Name, area and phone only. Never the visitor's note or anything medical (13.2)."""
    tail = f" Call {phone_local}."
    head = f"New enquiry {ref}: "
    room = SMS_MAX_CHARS - len(head) - len(tail)
    who = _fit(f"{name}, {area}", room)
    return head + who + tail


def staff_reminder_sms(ref: str, name: str, phone_local: str, minutes_waiting: int) -> str:
    tail = f" Call {phone_local}."
    head = f"Reminder: {ref} still new after {minutes_waiting} min. "
    room = SMS_MAX_CHARS - len(head) - len(tail)
    return head + _fit(name, room) + tail


def within_hours(local_now: datetime, hours_from: str, hours_to: str) -> bool:
    """True when local_now's wall-clock time is in [from, to). HH:MM strings."""
    start = tuple(int(p) for p in hours_from.split(":"))
    end = tuple(int(p) for p in hours_to.split(":"))
    now = (local_now.hour, local_now.minute)
    return start <= now < end


def reminder_due(
    *,
    status: Status,
    created_at: datetime,
    last_reminder_at: datetime | None,
    reminders_sent: int,
    now: datetime,
    interval_minutes: int,
    in_working_hours: bool,
) -> bool:
    """Spec 9.8: still New after the interval, in working hours, every interval, at most 3."""
    if status != "new" or reminders_sent >= REMINDER_MAX or not in_working_hours:
        return False
    reference = last_reminder_at or created_at
    return now >= reference + timedelta(minutes=interval_minutes)


def retention_cutoff(now: datetime | None = None) -> datetime:
    return (now or datetime.now(UTC)) - timedelta(days=RETENTION_DAYS)


def retention_due(status: Status, created_at: datetime, anonymised: bool, now: datetime) -> bool:
    """Anonymise after 24 months unless the enquiry became a client."""
    return not anonymised and status != "care_started" and created_at < retention_cutoff(now)
