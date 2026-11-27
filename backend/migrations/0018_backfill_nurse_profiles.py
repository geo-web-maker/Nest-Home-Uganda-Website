"""Backfill NurseProfile rows for active users with the explicitly stored field:use scope.

This migration is idempotent, skips sandbox users, and logs only user ids (never identity
fields). Runtime provisioning uses the same pure staff-number generator.
"""
import logging
from datetime import UTC, datetime

from pymongo import AsyncMongoClient
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings

from app.modules.nurses.staff_numbers import provisional_staff_number

log = logging.getLogger("app.migrations.0018")


async def up(db) -> None:
    # User identity lives in the primary database; NurseProfile lives in the care
    # database. The migration runner invokes this migration with the primary DB.
    settings = get_settings()
    care_uri = settings.care_mongodb_uri or settings.mongodb_uri
    care_db_name = settings.care_mongodb_db or f"{settings.mongodb_db}_care"
    external_client = None
    if care_uri and settings.mongodb_uri and care_uri != settings.mongodb_uri:
        external_client = AsyncMongoClient(
            care_uri,
            tz_aware=True,
            serverSelectionTimeoutMS=10_000,
            connectTimeoutMS=10_000,
        )
        care_db = external_client[care_db_name]
    else:
        # Also works with the test fixture's unique paired database names and without
        # a production URI in unit-test settings.
        if db.name != settings.mongodb_db:
            care_db_name = f"{db.name}_care"
        care_db = db.client[care_db_name]

    users = db["users"]
    profiles = care_db["nurse_profiles"]
    created_ids: list[str] = []
    skipped_ids: list[str] = []
    # Keep the collision check in memory for this migration run rather than scanning the
    # entire care collection once per user. A failed preload is non-fatal: each candidate
    # is still checked against Mongo before insertion.
    taken_numbers: set[str] = set()
    try:
        try:
            taken_numbers = {
                str(row.get("staff_number", ""))
                async for row in profiles.find({}, {"staff_number": 1})
                if row.get("staff_number")
            }
        except Exception:
            log.exception("0018 could not preload existing staff numbers; checking candidates individually")
        cursor = users.find({"is_active": True, "is_test": {"$ne": True}, "scopes": "field:use"})
        async for user in cursor:
            user_id = str(user.get("_id", ""))
            if not user_id:
                continue
            try:
                if await profiles.find_one({"user_id": user_id}, {"_id": 1}):
                    continue
                number = provisional_staff_number(user_id, taken_numbers)
                while await profiles.find_one({"staff_number": number}, {"_id": 1}):
                    taken_numbers.add(number)
                    number = provisional_staff_number(user_id, taken_numbers)
                now = datetime.now(UTC)
                await profiles.insert_one(
                    {
                        "user_id": user_id,
                        "staff_number": number,
                        "staff_number_provisional": True,
                        "provisioned_source": "migration",
                        "provisioned_at": now,
                        "supervisor_id": None,
                        "team_id": None,
                        "active": True,
                        "phone_e164": user.get("phone_e164"),
                        "consent_versions": {},
                        "created_at": now,
                        "updated_at": now,
                    }
                )
                created_ids.append(user_id)
                taken_numbers.add(number)
            except DuplicateKeyError:
                # Another process may have inserted the unique user_id first.
                if await profiles.find_one({"user_id": user_id}, {"_id": 1}) is None:
                    skipped_ids.append(user_id)
            except Exception:
                log.exception("0018 skipped nurse-profile backfill for user_id=%s", user_id)
                skipped_ids.append(user_id)
    finally:
        if external_client is not None:
            await external_client.close()
    log.info("0018 created %s nurse profiles; user_ids=%s", len(created_ids), created_ids)
    if skipped_ids:
        log.warning("0018 skipped %s nurse-profile rows; user_ids=%s", len(skipped_ids), skipped_ids)


async def down(db) -> None:
    # Deliberately irreversible: generated profile rows may already hold consent or visit links.
    return None
