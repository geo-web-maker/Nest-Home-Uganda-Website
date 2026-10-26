"""Phone uniqueness must ignore users without a phone number.

`sparse` still indexes an explicit null, and the user model writes `phone_e164: null`, so a
second user without a phone collided. Use a partial index on string values instead.
"""

from contextlib import suppress

from pymongo import ASCENDING
from pymongo.errors import OperationFailure


async def up(db):
    with suppress(OperationFailure):
        await db["users"].drop_index("uq_users_phone_e164")
    await db["users"].create_index(
        [("phone_e164", ASCENDING)],
        unique=True,
        name="uq_users_phone_e164",
        partialFilterExpression={"phone_e164": {"$type": "string"}},
    )


async def down(db):
    with suppress(OperationFailure):
        await db["users"].drop_index("uq_users_phone_e164")
    await db["users"].create_index(
        [("phone_e164", ASCENDING)], unique=True, sparse=True, name="uq_users_phone_e164"
    )
