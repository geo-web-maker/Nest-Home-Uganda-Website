"""Database tests use the real TEST_MONGODB_URI fixture and skip when absent."""

import httpx

from app.modules.audit.models import AuditLog
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/pages"
PUBLIC = "/api/v1/public/pages"


def editor() -> dict[str, str]:
    return auth(make_token(["content:read", "content:write", "content:publish"]))


def body(**changes) -> dict:
    data = {
        "key": "about-story",
        "title": {"en": "Test title"},
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
    updated = await client.patch(
        f"{ADMIN}/{item['id']}", json={"title": {"en": "Updated title"}}, headers=editor()
    )
    assert updated.status_code == 200 and updated.json()["title"]["en"] == "Updated title"
    deleted = await client.delete(f"{ADMIN}/{item['id']}", headers=editor())
    assert deleted.status_code == 204
    assert (await client.get(f"{ADMIN}/{item['id']}", headers=editor())).status_code == 404


async def test_admin_writes_are_audited(mongo: object, client: httpx.AsyncClient) -> None:
    response = await client.post(ADMIN, json=body(), headers=editor())
    assert response.status_code == 201
    action = await AuditLog.find_one(AuditLog.action == "page.create")
    assert action is not None and action.after is not None


async def test_public_page_hides_unpublished_content(
    mongo: object, client: httpx.AsyncClient
) -> None:
    response = await client.post(
        ADMIN, json=body(key="draft-page", published=False), headers=editor()
    )
    assert response.status_code == 201
    public = await client.get(f"{PUBLIC}/draft-page")
    assert public.status_code == 404


async def test_drafter_cannot_publish_or_unpublish(
    mongo: object, client: httpx.AsyncClient
) -> None:
    drafter = auth(make_token(["content:read", "content:write"]))
    assert (await client.post(ADMIN, json=body(), headers=drafter)).status_code == 403
    live = await client.post(ADMIN, json=body(), headers=editor())
    pulled = await client.patch(
        f"{ADMIN}/{live.json()['id']}", json={"published": False}, headers=drafter
    )
    assert pulled.status_code == 403


async def test_public_page_resolves_published_and_hides_deleted(
    mongo: object, client: httpx.AsyncClient
) -> None:
    created = await client.post(ADMIN, json=body(), headers=editor())
    shown = await client.get(f"{PUBLIC}/about-story")
    assert shown.status_code == 200 and shown.json()["title"] == "Test title"
    assert "published" not in shown.json()
    await client.delete(f"{ADMIN}/{created.json()['id']}", headers=editor())
    assert (await client.get(f"{PUBLIC}/about-story")).status_code == 404


async def test_null_title_is_rejected_and_duplicate_key_conflicts(
    mongo: object, client: httpx.AsyncClient
) -> None:
    first = await client.post(ADMIN, json=body(), headers=editor())
    other = await client.post(ADMIN, json=body(key="other"), headers=editor())
    assert (
        await client.patch(f"{ADMIN}/{first.json()['id']}", json={"title": None}, headers=editor())
    ).status_code == 422
    assert (
        await client.patch(
            f"{ADMIN}/{other.json()['id']}", json={"key": "about-story"}, headers=editor()
        )
    ).status_code == 409
