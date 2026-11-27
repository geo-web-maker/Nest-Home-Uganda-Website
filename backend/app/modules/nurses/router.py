from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict

from app.core.deps import Principal, ReachContext, get_care_actor, require_scopes
from app.core.errors import Conflict, ValidationFailed
from app.core.totp_guard import assert_totp_session
from app.modules.audit import service as audit
from app.modules.auth import repository as auth_repo
from app.modules.auth.models import PasswordReset, User
from app.modules.care_ops.models import CareConsent
from app.modules.nurses.models import Device, NurseProfile
from app.modules.nurses.schemas import (
    AdhocOverride,
    DeviceRegistration,
    DeviceRevocation,
    NurseDetailsResponse,
    NurseDirectCreate,
    NurseInvite,
    NursePasswordSet,
    NurseProfileForUser,
    NursePatch,
    NurseProfileResponse,
    SupervisorPatch,
)
from app.modules.nurses.deps import get_active_nurse_profile
from app.modules.nurses.service import (
    delete_nurse,
    add_nurse_profile_to_user,
    create_nurse_direct,
    invite_nurse,
    patch_nurse,
    profile_for_user,
    register_user_device,
    set_nurse_password,
    is_dual_account,
    ensure_nurse_profile,
)

router = APIRouter(prefix="/admin/care/nurses", tags=["care-nurses"])
field_router = APIRouter(prefix="/field", tags=["field"])


class RepairProfilesBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dry_run: bool = True


def _nurse_is_in_reach(user_id: str, ctx: ReachContext) -> bool:
    if ctx.is_superadmin or ctx.reach == "all":
        return True
    if ctx.reach == "own":
        return user_id == ctx.user_id
    if ctx.reach == "team":
        return user_id == ctx.user_id or user_id in ctx.team_nurse_ids
    return False


async def _profile_out(profile: NurseProfile) -> NurseProfileResponse:
    """Build a complete roster response, including whether this belongs to a dual account."""
    user = await auth_repo.user_by_id(profile.user_id)
    supervisor = await auth_repo.user_by_id(profile.supervisor_id) if profile.supervisor_id else None
    return NurseProfileResponse(
        user_id=profile.user_id,
        name=user.name if user else None,
        supervisor_name=supervisor.name if supervisor and supervisor.is_active else None,
        staff_number=profile.staff_number,
        staff_number_provisional=profile.staff_number_provisional,
        dual_account=is_dual_account(user, profile),
        supervisor_id=profile.supervisor_id,
        team_id=profile.team_id,
        active=profile.active,
        phone_e164=profile.phone_e164,
        last_seen_at=profile.last_seen_at,
        app_version=profile.app_version,
        unmc_number=profile.unmc_number,
        unmc_category=profile.unmc_category,
        unmc_licence_expiry=profile.unmc_licence_expiry,
        unmc_verified_by=profile.unmc_verified_by,
        unmc_verified_at=profile.unmc_verified_at,
    )


