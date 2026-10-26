"""Indexes for care operations and append-only audit-like collections."""

from pymongo import ASCENDING, DESCENDING


async def up(db):
    await db["care_alerts"].create_index([("id", ASCENDING)], unique=True, name="uq_care_alerts_id")
    await db["care_alerts"].create_index(
        [("status", ASCENDING), ("raised_at", DESCENDING)], name="ix_care_alerts_status_raised"
    )
    await db["care_timesheets"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_care_timesheets_id"
    )
    await db["care_timesheets"].create_index(
        [("nurse_id", ASCENDING), ("period_start", ASCENDING), ("period_end", ASCENDING)],
        unique=True,
        name="uq_care_timesheets_period",
    )
    await db["sos_cases"].create_index([("id", ASCENDING)], unique=True, name="uq_sos_cases_id")
    await db["care_inbox_notifications"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_care_inbox_id"
    )
    await db["care_inbox_notifications"].create_index(
        [("user_id", ASCENDING), ("created_at", DESCENDING)], name="ix_care_inbox_user_created"
    )
    await db["care_data_requests"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_care_data_requests_id"
    )
    await db["care_settings"].create_index(
        [("key", ASCENDING)], unique=True, name="uq_care_settings_key"
    )
    await db["care_consents"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_care_consents_id"
    )
    await db["care_consents"].create_index(
        [("user_id", ASCENDING), ("type", ASCENDING), ("version", ASCENDING)],
        name="ix_care_consents_user_type_version",
    )
    await db["sos_events"].create_index([("id", ASCENDING)], unique=True, name="uq_sos_events_id")
    await db["sos_events"].create_index(
        [("case_id", ASCENDING), ("created_at", ASCENDING)], name="ix_sos_events_case_created"
    )


async def down(db):
    for collection, index in [
        ("care_alerts", "uq_care_alerts_id"),
        ("care_alerts", "ix_care_alerts_status_raised"),
        ("care_timesheets", "uq_care_timesheets_id"),
        ("care_timesheets", "uq_care_timesheets_period"),
        ("sos_cases", "uq_sos_cases_id"),
        ("care_inbox_notifications", "uq_care_inbox_id"),
        ("care_inbox_notifications", "ix_care_inbox_user_created"),
        ("care_data_requests", "uq_care_data_requests_id"),
        ("care_settings", "uq_care_settings_key"),
        ("care_consents", "uq_care_consents_id"),
        ("care_consents", "ix_care_consents_user_type_version"),
        ("sos_events", "uq_sos_events_id"),
        ("sos_events", "ix_sos_events_case_created"),
    ]:
        try:
            await db[collection].drop_index(index)
        except Exception:  # noqa: S110 (index may not exist)
            pass  # noqa: S110 (index may not exist)
