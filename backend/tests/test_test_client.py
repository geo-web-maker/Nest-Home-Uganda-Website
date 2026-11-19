"""Test client and day controls: pure rules first, then the database behaviour (needs TEST_MONGODB_URI)."""

import re
import time
from datetime import UTC, datetime, timedelta

import pytest

from app.core import sandbox
from app.core.errors import ValidationFailed
from app.modules.test_accounts import client as tc
from app.modules.test_accounts import service

# --------------------------------------------------------------------------- pure rules


def test_shift_keeps_none_and_reads_naive_as_utc():
    assert tc.shift_datetime(None, timedelta(days=1)) is None
    naive = datetime(2026, 11, 19, 9, 0)
    assert tc.shift_datetime(naive, timedelta(days=-1)) == datetime(2026, 11, 18, 9, 0, tzinfo=UTC)
    aware = datetime(2026, 11, 19, 9, 0, tzinfo=UTC)
    assert tc.shift_datetime(aware, timedelta(days=2)) == datetime(2026, 11, 21, 9, 0, tzinfo=UTC)


def test_resolve_start_in_minutes_from_now_drops_seconds():
    now = datetime(2026, 11, 19, 7, 30, 42, tzinfo=UTC)
    assert tc.resolve_start({"minutes": 10}, now) == datetime(2026, 11, 19, 7, 40, tzinfo=UTC)
    assert tc.resolve_start({"minutes": -50}, now) == datetime(2026, 11, 19, 6, 40, tzinfo=UTC)


def test_resolve_start_by_day_uses_kampala_time():
    now = datetime(2026, 11, 19, 7, 30, tzinfo=UTC)  # 10:30 in Kampala
    # 09:00 Kampala is 06:00 UTC, and a day offset counts Kampala days
    assert tc.resolve_start({"day": 0, "at": "09:00"}, now) == datetime(2026, 11, 19, 6, 0, tzinfo=UTC)
    assert tc.resolve_start({"day": -1, "at": "09:00"}, now) == datetime(2026, 11, 18, 6, 0, tzinfo=UTC)
    late = datetime(2026, 11, 19, 22, 30, tzinfo=UTC)  # already the 20th in Kampala
    assert tc.resolve_start({"day": 0, "at": "09:00"}, late) == datetime(2026, 11, 20, 6, 0, tzinfo=UTC)


def test_world_date_moves_on_by_the_offset():
    late = datetime(2026, 11, 19, 22, 30, tzinfo=UTC)
    assert tc.world_date(late, 0).isoformat() == "2026-11-20"
    assert tc.world_date(late, 3).isoformat() == "2026-11-23"
    assert tc.world_date(late, -1).isoformat() == "2026-11-19"


def test_check_offset_limits():
    assert tc.check_offset(0, 1) == 1
    assert tc.check_offset(3, -5) == -2
    for bad in (0, tc.MAX_STEP_DAYS + 1, -(tc.MAX_STEP_DAYS + 1)):
        with pytest.raises(ValidationFailed):
            tc.check_offset(0, bad)
    with pytest.raises(ValidationFailed):
        tc.check_offset(tc.MAX_OFFSET_DAYS - 1, 2)


def test_every_scenario_is_well_formed():
    assert tc.DEFAULT_SCENARIO in tc.SCENARIOS
    for name, scenario in tc.SCENARIOS.items():
        assert scenario["label"] and scenario["about"], name
        assert scenario["visits"], name
        for spec in scenario["visits"]:
            if "minutes" in spec:
                assert "day" not in spec and "at" not in spec, (name, spec)
            else:
                assert re.match(r"^([01]\d|2[0-3]):[0-5]\d$", spec["at"]), (name, spec)
                assert -14 <= spec["day"] <= 21, (name, spec)  # inside what the nurse app syncs
            assert spec.get("state", "scheduled") in tc.VISIT_STATES, (name, spec)
            assert 15 <= spec.get("length", 60) <= 480, (name, spec)


def test_overdue_scenario_really_is_overdue():
    """The safety timer is end + 30 minutes, so the visit must have ended more than 30 minutes ago."""
    now = datetime(2026, 11, 19, 7, 30, tzinfo=UTC)
    spec = tc.SCENARIOS["overdue_checkout"]["visits"][0]
    end = tc.resolve_start(spec, now) + timedelta(minutes=spec["length"])
    assert end + timedelta(minutes=30) <= now


