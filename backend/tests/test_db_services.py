"""The services module against a real MongoDB (needs TEST_MONGODB_URI)."""

import httpx

from app.modules.audit.models import AuditLog, ContentVersion
from app.modules.services.models import Service
from app.modules.services.seed import seed_services
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/services"
PUBLIC = "/api/v1/public/services"


def editor() -> dict:
    return auth(make_token(["content:read", "content:write"]))


def publisher() -> dict:
    return auth(make_token(["content:read", "content:write", "content:publish"]))


def body(slug: str = "postnatal-newborn-care", **kw) -> dict:
    return {"slug": slug, "name": {"en": "Postnatal care", "lg": "Obujjanjabi"}, **kw}


async def create(client: httpx.AsyncClient, headers: dict, **kw) -> httpx.Response:
    return await client.post(ADMIN, json=body(**kw), headers=headers)


async def test_create_is_a_draft_and_audited(mongo: object, client: httpx.AsyncClient) -> None:
    r = await create(client, editor())
    assert r.status_code == 201
    data = r.json()
    assert data["published"] is False and data["content_needed"] is True
    entry = await AuditLog.find_one(AuditLog.action == "service.create")
    assert entry is not None and entry.scope == "content:write"
    assert entry.item_id == data["id"] and entry.after is not None


async def test_publishing_needs_the_publish_scope(mongo: object, client: httpx.AsyncClient) -> None:
    assert (await create(client, editor(), published=True)).status_code == 403
    r = await create(client, publisher(), published=True)
    assert r.status_code == 201 and r.json()["published"] is True
    sid = r.json()["id"]
    r = await client.patch(f"{ADMIN}/{sid}", json={"published": False}, headers=editor())
    assert r.status_code == 403
    r = await client.patch(f"{ADMIN}/{sid}", json={"published": False}, headers=publisher())
    assert r.status_code == 200 and r.json()["published"] is False
    # An edit that leaves `published` alone does not need the publish scope.
    r = await client.patch(f"{ADMIN}/{sid}", json={"sort_order": 4}, headers=editor())
    assert r.status_code == 200


async def test_duplicate_slug_is_a_conflict(mongo: object, client: httpx.AsyncClient) -> None:
    assert (await create(client, editor())).status_code == 201
    r = await create(client, editor())
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "conflict" and "slug" in r.json()["error"]["fields"]


async def test_validation_errors_name_the_field(mongo: object, client: httpx.AsyncClient) -> None:
    r = await client.post(ADMIN, json={"slug": "Bad Slug", "name": {"lg": "x"}}, headers=editor())
    assert r.status_code == 422
    assert {"slug", "name"} <= set(r.json()["error"]["fields"])


async def test_update_audits_before_and_after_and_keeps_versions(
    mongo: object, client: httpx.AsyncClient
) -> None:
    sid = (await create(client, editor())).json()["id"]
    r = await client.patch(f"{ADMIN}/{sid}", json={"number": 2}, headers=editor())
    assert r.status_code == 200 and r.json()["number"] == 2
    entry = await AuditLog.find_one(AuditLog.action == "service.update")
    assert entry is not None and entry.before["number"] == 0 and entry.after["number"] == 2
    assert await ContentVersion.find(ContentVersion.item_id == sid).count() == 1


async def test_only_ten_versions_are_kept(mongo: object, client: httpx.AsyncClient) -> None:
    sid = (await create(client, editor())).json()["id"]
    for i in range(12):
        await client.patch(f"{ADMIN}/{sid}", json={"number": i}, headers=editor())
    assert await ContentVersion.find(ContentVersion.item_id == sid).count() == 10


async def test_bad_or_missing_id_is_404(mongo: object, client: httpx.AsyncClient) -> None:
    for sid in ("nope", "0" * 24):
        assert (await client.get(f"{ADMIN}/{sid}", headers=editor())).status_code == 404
        assert (await client.patch(f"{ADMIN}/{sid}", json={}, headers=editor())).status_code == 404
        assert (await client.delete(f"{ADMIN}/{sid}", headers=editor())).status_code == 404


async def test_related_must_exist_and_not_be_self(mongo: object, client: httpx.AsyncClient) -> None:
    a = (await create(client, editor(), slug="aa")).json()["id"]
    r = await client.patch(f"{ADMIN}/{a}", json={"related": [a]}, headers=editor())
    assert r.status_code == 422
    r = await client.patch(f"{ADMIN}/{a}", json={"related": ["f" * 24]}, headers=editor())
    assert r.status_code == 422
    b = (await create(client, editor(), slug="bb")).json()["id"]
    r = await client.patch(f"{ADMIN}/{a}", json={"related": [b]}, headers=editor())
    assert r.status_code == 200 and r.json()["related"] == [b]


