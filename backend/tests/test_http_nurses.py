from app.core.deps import ReachContext, get_care_actor
from tests.conftest import app, auth, make_token


async def test_nurse_admin_requires_authentication(client):
    response = await client.get("/api/v1/admin/care/nurses")
    assert response.status_code == 401


async def test_nurse_admin_requires_read_scope(client):
    response = await client.get(
        "/api/v1/admin/care/nurses", headers=auth(make_token(["clients:read"]))
    )
    assert response.status_code == 403


async def test_field_route_rejects_non_field_token(client):
    response = await client.get("/api/v1/field/visits", headers=auth(make_token(["nurses:read"])))
    assert response.status_code == 403


async def _out_of_reach_context():
    return ReachContext("actor-user", "own")


async def test_nurse_write_scope_does_not_bypass_own_reach(client):
    app.dependency_overrides[get_care_actor] = _out_of_reach_context
    try:
        headers = auth(make_token(["nurses:write"], user_id="actor-user"))
        response = await client.patch(
            "/api/v1/admin/care/nurses/not-my-nurse", json={"active": False}, headers=headers
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_care_actor, None)


async def test_supervisor_change_is_hidden_outside_reach(client):
    app.dependency_overrides[get_care_actor] = _out_of_reach_context
    try:
        headers = auth(make_token(["nurses:write"], user_id="actor-user"))
        response = await client.patch(
            "/api/v1/admin/care/nurses/not-my-nurse/supervisor",
            json={"supervisor_id": "another-user"},
            headers=headers,
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_care_actor, None)


async def test_adhoc_override_does_not_bypass_reach(client):
    app.dependency_overrides[get_care_actor] = _out_of_reach_context
    try:
        headers = auth(make_token(["carecfg:write"], user_id="actor-user"))
        response = await client.patch(
            "/api/v1/admin/care/nurses/not-my-nurse/adhoc-override",
            json={"enabled": True},
            headers=headers,
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_care_actor, None)


async def test_device_revocation_does_not_bypass_reach(client):
    app.dependency_overrides[get_care_actor] = _out_of_reach_context
    try:
        headers = auth(make_token(["nurses:write"], user_id="actor-user"))
        response = await client.post(
            "/api/v1/admin/care/nurses/not-my-nurse/revoke-device",
            json={"device_id": "device-12345678"},
            headers=headers,
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_care_actor, None)


async def test_field_timesheets_requires_field_scope(client):
    response = await client.get(
        "/api/v1/field/timesheets", headers=auth(make_token(["nurses:read"]))
    )
    assert response.status_code == 403


async def test_nurse_cannot_use_admin_timesheets_endpoint(client):
    response = await client.get(
        "/api/v1/admin/care/timesheets",
        headers=auth(make_token(["field:use"], user_id="field-nurse-user")),
    )
    assert response.status_code == 403


async def test_supervisor_options_requires_authentication(client):
    response = await client.get("/api/v1/admin/care/nurses/supervisor-options")
    assert response.status_code == 401


async def test_supervisor_options_requires_write_scope(client):
    response = await client.get(
        "/api/v1/admin/care/nurses/supervisor-options", headers=auth(make_token(["nurses:read"]))
    )
    assert response.status_code == 403


def test_supervisor_options_route_is_not_shadowed_by_the_user_id_route():
    paths = [getattr(route, "path", "") for route in app.routes]
    fixed = "/api/v1/admin/care/nurses/supervisor-options"
    dynamic = "/api/v1/admin/care/nurses/{user_id}"
    assert fixed in paths
    assert paths.index(fixed) < paths.index(dynamic)
