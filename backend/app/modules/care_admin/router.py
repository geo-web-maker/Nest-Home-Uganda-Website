"""Admin care API. Every write is scoped and audited; reach is server-derived."""

import csv
import io
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.db import get_care_database, start_session
from app.core.deps import Principal, ReachContext, get_care_actor, require_scopes
from app.core.errors import Conflict
from app.modules.audit.models import AuditLog
from app.modules.care_clients.models import CareClient
from app.modules.care_ops.procedure import approved_procedure_error
from app.modules.flags.models import VisitFlag
from app.modules.nurses.models import NurseProfile
from app.modules.places.models import CarePlace, PlaceStay
from app.modules.settings.care_keys import CARE_SETTINGS
from app.modules.settings.care_service import (
    care_setting_sources,
    care_values,
    reset_care_value,
    save_care_value,
)
from app.modules.settings.rules import resolve_sos_enabled
from app.modules.visits.models import (
    Visit,
    VisitAnnotation,
    VisitEvent,
    VisitNote,
    VisitPhoto,
    VisitSyncTombstone,
)
from app.modules.visits.rules import VisitRuleError, make_snapshot, validate_schedule

router = APIRouter(prefix="/admin/care", tags=["admin-care"])


class ClientIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    display_name: str = Field(min_length=1, max_length=120)
    notes_for_nurse: str = Field(default="", max_length=280)
    supervisor_id: str | None = None
    assigned_nurse_ids: list[str] = Field(default_factory=list)
    photo_allowed: bool = False
    photo_required: str | None = Field(
        default=None, pattern=r"^(none|arrival|departure|either|both)$"
    )
    photo_guidance_text: str | None = Field(default=None, max_length=2000)


class PlaceIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    label: str = Field(default="Home", max_length=80)
    address_text: str = Field(min_length=1, max_length=300)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=150, ge=50, le=1000)
    is_primary: bool = False


class StayIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    place_id: str = Field(min_length=8, max_length=160)
    starts_on: date


class VisitIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    client_id: str
    nurse_id: str
    place_id: str
    scheduled_start: datetime
    scheduled_end: datetime
    instructions: str = Field(default="", max_length=1000)
    confirm_overlap: bool = False
    adhoc: bool = False


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class AnnotateIn(BaseModel):
    comment: str = Field(min_length=3, max_length=1000)


class SettingIn(BaseModel):
    value: object


async def _audit(actor, action, kind, item_id, before=None, after=None):
    await AuditLog(
        action=action, item_type=kind, item_id=item_id, before=before, after=after
    ).insert()


async def _client_reachable(client, ctx):
    if ctx.is_superadmin or ctx.reach == "all":
        return True
    if ctx.reach == "team":
        return client.supervisor_id == ctx.user_id or bool(
            set(client.assigned_nurse_ids) & set(ctx.team_nurse_ids)
        )
    return ctx.user_id in client.assigned_nurse_ids


async def _visit_reachable(visit, ctx):
    return (
        ctx.is_superadmin
        or ctx.reach == "all"
        or (ctx.reach == "own" and visit.nurse_id == ctx.user_id)
        or (
            ctx.reach == "team"
            and (visit.nurse_id in ctx.team_nurse_ids or visit.supervisor_id == ctx.user_id)
        )
    )


