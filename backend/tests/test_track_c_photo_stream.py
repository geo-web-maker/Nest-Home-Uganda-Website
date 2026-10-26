"""Private photo streaming acceptance. Written, not run; CI must execute it."""

import importlib
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.core.config import get_settings
from app.core.photo_store import temporary_stream_signature
from app.modules.audit.models import AuditLog
from app.modules.visits.models import Visit, VisitPhoto


class _ImageResponse:
    status_code = 200
    content = b"\xff\xd8\xfftrack-c-test-image"
    headers = {"content-type": "image/jpeg"}


class _ProviderClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args: object):
        return None

    async def get(self, _url: str):
        return _ImageResponse()


async def test_photo_stream_is_audited_and_expired_links_fail_closed(
    mongo: object, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    visit_id = "track-c-stream-visit-01"
    photo_id = "track-c-stream-photo-01"
    await Visit(
        id=visit_id,
        client_id="track-c-stream-client",
        nurse_id="track-c-stream-nurse",
        place_id="track-c-stream-place",
        scheduled_start=datetime.now(UTC),
        scheduled_end=datetime.now(UTC) + timedelta(hours=1),
    ).insert()
    await VisitPhoto(
        id=photo_id,
        visit_id=visit_id,
        nurse_id="track-c-stream-nurse",
        cloudinary_public_id="nest-home-care/visit-proof/track-c-stream-photo-01",
        delivery_type="private",
        status="uploaded",
    ).insert()
    care_ops_router = importlib.import_module("app.modules.care_ops.router")
    monkeypatch.setattr(
        care_ops_router,
        "signed_delivery_url",
        lambda *_args, **_kwargs: "https://provider.invalid/private-image",
    )
    monkeypatch.setattr(
        care_ops_router.httpx, "AsyncClient", lambda *_args, **_kwargs: _ProviderClient()
    )

    settings = get_settings()
    actor_id = "track-c-photo-reviewer"
    expires = int(datetime.now(UTC).timestamp()) + 120
    signature = temporary_stream_signature(
        settings,
        actor_id=actor_id,
        visit_id=visit_id,
        photo_id=photo_id,
        variant="thumbnail",
        expires=expires,
    )
    path = f"/api/v1/admin/care/visits/{visit_id}/photos/{photo_id}/stream"
    response = await client.get(
        path,
        params={
            "actor_id": actor_id,
            "expires": expires,
            "signature": signature,
            "variant": "thumbnail",
        },
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert (
        await AuditLog.find_one(AuditLog.action == "care.photo.view", AuditLog.item_id == photo_id)
        is not None
    )

    expired = expires - 500
    expired_signature = temporary_stream_signature(
        settings,
        actor_id=actor_id,
        visit_id=visit_id,
        photo_id=photo_id,
        variant="thumbnail",
        expires=expired,
    )
    blocked = await client.get(
        path,
        params={
            "actor_id": actor_id,
            "expires": expired,
            "signature": expired_signature,
            "variant": "thumbnail",
        },
    )
    assert blocked.status_code == 403
