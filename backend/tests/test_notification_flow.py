"""Retry, daily-limit and never-raise behaviour of send_sms, with the database stubbed out.

The same paths run against real MongoDB in test_db_enquiries.py.
"""

import pytest

from app.modules.notifications import service as svc
from app.modules.notifications.config import NotifyConfig
from app.modules.notifications.providers import SendResult

CONFIG = NotifyConfig(sender_id="NestCare", category="info")


class Scripted:
    name = "scripted"

    def __init__(self, *results: SendResult) -> None:
        self.results = list(results)
        self.calls = 0

    async def send(self, to, text, sender_id, category) -> SendResult:
        self.calls += 1
        return self.results.pop(0)

    async def balance(self) -> int:
        return 0


@pytest.fixture
def stub(monkeypatch):
    rows: list[tuple] = []

    async def log(provider, audience, template, to, status, error, enquiry, cost=None):
        rows.append((template, status, error))

    async def within(config, now):
        return True

    monkeypatch.setattr(svc, "_log", log)
    monkeypatch.setattr(svc, "_within_daily_limit", within)
    monkeypatch.setattr(svc, "RETRY_DELAYS", (0.0, 0.0))
    return rows


async def send(provider) -> bool:
    return await svc.send_sms(
        provider,
        CONFIG,
        to="+256787499988",
        text="x",
        audience="visitor",
        template="t",
        enquiry=None,
    )


async def test_transient_failures_are_retried_at_most_twice(stub) -> None:
    p = Scripted(*[SendResult(False, "timeout", retryable=True)] * 3)
    assert not await send(p)
    assert p.calls == 3 and [r[1] for r in stub] == ["failed"] * 3


async def test_a_retry_that_works_stops_the_loop(stub) -> None:
    p = Scripted(SendResult(False, "HTTP 500", retryable=True), SendResult(True))
    assert await send(p)
    assert p.calls == 2 and [r[1] for r in stub] == ["failed", "sent"]


async def test_permanent_failures_are_not_retried(stub) -> None:
    p = Scripted(SendResult(False, "Invalid API key"))
    assert not await send(p)
    assert p.calls == 1


async def test_daily_limit_skips_the_send(stub, monkeypatch) -> None:
    async def over(config, now):
        return False

    monkeypatch.setattr(svc, "_within_daily_limit", over)
    p = Scripted()
    assert not await send(p)
    assert p.calls == 0 and stub == [("t", "skipped", "daily limit reached")]


async def test_a_crashing_provider_never_raises(stub) -> None:
    class Boom(Scripted):
        async def send(self, *a, **k):
            raise RuntimeError("provider exploded")

    assert not await send(Boom())
