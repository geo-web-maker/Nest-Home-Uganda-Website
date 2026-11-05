# ruff: noqa: E501
"""Mail setup checks. No database, network or storage: every dependency is a small fake."""

import hashlib
import hmac
import json

import pytest

from app.modules.mail import diagnostics as d

GOOD = {
    "mail.enabled": True,
    "mail.domain": "nesthomecare.org",
    "mail.provider": "resend",
    "mail.provider_api_key": "re_secret",
    "mail.suspend_all_sending": False,
    "mail.external_enabled": True,
    "mail.inbound_enabled": True,
    "mail.inbound_webhook_secret": "inbound-secret",
    "mail.provider_webhook_secret": "hook-secret",
}


def by_id(checks):
    return {c.id: c for c in checks}


def test_a_complete_setup_has_no_warnings_or_failures():
    checks = d.check_settings(GOOD)
    assert {c.status for c in checks} == {d.PASS}


@pytest.mark.parametrize(
    ("change", "check_id", "status"),
    [
        ({"mail.enabled": False}, "enabled", d.FAIL),
        ({"mail.domain": ""}, "domain", d.FAIL),
        ({"mail.domain": "not a domain"}, "domain", d.FAIL),
        ({"mail.provider": "console"}, "provider", d.WARN),
        ({"mail.provider_api_key": "  "}, "provider", d.FAIL),
        ({"mail.suspend_all_sending": True}, "suspended", d.FAIL),
        ({"mail.external_enabled": False}, "external", d.WARN),
        ({"mail.inbound_webhook_secret": ""}, "inbound", d.FAIL),
        ({"mail.inbound_enabled": False}, "inbound", d.SKIP),
        ({"mail.provider_webhook_secret": ""}, "webhook", d.WARN),
        ({"mail.provider": "console"}, "webhook", d.SKIP),
    ],
)
def test_each_setting_problem_is_reported_under_its_own_check(change, check_id, status):
    assert by_id(d.check_settings({**GOOD, **change}))[check_id].status == status


def test_no_check_ever_repeats_a_secret_value():
    text = " ".join(c.detail for c in d.check_settings(GOOD))
    for secret in ("re_secret", "inbound-secret", "hook-secret"):
        assert secret not in text


def test_summary_counts_each_state():
    checks = [d.Check("a", d.PASS, ""), d.Check("b", d.PASS, ""), d.Check("c", d.WARN, ""), d.Check("e", d.FAIL, "")]
    assert d.summarize(checks) == {"pass": 2, "warn": 1, "fail": 1, "skip": 0}


class Conn:
    def __init__(self, *, down=False, mailboxes=3, system=True, queue=None, stuck=0, last_error=None):
        self.down, self.mailboxes, self.system, self.queue, self.stuck, self.last_error = down, mailboxes, system, queue or [], stuck, last_error

    async def fetchval(self, sql, *args):
        if self.down:
            raise ConnectionError("down")
        if "count(*) FROM mailbox" in sql:
            return self.mailboxes
        if "local_part='no-reply'" in sql:
            return 1 if self.system else None
        if "last_error" in sql:
            return self.last_error
        if "interval '10 minutes'" in sql:
            return self.stuck
        return 1

    async def fetch(self, sql, *args):
        return [{"state": s, "n": n} for s, n in self.queue]


async def test_database_check_reports_an_unreachable_database_once():
    checks = await d.check_database(Conn(down=True))
    assert [(c.id, c.status) for c in checks] == [("database", d.FAIL)]


async def test_database_check_warns_about_missing_mailboxes_and_the_system_mailbox():
    checks = by_id(await d.check_database(Conn(mailboxes=0, system=False)))
    assert checks["database"].status == d.PASS
    assert checks["mailboxes"].status == d.WARN
    assert checks["systemMailbox"].status == d.WARN


async def test_queue_check_names_failures_and_stuck_messages():
    failed = await d.check_queue(Conn(queue=[("failed", 2), ("queued", 1)], last_error="HTTP 401"))
    assert failed.status == d.WARN and "2 message(s) failed" in failed.detail and "HTTP 401" in failed.detail
    stuck = await d.check_queue(Conn(queue=[("queued", 4)], stuck=4))
    assert stuck.status == d.WARN and "10 minutes" in stuck.detail
    assert (await d.check_queue(Conn(queue=[("queued", 1)]))).status == d.PASS


class Storage:
    def __init__(self, *, fail=False, corrupt=False):
        self.fail, self.corrupt, self.data, self.deleted = fail, corrupt, {}, []

    async def put(self, bucket, key, data, content_type):
        if self.fail:
            raise OSError("no")
        self.data[key] = data

    async def get(self, bucket, key):
        return b"other" if self.corrupt else self.data[key]

    async def delete(self, bucket, key):
        self.deleted.append(key)


async def test_storage_check_writes_reads_and_always_cleans_up():
    storage = Storage()
    assert (await d.check_storage(storage, "mail")).status == d.PASS
    assert len(storage.deleted) == 1
    broken = Storage(corrupt=True)
    assert (await d.check_storage(broken, "mail")).status == d.FAIL and len(broken.deleted) == 1
    assert (await d.check_storage(Storage(fail=True), "mail")).status == d.FAIL


