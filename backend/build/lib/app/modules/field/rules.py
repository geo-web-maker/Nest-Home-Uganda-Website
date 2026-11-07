from datetime import datetime


def clock_offset_s(received_at: datetime, sent_at_device: datetime) -> float:
    return (received_at - sent_at_device).total_seconds()


def verification_label(verification: str) -> str:
    return "verified" if verification == "verified" else "needs_review"


def event_rejection(status: str, event_type: str) -> str | None:
    if status == "cancelled":
        return "visit_cancelled"
    if status == "completed":
        return "already_checked_out"
    if event_type == "check_in" and status == "in_progress":
        return "already_checked_in"
    if event_type == "check_out" and status != "in_progress":
        return "not_checked_in"
    return None
