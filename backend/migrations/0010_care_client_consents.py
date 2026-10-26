"""Index consent records by client for data-subject exports."""

from pymongo import ASCENDING


async def up(db):
    await db["care_consents"].create_index(
        [("client_id", ASCENDING), ("accepted_at", ASCENDING)],
        name="ix_care_consents_client_accepted",
    )


async def down(db):
    try:
        await db["care_consents"].drop_index("ix_care_consents_client_accepted")
    except Exception:  # noqa: S110 (index may not exist)
        pass  # noqa: S110 (index may not exist)
