from app.core.deps import ReachContext, reach_filter


def test_reach_filter_own_team_all_and_empty_team():
    assert reach_filter(ReachContext("nurse-a", "own")) == {"nurse_id": "nurse-a"}
    assert reach_filter(ReachContext("supervisor", "team", ("nurse-a", "nurse-b"))) == {
        "nurse_id": {"$in": ["nurse-a", "nurse-b"]}
    }
    assert reach_filter(ReachContext("supervisor", "team", ())) == {"nurse_id": {"$in": []}}
    assert reach_filter(ReachContext("admin", "all")) == {}
    assert reach_filter(ReachContext("root", "own", (), True)) == {}
