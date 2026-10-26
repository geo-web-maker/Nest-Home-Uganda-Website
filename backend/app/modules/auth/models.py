from datetime import datetime

from beanie import PydanticObjectId
from pydantic import Field

from app.core.models import TimestampedDocument


class User(TimestampedDocument):
    name: str
    email: str  # unique, lowercase
    password_hash: str
    scopes: list[str] = Field(default_factory=list)
    is_superadmin: bool = False
    is_active: bool = True
    totp_secret: str | None = None  # encrypted; TOTP flow comes in a later phase
    failed_logins: int = 0
    last_failed_at: datetime | None = None
    locked_until: datetime | None = None
    last_login_at: datetime | None = None
    invite_accepted_at: datetime | None = None
    preferred_language: str = "en"
    kind: str = "staff"
    reach: str = "all"
    phone_e164: str | None = None

    class Settings:
        name = "users"


class RefreshToken(TimestampedDocument):
    user_id: PydanticObjectId
    token_hash: str
    expires_at: datetime  # TTL index (migration)
    revoked_at: datetime | None = None
    user_agent: str | None = None

    class Settings:
        name = "refresh_tokens"


class PasswordReset(TimestampedDocument):
    user_id: PydanticObjectId
    token_hash: str
    expires_at: datetime  # TTL index (migration)
    used_at: datetime | None = None
    purpose: str = "reset"  # reset | invite; used to prevent cross-purpose link redemption

    class Settings:
        name = "password_resets"
