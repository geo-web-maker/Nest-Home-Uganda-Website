# ruff: noqa: E501
"""The test client: a practice care client for the test nurse, with controls for the days it lives in.

Why the days are moved instead of the clock
-------------------------------------------
The nurse app, the sync window, the geofence and clock-skew checks, the safety timers and the scheduler all read the
real clock. A pretend clock would make every check-in look hours or days "skewed". So "skip to the next day" moves the
test nurse's data back by one day instead: tomorrow's visits become today's, today's unfinished visits become
yesterday's (and are marked missed by the normal job). Nothing else in the system needs to know.

Everything here belongs to the sandbox: the client, its place and visits are created by the test admin so the normal
purge removes them, they are hidden from real staff, and alerts about the test nurse follow the sandbox delivery rules.
"""

import logging
import re
import secrets
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.errors import NotFound, ValidationFailed
from app.modules.audit import service as audit
from app.modules.test_accounts import service
from app.modules.test_accounts.models import TestSandboxConfig

log = logging.getLogger(__name__)

TZ = ZoneInfo("Africa/Kampala")
CLIENT_ID = "test-client"
PLACE_ID = "test-client-home"
STAY_ID = "test-client-stay"
PATIENT_TYPES = ("General", "Mama", "Baby")
DEFAULT_LOCATION = (0.3476, 32.5825, 150)  # central Kampala; set your own with set_location
MAX_STEP_DAYS = 14  # one click moves at most this far
MAX_OFFSET_DAYS = 60  # the test world may be at most this far from real time
VISIT_STATES = ("scheduled", "in_progress", "completed", "overdue_checkout")
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

# Each visit is either "day" (days from today) + "at" (HH:MM, Kampala), or "minutes" (from now, may be negative).
# state: scheduled (default) | in_progress | completed | overdue_checkout (checked in, never out, safety timer expired).
SCENARIOS: dict[str, dict] = {
    "standard_day": {
        "label": "A normal day",
        "about": "Yesterday done, one visit due in 10 minutes, one later today, and two on the next days.",
        "visits": [
            {"day": -1, "at": "09:00", "length": 60, "state": "completed"},
            {"minutes": 10, "length": 60},
            {"minutes": 240, "length": 45},
            {"day": 1, "at": "09:00"},
            {"day": 2, "at": "14:00"},
        ],
    },
    "daily_week": {
        "label": "A visit every day this week",
        "about": "Three days done, one due in 10 minutes, then one each of the next three days. Use Next day to walk through it.",
        "visits": [
            {"day": -3, "at": "09:00", "state": "completed"},
            {"day": -2, "at": "09:00", "state": "completed"},
            {"day": -1, "at": "09:00", "state": "completed"},
            {"minutes": 10},
            {"day": 1, "at": "09:00"},
            {"day": 2, "at": "09:00"},
            {"day": 3, "at": "09:00"},
        ],
    },
    "missed_visit": {
        "label": "A missed visit",
        "about": "A visit that started 50 minutes ago and was never checked in (marked missed, late alert raised), and one due later.",
        "visits": [{"minutes": -50, "length": 60}, {"minutes": 90}],
    },
    "overdue_checkout": {
        "label": "Checked in, never checked out",
        "about": "A visit that ended long ago with the safety timer expired (critical alert), and one due in an hour.",
        "visits": [
            {"minutes": -95, "length": 60, "state": "overdue_checkout"},
            {"minutes": 60, "length": 45},
        ],
    },
    "back_to_back": {
        "label": "Three visits back to back",
        "about": "Three 45 minute visits starting in 5, 50 and 95 minutes.",
        "visits": [
            {"minutes": 5, "length": 45},
            {"minutes": 50, "length": 45},
            {"minutes": 95, "length": 45},
        ],
    },
    "timesheet_history": {
        "label": "A week of finished visits (timesheet)",
        "about": "One completed visit on each of the last six days, so the weekly timesheet has hours to submit and approve.",
        "visits": [
            {"day": -6, "at": "09:00", "length": 90, "state": "completed"},
            {"day": -5, "at": "09:00", "length": 60, "state": "completed"},
            {"day": -4, "at": "10:00", "length": 120, "state": "completed"},
            {"day": -3, "at": "09:00", "length": 60, "state": "completed"},
            {"day": -2, "at": "14:00", "length": 90, "state": "completed"},
            {"day": -1, "at": "09:00", "length": 60, "state": "completed"},
            {"day": 1, "at": "09:00"},
        ],
    },
}
DEFAULT_SCENARIO = "standard_day"

