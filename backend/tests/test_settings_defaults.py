from app.core.config import Settings


def test_existing_scheduler_defaults_on():
    settings = Settings(_env_file=None)
    assert settings.scheduler_enabled is True