def test_missed_scenario_is_late_enough_for_the_job():
    now = datetime(2026, 11, 19, 7, 30, tzinfo=UTC)
    spec = tc.SCENARIOS["missed_visit"]["visits"][0]
    assert (now - tc.resolve_start(spec, now)).total_seconds() >= 30 * 60  # the job's grace period


def test_shifted_fields_exist_on_their_models():
    from app.modules.care_forms.models import CareFormInstance
    from app.modules.care_ops.models import CareAlert, CareInboxNotification, SOSCase
    from app.modules.flags.models import VisitFlag
    from app.modules.visits.models import Visit, VisitEvent, VisitNote, VisitPhoto

    models = {m.__name__: m for m in (Visit, VisitEvent, VisitNote, VisitPhoto, VisitFlag, CareAlert, SOSCase,
                                       CareFormInstance, CareInboxNotification)}
    assert set(tc.SHIFTED_FIELDS) == set(models)
    for name, fields in tc.SHIFTED_FIELDS.items():
        for field in fields:
            assert field in models[name].model_fields, (name, field)


def _sandbox_with(ids):
    sandbox._cache.update(at=time.monotonic(), ids=frozenset(ids), emails=frozenset(), enabled=True,
                          delivery="sink", allow_emails=frozenset(), allow_phones=frozenset())


async def test_alerts_about_a_test_nurse_run_inside_the_sandbox():
    """The scheduler has no signed-in user. Without this, a seeded missed visit would text the real on-call team."""
    _sandbox_with({"test-nurse-id"})
    sandbox._active.set(False)
    async with sandbox.acting_as("test-nurse-id"):
        assert sandbox.active() is True
    assert sandbox.active() is False
    async with sandbox.acting_as("a-real-nurse"):
        assert sandbox.active() is False
    async with sandbox.acting_as(None):
        assert sandbox.active() is False


async def test_notify_alert_for_a_test_nurse_is_sandboxed(monkeypatch):
    from types import SimpleNamespace

    from app.modules.care_ops import dispatch

    _sandbox_with({"test-nurse-id"})
    sandbox._active.set(False)
    seen = {}

    async def fake(alert):
        seen["active"] = sandbox.active()

    monkeypatch.setattr(dispatch, "_notify_alert", fake)
    await dispatch.notify_alert(SimpleNamespace(nurse_id="test-nurse-id"))
    assert seen["active"] is True
    await dispatch.notify_alert(SimpleNamespace(nurse_id="real-nurse"))
    assert seen["active"] is False


# --------------------------------------------------------------------------- database behaviour


async def _on(mongo):
    """Master switch on, both test accounts created, the test admin linked as the test nurse's supervisor."""
    await service.set_master(None, True)
    nurse, admin = await service._user("nurse"), await service._user("admin")
    await service.set_link(None, True)
    return nurse, admin


async def test_enable_creates_the_client_with_visits_for_the_test_nurse(mongo):
    from app.modules.care_clients.models import CareClient
    from app.modules.places.models import CarePlace, PlaceStay
    from app.modules.visits.models import Visit

    nurse, admin = await _on(mongo)
    out = await tc.enable(None)
    assert out["present"] and out["enabled"] and out["scenario"] == tc.DEFAULT_SCENARIO
    client = await CareClient.find_one(CareClient.id == tc.CLIENT_ID)
    assert client.assigned_nurse_ids == [str(nurse.id)]
    assert client.created_by == str(admin.id)  # so the normal purge removes it
    assert client.supervisor_id == str(admin.id)
    assert await CarePlace.find_one(CarePlace.id == tc.PLACE_ID)
    assert await PlaceStay.find_one(PlaceStay.client_id == tc.CLIENT_ID)
    visits = await Visit.find(Visit.client_id == tc.CLIENT_ID).to_list()
    assert len(visits) == len(tc.SCENARIOS[tc.DEFAULT_SCENARIO]["visits"])
    assert all(v.nurse_id == str(nurse.id) and v.supervisor_id == str(admin.id) for v in visits)
    assert {v.status for v in visits} == {"scheduled", "completed"}


async def test_enable_needs_the_master_switch(mongo):
    with pytest.raises(ValidationFailed):
        await tc.enable(None)