# Time fields moved when the days are moved, per document type (all are the test nurse's own records).
SHIFTED_FIELDS: dict[str, tuple[str, ...]] = {
    "Visit": (
        "scheduled_start",
        "scheduled_end",
        "check_in_at",
        "check_out_at",
        "safety_timer_until",
        "created_at",
    ),
    "VisitEvent": ("device_time", "sent_at_device", "received_at"),
    "VisitNote": ("created_at_device", "created_at"),
    "VisitPhoto": ("created_at", "hidden_at"),
    "VisitFlag": ("raised_at", "resolved_at"),
    "CareAlert": ("raised_at", "acknowledged_at", "resolved_at"),
    "SOSCase": (
        "created_at",
        "acknowledged_at",
        "resolved_at",
        "nurse_reported_safe_at",
        "live_follow_started_at",
        "live_follow_until",
        "live_follow_stopped_at",
    ),
    "CareFormInstance": ("created_at", "updated_at", "signed_at"),
    "CareInboxNotification": ("created_at", "read_at"),
}


# --------------------------------------------------------------------------- pure helpers (unit tested)


def shift_datetime(value: datetime | None, delta: timedelta) -> datetime | None:
    """Move one stored time. None stays None; a naive time is read as UTC (that is how the database holds it)."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value + delta


def resolve_start(spec: dict, now: datetime) -> datetime:
    """UTC start of a visit spec, either `minutes` from now or `day` (from today) at `at` Kampala time."""
    if "minutes" in spec:
        return now.astimezone(UTC).replace(second=0, microsecond=0) + timedelta(
            minutes=int(spec["minutes"])
        )
    hh, mm = (int(x) for x in str(spec["at"]).split(":"))
    day = now.astimezone(TZ).date() + timedelta(days=int(spec["day"]))
    return datetime.combine(day, time(hh, mm), TZ).astimezone(UTC)


def world_date(now: datetime, day_offset: int) -> date:
    """The date the test world is at: today (Kampala) moved on by the day offset."""
    return now.astimezone(TZ).date() + timedelta(days=day_offset)


def check_offset(current: int, days: int) -> int:
    """New day offset after moving `days`, or a ValidationFailed saying why not."""
    if days == 0 or abs(days) > MAX_STEP_DAYS:
        raise ValidationFailed(
            f"Move between 1 and {MAX_STEP_DAYS} days at a time.", {"days": "invalid"}
        )
    new = current + days
    if abs(new) > MAX_OFFSET_DAYS:
        raise ValidationFailed(
            f"The test days can be at most {MAX_OFFSET_DAYS} days away from today. Use Back to today.",
            {"days": "invalid"},
        )
    return new


# --------------------------------------------------------------------------- lookups


async def _cfg() -> TestSandboxConfig:
    return await service.get_config()


async def _client_doc():
    from app.modules.care_clients.models import CareClient

    return await CareClient.find_one(CareClient.id == CLIENT_ID)


async def _require_present():
    """(config, client, place, nurse, admin) or a clear error. The client must have been switched on."""
    from app.modules.places.models import CarePlace

    cfg = await _cfg()
    if not cfg.enabled:
        raise ValidationFailed("Turn the test accounts master switch on first.", {"enabled": "off"})
    client = await _client_doc()
    if client is None:
        raise ValidationFailed("Switch the test client on first.", {"client": "off"})
    place = await CarePlace.find_one(CarePlace.id == PLACE_ID)
    if place is None:
        raise NotFound("Test client place not found.")
    nurse, admin = await service._get("nurse"), await service._get("admin")
    return cfg, client, place, nurse, admin


def _iso(value: datetime | None) -> str | None:
    value = shift_datetime(value, timedelta(0))
    return value.isoformat() if value else None


# --------------------------------------------------------------------------- status


async def status() -> dict:
    """Everything the admin panel shows about the test client."""
    from app.modules.places.models import CarePlace
    from app.modules.visits.models import Visit

    cfg = await _cfg()
    client = await _client_doc()
    now = datetime.now(UTC)
    out: dict = {
        "enabled": cfg.client_enabled,
        "present": client is not None,
        "day_offset": cfg.day_offset,
        "world_date": world_date(now, cfg.day_offset).isoformat(),
        "today": now.astimezone(TZ).date().isoformat(),
        "scenario": cfg.scenario,
        "patient_types": list(PATIENT_TYPES),
        "visit_states": list(VISIT_STATES),
        "scenarios": {k: {"label": v["label"], "about": v["about"]} for k, v in SCENARIOS.items()},
        "max_step_days": MAX_STEP_DAYS,
        "client": None,
        "place": None,
        "visits": [],
    }
    if client is None:
        return out
    place = await CarePlace.find_one(CarePlace.id == PLACE_ID)
    visits = await Visit.find(Visit.client_id == CLIENT_ID).to_list()
    visits.sort(key=lambda v: v.scheduled_start)
    out["client"] = {
        "id": client.id,
        "name": client.display_name,
        "patient_type": client.patient_type,
    }
    if place is not None:
        out["place"] = {
            "lat": place.lat,
            "lng": place.lng,
            "radius_m": place.radius_m,
            "address": place.address_text,
        }
    out["visits"] = [
        {
            "id": v.id,
            "start": _iso(v.scheduled_start),
            "end": _iso(v.scheduled_end),
            "status": v.status,
            "checked_in": _iso(v.check_in_at),
            "checked_out": _iso(v.check_out_at),
            "adhoc": bool(v.adhoc),
            "safety": v.safety_state,
        }
        for v in visits[:80]
    ]
    return out


# --------------------------------------------------------------------------- creating


async def _insert_visit(
    *,
    client,
    place,
    nurse_id: str,
    admin_id: str,
    supervisor_id: str | None,
    spec: dict,
    now: datetime,
):
    """Create one visit (and its check-in/out records when its state says it was attended)."""
    from app.modules.visits.models import Visit, VisitEvent
    from app.modules.visits.rules import make_snapshot

    state = spec.get("state", "scheduled")
    if state not in VISIT_STATES:
        raise ValidationFailed("Unknown visit state.", {"state": "invalid"})
    start = resolve_start(spec, now)
    end = start + timedelta(minutes=int(spec.get("length", 60)))
    vid = "tv-" + secrets.token_hex(6)
    visit = Visit(
        id=vid,
        client_id=client.id,
        nurse_id=nurse_id,
        supervisor_id=supervisor_id,
        place_id=place.id,
        scheduled_start=start,
        scheduled_end=end,
        status="scheduled",
        instructions="Practice visit for testing.",
        created_by=admin_id,
        place_snapshot=make_snapshot(place.model_dump()),
    )
    events = []
    if state in {"in_progress", "completed", "overdue_checkout"}:
        visit.check_in_at = start + timedelta(minutes=2)
        visit.status = "in_progress"
        events.append(("check_in", visit.check_in_at))
    if state == "completed":
        visit.check_out_at = end - timedelta(minutes=3)
        visit.status = "completed"
        visit.safety_state = "confirmed_safe"
        events.append(("check_out", visit.check_out_at))
    if state == "overdue_checkout":
        visit.safety_state = "armed"
        visit.safety_timer_until = end + timedelta(minutes=30)
    await visit.insert()
    for kind, at in events:
        await VisitEvent(
            id=f"{vid}:{kind}",
            client_op_id=f"seed:{vid}:{kind}",
            visit_id=vid,
            nurse_id=nurse_id,
            type=kind,
            device_time=at,
            sent_at_device=at,
            received_at=at,
            lat=place.lat,
            lng=place.lng,
            accuracy_m=10,
            source="pwa_manual",
            verification="verified",
            distance_m=4.0,
        ).insert()
    return visit


async def _create(actor, patient_type: str | None = None) -> None:
    """Create the client, its place and stay and the default visits. Does nothing if it already exists."""
    from app.modules.care_clients.models import CareClient
    from app.modules.places.models import CarePlace, PlaceStay

    if await _client_doc() is not None:
        return
    await service.ensure_test_accounts()
    nurse, admin = await service._user("nurse"), await service._user("admin")
    if nurse is None or admin is None:
        raise NotFound("Test accounts not found.")
    cfg = await _cfg()
    lat = cfg.client_lat if cfg.client_lat is not None else DEFAULT_LOCATION[0]
    lng = cfg.client_lng if cfg.client_lng is not None else DEFAULT_LOCATION[1]
    radius = cfg.client_radius_m or DEFAULT_LOCATION[2]
    supervisor_id = str(admin.id) if await service._linked() else None
    ptype = (
        patient_type if patient_type in PATIENT_TYPES else (cfg.client_patient_type or "General")
    )
    await CareClient(
        id=CLIENT_ID,
        display_name="Test Client",
        status="active",
        supervisor_id=supervisor_id,
        assigned_nurse_ids=[str(nurse.id)],
        created_by=str(admin.id),
        photo_allowed=True,
        patient_type=ptype,
        notes_for_nurse="Practice client for testing. Not a real person.",
    ).insert()
    place = await CarePlace(
        id=PLACE_ID,
        client_id=CLIENT_ID,
        label="Home",
        address_text="Test address, Kampala",
        lat=lat,
        lng=lng,
        radius_m=radius,
        location_source="coordinates",
        is_primary=True,
        created_by=str(admin.id),
        geo={"type": "Point", "coordinates": [lng, lat]},
    ).insert()
    await PlaceStay(
        id=STAY_ID,
        client_id=CLIENT_ID,
        place_id=PLACE_ID,
        starts_on=(datetime.now(UTC).astimezone(TZ).date() - timedelta(days=30)).isoformat(),
    ).insert()
    await _seed(
        DEFAULT_SCENARIO,
        cfg,
        await _client_doc(),
        place,
        str(nurse.id),
        str(admin.id),
        supervisor_id,
    )


async def _seed(
    name: str, cfg, client, place, nurse_id: str, admin_id: str, supervisor_id: str | None
) -> int:
    now = datetime.now(UTC)
    for spec in SCENARIOS[name]["visits"]:
        await _insert_visit(
            client=client,
            place=place,
            nurse_id=nurse_id,
            admin_id=admin_id,
            supervisor_id=supervisor_id,
            spec=spec,
            now=now,
        )
    cfg.scenario, cfg.day_offset = name, 0
    await cfg.save()
    return len(SCENARIOS[name]["visits"])


async def ensure(actor) -> None:
    """Called when a test account is switched on or the test data is reset: bring the client back if it is wanted."""
    cfg = await _cfg()
    if cfg.enabled and cfg.client_enabled and await _client_doc() is None:
        await _create(actor)


async def enable(actor, patient_type: str | None = None) -> dict:
    cfg = await _cfg()
    if not cfg.enabled:
        raise ValidationFailed("Turn the test accounts master switch on first.", {"enabled": "off"})
    if patient_type is not None and patient_type not in PATIENT_TYPES:
        raise ValidationFailed("Unknown patient type.", {"patient_type": "invalid"})
    cfg.client_enabled = True
    if patient_type:
        cfg.client_patient_type = patient_type
    await cfg.save()
    await _create(actor, patient_type)
    await audit.record(actor, "test_account.client.enable", "care_client", CLIENT_ID, "test client")
    return await status()


async def disable(actor) -> dict:
    """Switch the client off and delete it with everything attached to it."""
    from app.modules.care_clients.models import CareClient
    from app.modules.places.models import CarePlace, PlaceStay

    cfg = await _cfg()
    cfg.client_enabled, cfg.day_offset, cfg.scenario = False, 0, None
    await cfg.save()
    if await _client_doc() is not None:
        await _wipe_visits(tombstones=True)
        await PlaceStay.find(PlaceStay.client_id == CLIENT_ID).delete()
        await CarePlace.find(CarePlace.client_id == CLIENT_ID).delete()
        await CareClient.find(CareClient.id == CLIENT_ID).delete()
    await audit.record(
        actor, "test_account.client.disable", "care_client", CLIENT_ID, "test client"
    )
    return await status()


# --------------------------------------------------------------------------- wiping visits


async def _wipe_visits(*, tombstones: bool) -> int:
    """Delete the client's visits and everything hung on them: records, forms, alerts, photos, and the nurse's timesheets.

    With `tombstones` the nurse app is told each visit is gone, so it drops them from its cached schedule.
    """
    from app.modules.care_forms.models import CareFormCopyLog, CareFormInstance, CareFormSignature
    from app.modules.care_ops.models import CareAlert, CareTimesheet, SOSCase
    from app.modules.flags.models import VisitFlag
    from app.modules.visits.models import (
        Visit,
        VisitAnnotation,
        VisitEvent,
        VisitNote,
        VisitPhoto,
        VisitSyncTombstone,
    )

    visits = await Visit.find(Visit.client_id == CLIENT_ID).to_list()
    vids = [v.id for v in visits]
    nurse_ids = sorted({v.nurse_id for v in visits})
    await _delete_photo_files(vids)
    if tombstones:
        for v in visits:
            await VisitSyncTombstone(
                id=f"{v.id}:{datetime.now(UTC).timestamp()}", nurse_id=v.nurse_id, visit_id=v.id
            ).insert()
    for model in (
        VisitEvent,
        VisitNote,
        VisitPhoto,
        VisitFlag,
        VisitAnnotation,
        CareAlert,
        SOSCase,
    ):
        await model.find({"visit_id": {"$in": vids}}).delete()
    forms = await CareFormInstance.find({"client_id": CLIENT_ID}).to_list()
    form_ids = [str(f.id) for f in forms]
    await CareFormSignature.find({"instance_id": {"$in": form_ids}}).delete()
    await CareFormCopyLog.find({"client_id": CLIENT_ID}).delete()
    await CareFormInstance.find({"client_id": CLIENT_ID}).delete()
    if nurse_ids:
        await CareTimesheet.find({"nurse_id": {"$in": nurse_ids}}).delete()
    await Visit.find({"client_id": CLIENT_ID}).delete()
    return len(vids)


async def _delete_photo_files(visit_ids: list[str]) -> int:
    from app.core.config import get_settings
    from app.core.photo_store import delete_asset
    from app.modules.visits.models import VisitPhoto

    removed = 0
    for photo in await VisitPhoto.find({"visit_id": {"$in": visit_ids}}).to_list():
        try:
            if await delete_asset(
                get_settings(), photo.cloudinary_public_id, delivery_type=photo.delivery_type
            ):
                removed += 1
        except Exception:
            log.warning("test photo file could not be removed (%s)", photo.id)
    return removed


# --------------------------------------------------------------------------- scenarios and single visits


async def apply_scenario(actor, name: str) -> dict:
    """Replace the client's visits with a scenario built around the real now. The days go back to today."""
    if name not in SCENARIOS:
        raise ValidationFailed("Unknown scenario.", {"scenario": "invalid"})
    cfg, client, place, nurse, admin = await _require_present()
    await _wipe_visits(tombstones=True)
    supervisor_id = client.supervisor_id
    count = await _seed(name, cfg, client, place, str(nurse.id), str(admin.id), supervisor_id)
    checks = await run_checks(actor)
    await audit.record(
        actor,
        "test_account.client.scenario",
        "care_client",
        CLIENT_ID,
        "test client",
        after={"scenario": name, "visits": count},
    )
    return {**await status(), "checks": checks}


