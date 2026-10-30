from tests.conftest import auth, make_token


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


async def test_live_follow_requires_the_sos_send_scope(client):
    response = await client.post(
        "/api/v1/field/sos/sos-case-0001/follow/start",
        json={"id": "follow-start-0001"},
        headers=auth(make_token(["field:use"])),
    )
    assert response.status_code == 403


async def test_live_follow_ping_requires_the_sos_send_scope(client):
    response = await client.post(
        "/api/v1/field/sos/sos-case-0001/follow/ping",
        json={"id": "follow-ping-0001", "lat": 0, "lng": 32, "accuracy_m": 15},
        headers=auth(make_token(["field:use"])),
    )
    assert response.status_code == 403


async def test_live_follow_safe_requires_the_sos_send_scope(client):
    response = await client.post(
        "/api/v1/field/sos/sos-case-0001/safe",
        json={"id": "follow-safe-0001"},
        headers=auth(make_token(["field:use"])),
    )
    assert response.status_code == 403


async def test_field_me_returns_only_the_signed_in_nurses_identity_and_active_supervisor_name(
    mongo: object, client: object
) -> None:
    """The app-shell identity fields must be server-derived, minimal and scoped to this nurse."""
    from uuid import uuid4

    from app.core.security import hash_password
    from app.modules.auth.models import User
    from app.modules.nurses.models import NurseProfile

    suffix = uuid4().hex
    nurse = User(
        name="Amina Nakato",
        email=f"nurse-{suffix}@example.test",
        password_hash=hash_password("test-only-password-0001"),
        scopes=["field:use"],
        kind="nurse",
        reach="own",
        is_active=True,
    )
    supervisor = User(
        name="Ruth Namusoke",
        email=f"supervisor-{suffix}@example.test",
        password_hash=hash_password("test-only-password-0002"),
        scopes=["field:use"],
        kind="staff",
        reach="team",
        is_active=True,
        phone_e164="+256700000001",
    )
    await nurse.insert()
    await supervisor.insert()
    await NurseProfile(
        user_id=str(nurse.id),
        staff_number=f"N-{suffix[:8]}",
        supervisor_id=str(supervisor.id),
        active=True,
    ).insert()

    response = await client.get(
        "/api/v1/field/me", headers=auth(make_token(["field:use"], user_id=str(nurse.id)))
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["display_name"] == "Amina Nakato"
    assert body["email"] == f"nurse-{suffix}@example.test"
    assert body["supervisor_name"] == "Ruth Namusoke"
    assert body["supervisor_phone"] == "+256700000001"
    assert "supervisor_email" not in body

    supervisor.is_active = False
    await supervisor.save()
    inactive = await client.get(
        "/api/v1/field/me", headers=auth(make_token(["field:use"], user_id=str(nurse.id)))
    )
    assert inactive.status_code == 200, inactive.text
    assert inactive.json()["supervisor_name"] is None
    assert inactive.json()["supervisor_phone"] is None

    unassigned = User(
        name="Nurse Without Supervisor",
        email=f"unassigned-{suffix}@example.test",
        password_hash=hash_password("test-only-password-0003"),
        scopes=["field:use"],
        kind="nurse",
        reach="own",
        is_active=True,
    )
    await unassigned.insert()
    await NurseProfile(
        user_id=str(unassigned.id), staff_number=f"N2-{suffix[:8]}", active=True
    ).insert()
    no_supervisor = await client.get(
        "/api/v1/field/me",
        headers=auth(make_token(["field:use"], user_id=str(unassigned.id))),
    )
    assert no_supervisor.status_code == 200, no_supervisor.text
    assert no_supervisor.json()["supervisor_name"] is None
    assert no_supervisor.json()["supervisor_phone"] is None
