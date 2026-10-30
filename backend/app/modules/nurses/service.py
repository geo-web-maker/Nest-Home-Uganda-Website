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
from app.modules.nurses.schemas import (
    DeviceRegistration,
    NurseDirectCreate,
    NurseInvite,
    NursePasswordSet,
    NursePatch,
)
from app.modules.users import service as user_service


async def profile_for_user(user_id: str):
    return await get_profile_for_user(user_id)


async def register_user_device(user_id: str, payload: DeviceRegistration) -> Device:
    return await register_device(
        Device(
            device_id=payload.device_id,
            user_id=user_id,
            platform=payload.platform,
            push_token=payload.push_token,
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
        scopes=sorted(SCOPE_PRESETS["nurse"]),
        kind="nurse",
        reach="own",
        phone_e164=phone,
    )
    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise Conflict("Email or phone is already in use.") from exc
    profile = NurseProfile(
        user_id=str(user.id),
        staff_number=payload.staff_number,
        supervisor_id=payload.supervisor_id,
        team_id=payload.team_id,
        phone_e164=phone,
    )
    await profile.insert()
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
        scopes=sorted(SCOPE_PRESETS["nurse"]),
        kind="nurse",
        reach="own",
        phone_e164=phone,
        invite_accepted_at=datetime.now(UTC),
    )
    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise Conflict("Email or phone is already in use.") from exc
    profile = NurseProfile(
        user_id=str(user.id),
        staff_number=payload.staff_number,
        supervisor_id=payload.supervisor_id,
        team_id=payload.team_id,
        phone_e164=phone,
    )
    try:
        await profile.insert()
    except DuplicateKeyError as exc:
        await user.delete()  # keep user and profile together
        raise Conflict("A nurse profile already exists for this account.") from exc
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
    before = {"name": user.name, "phone_e164": user.phone_e164, "active": user.is_active}
    changes = payload.model_dump(exclude_unset=True)
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
    if changes.get("active") is not None:
        user.is_active = changes["active"]
        profile.active = changes["active"]
    await user.save()
    await profile.save()
    if changes.get("active") is False:
        await user_service.auth_service.sign_out_user(user)
    await audit.record(
        actor,
        "nurse.update",
        "nurse_profile",
        user_id,
        user.name,
        before=before,
        after={"name": user.name, "phone_e164": user.phone_e164, "active": user.is_active},
        ip_hash=ip_hash,
    )
    return profile


async def set_nurse_password(actor, user_id: str, payload: NursePasswordSet, ip_hash: str | None = None):
    """Set a nurse's password directly. Fixes accounts stuck on an invite that never arrived.

    Marks the invite accepted, clears any lockout, ends existing sessions and voids open links.
    The password is hashed here and never logged or audited.
    """
    from app.modules.auth import service as auth_service

    user = await auth_repo.user_by_id(user_id)
    profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    if not user or not profile or user.kind != "nurse":
        raise NotFound("Nurse profile not found.")
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
