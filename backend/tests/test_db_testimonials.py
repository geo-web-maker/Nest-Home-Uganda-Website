"""Database tests use the real TEST_MONGODB_URI fixture and skip when absent."""

import httpx

from app.modules.audit.models import AuditLog
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/testimonials"
PUBLIC = "/api/v1/public/testimonials"


def editor() -> dict[str, str]:
    return auth(make_token(["content:read", "content:write", "content:publish"]))


def body(**changes) -> dict:
    data = {
        "first_name": "Sample",
        "area": "Sample",
        "quote": {"en": "Test quote"},
        "permission_received": True,
        "approved": True,
    }
    data.update(changes)
    return data


async def test_admin_create_list_update_and_soft_delete(
    mongo: object, client: httpx.AsyncClient
) -> None:
    response = await client.post(ADMIN, json=body(), headers=editor())
    assert response.status_code == 201
    item = response.json()
    assert item["id"]
    listed = await client.get(ADMIN, headers=editor())
    assert listed.status_code == 200 and listed.json()["total"] == 1
    updated = await client.patch(
        f"{ADMIN}/{item['id']}", json={"first_name": "Updated sample"}, headers=editor()
    )
    assert updated.status_code == 200 and updated.json()["first_name"] == "Updated sample"
    deleted = await client.delete(f"{ADMIN}/{item['id']}", headers=editor())
    assert deleted.status_code == 204
    assert (await client.get(f"{ADMIN}/{item['id']}", headers=editor())).status_code == 404


async def test_admin_writes_are_audited(mongo: object, client: httpx.AsyncClient) -> None:
    response = await client.post(ADMIN, json=body(), headers=editor())
    assert response.status_code == 201
    action = await AuditLog.find_one(AuditLog.action == "testimonial.create")
    assert action is not None and action.after is not None


async def test_public_list_does_not_expose_unpublished_content(
    mongo: object, client: httpx.AsyncClient
) -> None:
    response = await client.post(
        ADMIN, json=body(approved=False, permission_received=False), headers=editor()
    )
    assert response.status_code == 201
    public = await client.get(PUBLIC)
    assert public.status_code == 200
    if isinstance(public.json(), list):
        assert all(item.get("id") != response.json()["id"] for item in public.json())


async def test_approval_needs_written_permission(mongo: object, client: httpx.AsyncClient) -> None:
    refused = await client.post(
        ADMIN, json=body(approved=True, permission_received=False), headers=editor()
    )
    assert refused.status_code == 422
    draft = await client.post(
        ADMIN, json=body(approved=False, permission_received=False), headers=editor()
    )
    approve = await client.patch(
        f"{ADMIN}/{draft.json()['id']}", json={"approved": True}, headers=editor()
    )
    assert approve.status_code == 422
