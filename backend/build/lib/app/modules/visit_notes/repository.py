from app.modules.visits.models import VisitNote


async def append_note(note: VisitNote) -> VisitNote:
    await note.insert()
    return note


async def notes_for_visit(visit_id: str) -> list[VisitNote]:
    return await VisitNote.find(VisitNote.visit_id == visit_id).sort("created_at").to_list()
