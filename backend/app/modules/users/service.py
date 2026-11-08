"""User management rules (BUILDER_INSTRUCTIONS 12.5). Audit calls live here.

Access rules come from `auth.service` (`validate_scope_change`, `ensure_not_last_superadmin`).
Invites and resets send a one-time link by email and/or SMS; staff may also issue a temporary password, shown once and expiring.
"""

import logging
import secrets
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
from app.modules.users import link_state
from app.modules.users import repository as repo
from app.modules.users.schemas import (
    AdminUserOut,
    Done,
    InviteOut,
    ResetIn,
    ResetOut,
    UserInvite,
    UserUpdate,
)

log = logging.getLogger("app.users")
ITEM_TYPE = "user"
INVITE_DAYS = 7  # BUILDER 12.5
INVITE_LINKS_KEPT = 5  # a resent invite does not kill the earlier, still-valid one
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


async def _send_link(user: User, raw_token: str, *, invite: bool, minutes: int) -> bool:
    link = _link(raw_token, purpose="invite" if invite else "reset")
    days = minutes // 1440
    valid = f"{days} days" if days else f"{minutes} minutes"
    subject = "You are invited to Bloomwell Home Care admin" if invite else "Reset your password"
    note = f"This link works once and expires in {valid}."
    text = f"Hello {user.name},\n\nSet your password here: {link}\n\n{note}"
    html = (
        f"<p>Hello {escape(user.name)},</p>"
        f'<p><a href="{escape(link)}">Set your password</a></p><p>{note}</p>'
    )
    try:
        await get_email_provider().send([user.email], subject, html, text)
        return True
    except Exception:
        # The user exists and a link can be re-issued with "Reset password".
        log.exception("could not send the set-password email")
        return False


_TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"  # no 0/O/1/l/I


def _temp_password() -> str:
    return "".join(secrets.choice(_TEMP_ALPHABET) for _ in range(14))


async def _send_sms_link(user: User, raw_token: str, *, invite: bool, minutes: int) -> bool:
    from app.modules.notifications.config import load_config
    from app.modules.notifications.providers import get_sms_provider
    from app.modules.notifications.service import send_sms

    if not user.phone_e164:
        return False
    days = minutes // 1440
    valid = f"{days} days" if days else f"{minutes} minutes"
    link = _link(raw_token, purpose="invite" if invite else "reset")
    text = f"Bloomwell Home Care: {user.name}, set your password here (works once, {valid}): {link}"
    try:
        return await send_sms(
            get_sms_provider(), await load_config(), to=user.phone_e164, text=text,
            audience="staff", template="user_invite" if invite else "user_reset", enquiry=None,
        )  # fmt: skip
    except Exception:
        log.exception("could not send the set-password SMS")
        return False


async def _deliver(
    user: User, channels: list[str], *, invite: bool, minutes: int
) -> tuple[str | None, dict[str, str]]:
    """Run the chosen channels. Returns the temporary password (shown once) and each outcome."""
    chosen = set(channels)
    now = datetime.now(UTC)
    result: dict[str, str] = {}
    temp: str | None = None
    if chosen & {"email", "sms"}:
        raw = await _issue_link(user, now, minutes, purpose="invite" if invite else "reset")
        if "email" in chosen:
            result["email"] = (
                "sent" if await _send_link(user, raw, invite=invite, minutes=minutes) else "failed"
            )
        if "sms" in chosen:
            ok = await _send_sms_link(user, raw, invite=invite, minutes=minutes)
            result["sms"] = "sent" if ok else "failed"
    if "temp_password" in chosen:
        temp = _temp_password()
        user.password_hash = hash_password(temp)
        user.temp_password_expires_at = now + timedelta(minutes=minutes)
        user.failed_logins = 0
        user.locked_until = None
        await user.save()
        result["temp_password"] = "shown"
    return temp, result


def _require_mobile(user_phone: str | None, channels: list[str]) -> None:
    from app.core.phone import is_mobile

    if "sms" in channels and not (user_phone and is_mobile(user_phone)):
        raise ValidationFailed(
            "Enter a valid mobile number (07...) to send by SMS.", {"phone": "required for SMS"}
        )


