"""Enquiries, notifications, jobs and clicks against a real MongoDB (needs TEST_MONGODB_URI).

Written in S4 and NOT RUN locally (no MongoDB in that session). CI runs them.
"""

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.core.security import hash_password
from app.jobs import run_retention
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.clicks.models import ClickStat
from app.modules.enquiries.models import Enquiry
from app.modules.notifications import service as notifications
from app.modules.notifications.config import NotifyConfig
from app.modules.notifications.models import SmsLog
from app.modules.notifications.providers import ConsoleSmsProvider, SendResult
from app.modules.services.models import Service
from app.modules.services.seed import seed_services
from tests.conftest import auth, make_token

PUBLIC = "/api/v1/public/enquiries"
ADMIN = "/api/v1/admin/enquiries"
T0 = datetime(2026, 10, 19, 8, 0, tzinfo=UTC)  # 11:00 in Kampala: inside working hours


def staff() -> dict:
    return auth(make_token(["enquiries:read", "enquiries:write"]))


async def service_id(slug: str = "postnatal-newborn-care") -> str:
    await seed_services()
    svc = await Service.find_one({"slug": slug})
    assert svc is not None
    return str(svc.id)


async def submit(client: httpx.AsyncClient, sid: str, **kw) -> httpx.Response:
    data = {
        "name": "Mary Atim", "phone": "0787 499 988", "relationship": "parent",
        "service_ids": [sid], "area": "Ntinda", "consent": True, **kw,
    }  # fmt: skip
    return await client.post(PUBLIC, json=data)


# ---- the public flow ----


async def test_submit_saves_a_new_enquiry_and_returns_reference_and_whatsapp_url(
    mongo: object, client: httpx.AsyncClient
) -> None:
    sid = await service_id()
    r = await submit(client, sid)
    assert r.status_code == 201
    out = r.json()
    assert out["reference"] == "NHC-000001"
    assert out["whatsapp_url"].startswith("https://wa.me/256787499988?text=")
    assert "NHC-000001" in out["whatsapp_url"] and "Mary%20Atim" in out["whatsapp_url"]
    doc = await Enquiry.find_one({"reference": "NHC-000001"})
    assert doc is not None
    assert doc.status == "new" and doc.source == "form" and doc.consent_at is not None
    assert doc.phone_e164 == "+256787499988" and doc.phone_raw == "0787 499 988"
    assert doc.ip_hash and doc.ip_hash != "127.0.0.1" and doc.events[0].kind == "received"
    r2 = await submit(client, sid)
    assert r2.json()["reference"] == "NHC-000002"


