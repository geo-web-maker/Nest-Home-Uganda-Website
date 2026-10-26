import pytest
from pymongo.errors import DuplicateKeyError

from app.core import db
from app.modules.visits.models import Visit


async def test_unique_visit_id_index_exists(mongo):
    care = db.get_care_database()
    indexes = await care["visits"].index_information()
    assert indexes["uq_visits_id"]["unique"] is True
    row = Visit(
        id="visit-unique-001",
        client_id="client-0001",
        nurse_id="nurse-0001",
        place_id="place-0001",
        scheduled_start="2026-01-01T08:00:00Z",
        scheduled_end="2026-01-01T09:00:00Z",
    )
    await row.insert()
    duplicate = Visit(
        id="visit-unique-001",
        client_id="client-0002",
        nurse_id="nurse-0002",
        place_id="place-0002",
        scheduled_start="2026-01-01T10:00:00Z",
        scheduled_end="2026-01-01T11:00:00Z",
    )
    with pytest.raises(DuplicateKeyError):
        await duplicate.insert()


async def test_data_subject_note_purge_clears_free_text_without_removing_the_event(mongo):
    from datetime import UTC, datetime

    from app.modules.care_retention.retention import purge_notes_for_data_request
    from app.modules.visits.models import VisitNote

    note = VisitNote(
        id="note-data-request-001",
        client_op_id="note-op-data-request-001",
        visit_id="visit-data-request-001",
        nurse_id="nurse-data-request-001",
        body="Private free-text note",
        created_at_device=datetime.now(UTC),
    )
    await note.insert()
    changed = await purge_notes_for_data_request(["visit-data-request-001"])
    stored = await db.get_care_database()["visit_notes"].find_one({"id": note.id})
    assert changed == 1
    assert stored["body"] == ""
    assert stored["id"] == note.id
