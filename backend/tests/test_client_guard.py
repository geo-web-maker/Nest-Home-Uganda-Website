"""The mail client guard: throttle old apps, force an update, pause a user, and log callers.

None of this needs a database: the policy is injected, and the ledger and throttle are memory.
"""

import logging
from datetime import UTC, datetime

import pytest
from starlette.requests import Request

from app.core import client_guard
from app.core.client_guard import (
    CURRENT_BUILD,
    Policy,
    Throttle,
    TrafficLedger,
    clean_user_ids,
    enforce,
    evaluate,
    is_legacy,
    parse_build,
)
from app.core.errors import ClientBlocked, RateLimited, UpgradeRequired


def make_request(build: str | None = None, path: str = "/api/v1/mail/mailboxes", ua: str = "test-agent") -> Request:
    headers = [(b"user-agent", ua.encode())]
    if build is not None:
        headers.append((b"x-client-build", build.encode()))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "query_string": b"",
            "headers": headers,
            "client": ("203.0.113.9", 5000),
            "server": ("test", 80),
            "scheme": "http",
        }
    )


@pytest.fixture
def policy_is(monkeypatch):
    """Make get_policy return the given policy."""

    def _set(**fields) -> Policy:
        policy = Policy(**fields)

        async def fake(fresh: bool = False, now: float | None = None) -> Policy:
            return policy

        monkeypatch.setattr(client_guard, "get_policy", fake)
        return policy

    return _set


# ---- header parsing and small helpers ---------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(None, None), ("", None), ("abc", None), ("-1", None), ("1.5", None), ("1", 1), (" 7 ", 7), ("0", 0), ("1234567890", None)],
)
def test_parse_build(raw, expected):
    assert parse_build(raw) == expected


def test_legacy_means_unversioned_or_older_than_current():
    assert is_legacy(None) is True
    assert is_legacy(CURRENT_BUILD - 1) is True
    assert is_legacy(CURRENT_BUILD) is False
    assert is_legacy(CURRENT_BUILD + 5) is False


def test_clean_user_ids_trims_dedupes_and_keeps_order():
    assert clean_user_ids([" a ", "b", "a", "", "   ", "c"]) == ["a", "b", "c"]
    assert clean_user_ids(["x" * 65, "ok"]) == ["ok"]


# ---- the pure decision ------------------------------------------------------------------------


def test_defaults_never_refuse_a_first_call():
    assert evaluate(Policy(), "u1", None, None) is None
    assert evaluate(Policy(), "u1", CURRENT_BUILD, None) is None


def test_legacy_caller_is_throttled_inside_the_interval_with_a_retry_time():
    policy = Policy(legacy_min_interval_seconds=300)
    decision = evaluate(policy, "u1", None, 60.0)
    assert decision is not None and decision.kind == "throttled"
    assert decision.retry_after == 240
    assert evaluate(policy, "u1", None, 301.0) is None


def test_current_build_is_never_throttled():
    policy = Policy(legacy_min_interval_seconds=300)
    assert evaluate(policy, "u1", CURRENT_BUILD, 1.0) is None


def test_zero_interval_switches_throttling_off():
    assert evaluate(Policy(legacy_min_interval_seconds=0), "u1", None, 1.0) is None


def test_block_unversioned_forces_update_for_clients_without_a_header():
    policy = Policy(block_unversioned=True)
    assert evaluate(policy, "u1", None, None).kind == "upgrade_required"
    assert evaluate(policy, "u1", CURRENT_BUILD, None) is None


def test_min_build_refuses_older_builds_and_lets_equal_or_newer_through():
    policy = Policy(min_build=2)
    assert evaluate(policy, "u1", 1, None).kind == "upgrade_required"
    assert evaluate(policy, "u1", None, None).kind == "upgrade_required"  # no header counts as build 0
    assert evaluate(policy, "u1", 2, None) is None
    assert evaluate(policy, "u1", 3, None) is None


def test_blocked_user_is_refused_even_on_the_current_build():
    policy = Policy(blocked_user_ids=frozenset({"u1"}))
    assert evaluate(policy, "u1", CURRENT_BUILD, None).kind == "blocked"
    assert evaluate(policy, "u2", CURRENT_BUILD, None) is None