async def test_unknown_or_unpublished_service_is_refused(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await service_id()
    r = await submit(client, "0" * 24)
    assert r.status_code == 422 and "service_ids" in r.json()["error"]["fields"]
    svc = await Service.find_one({"slug": "postnatal-newborn-care"})
    await Service.get_pymongo_collection().update_one(
        {"_id": svc.id}, {"$set": {"published": False}}
    )
    assert (await submit(client, str(svc.id))).status_code == 422
    assert await Enquiry.count() == 0


async def test_visitor_sms_is_sent_once_and_recorded(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await submit(client, await service_id())
    doc = await Enquiry.find_one({"reference": "NHC-000001"})
    assert doc.visitor_sms_done is True
    rows = await SmsLog.find({}).to_list()
    assert [(r.audience, r.template, r.status) for r in rows] == [
        ("visitor", "visitor_confirm", "sent")
    ]
    assert "499" not in rows[0].to_hint and "Mary" not in rows[0].to_hint
    kinds = [(e.kind, e.data.get("audience")) for e in doc.events]
    assert ("alert_sent", "visitor") in kinds
    await notifications.notify_new_enquiry(str(doc.id))  # a second run must not text again
    assert await SmsLog.find({"audience": "visitor"}).count() == 1


async def test_a_landline_gets_no_visitor_sms_but_the_enquiry_is_saved(
    mongo: object, client: httpx.AsyncClient
) -> None:
    r = await submit(client, await service_id(), phone="0312 345 678")
    assert r.status_code == 201
    assert await SmsLog.count() == 0


async def test_a_failing_sms_provider_never_fails_the_request(
    mongo: object, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Down(ConsoleSmsProvider):
        async def send(self, *a, **k):
            return SendResult(False, "Account is inactive or suspended")

    monkeypatch.setattr(notifications, "get_sms_provider", lambda: Down())
    r = await submit(client, await service_id())
    assert r.status_code == 201
    row = await SmsLog.find_one({})
    assert row.status == "failed" and "suspended" in row.error


# ---- the admin side ----


async def test_admin_list_search_and_detail(mongo: object, client: httpx.AsyncClient) -> None:
    sid = await service_id()
    await submit(client, sid, name="Mary Atim")
    await submit(client, sid, name="James Okello", phone="0701 234 567", area="Bugolobi")
    r = await client.get(ADMIN, headers=staff())
    assert r.status_code == 200 and r.json()["total"] == 2
    assert r.json()["items"][0]["reference"] == "NHC-000002"  # newest first
    for q, expect in (
        ("nhc-000001", "Mary Atim"),
        ("0701 234 567", "James Okello"),
        ("Bugolobi", "James Okello"),
    ):
        found = (await client.get(ADMIN, params={"q": q}, headers=staff())).json()["items"]
        assert [i["name"] for i in found] == [expect], q
    assert (await client.get(ADMIN, params={"status": "contacted"}, headers=staff())).json()[
        "total"
    ] == 0
    detail = (await client.get(f"{ADMIN}/{r.json()['items'][0]['id']}", headers=staff())).json()
    assert (
        detail["note"] == ""
        and "ip_hash" not in detail
        and detail["events"][0]["kind"] == "received"
    )


async def test_status_changes_follow_the_rules_and_are_audited(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await submit(client, await service_id())
    eid = str((await Enquiry.find_one({})).id)
    r = await client.patch(f"{ADMIN}/{eid}", json={"status": "care_started"}, headers=staff())
    assert r.status_code == 422 and "status" in r.json()["error"]["fields"]
    r = await client.patch(f"{ADMIN}/{eid}", json={"status": "contacted"}, headers=staff())
    assert r.status_code == 200 and r.json()["status"] == "contacted"
    assert r.json()["first_contacted_at"] is not None
    assert r.json()["events"][-1]["kind"] == "status_change"
    entry = await AuditLog.find_one({"action": "enquiry.update"})
    assert entry.before["status"] == "new" and entry.after["status"] == "contacted"
    assert entry.scope == "enquiries:write"
    r = await client.patch(f"{ADMIN}/{eid}", json={"status": "not_proceeding"}, headers=staff())
    assert r.status_code == 422 and "reason" in r.json()["error"]["fields"]
    r = await client.patch(
        f"{ADMIN}/{eid}",
        json={"status": "not_proceeding", "reason": "Found care elsewhere"},
        headers=staff(),
    )
    assert (
        r.json()["closed_at"] is not None
        and r.json()["not_proceeding_reason"] == "Found care elsewhere"
    )


async def test_assigning_needs_an_active_user_and_unassign_works(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await submit(client, await service_id())
    eid = str((await Enquiry.find_one({})).id)
    nurse = User(name="Nurse", email="n@example.com", password_hash=hash_password("x" * 12))
    await nurse.insert()
    r = await client.patch(f"{ADMIN}/{eid}", json={"assigned_to": str(nurse.id)}, headers=staff())
    assert r.status_code == 200 and r.json()["assigned_to"] == str(nurse.id)
    await User.get_pymongo_collection().update_one(
        {"_id": nurse.id}, {"$set": {"is_active": False}}
    )
    assert (
        await client.patch(f"{ADMIN}/{eid}", json={"assigned_to": "0" * 24}, headers=staff())
    ).status_code == 422
    r = await client.patch(f"{ADMIN}/{eid}", json={"assigned_to": None}, headers=staff())
    assert r.json()["assigned_to"] is None


async def test_notes_and_manual_entry(mongo: object, client: httpx.AsyncClient) -> None:
    sid = await service_id()
    await submit(client, sid)
    eid = str((await Enquiry.find_one({})).id)
    r = await client.post(
        f"{ADMIN}/{eid}/notes", json={"text": "Called, no answer"}, headers=staff()
    )
    assert r.status_code == 201 and r.json()["events"][-1]["text"] == "Called, no answer"
    assert await AuditLog.find_one({"action": "enquiry.note"}) is not None
    sms_before = await SmsLog.count()
    manual = {"name": "Grace Namutebi", "phone": "0770 111 222", "relationship": "self",
              "service_ids": [sid], "area": "Kira"}  # fmt: skip
    r = await client.post(ADMIN, json=manual, headers=staff())
    assert r.status_code == 201 and r.json()["source"] == "manual" and r.json()["consent"] is False
    assert await SmsLog.count() == sms_before  # staff entry: no visitor SMS
    assert await AuditLog.find_one({"action": "enquiry.create"}) is not None


# ---- reminders, daily limit, retention, clicks ----

CFG = NotifyConfig(staff_numbers=["+256701000111"], staff_emails=["owner@example.com"])


async def make_enquiry(client: httpx.AsyncClient, created_at: datetime = T0) -> Enquiry:
    await submit(client, await service_id())
    doc = await Enquiry.find({}).sort("-created_at").first_or_none()
    await Enquiry.get_pymongo_collection().update_one(
        {"_id": doc.id}, {"$set": {"created_at": created_at}}
    )
    await SmsLog.find({}).delete()
    return await Enquiry.get(doc.id)


async def test_reminders_fire_in_hours_every_interval_at_most_three_times(
    mongo: object, client: httpx.AsyncClient
) -> None:
    doc = await make_enquiry(client)
    sms = ConsoleSmsProvider()
    send = lambda now: notifications.send_reminders(now, sms=sms, config=CFG)  # noqa: E731
    assert await send(T0 + timedelta(minutes=29)) == 0
    assert await send(T0 + timedelta(minutes=31)) == 1
    assert await send(T0 + timedelta(minutes=32)) == 0  # same slot: no duplicate
    assert await send(T0 + timedelta(minutes=62)) == 1
    assert await send(T0 + timedelta(minutes=95)) == 1
    assert await send(T0 + timedelta(hours=4)) == 0  # three is the limit
    fresh = await Enquiry.get(doc.id)
    assert fresh.reminders_sent == 3
    assert await SmsLog.find({"template": "reminder"}).count() == 3


async def test_no_reminder_outside_working_hours_or_after_contact(
    mongo: object, client: httpx.AsyncClient
) -> None:
    doc = await make_enquiry(client, created_at=datetime(2026, 10, 19, 17, 0, tzinfo=UTC))
    night = datetime(2026, 10, 19, 18, 0, tzinfo=UTC)  # 21:00 in Kampala
    assert await notifications.send_reminders(night, config=CFG) == 0
    await Enquiry.get_pymongo_collection().update_one(
        {"_id": doc.id}, {"$set": {"status": "contacted"}}
    )
    morning = datetime(2026, 10, 20, 6, 0, tzinfo=UTC)  # 09:00 in Kampala
    assert await notifications.send_reminders(morning, config=CFG) == 0


async def test_daily_limit_stops_sending_and_logs_once(
    mongo: object, client: httpx.AsyncClient
) -> None:
    doc = await make_enquiry(client)
    config = NotifyConfig(daily_limit=1)
    sms = ConsoleSmsProvider()
    args = dict(to="+256701000111", text="x", audience="staff", template="new_enquiry", enquiry=doc)
    assert await notifications.send_sms(sms, config, **args) is True
    assert await notifications.send_sms(sms, config, **args) is False
    assert await notifications.send_sms(sms, config, **args) is False
    assert await SmsLog.find({"status": "sent"}).count() == 1
    assert await SmsLog.find({"status": "skipped"}).count() == 2
    assert await AuditLog.find({"action": notifications.LIMIT_ACTION}).count() == 1


async def test_retention_anonymises_old_enquiries_but_keeps_clients(
    mongo: object, client: httpx.AsyncClient
) -> None:
    sid = await service_id()
    for _ in range(3):
        await submit(client, sid)
    old = datetime.now(UTC) - timedelta(days=800)
    docs = await Enquiry.find({}, sort="created_at").to_list()
    coll = Enquiry.get_pymongo_collection()
    await coll.update_many({}, {"$set": {"created_at": old}})
    await coll.update_one({"_id": docs[1].id}, {"$set": {"status": "care_started"}})
    await coll.update_one({"_id": docs[2].id}, {"$set": {"created_at": datetime.now(UTC)}})
    assert await run_retention() == 1
    assert await run_retention() == 0  # idempotent
    a, b, c = [await Enquiry.get(d.id) for d in docs]
    assert a.name == "Anonymised" and a.phone_e164 == "" and a.note == "" and a.anonymised_at
    assert a.reference == docs[0].reference and a.status == docs[0].status  # reports still work
    assert b.name == "Mary Atim" and b.anonymised_at is None  # became a client
    assert c.name == "Mary Atim"  # recent


async def test_clicks_are_counted_per_day_channel_and_page(
    mongo: object, client: httpx.AsyncClient
) -> None:
    for _ in range(2):
        assert (
            await client.post("/api/v1/public/clicks", json={"channel": "call", "page": "/contact"})
        ).status_code == 204
    await client.post("/api/v1/public/clicks", json={"channel": "whatsapp", "page": "/contact"})
    rows = await ClickStat.find({}).to_list()
    assert sorted((r.channel, r.hits) for r in rows) == [("call", 2), ("whatsapp", 1)]
    assert await Enquiry.count() == 0  # clicks never create an enquiry


async def test_migration_creates_the_enquiry_indexes(mongo) -> None:
    names = set(await mongo["enquiries"].index_information())
    assert {"reference_unique", "status_created", "phone", "search_text"} <= names
    assert "day_channel_page_unique" in await mongo["click_stats"].index_information()
    assert "at_ttl_180d" in await mongo["sms_log"].index_information()
