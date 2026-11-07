"""Plain-language delivery detail for a sent message (pure functions, no I/O)."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

# Known short reasons stored by the worker, mapped to friendly text.
REASON_MAP = {
    "attachment integrity check failed": "An attachment could not be verified.",
    "recipient_delivery_failed": "The provider reported a delivery failure for one or more recipients.",
    "provider failure": "The mail provider could not accept this message.",
    "worker lease expired": "The mail worker restarted before the provider send began.",
    "delivery_outcome_unknown_manual_review": "The mail provider may have accepted this message, but the server could not confirm the result. It was not automatically resent to avoid duplicate delivery. Ask an administrator to check the provider delivery logs.",
}
_SECRET = re.compile(r"(xsmtpsib-|xkeysib-|re_)[A-Za-z0-9_\-]{8,}|[A-Za-z0-9_\-]{32,}")
RETRYABLE_STATES = {"deferred", "failed", "queued"}


def redact(text: str) -> str:
    """Hide anything that looks like a key or token before it reaches the screen."""
    return _SECRET.sub("[hidden]", text or "")[:300]


def build_delivery(outbox: Any, recipients: list[dict[str, Any]], *, include_detail: bool = False) -> dict[str, Any]:
    raw = str(outbox["last_error"] or "")
    unknown_prefix = "delivery_outcome_unknown_manual_review:"
    unknown_outcome = raw.startswith(unknown_prefix) or raw == "delivery_outcome_unknown_manual_review"
    raw_code = "delivery_outcome_unknown_manual_review" if unknown_outcome else raw
    raw_detail = raw[len(unknown_prefix):].strip() if raw.startswith(unknown_prefix) else raw
    state = str(outbox["state"])
    nxt = outbox.get("next_attempt_at") if hasattr(outbox, "get") else outbox["next_attempt_at"]
    return {
        "state": state,
        "reason": REASON_MAP.get(raw_code, "Delivery needs attention." if raw else None),
        "detail": (redact(raw_detail) or None) if include_detail else None,
        "attempts": int(outbox["attempts"] or 0),
        "next_attempt_at": nxt if isinstance(nxt, datetime) and state in {"deferred", "queued"} else None,
        "provider": str(outbox["provider"] or ""),
        "can_retry": state in RETRYABLE_STATES and not unknown_outcome,
        "recipients": recipients,
    }
