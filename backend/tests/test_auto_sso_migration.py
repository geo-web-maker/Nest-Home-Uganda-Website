"""Existing accounts are explicitly opted out from automatic cross-app SSO."""

import importlib.util
from pathlib import Path
import uuid

MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "0021_default_auto_sso_disabled.py"
spec = importlib.util.spec_from_file_location("auto_sso_migration", MIGRATION)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


async def test_backfill_defaults_missing_fields_without_overwriting_explicit_user_opt_in(mongo):
    db = mongo.client[f"auto_sso_{uuid.uuid4().hex}"]
    users = db["users"]
    try:
        await users.insert_many([
            {"_id": "legacy-opted-in", "auto_sso_enabled": True},
            {"_id": "legacy-no-fields"},
        ])
        await module.up(db)
        opted_in = await users.find_one({"_id": "legacy-opted-in"})
        untouched = await users.find_one({"_id": "legacy-no-fields"})
        assert opted_in["auto_sso_enabled"] is True
        assert opted_in["auto_sso_allowed"] is False
        assert untouched["auto_sso_enabled"] is False
        assert untouched["auto_sso_allowed"] is False
    finally:
        await mongo.client.drop_database(db.name)
