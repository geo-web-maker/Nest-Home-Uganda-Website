"""Login, refresh-token rotation and the scope-change rules (12.5)."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, RateLimited, Unauthorised, ValidationFailed
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    password_needs_rehash,
    verify_password,
)
from app.modules.audit import service as audit
from app.modules.auth import repository as repo
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.scopes import ALL_SCOPE_IDS, SUPERADMIN_ONLY_SCOPES

MAX_FAILED_LOGINS = 5
FAILURE_WINDOW = timedelta(minutes=15)
LOCK_DURATION = timedelta(minutes=15)
BAD_CREDENTIALS = "Incorrect email or password."


@dataclass(frozen=True)
class Session:
    access_token: str
    expires_in: int
    refresh_token: str
    csrf_token: str
    user: User


def _principal(user: User) -> Principal:
    return Principal(str(user.id), frozenset(user.scopes), user.is_superadmin)


async def _issue_session(user: User, user_agent: str | None, now: datetime) -> Session:
    access, expires_in = create_access_token(str(user.id), user.scopes, user.is_superadmin, now)
    raw = new_opaque_token()
    await RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw),
        expires_at=now + timedelta(days=get_settings().refresh_token_days),
        user_agent=(user_agent or "")[:200] or None,
    ).insert()
    return Session(access, expires_in, raw, new_opaque_token(), user)


async def login(
    email: str, password: str, ip_hash: str, user_agent: str | None, now: datetime | None = None
) -> Session:
    now = now or datetime.now(UTC)
    user = await repo.user_by_email(email)
    if user is None:
        verify_password(password, DUMMY_PASSWORD_HASH)  # same cost as a real check
        await audit.record(None, "auth.login_failed", "user", None, None, ip_hash=ip_hash)
        raise Unauthorised(BAD_CREDENTIALS)

    if user.locked_until and user.locked_until > now:
        raise RateLimited(int((user.locked_until - now).total_seconds()) + 1)

    if not verify_password(password, user.password_hash) or not user.is_active:
        if user.last_failed_at and now - user.last_failed_at > FAILURE_WINDOW:
            user.failed_logins = 0
        user.failed_logins += 1
        user.last_failed_at = now
        if user.failed_logins >= MAX_FAILED_LOGINS:
            user.locked_until = now + LOCK_DURATION
            user.failed_logins = 0
        await user.save()
        await audit.record(
            _principal(user), "auth.login_failed", "user", str(user.id), user.email, ip_hash=ip_hash
        )
        raise Unauthorised(BAD_CREDENTIALS)

    if user.totp_secret:
        # TOTP verification is not built yet. Fail closed rather than skip the second step.
        raise Forbidden("Two-step sign-in is not available yet. Ask a superadmin for help.")

    user.failed_logins = 0
    user.last_failed_at = None
    user.locked_until = None
    user.last_login_at = now
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    await user.save()
    await audit.record(
        _principal(user), "auth.login", "user", str(user.id), user.email, ip_hash=ip_hash
    )
    return await _issue_session(user, user_agent, now)


async def refresh(raw_token: str, user_agent: str | None, now: datetime | None = None) -> Session:
    """Rotate: the old token is revoked, a new one issued, scopes re-read from the database.

    Presenting an already-revoked token means it may have been stolen, so every
    session of that user is ended.
    """
    now = now or datetime.now(UTC)
    token_hash = hash_token(raw_token)
    stored = await repo.refresh_token_by_hash(token_hash)
    if stored is None:
        raise Unauthorised()
    if stored.revoked_at is not None or not await repo.revoke_if_active(token_hash, now):
        await repo.revoke_all_for_user(stored.user_id, now)
        raise Unauthorised()
    if stored.expires_at <= now:
        raise Unauthorised()
    user = await repo.user_by_id(str(stored.user_id))
    if user is None or not user.is_active:
        await repo.revoke_all_for_user(stored.user_id, now)
        raise Unauthorised()
    return await _issue_session(user, user_agent, now)


async def logout(raw_token: str | None) -> None:
    if raw_token:
        await repo.revoke_if_active(hash_token(raw_token), datetime.now(UTC))


async def sign_out_user(user: User) -> None:
    """Used when a user's scopes change, or on 'force sign-out'."""
    await repo.revoke_all_for_user(user.id, datetime.now(UTC))


async def get_active_user(user_id: str) -> User:
    user = await repo.user_by_id(user_id)
    if user is None or not user.is_active:
        raise Unauthorised()
    return user


# ---- Scope-change rules (BUILDER_INSTRUCTIONS 12.5). Pure, so they are easy to test. ----


def validate_scope_change(
    actor: Principal,
    *,
    target_user_id: str | None,
    current_scopes: set[str],
    current_is_superadmin: bool,
    new_scopes: set[str],
    new_is_superadmin: bool,
) -> None:
    """Raise if `actor` may not change a user from the current to the new access.

    `target_user_id` is None when inviting a new user (nothing to compare with).
    """
    unknown = new_scopes - ALL_SCOPE_IDS
    if unknown:
        raise ValidationFailed("Unknown scope.", {"scopes": ", ".join(sorted(unknown))})
    if not actor.has("users:write"):
        raise Forbidden()
    if target_user_id is not None and target_user_id == actor.user_id:
        raise Forbidden("You cannot change your own access.")
    if new_is_superadmin != current_is_superadmin and not actor.is_superadmin:
        raise Forbidden("Only a superadmin can change superadmin status.")
    if actor.is_superadmin:
        return
    changed = new_scopes ^ current_scopes
    if changed & SUPERADMIN_ONLY_SCOPES:
        raise Forbidden("Only a superadmin can grant or remove this access.")
    not_held = {s for s in changed if not actor.has(s)}
    if not_held:
        raise Forbidden("You can only grant or remove access that you hold yourself.")


def ensure_not_last_superadmin(
    active_superadmins: int, *, was_superadmin: bool, stays_active_superadmin: bool
) -> None:
    """The last active superadmin cannot be deactivated, demoted or deleted."""
    if was_superadmin and not stays_active_superadmin and active_superadmins <= 1:
        raise Conflict("The last superadmin cannot be removed or demoted.")
