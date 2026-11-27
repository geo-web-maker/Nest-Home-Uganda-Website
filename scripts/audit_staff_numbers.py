"""Read-only preflight for duplicate nurse staff numbers before migration 0020.

Run from the repository root: PYTHONPATH=backend python scripts/audit_staff_numbers.py
It reads the configured care database and never modifies records.
"""
from __future__ import annotations

import asyncio
import json

from pymongo import AsyncMongoClient

from app.core.config import get_settings


async def main() -> None:
    settings = get_settings()
    if not settings.mongodb_uri:
        raise SystemExit("MONGODB_URI is empty; cannot audit staff numbers.")
    care_uri = settings.care_mongodb_uri or settings.mongodb_uri
    care_db_name = settings.care_mongodb_db or f"{settings.mongodb_db}_care"
    client = AsyncMongoClient(care_uri, tz_aware=True, serverSelectionTimeoutMS=10_000)
    try:
        collection = client[care_db_name]["nurse_profiles"]
        duplicates = await collection.aggregate([
            {"$match": {"staff_number": {"$type": "string"}}},
            {"$group": {
                "_id": {"$toLower": {"$trim": {"input": "$staff_number"}}},
                "count": {"$sum": 1},
                "profiles": {"$push": {"profile_id": {"$toString": "$_id"}, "user_id": "$user_id", "staff_number": "$staff_number"}},
            }},
            {"$match": {"count": {"$gt": 1}}},
            {"$sort": {"_id": 1}},
        ]).to_list(length=1000)
        print(json.dumps({"database": care_db_name, "duplicate_groups": duplicates, "safe_to_create_unique_index": not duplicates}, indent=2, default=str))
        if duplicates:
            raise SystemExit(2)
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
