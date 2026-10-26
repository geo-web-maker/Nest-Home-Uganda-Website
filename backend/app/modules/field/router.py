from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.db import get_care_database, start_session
from app.core.deps import Principal, require_scopes
from app.modules.audit.models import AuditLog
from app.modules.care_clients.models import CareClient
from app.modules.care_ops.models import CareConsent, CareInboxNotification
from app.modules.field.adhoc_rules import active_stay_for_date, is_adhoc_allowed
from app.modules.field.schemas import ConsentIn, EventIn, HeartbeatIn, NoteIn
from app.modules.field.service import record_event, record_note, require_current_consent
from app.modules.flags.models import VisitFlag
from app.modules.geo.rules import verify
from app.modules.nurses.models import Device, NurseProfile
from app.modules.places.models import CarePlace, PlaceStay
from app.modules.settings.care_service import care_values
from app.modules.settings.rules import resolve_sos_enabled
from app.modules.visits.models import Visit, VisitEvent

router = APIRouter(prefix="/field", tags=["field"])


class AdhocVisitIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    client_op_id: str = Field(min_length=8, max_length=160)
    client_id: str = Field(min_length=1, max_length=160)
    device_time: datetime
    sent_at_device: datetime
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    accuracy_m: float = Field(default=0, ge=0, le=100000)
    source: Literal["app_auto", "app_manual", "pwa_manual"] = "pwa_manual"
    device_info: dict = Field(default_factory=dict)


CanUse = Depends(require_current_consent)
CanUseBasic = Depends(require_scopes("field:use"))


def _field_visit(v, client=None):
    snap = v.place_snapshot or {}
    return {
        "id": v.id,
        "client_display_name": client.display_name if client else "Client",
        "place_address_text": snap.get("address_text", ""),
        "lat": snap.get("lat"),
        "lng": snap.get("lng"),
        "scheduled_start": v.scheduled_start,
        "scheduled_end": v.scheduled_end,
        "status": v.status,
        "instructions": v.instructions,
        "adhoc": v.adhoc,
        "check_in_at": v.check_in_at,
        "check_out_at": v.check_out_at,
        "verification_label": "needs_review",
        "photo_count": 0,
        "photo_rules": {"allowed": bool(client and client.photo_allowed)},
        "safety_state": v.safety_state,
        "safety_timer_until": v.safety_timer_until,
    }


@router.get("/me")
async def me(principal: Principal = CanUseBasic):
    profile = await NurseProfile.find_one(NurseProfile.user_id == principal.user_id)
    if profile is None or not profile.active:
        raise HTTPException(404, detail="Nurse profile not found")
    values = await care_values()
    sos_enabled, reason = resolve_sos_enabled(values)
    sos_enabled = bool(values.get("care.module_c_enabled")) and sos_enabled
    required = [
        {"type": kind, "version": version, "text": values.get(text_key, "")}
        for kind, version, text_key in [
            ("privacy_notice", values.get("privacy.notice_version", ""), "privacy.notice_text"),
            ("location", values.get("consent.location_version", ""), "consent.location_text"),
        ]
        if version and profile.consent_versions.get(kind) != version
    ]
    return {
        "user_id": profile.user_id,
        "staff_number": profile.staff_number,
        "team_id": profile.team_id,
        "settings": {
            "sos_enabled": sos_enabled,
            "sos_disabled_reason": reason,
            "adhoc_allowed": is_adhoc_allowed(
                profile.adhoc_override,
                bool(values.get("visits.adhoc_enabled", values.get("field.adhoc_allowed", False))),
            ),
            "max_accuracy_m": values.get("field.max_accuracy_m", 100),
            "min_app_version": values.get("care.min_app_version", "0.1.0"),
            "photos_enabled": bool(values.get("photos.enabled", False)),
            "photo_max_mb": int(values.get("photos.max_mb", 5)),
        },
        "consents_required": required,
    }


