import logging
import re
from datetime import UTC, datetime

from pymongo.errors import DuplicateKeyError

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.phone import normalise_e164
from app.core.security import hash_password, new_opaque_token
from app.modules.audit import service as audit
from app.modules.auth import repository as auth_repo
from app.modules.auth.models import User
from app.modules.auth.scopes import SCOPE_PRESETS
from app.modules.nurses.models import Device, NurseProfile
from app.modules.nurses.repository import get_profile_for_user, register_device
from app.modules.nurses.staff_numbers import provisional_staff_number
from app.modules.nurses.schemas import (
    DeviceRegistration,
    NurseDirectCreate,
    NurseInvite,
    NursePasswordSet,
    NursePatch,
)
from app.modules.users import service as user_service

log = logging.getLogger(__name__)


async def profile_for_user(user_id: str):
    return await get_profile_for_user(user_id)


def is_dual_account(user: User | None, profile: NurseProfile | None) -> bool:
    return bool(user is not None and profile is not None and user.kind != "nurse")


async def staff_number_exists(value: str, *, exclude_user_id: str | None = None) -> bool:
    """Case-insensitive exact match; the database unique index is the final race guard."""
    cleaned = value.strip()
    query: dict = {"staff_number": {"$regex": f"^{re.escape(cleaned)}$", "$options": "i"}}
    if exclude_user_id is not None:
        query["user_id"] = {"$ne": exclude_user_id}
    return await NurseProfile.get_pymongo_collection().find_one(query, {"_id": 1}) is not None


async def resolve_staff_number(user_id: str, requested: str | None = None) -> tuple[str, bool]:
    """Validate an explicit staff number or allocate a stable provisional one."""
    if requested and requested.strip():
        cleaned = requested.strip()
        if await staff_number_exists(cleaned):
            raise Conflict("That staff number is already in use.")
        return cleaned, False
    existing = [profile.staff_number for profile in await NurseProfile.find().to_list()]
    candidate = provisional_staff_number(user_id, existing)
    return candidate, True


async def ensure_nurse_profile(
    user: User,
    *,
    actor=None,
    source: str,
    staff_number: str | None = None,
    supervisor_id: str | None = None,
    team_id: str | None = None,
    reactivate: bool = False,
    ip_hash: str | None = None,
) -> tuple[NurseProfile | None, bool]:
    """Ensure an account with an explicitly stored nurse scope has a NurseProfile.

    This never grants permissions, sends invitations, changes identity details or signs the
    user in/out. Sandbox and inactive users are deliberately excluded.
    """
    user_id = str(user.id)
    existing = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    if existing is not None:
        if reactivate and existing.active is False and user.is_active and not user.is_test and "field:use" in user.scopes:
            existing.active = True
            await existing.save()
        return existing, False
    if user.is_test or not user.is_active or "field:use" not in user.scopes:
        return None, False

    number, provisional = await resolve_staff_number(user_id, staff_number)
    profile = NurseProfile(
        user_id=user_id,
        staff_number=number,
        staff_number_provisional=provisional,
        provisioned_source=source,
        provisioned_at=datetime.now(UTC),
        supervisor_id=supervisor_id,
        team_id=team_id,
        active=True,
        phone_e164=user.phone_e164,
    )
    try:
        await profile.insert()
    except DuplicateKeyError:
        # A concurrent /field/me or scope update may have won the unique user_id insert.
        winner = await NurseProfile.find_one(NurseProfile.user_id == user_id)
        if winner is not None:
            return winner, False
        raise Conflict("That staff number was claimed by another account. Retry the operation.")
    await audit.record(
        actor,
        "nurse.profile.auto_provision",
        "nurse_profile",
        user_id,
        user.name,
        after={"staff_number": number, "provisional": provisional, "source": source},
        ip_hash=ip_hash,
    )
    return profile, True


async def register_user_device(user_id: str, payload: DeviceRegistration, app: str | None = None) -> Device:
    return await register_device(
        Device(
            device_id=payload.device_id,
            user_id=user_id,
            platform=payload.platform,
            push_token=payload.push_token,
            app=app,
        )
    )