async def add_visit(actor, *, day: int, at: str, length: int, state: str) -> dict:
    """Add one visit `day` days from today (negative = past) at HH:MM Kampala time."""
    if not _TIME_RE.match(at or ""):
        raise ValidationFailed("Enter the time as HH:MM.", {"at": "invalid"})
    if not 15 <= length <= 480:
        raise ValidationFailed(
            "A visit lasts between 15 minutes and 8 hours.", {"length": "invalid"}
        )
    cfg, client, place, nurse, admin = await _require_present()
    await _insert_visit(
        client=client,
        place=place,
        nurse_id=str(nurse.id),
        admin_id=str(admin.id),
        supervisor_id=client.supervisor_id,
        spec={"day": day, "at": at, "length": length, "state": state},
        now=datetime.now(UTC),
    )
    checks = await run_checks(actor)
    await audit.record(
        actor,
        "test_account.client.visit",
        "care_client",
        CLIENT_ID,
        "test client",
        after={"day": day, "at": at, "length": length, "state": state},
    )
    return {**await status(), "checks": checks}


# --------------------------------------------------------------------------- day controls


async def shift_days(actor, days: int) -> dict:
    """Move the test world on (days > 0) or back (days < 0) by moving the test nurse's data the opposite way."""
    cfg, _client, _place, nurse, _admin = await _require_present()
    new_offset = check_offset(cfg.day_offset, days)
    counts = await _shift_nurse_data(str(nurse.id), timedelta(days=-days))
    cfg.day_offset = new_offset
    await cfg.save()
    checks = await run_checks(actor) if days > 0 else {}
    await audit.record(
        actor,
        "test_account.client.days",
        "care_client",
        CLIENT_ID,
        "test client",
        after={"moved": days, "day_offset": new_offset, "records": counts},
    )
    return {**await status(), "moved": counts, "checks": checks}