@router.post("/consents", status_code=201)
async def consent(payload: ConsentIn, principal: Principal = CanUseBasic):
    profile = await NurseProfile.find_one(NurseProfile.user_id == principal.user_id)
    if profile is None or not profile.active:
        raise HTTPException(401, detail="nurse_inactive")
    profile.consent_versions[payload.type] = payload.version
    await profile.save()
    consent_id = f"{principal.user_id}:{payload.type}:{payload.version}"
    if not await CareConsent.find_one(CareConsent.id == consent_id):
        await CareConsent(
            id=consent_id, user_id=principal.user_id, type=payload.type, version=payload.version
        ).insert()
    await AuditLog(
        action="field.consent.accept",
        item_type="consent",
        item_id=principal.user_id,
        after={"type": payload.type, "version": payload.version},
    ).insert()
    return {"accepted": True, "type": payload.type, "version": payload.version}


@router.get("/clients")
async def assigned_clients(principal: Principal = CanUse):
    """Return only active clients explicitly assigned to the signed-in nurse."""
    rows = await CareClient.find(
        CareClient.status == "active", CareClient.assigned_nurse_ids == principal.user_id
    ).to_list()
    rows.sort(key=lambda row: row.display_name.casefold())
    return {"items": [{"id": row.id, "display_name": row.display_name} for row in rows]}


@router.get("/visits")
async def visits(
    principal: Principal = CanUse, day: date = Query(alias="date", default_factory=date.today)
):
    local = ZoneInfo("Africa/Kampala")
    start = datetime.combine(day, time.min, local).astimezone(UTC)
    end = start + timedelta(days=1)
    rows = await Visit.find(
        Visit.nurse_id == principal.user_id,
        Visit.scheduled_start >= start,
        Visit.scheduled_start < end,
    ).to_list()
    rows.sort(key=lambda v: (0 if v.status == "in_progress" else 1, v.scheduled_start))
    output = []
    for v in rows:
        client = await CareClient.find_one(CareClient.id == v.client_id)
        output.append(_field_visit(v, client))
    return {"items": output, "total": len(output)}


