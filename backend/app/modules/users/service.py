"""User management rules (BUILDER_INSTRUCTIONS 12.5). Audit calls live here.

Access rules come from `auth.service` (`validate_scope_change`, `ensure_not_last_superadmin`).
Invites and password resets email a one-time link; no password is ever chosen or shown by staff.
"""

import logging
from datetime import UTC, datetime, timedelta
from html import escape

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.pagination import Page, PageParams
from app.core.security import hash_password, hash_token, new_opaque_token
from app.modules.audit import service as audit
from app.modules.auth import repository as auth_repo
from app.modules.auth import service as auth_service
from app.modules.auth.models import PasswordReset, User
from app.modules.auth.scopes import SCOPE_PRESETS
from app.modules.notifications.providers import get_email_provider
from app.modules.users import repository as repo
from app.modules.users.schemas import AdminUserOut, Done, UserInvite, UserUpdate

log = logging.getLogger("app.users")
ITEM_TYPE = "user"
INVITE_DAYS = 7  # BUILDER 12.5
RESET_MINUTES = 60


def to_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=str(user.id),
        name=user.name,
        email=user.email,
        scopes=sorted(user.scopes),
        is_superadmin=user.is_superadmin,
        last_login=user.last_login_at,
        status="active" if user.last_login_at else "invited",
        active=user.is_active,
        kind=user.kind,
        reach=user.reach,
    )


def _snapshot(user: User) -> dict:
    return {
        "scopes": sorted(user.scopes),
        "active": user.is_active,
        "kind": user.kind,
        "reach": user.reach,
    }


async def _get(user_id: str) -> User:
    user = await auth_repo.user_by_id(user_id)
    if user is None:
        raise NotFound("User not found.")
    return user


def _guard_superadmin_target(actor: Principal, target: User) -> None:
    """Only a superadmin may touch a superadmin account."""
    if target.is_superadmin and not actor.is_superadmin:
        raise Forbidden("Only a superadmin can change a superadmin.")


def _link(raw_token: str, *, purpose: str = "reset") -> str:
    base = get_settings().frontend_url.rstrip("/")
    return f"{base}/admin/set-password?token={raw_token}&purpose={purpose}"


async def _send_link(user: User, raw_token: str, *, invite: bool, minutes: int) -> None:
    link = _link(raw_token, purpose="invite" if invite else "reset")
    days = minutes // 1440
    valid = f"{days} days" if days else f"{minutes} minutes"
    subject = "You are invited to Well Nest Home Care admin" if invite else "Reset your password"
    note = f"This link works once and expires in {valid}."
    text = f"Hello {user.name},\n\nSet your password here: {link}\n\n{note}"
    html = (
        f"<p>Hello {escape(user.name)},</p>"
        f'<p><a href="{escape(link)}">Set your password</a></p><p>{note}</p>'
    )
    try:
        await get_email_provider().send([user.email], subject, html, text)
    except Exception:
        # The user exists and a link can be re-issued with "Reset password".
        log.exception("could not send the set-password email")


async def _issue_link(user: User, now: datetime, minutes: int, *, purpose: str = "reset") -> str:
    await repo.invalidate_open_links(user.id, now)
    raw = new_opaque_token()
    await PasswordReset(
        user_id=user.id,
        token_hash=hash_token(raw),
        expires_at=now + timedelta(minutes=minutes),
        purpose=purpose,
    ).insert()
    return raw


async def list_users(page: PageParams, q: str | None) -> Page[AdminUserOut]:
    users, total = await repo.list_users(page, q)
    return Page(
        items=[to_out(u) for u in users], total=total, page=page.page, page_size=page.page_size
    )


async def invite(principal: Principal, body: UserInvite, ip_hash: str | None) -> AdminUserOut:
    if body.preset and body.scopes:
        raise ValidationFailed(
            "Choose a scope preset or explicit scopes, not both.", {"preset": "ambiguous"}
        )
    new_scopes = set(SCOPE_PRESETS[body.preset]) if body.preset else set(body.scopes)
    auth_service.validate_scope_change(
        principal,
        target_user_id=None,
        current_scopes=set(),
        current_is_superadmin=False,
        new_scopes=new_scopes,
        new_is_superadmin=False,
    )
    email = str(body.email).lower()
    if await auth_repo.user_by_email(email) is not None:
        raise Conflict("A user with this email already exists.", {"email": "already in use"})
    user = User(
        name=body.name,
        email=email,
        # Nobody knows this password. The person sets their own from the emailed link.
        password_hash=hash_password(new_opaque_token()),
        scopes=sorted(new_scopes),
        kind=body.kind,
        reach=body.reach,
    )
    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise Conflict(
            "A user with this email already exists.", {"email": "already in use"}
        ) from exc
    now = datetime.now(UTC)
    raw = await _issue_link(user, now, INVITE_DAYS * 1440, purpose="invite")
    await _send_link(user, raw, invite=True, minutes=INVITE_DAYS * 1440)
    await audit.record(
        principal, "user.invite", ITEM_TYPE, str(user.id), user.email,
        after={"scopes": sorted(user.scopes)}, ip_hash=ip_hash,
    )  # fmt: skip
    return to_out(user)