async def _issue_link(user: User, now: datetime, minutes: int, *, purpose: str = "reset") -> str:
    if purpose == "invite":
        # Resending an invite keeps earlier invite links working (a newer message must not kill
        # an older one); only reset links are withdrawn. Redeeming any one closes the rest.
        await repo.invalidate_open_links(user.id, now, purposes=("reset",))
        await repo.trim_open_invites(user.id, now, keep=INVITE_LINKS_KEPT - 1)
    else:
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


async def invite(principal: Principal, body: UserInvite, ip_hash: str | None) -> InviteOut:
    if body.preset and body.scopes:
        raise ValidationFailed(
            "Choose a scope preset or explicit scopes, not both.", {"preset": "ambiguous"}
        )
    new_scopes = set(SCOPE_PRESETS[body.preset]) if body.preset else set(body.scopes)
    new_scopes.add("mail:use")
    auth_service.validate_scope_change(
        principal,
        target_user_id=None,
        current_scopes=set(),
        current_is_superadmin=False,
        new_scopes=new_scopes,
        new_is_superadmin=False,
    )
    email = str(body.email).lower()
    from app.core.phone import normalise_e164

    phone = normalise_e164(body.phone) if body.phone else None
    if body.phone and phone is None:
        raise ValidationFailed("That phone number is not valid.", {"phone": "invalid"})
    _require_mobile(phone, body.delivery)
    if phone and await auth_repo.user_by_phone(phone) is not None:
        raise Conflict("A user with this phone number already exists.", {"phone": "already in use"})
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
        phone_e164=phone,
    )
    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise Conflict(
            "A user with this email already exists.", {"email": "already in use"}
        ) from exc
    try:
        from app.modules.mail.core_service import ensure_default_mailbox_if_configured
        await ensure_default_mailbox_if_configured(user)
    except Exception:
        log.warning("default mailbox creation deferred for invited user %s", str(user.id))
    temp, delivered = await _deliver(user, body.delivery, invite=True, minutes=INVITE_DAYS * 1440)
    await audit.record(
        principal, "user.invite", ITEM_TYPE, str(user.id), user.email,
        after={"scopes": sorted(user.scopes), "delivery": sorted(body.delivery)}, ip_hash=ip_hash,
    )  # fmt: skip
    return InviteOut(**to_out(user).model_dump(), temp_password=temp, delivered=delivered)


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
        if active_changed:
            try:
                from app.modules.mail.core_service import close_personal_mailbox
                await close_personal_mailbox(str(user.id), closed=not user.is_active)
            except Exception:
                log.warning("mailbox lifecycle update deferred for user %s", str(user.id))
        await auth_service.sign_out_user(user)  # old sessions must not keep old access (12.6.5)
        if "name" in changes:
            try:
                from app.modules.mail.core_service import add_name_alias
                await add_name_alias(user)
            except Exception:
                log.warning("mailbox alias update deferred for user %s", str(user.id))
        await audit.record(
            principal, "user.update", ITEM_TYPE, str(user.id), user.email,
            before=before, after=_snapshot(user), ip_hash=ip_hash,
        )  # fmt: skip
    return to_out(user)


async def reset_password(
    principal: Principal, user_id: str, ip_hash: str | None, body: ResetIn | None = None
) -> ResetOut:
    user = await _get(user_id)
    _guard_superadmin_target(principal, user)
    if not user.is_active:
        raise ValidationFailed("This user is deactivated.", {"user": "inactive"})
    channels = (body or ResetIn()).delivery
    _require_mobile(user.phone_e164, channels)
    await auth_service.sign_out_user(user)
    # A temporary password lasts as long as an invite; a link-only reset keeps its short window.
    minutes = INVITE_DAYS * 1440 if "temp_password" in channels else RESET_MINUTES
    temp, delivered = await _deliver(user, channels, invite=False, minutes=minutes)
    await audit.record(
        principal, "user.reset_password", ITEM_TYPE, str(user.id), user.email,
        after={"delivery": sorted(channels)}, ip_hash=ip_hash,
    )  # fmt: skip
    return ResetOut(status="sent", temp_password=temp, delivered=delivered)