def test_blocked_wins_over_upgrade_and_throttle():
    policy = Policy(blocked_user_ids=frozenset({"u1"}), min_build=9, block_unversioned=True)
    assert evaluate(policy, "u1", None, 1.0).kind == "blocked"


# ---- enforce: errors, throttle memory, ledger -------------------------------------------------


@pytest.mark.asyncio
async def test_old_client_second_call_is_throttled_then_allowed_after_the_interval(policy_is):
    policy_is(legacy_min_interval_seconds=300)
    ledger, throttle = TrafficLedger(), Throttle()
    await enforce(make_request(), "u1", ledger=ledger, throttle=throttle, mono=1000.0)
    with pytest.raises(RateLimited) as err:
        await enforce(make_request(), "u1", ledger=ledger, throttle=throttle, mono=1100.0)
    assert err.value.status_code == 429
    assert err.value.headers == {"Retry-After": "200"}
    await enforce(make_request(), "u1", ledger=ledger, throttle=throttle, mono=1301.0)


@pytest.mark.asyncio
async def test_a_refused_call_does_not_extend_the_wait(policy_is):
    policy_is(legacy_min_interval_seconds=300)
    ledger, throttle = TrafficLedger(), Throttle()
    await enforce(make_request(), "u1", ledger=ledger, throttle=throttle, mono=0.0)
    for at in (50.0, 100.0, 200.0):
        with pytest.raises(RateLimited):
            await enforce(make_request(), "u1", ledger=ledger, throttle=throttle, mono=at)
    await enforce(make_request(), "u1", ledger=ledger, throttle=throttle, mono=301.0)


@pytest.mark.asyncio
async def test_throttle_is_per_user_and_per_route(policy_is):
    policy_is(legacy_min_interval_seconds=300)
    ledger, throttle = TrafficLedger(), Throttle()
    await enforce(make_request(), "u1", ledger=ledger, throttle=throttle, mono=0.0)
    await enforce(make_request(), "u2", ledger=ledger, throttle=throttle, mono=1.0)
    await enforce(make_request(path="/api/v1/mail/unread"), "u1", ledger=ledger, throttle=throttle, mono=2.0)


@pytest.mark.asyncio
async def test_current_build_is_never_throttled_in_enforce(policy_is):
    policy_is(legacy_min_interval_seconds=300)
    ledger, throttle = TrafficLedger(), Throttle()
    for at in (0.0, 1.0, 2.0, 3.0):
        await enforce(make_request(str(CURRENT_BUILD)), "u1", ledger=ledger, throttle=throttle, mono=at)
    assert ledger.snapshot()[0]["calls"] == 4


@pytest.mark.asyncio
async def test_unversioned_client_gets_426_when_forced(policy_is):
    policy_is(block_unversioned=True)
    with pytest.raises(UpgradeRequired) as err:
        await enforce(make_request(), "u1", ledger=TrafficLedger(), throttle=Throttle(), mono=0.0)
    assert err.value.status_code == 426
    assert err.value.code == "upgrade_required"


@pytest.mark.asyncio
async def test_min_build_gate(policy_is):
    policy_is(min_build=2)
    with pytest.raises(UpgradeRequired):
        await enforce(make_request("1"), "u1", ledger=TrafficLedger(), throttle=Throttle(), mono=0.0)
    await enforce(make_request("2"), "u1", ledger=TrafficLedger(), throttle=Throttle(), mono=0.0)


@pytest.mark.asyncio
async def test_blocked_user_gets_403_client_blocked(policy_is):
    policy_is(blocked_user_ids=frozenset({"u1"}))
    with pytest.raises(ClientBlocked) as err:
        await enforce(make_request(str(CURRENT_BUILD)), "u1", ledger=TrafficLedger(), throttle=Throttle(), mono=0.0)
    assert err.value.status_code == 403
    assert err.value.code == "client_blocked"
    await enforce(make_request(str(CURRENT_BUILD)), "u2", ledger=TrafficLedger(), throttle=Throttle(), mono=0.0)


