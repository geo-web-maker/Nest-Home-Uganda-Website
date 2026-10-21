"""User request schemas. No database."""

import pytest
from pydantic import ValidationError

from app.modules.users.schemas import SetPasswordIn, UserInvite, UserUpdate


def test_invite_cleans_text_and_has_no_superadmin_field() -> None:
    item = UserInvite(name="  Grace\x00 Okello ", email="grace@gmail.com", scopes=["content:read"])
    assert item.name == "Grace Okello"
    assert "is_superadmin" not in UserInvite.model_fields


@pytest.mark.parametrize(
    "changes",
    [{"name": "G"}, {"email": "nope"}, {"scopes": ["x"] * 41}],
)
def test_bad_invites_are_refused(changes: dict) -> None:
    data = {"name": "Grace Okello", "email": "grace@gmail.com", "scopes": []} | changes
    with pytest.raises(ValidationError):
        UserInvite(**data)


def test_update_only_changes_what_is_sent() -> None:
    assert UserUpdate.model_validate({"active": False}).model_fields_set == {"active"}
    assert UserUpdate.model_validate({}).model_fields_set == set()


def test_new_passwords_need_twelve_characters() -> None:
    assert SetPasswordIn(token="t" * 30, password="correct horse battery").password
    with pytest.raises(ValidationError):
        SetPasswordIn(token="t" * 30, password="short")
    with pytest.raises(ValidationError):
        SetPasswordIn(token="short", password="correct horse battery")