async def sign_out(principal: Principal, user_id: str, ip_hash: str | None) -> Done:
    user = await _get(user_id)
    _guard_superadmin_target(principal, user)
    await auth_service.sign_out_user(user)
    await audit.record(
        principal, "user.sign_out", ITEM_TYPE, str(user.id), user.email, ip_hash=ip_hash
    )
    return Done(status="signed_out")


async def _resolve_link(token: str, now: datetime, expected_purpose: str | None):
    cleaned = link_state.clean_token(token)
    if cleaned is None:
        raise link_state.LinkProblem("malformed")
    digest = hash_token(cleaned)
    fingerprint = digest[:6].upper()
    reset = await repo.reset_by_hash(digest)
    if reset is None:
        raise link_state.LinkProblem("not_found", fingerprint)
    user = await auth_repo.user_by_id(str(reset.user_id))
    state = link_state.diagnose(reset, user, now, expected_purpose)
    if state:
        raise link_state.LinkProblem(state, fingerprint)
    return reset, user, fingerprint


async def check_link(token: str, *, expected_purpose: str | None = None) -> dict:
    """Say whether a link can still be used, without using it up."""
    reset, _user, _fp = await _resolve_link(token, datetime.now(UTC), expected_purpose)
    return {
        "status": "ok",
        "purpose": getattr(reset, "purpose", "reset"),
        "expires_at": reset.expires_at.isoformat(),
    }


async def set_password(
    token: str, password: str, ip_hash: str | None, *, expected_purpose: str | None = None
) -> Done:
    """Redeem an invite or reset link. One use, and only before it expires."""
    now = datetime.now(UTC)
    reset, user, fingerprint = await _resolve_link(token, now, expected_purpose)
    if not await repo.claim_reset(PydanticObjectId(reset.id), now):
        raise link_state.LinkProblem("used", fingerprint)
    try:
        user.password_hash = hash_password(password)
        user.temp_password_expires_at = None
        if getattr(reset, "purpose", "reset") == "invite":
            user.invite_accepted_at = now
        user.failed_logins = 0
        user.last_failed_at = None
        user.locked_until = None
        await user.save()
    except Exception:
        await repo.release_reset(PydanticObjectId(reset.id))  # a failed save must not burn the link
        raise
    await repo.close_open_links(user.id, now)
    await auth_service.sign_out_user(user)
    await audit.record(
        None, "user.set_password", ITEM_TYPE, str(user.id), user.email, ip_hash=ip_hash
    )
    return Done(status="password_set")


async def delete(principal: Principal, user_id: str, ip_hash: str | None) -> None:
    from app.modules.auth.models import RefreshToken

    user = await _get(user_id)
    _guard_superadmin_target(principal, user)
    if str(user.id) == principal.user_id:
        raise Conflict("You cannot delete your own account.")
    if user.kind == "nurse":
        from app.modules.nurses.models import NurseProfile
        from app.modules.nurses.service import delete_nurse

        if await NurseProfile.find_one(NurseProfile.user_id == user_id):
            await delete_nurse(principal, user_id, ip_hash)
            return
    auth_service.ensure_not_last_superadmin(
        await auth_repo.count_active_superadmins(),
        was_superadmin=user.is_superadmin and user.is_active,
        stays_active_superadmin=False,
    )
    await RefreshToken.find(RefreshToken.user_id == user.id).delete()
    await PasswordReset.find(PasswordReset.user_id == user.id).delete()
    await user.delete()
    from app.modules.mail.mailbox_admin import release_user_mailboxes
    await release_user_mailboxes(str(user.id))
    await audit.record(
        principal, "user.delete", ITEM_TYPE, str(user.id), user.email,
        before=_snapshot(user), ip_hash=ip_hash,
    )
