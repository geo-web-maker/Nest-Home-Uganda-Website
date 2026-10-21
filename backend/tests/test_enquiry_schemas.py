import pytest
from pydantic import ValidationError

from app.modules.clicks.schemas import ClickIn
from app.modules.enquiries.schemas import EnquiryCreate, EnquiryUpdate

SID = "0" * 24


def valid(**kw) -> dict:
    return {
        "name": "  Mary Atim ", "phone": "0787 499 988", "relationship": "parent",
        "service_ids": [SID], "area": "Ntinda", "consent": True, **kw,
    }  # fmt: skip


def errors(**kw) -> set[str]:
    with pytest.raises(ValidationError) as exc:
        EnquiryCreate(**valid(**kw))
    return {str(e["loc"][0]) for e in exc.value.errors()}


def test_valid_enquiry_is_trimmed() -> None:
    body = EnquiryCreate(**valid(note="  Needs help\x00 at home \x07"))
    assert body.name == "Mary Atim" and body.note == "Needs help at home"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", "A"),
        ("name", "x" * 81),
        ("name", "Visit www.cheap-pills.com"),
        ("name", "http://spam.example"),
        ("phone", "12345"),
        ("phone", "+254787499988"),
        ("service_ids", []),
        ("service_ids", ["not-an-id"]),
        ("area", "x"),
        ("note", "x" * 501),
        ("relationship", "neighbour"),
        ("preferred_start", "yesterday"),
        ("consent", False),
    ],
)
def test_bad_input_is_rejected(field: str, value: object) -> None:
    assert field in errors(**{field: value})


def test_missing_consent_is_rejected() -> None:
    data = valid()
    del data["consent"]
    with pytest.raises(ValidationError):
        EnquiryCreate(**data)


def test_duplicate_services_collapse() -> None:
    assert EnquiryCreate(**valid(service_ids=[SID, SID])).service_ids == [SID]


def test_update_distinguishes_unassign_from_unset() -> None:
    assert "assigned_to" not in EnquiryUpdate(status="contacted").model_fields_set
    assert "assigned_to" in EnquiryUpdate(assigned_to=None).model_fields_set


def test_click_rules() -> None:
    assert ClickIn(channel="call", page="/contact").page == "/contact"
    for bad in (
        {"channel": "email"},
        {"channel": "call", "page": "no-slash"},
        {"channel": "call", "page": "/a b"},
    ):
        with pytest.raises(ValidationError):
            ClickIn(**bad)
