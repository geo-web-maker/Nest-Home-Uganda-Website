"""Mongo-only persistence helpers for online agreements."""
from pymongo import ReturnDocument

from app.core import db


async def next_reference(year: int) -> str:
    row = await db.get_database()["counters"].find_one_and_update(
        {"_id": f"agreement_ref:{year}"}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"BHC-{year}-{int(row['seq']):04d}"
