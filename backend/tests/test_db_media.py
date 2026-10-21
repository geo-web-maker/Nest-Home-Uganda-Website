"""Media metadata tests use the real TEST_MONGODB_URI fixture and skip when absent."""

import httpx

from app.modules.media.models import Media
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/media"


def media_writer() -> dict[str, str]:
    return auth(make_token(["content:read", "media:write"]))


async def test_media_list_is_empty_by_default(mongo: object, client: httpx.AsyncClient) -> None:
    response = await client.get(ADMIN, headers=media_writer())
    assert response.status_code == 200 and response.json()["total"] == 0


async def test_media_metadata_model_has_expected_fields(mongo: object) -> None:
    item = Media(storage_key="media/a.jpg", mime="image/jpeg", size_bytes=12)
    assert item.deleted_at is None and item.variants == {}


async def test_media_model_defaults_are_independent(mongo: object) -> None:
    first = Media(storage_key="media/first.jpg", mime="image/jpeg", size_bytes=12)
    second = Media(storage_key="media/second.jpg", mime="image/jpeg", size_bytes=24)
    first.variants["thumb"] = "media/first-thumb.jpg"
    assert second.variants == {}
    assert first.deleted_at is None and second.deleted_at is None
