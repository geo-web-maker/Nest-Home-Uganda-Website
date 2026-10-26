from datetime import date, datetime, timedelta
from typing import Any


def period_bounds(day: date, kind: str) -> tuple[date, date]:
    if kind == "weekly":
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=6)
    if kind == "fortnightly":
        epoch = date(2024, 1, 1)
        start = epoch + timedelta(days=((day - epoch).days // 14) * 14)
        return start, start + timedelta(days=13)
    if kind == "monthly":
        start = day.replace(day=1)
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        return start, next_month - timedelta(days=1)
    raise ValueError("unknown period kind")


def alert_delivery(
    severity: str,
    acknowledged: bool,
    minutes_open: int,
    sms_after: int,
    quiet: bool,
    monthly_remaining: int,
) -> dict[str, bool]:
    if severity == "critical":
        return {"dashboard": True, "push": True, "sms": True}
    if severity == "info":
        return {"dashboard": True, "push": True, "sms": False}
    send_sms = (
        not acknowledged and minutes_open >= sms_after and not quiet and monthly_remaining > 0
    )
    return {"dashboard": True, "push": True, "sms": send_sms}


def csv_safe(value: Any) -> str:
    text = "" if value is None else str(value)
    if text.startswith(("=", "+", "-", "@")):
        text = "'" + text
    return text


def retention_cutoff(now: datetime, days: int) -> datetime:
    return now - timedelta(days=days)