async def test_real_staff_do_not_see_the_test_client_but_the_test_nurse_does(mongo):
    from app.modules.care_clients.models import CareClient
    from app.modules.visits.models import Visit

    nurse, _admin = await _on(mongo)
    await tc.enable(None)
    await sandbox._load()
    sandbox._cache["at"] = 0.0
    await sandbox.bind("a-real-staff-member")
    assert await CareClient.find_one(CareClient.id == tc.CLIENT_ID) is None
    assert await Visit.find(Visit.client_id == tc.CLIENT_ID).to_list() == []
    sandbox._cache["at"] = 0.0
    await sandbox.bind(str(nurse.id))
    assert await CareClient.find_one(CareClient.id == tc.CLIENT_ID) is not None
    sandbox.reveal()


async def test_skip_to_next_day_moves_tomorrows_visit_to_today_and_bumps_sync(mongo):
    from app.modules.visits.models import Visit

    nurse, _ = await _on(mongo)
    await tc.enable(None)
    await tc.apply_scenario(None, "daily_week")
    before = {v.id: v for v in await Visit.find(Visit.nurse_id == str(nurse.id)).to_list()}
    stamp = datetime.now(UTC)
    out = await tc.shift_days(None, 1)
    assert out["day_offset"] == 1 and out["moved"]["Visit"] == len(before)
    after = {v.id: v for v in await Visit.find(Visit.nurse_id == str(nurse.id)).to_list()}
    for vid, old in before.items():
        assert after[vid].scheduled_start == old.scheduled_start - timedelta(days=1)
        assert after[vid].scheduled_end == old.scheduled_end - timedelta(days=1)
        assert after[vid].updated_at >= stamp  # the nurse app pulls changes by updated_at
        if old.check_in_at:
            assert after[vid].check_in_at == old.check_in_at - timedelta(days=1)


async def test_unattended_visit_becomes_missed_after_skipping_a_day(mongo):
    from app.modules.care_ops.models import CareAlert
    from app.modules.visits.models import Visit

    nurse, _ = await _on(mongo)
    await tc.enable(None)
    await tc.apply_scenario(None, "standard_day")
    due_today = await Visit.find(Visit.nurse_id == str(nurse.id), Visit.status == "scheduled").sort("scheduled_start").first_or_none()
    out = await tc.shift_days(None, 1)
    assert out["checks"]["alerts_created"] >= 1
    assert (await Visit.find_one(Visit.id == due_today.id)).status == "missed"
    assert await CareAlert.find_one(CareAlert.id == f"late:{due_today.id}")


async def test_back_to_today_undoes_the_moves(mongo):
    from app.modules.visits.models import Visit

    nurse, _ = await _on(mongo)
    await tc.enable(None)
    await tc.apply_scenario(None, "daily_week")
    start = {v.id: v.scheduled_start for v in await Visit.find(Visit.nurse_id == str(nurse.id)).to_list()}
    await tc.shift_days(None, 5)
    await tc.shift_days(None, -2)
    out = await tc.back_to_today(None)
    assert out["day_offset"] == 0
    now = {v.id: v.scheduled_start for v in await Visit.find(Visit.nurse_id == str(nurse.id)).to_list()}
    assert now == start


async def test_a_scenario_replaces_the_visits_and_tells_the_nurse_app(mongo):
    from app.modules.visits.models import Visit, VisitSyncTombstone

    nurse, _ = await _on(mongo)
    await tc.enable(None)
    old_ids = {v.id for v in await Visit.find(Visit.client_id == tc.CLIENT_ID).to_list()}
    out = await tc.apply_scenario(None, "back_to_back")
    new_ids = {v["id"] for v in out["visits"]}
    assert len(new_ids) == 3 and not (new_ids & old_ids)
    removed = {t.visit_id for t in await VisitSyncTombstone.find(VisitSyncTombstone.nurse_id == str(nurse.id)).to_list()}
    assert old_ids <= removed
    assert out["day_offset"] == 0 and out["scenario"] == "back_to_back"


async def test_overdue_scenario_raises_the_critical_safety_alert(mongo):
    from app.modules.care_ops.models import CareAlert

    await _on(mongo)
    await tc.enable(None)
    await tc.apply_scenario(None, "overdue_checkout")
    alerts = await CareAlert.find(CareAlert.type == "safety_timer").to_list()
    assert len(alerts) == 1 and alerts[0].severity == "critical"


