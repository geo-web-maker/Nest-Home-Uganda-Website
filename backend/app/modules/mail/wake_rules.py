"""When does the mail queue next need Neon? Pure rules with no I/O, so they are easy to test."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

OVERDUE_RECHECK = timedelta(minutes=30)  # a row still overdue right after a drain was skipped on purpose
STALE_CLAIM = timedelta(minutes=10)  # drain() reclaims 'sending' rows claimed longer ago than this
DISABLED_RECHECK = timedelta(hours=1)  # mail or scanning switched off: look again now and then
SCAN_RETRY = timedelta(minutes=10)  # scan_error rows are retried after this long
SCAN_STALE_PENDING = timedelta(minutes=20)  # pending scans older than this are marked scan_error


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def outbox_next_due(next_retry: datetime | None, has_sending: bool, now: datetime) -> datetime | None:
    """Earliest time the outbox needs another drain, or None when nothing is pending."""
    candidates: list[datetime] = []
    if next_retry is not None:
        retry = _aware(next_retry)
        # Still overdue right after a drain means drain() left it alone on purpose (external
        # sending off, mailbox suspended). Look again slowly instead of every minute.
        candidates.append(retry if retry > now else now + OVERDUE_RECHECK)
    if has_sending:
        candidates.append(now + STALE_CLAIM)
    return min(candidates) if candidates else None


def scan_next_due(
    has_unscanned: bool, oldest_error: datetime | None, oldest_pending: datetime | None, now: datetime
) -> datetime | None:
    """Earliest time the attachment scan queue needs another drain, or None when idle."""
    candidates: list[datetime] = []
    if has_unscanned:
        candidates.append(now)
    if oldest_error is not None:
        candidates.append(_aware(oldest_error) + SCAN_RETRY)
    if oldest_pending is not None:
        candidates.append(_aware(oldest_pending) + SCAN_STALE_PENDING)
    return min(candidates) if candidates else None
