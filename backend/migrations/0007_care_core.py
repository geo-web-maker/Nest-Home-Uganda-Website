"""Additive care-domain indexes. Safe to rerun."""

from pymongo import ASCENDING, DESCENDING, GEOSPHERE


async def up(db):
    await db["care_clients"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_care_clients_id"
    )
    await db["care_places"].create_index([("id", ASCENDING)], unique=True, name="uq_care_places_id")
    await db["care_places"].create_index([("geo", GEOSPHERE)], name="ix_care_places_geo")
    await db["place_stays"].create_index([("id", ASCENDING)], unique=True, name="uq_place_stays_id")
    await db["place_stays"].create_index(
        [("client_id", ASCENDING), ("starts_on", DESCENDING)], name="ix_place_stays_client_start"
    )
    await db["visits"].create_index([("id", ASCENDING)], unique=True, name="uq_visits_id")
    await db["visits"].create_index(
        [("nurse_id", ASCENDING), ("scheduled_start", ASCENDING)], name="ix_visits_nurse_start"
    )
    await db["visits"].create_index(
        [("supervisor_id", ASCENDING), ("scheduled_start", ASCENDING)],
        name="ix_visits_supervisor_start",
    )
    await db["visits"].create_index(
        [("status", ASCENDING), ("scheduled_start", ASCENDING)], name="ix_visits_status_start"
    )
    await db["visit_events"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_visit_events_id"
    )
    await db["visit_events"].create_index(
        [("client_op_id", ASCENDING)], unique=True, name="uq_visit_events_client_op"
    )
    await db["visit_events"].create_index(
        [("visit_id", ASCENDING), ("received_at", ASCENDING)], name="ix_visit_events_visit_received"
    )
    await db["visit_notes"].create_index(
        [("client_op_id", ASCENDING)], unique=True, name="uq_visit_notes_client_op"
    )
    await db["visit_photos"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_visit_photos_id"
    )
    await db["visit_flags"].create_index(
        [("dedupe_key", ASCENDING)], unique=True, name="uq_visit_flags_dedupe"
    )
    await db["visit_flags"].create_index(
        [("status", ASCENDING), ("raised_at", DESCENDING)], name="ix_visit_flags_status_raised"
    )
    await db["visit_annotations"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_visit_annotations_id"
    )


async def down(db):
    for collection, index in [
        ("care_clients", "uq_care_clients_id"),
        ("care_places", "uq_care_places_id"),
        ("care_places", "ix_care_places_geo"),
        ("place_stays", "uq_place_stays_id"),
        ("place_stays", "ix_place_stays_client_start"),
        ("visits", "uq_visits_id"),
        ("visits", "ix_visits_nurse_start"),
        ("visits", "ix_visits_supervisor_start"),
        ("visits", "ix_visits_status_start"),
        ("visit_events", "uq_visit_events_id"),
        ("visit_events", "uq_visit_events_client_op"),
        ("visit_events", "ix_visit_events_visit_received"),
        ("visit_notes", "uq_visit_notes_client_op"),
        ("visit_photos", "uq_visit_photos_id"),
        ("visit_flags", "uq_visit_flags_dedupe"),
        ("visit_flags", "ix_visit_flags_status_raised"),
        ("visit_annotations", "uq_visit_annotations_id"),
    ]:
        try:
            await db[collection].drop_index(index)
        except Exception:  # noqa: S110 (index may not exist)
            pass  # noqa: S110 (index may not exist)