@router.post("/visits/adhoc", status_code=201)
async def create_adhoc_visit(payload: AdhocVisitIn, principal: Principal = CanUse):
    """Create an unscheduled visit only for an assigned client and an active place stay."""
    existing_event = await VisitEvent.find_one(VisitEvent.client_op_id == payload.client_op_id)
    if existing_event:
        if existing_event.nurse_id != principal.user_id or existing_event.visit_id != payload.id:
            raise HTTPException(409, detail="idempotency_key_conflict")
        return {"status": "duplicate", "visit_id": existing_event.visit_id}
    profile = await NurseProfile.find_one(NurseProfile.user_id == principal.user_id)
    if profile is None or not profile.active:
        raise HTTPException(401, detail="nurse_inactive")
    values = await care_values()
    enabled = is_adhoc_allowed(
        profile.adhoc_override,
        bool(values.get("visits.adhoc_enabled", values.get("field.adhoc_allowed", False))),
    )
    if not enabled:
        return {"status": "rejected", "reason": "adhoc_disabled"}
    if payload.device_time.tzinfo is None or payload.sent_at_device.tzinfo is None:
        return {"status": "rejected", "reason": "invalid_payload"}
    now = datetime.now(UTC)
    oldest = now - timedelta(hours=int(values.get("visits.sync_window_past_hours", 24)))
    newest = now + timedelta(days=int(values.get("visits.sync_window_future_days", 14)))
    if payload.device_time < oldest or payload.device_time > newest:
        return {"status": "rejected", "reason": "device_time_outside_sync_window"}
    client = await CareClient.find_one(
        CareClient.id == payload.client_id, CareClient.status == "active"
    )
    if client is None or principal.user_id not in client.assigned_nurse_ids:
        return {"status": "rejected", "reason": "client_not_assigned"}
    local_day = payload.device_time.astimezone(ZoneInfo("Africa/Kampala")).date().isoformat()
    stays = await PlaceStay.find(PlaceStay.client_id == client.id).to_list()
    stay = active_stay_for_date(stays, local_day)
    if stay is None:
        return {"status": "rejected", "reason": "no_current_place"}
    place = await CarePlace.find_one(
        CarePlace.id == stay.place_id, CarePlace.client_id == client.id
    )
    if place is None:
        return {"status": "rejected", "reason": "no_current_place"}
    conflicting_visit = await Visit.find_one(Visit.id == payload.id)
    if conflicting_visit is not None:
        raise HTTPException(409, detail="visit_identifier_conflict")
    visit_id = payload.id
    start = payload.device_time
    end = start + timedelta(minutes=int(values.get("visits.adhoc_default_minutes", 60)))
    snapshot = {
        "address_text": place.address_text,
        "lat": place.lat,
        "lng": place.lng,
        "radius_m": place.radius_m,
        "place_id": place.id,
    }
    verification, distance = verify(
        {"lat": payload.lat, "lng": payload.lng, "accuracy_m": payload.accuracy_m}, snapshot, values
    )
    event = VisitEvent(
        id=f"{payload.id}:check-in",
        client_op_id=payload.client_op_id,
        visit_id=visit_id,
        nurse_id=principal.user_id,
        type="check_in",
        device_time=payload.device_time,
        sent_at_device=payload.sent_at_device,
        lat=payload.lat,
        lng=payload.lng,
        accuracy_m=payload.accuracy_m,
        source=payload.source,
        verification=verification,
        distance_m=distance,
    )
    visit = Visit(
        id=visit_id,
        client_id=client.id,
        nurse_id=principal.user_id,
        supervisor_id=profile.supervisor_id,
        place_id=place.id,
        scheduled_start=start,
        scheduled_end=end,
        status="in_progress",
        instructions=client.notes_for_nurse,
        adhoc=True,
        created_by=principal.user_id,
        place_snapshot=snapshot,
        check_in_at=start,
    )
    flag_id = f"{visit_id}:adhoc"
    flag = VisitFlag(
        id=flag_id,
        visit_id=visit_id,
        nurse_id=principal.user_id,
        type="adhoc_visit",
        dedupe_key=flag_id,
        details={"client_op_id": payload.client_op_id, "verification": verification},
    )
    db = get_care_database()
    async with await start_session(db) as session:

        async def write_transaction(active_session):
            await visit.insert(session=active_session)
            await event.insert(session=active_session)
            await flag.insert(session=active_session)

        await session.with_transaction(write_transaction)
    await AuditLog(
        action="field.visit.adhoc_create",
        item_type="visit",
        item_id=visit_id,
        after={"client_id": client.id, "verification": verification},
    ).insert()
    return {"status": "accepted", "visit_id": visit_id, "visit": _field_visit(visit, client)}


@router.get("/visits/{visit_id}")
async def visit_detail(visit_id: str, principal: Principal = CanUse):
    v = await Visit.find_one(Visit.id == visit_id, Visit.nurse_id == principal.user_id)
    if not v:
        raise HTTPException(404, detail="Visit not found")
    client = await CareClient.find_one(CareClient.id == v.client_id)
    return _field_visit(v, client)


@router.post("/visits/{visit_id}/check-in")
async def check_in(visit_id: str, payload: EventIn, principal: Principal = CanUse):
    return await record_event(principal.user_id, visit_id, payload, "check_in")


@router.post("/visits/{visit_id}/check-out")
async def check_out(visit_id: str, payload: EventIn, principal: Principal = CanUse):
    return await record_event(principal.user_id, visit_id, payload, "check_out")


@router.post("/visits/{visit_id}/notes", status_code=201)
async def add_note(visit_id: str, payload: NoteIn, principal: Principal = CanUse):
    result = await record_note(principal.user_id, visit_id, payload)
    if result.get("status") == "rejected":
        raise HTTPException(404, detail="Visit not found")
    return result


