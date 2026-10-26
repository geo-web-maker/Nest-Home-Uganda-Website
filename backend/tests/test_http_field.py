from conftest import auth, make_token


async def test_field_requires_authentication(client):
    response = await client.get("/api/v1/field/me")
    assert response.status_code == 401


async def test_field_requires_field_scope(client):
    response = await client.get("/api/v1/field/me", headers=auth(make_token(["sos:send"])))
    assert response.status_code == 403


async def test_adhoc_visit_requires_authentication(client):
    payload = {
        "id": "visit-adhoc-0001",
        "client_op_id": "op-adhoc-0001",
        "client_id": "client-0001",
        "device_time": "2026-10-25T08:00:00Z",
        "sent_at_device": "2026-10-25T08:00:00Z",
        "lat": 0,
        "lng": 0,
        "accuracy_m": 10,
        "source": "pwa_manual",
        "device_info": {},
    }
    response = await client.post("/api/v1/field/visits/adhoc", json=payload)
    assert response.status_code == 401


async def test_adhoc_visit_requires_field_scope(client):
    payload = {
        "id": "visit-adhoc-0002",
        "client_op_id": "op-adhoc-0002",
        "client_id": "client-0001",
        "device_time": "2026-10-25T08:00:00Z",
        "sent_at_device": "2026-10-25T08:00:00Z",
        "lat": 0,
        "lng": 0,
        "accuracy_m": 10,
        "source": "pwa_manual",
        "device_info": {},
    }
    response = await client.post(
        "/api/v1/field/visits/adhoc", json=payload, headers=auth(make_token(["sos:send"]))
    )
    assert response.status_code == 403


async def test_sync_pull_requires_authentication(client):
    response = await client.get("/api/v1/field/sync/pull")
    assert response.status_code == 401
