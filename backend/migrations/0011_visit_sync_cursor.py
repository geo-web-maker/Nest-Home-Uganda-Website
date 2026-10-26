"""Backfill visit update timestamps and index nurse sync paging records."""

from pymongo import ASCENDING


async def up(db):
    await db["visits"].update_many(
        {"updated_at": {"$exists": False}},
        [
            {
                "$set": {
                    "updated_at": {
                        "$ifNull": ["$created_at", {"$ifNull": ["$scheduled_start", "$$NOW"]}]
                    }
                }
            }
        ],
    )
    await db["visits"].create_index(
        [("nurse_id", ASCENDING), ("updated_at", ASCENDING), ("_id", ASCENDING)],
        name="ix_visits_nurse_updated_id",
    )
    await db["visit_sync_tombstones"].create_index(
        [("id", ASCENDING)],
        unique=True,
        name="uq_visit_sync_tombstones_id",
        # Same shape migration 0013 rebuilds it to; Beanie keeps the id in `_id`.
        partialFilterExpression={"id": {"$type": "string"}},
    )
    await db["visit_sync_tombstones"].create_index(
        [("nurse_id", ASCENDING), ("updated_at", ASCENDING), ("_id", ASCENDING)],
        name="ix_visit_sync_tombstones_nurse_updated_id",
    )


async def down(db):
    for collection, index in (
        ("visits", "ix_visits_nurse_updated_id"),
        ("visit_sync_tombstones", "uq_visit_sync_tombstones_id"),
        ("visit_sync_tombstones", "ix_visit_sync_tombstones_nurse_updated_id"),
    ):
        try:
            await db[collection].drop_index(index)
        except Exception:  # noqa: S110 (index may not exist)
            pass  # noqa: S110 (index may not exist)
