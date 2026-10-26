from app.core.deps import ReachContext
from app.modules.nurses.router import _nurse_is_in_reach


def test_superadmin_can_reach_any_nurse():
    assert _nurse_is_in_reach("nurse-b", ReachContext("admin", "all", (), True))


def test_all_reach_can_reach_any_nurse():
    assert _nurse_is_in_reach("nurse-b", ReachContext("admin", "all"))


def test_own_reach_is_limited_to_self():
    ctx = ReachContext("nurse-a", "own")
    assert _nurse_is_in_reach("nurse-a", ctx)
    assert not _nurse_is_in_reach("nurse-b", ctx)


def test_team_reach_is_limited_to_team_members():
    ctx = ReachContext("supervisor-a", "team", ("nurse-a", "nurse-b"))
    assert _nurse_is_in_reach("supervisor-a", ctx)
    assert _nurse_is_in_reach("nurse-a", ctx)
    assert not _nurse_is_in_reach("nurse-c", ctx)


def test_unknown_reach_fails_closed():
    assert not _nurse_is_in_reach("nurse-a", ReachContext("supervisor-a", "unknown"))


def test_reach_check_fails_closed_for_unknown_user():
    ctx = ReachContext("supervisor-a", "team", ("nurse-a",))
    assert not _nurse_is_in_reach("nurse-b", ctx)