async def back_to_today(actor) -> dict:
    cfg = await _cfg()
    if cfg.day_offset == 0:
        return await status()
    out: dict = {}
    remaining = cfg.day_offset
    while remaining:
        step = max(-MAX_STEP_DAYS, min(MAX_STEP_DAYS, -remaining))
        out = await shift_days(actor, step)
        remaining += step
    return out


async def _shift_nurse_data(nurse_id: str, delta: timedelta) -> dict:
    """Add `delta` to every time field of the test nurse's records. The visits' `updated_at` becomes now so the nurse app re-syncs."""
    from app.modules.care_forms.models import CareFormInstance
    from app.modules.care_ops.models import CareAlert, CareInboxNotification, SOSCase
    from app.modules.flags.models import VisitFlag
    from app.modules.visits.models import Visit, VisitEvent, VisitNote, VisitPhoto

    now = datetime.now(UTC)
    plan = [
        (Visit, "nurse_id"),
        (VisitEvent, "nurse_id"),
        (VisitNote, "nurse_id"),
        (VisitPhoto, "nurse_id"),
        (VisitFlag, "nurse_id"),
        (CareAlert, "nurse_id"),
        (SOSCase, "nurse_id"),
        (CareFormInstance, "nurse_id"),
        (CareInboxNotification, "user_id"),
    ]
    counts: dict = {}
    for model, owner_field in plan:
        fields = SHIFTED_FIELDS[model.__name__]
        collection = model.get_pymongo_collection()
        moved = 0
        for doc in await model.find({owner_field: nurse_id}).to_list():
            update = {}
            for field in fields:
                value = getattr(doc, field, None)
                if isinstance(value, datetime):
                    update[field] = shift_datetime(value, delta)
            if model is Visit:
                update["updated_at"] = now
            if update:
                await collection.update_one({"_id": doc.id}, {"$set": update})
                moved += 1
        counts[model.__name__] = moved
    # Signatures hang off the forms rather than the nurse.
    from app.modules.care_forms.models import CareFormSignature

    form_ids = [str(f.id) for f in await CareFormInstance.find({"nurse_id": nurse_id}).to_list()]
    sig_collection = CareFormSignature.get_pymongo_collection()
    sigs = 0
    for sig in await CareFormSignature.find({"instance_id": {"$in": form_ids}}).to_list():
        await sig_collection.update_one(
            {"_id": sig.id}, {"$set": {"signed_at": shift_datetime(sig.signed_at, delta)}}
        )
        sigs += 1
    counts["CareFormSignature"] = sigs
    return {k: v for k, v in counts.items() if v}


