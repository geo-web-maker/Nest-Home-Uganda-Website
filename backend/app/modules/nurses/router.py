from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import Principal, ReachContext, get_care_actor, require_scopes
from app.core.errors import Conflict, NotFound, ValidationFailed
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
    NurseInvite,
    NursePatch,
    NurseProfileResponse,
    SupervisorPatch,
)
from app.modules.nurses.service import (
    invite_nurse,
    patch_nurse,
    profile_for_user,
    register_user_device,
)

router = APIRouter(prefix="/admin/care/nurses", tags=["care-nurses"])
field_router = APIRouter(prefix="/field", tags=["field"])


def _nurse_is_in_reach(user_id: str, ctx: ReachContext) -> bool:
    if ctx.is_superadmin or ctx.reach == "all":
        return True
    if ctx.reach == "own":
        return user_id == ctx.user_id
    if ctx.reach == "team":
        return user_id == ctx.user_id or user_id in ctx.team_nurse_ids
    return False


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
    return [
        NurseProfileResponse(
            user_id=p.user_id,
            staff_number=p.staff_number,
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
    try:
        profile = await invite_nurse(principal, payload)
    except (Conflict, ValidationFailed) as exc:
        raise HTTPException(getattr(exc, "status_code", 422), detail=str(exc)) from exc
    return profile


@router.get("/supervisor-options")
async def supervisor_options(
    _: Principal = Depends(require_scopes("nurses:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    """Active accounts that can be assigned as a nurse's supervisor, within the caller's reach."""
    users = await User.find(User.is_active == True).to_list()  # noqa: E712
    if ctx.is_superadmin or ctx.reach == "all":
        users = [
            u for u in users
            if u.kind != "nurse" and (u.is_superadmin or u.kind in {"supervisor", "admin", "executive"})
        ]
    else:
        users = [u for u in users if str(u.id) == ctx.user_id]
    users.sort(key=lambda u: (u.name or "").lower())
    return [
        {"id": str(u.id), "name": u.name, "email": u.email, "kind": u.kind, "is_superadmin": u.is_superadmin}
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
    return profile


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
            "name": user.name if user and user.kind == "nurse" else None,
            "email": user.email if user and user.kind == "nurse" else None,
            "phone_e164": user.phone_e164 if user and user.kind == "nurse" else profile.phone_e164,
            "is_active": user.is_active if user and user.kind == "nurse" else False,
        },
        "profile": {
            "user_id": profile.user_id,
            "staff_number": profile.staff_number,
            "supervisor_id": profile.supervisor_id,
            "team_id": profile.team_id,
            "active": profile.active,
            "phone_e164": profile.phone_e164,
            "last_seen_at": profile.last_seen_at,
            "app_version": profile.app_version,
            "battery_pct": profile.battery_pct,
            "adhoc_override": profile.adhoc_override,
            "consent_versions": profile.consent_versions,
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
    try:
        return await patch_nurse(principal, user_id, payload)
    except NotFound as exc:
        raise HTTPException(404, detail=str(exc)) from exc
    except (Conflict, ValidationFailed) as exc:
        raise HTTPException(422, detail=str(exc)) from exc


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
    return profile


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
    return profile


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
    if not user or not profile or user.kind != "nurse":
        raise HTTPException(status_code=404, detail="Nurse profile not found")
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
    if not user or not profile or user.kind != "nurse":
        raise HTTPException(status_code=404, detail="Nurse profile not found")
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
    existing = await Device.find_one(Device.device_id == payload.device_id)
    if existing and existing.revoked_at:
        raise HTTPException(401, detail="device_revoked")
    if existing and existing.user_id != principal.user_id:
        raise HTTPException(status_code=409, detail="device_already_registered")
    try:
        device = await register_user_device(principal.user_id, payload)
    except Exception as exc:
        from app.core.errors import Conflict, Unauthorised

        if isinstance(exc, Conflict):
            raise HTTPException(status_code=409, detail="device_already_registered") from exc
        if isinstance(exc, Unauthorised):
            raise HTTPException(status_code=401, detail="device_revoked") from exc
        raise
    return {"device_id": device.device_id, "registered": True}
