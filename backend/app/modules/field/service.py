"""Field event operations. Events are append-only and idempotent by client_op_id."""

from datetime import UTC, datetime, timedelta

from app.modules.field.rules import clock_offset_s, verification_label
from app.modules.flags.models import VisitFlag
from app.modules.geo.rules import verify
from app.modules.nurses.models import NurseProfile
from app.modules.visits.models import Visit, VisitEvent, VisitNote
from app.modules.visits.rules import VisitRuleError, flags_for_event, next_status


async def record_event(
    nurse_id: str, visit_id: str, payload, event_type: str, received_at: datetime | None = None
) -> dict:
    received_at = received_at or datetime.now(UTC)
    duplicate = await VisitEvent.find_one(VisitEvent.client_op_id == payload.client_op_id)
    if duplicate:
        return {
            "status": "duplicate",
            "server": {
                "event_id": duplicate.id,
                "visit_status": (await Visit.find_one(Visit.id == visit_id)).status
                if await Visit.find_one(Visit.id == visit_id)
                else None,
            },
        }
    visit = await Visit.find_one(Visit.id == visit_id)
    if visit is None or visit.nurse_id != nurse_id:
        return {"status": "rejected", "reason": "visit_not_assigned"}
    try:
        new_status = next_status({"status": visit.status}, event_type)
    except VisitRuleError as exc:
        return {"status": "rejected", "reason": str(exc)}
    offset = clock_offset_s(received_at, payload.sent_at_device)
    snapshot = visit.place_snapshot or {"lat": 0, "lng": 0, "radius_m": 150}
    verification, distance = verify(
        {"lat": payload.lat, "lng": payload.lng, "accuracy_m": payload.accuracy_m}, snapshot, {}
    )
    event = VisitEvent(
        id=payload.id,
        client_op_id=payload.client_op_id,
        visit_id=visit_id,
        nurse_id=nurse_id,
        type=event_type,
        device_time=payload.device_time,
        sent_at_device=payload.sent_at_device,
        received_at=received_at,
        clock_offset_s=offset,
        lat=payload.lat,
        lng=payload.lng,
        accuracy_m=payload.accuracy_m,
        source=payload.source,
        verification=verification,
        distance_m=distance,
    )
    try:
        await event.insert()
    except Exception:
        duplicate = await VisitEvent.find_one(VisitEvent.client_op_id == payload.client_op_id)
        if duplicate and duplicate.nurse_id == nurse_id and duplicate.visit_id == visit_id:
            return {
                "status": "duplicate",
                "server": {"event_id": duplicate.id, "visit_status": visit.status},
            }
        if duplicate:
            return {"status": "rejected", "reason": "idempotency_key_conflict"}
        raise
    if event_type == "check_in":
        visit.check_in_at = payload.device_time
        if payload.safety_timer_minutes:
            visit.safety_timer_until = visit.scheduled_end + timedelta(
                minutes=payload.safety_timer_minutes
            )
            visit.safety_state = "armed"
    else:
        visit.check_out_at = payload.device_time
        visit.safety_state = "confirmed_safe"
    visit.status = new_status
    visit.updated_at = received_at
    await visit.save()
    for flag_type in flags_for_event(
        {
            "verification": verification,
            "clock_offset_s": offset,
            "type": event_type,
            "device_time": payload.device_time,
        },
        {
            "scheduled_start": visit.scheduled_start,
            "scheduled_end": visit.scheduled_end,
            "check_in_at": visit.check_in_at,
        },
        {},
    ):
        dedupe = f"{visit_id}:{flag_type}:{event.id}"
        await VisitFlag(
            id=dedupe,
            visit_id=visit_id,
            nurse_id=nurse_id,
            type=flag_type,
            dedupe_key=dedupe,
            details={"event_id": event.id},
        ).insert()
    profile = await NurseProfile.find_one(NurseProfile.user_id == nurse_id)
    if profile:
        profile.last_seen_at = received_at
        await profile.save()
    return {
        "status": "accepted",
        "server": {
            "event_id": event.id,
            "visit_status": visit.status,
            "verification_label": verification_label(verification),
        },
    }


async def record_note(nurse_id: str, visit_id: str, payload):
    existing = await VisitNote.find_one(VisitNote.client_op_id == payload.client_op_id)
    if existing:
        if existing.nurse_id != nurse_id or existing.visit_id != visit_id:
            return {"status": "rejected", "reason": "idempotency_key_conflict"}
        return {"status": "duplicate", "id": existing.id}
    visit = await Visit.find_one(Visit.id == visit_id)
    if visit is None or visit.nurse_id != nurse_id:
        return {"status": "rejected", "reason": "visit_not_assigned"}
    note = VisitNote(
        id=payload.id,
        client_op_id=payload.client_op_id,
        visit_id=visit_id,
        nurse_id=nurse_id,
        body=payload.body,
        created_at_device=payload.created_at_device,
        geo_snap=payload.geo_snap,
        in_range=bool(payload.geo_snap.get("in_range", False)),
    )
    await note.insert()
    return {"status": "accepted", "id": note.id}


from fastapi import Depends, HTTPException  # noqa: E402

from app.core.deps import Principal, require_scopes  # noqa: E402
from app.modules.settings.care_service import care_values  # noqa: E402


async def require_current_consent(
    principal: Principal = Depends(require_scopes("field:use")),
) -> Principal:
    profile = await NurseProfile.find_one(NurseProfile.user_id == principal.user_id)
    if profile is None or not profile.active:
        raise HTTPException(401, detail="nurse_inactive")
    values = await care_values()
    required = {
        "privacy_notice": values.get("privacy.notice_version", ""),
        "location": values.get("consent.location_version", ""),
    }
    missing = [
        kind
        for kind, version in required.items()
        if version and profile.consent_versions.get(kind) != version
    ]
    if missing:
        raise HTTPException(403, detail={"code": "consent_required", "types": missing})
    return principal


async def require_sos_access(
    principal: Principal = Depends(require_scopes("field:use", "sos:send")),
) -> Principal:
    return await require_current_consent(principal)