@router.get("/history")
async def history(
    principal: Principal = CanUse,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    rows = (
        await Visit.find(Visit.nurse_id == principal.user_id)
        .sort("-scheduled_start")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return {
        "items": [
            {
                "id": v.id,
                "scheduled_start": v.scheduled_start,
                "scheduled_end": v.scheduled_end,
                "status": v.status,
            }
            for v in rows
        ],
        "page": page,
        "page_size": page_size,
    }


@router.post("/heartbeat")
async def heartbeat(payload: HeartbeatIn, principal: Principal = CanUse):
    device = await Device.find_one(Device.device_id == payload.device_id)
    if device and device.revoked_at:
        raise HTTPException(401, detail="device_revoked")
    if device is None:
        device = Device(
            device_id=payload.device_id, user_id=principal.user_id, platform=payload.platform
        )
    device.user_id = principal.user_id
    device.platform = payload.platform
    if device.id:
        await device.save()
    else:
        await device.insert()
    profile = await NurseProfile.find_one(NurseProfile.user_id == principal.user_id)
    if profile:
        profile.last_seen_at = datetime.now(UTC)
        profile.app_version = payload.app_version
        profile.battery_pct = payload.battery_pct
        await profile.save()
    return {"accepted": True, "server_time": datetime.now(UTC)}


@router.get("/app/version")
async def app_version(
    platform: str = Query("android", pattern="^(android|ios|web)$"), _: Principal = CanUseBasic
):
    from app.modules.app_releases.models import AppRelease
    from app.modules.app_releases.rules import compare_versions, effective_minimum_version

    rows = [
        row for row in await AppRelease.find().to_list() if row.platform == platform and row.active
    ]
    values = await care_values()
    configured_minimum = str(values.get("care.min_app_version", "0.1.0"))
    if not rows:
        # Preserve the care setting until the owner publishes a release record.
        return {
            "latest": "0.1.0",
            "min_supported": configured_minimum,
            "min_app_version": configured_minimum,
            "download_path": None,
            "release_notes": "",
            "platform": platform,
        }
    from functools import cmp_to_key

    rows.sort(
        key=cmp_to_key(lambda left, right: compare_versions(left.version, right.version)),
        reverse=True,
    )
    latest = rows[0]
    # The policy setting may raise (never silently lower) the release's minimum floor.
    minimum = effective_minimum_version(latest.min_supported_version, configured_minimum)
    return {
        "latest": latest.version,
        "min_supported": minimum,
        "min_app_version": minimum,
        "download_path": latest.download_path,
        "release_notes": latest.release_notes,
        "platform": platform,
        "published_at": latest.published_at,
    }


@router.get("/inbox")
async def field_inbox(
    principal: Principal = CanUse,
    limit: int = Query(default=30, ge=1, le=100),
    before: datetime | None = None,
):
    """Notifications are scoped strictly to the signed-in nurse and avoid client names/details."""
    query = {"user_id": principal.user_id}
    if before is not None:
        query["created_at"] = {"$lt": before}
    rows = await CareInboxNotification.find(query).sort("-created_at").limit(limit + 1).to_list()
    has_more = len(rows) > limit
    items = rows[:limit]
    return {
        "items": [row.model_dump(mode="json", exclude={"_id"}) for row in items],
        "has_more": has_more,
        "next_before": items[-1].created_at.isoformat() if has_more and items else None,
        "unread_count": await CareInboxNotification.find(
            CareInboxNotification.user_id == principal.user_id,
            CareInboxNotification.read_at == None,  # noqa: E711
        ).count(),
    }  # noqa: E711


@router.post("/inbox/{notification_id}/read")
async def mark_inbox_read(notification_id: str, principal: Principal = CanUse):
    row = await CareInboxNotification.find_one(
        CareInboxNotification.id == notification_id,
        CareInboxNotification.user_id == principal.user_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    if row.read_at is None:
        row.read_at = datetime.now(UTC)
        await row.save()
    return {"id": row.id, "read_at": row.read_at}
