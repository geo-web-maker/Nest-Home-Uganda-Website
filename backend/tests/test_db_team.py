"""Team API tests use a real TEST_MONGODB_URI fixture and skip when absent."""

import httpx

from app.modules.audit.models import AuditLog, ContentVersion
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/team"
PUBLIC = "/api/v1/public/team"


def editor() -> dict[str, str]:
    return auth(make_token(["content:read", "content:write"]))


def publisher() -> dict[str, str]:
    return auth(make_token(["content:read", "content:write", "content:publish"]))


def body(**changes) -> dict:
    data = {
        "name": "Nurse supplied by client",
        "role": {"en": "Role supplied by client"},
        "qualification": {"en": "Qualification supplied by client"},
        "bio": {},
        "photo_media_id": None,
        "sort_order": 1,
        "published": False,
    }
    data.update(changes)
    return data


async def test_create_update_soft_delete_and_audit(
    mongo: object, client: httpx.AsyncClient
) -> None:
    response = await client.post(ADMIN, json=body(), headers=editor())
    assert response.status_code == 201
    item = response.json()
    assert item["registration_number"] is None
    changed = await client.patch(f"{ADMIN}/{item['id']}", json={"sort_order": 2}, headers=editor())
    assert changed.status_code == 200 and changed.json()["sort_order"] == 2
    removed = await client.delete(f"{ADMIN}/{item['id']}", headers=editor())
    assert removed.status_code == 204
    assert (await client.get(f"{ADMIN}/{item['id']}", headers=editor())).status_code == 404
    assert await AuditLog.find(AuditLog.action == "team_member.create").count() == 1
    assert await AuditLog.find(AuditLog.action == "team_member.update").count() == 1
    assert await AuditLog.find(AuditLog.action == "team_member.delete").count() == 1
    assert await ContentVersion.find(ContentVersion.item_type == "team_member").count() == 2


async def test_public_list_hides_drafts_and_registration_numbers(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await client.post(ADMIN, json=body(published=True), headers=publisher())
    await client.post(ADMIN, json=body(name="Draft", published=False), headers=editor())
    response = await client.get(PUBLIC)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert "registration_number" not in response.json()[0]
    assert "bio" not in response.json()[0]


async def test_admin_list_search_and_pagination(mongo: object, client: httpx.AsyncClient) -> None:
    await client.post(ADMIN, json=body(name="Client supplied nurse"), headers=editor())
    await client.post(ADMIN, json=body(name="Other supplied nurse"), headers=editor())
    response = await client.get(
        ADMIN, params={"q": "Client", "page": 1, "page_size": 1}, headers=editor()
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert len(response.json()["items"]) == 1
