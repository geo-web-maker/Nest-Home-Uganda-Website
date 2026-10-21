import pytest

from app.core.deps import Principal, require_scopes
from app.core.errors import Conflict, Forbidden, ValidationFailed
from app.modules.auth import service
from app.modules.auth.scopes import ALL_SCOPE_IDS, SCOPES, read_scope_for

# BUILDER_INSTRUCTIONS 12.2, copied by hand. A change to the registry must change this too.
EXPECTED = {
    "dashboard:view", "enquiries:read", "enquiries:write", "jobs:read", "jobs:write",
    "applications:read", "applications:write", "content:read", "content:write",
    "content:publish", "media:write", "translations:write", "translations:review",
    "settings:read", "settings:write", "users:read", "users:write", "reports:read",
    "reports:export", "activity:read", "system:manage",
}  # fmt: skip


def test_registry_is_exactly_the_documented_list() -> None:
    assert ALL_SCOPE_IDS == EXPECTED
    assert len(SCOPES) == len(EXPECTED)
    assert all(s.group and s.label for s in SCOPES)


def test_read_scope_pairing() -> None:
    assert read_scope_for("enquiries:write") == "enquiries:read"
    assert read_scope_for("media:write") is None  # no media:read exists
    assert read_scope_for("content:publish") is None


def test_no_scope_implies_another() -> None:
    write_only = Principal("u", frozenset({"enquiries:write"}), False)
    assert write_only.has("enquiries:write")
    assert not write_only.has("enquiries:read")


def test_superadmin_has_every_scope() -> None:
    sa = Principal("u", frozenset(), True)
    assert all(sa.has(s) for s in ALL_SCOPE_IDS)


def test_require_scopes_rejects_unknown_or_empty() -> None:
    with pytest.raises(ValueError):
        require_scopes("content:reed")
    with pytest.raises(ValueError):
        require_scopes()


def actor(scopes: set[str], superadmin: bool = False, uid: str = "actor") -> Principal:
    return Principal(uid, frozenset(scopes), superadmin)


def change(a: Principal, **kw) -> None:
    base = {
        "target_user_id": "someone-else",
        "current_scopes": set(),
        "current_is_superadmin": False,
        "new_scopes": set(),
        "new_is_superadmin": False,
    }
    service.validate_scope_change(a, **{**base, **kw})


def test_grant_requires_users_write() -> None:
    with pytest.raises(Forbidden):
        change(actor({"users:read", "content:read"}), new_scopes={"content:read"})


def test_cannot_grant_scope_you_do_not_hold() -> None:
    a = actor({"users:write", "content:read"})
    change(a, new_scopes={"content:read"})  # allowed
    with pytest.raises(Forbidden):
        change(a, new_scopes={"content:read", "jobs:write"})


def test_cannot_remove_scope_you_do_not_hold() -> None:
    with pytest.raises(Forbidden):
        change(
            actor({"users:write"}),
            current_scopes={"jobs:write"},
            new_scopes=set(),
        )


def test_only_superadmin_grants_system_manage() -> None:
    a = actor({"users:write", "system:manage"})  # holds it, still cannot hand it on
    with pytest.raises(Forbidden):
        change(a, new_scopes={"system:manage"})
    change(actor(set(), superadmin=True), new_scopes={"system:manage"})


def test_only_superadmin_changes_superadmin_flag() -> None:
    with pytest.raises(Forbidden):
        change(actor({"users:write"}), new_is_superadmin=True)
    change(actor(set(), superadmin=True), new_is_superadmin=True)


def test_cannot_edit_own_scopes_even_as_superadmin() -> None:
    with pytest.raises(Forbidden):
        change(
            actor(set(), superadmin=True, uid="me"), target_user_id="me", new_scopes={"jobs:read"}
        )


def test_unknown_scope_is_a_validation_error() -> None:
    with pytest.raises(ValidationFailed):
        change(actor(set(), superadmin=True), new_scopes={"role:owner"})


def test_invite_has_no_target_user() -> None:
    change(actor({"users:write", "jobs:read"}), target_user_id=None, new_scopes={"jobs:read"})


@pytest.mark.parametrize(
    ("count", "was", "stays", "blocked"),
    [
        (1, True, False, True),  # demote or deactivate the last one
        (1, True, True, False),  # unchanged
        (2, True, False, False),  # another remains
        (1, False, False, False),  # not a superadmin
    ],
)
def test_last_superadmin_protection(count: int, was: bool, stays: bool, blocked: bool) -> None:
    if blocked:
        with pytest.raises(Conflict):
            service.ensure_not_last_superadmin(
                count, was_superadmin=was, stays_active_superadmin=stays
            )
    else:
        service.ensure_not_last_superadmin(count, was_superadmin=was, stays_active_superadmin=stays)
