from app.modules.visits.models import VisitEvent


async def append_event(event: VisitEvent) -> VisitEvent:
    await event.insert()
    return event


async def events_for_visit(visit_id: str) -> list[VisitEvent]:
    return await VisitEvent.find(VisitEvent.visit_id == visit_id).sort("received_at").to_list()
