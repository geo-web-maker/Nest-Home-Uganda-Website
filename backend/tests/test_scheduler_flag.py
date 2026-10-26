from app.core.config import Settings


def test_scheduler_flag_can_be_disabled_from_environment(monkeypatch):
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    settings = Settings(_env_file=None)
    assert settings.scheduler_enabled is False
