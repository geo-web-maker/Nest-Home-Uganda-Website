"""Queries only. Anything that must be atomic is a single MongoDB operation here."""

import re
from datetime import datetime
from typing import Any

from beanie import PydanticObjectId
from pymongo import ReturnDocument

from app.core import db
from app.core.pagination import PageParams
from app.core.phone import normalise_e164
from app.modules.enquiries.models import Enquiry, EnquiryEvent

_REF_RE = re.compile(r"^NHC-\d{1,9}$", re.IGNORECASE)


async def next_sequence() -> int:
    """Atomic counter (spec 8.3). A failed insert later leaves a harmless gap."""
    doc = await db.get_database()["counters"].find_one_and_update(
        {"_id": "enquiry_ref"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(doc["seq"])


async def get(enquiry_id: str) -> Enquiry | None:
    if not PydanticObjectId.is_valid(enquiry_id):
        return None
    return await Enquiry.get(PydanticObjectId(enquiry_id))


async def push_event(enquiry_id: PydanticObjectId, event: EnquiryEvent) -> None:
    await Enquiry.get_pymongo_collection().update_one(
        {"_id": enquiry_id}, {"$push": {"events": event.model_dump()}}
    )


async def set_fields(enquiry_id: PydanticObjectId, fields: dict[str, Any]) -> None:
    await Enquiry.get_pymongo_collection().update_one({"_id": enquiry_id}, {"$set": fields})


async def claim_visitor_sms(enquiry_id: PydanticObjectId) -> bool:
    """True for exactly one caller: the visitor SMS is attempted once per enquiry."""
    result = await Enquiry.get_pymongo_collection().update_one(
        {"_id": enquiry_id, "visitor_sms_done": False}, {"$set": {"visitor_sms_done": True}}
    )
    return result.modified_count == 1


def _filters(
    q: str | None,
    status: str | None,
    service: str | None,
    assigned_to: str | None,
    start: datetime | None,
    end: datetime | None,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if status:
        query["status"] = status
    if service and PydanticObjectId.is_valid(service):
        query["services.service_id"] = PydanticObjectId(service)
    if assigned_to and PydanticObjectId.is_valid(assigned_to):
        query["assigned_to"] = PydanticObjectId(assigned_to)
    if start or end:
        query["created_at"] = {k: v for k, v in (("$gte", start), ("$lt", end)) if v}
    if q:
        term = q.strip()
        phone = normalise_e164(term)
        if _REF_RE.match(term):
            query["reference"] = term.upper()  # indexed, exact
        elif phone:
            query["phone_e164"] = phone  # indexed, exact
        else:
            query["$text"] = {"$search": term}  # text index; never an unbounded $regex
    return query


async def list_admin(
    page: PageParams,
    q: str | None,
    status: str | None,
    service: str | None,
    assigned_to: str | None,
    start: datetime | None,
    end: datetime | None,
    oldest_first: bool,
) -> tuple[list[Enquiry], int]:
    finder = Enquiry.find(_filters(q, status, service, assigned_to, start, end))
    total = await finder.count()
    items = (
        await finder.sort("created_at" if oldest_first else "-created_at")
        .skip(page.skip)
        .limit(page.page_size)
        .to_list()
    )
    return items, total


async def claim_reminder(enquiry: Enquiry, now: datetime) -> bool:
    """At most one reminder per slot, even if two workers race (compare-and-set)."""
    result = await Enquiry.get_pymongo_collection().update_one(
        {"_id": enquiry.id, "status": "new", "reminders_sent": enquiry.reminders_sent},
        {"$inc": {"reminders_sent": 1}, "$set": {"last_reminder_at": now}},
    )
    return result.modified_count == 1


async def candidates_for_reminder(older_than: datetime, max_reminders: int) -> list[Enquiry]:
    return await Enquiry.find(
        {
            "status": "new",
            "reminders_sent": {"$lt": max_reminders},
            "created_at": {"$lte": older_than},
        }
    ).to_list()


async def anonymise_before(cutoff: datetime, now: datetime) -> int:
    """Idempotent: already-anonymised and client (care_started) enquiries are skipped."""
    result = await Enquiry.get_pymongo_collection().update_many(
        {"created_at": {"$lt": cutoff}, "anonymised_at": None, "status": {"$ne": "care_started"}},
        {
            "$set": {
                "name": "Anonymised",
                "phone_raw": "",
                "phone_e164": "",
                "note": "",
                "ip_hash": None,
                "user_agent": None,
                "not_proceeding_reason": None,
                "anonymised_at": now,
                "events": [],
            }
        },
    )
    return result.modified_count