async def update(
    principal: Principal, user_id: str, body: UserUpdate, ip_hash: str | None
) -> AdminUserOut:
    user = await _get(user_id)
    _guard_superadmin_target(principal, user)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("scopes") is None:
        changes.pop("scopes", None)
    if changes.get("active") is None:
        changes.pop("active", None)
    before = _snapshot(user)
    scopes_changed = False
    if "scopes" in changes:
        new_scopes = set(changes["scopes"])
        if new_scopes != set(user.scopes):
            auth_service.validate_scope_change(
                principal,
                target_user_id=str(user.id),
                current_scopes=set(user.scopes),
                current_is_superadmin=user.is_superadmin,
                new_scopes=new_scopes,
                new_is_superadmin=user.is_superadmin,
            )
            user.scopes = sorted(new_scopes)
            scopes_changed = True
    active_changed = "active" in changes and changes["active"] != user.is_active
    profile_changed = False
    for field in ("kind", "reach"):
        if (
            field in changes
            and changes[field] is not None
            and getattr(user, field) != changes[field]
        ):
            setattr(user, field, changes[field])
            profile_changed = True
    if active_changed:
        if str(user.id) == principal.user_id:
            raise Forbidden("You cannot deactivate yourself.")
        if not changes["active"]:
            auth_service.ensure_not_last_superadmin(
                await auth_repo.count_active_superadmins(),
                was_superadmin=user.is_superadmin and user.is_active,
                stays_active_superadmin=False,
            )
        user.is_active = changes["active"]
    if scopes_changed or active_changed or profile_changed:
        await user.save()
        await auth_service.sign_out_user(user)  # old sessions must not keep old access (12.6.5)
        await audit.record(
            principal, "user.update", ITEM_TYPE, str(user.id), user.email,
            before=before, after=_snapshot(user), ip_hash=ip_hash,
        )  # fmt: skip
    return to_out(user)


async def reset_password(principal: Principal, user_id: str, ip_hash: str | None) -> Done:
    user = await _get(user_id)
    _guard_superadmin_target(principal, user)
    if not user.is_active:
        raise ValidationFailed("This user is deactivated.", {"user": "inactive"})
    raw = await _issue_link(user, datetime.now(UTC), RESET_MINUTES, purpose="reset")
    await auth_service.sign_out_user(user)
    await _send_link(user, raw, invite=False, minutes=RESET_MINUTES)
    await audit.record(
        principal, "user.reset_password", ITEM_TYPE, str(user.id), user.email, ip_hash=ip_hash
    )
    return Done(status="sent")


async def sign_out(principal: Principal, user_id: str, ip_hash: str | None) -> Done:
    user = await _get(user_id)
    _guard_superadmin_target(principal, user)
    await auth_service.sign_out_user(user)
    await audit.record(
        principal, "user.sign_out", ITEM_TYPE, str(user.id), user.email, ip_hash=ip_hash
    )
    return Done(status="signed_out")


async def set_password(
    token: str, password: str, ip_hash: str | None, *, expected_purpose: str | None = None
) -> Done:
    """Redeem an invite or reset link. One use, and only before it expires."""
    now = datetime.now(UTC)
    bad = ValidationFailed("This link has expired or was already used.", {"token": "invalid"})
    reset = await repo.reset_by_hash(hash_token(token))
    if (
        reset is None
        or reset.used_at is not None
        or reset.expires_at <= now
        or (expected_purpose is not None and getattr(reset, "purpose", "reset") != expected_purpose)
    ):
        raise bad
    user = await auth_repo.user_by_id(str(reset.user_id))
    if user is None or not user.is_active:
        raise bad
    if not await repo.claim_reset(PydanticObjectId(reset.id), now):
        raise bad
    user.password_hash = hash_password(password)
    if getattr(reset, "purpose", "reset") == "invite":
        user.invite_accepted_at = now
    user.failed_logins = 0
    user.last_failed_at = None
    user.locked_until = None
    await user.save()
    await auth_service.sign_out_user(user)
    await audit.record(
        None, "user.set_password", ITEM_TYPE, str(user.id), user.email, ip_hash=ip_hash
    )
    return Done(status="password_set")
