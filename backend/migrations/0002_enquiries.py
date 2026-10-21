"""Indexes for enquiries, click_stats and sms_log (spec 8.4). Idempotent."""

from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase

DAY = 86400


async def up(db: AsyncDatabase) -> None:
    enquiries = db["enquiries"]
    await enquiries.create_index([("reference", ASCENDING)], unique=True, name="reference_unique")
    await enquiries.create_index(
        [("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"
    )
    await enquiries.create_index([("assigned_to", ASCENDING)], name="assigned_to")
    await enquiries.create_index([("phone_e164", ASCENDING)], name="phone")
    await enquiries.create_index([("services.service_id", ASCENDING)], name="service")
    await enquiries.create_index([("created_at", DESCENDING)], name="created_at")
    await enquiries.create_index(
        [("name", "text"), ("phone_e164", "text"), ("area", "text")],
        name="search_text",
        default_language="none",
    )
    await db["click_stats"].create_index(
        [("date", ASCENDING), ("channel", ASCENDING), ("page", ASCENDING)],
        unique=True,
        name="day_channel_page_unique",
    )
    await db["sms_log"].create_index(
        [("at", ASCENDING)], expireAfterSeconds=180 * DAY, name="at_ttl_180d"
    )
    await db["sms_log"].create_index([("status", ASCENDING), ("at", DESCENDING)], name="status_at")
