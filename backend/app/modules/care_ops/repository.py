from app.modules.care_ops.models import SOSEvent


async def append_sos_event(event: SOSEvent) -> SOSEvent:
    await event.insert()
    return event


async def events_for_case(case_id: str) -> list[SOSEvent]:
    return await SOSEvent.find(SOSEvent.case_id == case_id).sort("created_at").to_list()
