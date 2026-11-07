"""Durable per-device push delivery and inbox dispatch; messages contain no client details."""

import logging
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import uuid4

from app.modules.care_ops.models import CareInboxNotification, PushDelivery
from app.modules.nurses.models import Device
from app.modules.push.fcm import send_push
from app.modules.push.retry import retry_delay_seconds

log = logging.getLogger("app.push")


def _delivery_id(notification_id: str, device_id: str) -> str:
    return sha256(f"{notification_id}:{device_id}".encode()).hexdigest()


async def attempt_delivery(delivery: PushDelivery, *, now: datetime | None = None) -> str:
    """Attempt one delivery. State is saved before return; provider failures never escape jobs."""
    now = now or datetime.now(UTC)
    device = await Device.find_one(
        Device.device_id == delivery.device_id, Device.user_id == delivery.user_id
    )
    if not device or device.revoked_at is not None or not device.push_token:
        delivery.status = "cancelled"
        delivery.last_error = "device_missing_or_revoked"
        await delivery.save()
        return delivery.status
    try:
        sent = await send_push(
            device.push_token,
            delivery.title,
            delivery.body,
            delivery.data,
            critical=delivery.critical,
        )
        error = None if sent else "provider_not_available_or_rejected"
    except Exception as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        detail = str(getattr(exc, "response", None))
        if status_code in {404, 410} or "UNREGISTERED" in detail:
            device.push_token = None
            device.push_token_updated_at = now
            await device.save()
            delivery.status = "cancelled"
            delivery.last_error = "provider_token_unregistered"
            await delivery.save()
            return delivery.status
        log.warning("push delivery failed for delivery %s", delivery.id)
        sent, error = False, type(exc).__name__
    delivery.attempts += 1
    if sent:
        delivery.status = "sent"
        delivery.sent_at = now
        delivery.last_error = None
    else:
        delay = retry_delay_seconds(delivery.attempts)
        if delay is None:
            delivery.status = "failed"
        else:
            delivery.status = "pending"
            delivery.next_attempt_at = now + timedelta(seconds=delay)
        delivery.last_error = (error or "push_send_failed")[:160]
    await delivery.save()
    return delivery.status


async def run_push_deliveries(now: datetime | None = None, *, limit: int = 100) -> int:
    """Retry due records in bounded batches. Revoked devices are cancelled, never sent to."""
    now = now or datetime.now(UTC)
    rows = (
        await PushDelivery.find(
            PushDelivery.status == "pending", PushDelivery.next_attempt_at <= now
        )
        .sort("next_attempt_at")
        .limit(max(1, min(limit, 500)))
        .to_list()
    )
    processed = 0
    for row in rows:
        await attempt_delivery(row, now=now)
        processed += 1
    return processed


async def dispatch(
    user_ids: list[str],
    category: str,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
    *,
    critical: bool = False,
):
    """Persist each inbox item and push attempt before contacting the provider."""
    results = []
    for user_id in sorted(set(user_ids)):
        notification_id = uuid4().hex
        notification = CareInboxNotification(
            id=notification_id,
            user_id=user_id,
            category=category[:80],
            title=title[:120],
            body=body[:300],
        )
        await notification.insert()
        devices = await Device.find(Device.user_id == user_id, Device.revoked_at == None).to_list()  # noqa: E711
        for device in devices:
            if not device.push_token:
                continue
            row = PushDelivery(
                id=_delivery_id(notification_id, device.device_id),
                user_id=user_id,
                device_id=device.device_id,
                notification_id=notification_id,
                category=category[:80],
                title=title[:120],
                body=body[:300],
                data={str(key)[:80]: str(value)[:160] for key, value in (data or {}).items()},
                critical=critical,
                status="pending",
                next_attempt_at=datetime.now(UTC),
            )
            await row.insert()
            outcome = await attempt_delivery(row)
            results.append({"user_id": user_id, "device_id": device.device_id, "status": outcome})
    return results