async def invite_nurse(actor, payload: NurseInvite, ip_hash: str | None = None):
    phone = normalise_e164(payload.phone)
    if not phone:
        raise ValidationFailed("Enter a valid Uganda phone number.", {"phone": "invalid"})
    if await User.find_one(User.email == str(payload.email).lower()):
        raise Conflict("A user with this email already exists.")
    if await User.find_one(User.phone_e164 == phone):
        raise Conflict("A user with this phone number already exists.")
    user = User(
        name=payload.name,
        email=str(payload.email).lower(),
        password_hash=hash_password(new_opaque_token()),
        scopes=sorted(set(SCOPE_PRESETS["nurse"]) | {"mail:use"}),
        kind="nurse",
        reach="own",
        phone_e164=phone,
    )
    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise Conflict("Email or phone is already in use.") from exc
    staff_number, provisional = await resolve_staff_number(str(user.id), payload.staff_number)
    profile = NurseProfile(
        user_id=str(user.id),
        staff_number=staff_number,
        staff_number_provisional=provisional,
        provisioned_source="invite" if provisional else None,
        provisioned_at=datetime.now(UTC) if provisional else None,
        supervisor_id=payload.supervisor_id,
        team_id=payload.team_id,
        phone_e164=phone,
    )
    try:
        await profile.insert()
    except DuplicateKeyError as exc:
        await user.delete()
        raise Conflict("A nurse profile or staff number already exists.") from exc
    try:
        from app.modules.mail.core_service import ensure_default_mailbox_if_configured
        await ensure_default_mailbox_if_configured(user)
    except Exception:
        log.warning("nurse mailbox creation deferred for user %s", str(user.id))
    now = datetime.now(UTC)
    raw = await user_service._issue_link(
        user, now, user_service.INVITE_DAYS * 1440, purpose="invite"
    )
    await user_service._send_link(user, raw, invite=True, minutes=user_service.INVITE_DAYS * 1440)
    await audit.record(
        actor,
        "nurse.invite",
        "nurse_profile",
        str(user.id),
        payload.name,
        after={
            "staff_number": profile.staff_number,
            "supervisor_id": profile.supervisor_id,
            "scopes": sorted(user.scopes),
        },
        ip_hash=ip_hash,
    )
    return profile


async def add_nurse_profile_to_user(actor, payload, ip_hash: str | None = None):
    """Give an existing account a nurse profile and the nurse-app permissions, keeping every other permission.

    This is how an admin who is also a nurse is set up. The account keeps its admin scopes and gains field:use and
    sos:send. The person signs out and in again so the new permissions reach their session.
    """
    text = payload.user.strip().lower()
    user = await User.find_one(User.email == text)
    if user is None:
        try:
            user = await User.get(payload.user.strip())
        except Exception:
            user = None
    if user is None or not user.is_active:
        raise NotFound("No active account was found with that e-mail or id.")
    user_id = str(user.id)
    if await NurseProfile.find_one(NurseProfile.user_id == user_id):
        raise Conflict("This account already has a nurse profile.")
    staff_number, provisional = await resolve_staff_number(user_id, payload.staff_number)
    if payload.supervisor_id:
        supervisor = await auth_repo.user_by_id(payload.supervisor_id)
        if supervisor is None or not supervisor.is_active:
            raise ValidationFailed("No active user was found with that supervisor ID.", {"supervisor_id": "not_found_or_inactive"})
    before_scopes = sorted(user.scopes)
    user.scopes = sorted(set(user.scopes) | {"field:use", "sos:send", "mail:use"})
    await user.save()
    profile = NurseProfile(
        user_id=user_id,
        staff_number=staff_number,
        staff_number_provisional=provisional,
        provisioned_source="from_user" if provisional else None,
        provisioned_at=datetime.now(UTC) if provisional else None,
        supervisor_id=payload.supervisor_id,
        team_id=payload.team_id,
        phone_e164=user.phone_e164,
    )
    try:
        await profile.insert()
    except DuplicateKeyError as exc:
        user.scopes = before_scopes
        await user.save()
        raise Conflict("A nurse profile already exists for this account.") from exc
    await audit.record(
        actor,
        "nurse.profile.add_to_existing_user",
        "nurse_profile",
        user_id,
        user.name,
        before={"scopes": before_scopes},
        after={"staff_number": profile.staff_number, "supervisor_id": profile.supervisor_id, "scopes": sorted(user.scopes)},
        ip_hash=ip_hash,
    )
    return profile


