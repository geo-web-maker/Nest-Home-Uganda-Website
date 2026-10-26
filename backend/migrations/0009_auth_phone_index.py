"""Phone login uniqueness belongs in the main auth database."""

from pymongo import ASCENDING


async def up(db):
    await db["users"].create_index(
        [("phone_e164", ASCENDING)], unique=True, sparse=True, name="uq_users_phone_e164"
    )


async def down(db):
    try:
        await db["users"].drop_index("uq_users_phone_e164")
    except Exception:  # noqa: S110 (index may not exist)
        pass  # noqa: S110 (index may not exist)
