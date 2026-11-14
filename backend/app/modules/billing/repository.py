"""Mongo counter allocation for billing references."""

from pymongo import ReturnDocument

from app.core import db


async def next_reference(kind: str, year: int, practice: bool = False) -> str:
    if kind not in {"invoice", "receipt"}:
        raise ValueError("Unsupported billing reference kind")
    counter_kind = f"{kind}_{'test_' if practice else ''}ref:{year}"
    row = await db.get_database()["counters"].find_one_and_update(
        {"_id": counter_kind},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    code = "INV" if kind == "invoice" else "RCT"
    prefix = "TEST" if practice else "BHC"
    return f"{prefix}-{code}-{year}-{int(row['seq']):04d}"