async def create_nurse_direct(actor, payload: NurseDirectCreate, ip_hash: str | None = None):
    """Create an active nurse with the given password. No invite link or SMS is sent.

    The password is hashed here and never logged or written to the audit record.
    """
    phone = normalise_e164(payload.phone)
    if not phone:
        raise ValidationFailed("Enter a valid Uganda phone number.", {"phone": "invalid"})
    email = str(payload.email).lower()
    if await User.find_one(User.email == email):
        raise Conflict("A user with this email already exists.")
    if await User.find_one(User.phone_e164 == phone):
        raise Conflict("A user with this phone number already exists.")
    user = User(
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
        scopes=sorted(set(SCOPE_PRESETS["nurse"]) | {"mail:use"}),
        kind="nurse",
        reach="own",
        phone_e164=phone,
        invite_accepted_at=datetime.now(UTC),
    )
    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise Conflict("Email or phone is already in use.") from exc
    staff_number, provisional = await resolve_staff_number(str(user.id), payload.staff_number)
    profile = NurseProfile(
        user_id=str(user.id),
        staff_number=staff_number,
        staff_number_provisional=provisional,
        provisioned_source="direct" if provisional else None,
        provisioned_at=datetime.now(UTC) if provisional else None,
        supervisor_id=payload.supervisor_id,
        team_id=payload.team_id,
        phone_e164=phone,
    )
    try:
        await profile.insert()
    except DuplicateKeyError as exc:
        await user.delete()  # keep user and profile together
        raise Conflict("A nurse profile or staff number already exists.") from exc
    try:
        from app.modules.mail.core_service import ensure_default_mailbox_if_configured
        await ensure_default_mailbox_if_configured(user)
    except Exception:
        log.warning("nurse mailbox creation deferred for user %s", str(user.id))
    await audit.record(
        actor,
        "nurse.create_direct",
        "nurse_profile",
        str(user.id),
        payload.name,
        after={
            "staff_number": profile.staff_number,
            "supervisor_id": profile.supervisor_id,
            "scopes": sorted(user.scopes),
        },
        ip_hash=ip_hash,
    )
    return profile


async def patch_nurse(actor, user_id: str, payload: NursePatch, ip_hash: str | None = None):
    profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    user = await auth_repo.user_by_id(user_id)
    if not profile or not user:
        raise NotFound("Nurse profile not found.")
    dual_account = is_dual_account(user, profile)
    changes = payload.model_dump(exclude_unset=True)
    if dual_account and any(changes.get(field) is not None for field in ("name", "phone")):
        raise ValidationFailed(
            "This is an existing staff account. Change its name or phone in Users, not the nurse roster.",
            {"account": "managed_in_users"},
        )

    before = {
        "name": user.name,
        "phone_e164": user.phone_e164,
        "account_active": user.is_active,
        "profile_active": profile.active,
        "staff_number": profile.staff_number,
        "staff_number_provisional": profile.staff_number_provisional,
    }

    if changes.get("name") is not None:
        user.name = changes["name"]
    if changes.get("phone") is not None:
        phone = normalise_e164(changes["phone"])
        if not phone:
            raise ValidationFailed("Enter a valid Uganda phone number.", {"phone": "invalid"})
        duplicate = await User.find_one(User.phone_e164 == phone)
        if duplicate and str(duplicate.id) != user_id:
            raise Conflict("A user with this phone number already exists.")
        user.phone_e164 = phone
        profile.phone_e164 = phone

    if changes.get("staff_number") is not None:
        next_number = changes["staff_number"].strip()
        if not 2 <= len(next_number) <= 40:
            raise ValidationFailed("Staff number must contain between 2 and 40 characters.", {"staff_number": "invalid"})
        if await staff_number_exists(next_number, exclude_user_id=user_id):
            raise Conflict("That staff number is already in use.")
        profile.staff_number = next_number
        profile.staff_number_provisional = False

    if changes.get("active") is not None:
        profile.active = changes["active"]
        if not dual_account:
            user.is_active = changes["active"]

    try:
        await profile.save()
    except DuplicateKeyError as exc:
        raise Conflict("That staff number is already in use.") from exc
    if not dual_account:
        await user.save()
        if changes.get("name") is not None:
            try:
                from app.modules.mail.core_service import add_name_alias
                await add_name_alias(user)
            except Exception:
                log.warning("nurse mailbox alias update deferred for user %s", user_id)
        if "active" in changes and changes["active"] is not None:
            try:
                from app.modules.mail.core_service import close_personal_mailbox
                await close_personal_mailbox(user_id, closed=not user.is_active)
            except Exception:
                log.warning("nurse mailbox lifecycle update deferred for user %s", user_id)
        if changes.get("active") is False:
            await user_service.auth_service.sign_out_user(user)
    after = {
        "name": user.name,
        "phone_e164": user.phone_e164,
        "account_active": user.is_active,
        "profile_active": profile.active,
        "staff_number": profile.staff_number,
        "staff_number_provisional": profile.staff_number_provisional,
    }
    await audit.record(
        actor,
        "nurse.update",
        "nurse_profile",
        user_id,
        user.name,
        before=before,
        after=after,
        ip_hash=ip_hash,
    )
    return profile