@router.get("/readiness")
async def readiness(_: Principal = Depends(require_scopes("carecfg:read"))):
    values = await care_values()
    sos, reason = resolve_sos_enabled(values)
    checks = []
    for key, spec in CARE_SETTINGS.items():
        if not spec.required_before_go_live:
            continue
        value = values.get(key, spec.default)
        status = (
            "set"
            if value not in ("", None, [], False)
            else ("default" if spec.default not in ("", None, [], False) else "missing")
        )
        if key.startswith("sos.") and key == "sos.enabled" and not sos:
            status = "missing"
        checks.append(
            {
                "id": key,
                "label": key.replace(".", " ").replace("_", " ").title(),
                "blocking": spec.required_before_go_live,
                "status": status,
                "detail": reason if key == "sos.enabled" else "",
            }
        )
    profiles = await NurseProfile.find().to_list()
    supervisors = {p.supervisor_id for p in profiles if p.supervisor_id}
    checks.append(
        {
            "id": "team.supervisor_and_nurse",
            "label": "At least one supervisor has a nurse",
            "blocking": True,
            "status": "set" if supervisors else "missing",
            "detail": "",
        }
    )
    if values.get("care.module_c_enabled"):
        for key, label, ready in [
            (
                "sos.responder_configured",
                "SOS responder configured",
                bool(values.get("sos.responder_configured")),
            ),
            ("sms.enabled", "SMS enabled for SOS", bool(values.get("sms.enabled"))),
            (
                "sos.emergency_numbers",
                "Emergency numbers supplied",
                bool(values.get("sos.emergency_numbers")),
            ),
            (
                "frontend_url",
                "Secure acknowledgement base URL configured",
                bool(get_settings().frontend_url),
            ),
        ]:
            checks.append(
                {
                    "id": key,
                    "label": label,
                    "blocking": True,
                    "status": "set" if ready else "missing",
                    "detail": "",
                }
            )
    return {
        "ready": all(not c["blocking"] or c["status"] == "set" for c in checks),
        "items": checks,
    }


@router.get("/settings")
async def list_settings(_: Principal = Depends(require_scopes("carecfg:read"))):
    values = await care_values()
    sources = await care_setting_sources()
    return {
        "items": [
            {
                "id": k,
                "type": s.type,
                "value": values[k],
                "default": s.default,
                "source": sources[k],
                "required_before_go_live": s.required_before_go_live,
                "overridable_at": list(s.overridable_at),
                "group": s.group,
            }
            for k, s in CARE_SETTINGS.items()
        ]
    }


@router.put("/settings/{key}")
async def update_setting(
    key: str, payload: SettingIn, principal: Principal = Depends(require_scopes("carecfg:write"))
):
    # The responder rota affects live safety notifications. Only system managers may change
    # an activated/approved schedule; care editors can still prepare an inactive draft.
    if key == "sos.on_call_roster" and isinstance(payload.value, dict):
        current_values = await care_values()
        current_roster = current_values.get("sos.on_call_roster", {})
        current_active = isinstance(current_roster, dict) and (
            current_roster.get("enabled") is True or current_roster.get("approved") is True
        )
        next_active = payload.value.get("enabled") is True or payload.value.get("approved") is True
        if (current_active or next_active) and not principal.has("system:manage"):
            raise HTTPException(
                403, detail="Changing an active or approved on-call schedule requires system:manage"
            )
    if key == "sos.procedure" and isinstance(payload.value, str):
        approval_error = approved_procedure_error(payload.value)
        if approval_error:
            if not principal.has("system:manage"):
                raise HTTPException(
                    403, detail="Approving the SOS procedure requires system:manage"
                )
            raise HTTPException(422, detail=approval_error)
        if "Status: APPROVED BY DESIGNATED OWNER" in payload.value and not principal.has(
            "system:manage"
        ):
            raise HTTPException(403, detail="Approving the SOS procedure requires system:manage")
    try:
        result = await save_care_value(key, payload.value, principal.user_id)
    except KeyError:
        raise HTTPException(404, detail="Unknown care setting") from None
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    return result


@router.delete("/settings/{key}")
async def reset_setting(key: str, principal: Principal = Depends(require_scopes("carecfg:write"))):
    try:
        return await reset_care_value(key, principal.user_id)
    except KeyError:
        raise HTTPException(404, detail="Unknown care setting") from None


