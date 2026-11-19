import pytest

pytest.importorskip("pydantic")

from pydantic import ValidationError  # noqa: E402

from app.core.password_policy import weakness  # noqa: E402
from app.modules.users.schemas import SetPasswordIn  # noqa: E402


def test_length_is_the_only_hard_rule_for_ordinary_passwords():
    assert weakness("sunny-days-ahead") is None
    assert weakness("tulip2026") is None
    with pytest.raises(ValidationError):
        SetPasswordIn(token="t" * 24, password="short1")
    assert SetPasswordIn(token="t" * 24, password="tulip2026").password == "tulip2026"


@pytest.mark.parametrize("bad", ["password", "Password123", "aaaaaaaa", "12345678"])
def test_common_or_repetitive_passwords_are_refused(bad):
    with pytest.raises(ValidationError):
        SetPasswordIn(token="t" * 24, password=bad)
