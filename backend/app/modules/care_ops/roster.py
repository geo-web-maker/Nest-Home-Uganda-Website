"""Pure on-call schedule selection helpers.

The legacy contact map remains the fail-safe recipient list. An approved schedule is used
when at least one entry matches the current local time; a schedule gap falls back to the
legacy list instead of silently suppressing safety notifications.
"""

from __future__ import annotations

from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _parse_clock(value: object) -> time | None:
    if not isinstance(value, str) or len(value) != 5 or value[2] != ":":
        return None
    try:
        hour, minute = int(value[:2]), int(value[3:])
        return time(hour, minute) if 0 <= hour <= 23 and 0 <= minute <= 59 else None
    except ValueError:
        return None


def _is_scheduled(entry: dict, local: datetime) -> bool:
    days = entry.get("days")
    if not isinstance(days, list) or not all(isinstance(day, str) for day in days):
        return False
    days_set = {day.strip().lower()[:3] for day in days}
    start, end = _parse_clock(entry.get("start")), _parse_clock(entry.get("end"))
    if start is None or end is None or start == end:
        return False
    today = _DAYS[local.weekday()]
    now = local.time().replace(tzinfo=None)
    if start < end:
        return today in days_set and start <= now < end
    # Overnight shifts belong to the day they began.
    yesterday = _DAYS[(local.weekday() - 1) % 7]
    return (today in days_set and now >= start) or (yesterday in days_set and now < end)


def scheduled_numbers(
    roster: object, *, now: datetime | None = None, timezone_name: str = "Africa/Kampala"
) -> list[str]:
    """Return numbers from schedule entries active now, or [] when not safely configured."""
    if (
        not isinstance(roster, dict)
        or roster.get("enabled") is not True
        or roster.get("approved") is not True
    ):
        return []
    entries = roster.get("entries")
    if not isinstance(entries, list):
        return []
    try:
        tz = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        tz = UTC
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    local = current.astimezone(tz)
    selected: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict) or not _is_scheduled(entry, local):
            continue
        number = entry.get("phone")
        override = entry.get("override_phone")
        until = entry.get("override_until")
        if isinstance(override, str) and override.strip() and isinstance(until, str):
            try:
                expiry = datetime.fromisoformat(until.replace("Z", "+00:00"))
                # datetime-local values have no offset. Interpret them in the same
                # configured timezone used to evaluate roster shift hours.
                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=tz)
                if expiry > current:
                    number = override
            except ValueError:
                pass
        if isinstance(number, str) and number.strip() and number not in selected:
            selected.append(number.strip())
    return selected


def recipient_numbers(
    values: dict, *, now: datetime | None = None, timezone_name: str = "Africa/Kampala"
) -> list[str]:
    """Use a valid scheduled roster; fail safe to the legacy contacts on any schedule gap."""
    contacts = values.get("sos.on_call_contacts", {})
    fallback = (
        [
            str(value).strip()
            for value in contacts.values()
            if isinstance(value, str) and value.strip()
        ]
        if isinstance(contacts, dict)
        else []
    )
    selected = scheduled_numbers(
        values.get("sos.on_call_roster"), now=now, timezone_name=timezone_name
    )
    return list(dict.fromkeys(selected or fallback))
