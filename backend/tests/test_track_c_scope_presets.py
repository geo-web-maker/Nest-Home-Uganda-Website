from app.modules.auth.scopes import ALL_SCOPE_IDS, SCOPE_PRESETS


def test_scope_preset_table_contains_expected_bundles():
    assert set(SCOPE_PRESETS) == {"nurse", "supervisor", "admin", "executive", "super_admin"}
    assert SCOPE_PRESETS["nurse"] == frozenset({"field:use", "sos:send"})
    assert SCOPE_PRESETS["super_admin"] == ALL_SCOPE_IDS


def test_every_scope_preset_contains_only_registered_scopes():
    for name, scopes in SCOPE_PRESETS.items():
        assert scopes <= ALL_SCOPE_IDS, name


def test_read_only_executive_preset_does_not_grant_write_scopes():
    assert not any(
        scope.endswith(":write") or scope.endswith(":hide") or scope.endswith(":export")
        for scope in SCOPE_PRESETS["executive"]
    )