# --------------------------------------------------------------------------- checks the scheduler would run


async def run_checks(actor=None) -> dict:
    """Run the late-visit, safety-timer and weekly-timesheet jobs now, for the test nurse only.

    The scheduler does the same every minute (alerts) and at 02:15 (timesheets); this just does not make you wait.
    """
    from app import jobs
    from app.modules.care_ops.rules import period_bounds
    from app.modules.visits.models import Visit

    nurse = await service._user("nurse")
    if nurse is None:
        return {}
    ids = {str(nurse.id)}
    cfg = await _cfg()
    alerts = await jobs.run_care_alerts(nurse_ids=ids)
    weeks = {period_bounds(world_date(datetime.now(UTC), cfg.day_offset), "weekly")[0]}
    for v in await Visit.find(
        Visit.nurse_id == str(nurse.id), Visit.status == "completed"
    ).to_list():
        weeks.add(period_bounds(v.scheduled_start.date(), "weekly")[0])
    sheets = 0
    for week_start in sorted(weeks):
        sheets += await jobs.run_timesheet_generation(week_start, nurse_ids=ids)
    return {"alerts_created": alerts, "timesheets_created": sheets}


# --------------------------------------------------------------------------- client details


async def set_location(actor, *, lat: float, lng: float, radius_m: int) -> dict:
    """Put the client's home where you are testing from, so check-ins read as verified (or not, on purpose)."""
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValidationFailed("That is not a valid latitude and longitude.", {"lat": "invalid"})
    if not 50 <= radius_m <= 1000:
        raise ValidationFailed("The radius is between 50 and 1000 metres.", {"radius_m": "invalid"})
    from app.modules.visits.models import Visit
    from app.modules.visits.rules import make_snapshot

    cfg, _client, place, _nurse, _admin = await _require_present()
    place.lat, place.lng, place.radius_m = lat, lng, radius_m
    place.geo = {"type": "Point", "coordinates": [lng, lat]}
    await place.save()
    cfg.client_lat, cfg.client_lng, cfg.client_radius_m = lat, lng, radius_m
    await cfg.save()
    snapshot = make_snapshot(place.model_dump())
    for visit in await Visit.find(Visit.client_id == CLIENT_ID).to_list():
        visit.place_snapshot = (
            snapshot  # the check-in is judged against the snapshot taken when the visit was made
        )
        visit.updated_at = datetime.now(UTC)
        await visit.save()
    await audit.record(
        actor,
        "test_account.client.location",
        "care_place",
        PLACE_ID,
        "test client",
        after={"lat": lat, "lng": lng, "radius_m": radius_m},
    )
    return await status()


