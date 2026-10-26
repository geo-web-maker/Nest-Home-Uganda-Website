"""Stable, URL-safe cursor codec for visit report pagination."""

import base64
from datetime import datetime


def encode_report_cursor(scheduled_start: datetime, visit_id: str) -> str:
    if scheduled_start.tzinfo is None or not visit_id:
        raise ValueError("A timezone-aware visit timestamp and id are required")
    raw = f"{scheduled_start.isoformat()}|{visit_id}".encode()
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_report_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        timestamp, visit_id = (
            base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8").split("|", 1)
        )
        value = datetime.fromisoformat(timestamp)
    except (ValueError, UnicodeDecodeError, UnicodeEncodeError) as exc:
        raise ValueError("Invalid report cursor") from exc
    if value.tzinfo is None or not visit_id or len(visit_id) > 160:
        raise ValueError("Invalid report cursor")
    return value, visit_id
