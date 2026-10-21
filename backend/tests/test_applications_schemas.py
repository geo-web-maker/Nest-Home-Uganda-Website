"""Application request schemas. No database."""

import pytest
from pydantic import ValidationError

from app.modules.applications.schemas import ApplicationCreate, ApplicationUpdate, NoteIn


def valid(**changes) -> dict:
    data = {
        "job_id": "",
        "name": "Mary Atim",
        "phone": "0787 499 988",
        "email": "mary.atim@gmail.com",
        "qualification": "Diploma in Nursing",
        "experience_years": 4,
        "area": "Ntinda",
        "availability": "From 1 December",
        "consent": True,
    }
    data.update(changes)
    return data


def test_a_valid_application_is_accepted_and_text_is_cleaned() -> None:
    item = ApplicationCreate(**valid(name="  Mary Atim\x00 ", cover_note=" hello "))
    assert item.name == "Mary Atim"
    assert item.cover_note == "hello"
    assert item.job_id is None  # an empty role means general interest
    assert item.website == ""


@pytest.mark.parametrize(
    "changes",
    [
        {"phone": "123"},
        {"email": "not-an-email"},
        {"consent": False},
        {"name": "A"},
        {"name": "Visit www.spam.com"},
        {"experience_years": -1},
        {"experience_years": 51},
        {"job_id": "not-an-id"},
        {"area": ""},
        {"cover_note": "x" * 1001},
        {"availability": "x" * 301},
    ],
)
def test_bad_values_are_refused(changes: dict) -> None:
    with pytest.raises(ValidationError):
        ApplicationCreate(**valid(**changes))


def test_a_job_id_that_looks_like_an_object_id_is_kept() -> None:
    assert ApplicationCreate(**valid(job_id="0" * 24)).job_id == "0" * 24


def test_update_rating_is_one_to_five_and_null_clears_it() -> None:
    assert ApplicationUpdate(rating=5).rating == 5
    assert ApplicationUpdate.model_validate({"rating": None}).model_fields_set == {"rating"}
    for bad in (0, 6):
        with pytest.raises(ValidationError):
            ApplicationUpdate(rating=bad)


def test_update_refuses_an_unknown_stage_and_notes_need_text() -> None:
    with pytest.raises(ValidationError):
        ApplicationUpdate(stage="maybe")  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        NoteIn(text="   ")
