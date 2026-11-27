"""Add case-insensitive uniqueness for nurse staff numbers after a duplicate-data audit.

This migration intentionally fails without changing data if duplicate staff numbers exist.
The error includes only the duplicate staff number and user/profile ids, not names or emails.
It runs against the care database.
"""
import inspect

from pymongo import ASCENDING

INDEX_NAME = "uq_nurse_profiles_staff_number_ci"
COLLATION = {"locale": "en", "strength": 2}


async def up(db) -> None:
    collection = db["nurse_profiles"]
    cursor = collection.aggregate([
        {"$match": {"staff_number": {"$type": "string"}}},
        {"$group": {
            "_id": {"$toLower": {"$trim": {"input": "$staff_number"}}},
            "count": {"$sum": 1},
            "rows": {"$push": {"profile_id": "$_id", "user_id": "$user_id", "staff_number": "$staff_number"}},
        }},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 20},
    ])
    # PyMongo async: aggregate() is a coroutine that resolves to the cursor.
    if inspect.isawaitable(cursor):
        cursor = await cursor
    duplicates = await cursor.to_list(length=20)
    if duplicates:
        summary = [
            {
                "staff_number": row.get("rows", [{}])[0].get("staff_number"),
                "profiles": [str(item.get("profile_id")) for item in row.get("rows", [])],
                "user_ids": [str(item.get("user_id")) for item in row.get("rows", [])],
            }
            for row in duplicates
        ]
        raise RuntimeError(
            "Cannot create the unique nurse staff-number index: duplicate values require owner review. "
            f"Up to 20 duplicate groups: {summary}"
        )
    await collection.create_index(
        [("staff_number", ASCENDING)],
        unique=True,
        collation=COLLATION,
        name=INDEX_NAME,
        partialFilterExpression={"staff_number": {"$type": "string"}},
    )


async def down(db) -> None:
    collection = db["nurse_profiles"]
    if INDEX_NAME in await collection.index_information():
        await collection.drop_index(INDEX_NAME)
