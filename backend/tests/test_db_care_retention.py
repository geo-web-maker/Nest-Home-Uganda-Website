from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.core import db
from app.core.config import Settings
from app.core.photo_store import PHOTO_FOLDER
from app.modules.care_retention import retention
from app.modules.visits.models import VisitEvent, VisitNote, VisitPhoto


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


async def test_coordinate_purge_redacts_values_and_keeps_records(mongo):
    old = datetime(2024, 1, 1, tzinfo=UTC)
    event = VisitEvent(
        id=uid("event"),
        client_op_id=uid("op"),
        visit_id=uid("visit"),
        nurse_id=uid("nurse"),
        type="check_in",
        device_time=old,
        sent_at_device=old,
        received_at=old,
        lat=0.1,
        lng=0.2,
        accuracy_m=12,
        distance_m=20,
        verification="verified",
    )
    note = VisitNote(
        id=uid("note"),
        client_op_id=uid("note-op"),
        visit_id=event.visit_id,
        nurse_id=event.nurse_id,
        body="Operational note",
        created_at_device=old,
        created_at=old,
        geo_snap={"lat": 0.1, "lng": 0.2},
    )
    photo = VisitPhoto(
        id=uid("photo"),
        visit_id=event.visit_id,
        nurse_id=event.nurse_id,
        cloudinary_public_id=f"{PHOTO_FOLDER}/{uuid4().hex}",
        created_at=old,
        geo_snap={"lat": 0.1, "lng": 0.2},
    )
    await event.insert()
    await note.insert()
    await photo.insert()

    counts = await retention.purge_coordinates(
        db.get_care_database(), datetime(2025, 1, 1, tzinfo=UTC)
    )
    care = db.get_care_database()
    saved_event = await care["visit_events"].find_one({"_id": event.id})
    saved_note = await care["visit_notes"].find_one({"_id": note.id})
    saved_photo = await care["visit_photos"].find_one({"_id": photo.id})

    assert counts == {
        "event_coordinates_redacted": 1,
        "note_coordinates_redacted": 1,
        "photo_coordinates_redacted": 1,
    }
    assert saved_event["lat"] is None and saved_event["lng"] is None
    assert saved_event["verification"] == "retention_redacted"
    assert saved_note["body"] == "Operational note" and saved_note["geo_snap"] == {}
    assert saved_photo["geo_snap"] == {} and saved_photo["_id"] == photo.id


async def test_photo_expiry_keeps_metadata_and_is_idempotent(mongo, monkeypatch):
    now = datetime.now(UTC)
    photo = VisitPhoto(
        id=uid("photo"),
        visit_id=uid("visit"),
        nurse_id=uid("nurse"),
        cloudinary_public_id=f"nest-home-care/visit-proof/{uuid4().hex}",
        created_at=now - timedelta(days=90),
    )
    await photo.insert()
    deleted = []

    async def fake_delete(settings, public_id, delivery_type="upload"):
        deleted.append(public_id)
        return True

    monkeypatch.setattr(retention, "delete_asset", fake_delete)
    settings = Settings(
        cloudinary_cloud_name="test", cloudinary_api_key="key", cloudinary_api_secret="secret"
    )
    assert await retention.purge_expired_photos(now, 1, settings) == 1
    assert await retention.purge_expired_photos(now, 1, settings) == 0
    saved = await db.get_care_database()["visit_photos"].find_one({"_id": photo.id})
    assert saved["status"] == "expired"
    assert len(deleted) == 1


async def test_photo_expiry_leaves_record_retryable_when_provider_fails(mongo, monkeypatch):
    now = datetime.now(UTC)
    photo = VisitPhoto(
        id=uid("photo"),
        visit_id=uid("visit"),
        nurse_id=uid("nurse"),
        cloudinary_public_id=f"nest-home-care/visit-proof/{uuid4().hex}",
        created_at=now - timedelta(days=90),
    )
    await photo.insert()

    async def fail_delete(settings, public_id, delivery_type="upload"):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(retention, "delete_asset", fail_delete)
    settings = Settings(
        cloudinary_cloud_name="test", cloudinary_api_key="key", cloudinary_api_secret="secret"
    )
    assert await retention.purge_expired_photos(now, 1, settings) == 0
    saved = await db.get_care_database()["visit_photos"].find_one({"_id": photo.id})
    assert saved["status"] == "pending"
