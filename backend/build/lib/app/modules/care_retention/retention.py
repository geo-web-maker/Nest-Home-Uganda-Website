"""Approved removal paths for care photo records.

Append-only care collections are not deleted by ordinary repositories. Photo
removal for a verified data-subject request is routed through this module.
"""

from app.core.config import Settings
from app.core.photo_store import delete_asset
from app.modules.visits.models import VisitPhoto


async def purge_photo_for_data_request(photo: VisitPhoto, settings: Settings) -> None:
    """Delete the provider asset before removing its metadata record.

    Raises on provider failure so callers do not report a completed request while
    an image remains stored. Cloudinary's ``not found`` response is idempotent.
    """
    deleted = await delete_asset(
        settings,
        photo.cloudinary_public_id,
        delivery_type=getattr(photo, "delivery_type", "upload"),
    )
    if not deleted:
        raise RuntimeError("Cloudinary did not confirm photo deletion")
    await photo.delete()


async def purge_notes_for_data_request(visit_ids: list[str]) -> int:
    """Clear free-text visit notes linked to a verified client anonymisation request."""
    if not visit_ids:
        return 0
    from app.core.db import get_care_database

    result = await get_care_database()["visit_notes"].update_many(
        {"visit_id": {"$in": visit_ids}},
        {"$set": {"body": ""}},
    )
    return int(result.modified_count)


import logging  # noqa: E402
from calendar import monthrange  # noqa: E402
from datetime import UTC, datetime  # noqa: E402

log = logging.getLogger("app.care_retention")


def cutoff_months(now: datetime, months: int) -> datetime | None:
    """Return a retention cutoff only for an explicitly configured positive period."""
    if months <= 0:
        return None
    month_index = now.year * 12 + now.month - 1 - months
    year, month_zero = divmod(month_index, 12)
    month = month_zero + 1
    day = min(now.day, monthrange(year, month)[1])
    return now.replace(year=year, month=month, day=day)


async def purge_coordinates(db, cutoff: datetime) -> dict[str, int]:
    """Redact old location details while retaining the underlying audit records."""
    from app.modules.visits.models import VisitEvent, VisitNote, VisitPhoto

    event_result = await db[VisitEvent.Settings.name].update_many(
        {"received_at": {"$lt": cutoff}, "lat": {"$ne": None}},
        {
            "$set": {
                "lat": None,
                "lng": None,
                "accuracy_m": 0,
                "distance_m": None,
                "verification": "retention_redacted",
            }
        },
    )
    note_result = await db[VisitNote.Settings.name].update_many(
        {"created_at": {"$lt": cutoff}, "geo_snap": {"$ne": {}}},
        {"$set": {"geo_snap": {}}},
    )
    photo_result = await db[VisitPhoto.Settings.name].update_many(
        {"created_at": {"$lt": cutoff}, "geo_snap": {"$ne": {}}},
        {"$set": {"geo_snap": {}}},
    )
    return {
        "event_coordinates_redacted": int(event_result.modified_count),
        "note_coordinates_redacted": int(note_result.modified_count),
        "photo_coordinates_redacted": int(photo_result.modified_count),
    }


async def purge_sos_locations(db, cutoff: datetime) -> int:
    """Redact old SOS coordinates in both the legacy case array and event stream."""
    from app.modules.care_ops.models import SOSCase, SOSEvent

    legacy_result = await db[SOSCase.Settings.name].update_many(
        {"created_at": {"$lt": cutoff}},
        {"$unset": {"events.$[].lat": "", "events.$[].lng": "", "events.$[].accuracy_m": ""}},
    )
    event_result = await db[SOSEvent.Settings.name].update_many(
        {"created_at": {"$lt": cutoff}, "details.lat": {"$exists": True}},
        {"$unset": {"details.lat": "", "details.lng": "", "details.accuracy_m": ""}},
    )
    return int(legacy_result.modified_count) + int(event_result.modified_count)


