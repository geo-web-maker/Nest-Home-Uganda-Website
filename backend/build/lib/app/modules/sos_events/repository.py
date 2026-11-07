from app.modules.care_ops.models import SOSEvent


async def append_event(event: SOSEvent) -> SOSEvent:
    await event.insert()
    return event


async def list_events(case_id: str) -> list[SOSEvent]:
    return await SOSEvent.find(SOSEvent.case_id == case_id).sort("created_at").to_list()
