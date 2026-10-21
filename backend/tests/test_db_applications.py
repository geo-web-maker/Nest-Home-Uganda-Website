"""Applications against a real MongoDB (needs TEST_MONGODB_URI).

Written in S5.18 and NOT RUN locally (no MongoDB in that session). CI runs them.
"""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from beanie import PydanticObjectId

from app.core.rate_limit import limiter
from app.core.storage import Bucket, MemoryStorage
from app.modules.applications import service
from app.modules.applications.models import Application
from app.modules.audit.models import AuditLog
from app.modules.jobs.models import Job
from tests.conftest import auth, make_token

PUBLIC = "/api/v1/public/applications"
ADMIN = "/api/v1/admin/applications"
PDF = b"%PDF-1.7\n" + b"0" * 32


def reviewer() -> dict:
    return auth(make_token(["applications:read", "applications:write"]))


def fields(**kw) -> dict:
    data = {
        "name": "Mary Atim",
        "phone": "0787 499 988",
        "email": "mary.atim@gmail.com",
        "qualification": "Diploma in Nursing",
        "experience_years": "4",
        "area": "Ntinda",
        "availability": "From 1 December",
        "consent": "true",
    }
    data.update(kw)
    return data


def cv(data: bytes = PDF, name: str = "My CV.pdf") -> dict:
    return {"cv": (name, data, "application/pdf")}


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> MemoryStorage:
    memory = MemoryStorage()
    monkeypatch.setattr(service, "get_storage", lambda: memory)
    return memory


async def make_job(**kw) -> Job:
    data = {
        "title": {"en": "Registered Nurse"},
        "location": "Kampala",
        "department": "clinical",
        "published": True,
        "registration_required": False,
    }
    data.update(kw)
    job = Job(**data)
    await job.insert()
    return job


async def apply(client: httpx.AsyncClient, **kw) -> httpx.Response:
    return await client.post(PUBLIC, data=fields(**kw), files=cv())


