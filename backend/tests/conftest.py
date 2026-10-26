import os
import uuid
from collections.abc import AsyncIterator

import httpx
import pytest

# Must be set before the app is imported. Dummy values only.
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-0123456789")
os.environ.setdefault("IP_HASH_SALT", "test-salt")
os.environ.pop("MONGODB_URI", None)  # the app must not auto-connect in tests

from app.core import db  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.migrate import run_migrations  # noqa: E402
from app.modules.auth.scopes import ALL_SCOPE_IDS  # noqa: E402
from app.registry import CARE_DOCUMENT_MODELS, DOCUMENT_MODELS  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_rate_limiter() -> None:
    limiter.reset()


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def make_token(scopes: list[str] | None = None, superadmin: bool = False, user_id: str = "") -> str:
    token, _ = create_access_token(user_id or "a" * 24, scopes or [], superadmin)
    return token


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


SUPERADMIN_HEADERS_SCOPES = sorted(ALL_SCOPE_IDS)


@pytest.fixture
async def mongo() -> AsyncIterator[object]:
    """A throwaway database on the real MongoDB given by TEST_MONGODB_URI.

    Locally the test is skipped when the variable is missing. In CI it must fail.
    """
    uri = os.environ.get("TEST_MONGODB_URI", "")
    if not uri:
        if os.environ.get("CI"):
            pytest.fail("TEST_MONGODB_URI is required in CI")
        pytest.skip("TEST_MONGODB_URI is not set (needs a real MongoDB replica set)")
    name = f"nhc_test_{uuid.uuid4().hex[:12]}"
    care_name = f"{name}_care"
    await db.connect(
        uri,
        name,
        DOCUMENT_MODELS,
        care_uri=uri,
        care_db_name=care_name,
        care_models=CARE_DOCUMENT_MODELS,
    )
    database = db.get_database()
    care_database = db.get_care_database()
    care_migrations = {
        "0006_care_users",
        "0007_care_core",
        "0008_care_ops",
        "0010_care_client_consents",
        "0011_visit_sync_cursor",
        "0012_care_track_c",
    }
    await run_migrations(database, exclude=care_migrations)
    await run_migrations(care_database, only=care_migrations)
    try:
        yield database
    finally:
        await database.client.drop_database(name)
        await database.client.drop_database(care_name)
        await db.disconnect()
