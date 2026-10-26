from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from app.core.db import get_care_database
from app.core.deps import Principal
from app.modules.care_clients.models import CareClient
from app.modules.field import router as field_module
from app.modules.field.router import AdhocVisitIn, create_adhoc_visit
from app.modules.flags.models import VisitFlag
from app.modules.nurses.models import NurseProfile
from app.modules.places.models import CarePlace, PlaceStay
from app.modules.visits.models import Visit


def unique(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


async def seed_assigned_client(nurse_id: str, *, assigned: bool = True, stay: bool = True):
    client_id = unique("client")
    place_id = unique("place")
    now = datetime.now(ZoneInfo("Africa/Kampala"))
    await NurseProfile(user_id=nurse_id, staff_number=unique("staff")).insert()
    await CareClient(
        id=client_id,
        display_name="Assigned test client",
        assigned_nurse_ids=[nurse_id] if assigned else [],
    ).insert()
    await CarePlace(
        id=place_id, client_id=client_id, address_text="Test place", lat=0, lng=0
    ).insert()
    if stay:
        await PlaceStay(
            id=unique("stay"),
            client_id=client_id,
            place_id=place_id,
            starts_on=now.date().isoformat(),
        ).insert()
    payload = AdhocVisitIn(
        id=unique("visit"),
        client_op_id=unique("op"),
        client_id=client_id,
        device_time=now,
        sent_at_device=now,
        lat=0,
        lng=0,
        accuracy_m=5,
        source="pwa_manual",
    )
    return payload


async def enabled_settings():
    return {
        "visits.adhoc_enabled": True,
        "visits.adhoc_default_minutes": 60,
        "visits.sync_window_past_hours": 24,
        "visits.sync_window_future_days": 14,
    }


async def test_adhoc_visit_is_created_once_with_checkin_and_flag(mongo, monkeypatch):
    monkeypatch.setattr(field_module, "care_values", enabled_settings)
    principal = Principal(
        user_id=unique("nurse"), scopes=frozenset({"field:use"}), is_superadmin=False
    )
    payload = await seed_assigned_client(principal.user_id)

    result = await create_adhoc_visit(payload, principal)
    duplicate = await create_adhoc_visit(payload, principal)

    assert result["status"] == "accepted"
    assert duplicate["status"] == "duplicate"
    care = get_care_database()
    assert await care["visits"].count_documents({"id": payload.id}) == 1
    assert await care["visit_events"].count_documents({"client_op_id": payload.client_op_id}) == 1
    assert (
        await care["visit_flags"].count_documents({"visit_id": payload.id, "type": "adhoc_visit"})
        == 1
    )


async def test_adhoc_rejects_unassigned_client_and_missing_stay(mongo, monkeypatch):
    monkeypatch.setattr(field_module, "care_values", enabled_settings)
    unassigned_principal = Principal(
        user_id=unique("nurse"), scopes=frozenset({"field:use"}), is_superadmin=False
    )
    no_stay_principal = Principal(
        user_id=unique("nurse"), scopes=frozenset({"field:use"}), is_superadmin=False
    )
    unassigned = await seed_assigned_client(unassigned_principal.user_id, assigned=False)
    no_stay = await seed_assigned_client(no_stay_principal.user_id, stay=False)

    assert (await create_adhoc_visit(unassigned, unassigned_principal))[
        "reason"
    ] == "client_not_assigned"
    assert (await create_adhoc_visit(no_stay, no_stay_principal))["reason"] == "no_current_place"


async def test_adhoc_rejects_when_disabled_even_if_client_is_assigned(mongo, monkeypatch):
    async def disabled_settings():
        return {**await enabled_settings(), "visits.adhoc_enabled": False}

    monkeypatch.setattr(field_module, "care_values", disabled_settings)
    principal = Principal(
        user_id=unique("nurse"), scopes=frozenset({"field:use"}), is_superadmin=False
    )
    payload = await seed_assigned_client(principal.user_id)

    result = await create_adhoc_visit(payload, principal)

    assert result == {"status": "rejected", "reason": "adhoc_disabled"}
    assert await Visit.find_one(Visit.id == payload.id) is None


async def test_adhoc_transaction_rolls_back_visit_and_event_if_flag_insert_fails(
    mongo, monkeypatch
):
    monkeypatch.setattr(field_module, "care_values", enabled_settings)
    principal = Principal(
        user_id=unique("nurse"), scopes=frozenset({"field:use"}), is_superadmin=False
    )
    payload = await seed_assigned_client(principal.user_id)

    async def fail_flag_insert(self, *args, **kwargs):
        raise RuntimeError("forced flag insert failure")

    monkeypatch.setattr(VisitFlag, "insert", fail_flag_insert)
    with pytest.raises(RuntimeError, match="forced flag insert failure"):
        await create_adhoc_visit(payload, principal)

    care = get_care_database()
    assert await care["visits"].count_documents({"id": payload.id}) == 0
    assert await care["visit_events"].count_documents({"client_op_id": payload.client_op_id}) == 0