async def purge_expired_photos(now: datetime, months: int, settings: Settings) -> int:
    """Delete expired Cloudinary assets and retain their metadata as expired records."""
    from app.modules.visits.models import VisitPhoto

    cutoff = cutoff_months(now, months)
    if cutoff is None:
        return 0
    count = 0
    candidates = await VisitPhoto.find(
        VisitPhoto.created_at < cutoff, VisitPhoto.status != "expired"
    ).to_list()
    for photo in candidates:
        try:
            if not await delete_asset(
                settings,
                photo.cloudinary_public_id,
                delivery_type=getattr(photo, "delivery_type", "upload"),
            ):
                raise RuntimeError("Cloudinary did not confirm photo deletion")
            photo.status = "expired"
            await photo.save()
            count += 1
        except Exception:
            log.exception("Could not expire care photo %s; leaving its record for retry", photo.id)
    return count


async def run_care_retention(now: datetime | None = None) -> dict[str, int]:
    """Apply configured care retention rules; unset/zero values never trigger deletion."""
    from app.core.config import get_settings
    from app.core.db import get_care_database
    from app.modules.audit.models import AuditLog
    from app.modules.settings.care_service import care_values

    now = now or datetime.now(UTC)
    values = await care_values()
    settings = get_settings()
    counts = {
        "event_coordinates_redacted": 0,
        "note_coordinates_redacted": 0,
        "photo_coordinates_redacted": 0,
        "photos_expired": 0,
        "sos_locations_redacted": 0,
    }
    db = get_care_database()
    try:
        coordinate_cutoff = cutoff_months(
            now, int(values.get("retention.coordinates_months", 0) or 0)
        )
        if coordinate_cutoff is None:
            log.info("care retention coordinates not configured; skipping coordinate redaction")
        else:
            counts.update(await purge_coordinates(db, coordinate_cutoff))

        sos_cutoff = cutoff_months(now, int(values.get("retention.sos_months", 0) or 0))
        if sos_cutoff is None:
            log.info("care SOS retention not configured; skipping SOS location redaction")
        else:
            counts["sos_locations_redacted"] = await purge_sos_locations(db, sos_cutoff)

        photo_months = int(values.get("retention.photos_months", 0) or 0)
        if photo_months <= 0:
            log.info("care photo retention not configured; skipping photo expiry")
        else:
            counts["photos_expired"] = await purge_expired_photos(now, photo_months, settings)

        await AuditLog(
            action="care.retention.run",
            item_type="retention_job",
            item_id=now.isoformat(),
            after={**counts, "ran_at": now.isoformat()},
        ).insert()
    except Exception:
        log.exception("care retention job failed")
        raise
    return counts


async def purge_abandoned_photo_uploads(
    now: datetime, settings: Settings, max_age_hours: int = 24
) -> int:
    """Destroy stale pending photo assets; failed provider calls remain pending for the next retry.

    The current upload flow creates a metadata row before signing, so this covers abandoned
    registrations. Provider assets created before a metadata insert cannot be enumerated by
    this query and remain a separate provider-listing follow-up.
    """
    from datetime import timedelta

    from app.modules.visits.models import VisitPhoto

    cutoff = now - timedelta(hours=max_age_hours)
    candidates = await VisitPhoto.find(
        VisitPhoto.status == "pending", VisitPhoto.created_at < cutoff
    ).to_list()
    removed = 0
    for photo in candidates:
        try:
            if not await delete_asset(
                settings,
                photo.cloudinary_public_id,
                delivery_type=getattr(photo, "delivery_type", "upload"),
            ):
                raise RuntimeError("Cloudinary did not confirm abandoned photo deletion")
            photo.status = "expired"
            await photo.save()
            removed += 1
        except Exception:
            log.exception(
                "Could not clean abandoned care photo %s; leaving it pending for retry", photo.id
            )
    return removed