async def test_a_general_application_is_stored_with_a_private_cv(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    r = await apply(client)
    assert r.status_code == 201 and r.json() == {"status": "received"}
    doc = await Application.find_one({})
    assert doc is not None
    assert doc.job_id is None and doc.job_title_snapshot == "General interest"
    assert doc.stage == "received" and doc.consent is True
    assert doc.phone_e164 == "+256787499988"
    assert doc.cv_file_name == "My CV.pdf"
    assert doc.cv_file_key
    assert doc.cv_file_key.startswith("cv/") and doc.cv_file_key.endswith(".pdf")
    assert (Bucket.PRIVATE, doc.cv_file_key) in storage.objects
    assert not any(bucket == Bucket.PUBLIC for bucket, _ in storage.objects)  # never public
    assert doc.ip_hash and "127" not in doc.ip_hash
    assert doc.delete_after is not None
    assert timedelta(days=364) < doc.delete_after - doc.created_at < timedelta(days=366)
    assert [e.kind for e in doc.events] == ["received"]


async def test_applying_to_an_open_job_counts_for_that_job(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    job = await make_job()
    assert (await apply(client, job_id=str(job.id))).status_code == 201
    doc = await Application.find_one({})
    assert doc is not None and doc.job_id == job.id
    assert doc.job_title_snapshot == "Registered Nurse"
    listed = await client.get(
        f"/api/v1/admin/jobs/{job.id}", headers=auth(make_token(["jobs:read"]))
    )
    assert listed.json()["applicants_count"] == 1


async def test_closed_unpublished_and_unknown_jobs_are_refused(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    draft = await make_job(published=False)
    closed = await make_job(closed_at=datetime.now(UTC))
    expired = await make_job(closes_on="2020-01-01")
    for job_id in (str(draft.id), str(closed.id), str(expired.id), str(PydanticObjectId())):
        limiter.reset()  # 4 applications from one IP would trip the 3 per day limit
        r = await apply(client, job_id=job_id)
        assert r.status_code == 422, job_id
        assert r.json()["error"]["fields"] == {"job_id": "not open"}
    assert await Application.count() == 0 and not storage.objects


async def test_a_clinical_job_needs_a_registration_number(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    job = await make_job(registration_required=True)
    r = await apply(client, job_id=str(job.id))
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"registration_number": "required"}
    assert not storage.objects  # nothing is stored for a refused application
    ok = await apply(client, job_id=str(job.id), registration_number="RN-1234")
    assert ok.status_code == 201


async def test_a_failed_insert_leaves_no_cv_behind(
    mongo: object,
    client: httpx.AsyncClient,
    storage: MemoryStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def boom(self: Application, *a: object, **k: object) -> None:
        raise RuntimeError("database down")

    monkeypatch.setattr(Application, "insert", boom)
    assert (await apply(client)).status_code == 500
    assert not storage.objects


async def test_list_filters_by_stage_and_pages(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    for name in ("Anna One", "Beth Two", "Cara Three"):
        assert (await apply(client, name=name)).status_code == 201
        limiter.reset()  # the 3 per day limit is tested elsewhere
    first = await Application.find_one({"name": "Anna One"})
    assert first is not None
    shortlisted = await client.patch(
        f"{ADMIN}/{first.id}", json={"stage": "shortlisted"}, headers=reviewer()
    )
    assert shortlisted.status_code == 200
    everyone = (await client.get(ADMIN, headers=reviewer())).json()
    assert everyone["total"] == 3
    assert [i["name"] for i in everyone["items"]] == ["Cara Three", "Beth Two", "Anna One"]
    only = (await client.get(f"{ADMIN}?stage=shortlisted", headers=reviewer())).json()
    assert [i["name"] for i in only["items"]] == ["Anna One"]
    page = (await client.get(f"{ADMIN}?page=2&page_size=2", headers=reviewer())).json()
    assert page["total"] == 3 and len(page["items"]) == 1
    found = (await client.get(f"{ADMIN}?q=beth", headers=reviewer())).json()
    assert [i["name"] for i in found["items"]] == ["Beth Two"]
    assert (await client.get(f"{ADMIN}?stage=maybe", headers=reviewer())).status_code == 422


async def test_detail_has_every_answer_but_no_storage_key(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    await apply(client, cover_note="I love caring for people.")
    doc = await Application.find_one({})
    assert doc is not None
    r = await client.get(f"{ADMIN}/{doc.id}", headers=reviewer())
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "mary.atim@gmail.com" and body["phone_e164"] == "+256787499988"
    assert body["cover_note"] == "I love caring for people."
    assert body["cv_available"] is True and body["cv_file_name"] == "My CV.pdf"
    assert "cv_file_key" not in body and "ip_hash" not in body
    assert body["events"][0]["text"] == "Application received from the website"
    assert (await client.get(f"{ADMIN}/not-an-id", headers=reviewer())).status_code == 404
    assert (await client.get(f"{ADMIN}/{'0' * 24}", headers=reviewer())).status_code == 404


async def test_declining_needs_a_reason_and_leaving_declined_clears_it(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    await apply(client)
    doc = await Application.find_one({})
    assert doc is not None
    url = f"{ADMIN}/{doc.id}"
    refused = await client.patch(url, json={"stage": "declined"}, headers=reviewer())
    assert refused.status_code == 422
    assert refused.json()["error"]["fields"] == {"decline_reason": "required"}
    blank = await client.patch(
        url, json={"stage": "declined", "decline_reason": "  "}, headers=reviewer()
    )
    assert blank.status_code == 422
    declined = await client.patch(
        url,
        json={"stage": "declined", "decline_reason": "Not enough experience"},
        headers=reviewer(),
    )
    assert declined.status_code == 200
    assert declined.json()["decline_reason"] == "Not enough experience"
    back = await client.patch(
        url, json={"stage": "shortlisted", "decline_reason": None}, headers=reviewer()
    )
    assert back.json()["stage"] == "shortlisted" and back.json()["decline_reason"] is None
    # a reason sent with a stage that is not declined is dropped, not stored
    stray = await client.patch(
        url, json={"stage": "interview", "decline_reason": "ignored"}, headers=reviewer()
    )
    assert stray.json()["decline_reason"] is None


async def test_rating_can_be_set_changed_and_cleared(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    await apply(client)
    doc = await Application.find_one({})
    assert doc is not None
    url = f"{ADMIN}/{doc.id}"
    assert (await client.patch(url, json={"rating": 4}, headers=reviewer())).json()["rating"] == 4
    assert (await client.patch(url, json={"rating": 6}, headers=reviewer())).status_code == 422
    assert (await client.patch(url, json={"rating": None}, headers=reviewer())).json()[
        "rating"
    ] is None
    untouched = await client.patch(url, json={"stage": "checks"}, headers=reviewer())
    assert untouched.json()["rating"] is None and untouched.json()["stage"] == "checks"


async def test_changes_are_audited_and_land_in_the_timeline(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    await apply(client)
    doc = await Application.find_one({})
    assert doc is not None
    url = f"{ADMIN}/{doc.id}"
    await client.patch(url, json={"stage": "shortlisted", "rating": 5}, headers=reviewer())
    noted = await client.post(
        f"{url}/notes", json={"text": "Strong references, call on Monday."}, headers=reviewer()
    )
    assert noted.status_code == 201
    texts = [e["text"] for e in noted.json()["events"]]
    assert "Stage changed from received to shortlisted" in texts
    assert "Rating changed" in texts
    assert "Strong references, call on Monday." in texts
    actions = [entry.action async for entry in AuditLog.find_all()]
    assert actions.count("application.update") == 1
    assert actions.count("application.note") == 1
    # the note text never goes into the audit log
    logged = [str(entry.model_dump()) async for entry in AuditLog.find_all()]
    assert not any("Strong references" in line for line in logged)
    blank = await client.post(f"{url}/notes", json={"text": "  "}, headers=reviewer())
    assert blank.status_code == 422


async def test_cv_link_is_short_lived_audited_and_needs_the_read_scope(
    mongo: object, client: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    await apply(client)
    doc = await Application.find_one({})
    assert doc is not None
    r = await client.get(f"{ADMIN}/{doc.id}/cv", headers=reviewer())
    assert r.status_code == 200
    body = r.json()
    assert body["url"] == f"memory://private/{doc.cv_file_key}?expires=600"
    expires = datetime.fromisoformat(body["expires_at"])
    assert timedelta(minutes=9) < expires - datetime.now(UTC) <= timedelta(minutes=10)
    actions = [entry.action async for entry in AuditLog.find_all()]
    assert actions.count("application.cv_view") == 1
    refreshed = await Application.get(doc.id)
    assert refreshed is not None and refreshed.events[-1].kind == "cv_viewed"
    nobody = auth(make_token(["enquiries:read"]))
    assert (await client.get(f"{ADMIN}/{doc.id}/cv", headers=nobody)).status_code == 403
    refreshed.cv_file_key = None
    await refreshed.save()
    assert (await client.get(f"{ADMIN}/{doc.id}/cv", headers=reviewer())).status_code == 404
