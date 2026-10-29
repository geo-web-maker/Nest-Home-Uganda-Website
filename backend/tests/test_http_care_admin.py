from tests.conftest import auth, make_token


async def test_care_clients_requires_authentication(client):
    response = await client.get("/api/v1/admin/care/clients")
    assert response.status_code == 401


async def test_care_clients_requires_clients_read(client):
    response = await client.get(
        "/api/v1/admin/care/clients", headers=auth(make_token(["visits:read"]))
    )
    assert response.status_code == 403


async def test_client_data_export_requires_system_manage(client):
    response = await client.get(
        "/api/v1/admin/care/data-requests/clients/client-0001/export",
        headers=auth(make_token(["clients:read"])),
    )
    assert response.status_code == 403


async def test_client_data_anonymise_requires_system_manage(client):
    response = await client.post(
        "/api/v1/admin/care/data-requests/clients/client-0001/anonymise",
        headers=auth(make_token(["clients:write"])),
    )
    assert response.status_code == 403


async def test_client_consent_recording_requires_clients_write(client):
    response = await client.post(
        "/api/v1/admin/care/clients/client-0001/consents",
        headers=auth(make_token(["clients:read"])),
        json={"type": "privacy_notice", "version": "v1"},
    )
    assert response.status_code == 403


async def test_live_follow_snapshots_require_alerts_read_scope(client):
    response = await client.get(
        "/api/v1/admin/care/sos/sos-case-0001/follow",
        headers=auth(make_token(["field:use", "sos:send"])),
    )
    assert response.status_code == 403