async def set_patient_type(actor, patient_type: str) -> dict:
    if patient_type not in PATIENT_TYPES:
        raise ValidationFailed("Unknown patient type.", {"patient_type": "invalid"})
    cfg, client, *_ = await _require_present()
    client.patient_type = patient_type
    client.updated_at = datetime.now(UTC)
    await client.save()
    cfg.client_patient_type = patient_type
    await cfg.save()
    await audit.record(
        actor,
        "test_account.client.type",
        "care_client",
        CLIENT_ID,
        "test client",
        after={"patient_type": patient_type},
    )
    return await status()


async def sync_supervisor(supervisor_id: str | None) -> None:
    """The test admin was linked to or unlinked from the test nurse: point the client and its visits at the same supervisor."""
    from app.modules.visits.models import Visit

    client = await _client_doc()
    if client is None:
        return
    client.supervisor_id = supervisor_id
    await client.save()
    for visit in await Visit.find(Visit.client_id == CLIENT_ID).to_list():
        visit.supervisor_id = supervisor_id
        await visit.save()


async def after_purge() -> None:
    """All test data is gone, so the client is gone and the days are back to real time. The wish for a client is kept."""
    cfg = await _cfg()
    cfg.day_offset, cfg.scenario = 0, None
    await cfg.save()
