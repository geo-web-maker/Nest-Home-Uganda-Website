"""Mongo counter allocation for billing references.

A deleted document gives its number back. Released numbers are kept in
``billing_released_numbers`` and handed out again, lowest first, before the counter moves on, so the
real invoice and receipt sequences have no holes. Each reuse bumps a *generation*; the generation
keeps the stored PDF keys of the new document apart from any copy of the deleted one that an Object
Lock retention period still protects.
"""

from pymongo import ASCENDING, ReturnDocument

from app.core import db

RELEASED = "billing_released_numbers"


def counter_name(kind: str, year: int, practice: bool) -> str:
    if kind not in {"invoice", "receipt"}:
        raise ValueError("Unsupported billing reference kind")
    return f"{kind}_{'test_' if practice else ''}ref:{year}"


def format_reference(kind: str, year: int, practice: bool, seq: int) -> str:
    code = "INV" if kind == "invoice" else "RCT"
    prefix = "TEST" if practice else "BHC"
    return f"{prefix}-{code}-{year}-{int(seq):04d}"


def storage_ref(reference: str, generation: int) -> str:
    """Folder name used in storage keys. Generation 0 keeps the original, plain reference."""
    return reference if not generation else f"{reference}-g{generation}"


async def allocate_reference(kind: str, year: int, practice: bool = False) -> tuple[str, int]:
    """Return ``(reference, generation)``: a released number if one exists, else the next new one."""
    name = counter_name(kind, year, practice)
    database = db.get_database()
    released = await database[RELEASED].find_one_and_delete(
        {"counter": name}, sort=[("seq", ASCENDING)]
    )
    if released is not None:
        return (
            format_reference(kind, year, practice, int(released["seq"])),
            int(released.get("generation", 1)),
        )
    row = await database["counters"].find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return format_reference(kind, year, practice, int(row["seq"])), 0


async def next_reference(kind: str, year: int, practice: bool = False) -> str:
    return (await allocate_reference(kind, year, practice))[0]


def parse_reference(reference: str) -> tuple[str, int, bool, int]:
    """Split ``BHC-INV-2026-0007`` into ``(kind, year, practice, seq)``."""
    prefix, code, year, seq = reference.split("-")
    kinds = {"INV": "invoice", "RCT": "receipt"}
    if prefix not in {"BHC", "TEST"} or code not in kinds:
        raise ValueError("Not a billing reference")
    return kinds[code], int(year), prefix == "TEST", int(seq)


async def release_reference(reference: str, generation: int) -> None:
    """Hand a deleted document's number back so it can be issued again."""
    kind, year, practice, seq = parse_reference(reference)
    name = counter_name(kind, year, practice)
    await db.get_database()[RELEASED].update_one(
        {"counter": name, "seq": seq},
        {"$set": {"generation": int(generation) + 1, "reference": reference}},
        upsert=True,
    )
