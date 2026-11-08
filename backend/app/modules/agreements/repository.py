"""Mongo-only persistence helpers for online agreements."""
from pymongo import ReturnDocument

from app.core import db


async def next_reference(year: int, practice: bool = False) -> str:
    counter = f"agreement_test_ref:{year}" if practice else f"agreement_ref:{year}"
    row = await db.get_database()["counters"].find_one_and_update(
        {"_id": counter}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"{'TEST' if practice else 'BHC'}-{year}-{int(row['seq']):04d}"
