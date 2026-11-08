"""Inbound trace: routing explanation, and conclusions drawn from the log. Uses fakes, no database."""
import asyncio
import httpx
import pytest

from app.modules.mail import inbound_trace as it


class FakeConn:
    def __init__(self, rows): self.rows = rows
    async def fetchrow(self, *a): return self.rows.get("mailbox")
    async def fetch(self, *a): return self.rows.get("log", [])
    async def execute(self, *a): return None
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False


class FakePool:
    def __init__(self, **rows): self.rows = rows
    def acquire(self): return FakeConn(self.rows)


class FakeStorage:
    def __init__(self): self.d = {}
    async def put(self, b, k, data, ct): self.d[k] = data
    async def get(self, b, k): return self.d[k]
    async def delete(self, b, k): self.d.pop(k, None)


def run(coro): return asyncio.run(coro)


def test_route_for_reports_each_failure():
    assert run(it.route_for(FakePool(), "a@other.org", "nest.org", []))["status"] == "foreign_domain"
    assert run(it.route_for(FakePool(), "nobody@nest.org", "nest.org", []))["status"] == "no_mailbox"
    closed = FakePool(mailbox={"id": "1", "state": "closed", "via": "mailbox"})
    assert run(it.route_for(closed, "x@nest.org", "nest.org", []))["status"] == "mailbox_closed"
    ok = FakePool(mailbox={"id": "1", "state": "open", "via": "alias"})
    assert run(it.route_for(ok, "x@nest.org", "nest.org", []))["status"] == "delivered"


def test_trace_says_worker_never_called_when_log_empty():
    values = {"mail.enabled": True, "mail.inbound_enabled": True, "mail.domain": "nest.org", "mail.inbound_webhook_secret": "s3cret", "mail.accepted_domains": []}

    async def get(k): return values[k]
    async def dns(name, kind): return ["10 route1.mx.cloudflare.net."]
    handler = lambda request: httpx.Response(200, json={"delivered": 1})
    result = run(it.run_trace(get, pool=FakePool(), storage=FakeStorage(), bucket="m", ingest_url="https://x/mail/inbound", ingest=None,
                              address=None, dns_lookup=dns, http_client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))))
    steps = {s["step"]: s for s in result["steps"]}
    assert steps["dns_mx"]["ok"] is True and steps["signed_replay"]["ok"] is True
    assert steps["worker_traffic"]["ok"] is False and "ever reached" in steps["worker_traffic"]["detail"]
    assert steps["settings"]["secret_fingerprint"] == it.fingerprint("s3cret")
