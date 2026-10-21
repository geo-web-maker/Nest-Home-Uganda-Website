"""Database tests use the real TEST_MONGODB_URI fixture and skip when absent."""

import httpx

from app.modules.audit.models import AuditLog
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/articles"
PUBLIC = "/api/v1/public/articles"


def editor() -> dict[str, str]:
    return auth(make_token(["content:read", "content:write", "content:publish"]))


def body(**changes) -> dict:
    data = {
        "slug": "sample-article",
        "title": {"en": "Test title"},
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
    action = await AuditLog.find_one(AuditLog.action == "article.create")
    assert action is not None and action.after is not None


async def test_public_list_does_not_expose_unpublished_content(
    mongo: object, client: httpx.AsyncClient
) -> None:
    response = await client.post(ADMIN, json=body(published=False), headers=editor())
    assert response.status_code == 201
    public = await client.get(PUBLIC)
    assert public.status_code == 200
    if isinstance(public.json(), list):
        assert all(item.get("id") != response.json()["id"] for item in public.json())


def drafter() -> dict[str, str]:
    return auth(make_token(["content:read", "content:write"]))


async def test_drafter_cannot_publish_or_unpublish(
    mongo: object, client: httpx.AsyncClient
) -> None:
    when = "2020-01-01T00:00:00Z"
    refused = await client.post(ADMIN, json=body(published_at=when), headers=drafter())
    assert refused.status_code == 403
    live = await client.post(ADMIN, json=body(published_at=when), headers=editor())
    assert live.status_code == 201
    item_id = live.json()["id"]
    pulled = await client.patch(
        f"{ADMIN}/{item_id}", json={"published_at": None}, headers=drafter()
    )
    assert pulled.status_code == 403


async def test_public_shows_published_and_hides_deleted(
    mongo: object, client: httpx.AsyncClient
) -> None:
    created = await client.post(
        ADMIN, json=body(published_at="2020-01-01T00:00:00Z"), headers=editor()
    )
    assert created.status_code == 201
    assert (await client.get(f"{PUBLIC}/sample-article")).status_code == 200
    await client.delete(f"{ADMIN}/{created.json()['id']}", headers=editor())
    assert (await client.get(f"{PUBLIC}/sample-article")).status_code == 404


async def test_null_slug_is_rejected_and_duplicate_slug_conflicts(
    mongo: object, client: httpx.AsyncClient
) -> None:
    first = await client.post(ADMIN, json=body(), headers=editor())
    other = await client.post(ADMIN, json=body(slug="other"), headers=editor())
    assert (
        await client.patch(f"{ADMIN}/{first.json()['id']}", json={"slug": None}, headers=editor())
    ).status_code == 422
    assert (
        await client.patch(
            f"{ADMIN}/{other.json()['id']}", json={"slug": "sample-article"}, headers=editor()
        )
    ).status_code == 409
