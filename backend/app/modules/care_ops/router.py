from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.deps import Principal, ReachContext, get_care_actor, require_scopes
from app.core.photo_store import (
    signed_delivery_url,
    temporary_stream_signature,
    verify_temporary_stream_signature,
)
from app.modules.audit.models import AuditLog
from app.modules.care_clients.models import CareClient
from app.modules.care_ops.dispatch import notify_sos
from app.modules.care_ops.models import (
    CareAlert,
    CareConsent,
    CareDataRequest,
    CareTimesheet,
    SOSCase,
    SOSEvent,
)
from app.modules.care_retention.retention import (
    purge_notes_for_data_request,
    purge_photo_for_data_request,
)
from app.modules.nurses.models import Device
from app.modules.places.models import CarePlace, PlaceStay
from app.modules.settings.care_service import care_values
from app.modules.settings.rules import resolve_sos_enabled
from app.modules.visits.models import Visit, VisitEvent, VisitNote, VisitPhoto

router = APIRouter(prefix="/admin/care", tags=["care-operations"])


class NoteBody(BaseModel):
    note: str = Field(min_length=3, max_length=500)


class ClientConsentBody(BaseModel):
    type: str = Field(pattern="^(privacy_notice|contact)$")
    version: str = Field(min_length=1, max_length=80)


class ExplainBody(BaseModel):
    explanations: dict[str, str]


class AdjustmentBody(BaseModel):
    minutes: int = Field(ge=-10080, le=10080)
    reason: str = Field(min_length=3, max_length=500)


