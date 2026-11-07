"""Provider webhook normalization and durable delivery-event recording."""
from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime
from typing import Any


_DELIVERY_EVENTS = {
    "sent", "delivered", "soft_bounce", "hard_bounce", "deferred", "blocked",
    "invalid_email", "spam", "complaint", "error", "failed",
}


def _event_name(value: Any, provider: str, data: dict[str, Any]) -> str:
    raw = re.sub(r"(?<!^)(?=[A-Z])", "_", str(value or "unknown")).lower().replace(" ", "_")
    if provider == "resend" and raw.startswith("email."):
        raw = raw[6:]
    if provider == "resend":
        mapping = {
            "delivery_delayed": "deferred",
            "bounced": "hard_bounce",
            "complained": "complaint",
            "suppressed": "blocked",
            "failed": "failed",
        }
        if raw == "bounced":
            bounce = data.get("bounce") if isinstance(data.get("bounce"), dict) else {}
            bounce_type = str(bounce.get("type") or "Permanent").lower()
            return "soft_bounce" if bounce_type in {"temporary", "transient", "soft"} else "hard_bounce"
        return mapping.get(raw, raw)
    mapping = {
        "softbounce": "soft_bounce", "hardbounce": "hard_bounce", "invalidemail": "invalid_email",
        "spam": "complaint", "unsubscribed": "blocked", "error": "error",
    }
    return mapping.get(raw.replace("_", ""), raw)


def _event_timestamp(data: dict[str, Any], envelope: dict[str, Any]) -> datetime:
    epoch = data.get("ts_event") or data.get("ts") or data.get("ts_epoch")
    if epoch not in (None, ""):
        try:
            value = float(epoch)
            if value > 10_000_000_000:
                value /= 1000
            return datetime.fromtimestamp(value, UTC)
        except (TypeError, ValueError, OverflowError, OSError):
            pass
    for raw in (data.get("date"), data.get("created_at"), envelope.get("created_at")):
        if not raw:
            continue
        try:
            value = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        except ValueError:
            continue
    return datetime.now(UTC)


def normalise_delivery_payload(provider: str, payload: dict[str, Any], raw_body: bytes) -> list[dict[str, Any]]:
    """Return only delivery-relevant, recipient-scoped events (no opens/clicks)."""
    provider = provider.lower()
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    event = _event_name(payload.get("type") or payload.get("event"), provider, data)
    if event not in _DELIVERY_EVENTS:
        return []
    if provider == "resend":
        recipients = data.get("to") if isinstance(data.get("to"), list) else []
        addresses = [str(item).strip().lower() for item in recipients if str(item).strip()]
        provider_id = str(data.get("email_id") or "").strip()
        custom_id = str(data.get("X-Mailin-custom") or "").strip()
        detail_obj = data.get("bounce") if isinstance(data.get("bounce"), dict) else {}
    else:
        address = str(data.get("email") or data.get("recipient") or "").strip().lower()
        addresses = [address] if address else []
        provider_id = str(data.get("message-id") or data.get("messageId") or data.get("email_id") or "").strip()
        custom_id = str(data.get("X-Mailin-custom") or data.get("x-mailin-custom") or "").strip()
        detail_obj = data
    detail = str(detail_obj.get("message") or detail_obj.get("reason") or detail_obj.get("detail") or "")[:250]
    at = _event_timestamp(data, payload)
    # Providers occasionally omit an event timestamp. Never fingerprint a retry
    # with datetime.now(), which would turn each retry into a new event. In that
    # case use a stable digest of the signed raw request body instead.
    has_timestamp = any(data.get(key) not in (None, "") for key in ("ts_event", "ts", "ts_epoch", "date", "created_at")) or payload.get("created_at") not in (None, "")
    timestamp_identity = at.isoformat() if has_timestamp else hashlib.sha256(raw_body).hexdigest()
    events: list[dict[str, Any]] = []
    for address in dict.fromkeys(addresses):
        if len(address) > 320 or "\r" in address or "\n" in address:
            continue
        # Prefer semantic event identity so retries with different JSON whitespace or
        # key ordering still deduplicate. Fall back to the signed raw body when the
        # provider gives us no stable message/custom identifier.
        identity = "|".join((
            provider,
            provider_id or custom_id or hashlib.sha256(raw_body).hexdigest(),
            address,
            event,
            timestamp_identity,
        ))
        fingerprint = hashlib.sha256(identity.encode("utf-8")).hexdigest()
        events.append({
            "address": address,
            "event": event,
            "detail": detail or None,
            "at": at,
            "provider_message_id": provider_id,
            "custom_id": custom_id,
            "event_key": fingerprint,
        })
    return events