def lookup_with(records):
    async def lookup(name, kind):
        if records is None:
            return None
        return records.get((name, kind), [])

    return lookup


async def test_dns_finds_published_records_and_warns_about_missing_ones():
    records = {
        ("nesthomecare.org", "MX"): ["10 mx.example.net."],
        ("nesthomecare.org", "TXT"): ["v=spf1 include:amazonses.com ~all"],
        ("_dmarc.nesthomecare.org", "TXT"): ["v=DMARC1; p=none"],
        ("resend._domainkey.nesthomecare.org", "TXT"): ["p=MIGf..."],
    }
    ok = by_id(await d.check_dns("nesthomecare.org", "resend", lookup_with(records)))
    assert {c.status for c in ok.values()} == {d.PASS}
    empty = by_id(await d.check_dns("nesthomecare.org", "resend", lookup_with({})))
    assert {c.status for c in empty.values()} == {d.WARN}


async def test_dns_is_skipped_not_failed_when_it_cannot_be_looked_up():
    checks = await d.check_dns("nesthomecare.org", "resend", lookup_with(None))
    assert {c.status for c in checks} == {d.SKIP}


async def test_dkim_is_skipped_for_a_provider_with_no_known_selector_and_dns_for_a_bad_domain():
    assert by_id(await d.check_dns("nesthomecare.org", "console", lookup_with({})))["dnsDkim"].status == d.SKIP
    assert {c.status for c in await d.check_dns("nope", "resend", lookup_with({}))} == {d.SKIP}


class Pool:
    def __init__(self, *, delivered=True):
        self.delivered = delivered

    def acquire(self):
        outer = self

        class Ctx:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def fetchval(self, sql, *args):
                return 1 if outer.delivered else None

        return Ctx()


class Core:
    def __init__(self, *, fail=False):
        self.fail, self.sent = fail, []

    async def create_draft(self, user_id, mailbox_id, payload):
        if self.fail:
            raise ValueError("Mail is disabled.")
        self.sent.append(payload)
        return {"id": "D1"}

    async def send_draft(self, user_id, draft_id, mailbox_id):
        return {"local_deliveries": 1}


BOX = {"id": "B1", "address": "admin@nesthomecare.org"}


async def test_loopback_sends_to_the_administrators_own_address_and_confirms_arrival():
    core = Core()
    check = await d.loopback("u1", BOX, Pool(), core)
    assert check.status == d.PASS
    assert core.sent[0]["to"] == ["admin@nesthomecare.org"] and core.sent[0]["subject"].startswith("Setup check")


async def test_loopback_reports_a_send_error_and_a_missing_delivery_separately():
    failed = await d.loopback("u1", BOX, Pool(), Core(fail=True))
    assert failed.status == d.FAIL and "Mail is disabled." in failed.detail
    lost = await d.loopback("u1", BOX, Pool(delivered=False), Core())
    assert lost.status == d.FAIL and "did not arrive" in lost.detail


def test_the_inbound_signature_matches_what_ingest_verifies():
    payload = {"object_key": "mail/inbound/x.eml", "envelope_to": ["a@b.org"], "auth_results": {}}
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    expected = hmac.new(b"s3", f"123.{body}".encode(), hashlib.sha256).hexdigest()
    assert d.sign_inbound("s3", "123", payload) == expected


async def test_inbound_selftest_stores_a_message_signs_it_and_confirms_arrival():
    storage, seen = Storage(), {}

    async def ingest(payload, timestamp, signature):
        seen.update(payload=payload, timestamp=timestamp, signature=signature)

    check = await d.inbound_selftest(BOX, "nesthomecare.org", "s3", Pool(), storage, "mail", ingest)
    assert check.status == d.PASS
    assert seen["payload"]["object_key"].startswith("mail/inbound/") and ".." not in seen["payload"]["object_key"]
    assert seen["payload"]["envelope_to"] == ["admin@nesthomecare.org"]
    assert seen["signature"] == d.sign_inbound("s3", seen["timestamp"], seen["payload"])
    assert b"Inbound check" in storage.data[seen["payload"]["object_key"]]


async def test_inbound_selftest_explains_a_refusal_and_a_missing_secret():
    async def refuse(payload, timestamp, signature):
        raise PermissionError("Inbound mail is disabled")

    refused = await d.inbound_selftest(BOX, "nesthomecare.org", "s3", Pool(), Storage(), "mail", refuse)
    assert refused.status == d.FAIL and "Inbound mail is disabled" in refused.detail

    async def never(*args):
        raise AssertionError("must not run without a secret")

    assert (await d.inbound_selftest(BOX, "nesthomecare.org", "", Pool(), Storage(), "mail", never)).status == d.FAIL


def test_router_loads_every_setting_the_checks_read():
    """Regression: checks read keys the router never loaded, so saved SMTP/scanner settings looked missing."""
    import inspect
    import re

    from app.modules.mail.router import _DIAGNOSTIC_KEYS

    source = inspect.getsource(d)
    read = set(re.findall(r'values\.get\("(mail\.[a-z_0-9.]+)"\)', source))
    assert read <= set(_DIAGNOSTIC_KEYS), sorted(read - set(_DIAGNOSTIC_KEYS))
