"""Guard for the mail routes that can reach Neon: see who calls, throttle or refuse old apps, pause a user.

Everything here uses MongoDB (the policy) and process memory (the ledger and the throttle), so
the guard itself can never wake the PostgreSQL compute. It fails open: if the policy cannot be
read, the last good policy (or the defaults) applies, so a MongoDB problem never locks people out.

Clients send `X-Client-Build: <integer>`. A caller with no header (or a malformed one) is an
"unversioned" client, which is how the old builds identify themselves.
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from beanie import Document, PydanticObjectId
from fastapi import Request
from pydantic import Field

from app.core.errors import ClientBlocked, RateLimited, UpgradeRequired

log = logging.getLogger("app.client_guard")

BUILD_HEADER = "X-Client-Build"
# Bump together with CLIENT_BUILD in the admin client and the nurse client when a client change ships.
CURRENT_BUILD = 1
POLICY_ID = "mail_clients"
POLICY_CACHE_SECONDS = 30
LOG_INTERVAL_SECONDS = 600
LEDGER_LIMIT = 500
THROTTLE_LIMIT = 2000
MAX_BLOCKED_USERS = 200
DEFAULT_LEGACY_INTERVAL = 300


class ClientPolicy(Document):
    """The single runtime policy document, editable without a redeploy."""

    id: str  # always POLICY_ID
    legacy_min_interval_seconds: int = DEFAULT_LEGACY_INTERVAL
    min_build: int = 0
    block_unversioned: bool = False
    blocked_user_ids: list[str] = Field(default_factory=list)
    updated_at: datetime | None = None
    updated_by: str | None = None

    class Settings:
        name = "client_policy"


@dataclass(frozen=True)
class Policy:
    legacy_min_interval_seconds: int = DEFAULT_LEGACY_INTERVAL
    min_build: int = 0
    block_unversioned: bool = False
    blocked_user_ids: frozenset[str] = frozenset()
    updated_at: datetime | None = None
    updated_by: str | None = None

    @classmethod
    def from_doc(cls, doc: Any) -> "Policy":
        return cls(
            legacy_min_interval_seconds=max(0, int(getattr(doc, "legacy_min_interval_seconds", DEFAULT_LEGACY_INTERVAL))),
            min_build=max(0, int(getattr(doc, "min_build", 0))),
            block_unversioned=bool(getattr(doc, "block_unversioned", False)),
            blocked_user_ids=frozenset(str(v) for v in (getattr(doc, "blocked_user_ids", None) or [])),
            updated_at=getattr(doc, "updated_at", None),
            updated_by=getattr(doc, "updated_by", None),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "legacy_min_interval_seconds": self.legacy_min_interval_seconds,
            "min_build": self.min_build,
            "block_unversioned": self.block_unversioned,
            "blocked_user_ids": sorted(self.blocked_user_ids),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "updated_by": self.updated_by,
            "current_build": CURRENT_BUILD,
        }


@dataclass(frozen=True)
class Decision:
    kind: str  # "blocked" | "upgrade_required" | "throttled"
    retry_after: int = 0


def parse_build(value: str | None) -> int | None:
    """The build number from the header, or None when it is missing or not a plain number."""
    if value is None:
        return None
    text = value.strip()
    if not text.isascii() or not text.isdigit() or len(text) > 9:
        return None
    return int(text)


def is_legacy(build: int | None) -> bool:
    return build is None or build < CURRENT_BUILD


def clean_user_ids(values: list[str]) -> list[str]:
    """Trimmed, de-duplicated, order-preserving; empty entries dropped."""
    seen: dict[str, None] = {}
    for raw in values:
        item = str(raw).strip()
        if item and len(item) <= 64:
            seen.setdefault(item, None)
    return list(seen)


def evaluate(policy: Policy, user_id: str, build: int | None, seconds_since_last: float | None) -> Decision | None:
    """Pure decision for one call. None means the call may proceed."""
    if user_id in policy.blocked_user_ids:
        return Decision("blocked")
    if build is None and policy.block_unversioned:
        return Decision("upgrade_required")
    if policy.min_build > 0 and (build or 0) < policy.min_build:
        return Decision("upgrade_required")
    interval = policy.legacy_min_interval_seconds
    if is_legacy(build) and interval > 0 and seconds_since_last is not None and seconds_since_last < interval:
        return Decision("throttled", retry_after=max(1, math.ceil(interval - seconds_since_last)))
    return None


class Throttle:
    """Last allowed call per caller, in memory. Only legacy callers are tracked."""

    def __init__(self, limit: int = THROTTLE_LIMIT) -> None:
        self._last: dict[tuple, float] = {}
        self._limit = limit

    def age(self, key: tuple, now: float) -> float | None:
        last = self._last.get(key)
        return None if last is None else now - last

    def mark(self, key: tuple, now: float) -> None:
        self._last[key] = now
        if len(self._last) > self._limit:
            for stale in sorted(self._last, key=self._last.get)[: len(self._last) - self._limit]:
                del self._last[stale]

    def clear(self) -> None:
        self._last.clear()


@dataclass
class Caller:
    user_id: str
    route: str
    build: int | None
    user_agent: str
    ip_hash: str
    first_seen: float  # wall clock seconds
    last_seen: float
    calls: int = 0
    last_gap_seconds: float | None = None
    last_result: str = "ok"
    last_logged: float = field(default=-1e18, repr=False)  # monotonic seconds


class TrafficLedger:
    """Who calls the guarded routes. Each distinct caller is logged at most once per interval."""

    def __init__(self, limit: int = LEDGER_LIMIT, log_interval: int = LOG_INTERVAL_SECONDS) -> None:
        self._callers: dict[tuple, Caller] = {}
        self._limit = limit
        self._log_interval = log_interval
        self.started_at = time.time()

    def record(
        self,
        user_id: str,
        route: str,
        build: int | None,
        user_agent: str,
        ip_hash: str,
        result: str = "ok",
        wall: float | None = None,
        mono: float | None = None,
    ) -> bool:
        """Count the call. Returns True when it was also written to the log."""
        wall = time.time() if wall is None else wall
        mono = time.monotonic() if mono is None else mono
        key = (user_id, route, build, user_agent, ip_hash)
        caller = self._callers.get(key)
        if caller is None:
            caller = Caller(user_id, route, build, user_agent, ip_hash, first_seen=wall, last_seen=wall)
            self._callers[key] = caller
            if len(self._callers) > self._limit:
                oldest = min(self._callers, key=lambda k: self._callers[k].last_seen)
                del self._callers[oldest]
        else:
            caller.last_gap_seconds = round(wall - caller.last_seen, 1)
            caller.last_seen = wall
        caller.calls += 1
        caller.last_result = result
        if mono - caller.last_logged >= self._log_interval:
            caller.last_logged = mono
            log.info(
                "mail client call user=%s route=%s build=%s ip=%s result=%s calls=%d ua=%s",
                user_id, route, build, ip_hash, result, caller.calls, user_agent,
            )
            return True
        return False

    def snapshot(self) -> list[dict[str, Any]]:
        rows = sorted(self._callers.values(), key=lambda c: c.last_seen, reverse=True)
        return [
            {
                "user_id": c.user_id,
                "route": c.route,
                "build": c.build,
                "user_agent": c.user_agent,
                "ip_hash": c.ip_hash,
                "calls": c.calls,
                "first_seen": datetime.fromtimestamp(c.first_seen, UTC).isoformat(),
                "last_seen": datetime.fromtimestamp(c.last_seen, UTC).isoformat(),
                "last_gap_seconds": c.last_gap_seconds,
                "last_result": c.last_result,
                "legacy": is_legacy(c.build),
            }
            for c in rows
        ]

    def clear(self) -> None:
        self._callers.clear()
        self.started_at = time.time()


LEDGER = TrafficLedger()
THROTTLE = Throttle()
_cache: tuple[float, Policy] | None = None


def clear_cache() -> None:
    global _cache
    _cache = None


async def get_policy(fresh: bool = False, now: float | None = None) -> Policy:
    """The runtime policy from MongoDB, cached for 30 seconds. Never touches PostgreSQL."""
    global _cache
    mono = time.monotonic() if now is None else now
    if not fresh and _cache is not None and mono - _cache[0] < POLICY_CACHE_SECONDS:
        return _cache[1]
    try:
        doc = await ClientPolicy.get(POLICY_ID)
        policy = Policy.from_doc(doc) if doc is not None else Policy()
    except Exception:
        log.warning("client policy could not be read; using the last known policy")
        policy = _cache[1] if _cache is not None else Policy()
    _cache = (mono, policy)
    return policy


async def save_policy(values: dict[str, Any], user_id: str) -> Policy:
    """Change only the given fields, record who did it, and make it effective at once."""
    doc = await ClientPolicy.get(POLICY_ID)
    if doc is None:
        doc = ClientPolicy(id=POLICY_ID)
    if "legacy_min_interval_seconds" in values:
        doc.legacy_min_interval_seconds = int(values["legacy_min_interval_seconds"])
    if "min_build" in values:
        doc.min_build = int(values["min_build"])
    if "block_unversioned" in values:
        doc.block_unversioned = bool(values["block_unversioned"])
    if "blocked_user_ids" in values:
        doc.blocked_user_ids = clean_user_ids(list(values["blocked_user_ids"]))[:MAX_BLOCKED_USERS]
    doc.updated_at = datetime.now(UTC)
    doc.updated_by = user_id
    await doc.save()
    clear_cache()
    log.info("client policy changed by %s: %s", user_id, sorted(values))
    return Policy.from_doc(doc)


def describe_caller(request: Request) -> tuple[str, str, int | None, str]:
    """(route, user_agent, build, ip_hash) for one call. Raw IPs are never kept."""
    route = request.url.path.rstrip("/").rsplit("/", 1)[-1] or "/"
    build = parse_build(request.headers.get(BUILD_HEADER))
    user_agent = request.headers.get("user-agent", "")[:160]
    try:
        from app.core.rate_limit import client_ip
        from app.core.security import hash_ip

        ip_hash = hash_ip(client_ip(request))[:12]
    except Exception:
        ip_hash = "unknown"
    return route, user_agent, build, ip_hash


async def enforce(
    request: Request,
    user_id: str,
    *,
    ledger: TrafficLedger | None = None,
    throttle: Throttle | None = None,
    mono: float | None = None,
) -> None:
    """Record the call, then raise when the policy refuses it. Runs before any database work."""
    ledger = LEDGER if ledger is None else ledger
    throttle = THROTTLE if throttle is None else throttle
    now = time.monotonic() if mono is None else mono
    route, user_agent, build, ip_hash = describe_caller(request)
    policy = await get_policy()
    key = (user_id, route, user_agent, ip_hash)
    decision = evaluate(policy, user_id, build, throttle.age(key, now) if is_legacy(build) else None)
    ledger.record(user_id, route, build, user_agent, ip_hash, decision.kind if decision else "ok")
    if decision is None:
        if is_legacy(build):
            throttle.mark(key, now)
        return
    if decision.kind == "blocked":
        raise ClientBlocked()
    if decision.kind == "upgrade_required":
        raise UpgradeRequired()
    raise RateLimited(decision.retry_after)


async def names_for(user_ids: list[str]) -> dict[str, dict[str, str]]:
    """Name and email for known people (MongoDB only). Unknown or malformed ids simply have no entry."""
    from app.modules.auth.models import User

    oids = []
    for raw in dict.fromkeys(user_ids):
        try:
            oids.append(PydanticObjectId(raw))
        except Exception:
            continue
    if not oids:
        return {}
    users = await User.find({"_id": {"$in": oids}}).to_list()
    return {str(u.id): {"name": u.name, "email": u.email} for u in users}


async def traffic_report() -> dict[str, Any]:
    """The ledger plus names for the people in it and in the blocked list."""
    items = LEDGER.snapshot()
    policy = await get_policy()
    try:
        people = await names_for([i["user_id"] for i in items] + sorted(policy.blocked_user_ids))
    except Exception:
        people = {}
    for item in items:
        item["person"] = people.get(item["user_id"])
    return {
        "current_build": CURRENT_BUILD,
        "since": datetime.fromtimestamp(LEDGER.started_at, UTC).isoformat(),
        "items": items,
        "blocked": [{"user_id": uid, "person": people.get(uid)} for uid in sorted(policy.blocked_user_ids)],
    }