async def set_nurse_password(
    actor, user_id: str, payload: NursePasswordSet, ip_hash: str | None = None
):
    """Set a nurse's password directly. Fixes accounts stuck on an invite that never arrived.

    Marks the invite accepted, clears any lockout, ends existing sessions and voids open links.
    The password is hashed here and never logged or audited.
    """
    from app.modules.auth import service as auth_service

    user = await auth_repo.user_by_id(user_id)
    profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    if not user or not profile:
        raise NotFound("Nurse profile not found.")
    if is_dual_account(user, profile):
        raise Conflict("This is an existing staff account. Use Users > Reset password; the nurse roster cannot change its password.")
    now = datetime.now(UTC)
    user.password_hash = hash_password(payload.password)
    user.is_active = True
    user.invite_accepted_at = user.invite_accepted_at or now
    user.failed_logins = 0
    user.last_failed_at = None
    user.locked_until = None
    await user.save()
    await auth_repo_invalidate(user, now)
    await auth_service.sign_out_user(user)
    await audit.record(
        actor, "nurse.password_set", "nurse_profile", user_id, user.name, ip_hash=ip_hash
    )
    return {"user_id": user_id, "status": "password_set"}


async def auth_repo_invalidate(user, now) -> None:
    from app.modules.users import repository as users_repo

    await users_repo.invalidate_open_links(user.id, now)


async def delete_nurse(actor, user_id: str, ip_hash: str | None = None) -> None:
    """Remove nurse access; dual staff accounts keep their independent user account."""
    from app.modules.auth.models import PasswordReset, RefreshToken
    from app.modules.visits.models import Visit

    profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    user = await auth_repo.user_by_id(user_id)
    if not profile or not user:
        raise NotFound("Nurse profile not found.")
    if await Visit.find_one(Visit.nurse_id == user_id):
        raise Conflict("This nurse has visit history and cannot be deleted. Deactivate them instead.")

    dual_account = is_dual_account(user, profile)
    if dual_account:
        await Device.get_pymongo_collection().delete_many({
            "user_id": user_id,
            "$or": [{"app": "nurse"}, {"app": None}, {"app": {"$exists": False}}, {"app": ""}],
        })
    else:
        await Device.find(Device.user_id == user_id).delete()
    await profile.delete()
    if dual_account:
        # Remove the nurse capability as well as the profile; otherwise the lazy
        # provisioner would recreate the profile on the next /field/me request.
        user.scopes = sorted(set(user.scopes) - {"field:use", "sos:send"})
        await user.save()
        await user_service.auth_service.sign_out_user(user)
        await audit.record(
            actor,
            "nurse.access.remove",
            "nurse_profile",
            user_id,
            user.name,
            before={"staff_number": profile.staff_number, "active": profile.active},
            after={"user_retained": True, "nurse_scopes_removed": True},
            ip_hash=ip_hash,
        )
        return

    await RefreshToken.find(RefreshToken.user_id == user.id).delete()
    await PasswordReset.find(PasswordReset.user_id == user.id).delete()
    await user.delete()
    from app.modules.mail.mailbox_admin import release_user_mailboxes
    await release_user_mailboxes(str(user_id))
    await audit.record(
        actor,
        "nurse.delete",
        "nurse_profile",
        user_id,
        user.name,
        before={"name": user.name, "staff_number": profile.staff_number},
        ip_hash=ip_hash,
    )