@pytest.mark.asyncio
async def test_every_call_is_recorded_including_refused_ones(policy_is):
    policy_is(legacy_min_interval_seconds=300)
    ledger, throttle = TrafficLedger(), Throttle()
    await enforce(make_request(), "u1", ledger=ledger, throttle=throttle, mono=0.0)
    with pytest.raises(RateLimited):
        await enforce(make_request(), "u1", ledger=ledger, throttle=throttle, mono=10.0)
    (row,) = ledger.snapshot()
    assert row["calls"] == 2
    assert row["last_result"] == "throttled"
    assert row["legacy"] is True and row["build"] is None
    assert row["route"] == "mailboxes"
    assert "203.0.113.9" not in str(row)  # raw IPs are never kept


# ---- ledger -----------------------------------------------------------------------------------


def test_ledger_logs_each_caller_once_per_interval(caplog):
    ledger = TrafficLedger(log_interval=600)
    with caplog.at_level(logging.INFO, logger="app.client_guard"):
        assert ledger.record("u1", "mailboxes", None, "ua", "h", wall=1.0, mono=0.0) is True
        assert ledger.record("u1", "mailboxes", None, "ua", "h", wall=2.0, mono=100.0) is False
        assert ledger.record("u1", "mailboxes", None, "ua", "h", wall=3.0, mono=601.0) is True
    assert len([r for r in caplog.records if "mail client call" in r.getMessage()]) == 2


def test_ledger_separates_callers_and_reports_the_gap():
    ledger = TrafficLedger()
    ledger.record("u1", "mailboxes", None, "ua", "h", wall=100.0, mono=0.0)
    ledger.record("u1", "mailboxes", None, "ua", "h", wall=160.0, mono=60.0)
    ledger.record("u1", "mailboxes", 1, "ua", "h", wall=170.0, mono=70.0)  # different build is a different caller
    rows = {row["build"]: row for row in ledger.snapshot()}
    assert rows[None]["calls"] == 2 and rows[None]["last_gap_seconds"] == 60.0
    assert rows[1]["calls"] == 1 and rows[1]["last_gap_seconds"] is None


def test_ledger_is_bounded_and_drops_the_stalest_caller():
    ledger = TrafficLedger(limit=3)
    for index in range(5):
        ledger.record(f"u{index}", "mailboxes", None, "ua", "h", wall=float(index), mono=float(index))
    users = [row["user_id"] for row in ledger.snapshot()]
    assert len(users) == 3
    assert users[0] == "u4" and "u0" not in users and "u1" not in users


def test_throttle_is_bounded():
    throttle = Throttle(limit=2)
    for index in range(5):
        throttle.mark((f"u{index}",), float(index))
    assert throttle.age(("u0",), 10.0) is None
    assert throttle.age(("u4",), 10.0) == 6.0


# ---- the policy document ----------------------------------------------------------------------


class _FakePolicyDoc:
    """Stands in for the Beanie document so no MongoDB is needed."""

    stored: "_FakePolicyDoc | None" = None
    saves = 0

    def __init__(self, id="mail_clients"):
        self.id = id
        self.legacy_min_interval_seconds = 300
        self.min_build = 0
        self.block_unversioned = False
        self.blocked_user_ids: list[str] = []
        self.updated_at = None
        self.updated_by = None

    @classmethod
    async def get(cls, _id):
        return cls.stored

    async def save(self):
        type(self).stored = self
        type(self).saves += 1


@pytest.fixture
def fake_doc(monkeypatch):
    _FakePolicyDoc.stored = None
    _FakePolicyDoc.saves = 0
    monkeypatch.setattr(client_guard, "ClientPolicy", _FakePolicyDoc)
    client_guard.clear_cache()
    yield _FakePolicyDoc
    client_guard.clear_cache()


@pytest.mark.asyncio
async def test_no_document_means_defaults(fake_doc):
    policy = await client_guard.get_policy(fresh=True)
    assert policy == Policy()


