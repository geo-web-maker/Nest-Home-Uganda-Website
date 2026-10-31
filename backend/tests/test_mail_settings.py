"""Unit-level tests for the mail settings foundation (no live Neon account needed)."""

import json
from types import SimpleNamespace

import pytest

from app.core.errors import ValidationFailed
from app.modules.mail import settings_service as settings
from app.modules.mail.defaults import BY_KEY


class _FakeConnection:
    def __init__(self, pool):
        self.pool = pool

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    def transaction(self):
        return self

    async def execute(self, query, *args):
        self.pool.executed.append((query, args))
        if query.lstrip().startswith("INSERT INTO mail_settings"):
            key, raw, is_secret, actor = args
            self.pool.rows[key] = {
                "value": json.loads(raw),
                "is_secret": is_secret,
                "updated_by": actor,
            }
        elif query.lstrip().startswith("DELETE FROM mail_settings"):
            self.pool.rows.pop(args[0], None)


class _FakePool:
    def __init__(self):
        self.rows = {}
        self.executed = []

    async def fetchrow(self, _query, key):
        return self.rows.get(key)

    def acquire(self):
        return _FakeConnection(self)


@pytest.fixture(autouse=True)
def clean_settings_cache():
    settings.clear_cache()
    yield
    settings.clear_cache()


def _secret_key(monkeypatch):
    monkeypatch.setattr(
        settings,
        "get_settings",
        lambda: SimpleNamespace(nest_mail_secret_key="unit-test-only-key-material"),
    )


@pytest.mark.asyncio
async def test_settings_precedence_is_database_then_environment_then_default(monkeypatch):
    pool = _FakePool()
    monkeypatch.setenv("NEST_MAIL_ENABLED", "true")
    assert await settings.get_value("mail.enabled", pool=pool, use_cache=False) is True

    pool.rows["mail.enabled"] = {"value": False, "is_secret": False}
    settings.clear_cache()
    assert await settings.get_value("mail.enabled", pool=pool, use_cache=False) is False

    pool.rows.clear()
    monkeypatch.delenv("NEST_MAIL_ENABLED")
    settings.clear_cache()
    assert await settings.get_value("mail.enabled", pool=pool, use_cache=False) is False


def test_secret_encryption_is_authenticated_and_round_trips(monkeypatch):
    _secret_key(monkeypatch)
    encrypted = settings.encrypt_secret("provider-secret-value")
    assert encrypted.startswith("enc:")
    assert "provider-secret-value" not in encrypted
    assert settings.decrypt_secret(encrypted) == "provider-secret-value"


def test_secret_encryption_fails_closed_when_key_is_missing(monkeypatch):
    monkeypatch.setattr(settings, "get_settings", lambda: SimpleNamespace(nest_mail_secret_key=""))
    with pytest.raises(ValidationFailed, match="NEST_MAIL_SECRET_KEY"):
        settings.encrypt_secret("secret")


def test_settings_validation_rejects_unsafe_domain_provider_and_sizes():
    with pytest.raises(ValidationFailed):
        settings._validate(BY_KEY["mail.domain"], "person@example.com\r\nBcc:other@example.com")
    with pytest.raises(ValidationFailed):
        settings._validate(BY_KEY["mail.provider"], "smtp")
    with pytest.raises(ValidationFailed):
        settings._validate(BY_KEY["mail.max_message_mb"], 26)


def test_settings_validation_normalises_root_domains():
    assert settings._validate(BY_KEY["mail.domain"], "  NEST.EXAMPLE  ") == "nest.example"


def test_settings_validation_rejects_header_injection():
    with pytest.raises(ValidationFailed):
        settings._validate(BY_KEY["mail.from_name"], "Nest\r\nBcc: attacker@example.com")
    with pytest.raises(ValidationFailed):
        settings._validate(BY_KEY["mail.reply_to"], "nurse@example.com\nBcc: attacker@example.com")


@pytest.mark.asyncio
async def test_secret_settings_are_masked_in_api_and_never_returned(monkeypatch):
    pool = _FakePool()
    monkeypatch.setenv("NEST_MAIL_API_KEY", "bootstrap-provider-secret")
    items = await settings.settings_for_api(pool=pool)
    provider_key = next(item for item in items if item["key"] == "mail.provider_api_key")
    assert provider_key["is_secret"] is True
    assert provider_key["is_set"] is True
    assert "value" not in provider_key
    assert "bootstrap-provider-secret" not in json.dumps(items)


@pytest.mark.asyncio
async def test_saving_secret_persists_ciphertext_and_audits_only_the_key(monkeypatch):
    _secret_key(monkeypatch)
    pool = _FakePool()
    await settings.set_value(
        "mail.provider_api_key", "top-secret", "superadmin-1", pool=pool
    )
    stored = pool.rows["mail.provider_api_key"]["value"]["encrypted"]
    assert stored.startswith("enc:")
    assert "top-secret" not in stored
    audit_calls = [entry for entry in pool.executed if "mail_audit" in entry[0]]
    assert len(audit_calls) == 1
    assert "top-secret" not in audit_calls[0][1][1]


def test_initial_migration_contains_core_mail_tables_and_namespace_guard():
    from app.modules.mail.db import MIGRATIONS_DIR

    sql = (MIGRATIONS_DIR / "0001_core.sql").read_text(encoding="utf-8")
    for table in (
        "mailbox", "mailbox_alias", "mailbox_member", "message", "message_recipient",
        "mailbox_message", "attachment", "outbox", "suppression", "send_counter",
        "mail_settings", "mail_audit", "totp_secret",
    ):
        assert f"CREATE TABLE IF NOT EXISTS {table}" in sql
    assert "mail_guard_address_namespace" in sql
    assert "pg_advisory_xact_lock" in sql


class _FakeMigrationConnection:
    def __init__(self):
        self.applied = set()
        self.statements = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    def transaction(self):
        return self

    async def execute(self, query, *args):
        self.statements.append((query, args))
        if query.lstrip().startswith("INSERT INTO schema_migrations"):
            self.applied.add(args[0])

    async def fetch(self, _query):
        return [{"name": name} for name in self.applied]


class _FakeMigrationPool:
    def __init__(self):
        self.connection = _FakeMigrationConnection()

    def acquire(self):
        return self.connection


@pytest.mark.asyncio
async def test_migration_runner_is_ordered_idempotent_and_transaction_locked(tmp_path):
    from app.modules.mail.db import run_migrations

    (tmp_path / "0002_second.sql").write_text("SELECT 2;", encoding="utf-8")
    (tmp_path / "0001_first.sql").write_text("SELECT 1;", encoding="utf-8")
    pool = _FakeMigrationPool()

    assert await run_migrations(pool, tmp_path) == ["0001_first.sql", "0002_second.sql"]
    assert pool.connection.statements[1][0].startswith("SELECT pg_advisory_xact_lock")
    assert await run_migrations(pool, tmp_path) == []
