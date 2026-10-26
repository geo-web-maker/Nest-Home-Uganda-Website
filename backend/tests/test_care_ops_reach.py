import pytest

from app.core.deps import ReachContext
from app.modules.care_ops.models import CareAlert, CareTimesheet
from app.modules.care_ops.router import _alert_in_reach, _timesheet_in_reach, _visit_in_reach
from app.modules.visits.models import Visit


@pytest.mark.asyncio
async def test_visit_reach_isolated_for_own_and_team():
    own = ReachContext(user_id="nurse-a", reach="own")
    team = ReachContext(user_id="supervisor-a", reach="team", team_nurse_ids=("nurse-a",))
    visit_a = Visit(
        id="visit-0001",
        client_id="client-0001",
        nurse_id="nurse-a",
        place_id="place-0001",
        scheduled_start="2026-10-25T08:00:00Z",
        scheduled_end="2026-10-25T09:00:00Z",
    )
    visit_b = Visit(
        id="visit-0002",
        client_id="client-0002",
        nurse_id="nurse-b",
        place_id="place-0002",
        scheduled_start="2026-10-25T08:00:00Z",
        scheduled_end="2026-10-25T09:00:00Z",
    )
    assert await _visit_in_reach(visit_a, own)
    assert not await _visit_in_reach(visit_b, own)
    assert await _visit_in_reach(visit_a, team)
    assert not await _visit_in_reach(visit_b, team)


@pytest.mark.asyncio
async def test_alert_reach_isolated_by_assigned_nurse():
    own = ReachContext(user_id="nurse-a", reach="own")
    alert_a = CareAlert(
        id="alert-0001", type="late_visit", nurse_id="nurse-a", message="Review needed"
    )
    alert_b = CareAlert(
        id="alert-0002", type="late_visit", nurse_id="nurse-b", message="Review needed"
    )
    assert await _alert_in_reach(alert_a, own)
    assert not await _alert_in_reach(alert_b, own)


def test_timesheet_reach_isolated_for_own_and_team():
    own = ReachContext(user_id="nurse-a", reach="own")
    team = ReachContext(user_id="supervisor-a", reach="team", team_nurse_ids=("nurse-a",))
    sheet_a = CareTimesheet(
        id="sheet-0001", nurse_id="nurse-a", period_start="2026-10-19", period_end="2026-10-25"
    )
    sheet_b = CareTimesheet(
        id="sheet-0002", nurse_id="nurse-b", period_start="2026-10-19", period_end="2026-10-25"
    )
    assert _timesheet_in_reach(sheet_a, own)
    assert not _timesheet_in_reach(sheet_b, own)
    assert _timesheet_in_reach(sheet_a, team)
    assert not _timesheet_in_reach(sheet_b, team)
