"""Public enquiry and click endpoints: the checks that run before any database read."""

import httpx

from app.core.errors import error_body
from tests.conftest import auth, make_token

URL = "/api/v1/public/enquiries"
SID = "0" * 24


def body(**kw) -> dict:
    return {
        "name": "Mary Atim", "phone": "0787 499 988", "relationship": "parent",
        "service_ids": [SID], "area": "Ntinda", "consent": True, **kw,
    }  # fmt: skip


async def test_honeypot_is_rejected_without_touching_the_database(
    client: httpx.AsyncClient,
) -> None:
    r = await client.post(URL, json=body(website="http://spam.example"))
    assert r.status_code == 422
    assert r.json() == error_body(
        "validation_error", "We couldn't send that. Please try WhatsApp or call us."
    )


async def test_missing_consent_and_bad_phone_are_field_errors(client: httpx.AsyncClient) -> None:
    r = await client.post(URL, json=body(consent=False, phone="123"))
    assert r.status_code == 422
    fields = r.json()["error"]["fields"]
    assert "consent" in fields and "phone" in fields


async def test_the_sixth_request_in_an_hour_is_rate_limited(client: httpx.AsyncClient) -> None:
    for _ in range(5):
        assert (await client.post(URL, json=body(website="x"))).status_code == 422
    r = await client.post(URL, json=body(website="x"))
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited" and "Retry-After" in r.headers


async def test_clicks_reject_unknown_channels_and_bad_pages(client: httpx.AsyncClient) -> None:
    assert (
        await client.post("/api/v1/public/clicks", json={"channel": "email"})
    ).status_code == 422
    r = await client.post("/api/v1/public/clicks", json={"channel": "call", "page": "javascript:x"})
    assert r.status_code == 422


async def test_admin_enquiry_endpoints_need_their_scope(client: httpx.AsyncClient) -> None:
    base = "/api/v1/admin/enquiries"
    assert (await client.get(base)).status_code == 401
    assert (await client.get(base, headers=auth(make_token(["content:read"])))).status_code == 403
    read_only = auth(make_token(["enquiries:read"]))
    assert (
        await client.post(base + "/" + SID + "/notes", json={"text": "x"}, headers=read_only)
    ).status_code == 403
    assert (
        await client.patch(base + "/" + SID, json={"status": "contacted"}, headers=read_only)
    ).status_code == 403


def test_the_scheduler_has_the_reminder_and_retention_jobs() -> None:
    from app.jobs import build_scheduler

    jobs = {job.id: job for job in build_scheduler().get_jobs()}
    assert set(jobs) == {"enquiry_reminders", "retention"}
    assert all(job.max_instances == 1 and job.coalesce for job in jobs.values())
