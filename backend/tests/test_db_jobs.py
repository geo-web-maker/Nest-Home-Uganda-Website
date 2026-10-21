"""Jobs module integration tests. Requires TEST_MONGODB_URI via the shared fixture."""

import httpx
from bson import ObjectId

from app.modules.audit.models import AuditLog, ContentVersion
from app.modules.jobs.models import Job
from app.modules.jobs.seed import seed_jobs
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/jobs"
PUBLIC = "/api/v1/public/jobs"


def editor() -> dict[str, str]:
    return auth(make_token(["jobs:read", "jobs:write"]))


def body(**changes) -> dict:
    data = {
        "title": {"en": "Registered Nurse", "lg": "Omusawo omujjanjabi"},
        "department": "clinical",
        "location": "Kampala",
        "type": "full_time",
        "description": {"en": "Client to supply"},
        "requirements": {"en": "Client to supply"},
        "closes_on": None,
        "registration_required": True,
        "show_closing": True,
        "published": False,
    }
    data.update(changes)
    return data


async def test_create_update_publish_close_and_audit(
    mongo: object, client: httpx.AsyncClient
) -> None:
    created = await client.post(ADMIN, json=body(published=True), headers=editor())
    assert created.status_code == 201
    item = created.json()
    assert item["published"] is False  # publication is an explicit action
    assert item["applicants_count"] == 0
    bypass_publish = await client.patch(
        f"{ADMIN}/{item['id']}", json={"published": True}, headers=editor()
    )
    assert bypass_publish.status_code == 422

    updated = await client.patch(
        f"{ADMIN}/{item['id']}", json={"location": "Entebbe", "closes_on": "2027-02-28"},
        headers=editor(),
    )
    assert updated.status_code == 200
    assert updated.json()["location"] == "Entebbe"
    assert await ContentVersion.find(ContentVersion.item_id == item["id"]).count() == 1

    published = await client.post(f"{ADMIN}/{item['id']}/publish", json={}, headers=editor())
    assert published.status_code == 200 and published.json()["published"] is True
    public = await client.get(f"{PUBLIC}/{item['id']}?lang=en")
    assert public.status_code == 200
    assert "published" not in public.json() and "applicants_count" not in public.json()

    closed = await client.post(f"{ADMIN}/{item['id']}/close", json={}, headers=editor())
    assert closed.status_code == 200 and closed.json()["closed_at"] is not None
    assert (await client.get(f"{PUBLIC}/{item['id']}")).status_code == 404

    actions = [entry.action async for entry in AuditLog.find_all()]
    assert actions.count("job.create") == 1
    assert actions.count("job.update") == 1
    assert actions.count("job.publish") == 1
    assert actions.count("job.close") == 1


async def test_public_list_hides_drafts_closed_jobs_and_expired_jobs(
    mongo: object, client: httpx.AsyncClient
) -> None:
    draft = (await client.post(ADMIN, json=body(title={"en": "Draft"}), headers=editor())).json()
    old_date = "2000-01-01"
    expired = (await client.post(
        ADMIN, json=body(title={"en": "Expired"}, closes_on=old_date), headers=editor()
    )).json()
    valid = (await client.post(ADMIN, json=body(title={"en": "Current"}), headers=editor())).json()
    assert draft["published"] is False
    assert (
        await client.post(f"{ADMIN}/{expired['id']}/publish", json={}, headers=editor())
    ).status_code == 422
    assert (
        await client.post(f"{ADMIN}/{valid['id']}/publish", json={}, headers=editor())
    ).status_code == 200
    r = await client.get(f"{PUBLIC}?lang=en")
    assert r.status_code == 200
    assert [item["title"] for item in r.json()] == ["Current"]


async def test_admin_list_validation_and_soft_delete(
    mongo: object, client: httpx.AsyncClient
) -> None:
    first = (await client.post(ADMIN, json=body(), headers=editor())).json()
    second = (
        await client.post(ADMIN, json=body(title={"en": "Caregiver"}), headers=editor())
    ).json()
    listed = await client.get(f"{ADMIN}?page=1&page_size=1", headers=editor())
    assert listed.status_code == 200 and listed.json()["total"] == 2
    assert (await client.get(f"{ADMIN}?page_size=1000", headers=editor())).status_code == 422
    assert (await client.delete(f"{ADMIN}/{first['id']}", headers=editor())).status_code == 204
    assert (await client.get(f"{ADMIN}/{first['id']}", headers=editor())).status_code == 404
    persisted = await Job.find_one({"_id": ObjectId(first["id"])})
    assert persisted is not None and persisted.deleted_at is not None
    assert second["id"] != first["id"]


async def test_invalid_jobs_return_field_errors_and_seed_is_idempotent(
    mongo: object, client: httpx.AsyncClient
) -> None:
    bad = await client.post(ADMIN, json=body(title={"lg": "Omusawo"}), headers=editor())
    assert bad.status_code == 422 and "title" in bad.json()["error"]["fields"]
    bad_date = await client.post(ADMIN, json=body(closes_on="2027-02-30"), headers=editor())
    assert bad_date.status_code == 422
    assert await seed_jobs(Job) == 3
    assert await seed_jobs(Job) == 0
    assert await Job.count() == 3
