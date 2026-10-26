"""Queries only. No business rules here."""

from datetime import datetime

from beanie import PydanticObjectId

from app.modules.auth.models import RefreshToken, User


async def user_by_email(email: str) -> User | None:
    return await User.find_one(User.email == email.lower())


async def user_by_phone(phone_e164: str) -> User | None:
    return await User.find_one(User.phone_e164 == phone_e164)


async def user_by_id(user_id: str) -> User | None:
    if not PydanticObjectId.is_valid(user_id):
        return None
    return await User.get(PydanticObjectId(user_id))


async def count_active_superadmins() -> int:
    return await User.find(User.is_superadmin == True, User.is_active == True).count()  # noqa: E712


async def refresh_token_by_hash(token_hash: str) -> RefreshToken | None:
    return await RefreshToken.find_one(RefreshToken.token_hash == token_hash)


async def revoke_if_active(token_hash: str, now: datetime) -> bool:
    """Atomically revoke one refresh token. False if it was already revoked or missing."""
    result = await RefreshToken.get_pymongo_collection().update_one(
        {"token_hash": token_hash, "revoked_at": None}, {"$set": {"revoked_at": now}}
    )
    return result.modified_count == 1


async def revoke_all_for_user(user_id: PydanticObjectId, now: datetime) -> None:
    await RefreshToken.get_pymongo_collection().update_many(
        {"user_id": user_id, "revoked_at": None}, {"$set": {"revoked_at": now}}
    )
