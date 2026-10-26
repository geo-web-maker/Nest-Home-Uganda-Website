from conftest import auth, make_token


async def test_care_settings_requires_authentication(client):
    response = await client.get("/api/v1/admin/care/settings")
    assert response.status_code == 401


async def test_care_settings_requires_read_scope(client):
    response = await client.get(
        "/api/v1/admin/care/settings", headers=auth(make_token(["clients:read"]))
    )
    assert response.status_code == 403
