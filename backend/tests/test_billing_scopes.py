from app.modules.auth.scopes import ALL_SCOPE_IDS, SCOPE_PRESETS


def test_billing_scopes_are_registered():
    assert {"billing:read", "billing:write", "billing:void"} <= ALL_SCOPE_IDS


def test_billing_presets_match_builder_instructions():
    assert {"billing:read", "billing:write", "billing:void"} <= SCOPE_PRESETS["admin"]
    assert "billing:read" in SCOPE_PRESETS["executive"]
    assert not SCOPE_PRESETS["lawyer"] & {"billing:read", "billing:write", "billing:void"}
    assert not SCOPE_PRESETS["nurse"] & {"billing:read", "billing:write", "billing:void"}
    assert SCOPE_PRESETS["super_admin"] == ALL_SCOPE_IDS
