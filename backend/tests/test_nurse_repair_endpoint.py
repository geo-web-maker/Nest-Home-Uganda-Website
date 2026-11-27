"""Sensitive nurse-profile repair remains locked behind a current TOTP session."""

from datetime import UTC, datetime

from app.modules.auth.models import User
from tests.conftest import auth, make_token


async def test_repair_requires_superadmin_and_totp(mongo, client):
    user = User(
        name="Repair Superadmin",
        email=f"repair-admin-{datetime.now(UTC).timestamp()}@example.test",
        password_hash="not-a-real-password-hash",
        scopes=["nurses:write"],
        is_superadmin=True,
    )
    await user.insert()
    response = await client.post(
        "/api/v1/admin/care/nurses/repair-profiles",
        headers=auth(make_token(["nurses:write"], superadmin=True, user_id=str(user.id))),
        json={"dry_run": True},
    )
    assert response.status_code == 403
    assert "authenticator" in response.text.lower() or "totp" in response.text.lower()