class SOSBody(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    visit_id: str | None = None
    test: bool = False


async def audit(actor, action, kind, item_id, before=None, after=None):
    await AuditLog(
        action=action, item_type=kind, item_id=item_id, before=before, after=after
    ).insert()


async def _visit_in_reach(visit: Visit | None, ctx: ReachContext) -> bool:
    if visit is None:
        return False
    if ctx.is_superadmin or ctx.reach == "all":
        return True
    if ctx.reach == "own":
        return visit.nurse_id == ctx.user_id
    return visit.nurse_id in ctx.team_nurse_ids or visit.supervisor_id == ctx.user_id


async def _alert_in_reach(alert: CareAlert, ctx: ReachContext) -> bool:
    if ctx.is_superadmin or ctx.reach == "all":
        return True
    if alert.nurse_id:
        if ctx.reach == "own" and alert.nurse_id == ctx.user_id:
            return True
        if ctx.reach == "team" and alert.nurse_id in ctx.team_nurse_ids:
            return True
    if alert.supervisor_id == ctx.user_id:
        return True
    if alert.visit_id:
        return await _visit_in_reach(await Visit.find_one(Visit.id == alert.visit_id), ctx)
    return False


async def _timesheet_in_reach(sheet: CareTimesheet, ctx: ReachContext) -> bool:
    if ctx.is_superadmin or ctx.reach == "all":
        return True
    if ctx.reach == "own":
        return sheet.nurse_id == ctx.user_id
    return sheet.nurse_id in ctx.team_nurse_ids


@router.get("/dashboard")
async def care_dashboard(
    _: Principal = Depends(require_scopes("dashboard:view")),
    ctx: ReachContext = Depends(get_care_actor),
):
    visits = await Visit.find().to_list()
    visits = [v for v in visits if await _visit_in_reach(v, ctx)]
    alerts = await CareAlert.find(CareAlert.status == "open").to_list()
    alerts = [a for a in alerts if await _alert_in_reach(a, ctx)]
    return {
        "visit_counts": {
            status: sum(v.status == status for v in visits)
            for status in ("scheduled", "in_progress", "completed", "cancelled", "missed")
        },
        "open_alerts": len(alerts),
        "critical_alerts": sum(a.severity == "critical" for a in alerts),
        "as_of": datetime.now(UTC),
    }


@router.post("/devices", status_code=201)
async def register_admin_device(
    body: dict, principal: Principal = Depends(require_scopes("alerts:write"))
):
    device_id = str(body.get("device_id", ""))
    platform = str(body.get("platform", "android"))
    push_token = body.get("push_token")
    if (
        len(device_id) < 8
        or platform not in {"android", "ios", "web"}
        or not isinstance(push_token, str)
        or not push_token
    ):
        raise HTTPException(422, detail="Valid device id, platform, and push token are required")
    device = await Device.find_one(Device.device_id == device_id)
    if device and device.revoked_at:
        raise HTTPException(401, detail="device_revoked")
    if device is None:
        device = Device(
            device_id=device_id,
            user_id=principal.user_id,
            platform=platform,
            push_token=push_token,
            push_token_updated_at=datetime.now(UTC),
        )
        await device.insert()
    else:
        device.user_id = principal.user_id
        device.platform = platform
        device.push_token = push_token
        device.push_token_updated_at = datetime.now(UTC)
        await device.save()
    await audit(
        principal,
        "care.device.register",
        "device",
        device_id,
        None,
        {"platform": platform, "push_token_registered": True},
    )
    return {"registered": True, "device_id": device_id}


@router.get("/photos")
async def list_photos(
    principal: Principal = Depends(require_scopes("photos:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    rows = await VisitPhoto.find().sort("-created_at").to_list()
    visits = {v.id: v for v in await Visit.find().to_list()}

    def allowed(photo):
        visit = visits.get(photo.visit_id)
        return (
            photo.status not in {"hidden", "expired"}
            and visit is not None
            and (
                ctx.is_superadmin
                or ctx.reach == "all"
                or (ctx.reach == "own" and visit.nurse_id == ctx.user_id)
                or (
                    ctx.reach == "team"
                    and (visit.nurse_id in ctx.team_nurse_ids or visit.supervisor_id == ctx.user_id)
                )
            )
        )

    items = [
        {
            "id": x.id,
            "visit_id": x.visit_id,
            "nurse_id": x.nurse_id,
            "status": x.status,
            "created_at": x.created_at,
        }
        for x in rows
        if allowed(x)
    ]
    await audit(
        principal,
        "care.photo.list.view.all",
        "visit_photo",
        None,
        None,
        {"visible_photo_count": len(items)},
    )
    return {"items": items}


@router.get("/visits/{visit_id}/photos")
async def visit_photos(
    visit_id: str,
    principal: Principal = Depends(require_scopes("photos:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    visit = await Visit.find_one(Visit.id == visit_id)
    if not await _visit_in_reach(visit, ctx):
        raise HTTPException(status_code=404, detail="Visit not found")
    photos = await VisitPhoto.find(VisitPhoto.visit_id == visit_id).sort("-created_at").to_list()
    items = []
    for photo in photos:
        if photo.status in {"hidden", "expired"}:
            continue
        items.append(
            {
                "id": photo.id,
                "visit_id": photo.visit_id,
                "status": photo.status,
                "created_at": photo.created_at,
                "thumbnail_path": _signed_photo_path(
                    principal.user_id, visit_id, photo.id, "thumbnail"
                ),
                "original_path": _signed_photo_path(
                    principal.user_id, visit_id, photo.id, "original"
                ),
            }
        )
    await audit(
        principal,
        "care.photo.list.view",
        "visit",
        visit_id,
        None,
        {"visible_photo_count": len(items)},
    )
    return {"items": items}


def _signed_photo_path(actor_id: str, visit_id: str, photo_id: str, variant: str) -> dict:
    from urllib.parse import urlencode

    settings = get_settings()
    expires = int(datetime.now(UTC).timestamp()) + 180
    signature = temporary_stream_signature(
        settings,
        actor_id=actor_id,
        visit_id=visit_id,
        photo_id=photo_id,
        variant=variant,
        expires=expires,
    )
    query = urlencode(
        {"actor_id": actor_id, "expires": expires, "signature": signature, "variant": variant}
    )
    return {
        "path": f"/api/v1/admin/care/visits/{visit_id}/photos/{photo_id}/stream?{query}",
        "expires_at": expires,
    }


@router.get("/visits/{visit_id}/photos/{photo_id}/stream")
async def stream_visit_photo(
    visit_id: str,
    photo_id: str,
    actor_id: str,
    expires: int,
    signature: str,
    variant: str = Query("original", pattern="^(thumbnail|original)$"),
):
    # Short-lived proxy. Every actual delivery is audited and hidden photos fail closed.
    settings = get_settings()
    now = int(datetime.now(UTC).timestamp())
    if not verify_temporary_stream_signature(
        settings,
        actor_id=actor_id,
        visit_id=visit_id,
        photo_id=photo_id,
        variant=variant,
        expires=expires,
        signature=signature,
        now=now,
    ):
        raise HTTPException(status_code=403, detail="Photo link is invalid or expired")
    photo = await VisitPhoto.find_one(VisitPhoto.id == photo_id, VisitPhoto.visit_id == visit_id)
    visit = await Visit.find_one(Visit.id == visit_id)
    if not photo or not visit or photo.status in {"hidden", "expired"}:
        raise HTTPException(status_code=404, detail="Photo not found")
    if photo.delivery_type not in {"upload", "private"}:
        raise HTTPException(status_code=404, detail="Photo not found")
    try:
        url = signed_delivery_url(
            settings,
            photo.cloudinary_public_id,
            delivery_type=photo.delivery_type,
            thumbnail=variant == "thumbnail",
        )
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            response = await client.get(url)
        if response.status_code != 200:
            raise HTTPException(
                status_code=502, detail="Photo provider could not deliver this image"
            )
        media_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
        if (
            media_type not in {"image/jpeg", "image/png", "image/webp"}
            or len(response.content) > 20_000_000
        ):
            raise HTTPException(
                status_code=502, detail="Photo provider returned an unsupported image"
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Photo provider request failed") from exc
    await AuditLog(
        action="care.photo.view",
        item_type="visit_photo",
        item_id=photo_id,
        after={
            "actor_id": actor_id,
            "visit_id": visit_id,
            "variant": variant,
            "expires_at": expires,
        },
    ).insert()
    return Response(
        content=response.content,
        media_type=media_type,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/alerts")
async def alerts(
    status: str = "open",
    _: Principal = Depends(require_scopes("alerts:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    rows = await CareAlert.find(CareAlert.status == status).sort("-raised_at").to_list()
    visits = {v.id: v for v in await Visit.find().to_list()}

    def in_reach(a):
        v = visits.get(a.visit_id or "")
        return (
            ctx.is_superadmin
            or ctx.reach == "all"
            or (
                a.nurse_id == ctx.user_id
                if ctx.reach == "own"
                else a.nurse_id in ctx.team_nurse_ids or (v and v.supervisor_id == ctx.user_id)
            )
        )

    return {"items": [a for a in rows if in_reach(a)]}


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    principal: Principal = Depends(require_scopes("alerts:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await CareAlert.find_one(CareAlert.id == alert_id)
    if not row or not await _alert_in_reach(row, ctx):
        raise HTTPException(404, detail="Alert not found")
    row.status = "acknowledged"
    row.acknowledged_at = datetime.now(UTC)
    row.acknowledged_by = principal.user_id
    row.history.append(
        {"action": "acknowledged", "by": principal.user_id, "at": row.acknowledged_at.isoformat()}
    )
    await row.save()
    await audit(
        principal, "care.alert.acknowledge", "care_alert", alert_id, None, {"status": row.status}
    )
    return row


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    body: NoteBody,
    principal: Principal = Depends(require_scopes("alerts:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await CareAlert.find_one(CareAlert.id == alert_id)
    if not row or not await _alert_in_reach(row, ctx):
        raise HTTPException(404, detail="Alert not found")
    row.status = "resolved"
    row.resolved_at = datetime.now(UTC)
    row.resolved_by = principal.user_id
    row.history.append(
        {
            "action": "resolved",
            "by": principal.user_id,
            "at": row.resolved_at.isoformat(),
            "note": body.note,
        }
    )
    await row.save()
    await audit(
        principal,
        "care.alert.resolve",
        "care_alert",
        alert_id,
        None,
        {"status": row.status, "note": body.note},
    )
    return row


@router.get("/timesheets")
async def timesheets(
    _: Principal = Depends(require_scopes("timesheets:read")),
    ctx: ReachContext = Depends(get_care_actor),
    nurse_id: str | None = None,
    status: str | None = None,
):
    rows = await CareTimesheet.find().to_list()
    rows = [
        x
        for x in rows
        if await _timesheet_in_reach(x, ctx)
        and (not nurse_id or x.nurse_id == nurse_id)
        and (not status or x.status == status)
    ]
    return {"items": rows}


@router.post("/timesheets/{sheet_id}/submit")
async def submit_timesheet(
    sheet_id: str,
    body: ExplainBody,
    principal: Principal = Depends(require_scopes("timesheets:write")),
):
    row = await CareTimesheet.find_one(
        CareTimesheet.id == sheet_id, CareTimesheet.nurse_id == principal.user_id
    )
    if not row:
        raise HTTPException(404, detail="Timesheet not found")
    if row.status not in {"draft", "sent_back"}:
        raise HTTPException(409, detail="Timesheet cannot be submitted in its current state")
    missing = set(row.issue_ids) - {k for k, v in body.explanations.items() if v.strip()}
    if missing:
        raise HTTPException(
            422, detail={"code": "issues_need_explanation", "issue_ids": sorted(missing)}
        )
    row.explained_issues = body.explanations
    row.status = "submitted"
    row.submitted_at = datetime.now(UTC)
    await row.save()
    await audit(
        principal, "care.timesheet.submit", "care_timesheet", sheet_id, None, {"status": row.status}
    )
    return row


@router.post("/timesheets/{sheet_id}/approve")
async def approve_timesheet(
    sheet_id: str,
    principal: Principal = Depends(require_scopes("timesheets:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await CareTimesheet.find_one(CareTimesheet.id == sheet_id)
    if not row or not await _timesheet_in_reach(row, ctx):
        raise HTTPException(404, detail="Timesheet not found")
    if row.status != "submitted":
        raise HTTPException(409, detail="Only submitted timesheets can be approved")
    row.status = "approved"
    row.approved_at = datetime.now(UTC)
    row.approved_by = principal.user_id
    await row.save()
    await audit(
        principal,
        "care.timesheet.approve",
        "care_timesheet",
        sheet_id,
        None,
        {"status": row.status},
    )
    return row


@router.post("/timesheets/{sheet_id}/send-back")
async def send_back_timesheet(
    sheet_id: str,
    body: NoteBody,
    principal: Principal = Depends(require_scopes("timesheets:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await CareTimesheet.find_one(CareTimesheet.id == sheet_id)
    if not row or not await _timesheet_in_reach(row, ctx):
        raise HTTPException(404, detail="Timesheet not found")
    if row.status != "submitted":
        raise HTTPException(409, detail="Only submitted timesheets can be sent back")
    row.status = "sent_back"
    row.sent_back_reason = body.note
    await row.save()
    await audit(
        principal,
        "care.timesheet.send_back",
        "care_timesheet",
        sheet_id,
        None,
        {"reason": body.note},
    )
    return row


@router.post("/timesheets/{sheet_id}/adjust")
async def adjust_timesheet(
    sheet_id: str,
    body: AdjustmentBody,
    principal: Principal = Depends(require_scopes("timesheets:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await CareTimesheet.find_one(CareTimesheet.id == sheet_id)
    if not row or not await _timesheet_in_reach(row, ctx):
        raise HTTPException(404, detail="Timesheet not found")
    if row.status == "approved":
        raise HTTPException(409, detail="Approved timesheets are locked")
    row.adjustments.append(
        {
            "minutes": body.minutes,
            "reason": body.reason,
            "by": principal.user_id,
            "at": datetime.now(UTC).isoformat(),
        }
    )
    row.total_minutes = max(0, row.total_minutes + body.minutes)
    await row.save()
    await audit(
        principal,
        "care.timesheet.adjust",
        "care_timesheet",
        sheet_id,
        None,
        {"minutes": body.minutes, "reason": body.reason},
    )
    return row


@router.get("/timesheets/{sheet_id}/export")
async def export_timesheet(
    sheet_id: str,
    principal: Principal = Depends(require_scopes("timesheets:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await CareTimesheet.find_one(CareTimesheet.id == sheet_id)
    if not row or not await _timesheet_in_reach(row, ctx):
        raise HTTPException(404, detail="Timesheet not found")
    if row.status != "approved":
        raise HTTPException(409, detail="Only approved timesheets may be exported")
    await audit(
        principal, "care.timesheet.export", "care_timesheet", sheet_id, None, {"status": "approved"}
    )
    return {
        "id": row.id,
        "nurse_id": row.nurse_id,
        "period_start": row.period_start,
        "period_end": row.period_end,
        "completed_visits": row.completed_visits,
        "total_minutes": row.total_minutes,
        "status": row.status,
    }


@router.post("/photos/{photo_id}/hide")
async def hide_photo(
    photo_id: str,
    body: NoteBody,
    principal: Principal = Depends(require_scopes("photos:hide")),
    ctx: ReachContext = Depends(get_care_actor),
):
    photo = await VisitPhoto.find_one(VisitPhoto.id == photo_id)
    visit = await Visit.find_one(Visit.id == photo.visit_id) if photo else None
    if not photo or not await _visit_in_reach(visit, ctx):
        raise HTTPException(404, detail="Photo not found")
    before = {"status": photo.status}
    photo.status = "hidden"
    photo.hidden_at = datetime.now(UTC)
    photo.hidden_by = principal.user_id
    photo.hidden_reason = body.note
    await photo.save()
    await audit(
        principal,
        "care.photo.hide",
        "visit_photo",
        photo_id,
        before,
        {"status": "hidden", "reason": body.note},
    )
    return {"id": photo_id, "status": "hidden"}


@router.post("/sos/test-sms")
async def test_sos_sms(principal: Principal = Depends(require_scopes("carecfg:write"))):
    from app.modules.care_ops.dispatch import send_test_sos_sms

    sent = await send_test_sos_sms()
    await audit(principal, "care.sos.test_sms", "sms_test", None, None, {"sent": sent})
    if not sent:
        raise HTTPException(
            422, detail="A valid sms.test_number and enabled staff SMS provider are required"
        )
    return {"sent": True, "test": True}


@router.post("/sos", status_code=201)
async def create_sos(body: SOSBody, principal: Principal = Depends(require_scopes("sos:send"))):
    settings = get_settings()
    values = await care_values()
    sos_enabled, disabled_reason = resolve_sos_enabled(values)
    if not values.get("care.module_c_enabled") or not sos_enabled:
        raise HTTPException(
            409,
            detail={
                "code": "sos_disabled",
                "reason": disabled_reason or "SOS module is not enabled",
            },
        )
    case = SOSCase(
        id=body.id,
        nurse_id=principal.user_id,
        visit_id=body.visit_id,
        test=body.test,
        events=[{"type": "sent", "at": datetime.now(UTC).isoformat(), "by": principal.user_id}],
    )
    await case.insert()
    await SOSEvent(
        id=f"{case.id}:sent", case_id=case.id, type="sent", actor_id=principal.user_id
    ).insert()
    alert_id = f"sos:{case.id}"
    await CareAlert(
        id=alert_id,
        type="sos",
        severity="critical",
        visit_id=body.visit_id,
        nurse_id=principal.user_id,
        message="A staff safety alert needs a response.",
        history=[{"action": "raised", "at": datetime.now(UTC).isoformat()}],
    ).insert()
    await audit(
        principal,
        "care.sos.send",
        "sos_case",
        case.id,
        None,
        {"status": case.status, "test": case.test},
    )
    await notify_sos(case)
    return {
        "id": case.id,
        "status": case.status,
        "sent": True,
        "sms_configured": bool(settings.sms_provider and settings.sms_staff_enabled),
    }


@router.get("/sos")
async def list_sos(
    _: Principal = Depends(require_scopes("alerts:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    cases = await SOSCase.find().sort("-created_at").to_list()
    return {
        "items": [
            case
            for case in cases
            if ctx.is_superadmin
            or ctx.reach == "all"
            or (
                case.nurse_id == ctx.user_id
                if ctx.reach == "own"
                else case.nurse_id in ctx.team_nurse_ids
            )
        ]
    }


@router.post("/sos/{case_id}/acknowledge")
async def acknowledge_sos(
    case_id: str,
    principal: Principal = Depends(require_scopes("alerts:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    case = await SOSCase.find_one(SOSCase.id == case_id)
    if not case or not (
        ctx.is_superadmin
        or ctx.reach == "all"
        or (
            case.nurse_id == ctx.user_id
            if ctx.reach == "own"
            else case.nurse_id in ctx.team_nurse_ids
        )
    ):
        raise HTTPException(404, detail="SOS case not found")
    case.status = "acknowledged"
    case.acknowledged_at = datetime.now(UTC)
    case.acknowledged_by = principal.user_id
    case.events.append(
        {"type": "acknowledged", "at": case.acknowledged_at.isoformat(), "by": principal.user_id}
    )
    await case.save()
    await SOSEvent(
        id=f"{case_id}:ack:{int(case.acknowledged_at.timestamp())}",
        case_id=case_id,
        type="acknowledged",
        actor_id=principal.user_id,
    ).insert()
    await audit(
        principal, "care.sos.acknowledge", "sos_case", case_id, None, {"status": case.status}
    )
    return case


@router.get("/data-requests")
async def data_requests(_: Principal = Depends(require_scopes("system:manage"))):
    return {"items": await CareDataRequest.find().sort("-created_at").to_list()}


@router.post("/data-requests", status_code=201)
async def create_data_request(
    body: dict, principal: Principal = Depends(require_scopes("system:manage"))
):
    row = CareDataRequest(
        id=body["id"],
        subject_id=body["subject_id"],
        request_type=body["request_type"],
        requested_by=principal.user_id,
    )
    await row.insert()
    await audit(principal, "care.data_request.create", "care_data_request", row.id, None, body)
    return row


@router.post("/clients/{client_id}/consents", status_code=201)
async def record_client_consent(
    client_id: str,
    body: ClientConsentBody,
    principal: Principal = Depends(require_scopes("clients:write")),
):
    client = await CareClient.find_one(CareClient.id == client_id)
    if client is None:
        raise HTTPException(404, detail="Client not found")
    consent_id = f"client:{client_id}:{body.type}:{body.version}"
    existing = await CareConsent.find_one(CareConsent.id == consent_id)
    if existing:
        return {
            "id": existing.id,
            "client_id": client_id,
            "type": existing.type,
            "version": existing.version,
            "accepted_at": existing.accepted_at,
            "duplicate": True,
        }
    row = CareConsent(
        id=consent_id,
        user_id=principal.user_id,
        client_id=client_id,
        type=body.type,
        version=body.version,
        source="staff_recorded",
    )
    await row.insert()
    await audit(
        principal,
        "care.client.consent.record",
        "care_consent",
        consent_id,
        None,
        {"client_id": client_id, "type": body.type, "version": body.version},
    )
    return {
        "id": row.id,
        "client_id": client_id,
        "type": row.type,
        "version": row.version,
        "accepted_at": row.accepted_at,
        "duplicate": False,
    }


@router.get("/data-requests/clients/{client_id}/export")
async def export_client_data(
    client_id: str, principal: Principal = Depends(require_scopes("system:manage"))
):
    # Export the care records held for a client and audit the access.
    client = await CareClient.find_one(CareClient.id == client_id)
    if client is None:
        raise HTTPException(404, detail="Client not found")
    places = await CarePlace.find(CarePlace.client_id == client_id).to_list()
    stays = await PlaceStay.find(PlaceStay.client_id == client_id).to_list()
    visits = await Visit.find(Visit.client_id == client_id).to_list()
    visit_ids = [visit.id for visit in visits]
    notes = await VisitNote.find({"visit_id": {"$in": visit_ids}}).to_list() if visit_ids else []
    events = await VisitEvent.find({"visit_id": {"$in": visit_ids}}).to_list() if visit_ids else []
    photos = await VisitPhoto.find({"visit_id": {"$in": visit_ids}}).to_list() if visit_ids else []
    consents = await CareConsent.find(CareConsent.client_id == client_id).to_list()
    payload = {
        "client": client.model_dump(mode="json", exclude={"_id"}),
        "places": [row.model_dump(mode="json", exclude={"_id"}) for row in places],
        "stays": [row.model_dump(mode="json", exclude={"_id"}) for row in stays],
        "visits": [row.model_dump(mode="json", exclude={"_id"}) for row in visits],
        "visit_notes": [row.model_dump(mode="json", exclude={"_id"}) for row in notes],
        "visit_events": [row.model_dump(mode="json", exclude={"_id"}) for row in events],
        "photo_metadata": [row.model_dump(mode="json", exclude={"_id"}) for row in photos],
        "consents": [row.model_dump(mode="json", exclude={"_id"}) for row in consents],
        "exported_at": datetime.now(UTC).isoformat(),
    }
    await audit(
        principal,
        "care.data_subject.export",
        "care_client",
        client_id,
        None,
        {"place_count": len(places), "visit_count": len(visits), "photo_count": len(photos)},
    )
    return payload


@router.post("/data-requests/clients/{client_id}/anonymise")
async def anonymise_client_data(
    client_id: str, principal: Principal = Depends(require_scopes("system:manage"))
):
    # Anonymise the client profile and remove associated photo assets.
    settings = get_settings()
    client = await CareClient.find_one(CareClient.id == client_id)
    if client is None:
        raise HTTPException(404, detail="Client not found")
    visits = await Visit.find(Visit.client_id == client_id).to_list()
    visit_ids = [visit.id for visit in visits]
    photos = await VisitPhoto.find({"visit_id": {"$in": visit_ids}}).to_list() if visit_ids else []
    if photos and not (
        settings.cloudinary_cloud_name
        and settings.cloudinary_api_key
        and settings.cloudinary_api_secret
    ):
        raise HTTPException(
            503, detail="Photo storage is not configured; no client data was changed"
        )
    try:
        for photo in photos:
            await purge_photo_for_data_request(photo, settings)
    except Exception as exc:
        raise HTTPException(
            503,
            detail="Photo deletion is incomplete; retry the request after checking photo storage",
        ) from exc
    try:
        cleared_visit_notes = await purge_notes_for_data_request(visit_ids)
    except Exception as exc:
        raise HTTPException(
            503,
            detail="Visit notes could not be cleared; check the care database and retry",
        ) from exc
    before = {
        "display_name": client.display_name,
        "notes_for_nurse": client.notes_for_nurse,
        "status": client.status,
    }
    client.display_name = "Removed client"
    client.notes_for_nurse = ""
    client.status = "anonymised"
    client.assigned_nurse_ids = []
    client.supervisor_id = None
    client.photo_allowed = False
    client.updated_at = datetime.now(UTC)
    await client.save()
    await audit(
        principal,
        "care.data_subject.anonymise",
        "care_client",
        client_id,
        before,
        {
            "display_name": "Removed client",
            "notes_cleared": True,
            "visit_notes_cleared": cleared_visit_notes,
            "photos_deleted": len(photos),
        },
    )
    return {
        "client_id": client_id,
        "status": "anonymised",
        "photos_deleted": len(photos),
        "visit_notes_cleared": cleared_visit_notes,
        "notes_cleared": True,
    }


@router.get("/ops/status")
async def ops_status(_: Principal = Depends(require_scopes("system:manage"))):
    settings = get_settings()
    return {
        "database_configured": bool(settings.care_mongodb_uri or settings.mongodb_uri),
        "b2_configured": bool(
            settings.b2_endpoint
            and settings.b2_key
            and settings.b2_secret
            and settings.backup_bucket
        ),
        "photo_storage_configured": bool(
            settings.cloudinary_cloud_name
            and settings.cloudinary_api_key
            and settings.cloudinary_api_secret
        ),
        "push_sender": settings.push_sender,
        "restore_test_status": "owner-maintained care setting",
    }