async def test_delete_is_soft_and_hides_everywhere(
    mongo: object, client: httpx.AsyncClient
) -> None:
    sid = (await create(client, publisher(), published=True)).json()["id"]
    assert (await client.delete(f"{ADMIN}/{sid}", headers=editor())).status_code == 204
    assert (await client.get(f"{ADMIN}/{sid}", headers=editor())).status_code == 404
    assert (await client.get(f"{PUBLIC}/postnatal-newborn-care")).status_code == 404
    assert (await client.get(PUBLIC)).json() == []
    kept = await Service.find_one({"slug": "postnatal-newborn-care"})
    assert kept is not None and kept.deleted_at is not None and kept.published is False
    assert await AuditLog.find(AuditLog.action == "service.delete").count() == 1


async def test_admin_list_pages_and_filters(mongo: object, client: httpx.AsyncClient) -> None:
    for slug in ("alpha", "alpine", "beta"):
        await create(client, editor(), slug=slug)
    r = await client.get(f"{ADMIN}?page=1&page_size=2", headers=editor())
    data = r.json()
    assert set(data) == {"items", "total", "page", "page_size"}
    assert data["total"] == 3 and len(data["items"]) == 2 and data["page_size"] == 2
    r = await client.get(f"{ADMIN}?q=alp", headers=editor())
    assert {i["slug"] for i in r.json()["items"]} == {"alpha", "alpine"}
    r = await client.get(f"{ADMIN}?published=true", headers=editor())
    assert r.json()["total"] == 0
    assert (await client.get(f"{ADMIN}?page_size=1000", headers=editor())).status_code == 422


async def test_public_list_shows_only_published_in_order(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await create(client, publisher(), slug="second", published=True, sort_order=2)
    await create(client, publisher(), slug="first", published=True, sort_order=1)
    await create(client, publisher(), slug="draft")
    r = await client.get(PUBLIC)
    assert r.status_code == 200
    assert [s["slug"] for s in r.json()] == ["first", "second"]
    assert r.headers["cache-control"] == "public, max-age=60"


async def test_public_text_falls_back_to_english_per_field(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await create(
        client,
        publisher(),
        published=True,
        summary={"en": "Mother and baby support"},
        hero_headline={"en": "Care at home", "lg": "Obujjanjabi awaka"},
    )
    lg = (await client.get(f"{PUBLIC}/postnatal-newborn-care?lang=lg")).json()
    assert lg["name"] == "Obujjanjabi"  # translated
    assert lg["summary"] == "Mother and baby support"  # falls back, per field
    assert lg["hero_headline"] == "Obujjanjabi awaka"
    sw = (
        await client.get(f"{PUBLIC}/postnatal-newborn-care", headers={"Accept-Language": "sw"})
    ).json()
    assert sw["name"] == "Postnatal care"


async def test_public_detail_includes_published_related_only(
    mongo: object, client: httpx.AsyncClient
) -> None:
    live = (await create(client, publisher(), slug="live", published=True)).json()["id"]
    draft = (await create(client, publisher(), slug="draft")).json()["id"]
    main = await create(client, publisher(), slug="main", published=True, related=[live, draft])
    assert main.status_code == 201
    detail = (await client.get(f"{PUBLIC}/main")).json()
    assert [r["slug"] for r in detail["related"]] == ["live"]
    assert "published" not in detail and "deleted_at" not in detail


async def test_seed_creates_eight_services_once_and_keeps_admin_edits(
    mongo: object, client: httpx.AsyncClient
) -> None:
    assert await seed_services() == 8
    assert await seed_services() == 0
    cards = (await client.get(PUBLIC)).json()
    assert [c["number"] for c in cards] == list(range(1, 9))
    sid = next(c["id"] for c in cards if c["slug"] == "hospital-to-home")
    await client.patch(f"{ADMIN}/{sid}", json={"summary": {"en": "Edited"}}, headers=editor())
    await seed_services()
    detail = (await client.get(f"{PUBLIC}/hospital-to-home")).json()
    assert detail["summary"] == "Edited"
    flags = {
        i["slug"]: i["content_needed"]
        for i in (await client.get(ADMIN, headers=editor())).json()["items"]
    }
    assert flags["postnatal-newborn-care"] is False and flags["hospital-to-home"] is True


async def test_every_admin_write_in_this_module_creates_an_audit_entry(
    mongo: object, client: httpx.AsyncClient
) -> None:
    sid = (await create(client, editor())).json()["id"]
    await client.patch(f"{ADMIN}/{sid}", json={"number": 1}, headers=editor())
    await client.delete(f"{ADMIN}/{sid}", headers=editor())
    actions = [a.action async for a in AuditLog.find_all()]
    assert sorted(actions) == ["service.create", "service.delete", "service.update"]
