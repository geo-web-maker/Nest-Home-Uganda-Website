from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.core import db
from app.core.config import Settings
from app.core.photo_store import PHOTO_FOLDER
from app.modules.care_retention import retention
from app.modules.visits.models import VisitPhoto


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


async def test_abandoned_pending_uploads_are_deleted_and_marked_expired(mongo, monkeypatch):
    now = datetime.now(UTC)
    old = VisitPhoto(
        id=uid("photo"),
        visit_id=uid("visit"),
        nurse_id=uid("nurse"),
        cloudinary_public_id=f"{PHOTO_FOLDER}/{uuid4().hex}",
        status="pending",
        created_at=now - timedelta(hours=25),
    )
    recent = VisitPhoto(
        id=uid("photo"),
        visit_id=uid("visit"),
        nurse_id=uid("nurse"),
        cloudinary_public_id=f"{PHOTO_FOLDER}/{uuid4().hex}",
        status="pending",
        created_at=now - timedelta(hours=2),
    )
    uploaded = VisitPhoto(
        id=uid("photo"),
        visit_id=uid("visit"),
        nurse_id=uid("nurse"),
        cloudinary_public_id=f"{PHOTO_FOLDER}/{uuid4().hex}",
        status="uploaded",
        created_at=now - timedelta(hours=25),
    )
    await old.insert()
    await recent.insert()
    await uploaded.insert()
    deleted: list[str] = []

    async def fake_delete(settings, public_id):
        deleted.append(public_id)
        return True

    monkeypatch.setattr(retention, "delete_asset", fake_delete)
    settings = Settings(
        cloudinary_cloud_name="test", cloudinary_api_key="key", cloudinary_api_secret="secret"
    )
    assert await retention.purge_abandoned_photo_uploads(now, settings) == 1
    assert deleted == [old.cloudinary_public_id]
    care = db.get_care_database()
    assert (await care["visit_photos"].find_one({"id": old.id}))["status"] == "expired"
    assert (await care["visit_photos"].find_one({"id": recent.id}))["status"] == "pending"
    assert (await care["visit_photos"].find_one({"id": uploaded.id}))["status"] == "uploaded"


async def test_abandoned_upload_delete_failure_remains_retryable(mongo, monkeypatch):
    now = datetime.now(UTC)
    photo = VisitPhoto(
        id=uid("photo"),
        visit_id=uid("visit"),
        nurse_id=uid("nurse"),
        cloudinary_public_id=f"{PHOTO_FOLDER}/{uuid4().hex}",
        status="pending",
        created_at=now - timedelta(hours=25),
    )
    await photo.insert()

    async def fail_delete(settings, public_id):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(retention, "delete_asset", fail_delete)
    settings = Settings(
        cloudinary_cloud_name="test", cloudinary_api_key="key", cloudinary_api_secret="secret"
    )
    assert await retention.purge_abandoned_photo_uploads(now, settings) == 0
    saved = await db.get_care_database()["visit_photos"].find_one({"id": photo.id})
    assert saved["status"] == "pending"