@router.get("", response_model=list[NurseProfileResponse])
async def list_nurses(
    _: Principal = Depends(require_scopes("nurses:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    profiles = await NurseProfile.find().to_list()
    if not ctx.is_superadmin and ctx.reach != "all":
        profiles = [
            p for p in profiles if p.user_id in ctx.team_nurse_ids or p.user_id == ctx.user_id
        ]
    from beanie import PydanticObjectId

    ids = []
    for p in profiles:
        for value in (p.user_id, p.supervisor_id):
            try:
                if value:
                    ids.append(PydanticObjectId(value))
            except Exception:  # noqa: BLE001 - a malformed id just has no name
                pass
    people = await User.find({"_id": {"$in": ids}}).to_list() if ids else []
    users_by_id = {str(u.id): u for u in people}
    return [
        NurseProfileResponse(
            user_id=p.user_id,
            name=users_by_id[p.user_id].name if p.user_id in users_by_id else None,
            supervisor_name=users_by_id[p.supervisor_id].name if p.supervisor_id and p.supervisor_id in users_by_id else None,
            staff_number=p.staff_number,
            staff_number_provisional=p.staff_number_provisional,
            dual_account=is_dual_account(users_by_id.get(p.user_id), p),
            supervisor_id=p.supervisor_id,
            team_id=p.team_id,
            active=p.active,
            phone_e164=p.phone_e164,
            last_seen_at=p.last_seen_at,
            app_version=p.app_version,
        )
        for p in profiles
    ]


@router.post("", response_model=NurseProfileResponse, status_code=201)
async def create_nurse(
    payload: NurseInvite,
    principal: Principal = Depends(require_scopes("nurses:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    if not (ctx.is_superadmin or ctx.reach == "all"):
        if ctx.reach != "team" or payload.supervisor_id != ctx.user_id:
            raise HTTPException(status_code=404, detail="Nurse profile not found")
    if payload.supervisor_id:
        supervisor = await auth_repo.user_by_id(payload.supervisor_id)
        if supervisor is None or not supervisor.is_active:
            raise ValidationFailed(
                "No active user was found with that supervisor ID. Use the supervisor's user ID.",
                {"supervisor_id": "not_found_or_inactive"},
            )
        if not (ctx.is_superadmin or ctx.reach == "all") and payload.supervisor_id != ctx.user_id:
            raise HTTPException(status_code=404, detail="Supervisor not found")
    profile = await invite_nurse(principal, payload)
    return await _profile_out(profile)


@router.post("/direct", response_model=NurseProfileResponse, status_code=201)
async def create_nurse_with_password(
    payload: NurseDirectCreate,
    principal: Principal = Depends(require_scopes("nurses:write")),
):
    """Superadmin only: create a nurse with a chosen password (testing and hand-over)."""
    if not principal.is_superadmin:
        raise HTTPException(status_code=403, detail="Super administrator access required")
    if payload.supervisor_id:
        supervisor = await auth_repo.user_by_id(payload.supervisor_id)
        if supervisor is None or not supervisor.is_active:
            raise ValidationFailed(
                "No active user was found with that supervisor ID. Use the supervisor's user ID.",
                {"supervisor_id": "not_found_or_inactive"},
            )
    profile = await create_nurse_direct(principal, payload)
    return await _profile_out(profile)


@router.post("/from-user", response_model=NurseProfileResponse, status_code=201)
async def add_nurse_profile_for_existing_user(
    payload: NurseProfileForUser,
    principal: Principal = Depends(require_scopes("nurses:write")),
):
    """Superadmin only: make an existing account (such as an admin who is also a nurse) a nurse."""
    if not principal.is_superadmin:
        raise HTTPException(status_code=403, detail="Super administrator access required")
    profile = await add_nurse_profile_to_user(principal, payload)
    return await _profile_out(profile)


@router.post("/{user_id}/password")
async def set_password_for_nurse(
    user_id: str,
    payload: NursePasswordSet,
    principal: Principal = Depends(require_scopes("nurses:write")),
):
    """Superadmin only: set a nurse's password so they can sign in without the emailed invite."""
    if not principal.is_superadmin:
        raise HTTPException(status_code=403, detail="Super administrator access required")
    return await set_nurse_password(principal, user_id, payload)


@router.get("/supervisor-options")
async def supervisor_options(
    _: Principal = Depends(require_scopes("nurses:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    """Active accounts that can be assigned as a nurse's supervisor, within the caller's reach."""
    users = await User.find(User.is_active == True).to_list()  # noqa: E712
    if ctx.is_superadmin or ctx.reach == "all":
        # Supervisor eligibility is permission-based. User.kind is a display label,
        # not an authorization primitive.
        users = [u for u in users if u.is_superadmin or "nurses:write" in u.scopes]
    else:
        users = [u for u in users if str(u.id) == ctx.user_id]
    users.sort(key=lambda u: (u.name or "").lower())
    return [
        {
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "kind": u.kind,
            "is_superadmin": u.is_superadmin,
        }
        for u in users
    ]


@router.get("/{user_id}", response_model=NurseProfileResponse)
async def get_nurse_profile(
    user_id: str,
    _: Principal = Depends(require_scopes("nurses:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    profile = await profile_for_user(user_id)
    if profile is None or (
        not ctx.is_superadmin
        and ctx.reach != "all"
        and profile.user_id not in ctx.team_nurse_ids
        and profile.user_id != ctx.user_id
    ):
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    return await _profile_out(profile)


@router.get("/{user_id}/details", response_model=NurseDetailsResponse)
async def get_nurse_details(
    user_id: str,
    _: Principal = Depends(require_scopes("nurses:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    """Return a reach-filtered nurse detail without device credentials or auth secrets."""
    profile = await profile_for_user(user_id)
    if profile is None or (
        not ctx.is_superadmin
        and ctx.reach != "all"
        and profile.user_id not in ctx.team_nurse_ids
        and profile.user_id != ctx.user_id
    ):
        raise HTTPException(status_code=404, detail="Nurse profile not found")

    user = await auth_repo.user_by_id(user_id)
    devices = await Device.find(Device.user_id == user_id).sort("-created_at").to_list()
    consents = await CareConsent.find(CareConsent.user_id == user_id).sort("-accepted_at").to_list()
    return {
        "person": {
            "name": user.name if user else None,
            "email": user.email if user else None,
            "phone_e164": user.phone_e164 if user else profile.phone_e164,
            "is_active": user.is_active if user else False,
            "dual_account": is_dual_account(user, profile),
        },
        "profile": {
            "user_id": profile.user_id,
            "staff_number": profile.staff_number,
            "staff_number_provisional": profile.staff_number_provisional,
            "supervisor_id": profile.supervisor_id,
            "team_id": profile.team_id,
            "active": profile.active,
            "phone_e164": profile.phone_e164,
            "last_seen_at": profile.last_seen_at,
            "app_version": profile.app_version,
            "battery_pct": profile.battery_pct,
            "adhoc_override": profile.adhoc_override,
            "consent_versions": profile.consent_versions,
            "unmc_number": profile.unmc_number,
            "unmc_category": profile.unmc_category,
            "unmc_licence_expiry": profile.unmc_licence_expiry,
            "unmc_verified_by": profile.unmc_verified_by,
            "unmc_verified_at": profile.unmc_verified_at,
        },
        "devices": [
            {
                "device_id": device.device_id,
                "platform": device.platform,
                "registered_at": device.created_at,
                "revoked_at": device.revoked_at,
                "push_token_updated_at": device.push_token_updated_at,
                "has_push_token": bool(device.push_token),
            }
            for device in devices
        ],
        "consents": [
            {
                "type": consent.type,
                "version": consent.version,
                "source": consent.source,
                "accepted_at": consent.accepted_at,
            }
            for consent in consents
        ],
    }


@router.patch("/{user_id}", response_model=NurseProfileResponse)
async def update_nurse(
    user_id: str,
    payload: NursePatch,
    principal: Principal = Depends(require_scopes("nurses:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    if not _nurse_is_in_reach(user_id, ctx):
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    profile = await patch_nurse(principal, user_id, payload)
    return await _profile_out(profile)


@router.delete("/{user_id}", status_code=204)
async def delete_nurse_account(
    user_id: str,
    principal: Principal = Depends(require_scopes("nurses:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    if not _nurse_is_in_reach(user_id, ctx):
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    await delete_nurse(principal, user_id)


@router.patch("/{user_id}/supervisor", response_model=NurseProfileResponse)
async def change_supervisor(
    user_id: str,
    payload: SupervisorPatch,
    principal: Principal = Depends(require_scopes("nurses:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    if not _nurse_is_in_reach(user_id, ctx):
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    if (
        payload.supervisor_id
        and not (ctx.is_superadmin or ctx.reach == "all")
        and payload.supervisor_id != ctx.user_id
    ):
        raise HTTPException(status_code=404, detail="Supervisor not found")
    profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    if not profile:
        raise HTTPException(404, detail="Nurse profile not found")
    if payload.supervisor_id:
        supervisor = await auth_repo.user_by_id(payload.supervisor_id)
        if supervisor and not supervisor.is_active:
            supervisor = None
        if not supervisor:
            raise HTTPException(422, detail="Supervisor is not active")
    before = {"supervisor_id": profile.supervisor_id}
    profile.supervisor_id = payload.supervisor_id
    await profile.save()
    await audit.record(
        principal,
        "nurse.supervisor.change",
        "nurse_profile",
        user_id,
        user_id,
        before=before,
        after={"supervisor_id": profile.supervisor_id},
    )
    return await _profile_out(profile)


@router.patch("/{user_id}/adhoc-override", response_model=NurseProfileResponse)
async def set_adhoc_override(
    user_id: str,
    payload: AdhocOverride,
    principal: Principal = Depends(require_scopes("carecfg:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    if not _nurse_is_in_reach(user_id, ctx):
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    if not profile:
        raise HTTPException(404, detail="Nurse profile not found")
    before = {"adhoc_override": profile.adhoc_override}
    profile.adhoc_override = payload.enabled
    await profile.save()
    await audit.record(
        principal,
        "nurse.adhoc_override",
        "nurse_profile",
        user_id,
        user_id,
        before=before,
        after={"adhoc_override": profile.adhoc_override},
    )
    return await _profile_out(profile)


@router.post("/{user_id}/revoke-device")
async def revoke_device(
    user_id: str,
    body: DeviceRevocation,
    principal: Principal = Depends(require_scopes("nurses:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    if not _nurse_is_in_reach(user_id, ctx):
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    device = await Device.find_one(Device.device_id == body.device_id, Device.user_id == user_id)
    if not device:
        raise HTTPException(404, detail="Device not found")
    device.revoked_at = datetime.now(UTC)
    device.push_token = None
    device.push_token_updated_at = datetime.now(UTC)
    await device.save()
    await audit.record(
        principal,
        "nurse.device.revoke",
        "device",
        device.device_id,
        device.device_id,
        after={"revoked_at": device.revoked_at.isoformat()},
    )
    return {"revoked": True}


@router.post("/{user_id}/invite")
async def resend_nurse_invite(
    user_id: str,
    principal: Principal = Depends(require_scopes("nurses:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    if not _nurse_is_in_reach(user_id, ctx):
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    user = await auth_repo.user_by_id(user_id)
    profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    if not user or not profile:
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    if is_dual_account(user, profile):
        raise HTTPException(
            status_code=409,
            detail="This is an existing staff account. It already has its own sign-in, so there is no nurse invite to send. Use Users > Reset password if they are locked out.",
        )
    if not user.is_active or (
        user.last_login_at is not None or user.invite_accepted_at is not None
    ):
        raise HTTPException(
            status_code=409,
            detail="Only active nurses who have not signed in can receive another invite",
        )
    from app.modules.users import service as user_service

    now = datetime.now(UTC)
    raw = await user_service._issue_link(
        user, now, user_service.INVITE_DAYS * 1440, purpose="invite"
    )
    await user_service._send_link(user, raw, invite=True, minutes=user_service.INVITE_DAYS * 1440)
    await audit.record(
        principal,
        "nurse.invite.resend",
        "nurse_profile",
        user_id,
        user.name,
        after={"expires_days": user_service.INVITE_DAYS},
    )
    return {"user_id": user_id, "status": "sent"}


@router.delete("/{user_id}/invite")
async def revoke_nurse_invite(
    user_id: str,
    principal: Principal = Depends(require_scopes("nurses:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    if not _nurse_is_in_reach(user_id, ctx):
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    user = await auth_repo.user_by_id(user_id)
    profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    if not user or not profile:
        raise HTTPException(status_code=404, detail="Nurse profile not found")
    if is_dual_account(user, profile):
        raise HTTPException(
            status_code=409,
            detail="This is an existing staff account. It already has its own sign-in, so there is no nurse invite to revoke. Use Users to manage the account.",
        )
    if user.last_login_at is not None or user.invite_accepted_at is not None:
        raise HTTPException(
            status_code=409, detail="An accepted invite cannot be revoked through this endpoint"
        )
    links = await PasswordReset.find(PasswordReset.user_id == user.id).to_list()
    revoked = 0
    for link in links:
        if getattr(link, "purpose", "reset") == "invite" and link.used_at is None:
            link.used_at = datetime.now(UTC)
            await link.save()
            revoked += 1
    if revoked == 0:
        raise HTTPException(status_code=409, detail="No open nurse invite exists")
    await audit.record(
        principal,
        "nurse.invite.revoke",
        "nurse_profile",
        user_id,
        user.name,
        after={"revoked_links": revoked, "active": user.is_active},
    )
    return {"user_id": user_id, "status": "revoked"}


@field_router.post("/devices", status_code=status.HTTP_201_CREATED)
async def register_device(
    payload: DeviceRegistration, principal: Principal = Depends(require_scopes("field:use"))
):
    # The scope guard has a superadmin bypass; a nurse device still requires an explicitly
    # stored field:use scope and an active NurseProfile.
    await get_active_nurse_profile(principal)
    existing = await Device.find_one(Device.device_id == payload.device_id)
    if existing and existing.revoked_at:
        raise HTTPException(401, detail="device_revoked")
    if existing and existing.user_id != principal.user_id:
        raise HTTPException(status_code=409, detail="device_already_registered")
    try:
        device = await register_user_device(principal.user_id, payload, app="nurse")
    except Exception as exc:
        from app.core.errors import Conflict, Unauthorised

        if isinstance(exc, Conflict):
            raise HTTPException(status_code=409, detail="device_already_registered") from exc
        if isinstance(exc, Unauthorised):
            raise HTTPException(status_code=401, detail="device_revoked") from exc
        raise
    return {"device_id": device.device_id, "registered": True}


@router.post("/repair-profiles")
async def repair_missing_nurse_profiles(
    body: RepairProfilesBody,
    response: Response,
    principal: Principal = Depends(require_scopes("nurses:write")),
    mail_totp: str | None = Cookie(default=None),
):
    """Superadmin-only repair for active field-scope users missing their NurseProfile."""
    if not principal.is_superadmin:
        raise HTTPException(status_code=403, detail="Super administrator access required")
    await assert_totp_session(principal, mail_totp)
    response.headers["Cache-Control"] = "no-store"
    from app.modules.push.diagnostics import nurse_access_problems

    diagnostics = await nurse_access_problems()
    missing = [
        row for row in diagnostics.get("problems", [])
        if "no nurse profile" in str(row.get("problem", "")).lower()
    ]
    created: list[dict] = []
    skipped: list[dict] = []
    for row in missing:
        user = None
        user_id = row.get("user_id") or row.get("id")
        if user_id:
            user = await auth_repo.user_by_id(str(user_id))
        if user is None and row.get("email"):
            user = await auth_repo.user_by_email(str(row.get("email")))
        if user is None:
            skipped.append({"user_id": str(user_id) if user_id else None, "name": row.get("user"), "reason": "user_not_found"})
            continue
        if user.is_test or not user.is_active or "field:use" not in user.scopes:
            skipped.append({"user_id": str(user.id), "name": user.name, "reason": "not_eligible"})
            continue
        if body.dry_run:
            created.append({"user_id": str(user.id), "name": user.name, "staff_number": None, "status": "would_create"})
            continue
        try:
            profile, did_create = await ensure_nurse_profile(
                user, actor=principal, source="repair", reactivate=False
            )
            if profile is not None and did_create:
                created.append({"user_id": str(user.id), "name": user.name, "staff_number": profile.staff_number, "status": "created"})
            else:
                skipped.append({"user_id": str(user.id), "name": user.name, "reason": "not_eligible_or_already_exists"})
        except Exception:
            skipped.append({"user_id": str(user.id), "name": user.name, "reason": "provisioning_failed"})
    return {"dry_run": body.dry_run, "created": created, "skipped": skipped}
