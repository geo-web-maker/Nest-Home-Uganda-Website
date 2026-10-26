"""Create care account indexes. Additive migration for the Nurse Module."""

from pymongo import ASCENDING


async def up(db):
    await db["nurse_profiles"].create_index(
        [("user_id", ASCENDING)], unique=True, name="uq_nurse_profiles_user_id"
    )
    await db["devices"].create_index(
        [("device_id", ASCENDING)], unique=True, name="uq_devices_device_id"
    )
    await db["devices"].create_index([("user_id", ASCENDING)], name="ix_devices_user_id")


async def down(db):
    await db["nurse_profiles"].drop_index("uq_nurse_profiles_user_id")
    await db["devices"].drop_index("uq_devices_device_id")
    await db["devices"].drop_index("ix_devices_user_id")
