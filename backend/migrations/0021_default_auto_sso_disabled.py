"""Backfill SSO opt-in and Superadmin permission as disabled for every existing account."""


async def up(db) -> None:
    await db["users"].update_many(
        {"auto_sso_enabled": {"$exists": False}},
        {"$set": {"auto_sso_enabled": False}},
    )
    await db["users"].update_many(
        {"auto_sso_allowed": {"$exists": False}},
        {"$set": {"auto_sso_allowed": False}},
    )


async def down(db) -> None:
    # Keep explicit off values. Removing either field would make rollback semantics ambiguous.
    return None
