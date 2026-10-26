"""Migrations and seed against a real MongoDB (needs TEST_MONGODB_URI)."""

import pytest
from pymongo.errors import DuplicateKeyError

from app.core import db
from app.migrate import discover, run_migrations
from app.modules.areas.models import Area
from app.modules.areas.seed import seed_areas
from app.modules.auth.models import User
from app.modules.faqs.models import Faq
from app.modules.faqs.seed import seed_faqs
from app.modules.jobs.models import Job
from app.modules.jobs.seed import seed_jobs
from app.modules.pricing.models import PricingBlock
from app.modules.pricing.seed import seed_pricing
from app.seed import seed_first_superadmin


def test_migration_scripts_are_numbered_and_discoverable() -> None:
    names = [p.stem for p in discover()]
    assert names and names[0] == "0001_indexes"
    assert names == sorted(names)


async def test_migrations_run_once_then_change_nothing(mongo) -> None:
    care_migrations = {
        "0006_care_users",
        "0007_care_core",
        "0008_care_ops",
        "0010_care_client_consents",
        "0011_visit_sync_cursor",
        "0012_care_track_c",
        "0013_partial_id_indexes",
    }
    assert (
        await run_migrations(mongo, exclude=care_migrations) == []
    )  # the fixture already ran them
    names = {d["_id"] async for d in mongo["migrations"].find()}
    care_names = {d["_id"] async for d in db.get_care_database()["migrations"].find()}
    assert "0001_indexes" in names
    assert care_migrations <= care_names


async def test_indexes_exist_with_ttls(mongo) -> None:
    users = await mongo["users"].index_information()
    assert users["email_unique"]["unique"] is True
    services = await mongo["services"].index_information()
    assert services["slug_unique"]["unique"] is True
    audit = await mongo["audit_log"].index_information()
    assert audit["at_ttl_24_months"]["expireAfterSeconds"] == 730 * 86400
    tokens = await mongo["refresh_tokens"].index_information()
    assert tokens["expires_ttl"]["expireAfterSeconds"] == 0


async def test_visit_sync_migration_backfills_legacy_timestamp_and_indexes(mongo) -> None:
    from datetime import UTC, datetime
    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path

    care_database = db.get_care_database()
    created_at = datetime(2026, 1, 2, 3, 4, tzinfo=UTC)
    await care_database["visits"].insert_one(
        {
            "id": "legacy-sync-visit-0001",
            "created_at": created_at,
            "scheduled_start": created_at,
            "nurse_id": "legacy-sync-nurse-0001",
        }
    )
    migration_path = (
        Path(__file__).resolve().parents[1] / "migrations" / "0011_visit_sync_cursor.py"  # noqa: ASYNC240
    )
    spec = spec_from_file_location("migration_0011_visit_sync_cursor_test", migration_path)
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    await module.up(care_database)

    saved = await care_database["visits"].find_one({"id": "legacy-sync-visit-0001"})
    assert saved is not None and saved["updated_at"] == created_at
    visit_indexes = await care_database["visits"].index_information()
    tombstone_indexes = await care_database["visit_sync_tombstones"].index_information()
    assert "ix_visits_nurse_updated_id" in visit_indexes
    assert "ix_visit_sync_tombstones_nurse_updated_id" in tombstone_indexes


async def test_duplicate_email_is_rejected_by_the_index(mongo) -> None:
    await User(name="A", email="a@example.com", password_hash="x").insert()
    with pytest.raises(DuplicateKeyError):
        await User(name="B", email="a@example.com", password_hash="y").insert()


async def test_seed_superadmin_is_created_once_and_password_is_hashed(mongo) -> None:
    assert await seed_first_superadmin("Boss@Example.com", "a-long-enough-password") is True
    assert await seed_first_superadmin("boss@example.com", "a-long-enough-password") is False
    user = await User.find_one(User.email == "boss@example.com")
    assert user is not None and user.is_superadmin and user.scopes == []
    assert "a-long-enough-password" not in user.password_hash


@pytest.mark.parametrize(("email", "password"), [("", "a-long-enough-password"), ("a@b.co", "")])
async def test_seed_fails_when_env_values_are_empty(mongo, email: str, password: str) -> None:
    with pytest.raises(SystemExit):
        await seed_first_superadmin(email, password)


async def test_seed_rejects_a_short_password(mongo) -> None:
    with pytest.raises(SystemExit):
        await seed_first_superadmin("a@b.co", "short")


async def test_content_seeds_run_once_and_keep_admin_edits(mongo) -> None:
    assert (await seed_areas(), await seed_faqs(), await seed_pricing()) == (12, 6, 3)
    assert await seed_jobs(Job) == 3
    # Rename one of each and delete another: a second run must add nothing back.
    area = await Area.find_one({"name": "Kololo"})
    faq = await Faq.find_one({"question.en": "How much does it cost?"})
    job = await Job.find_one({"title.en": "Midwife"})
    assert area is not None and faq is not None and job is not None
    area.name = "Kololo Hill"
    await area.save()
    faq.question = {"en": "What does it cost?"}
    await faq.save()
    job.title = {"en": "Senior Midwife"}
    await job.save()
    other = await Area.find_one({"name": "Wakiso"})
    assert other is not None
    other.deleted_at = other.created_at
    await other.save()
    assert (await seed_areas(), await seed_faqs(), await seed_pricing()) == (0, 0, 0)
    assert await seed_jobs(Job) == 0
    assert await Area.count() == 12 and await Faq.count() == 6 and await Job.count() == 3
    assert await PricingBlock.count() == 3
