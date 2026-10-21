"""Public application endpoint: the checks that run before any database read."""

import httpx

from app.core.errors import error_body
from tests.conftest import auth, make_token

URL = "/api/v1/public/applications"
PDF = b"%PDF-1.7\n" + b"0" * 32


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


def cv(data: bytes = PDF, name: str = "cv.pdf") -> dict:
    return {"cv": (name, data, "application/octet-stream")}


async def test_honeypot_is_rejected_without_touching_the_database(
    client: httpx.AsyncClient,
) -> None:
    r = await client.post(URL, data=fields(website="http://spam.example"), files=cv())
    assert r.status_code == 422
    assert r.json() == error_body(
        "validation_error", "We couldn't send that. Please try WhatsApp or call us."
    )


async def test_missing_consent_and_bad_phone_are_field_errors(client: httpx.AsyncClient) -> None:
    r = await client.post(URL, data=fields(consent="false", phone="123"), files=cv())
    assert r.status_code == 422
    errors = r.json()["error"]["fields"]
    assert "consent" in errors and "phone" in errors


async def test_a_missing_cv_is_a_field_error(client: httpx.AsyncClient) -> None:
    r = await client.post(URL, data=fields())
    assert r.status_code == 422
    assert "cv" in r.json()["error"]["fields"]


async def test_a_file_of_the_wrong_type_is_rejected(client: httpx.AsyncClient) -> None:
    for name, data in (
        ("cv.pdf", b"<html><script>alert(1)</script></html>"),
        ("cv.exe", b"MZ\x90\x00" + b"0" * 32),
        ("cv.docx", PDF),  # right bytes, wrong extension
    ):
        r = await client.post(URL, data=fields(), files=cv(data, name))
        assert r.status_code == 422, name
        assert r.json()["error"]["fields"] == {"cv": "wrong type"}


async def test_a_file_over_five_megabytes_is_rejected(client: httpx.AsyncClient) -> None:
    big = b"%PDF-" + b"0" * (5 * 1024 * 1024)
    r = await client.post(URL, data=fields(), files=cv(big))
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"cv": "too large"}


async def test_an_empty_file_is_rejected(client: httpx.AsyncClient) -> None:
    r = await client.post(URL, data=fields(), files=cv(b""))
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"cv": "required"}


async def test_the_fourth_request_in_a_day_is_rate_limited(client: httpx.AsyncClient) -> None:
    for _ in range(3):
        assert (await client.post(URL, data=fields(website="x"), files=cv())).status_code == 422
    r = await client.post(URL, data=fields(website="x"), files=cv())
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited" and "Retry-After" in r.headers


async def test_admin_routes_need_a_token_and_the_right_scope(client: httpx.AsyncClient) -> None:
    admin = "/api/v1/admin/applications"
    assert (await client.get(admin)).status_code == 401
    wrong = auth(make_token(["enquiries:read"]))
    assert (await client.get(admin, headers=wrong)).status_code == 403
    assert (await client.get(f"{admin}/{'0' * 24}/cv", headers=wrong)).status_code == 403
    read_only = auth(make_token(["applications:read"]))
    assert (
        await client.patch(f"{admin}/{'0' * 24}", json={"stage": "shortlisted"}, headers=read_only)
    ).status_code == 403
    assert (
        await client.post(f"{admin}/{'0' * 24}/notes", json={"text": "hi"}, headers=read_only)
    ).status_code == 403
