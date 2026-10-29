"""Track C route acceptance matrix. These DB-backed tests are written, not run."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.core.security import hash_password
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.care_ops.models import CareInboxNotification
from app.modules.nurses.models import NurseProfile
from app.modules.visits.models import Visit, VisitPhoto
from tests.conftest import auth, make_token

# Exercise one representative route from every C8-C14 area.
ROUTE_MATRIX = [
    ("C8 field", "GET", "/api/v1/field/me", None),
    ("C14 own field timesheets", "GET", "/api/v1/field/timesheets", None),
    ("C9 field_ops", "POST", "/api/v1/field/sync/push", {"operations": []}),
    ("C10 clients", "GET", "/api/v1/admin/care/clients", None),
    ("C10 places", "GET", "/api/v1/admin/care/clients/client-0000001/places", None),
    ("C10 stays", "GET", "/api/v1/admin/care/clients/client-0000001/stays", None),
    ("C11 visits", "GET", "/api/v1/admin/care/visits", None),
    ("C12 alerts", "GET", "/api/v1/admin/care/alerts", None),
    ("C12 timesheets", "GET", "/api/v1/admin/care/timesheets", None),
    ("C13 sos", "GET", "/api/v1/admin/care/sos", None),
    ("C13 data requests", "GET", "/api/v1/admin/care/data-requests", None),
    ("C14 nurses", "GET", "/api/v1/admin/care/nurses", None),
]


async def make_actor(
    *, reach: str = "own", scopes: list[str] | None = None, kind: str = "admin"
) -> User:
    from uuid import uuid4

    user = User(
        name="Track C Test Actor",
        email=f"track-c-{uuid4().hex}@example.test",
        password_hash=hash_password("not-a-real-password-for-tests"),
        scopes=scopes or [],
        is_active=True,
        kind=kind,
        reach=reach,
    )
    await user.insert()
    return user


@pytest.mark.parametrize(("label", "method", "path", "payload"), ROUTE_MATRIX)
async def test_track_c_route_matrix_rejects_anonymous_requests(
    client: httpx.AsyncClient, label: str, method: str, path: str, payload: dict | None
) -> None:
    response = await client.request(method, path, json=payload)
    assert response.status_code == 401, f"{label}: {response.status_code} {response.text}"


async def test_track_c_route_matrix_rejects_wrong_scope(
    mongo: object, client: httpx.AsyncClient
) -> None:
    actor = await make_actor(scopes=["dashboard:view"])
    headers = auth(make_token(["dashboard:view"], user_id=str(actor.id)))
    for label, method, path, payload in ROUTE_MATRIX:
        response = await client.request(method, path, json=payload, headers=headers)
        assert response.status_code == 403, f"{label}: {response.status_code} {response.text}"


async def test_c10_c11_c14_invalid_bodies_return_422(
    mongo: object, client: httpx.AsyncClient
) -> None:
    headers = auth(make_token([], superadmin=True))
    for path in (
        "/api/v1/admin/care/clients",
        "/api/v1/admin/care/visits",
        "/api/v1/admin/care/nurses",
    ):
        response = await client.post(path, json={}, headers=headers)
        assert response.status_code == 422, f"{path}: {response.status_code} {response.text}"


async def test_c11_visit_detail_hides_out_of_reach_visit(
    mongo: object, client: httpx.AsyncClient
) -> None:
    actor = await make_actor(reach="own", scopes=["visits:read"])
    await Visit(
        id="track-c-outreach-visit",
        client_id="track-c-client",
        nurse_id="someone-else",
        place_id="track-c-place",
        scheduled_start=datetime(2026, 10, 26, 8, tzinfo=UTC),
        scheduled_end=datetime(2026, 10, 26, 9, tzinfo=UTC),
    ).insert()
    response = await client.get(
        "/api/v1/admin/care/visits/track-c-outreach-visit",
        headers=auth(make_token(["visits:read"], user_id=str(actor.id))),
    )
    assert response.status_code == 404


async def test_c2_hidden_photos_are_excluded_and_each_list_view_is_audited(
    mongo: object, client: httpx.AsyncClient
) -> None:
    visit_id = "track-c-photo-list-visit"
    await Visit(
        id=visit_id,
        client_id="track-c-client",
        nurse_id="track-c-nurse",
        place_id="track-c-place",
        scheduled_start=datetime(2026, 10, 26, 8, tzinfo=UTC),
        scheduled_end=datetime(2026, 10, 26, 9, tzinfo=UTC),
    ).insert()
    await VisitPhoto(
        id="track-c-photo-visible",
        visit_id=visit_id,
        nurse_id="track-c-nurse",
        cloudinary_public_id="nest-home-care/visit-proof/track-c-photo-visible",
        status="uploaded",
    ).insert()
    await VisitPhoto(
        id="track-c-photo-hidden",
        visit_id=visit_id,
        nurse_id="track-c-nurse",
        cloudinary_public_id="nest-home-care/visit-proof/track-c-photo-hidden",
        status="hidden",
    ).insert()
    headers = auth(make_token([], superadmin=True))
    detail = await client.get(f"/api/v1/admin/care/visits/{visit_id}/photos", headers=headers)
    assert detail.status_code == 200
    assert [item["id"] for item in detail.json()["items"]] == ["track-c-photo-visible"]
    general = await client.get("/api/v1/admin/care/photos", headers=headers)
    assert general.status_code == 200
    returned_ids = {item["id"] for item in general.json()["items"]}
    assert "track-c-photo-hidden" not in returned_ids
    assert await AuditLog.find_one(
        AuditLog.action == "care.photo.list.view", AuditLog.item_id == visit_id
    )
    assert await AuditLog.find_one(AuditLog.action == "care.photo.list.view.all")


async def test_c3_accept_invite_is_single_use_and_rejects_expiry(
    mongo: object, client: httpx.AsyncClient
) -> None:
    from app.core.security import hash_token
    from app.modules.auth.models import PasswordReset

    actor = await make_actor(kind="nurse")
    good_token = "track-c-invite-token-000001"
    link = PasswordReset(
        user_id=actor.id,
        token_hash=hash_token(good_token),
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
        purpose="invite",
    )
    await link.insert()
    accepted = await client.post(
        "/api/v1/auth/accept-invite",
        json={"token": good_token, "password": "a-long-valid-password-123"},
    )
    assert accepted.status_code == 200
    reused = await client.post(
        "/api/v1/auth/accept-invite",
        json={"token": good_token, "password": "another-valid-password-123"},
    )
    assert reused.status_code == 422

    expired_token = "track-c-expired-invite-00001"
    await PasswordReset(
        user_id=actor.id,
        token_hash=hash_token(expired_token),
        expires_at=datetime.now(UTC) - timedelta(seconds=1),
        purpose="invite",
    ).insert()
    expired = await client.post(
        "/api/v1/auth/accept-invite",
        json={"token": expired_token, "password": "a-long-valid-password-123"},
    )
    assert expired.status_code == 422


async def test_c3_nurse_invite_lifecycle_obeys_team_reach(
    mongo: object, client: httpx.AsyncClient
) -> None:
    actor = await make_actor(reach="own", scopes=["nurses:write"])
    target_id = "6a0000000000000000000001"
    response = await client.post(
        f"/api/v1/admin/care/nurses/{target_id}/invite",
        headers=auth(make_token(["nurses:write"], user_id=str(actor.id))),
    )
    assert response.status_code == 404


async def test_c5_inbox_is_scoped_to_signed_in_nurse(
    mongo: object, client: httpx.AsyncClient
) -> None:
    first = await make_actor(scopes=["field:use"], kind="nurse")
    second = await make_actor(scopes=["field:use"], kind="nurse")
    await NurseProfile(user_id=str(first.id), staff_number="TC-NURSE-1", active=True).insert()
    await NurseProfile(user_id=str(second.id), staff_number="TC-NURSE-2", active=True).insert()
    await CareInboxNotification(
        id="track-c-inbox-owned",
        user_id=str(first.id),
        category="care_alert",
        title="Care alert",
        body="A care operations alert needs review.",
    ).insert()
    await CareInboxNotification(
        id="track-c-inbox-other",
        user_id=str(second.id),
        category="care_alert",
        title="Care alert",
        body="A care operations alert needs review.",
    ).insert()
    response = await client.get(
        "/api/v1/field/inbox", headers=auth(make_token(["field:use"], user_id=str(first.id)))
    )
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()["items"]}
    assert ids == {"track-c-inbox-owned"}
