"""Database tests use the real TEST_MONGODB_URI fixture and skip when absent."""

import httpx

from app.modules.audit.models import AuditLog
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/faqs"
PUBLIC = "/api/v1/public/faqs"


def editor() -> dict[str, str]:
    return auth(make_token(["content:read", "content:write", "content:publish"]))


def body(**changes) -> dict:
    data = {
        "question": {"en": "Test question"},
        "answer": {"en": "Test answer"},
        "sort_order": 1,
        "published": True,
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
    updated = await client.patch(f"{ADMIN}/{item['id']}", json={"sort_order": 9}, headers=editor())
    assert updated.status_code == 200 and updated.json()["sort_order"] == 9
    deleted = await client.delete(f"{ADMIN}/{item['id']}", headers=editor())
    assert deleted.status_code == 204
    assert (await client.get(f"{ADMIN}/{item['id']}", headers=editor())).status_code == 404


async def test_admin_writes_are_audited(mongo: object, client: httpx.AsyncClient) -> None:
    response = await client.post(ADMIN, json=body(), headers=editor())
    assert response.status_code == 201
    action = await AuditLog.find_one(AuditLog.action == "faq.create")
    assert action is not None and action.after is not None


async def test_public_list_excludes_faq_drafts(mongo: object, client: httpx.AsyncClient) -> None:
    response = await client.post(ADMIN, json=body(published=False), headers=editor())
    assert response.status_code == 201
    public = await client.get(PUBLIC)
    assert public.status_code == 200
    assert all(item["id"] != response.json()["id"] for item in public.json())