async def test_timesheet_scenario_generates_the_week(mongo):
    from app.modules.care_ops.models import CareTimesheet

    nurse, _ = await _on(mongo)
    from app.modules.nurses.models import NurseProfile

    profile = await NurseProfile.find_one(NurseProfile.user_id == str(nurse.id))
    profile.active = True  # the timesheet job only covers active nurses
    await profile.save()
    await tc.enable(None)
    await tc.apply_scenario(None, "timesheet_history")
    sheets = await CareTimesheet.find(CareTimesheet.nurse_id == str(nurse.id)).to_list()
    assert sheets and sum(s.completed_visits for s in sheets) == 6


async def test_checks_only_touch_the_test_nurse(mongo):
    """A real nurse's late visit must not be marked missed by the test client's checks."""
    from app.modules.visits.models import Visit

    await _on(mongo)
    await tc.enable(None)
    now = datetime.now(UTC)
    await Visit(id="real-late", client_id="real-client", nurse_id="real-nurse", place_id="p",
                scheduled_start=now - timedelta(hours=3), scheduled_end=now - timedelta(hours=2)).insert()
    await tc.run_checks(None)
    assert (await Visit.find_one(Visit.id == "real-late")).status == "scheduled"


async def test_location_updates_the_place_and_the_visit_snapshots(mongo):
    from app.modules.visits.models import Visit

    await _on(mongo)
    await tc.enable(None)
    out = await tc.set_location(None, lat=1.5, lng=33.25, radius_m=300)
    assert out["place"]["lat"] == 1.5 and out["place"]["radius_m"] == 300
    for visit in await Visit.find(Visit.client_id == tc.CLIENT_ID).to_list():
        assert visit.place_snapshot["lat"] == 1.5 and visit.place_snapshot["radius_m"] == 300
    with pytest.raises(ValidationFailed):
        await tc.set_location(None, lat=95, lng=0, radius_m=150)


async def test_disable_deletes_the_client_and_everything_on_it(mongo):
    from app.modules.care_clients.models import CareClient
    from app.modules.places.models import CarePlace
    from app.modules.visits.models import Visit, VisitEvent

    await _on(mongo)
    await tc.enable(None)
    assert await VisitEvent.find().to_list()  # the completed visit in the default scenario has check-in/out records
    out = await tc.disable(None)
    assert not out["present"] and not out["enabled"]
    assert await CareClient.find_one(CareClient.id == tc.CLIENT_ID) is None
    assert await CarePlace.find(CarePlace.client_id == tc.CLIENT_ID).to_list() == []
    assert await Visit.find(Visit.client_id == tc.CLIENT_ID).to_list() == []
    assert await VisitEvent.find().to_list() == []


async def test_reset_keeps_a_wanted_client_and_starts_it_fresh(mongo):
    await _on(mongo)
    await tc.enable(None)
    await tc.shift_days(None, 3)
    await service.reset_data(None)
    out = await tc.status()
    assert out["present"] and out["day_offset"] == 0 and out["scenario"] == tc.DEFAULT_SCENARIO


async def test_purge_also_removes_care_forms_made_by_the_test_nurse(mongo):
    from app.modules.care_forms.models import CareFormInstance

    nurse, _ = await _on(mongo)
    await tc.enable(None)
    await CareFormInstance(form_id="01", client_id=tc.CLIENT_ID, nurse_id=str(nurse.id)).insert()
    await service.purge_data(None)
    assert await CareFormInstance.find().to_list() == []


async def test_linking_the_admin_points_the_client_and_visits_at_the_supervisor(mongo):
    from app.modules.care_clients.models import CareClient
    from app.modules.visits.models import Visit

    nurse, admin = await _on(mongo)
    await service.set_link(None, False)
    await tc.enable(None)
    assert (await CareClient.find_one(CareClient.id == tc.CLIENT_ID)).supervisor_id is None
    await service.set_link(None, True)
    assert (await CareClient.find_one(CareClient.id == tc.CLIENT_ID)).supervisor_id == str(admin.id)
    assert {v.supervisor_id for v in await Visit.find(Visit.client_id == tc.CLIENT_ID).to_list()} == {str(admin.id)}