@router.get("/clients")
async def clients(
    _: Principal = Depends(require_scopes("clients:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    rows = await CareClient.find().to_list()
    rows = [c for c in rows if await _client_reachable(c, ctx)]
    return {"items": [c.model_dump(exclude={"_id"}) for c in rows], "total": len(rows)}


@router.post("/clients", status_code=201)
async def create_client(
    body: ClientIn, principal: Principal = Depends(require_scopes("clients:write"))
):
    row = CareClient(**body.model_dump())
    await row.insert()
    await _audit(principal, "care.client.create", "care_client", row.id, None, body.model_dump())
    return row


@router.get("/clients/{client_id}")
async def get_client(
    client_id: str,
    _: Principal = Depends(require_scopes("clients:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await CareClient.find_one(CareClient.id == client_id)
    if not row or not await _client_reachable(row, ctx):
        raise HTTPException(404, detail="Client not found")
    return row


@router.patch("/clients/{client_id}")
async def patch_client(
    client_id: str,
    body: dict,
    principal: Principal = Depends(require_scopes("clients:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await CareClient.find_one(CareClient.id == client_id)
    if not row or not await _client_reachable(row, ctx):
        raise HTTPException(404, detail="Client not found")
    before = row.model_dump()
    allowed = {
        "display_name",
        "notes_for_nurse",
        "status",
        "assigned_nurse_ids",
        "supervisor_id",
        "photo_allowed",
        "photo_required",
        "photo_guidance_text",
    }
    for key, value in body.items():
        if key not in allowed:
            continue
        if key == "photo_guidance_text" and value is not None:
            if not isinstance(value, str) or len(value) > 2000:
                raise HTTPException(
                    422, detail="photo_guidance_text must be text of at most 2000 characters"
                )
        if key == "photo_required" and value is not None:
            if not isinstance(value, str) or value not in {
                "none",
                "arrival",
                "departure",
                "either",
                "both",
            }:
                raise HTTPException(
                    422, detail="photo_required must be none, arrival, departure, either, or both"
                )
        setattr(row, key, value)
    row.updated_at = datetime.now(UTC)
    await row.save()
    await _audit(
        principal, "care.client.update", "care_client", client_id, before, row.model_dump()
    )
    return row


@router.get("/clients/{client_id}/places")
async def client_places(
    client_id: str,
    _: Principal = Depends(require_scopes("places:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    client = await CareClient.find_one(CareClient.id == client_id)
    if not client or not await _client_reachable(client, ctx):
        raise HTTPException(404, detail="Client not found")
    return {"items": await CarePlace.find(CarePlace.client_id == client_id).to_list()}


@router.post("/clients/{client_id}/places", status_code=201)
async def create_place(
    client_id: str,
    body: PlaceIn,
    principal: Principal = Depends(require_scopes("places:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    client = await CareClient.find_one(CareClient.id == client_id)
    if not client or not await _client_reachable(client, ctx):
        raise HTTPException(404, detail="Client not found")
    row = CarePlace(
        id=body.id,
        client_id=client_id,
        **body.model_dump(exclude={"id"}),
        geo={"type": "Point", "coordinates": [body.lng, body.lat]},
    )
    await row.insert()
    await _audit(principal, "care.place.create", "care_place", row.id, None, body.model_dump())
    return row


@router.patch("/places/{place_id}")
async def patch_place(
    place_id: str,
    body: dict,
    principal: Principal = Depends(require_scopes("clients:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await CarePlace.find_one(CarePlace.id == place_id)
    if not row:
        raise HTTPException(404, detail="Place not found")
    client = await CareClient.find_one(CareClient.id == row.client_id)
    if not client or not await _client_reachable(client, ctx):
        raise HTTPException(404, detail="Place not found")
    before = row.model_dump()
    for key in ("label", "address_text", "lat", "lng", "radius_m", "is_primary"):
        if key in body:
            setattr(row, key, body[key])
    row.geo = {"type": "Point", "coordinates": [row.lng, row.lat]}
    await row.save()
    await _audit(principal, "care.place.update", "care_place", place_id, before, row.model_dump())
    return row


@router.get("/clients/{client_id}/stays")
async def client_stays(
    client_id: str,
    _: Principal = Depends(require_scopes("clients:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    client = await CareClient.find_one(CareClient.id == client_id)
    if not client or not await _client_reachable(client, ctx):
        raise HTTPException(404, detail="Client not found")
    return {"items": await PlaceStay.find(PlaceStay.client_id == client_id).to_list()}


@router.post("/clients/{client_id}/stays", status_code=201)
async def move_client(
    client_id: str,
    body: StayIn,
    principal: Principal = Depends(require_scopes("clients:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    client = await CareClient.find_one(CareClient.id == client_id)
    if not client or not await _client_reachable(client, ctx):
        raise HTTPException(404, detail="Client not found")
    place = await CarePlace.find_one(
        CarePlace.id == body.place_id, CarePlace.client_id == client_id
    )
    if not place:
        raise HTTPException(422, detail="Place must belong to the selected client")
    starts_on = body.starts_on.isoformat()
    open_stays = await PlaceStay.find(
        PlaceStay.client_id == client_id,
        PlaceStay.ends_on == None,  # noqa: E711
    ).to_list()
    if any(stay.starts_on >= starts_on for stay in open_stays):
        raise HTTPException(422, detail="A new stay must start after the current stay begins")
    row = PlaceStay(
        id=body.id, client_id=client_id, place_id=body.place_id, starts_on=starts_on, ends_on=None
    )
    db = get_care_database()
    async with await start_session(db) as session:

        async def write_transaction(active_session):
            for stay in open_stays:
                stay.ends_on = (body.starts_on - timedelta(days=1)).isoformat()
                await stay.save(session=active_session)
            await row.insert(session=active_session)

        await session.with_transaction(write_transaction)
    await _audit(
        principal, "care.client.move", "place_stay", row.id, None, body.model_dump(mode="json")
    )
    return row


@router.get("/visits")
async def visits(
    _: Principal = Depends(require_scopes("visits:read")),
    ctx: ReachContext = Depends(get_care_actor),
    status: str | None = None,
    nurse_id: str | None = None,
    client_id: str | None = None,
    adhoc: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    rows = await Visit.find().sort("-scheduled_start").to_list()
    rows = [
        v
        for v in rows
        if await _visit_reachable(v, ctx)
        and (not status or v.status == status)
        and (not nurse_id or v.nurse_id == nurse_id)
        and (not client_id or v.client_id == client_id)
        and (adhoc is None or v.adhoc == adhoc)
    ]
    page_rows = rows[(page - 1) * page_size : page * page_size]
    page_ids = [visit.id for visit in page_rows]
    latest_event_by_visit = {}
    if page_ids:
        # Enrich only the current, already-reach-filtered page. The event query is
        # deliberately scoped to those visit IDs and the UI never sees unrelated events.
        events = (
            await VisitEvent.find(VisitEvent.visit_id.in_(page_ids)).sort("-received_at").to_list()
        )
        for event in events:
            if event.result != "accepted" or event.visit_id in latest_event_by_visit:
                continue
            latest_event_by_visit[event.visit_id] = event
    items = []
    for visit in page_rows:
        item = visit.model_dump(exclude={"_id"})
        event = latest_event_by_visit.get(visit.id)
        item.update(
            {
                "latest_verification": event.verification if event else None,
                "last_event_at": event.received_at if event else None,
                "last_event_type": event.type if event else None,
                "last_event_distance_m": event.distance_m if event else None,
                "last_event_accuracy_m": event.accuracy_m if event else None,
            }
        )
        items.append(item)
    return {
        "items": items,
        "total": len(rows),
        "page": page,
        "page_size": page_size,
    }


@router.post("/visits", status_code=201)
async def create_visit(
    body: VisitIn,
    principal: Principal = Depends(require_scopes("visits:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    client = await CareClient.find_one(CareClient.id == body.client_id)
    place = await CarePlace.find_one(CarePlace.id == body.place_id)
    profile = await NurseProfile.find_one(NurseProfile.user_id == body.nurse_id)
    if (
        not client
        or not place
        or not profile
        or not profile.active
        or not await _client_reachable(client, ctx)
    ):
        raise HTTPException(404, detail="Client, place, or nurse not found in reach")
    if place.client_id != client.id:
        raise HTTPException(422, detail="Place must belong to the client")
    if body.nurse_id not in client.assigned_nurse_ids:
        raise HTTPException(422, detail="Nurse must be assigned to this client")
    existing = await Visit.find(Visit.nurse_id == body.nurse_id).to_list()
    try:
        clashes = validate_schedule(
            body.scheduled_start,
            body.scheduled_end,
            body.client_id,
            {"client_id": place.client_id},
            body.nurse_id,
            [v.model_dump() for v in existing],
            body.confirm_overlap,
        )
    except VisitRuleError as exc:
        msg = str(exc)
        if msg.startswith("nurse_busy:"):
            raise Conflict(
                "This nurse has an overlapping scheduled visit.",
                {"code": "nurse_busy", "visit_ids": msg.split(":", 1)[1]},
            ) from exc
        raise HTTPException(422, detail=msg) from exc
    row = Visit(
        id=body.id,
        client_id=body.client_id,
        nurse_id=body.nurse_id,
        supervisor_id=profile.supervisor_id,
        place_id=place.id,
        scheduled_start=body.scheduled_start,
        scheduled_end=body.scheduled_end,
        instructions=body.instructions,
        adhoc=body.adhoc,
        place_snapshot=make_snapshot(place.model_dump()),
    )
    await row.insert()
    after = body.model_dump()
    if clashes:  # a supervisor confirmed an overlap: keep who it overlapped with
        after["overlap_confirmed_with"] = clashes
    await _audit(principal, "care.visit.create", "visit", row.id, None, after)
    return row


@router.get("/visits/{visit_id}")
async def visit_detail(
    visit_id: str,
    _: Principal = Depends(require_scopes("visits:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await Visit.find_one(Visit.id == visit_id)
    if not row or not await _visit_reachable(row, ctx):
        raise HTTPException(404, detail="Visit not found")
    return {
        "visit": row,
        "events": await VisitEvent.find(VisitEvent.visit_id == visit_id).to_list(),
        "notes": await VisitNote.find(VisitNote.visit_id == visit_id).to_list(),
        "flags": await VisitFlag.find(VisitFlag.visit_id == visit_id).to_list(),
        # Return metadata only. Permanent storage identifiers must stay server-side;
        # actual image bytes are served by the signed, audited photo-stream endpoint.
        "photos": [
            {
                "id": photo.id,
                "visit_id": photo.visit_id,
                "nurse_id": photo.nurse_id,
                "photo_type": photo.photo_type,
                "status": photo.status,
                "created_at": photo.created_at,
                "hidden_at": photo.hidden_at,
            }
            for photo in await VisitPhoto.find(VisitPhoto.visit_id == visit_id).to_list()
        ],
        "annotations": await VisitAnnotation.find(VisitAnnotation.visit_id == visit_id).to_list(),
        "audit": await AuditLog.find(AuditLog.item_id == visit_id).sort("-at").to_list(),
    }


@router.patch("/visits/{visit_id}")
async def patch_visit(
    visit_id: str,
    body: dict,
    principal: Principal = Depends(require_scopes("visits:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await Visit.find_one(Visit.id == visit_id)
    if not row or not await _visit_reachable(row, ctx):
        raise HTTPException(404, detail="Visit not found")
    if row.status != "scheduled":
        raise HTTPException(409, detail="Only scheduled visits can be changed")
    before = row.model_dump()
    previous_nurse_id = row.nurse_id
    if "nurse_id" in body:
        profile = await NurseProfile.find_one(NurseProfile.user_id == str(body["nurse_id"]))
        if not profile or not profile.active:
            raise HTTPException(422, detail="Nurse must be active before assignment")
        if not ctx.is_superadmin and ctx.reach != "all":
            allowed_ids = set(ctx.team_nurse_ids) if ctx.reach == "team" else {ctx.user_id}
            if profile.user_id not in allowed_ids:
                raise HTTPException(404, detail="Nurse not found in your reach")
        client = await CareClient.find_one(CareClient.id == row.client_id)
        if not client or profile.user_id not in client.assigned_nurse_ids:
            raise HTTPException(422, detail="Nurse must be assigned to this client")
        row.nurse_id = profile.user_id
        row.supervisor_id = profile.supervisor_id
    if "scheduled_start" in body or "scheduled_end" in body:
        raise HTTPException(422, detail="Rescheduling requires the dedicated scheduling workflow")
    if "instructions" in body:
        row.instructions = str(body["instructions"])[:1000]
    row.updated_at = datetime.now(UTC)
    if row.nurse_id != previous_nurse_id:
        tombstone = VisitSyncTombstone(
            id=uuid4().hex,
            nurse_id=previous_nurse_id,
            visit_id=visit_id,
            reason="reassigned",
            updated_at=row.updated_at,
        )
        database = get_care_database()
        async with await start_session(database) as session:

            async def write_transaction(active_session):
                await row.save(session=active_session)
                await tombstone.insert(session=active_session)

            await session.with_transaction(write_transaction)
    else:
        await row.save()
    await _audit(principal, "care.visit.update", "visit", visit_id, before, row.model_dump())
    return row


@router.post("/visits/{visit_id}/cancel")
async def cancel_visit(
    visit_id: str,
    body: ReasonIn,
    principal: Principal = Depends(require_scopes("visits:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await Visit.find_one(Visit.id == visit_id)
    if not row or not await _visit_reachable(row, ctx):
        raise HTTPException(404, detail="Visit not found")
    if row.status in {"completed", "cancelled"}:
        raise HTTPException(409, detail="Visit is terminal")
    before = row.model_dump()
    now = datetime.now(UTC)
    row.status = "cancelled"
    row.updated_at = now
    tombstone = VisitSyncTombstone(
        id=uuid4().hex, nurse_id=row.nurse_id, visit_id=visit_id, reason="cancelled", updated_at=now
    )
    database = get_care_database()
    async with await start_session(database) as session:

        async def write_transaction(active_session):
            await row.save(session=active_session)
            await tombstone.insert(session=active_session)

        await session.with_transaction(write_transaction)
    await _audit(
        principal,
        "care.visit.cancel",
        "visit",
        visit_id,
        before,
        {"status": "cancelled", "reason": body.reason},
    )
    return {"id": visit_id, "status": "cancelled"}


@router.post("/visits/{visit_id}/annotate", status_code=201)
async def annotate(
    visit_id: str,
    body: AnnotateIn,
    principal: Principal = Depends(require_scopes("visits:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await Visit.find_one(Visit.id == visit_id)
    if not row or not await _visit_reachable(row, ctx):
        raise HTTPException(404, detail="Visit not found")
    annotation = VisitAnnotation(
        id=f"{visit_id}:{datetime.now(UTC).timestamp()}",
        visit_id=visit_id,
        user_id=principal.user_id,
        comment=body.comment,
    )
    await annotation.insert()
    await _audit(
        principal, "care.visit.annotate", "visit", visit_id, None, {"comment": body.comment}
    )
    return annotation


@router.get("/flags")
async def flags(
    _: Principal = Depends(require_scopes("flags:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    rows = await VisitFlag.find(VisitFlag.status == "open").sort("-raised_at").to_list()
    ids = {v.id for v in await Visit.find().to_list() if await _visit_reachable(v, ctx)}
    return {"items": [f for f in rows if f.visit_id in ids]}


@router.post("/flags/{flag_id}/resolve")
async def resolve_flag(
    flag_id: str,
    body: ReasonIn,
    principal: Principal = Depends(require_scopes("flags:write")),
    ctx: ReachContext = Depends(get_care_actor),
):
    row = await VisitFlag.find_one(VisitFlag.id == flag_id)
    visit = await Visit.find_one(Visit.id == row.visit_id) if row else None
    # The queue filters flags by visit reach, so the mutation must enforce the same
    # boundary even when a caller supplies an ID directly instead of using the queue.
    if not row or not visit or not await _visit_reachable(visit, ctx):
        raise HTTPException(404, detail="Flag not found")
    row.status = "resolved"
    row.resolved_at = datetime.now(UTC)
    row.resolved_by = principal.user_id
    row.resolution_note = body.reason
    await row.save()
    await _audit(
        principal, "care.flag.resolve", "visit_flag", flag_id, None, {"reason": body.reason}
    )
    return row


@router.get("/team")
async def team(
    _: Principal = Depends(require_scopes("visits:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    profiles = await NurseProfile.find().to_list()
    allowed = [
        x
        for x in profiles
        if ctx.is_superadmin
        or ctx.reach == "all"
        or x.user_id in ctx.team_nurse_ids
        or x.user_id == ctx.user_id
    ]
    today = date.today().isoformat()
    return {
        "items": [
            {
                "user_id": x.user_id,
                "staff_number": x.staff_number,
                "active": x.active,
                "last_seen_at": x.last_seen_at,
            }
            for x in allowed
        ],
        "date": today,
    }


@router.get("/reports/visits")
async def visit_report(
    principal: Principal = Depends(require_scopes("care-reports:read")),
    ctx: ReachContext = Depends(get_care_actor),
    format: str = Query(default="json", pattern="^(json|csv)$"),
    nurse_id: str | None = Query(default=None, alias="nurse", max_length=160),
    client_id: str | None = Query(default=None, alias="client", max_length=160),
    start_date: date | None = Query(default=None, alias="from"),
    end_date: date | None = Query(default=None, alias="to"),
    cursor: str | None = Query(default=None, max_length=400),
    limit: int = Query(default=50, ge=1, le=200),
):
    """Return reach-filtered visit statistics or a filtered/audited export."""
    from app.modules.care_admin.report_rules import decode_report_cursor, encode_report_cursor
    from app.modules.care_ops.rules import csv_safe

    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="from must be on or before to")
    if format == "csv" and not principal.has("care-reports:export"):
        raise HTTPException(status_code=403, detail="Missing care-reports:export")

    rows = await Visit.find().to_list()
    rows = [v for v in rows if await _visit_reachable(v, ctx)]
    if nurse_id:
        rows = [v for v in rows if v.nurse_id == nurse_id]
    if client_id:
        rows = [v for v in rows if v.client_id == client_id]
    if start_date:
        rows = [
            v
            for v in rows
            if v.scheduled_start.astimezone(ZoneInfo("Africa/Kampala")).date() >= start_date
        ]
    if end_date:
        rows = [
            v
            for v in rows
            if v.scheduled_start.astimezone(ZoneInfo("Africa/Kampala")).date() <= end_date
        ]
    rows.sort(key=lambda v: (v.scheduled_start, v.id))

    if format == "csv":
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(["Visit ID", "Nurse ID", "Client ID", "Status", "Scheduled start"])
        for visit in rows:
            writer.writerow(
                [
                    csv_safe(visit.id),
                    csv_safe(visit.nurse_id),
                    csv_safe(visit.client_id),
                    csv_safe(visit.status),
                    csv_safe(visit.scheduled_start.isoformat()),
                ]
            )
        await _audit(
            principal,
            "care.report.export",
            "visit_report",
            None,
            None,
            {
                "count": len(rows),
                "nurse_filter": nurse_id,
                "client_filter": client_id,
                "from": start_date.isoformat() if start_date else None,
                "to": end_date.isoformat() if end_date else None,
            },
        )
        return StreamingResponse(
            iter([stream.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="care-visits.csv"'},
        )

    all_matching = list(rows)
    if cursor:
        try:
            cursor_key = decode_report_cursor(cursor)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid report cursor") from exc
        rows = [v for v in rows if (v.scheduled_start, v.id) > cursor_key]
    page_rows = rows[:limit]
    has_more = len(rows) > limit
    next_cursor = None
    if has_more and page_rows:
        next_cursor = encode_report_cursor(page_rows[-1].scheduled_start, page_rows[-1].id)
    return {
        "total": len(all_matching),
        "by_status": {
            status: sum(v.status == status for v in all_matching)
            for status in ("scheduled", "in_progress", "completed", "cancelled", "missed")
        },
        "items": [
            {
                "id": v.id,
                "nurse_id": v.nurse_id,
                "client_id": v.client_id,
                "status": v.status,
                "scheduled_start": v.scheduled_start,
            }
            for v in page_rows
        ],
        "limit": limit,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }
