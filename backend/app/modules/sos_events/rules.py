"""Pure rules for bounded SOS live-follow sessions."""

from datetime import UTC, datetime, timedelta

TERMINAL_SOS_STATES = frozenset({"resolved", "closed", "cancelled"})


def utc_now(value: datetime | None = None) -> datetime:
    """Normalise a supplied clock value to an aware UTC datetime."""
    value = value or datetime.now(UTC)
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def is_live_follow_active(
    started_at: datetime | None,
    until: datetime | None,
    stopped_at: datetime | None,
    now: datetime | None = None,
) -> bool:
    """A session is active only inside its server-owned time window."""
    current = utc_now(now)
    return bool(
        started_at is not None
        and until is not None
        and stopped_at is None
        and utc_now(started_at) <= current < utc_now(until)
    )


def live_follow_deadline(now: datetime, duration_minutes: int) -> datetime:
    """Build a bounded deadline; setting validation belongs to care_keys."""
    if isinstance(duration_minutes, bool) or not 1 <= duration_minutes <= 120:
        raise ValueError("Live-follow duration must be between 1 and 120 minutes")
    return utc_now(now) + timedelta(minutes=duration_minutes)


def ping_retry_after(
    last_ping_at: datetime | None,
    now: datetime,
    interval_seconds: int,
) -> int:
    """Return seconds to wait before accepting the next ping; zero means ready."""
    if isinstance(interval_seconds, bool) or not 15 <= interval_seconds <= 300:
        raise ValueError("Live-follow interval must be between 15 and 300 seconds")
    if last_ping_at is None:
        return 0
    elapsed = (utc_now(now) - utc_now(last_ping_at)).total_seconds()
    return max(0, int(interval_seconds - elapsed + 0.999))


def can_start_live_follow(status: str) -> bool:
    """Resolved/closed/cancelled alerts must never restart live location sharing."""
    return status.casefold() not in TERMINAL_SOS_STATES
