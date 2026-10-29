import json
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.db import get_care_database
from app.core.deps import Principal, require_scopes
from app.core.photo_store import ALLOWED_IMAGE_TYPES, PHOTO_FOLDER, upload_signature, verify_asset
from app.modules.audit.models import AuditLog
from app.modules.care_clients.models import CareClient
from app.modules.care_ops.dispatch import notify_sos
from app.modules.care_ops.models import CareAlert, SOSCase, SOSEvent
from app.modules.field.router import AdhocVisitIn, create_adhoc_visit
from app.modules.field.schemas import EventIn, NoteIn
from app.modules.field.service import (
    record_event,
    record_note,
    require_current_consent,
    require_sos_access,
)
from app.modules.field.sync_cursor import decode_cursor, encode_cursor
from app.modules.field_ops.models import SyncPushReceipt
from app.modules.field_ops.sync_rules import sync_payload_too_large
from app.modules.nurses.models import Device
from app.modules.settings.care_service import care_values
from app.modules.sos_events.rules import (
    can_start_live_follow,
    is_live_follow_active,
    live_follow_deadline,
    ping_retry_after,
)
from app.modules.visits.models import Visit, VisitPhoto

router = APIRouter(prefix="/field", tags=["field-sync"])


class SyncOperation(BaseModel):
    kind: str = Field(
        pattern="^(check_in|check_out|visit_note|visit_create_adhoc|sos|visit_photo)$"
    )
    client_op_id: str | None = Field(default=None, min_length=8, max_length=160)
    visit_id: str | None = None
    payload: dict


class SyncPush(BaseModel):
    operations: list[SyncOperation] = Field(max_length=50)


class SyncPull(BaseModel):
    since: datetime | None = None
    limit: int = Field(default=200, ge=1, le=200)


class PhotoSign(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    visit_id: str
    content_type: str
    bytes: int = Field(gt=0, le=20_000_000)
    photo_type: Literal["arrival", "departure", "other"] = "other"


class SOSIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    visit_id: str | None = None
    test: bool = False


class SOSFollowPingIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy_m: float = Field(ge=0, le=5000)
    captured_at: datetime | None = None


class SOSFollowActionIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)


CanUse = Depends(require_current_consent)
CanUseBasic = Depends(require_scopes("field:use"))


