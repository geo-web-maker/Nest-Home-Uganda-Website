"""Upload validation for the media library (spec 7.6 and 9.6)."""

import httpx
import pytest

from app.core.storage import MAX_SIGNED_URL_SECONDS, Bucket, MemoryStorage
from app.modules.media import service
from app.modules.media.models import Media
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/media"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 32


def writer() -> dict[str, str]:
    return auth(make_token(["content:read", "media:write"]))


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (PNG, ("image/png", "png")),
        (JPEG, ("image/jpeg", "jpg")),
        (WEBP, ("image/webp", "webp")),
        (b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", None),
        (b"%PDF-1.7", None),
        (b"MZ\x90\x00", None),
        (b"", None),
    ],
)
def test_type_comes_from_the_bytes(data: bytes, expected: tuple[str, str] | None) -> None:
    assert service.detect_image_type(data) == expected


async def test_a_file_that_is_not_an_image_is_rejected(client: httpx.AsyncClient) -> None:
    files = {"file": ("photo.jpg", b"<html><script>alert(1)</script></html>", "image/jpeg")}
    response = await client.post(ADMIN, files=files, headers=writer())
    assert response.status_code == 422
    assert response.json()["error"]["fields"] == {"file": "wrong type"}


async def test_an_empty_file_is_rejected(client: httpx.AsyncClient) -> None:
    response = await client.post(
        ADMIN, files={"file": ("a.png", b"", "image/png")}, headers=writer()
    )
    assert response.status_code == 422


async def test_an_oversized_file_is_rejected(client: httpx.AsyncClient) -> None:
    big = PNG + b"\x00" * service.MAX_UPLOAD_BYTES
    response = await client.post(
        ADMIN, files={"file": ("a.png", big, "image/png")}, headers=writer()
    )
    assert response.status_code == 422
    assert response.json()["error"]["fields"] == {"file": "too large"}


async def test_a_valid_image_is_stored_with_server_side_metadata(
    mongo: object, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = MemoryStorage()
    monkeypatch.setattr(service, "get_storage", lambda: storage)
    # The client lies about the type and size. Neither is trusted.
    files = {"file": ("x.svg", PNG, "image/svg+xml")}
    response = await client.post(
        ADMIN, files=files, data={"alt_text_en": "A nurse"}, headers=writer()
    )
    assert response.status_code == 201
    item = response.json()
    assert item["mime"] == "image/png" and item["size_bytes"] == len(PNG)
    assert item["storage_key"].endswith(".png")
    assert (Bucket.PUBLIC, item["storage_key"]) in storage.objects
    assert await Media.find().count() == 1


async def test_a_user_without_media_write_cannot_upload(client: httpx.AsyncClient) -> None:
    reader = auth(make_token(["content:read"]))
    response = await client.post(ADMIN, files={"file": ("a.png", PNG, "image/png")}, headers=reader)
    assert response.status_code == 403


async def test_a_png_header_is_accepted_and_the_file_name_is_never_used(
    mongo: object, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = MemoryStorage()
    monkeypatch.setattr(service, "get_storage", lambda: storage)
    files = {"file": ("../../etc/passwd.png", WEBP, "image/png")}
    response = await client.post(ADMIN, files=files, headers=writer())
    assert response.status_code == 201
    key = response.json()["storage_key"]
    assert key.startswith("media/") and key.endswith(".webp") and "passwd" not in key
    assert ".." not in key


async def test_a_failed_insert_removes_the_stored_object(
    mongo: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = MemoryStorage()
    monkeypatch.setattr(service, "get_storage", lambda: storage)

    async def boom(self: Media) -> None:
        raise RuntimeError("db down")

    monkeypatch.setattr(Media, "insert", boom)
    principal = type("P", (), {"user_id": "x", "has": lambda self, s: True})()
    with pytest.raises(RuntimeError):
        await service.create(principal, PNG, {}, None)  # type: ignore[arg-type]
    assert storage.objects == {}


async def test_private_links_are_short_lived() -> None:
    storage = MemoryStorage()
    url = await storage.signed_url(Bucket.PRIVATE, "cv/a.pdf", 86400)
    assert url.endswith(f"expires={MAX_SIGNED_URL_SECONDS}")
    assert (await storage.signed_url(Bucket.PRIVATE, "cv/a.pdf", 60)).endswith("expires=60")
