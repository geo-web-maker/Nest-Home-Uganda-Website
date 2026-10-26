"""Track C database acceptance checks. Written, not run; CI must execute them."""

import importlib
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.core.security import hash_password
from app.modules.app_releases.models import AppRelease
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.care_ops.models import CareSetting, PushDelivery
from app.modules.nurses.models import Device, NurseProfile
from app.modules.visits.models import Visit
from tests.conftest import auth, make_token


def _future_visit(visit_id: str, *, nurse_id: str, client_id: str, start: datetime) -> Visit:
    return Visit(
        id=visit_id,
        client_id=client_id,
        nurse_id=nurse_id,
        place_id="track-c-place-0001",
        scheduled_start=start,
        scheduled_end=start + timedelta(hours=1),
        status="scheduled",
    )


async def _nurse(*, scopes: list[str], email_prefix: str = "track-c") -> User:
    from uuid import uuid4

    user = User(
        name="Track C Nurse",
        email=f"{email_prefix}-{uuid4().hex}@example.test",
        password_hash=hash_password("test-only-long-password-123"),
        scopes=scopes,
        kind="nurse",
        reach="own",
        is_active=True,
    )
    await user.insert()
    await NurseProfile(
        user_id=str(user.id), staff_number=f"TC-{uuid4().hex[:10]}", active=True
    ).insert()
    return user


async def test_c0_sync_sos_receipt_makes_retries_idempotent(
    mongo: object, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = await _nurse(scopes=["field:use", "sos:send"])
    field_ops = importlib.import_module("app.modules.field_ops.router")

    async def no_op_notify(_case: object) -> None:
        return None

    monkeypatch.setattr(field_ops, "notify_sos", no_op_notify)
    headers = auth(make_token(["field:use", "sos:send"], user_id=str(actor.id)))
    payload = {
        "operations": [
            {
                "kind": "sos",
                "client_op_id": "track-c-sos-op-000001",
                "payload": {"id": "track-c-sos-case-0001", "test": True},
            }
        ]
    }
    first = await client.post("/api/v1/field/sync/push", json=payload, headers=headers)
    second = await client.post("/api/v1/field/sync/push", json=payload, headers=headers)
    assert first.status_code == 200
    assert first.json()["results"][0]["status"] == "accepted"
    assert second.status_code == 200
    assert second.json()["results"][0]["status"] == "duplicate"
    altered = {
        "operations": [
            {
                "kind": "sos",
                "client_op_id": "track-c-sos-op-000001",
                "payload": {"id": "track-c-sos-case-0002", "test": True},
            }
        ]
    }
    conflict = await client.post("/api/v1/field/sync/push", json=altered, headers=headers)
    assert conflict.status_code == 200
    assert conflict.json()["results"][0]["status"] == "rejected"
    assert conflict.json()["results"][0]["reason"] == "idempotency_key_conflict"


async def test_c0_sync_rejects_checkin_for_unassigned_visit(
    mongo: object, client: httpx.AsyncClient
) -> None:
    actor = await _nurse(scopes=["field:use"])
    now = datetime.now(UTC)
    await _future_visit(
        "track-c-unassigned-visit", nurse_id="another-nurse", client_id="track-c-client", start=now
    ).insert()
    headers = auth(make_token(["field:use"], user_id=str(actor.id)))
    payload = {
        "operations": [
            {
                "kind": "check_in",
                "visit_id": "track-c-unassigned-visit",
                "client_op_id": "track-c-checkin-op-0001",
                "payload": {
                    "id": "track-c-checkin-event-01",
                    "client_op_id": "track-c-checkin-op-0001",
                    "device_time": now.isoformat(),
                    "sent_at_device": now.isoformat(),
                },
            }
        ]
    }
    response = await client.post("/api/v1/field/sync/push", json=payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["results"][0]["status"] == "rejected"
    assert response.json()["results"][0]["reason"] == "visit_not_assigned"


async def test_c1_app_version_uses_semver_and_configured_minimum(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await AppRelease(
        id="track-c-release-2-10",
        platform="android",
        version="2.10.0",
        min_supported_version="2.8.0",
        release_notes="Stable release",
        active=True,
        published_at=datetime(2026, 10, 20, tzinfo=UTC),
    ).insert()
    await AppRelease(
        id="track-c-release-2-9",
        platform="android",
        version="2.9.9",
        min_supported_version="2.8.0",
        release_notes="Earlier release",
        active=True,
        published_at=datetime(2026, 10, 25, tzinfo=UTC),
    ).insert()
    await CareSetting(
        key="care.min_app_version", value="2.11.0", group="care", updated_by="test-actor"
    ).insert()
    response = await client.get(
        "/api/v1/field/app/version?platform=android",
        headers=auth(make_token(["field:use"], user_id="track-c-version-actor")),
    )
    assert response.status_code == 200
    assert response.json()["latest"] == "2.10.0"
    assert response.json()["min_supported"] == "2.11.0"


async def test_c5_device_token_rotation_and_revoke_clear_token(
    mongo: object, client: httpx.AsyncClient
) -> None:
    actor = await _nurse(scopes=["field:use"])
    headers = auth(make_token(["field:use"], user_id=str(actor.id)))
    path = "/api/v1/field/devices"
    first = await client.post(
        path,
        json={"device_id": "track-c-device-0001", "platform": "android", "push_token": "old-token"},
        headers=headers,
    )
    second = await client.post(
        path,
        json={"device_id": "track-c-device-0001", "platform": "android", "push_token": "new-token"},
        headers=headers,
    )
    assert first.status_code == 201 and second.status_code == 201
    device = await Device.find_one(Device.device_id == "track-c-device-0001")
    assert (
        device is not None
        and device.push_token == "new-token"
        and device.push_token_updated_at is not None
    )
    revoked = await client.post(
        "/api/v1/field/device/revoke", json={"device_id": "track-c-device-0001"}, headers=headers
    )
    assert revoked.status_code == 200
    device = await Device.find_one(Device.device_id == "track-c-device-0001")
    assert device is not None and device.push_token is None and device.revoked_at is not None


async def test_c5_revoked_device_delivery_is_cancelled_without_sending(
    mongo: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = await _nurse(scopes=["field:use"])
    await Device(
        device_id="track-c-revoked-device",
        user_id=str(actor.id),
        platform="android",
        push_token=None,
        revoked_at=datetime.now(UTC),
    ).insert()
    delivery = PushDelivery(
        id="track-c-revoked-delivery",
        user_id=str(actor.id),
        device_id="track-c-revoked-device",
        notification_id="track-c-notification-01",
        category="care_alert",
        title="Care alert",
        body="A care operations alert needs review.",
        status="pending",
    )
    await delivery.insert()
    dispatcher = importlib.import_module("app.modules.push.dispatcher")
    called = False

    async def should_not_send(*_args: object, **_kwargs: object) -> bool:
        nonlocal called
        called = True
        return True

    monkeypatch.setattr(dispatcher, "send_push", should_not_send)
    result = await dispatcher.attempt_delivery(delivery)
    assert result == "cancelled"
    assert called is False


async def test_c6_report_filters_cursor_csv_escape_and_audit(
    mongo: object, client: httpx.AsyncClient
) -> None:
    actor_id = "track-c-report-superadmin"
    start = datetime(2026, 10, 26, 8, tzinfo=UTC)
    await _future_visit(
        "=track-c-report-a", nurse_id="nurse-report-a", client_id="client-report-a", start=start
    ).insert()
    await _future_visit(
        "track-c-report-b",
        nurse_id="nurse-report-a",
        client_id="client-report-a",
        start=start + timedelta(hours=2),
    ).insert()
    await _future_visit(
        "track-c-report-other",
        nurse_id="nurse-report-b",
        client_id="client-report-a",
        start=start + timedelta(hours=3),
    ).insert()
    headers = auth(
        make_token(["care-reports:read", "care-reports:export"], superadmin=True, user_id=actor_id)
    )
    query = "nurse=nurse-report-a&client=client-report-a&from=2026-10-26&to=2026-10-26&limit=1"
    first = await client.get(f"/api/v1/admin/care/reports/visits?{query}", headers=headers)
    assert first.status_code == 200
    assert first.json()["total"] == 2 and first.json()["has_more"] is True
    cursor = first.json()["next_cursor"]
    second = await client.get(
        f"/api/v1/admin/care/reports/visits?{query}&cursor={cursor}", headers=headers
    )
    assert second.status_code == 200
    assert len(second.json()["items"]) == 1
    csv_response = await client.get(
        "/api/v1/admin/care/reports/visits?format=csv&nurse=nurse-report-a&client=client-report-a&from=2026-10-26&to=2026-10-26",
        headers=headers,
    )
    assert csv_response.status_code == 200
    assert "'=track-c-report-a" in csv_response.text
    assert await AuditLog.find_one(AuditLog.action == "care.report.export") is not None
