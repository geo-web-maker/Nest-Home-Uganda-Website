"""Shared UTC/local-date helpers for administrative summaries and exports."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import get_settings


def business_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(get_settings().tz)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def start_of_local_day(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=business_timezone()).astimezone(UTC)


def date_range(start: date | None, end: date | None, field: str = "created_at") -> dict:
    """Build an indexed [from, to] date filter; user-selected dates are local calendar dates."""
    bounds: dict[str, datetime] = {}
    if start:
        bounds["$gte"] = start_of_local_day(start)
    if end:
        bounds["$lt"] = start_of_local_day(end + timedelta(days=1))
    return {field: bounds} if bounds else {}


def local_month_window(now: datetime | None = None) -> tuple[date, datetime, datetime]:
    local_now = (now or datetime.now(UTC)).astimezone(business_timezone())
    first = local_now.date().replace(day=1)
    if first.month == 12:
        next_month = date(first.year + 1, 1, 1)
    else:
        next_month = date(first.year, first.month + 1, 1)
    return first, start_of_local_day(first), start_of_local_day(next_month)


def display_action(
    action: str,
    item_type: str,
    before: dict | None = None,
    after: dict | None = None,
    item_label: str | None = None,
) -> str:
    """Translate stored audit action identifiers into concise activity-table copy."""
    if action == "enquiry.update" and before and after:
        old_status, new_status = before.get("status"), after.get("status")
        if old_status != new_status and new_status:
            pretty = str(new_status).replace("_", " ").capitalize()
            return f"Changed status to {pretty}"
        if before.get("assigned_to") != after.get("assigned_to"):
            return "Changed enquiry assignment"
        return "Updated enquiry"
    if action == "settings.update":
        return "Changed site settings"
    if action == "settings.theme.reset":
        return "Reset theme colours"
    if action == "job.create":
        return "Created job"
    if action == "job.update":
        return "Updated job"
    if action == "job.publish":
        return "Published job"
    if action == "job.close":
        return "Closed job"
    if action == "job.delete":
        return "Deleted job"
    if action == "reports.export":
        return f"Exported {item_label or 'report'}"
    if action == "enquiry.create":
        return "Created enquiry"
    if action.endswith(".delete"):
        return f"Deleted {item_type}"
    if action.endswith(".create"):
        return f"Created {item_type}"
    if action.endswith(".update"):
        return f"Updated {item_type}"
    return action.replace(".", " ").replace("_", " ").capitalize()
