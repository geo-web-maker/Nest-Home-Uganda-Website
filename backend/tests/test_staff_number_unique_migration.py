"""Safe staff-number index migration checks (requires TEST_MONGODB_URI)."""

import importlib.util
import uuid
from pathlib import Path

import pytest
from pymongo.errors import DuplicateKeyError

MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "0020_unique_nurse_staff_numbers.py"
spec = importlib.util.spec_from_file_location("staff_number_migration", MIGRATION)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


async def test_migration_aborts_without_creating_index_when_duplicate_values_exist(mongo):
    db = mongo.client[f"staff_index_{uuid.uuid4().hex}"]
    collection = db["nurse_profiles"]
    try:
        await collection.insert_many([
            {"user_id": "u1", "staff_number": "STF-100"},
            {"user_id": "u2", "staff_number": "stf-100"},
        ])
        with pytest.raises(RuntimeError, match="duplicate values require owner review"):
            await module.up(db)
        assert module.INDEX_NAME not in await collection.index_information()
        assert await collection.count_documents({}) == 2
    finally:
        await mongo.client.drop_database(db.name)


async def test_migration_creates_case_insensitive_unique_index_when_clean(mongo):
    db = mongo.client[f"staff_index_{uuid.uuid4().hex}"]
    collection = db["nurse_profiles"]
    try:
        await collection.insert_many([
            {"user_id": "u1", "staff_number": "STF-100"},
            {"user_id": "u2", "staff_number": "STF-101"},
        ])
        await module.up(db)
        indexes = await collection.index_information()
        assert module.INDEX_NAME in indexes
        assert indexes[module.INDEX_NAME]["partialFilterExpression"] == {"staff_number": {"$type": "string"}}
        with pytest.raises(DuplicateKeyError):
            await collection.insert_one({"user_id": "u3", "staff_number": "stf-100"})
    finally:
        await mongo.client.drop_database(db.name)