@pytest.mark.asyncio
async def test_save_policy_changes_only_the_given_fields_and_takes_effect_at_once(fake_doc):
    await client_guard.get_policy(now=0.0)  # warms the cache with the defaults
    saved = await client_guard.save_policy({"min_build": 3, "blocked_user_ids": [" a ", "a", "b"]}, "admin1")
    assert saved.min_build == 3
    assert saved.blocked_user_ids == frozenset({"a", "b"})
    assert saved.legacy_min_interval_seconds == 300  # untouched
    assert saved.updated_by == "admin1"
    assert isinstance(saved.updated_at, datetime) and saved.updated_at.tzinfo is UTC
    assert (await client_guard.get_policy(now=1.0)).min_build == 3  # cache was dropped on save
    await client_guard.save_policy({"block_unversioned": True}, "admin2")
    again = await client_guard.get_policy(fresh=True)
    assert again.block_unversioned is True and again.min_build == 3


@pytest.mark.asyncio
async def test_policy_is_cached_for_thirty_seconds(fake_doc):
    first = await client_guard.get_policy(now=100.0)
    doc = fake_doc()
    doc.min_build = 9
    fake_doc.stored = doc
    assert (await client_guard.get_policy(now=120.0)) == first  # still cached
    assert (await client_guard.get_policy(now=131.0)).min_build == 9


@pytest.mark.asyncio
async def test_a_mongodb_failure_keeps_the_last_policy_and_never_locks_people_out(fake_doc, monkeypatch):
    doc = fake_doc()
    doc.min_build = 4
    fake_doc.stored = doc
    assert (await client_guard.get_policy(now=0.0)).min_build == 4

    async def boom(_id):
        raise RuntimeError("mongo down")

    monkeypatch.setattr(fake_doc, "get", boom)
    assert (await client_guard.get_policy(now=100.0)).min_build == 4  # last good policy
    client_guard.clear_cache()
    assert await client_guard.get_policy(now=200.0) == Policy()  # nothing known: defaults, so no lockout


def test_policy_as_dict_is_json_friendly_and_sorted():
    payload = Policy(blocked_user_ids=frozenset({"b", "a"}), min_build=2).as_dict()
    assert payload["blocked_user_ids"] == ["a", "b"]
    assert payload["current_build"] == CURRENT_BUILD
    assert payload["updated_at"] is None


# ---- wiring -----------------------------------------------------------------------------------


def test_the_guard_covers_exactly_the_two_routes_that_reach_neon():
    from app.modules.mail import router as mail_router

    guarded = {
        route.path
        for route in mail_router.router.routes
        if hasattr(route, "dependant")
        and any(dep.call is mail_router._guarded_principal for dep in route.dependant.dependencies)
    }
    assert guarded == {"/mail/mailboxes", "/mail/unread"}


def test_admin_routes_exist_with_the_expected_methods():
    from app.modules.mail import router as mail_router

    seen = {(m, r.path) for r in mail_router.router.routes for m in getattr(r, "methods", set())}
    assert ("GET", "/mail/admin/client-policy") in seen
    assert ("PUT", "/mail/admin/client-policy") in seen
    assert ("GET", "/mail/admin/client-traffic") in seen


def test_policy_body_rejects_unknown_and_out_of_range_values():
    from pydantic import ValidationError

    from app.modules.mail.router import ClientPolicyBody

    with pytest.raises(ValidationError):
        ClientPolicyBody(min_build=-1)
    with pytest.raises(ValidationError):
        ClientPolicyBody(legacy_min_interval_seconds=100_000)
    with pytest.raises(ValidationError):
        ClientPolicyBody(surprise=True)
    assert ClientPolicyBody(min_build=2).model_dump(exclude_unset=True) == {"min_build": 2}


@pytest.mark.asyncio
async def test_cors_allows_the_build_header(client):
    from app.core.config import get_settings

    origins = get_settings().cors_origin_list
    if not origins:
        pytest.skip("no CORS origin configured")
    response = await client.options(
        "/api/v1/mail/mailboxes",
        headers={
            "Origin": origins[0],
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-client-build",
        },
    )
    assert "x-client-build" in response.headers.get("access-control-allow-headers", "").lower()