@router.post("/sync/push")
async def sync_push(body: SyncPush, principal: Principal = CanUse):
    # Hard cap deliberately remains unchanged at 256 KiB.
    if sync_payload_too_large(body.model_dump_json()):
        raise HTTPException(413, detail="sync_payload_too_large")
    results = []
    for op in body.operations:
        payload_data = op.payload if isinstance(op.payload, dict) else {}
        client_op_id = op.client_op_id or payload_data.get("client_op_id") or payload_data.get("id")
        if not isinstance(client_op_id, str) or len(client_op_id) < 8 or len(client_op_id) > 160:
            results.append(
                {
                    "id": payload_data.get("id"),
                    "kind": op.kind,
                    "status": "rejected",
                    "reason": "invalid_payload",
                }
            )
            continue
        resolved_visit_id = op.visit_id or payload_data.get("visit_id")
        canonical_payload = json.dumps(
            {"kind": op.kind, "visit_id": resolved_visit_id, "payload": payload_data},
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        payload_hash = sha256(canonical_payload.encode("utf-8")).hexdigest()
        receipt = await SyncPushReceipt.find_one(
            SyncPushReceipt.user_id == principal.user_id,
            SyncPushReceipt.client_op_id == client_op_id,
        )
        if receipt:
            if (
                receipt.kind != op.kind
                or receipt.visit_id != resolved_visit_id
                or (receipt.payload_hash is not None and receipt.payload_hash != payload_hash)
            ):
                results.append(
                    {
                        "id": payload_data.get("id"),
                        "kind": op.kind,
                        "status": "rejected",
                        "reason": "idempotency_key_conflict",
                    }
                )
            else:
                results.append(
                    {
                        "id": payload_data.get("id"),
                        "kind": op.kind,
                        "status": "duplicate",
                        "server": receipt.result,
                    }
                )
            continue

        if op.kind == "visit_create_adhoc":
            try:
                payload = AdhocVisitIn.model_validate(payload_data)
            except Exception:
                results.append(
                    {
                        "id": payload_data.get("id"),
                        "kind": op.kind,
                        "status": "rejected",
                        "reason": "invalid_payload",
                    }
                )
                continue
            result = await create_adhoc_visit(payload, principal)
        elif op.kind == "sos":
            try:
                payload = SOSIn.model_validate(payload_data)
            except Exception:
                results.append(
                    {
                        "id": payload_data.get("id"),
                        "kind": op.kind,
                        "status": "rejected",
                        "reason": "invalid_payload",
                    }
                )
                continue
            if not principal.has("sos:send"):
                result = {"status": "rejected", "reason": "missing_scope"}
            elif op.visit_id and payload.visit_id and op.visit_id != payload.visit_id:
                result = {"status": "rejected", "reason": "invalid_payload"}
            else:
                target_visit = (
                    await Visit.find_one(Visit.id == (payload.visit_id or op.visit_id))
                    if (payload.visit_id or op.visit_id)
                    else None
                )
                if (payload.visit_id or op.visit_id) and (
                    target_visit is None or target_visit.nurse_id != principal.user_id
                ):
                    result = {"status": "rejected", "reason": "visit_not_assigned"}
                else:
                    existing_case = await SOSCase.find_one(SOSCase.id == payload.id)
                    if existing_case:
                        result = (
                            {"status": "duplicate"}
                            if existing_case.nurse_id == principal.user_id
                            else {"status": "rejected", "reason": "idempotency_key_conflict"}
                        )
                    else:
                        now = datetime.now(UTC)
                        case = SOSCase(
                            id=payload.id,
                            nurse_id=principal.user_id,
                            visit_id=payload.visit_id or op.visit_id,
                            test=payload.test,
                            events=[{"type": "sent", "at": now.isoformat()}],
                        )
                        await case.insert()
                        await SOSEvent(
                            id=f"{case.id}:sent",
                            case_id=case.id,
                            type="sent",
                            actor_id=principal.user_id,
                        ).insert()
                        alert = CareAlert(
                            id=f"sos:{case.id}",
                            type="sos",
                            severity="critical",
                            visit_id=case.visit_id,
                            nurse_id=principal.user_id,
                            message="A staff safety alert needs a response.",
                        )
                        await alert.insert()
                        await AuditLog(
                            action="care.sos.send",
                            item_type="sos_case",
                            item_id=case.id,
                            after={"status": case.status, "test": case.test},
                        ).insert()
                        await notify_sos(case)
                        result = {
                            "status": "accepted",
                            "id": case.id,
                            "server": {"status": case.status},
                        }
        elif op.kind == "visit_photo":
            photo_id = payload_data.get("id")
            photo = (
                await VisitPhoto.find_one(VisitPhoto.id == photo_id)
                if isinstance(photo_id, str)
                else None
            )
            if (
                not photo
                or photo.nurse_id != principal.user_id
                or photo.visit_id != (op.visit_id or payload_data.get("visit_id"))
            ):
                result = {"status": "rejected", "reason": "visit_not_assigned"}
            elif photo.status in {"hidden", "expired"}:
                result = {"status": "rejected", "reason": "photo_unavailable"}
            else:
                geo = payload_data.get("geo_snap", {})
                if not isinstance(geo, dict) or len(str(geo)) > 4096:
                    result = {"status": "rejected", "reason": "invalid_payload"}
                else:
                    photo.geo_snap = geo
                    await photo.save()
                    result = {"status": "accepted", "id": photo.id}
        else:
            if not op.visit_id:
                results.append(
                    {
                        "id": payload_data.get("id"),
                        "kind": op.kind,
                        "status": "rejected",
                        "reason": "invalid_payload",
                    }
                )
                continue
            try:
                payload = (
                    EventIn.model_validate(payload_data)
                    if op.kind in {"check_in", "check_out"}
                    else NoteIn.model_validate(payload_data)
                )
            except Exception:
                results.append(
                    {
                        "id": payload_data.get("id"),
                        "kind": op.kind,
                        "status": "rejected",
                        "reason": "invalid_payload",
                    }
                )
                continue
            if op.kind in {"check_in", "check_out"}:
                result = await record_event(principal.user_id, op.visit_id, payload, op.kind)
            else:
                result = await record_note(principal.user_id, op.visit_id, payload)

        # Cache only accepted results; a rejected operation may be retried after its cause changes.
        status_value = result.get("status", "rejected")
        if status_value in {"accepted", "duplicate"}:
            receipt_id = sha256(f"{principal.user_id}:{client_op_id}".encode()).hexdigest()
            try:
                await SyncPushReceipt(
                    id=receipt_id,
                    user_id=principal.user_id,
                    client_op_id=client_op_id,
                    kind=op.kind,
                    visit_id=resolved_visit_id,
                    payload_hash=payload_hash,
                    result=result.get("server", result),
                ).insert()
            except Exception:
                existing_receipt = await SyncPushReceipt.find_one(
                    SyncPushReceipt.user_id == principal.user_id,
                    SyncPushReceipt.client_op_id == client_op_id,
                )
                if not existing_receipt:
                    raise
                if (
                    existing_receipt.payload_hash is not None
                    and existing_receipt.payload_hash != payload_hash
                ):
                    result = {"status": "rejected", "reason": "idempotency_key_conflict"}
                else:
                    result = {"status": "duplicate", "server": existing_receipt.result}
        results.append({"id": payload_data.get("id"), "kind": op.kind, **result})
    return {"results": results, "server_time": datetime.now(UTC)}


@router.get("/sync/pull")
async def sync_pull(
    principal: Principal = CanUse,
    cursor: str | None = None,
    limit: int = Query(default=200, ge=1, le=200),
    since: datetime | None = None,
):
    """Return a stable page of changed visits and removal tombstones for this nurse."""
    values = await care_values()
    now = datetime.now(UTC)
    past_hours = int(values.get("visits.sync_window_past_hours", 24))
    future_days = int(values.get("visits.sync_window_future_days", 14))
    window_start = now - timedelta(hours=past_hours)
    window_end = now + timedelta(days=future_days)
    cursor_pair = decode_cursor(cursor)
    # Keep the old `since` query usable for older clients while cursor clients migrate.
    if cursor_pair is None and cursor is None and since is not None:
        since_utc = since.replace(tzinfo=UTC) if since.tzinfo is None else since.astimezone(UTC)
        cursor_pair = (since_utc, "")

    database = get_care_database()
    visit_query = {
        "nurse_id": principal.user_id,
        "status": {"$ne": "cancelled"},
        "scheduled_start": {"$gte": window_start, "$lte": window_end},
    }
    tombstone_query = {"nurse_id": principal.user_id}
    if cursor_pair is not None:
        cursor_time, cursor_key = cursor_pair
        visit_after = [{"updated_at": {"$gt": cursor_time}}]
        if not cursor_key or cursor_key.startswith("visit:"):
            last_visit_id = cursor_key.removeprefix("visit:") if cursor_key else ""
            visit_after.append({"updated_at": cursor_time, "_id": {"$gt": last_visit_id}})
        visit_query["$or"] = visit_after

        tombstone_after = [{"updated_at": {"$gt": cursor_time}}]
        if not cursor_key or cursor_key.startswith("visit:"):
            tombstone_after.append({"updated_at": cursor_time})
        elif cursor_key.startswith("zremoved:"):
            tombstone_after.append(
                {"updated_at": cursor_time, "_id": {"$gt": cursor_key.removeprefix("zremoved:")}}
            )
        tombstone_query["$or"] = tombstone_after
    else:
        removal_cutoff = now - timedelta(days=future_days) - timedelta(hours=past_hours)
        tombstone_query["updated_at"] = {"$gte": removal_cutoff}

    # Fetch only enough rows from each indexed stream to determine the next merged page.
    visit_docs = (
        await database["visits"]
        .find(visit_query)
        .sort([("updated_at", 1), ("_id", 1)])
        .limit(limit + 1)
        .to_list(length=limit + 1)
    )
    tombstone_docs = (
        await database["visit_sync_tombstones"]
        .find(tombstone_query)
        .sort([("updated_at", 1), ("_id", 1)])
        .limit(limit + 1)
        .to_list(length=limit + 1)
    )
    records: list[dict] = []
    for visit in visit_docs:
        updated_at = visit.get("updated_at") or visit.get("created_at") or now
        key = f"visit:{visit['_id']}"
        client = await CareClient.find_one(CareClient.id == visit["client_id"])
        snapshot = visit.get("place_snapshot") or {}
        records.append(
            {
                "updated_at": updated_at,
                "key": key,
                "kind": "visit",
                "item": {
                    "id": visit["_id"],
                    "client_display_name": client.display_name if client else "Client",
                    "place_address_text": snapshot.get("address_text", ""),
                    "scheduled_start": visit["scheduled_start"],
                    "scheduled_end": visit["scheduled_end"],
                    "status": visit.get("status", "scheduled"),
                    "instructions": visit.get("instructions", ""),
                    "adhoc": bool(visit.get("adhoc", False)),
                    "check_in_at": visit.get("check_in_at"),
                    "check_out_at": visit.get("check_out_at"),
                    "safety_timer_until": visit.get("safety_timer_until"),
                    "safety_state": visit.get("safety_state", "off"),
                    "updated_at": updated_at,
                },
            }
        )
    for tombstone in tombstone_docs:
        updated_at = tombstone["updated_at"]
        records.append(
            {
                "updated_at": updated_at,
                "key": f"zremoved:{tombstone['_id']}",
                "kind": "removed",
                "visit_id": tombstone["visit_id"],
            }
        )

    records.sort(key=lambda record: (record["updated_at"], record["key"]))
    has_more = len(records) > limit
    page = records[:limit]
    output = [record["item"] for record in page if record["kind"] == "visit"]
    removed_ids = list(
        dict.fromkeys(record["visit_id"] for record in page if record["kind"] == "removed")
    )
    next_cursor = (
        encode_cursor(page[-1]["updated_at"], page[-1]["key"])
        if page
        else (cursor if decode_cursor(cursor) is not None else None)
    )
    return {
        "items": output,
        "removed_visit_ids": removed_ids,
        "server_time": now,
        "cursor": next_cursor,
        "next_since": now,
        "has_more": has_more,
    }


@router.post("/photos/sign")
async def sign_photo(body: PhotoSign, principal: Principal = CanUse):
    settings = get_settings()
    if body.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(422, detail="Unsupported photo type")
    if (
        not settings.cloudinary_cloud_name
        or not settings.cloudinary_api_key
        or not settings.cloudinary_api_secret
    ):
        raise HTTPException(503, detail="Photo storage is not configured")
    visit = await Visit.find_one(Visit.id == body.visit_id, Visit.nurse_id == principal.user_id)
    if not visit:
        raise HTTPException(404, detail="Visit not found")
    client = await CareClient.find_one(CareClient.id == visit.client_id)
    if not client or not client.photo_allowed:
        raise HTTPException(403, detail="Photo proof is not allowed for this client")
    limits = await care_values()
    if not limits.get("photos.enabled", False):
        raise HTTPException(409, detail="Photo proof is disabled by the organisation")
    if body.bytes > int(limits.get("photos.max_mb", 5)) * 1024 * 1024:
        raise HTTPException(422, detail="Photo exceeds the configured size limit")
    existing = await VisitPhoto.find_one(VisitPhoto.id == body.id)
    if existing and (existing.nurse_id != principal.user_id or existing.visit_id != body.visit_id):
        raise HTTPException(409, detail="Photo identifier is already registered to another visit")
    if existing and existing.status in {"hidden", "expired"}:
        raise HTTPException(409, detail="This photo registration is no longer available")
    visit_photos = await VisitPhoto.find(VisitPhoto.visit_id == body.visit_id).to_list()
    existing_count = sum(photo.status not in {"hidden", "expired"} for photo in visit_photos)
    if existing is None and existing_count >= int(limits.get("photos.max_per_visit", 5)):
        raise HTTPException(422, detail="Visit photo limit reached")
    timestamp = int(datetime.now(UTC).timestamp())
    try:
        signed = upload_signature(
            settings, public_id=body.id, timestamp=timestamp, delivery_type="private"
        )
    except ValueError as exc:
        raise HTTPException(503 if "not configured" in str(exc) else 422, detail=str(exc)) from exc
    if existing is None:
        try:
            await VisitPhoto(
                id=body.id,
                visit_id=body.visit_id,
                nurse_id=principal.user_id,
                cloudinary_public_id=f"{PHOTO_FOLDER}/{body.id}",
                delivery_type="private",
                photo_type=body.photo_type,
                status="pending",
            ).insert()
        except Exception:
            existing = await VisitPhoto.find_one(VisitPhoto.id == body.id)
            if (
                not existing
                or existing.nurse_id != principal.user_id
                or existing.visit_id != body.visit_id
            ):
                raise HTTPException(
                    409, detail="Photo identifier registration conflicted"
                ) from None
    await AuditLog(
        action="care.photo.sign",
        item_type="visit_photo",
        item_id=body.id,
        after={"visit_id": body.visit_id, "bytes": body.bytes, "photo_type": body.photo_type},
    ).insert()
    return signed


@router.post("/sos", status_code=201)
async def send_sos(body: SOSIn, principal: Principal = Depends(require_sos_access)):
    case = SOSCase(
        id=body.id,
        nurse_id=principal.user_id,
        visit_id=body.visit_id,
        test=body.test,
        events=[{"type": "sent", "at": datetime.now(UTC).isoformat()}],
    )
    await case.insert()
    await SOSEvent(
        id=f"{body.id}:sent", case_id=body.id, type="sent", actor_id=principal.user_id
    ).insert()
    await CareAlert(
        id=f"sos:{body.id}",
        type="sos",
        severity="critical",
        visit_id=body.visit_id,
        nurse_id=principal.user_id,
        message="A staff safety alert needs a response.",
    ).insert()
    await AuditLog(
        action="care.sos.send",
        item_type="sos_case",
        item_id=case.id,
        after={"status": case.status, "test": case.test},
    ).insert()
    await notify_sos(case)
    return {"id": case.id, "status": "sent"}


async def _owned_sos_case(case_id: str, principal: Principal) -> SOSCase:
    # A uniform 404 prevents nurses probing whether another nurse has an SOS case.
    case = await SOSCase.find_one(SOSCase.id == case_id)
    if case is None or case.nurse_id != principal.user_id:
        raise HTTPException(404, detail="SOS case not found")
    return case


@router.post("/sos/{case_id}/follow/start")
async def start_sos_live_follow(
    case_id: str,
    body: SOSFollowActionIn,
    principal: Principal = Depends(require_sos_access),
):
    """Open a server-bounded live-follow window for the nurse's own SOS."""
    now = datetime.now(UTC)
    values = await care_values()
    if not values.get("sos.live_follow_enabled", False):
        raise HTTPException(409, detail="SOS live follow is not enabled by your organisation")
    case = await _owned_sos_case(case_id, principal)
    if not can_start_live_follow(case.status):
        raise HTTPException(409, detail="Live follow cannot start for a closed SOS case")
    event_id = f"{body.id}:follow-start"
    existing_start = await SOSEvent.find_one(SOSEvent.id == event_id)
    if existing_start is not None and (
        existing_start.case_id != case.id
        or existing_start.actor_id != principal.user_id
        or existing_start.type != "follow_started"
    ):
        raise HTTPException(409, detail="SOS follow event identifier conflict")
    if case.live_follow_started_at is not None:
        if is_live_follow_active(
            case.live_follow_started_at, case.live_follow_until, case.live_follow_stopped_at, now
        ):
            return {
                "id": case.id,
                "active": True,
                "started_at": case.live_follow_started_at,
                "until": case.live_follow_until,
                "interval_seconds": int(values.get("sos.live_follow_interval_seconds", 30) or 30),
                "duplicate": True,
            }
        raise HTTPException(409, detail="The live-follow window has already ended")

    duration = int(values.get("sos.live_follow_minutes", 30) or 30)
    try:
        deadline = live_follow_deadline(now, duration)
    except ValueError as exc:
        raise HTTPException(503, detail="SOS live-follow settings are invalid") from exc
    case.live_follow_started_at = now
    case.live_follow_until = deadline
    case.live_follow_stopped_at = None
    await case.save()
    await SOSEvent(
        id=event_id,
        case_id=case.id,
        type="follow_started",
        actor_id=principal.user_id,
        details={"until": deadline.isoformat(), "duration_minutes": duration},
    ).insert()
    await AuditLog(
        action="care.sos.follow.start",
        item_type="sos_case",
        item_id=case.id,
        after={"until": deadline.isoformat(), "duration_minutes": duration},
    ).insert()
    return {
        "id": case.id,
        "active": True,
        "started_at": now,
        "until": deadline,
        "interval_seconds": int(values.get("sos.live_follow_interval_seconds", 30) or 30),
    }


@router.post("/sos/{case_id}/follow/ping")
async def ping_sos_live_follow(
    case_id: str,
    body: SOSFollowPingIn,
    principal: Principal = Depends(require_sos_access),
):
    """Record one foreground location snapshot; rate is enforced by server time."""
    now = datetime.now(UTC)
    case = await _owned_sos_case(case_id, principal)
    existing = await SOSEvent.find_one(SOSEvent.id == body.id)
    if existing is not None:
        if (
            existing.case_id != case.id
            or existing.actor_id != principal.user_id
            or existing.type != "follow_ping"
            or existing.details.get("lat") != body.lat
            or existing.details.get("lng") != body.lng
            or existing.details.get("accuracy_m") != body.accuracy_m
        ):
            raise HTTPException(409, detail="SOS follow event identifier conflict")
        return {
            "id": body.id,
            "accepted": True,
            "duplicate": True,
            "received_at": existing.created_at,
        }

    values = await care_values()
    if not values.get("sos.live_follow_enabled", False):
        raise HTTPException(409, detail="SOS live follow is not enabled by your organisation")
    if not is_live_follow_active(
        case.live_follow_started_at, case.live_follow_until, case.live_follow_stopped_at, now
    ):
        raise HTTPException(410, detail="SOS live-follow window has ended")
    if not can_start_live_follow(case.status):
        raise HTTPException(409, detail="Live follow is closed for this SOS case")

    interval = int(values.get("sos.live_follow_interval_seconds", 30) or 30)
    latest = (
        await SOSEvent.find({"case_id": case.id, "type": "follow_ping"})
        .sort("-created_at")
        .first_or_none()
    )
    retry = ping_retry_after(latest.created_at if latest else None, now, interval)
    if retry > 0:
        raise HTTPException(
            429,
            detail={"code": "live_follow_rate_limited", "retry_after_seconds": retry},
            headers={"Retry-After": str(retry)},
        )

    details = {
        "lat": body.lat,
        "lng": body.lng,
        "accuracy_m": body.accuracy_m,
        "captured_at": body.captured_at.isoformat() if body.captured_at else None,
        "capture_source": "foreground",
    }
    await SOSEvent(
        id=body.id,
        case_id=case.id,
        type="follow_ping",
        actor_id=principal.user_id,
        created_at=now,
        details=details,
    ).insert()
    await AuditLog(
        action="care.sos.follow.ping",
        item_type="sos_case",
        item_id=case.id,
        after={"snapshot_recorded": True, "captured_at": details["captured_at"]},
    ).insert()
    return {"id": body.id, "accepted": True, "duplicate": False, "received_at": now}


@router.post("/sos/{case_id}/follow/stop")
async def stop_sos_live_follow(
    case_id: str,
    body: SOSFollowActionIn,
    principal: Principal = Depends(require_sos_access),
):
    """Stop further location collection; repeated safe actions are idempotent."""
    now = datetime.now(UTC)
    case = await _owned_sos_case(case_id, principal)
    if case.live_follow_started_at is None:
        raise HTTPException(409, detail="Live follow has not started for this SOS case")
    if case.live_follow_stopped_at is not None:
        return {
            "id": case.id,
            "active": False,
            "stopped_at": case.live_follow_stopped_at,
            "duplicate": True,
        }
    case.live_follow_stopped_at = now
    await case.save()
    await SOSEvent(
        id=f"{body.id}:follow-stop",
        case_id=case.id,
        type="follow_stopped",
        actor_id=principal.user_id,
        created_at=now,
        details={"reason": "nurse_confirmed_safe"},
    ).insert()
    await AuditLog(
        action="care.sos.follow.stop",
        item_type="sos_case",
        item_id=case.id,
        after={"reason": "nurse_confirmed_safe", "stopped_at": now.isoformat()},
    ).insert()
    return {"id": case.id, "active": False, "stopped_at": now, "duplicate": False}


@router.post("/sos/{case_id}/safe")
async def report_sos_safe(
    case_id: str, body: SOSFollowActionIn, principal: Principal = Depends(require_sos_access)
):
    """Record the nurse's safe signal and stop live follow without resolving the SOS case."""
    case = await _owned_sos_case(case_id, principal)
    if case.nurse_reported_safe_at is not None:
        return {
            "id": case.id,
            "confirmed": True,
            "duplicate": True,
            "safe_at": case.nurse_reported_safe_at,
        }
    event_id = f"{body.id}:safe"
    existing = await SOSEvent.find_one(SOSEvent.id == event_id)
    if existing is not None and (
        existing.case_id != case.id
        or existing.actor_id != principal.user_id
        or existing.type != "nurse_reported_safe"
    ):
        raise HTTPException(409, detail="SOS safe event identifier conflict")
    now = datetime.now(UTC)
    follow_stopped = case.live_follow_started_at is not None and case.live_follow_stopped_at is None
    case.nurse_reported_safe_at = now
    if follow_stopped:
        case.live_follow_stopped_at = now
    case.events.append(
        {"type": "nurse_reported_safe", "at": now.isoformat(), "by": principal.user_id}
    )
    await case.save()
    if existing is None:
        await SOSEvent(
            id=event_id,
            case_id=case.id,
            type="nurse_reported_safe",
            actor_id=principal.user_id,
            created_at=now,
            details={"follow_stopped": follow_stopped},
        ).insert()
    await AuditLog(
        action="care.sos.nurse_reported_safe",
        item_type="sos_case",
        item_id=case.id,
        after={"safe_at": now.isoformat(), "follow_stopped": follow_stopped},
    ).insert()
    return {
        "id": case.id,
        "confirmed": True,
        "duplicate": False,
        "safe_at": now,
        "follow_stopped": follow_stopped,
    }


@router.post("/device/revoke")
async def revoke_device(body: dict, principal: Principal = CanUseBasic):
    device = await Device.find_one(
        Device.device_id == body.get("device_id"), Device.user_id == principal.user_id
    )
    if not device:
        raise HTTPException(404, detail="Device not found")
    device.revoked_at = datetime.now(UTC)
    device.push_token = None
    device.push_token_updated_at = datetime.now(UTC)
    await device.save()
    return {"revoked": True}


class PhotoComplete(BaseModel):
    id: str = Field(min_length=8, max_length=160)


@router.post("/photos/complete")
async def complete_photo(body: PhotoComplete, principal: Principal = CanUse):
    """Mark photo proof complete only after server-side Cloudinary verification."""
    photo = await VisitPhoto.find_one(
        VisitPhoto.id == body.id, VisitPhoto.nurse_id == principal.user_id
    )
    if photo is None:
        raise HTTPException(404, detail="Photo registration not found")
    if photo.status == "uploaded":
        return {"id": photo.id, "status": "uploaded"}
    if photo.status in {"hidden", "expired"}:
        raise HTTPException(409, detail="Photo is no longer available")
    settings = get_settings()
    try:
        metadata = await verify_asset(
            settings, photo.cloudinary_public_id, delivery_type=photo.delivery_type
        )
    except LookupError as exc:
        raise HTTPException(409, detail="Cloudinary upload has not completed") from exc
    except ValueError as exc:
        raise HTTPException(503 if "not configured" in str(exc) else 422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, detail="Photo storage verification failed") from exc
    limits = await care_values()
    max_bytes = int(limits.get("photos.max_mb", 5)) * 1024 * 1024
    if metadata["bytes"] <= 0 or metadata["bytes"] > max_bytes:
        raise HTTPException(422, detail="Uploaded photo size is outside the configured limit")
    if metadata["format"].lower() not in {"jpg", "jpeg", "png", "webp"}:
        raise HTTPException(422, detail="Uploaded photo format is not allowed")
    photo.status = "uploaded"
    await photo.save()
    await AuditLog(
        action="care.photo.complete",
        item_type="visit_photo",
        item_id=photo.id,
        after={
            "visit_id": photo.visit_id,
            "bytes": metadata["bytes"],
            "format": metadata["format"],
        },
    ).insert()
    return {"id": photo.id, "status": "uploaded", "bytes": metadata["bytes"]}
