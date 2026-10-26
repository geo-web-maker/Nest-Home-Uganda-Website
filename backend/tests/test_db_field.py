from datetime import UTC, datetime

import pytest
from pymongo.errors import DuplicateKeyError

from app.modules.visits.models import VisitEvent


async def test_event_client_operation_id_is_unique(mongo):
    event = VisitEvent(
        id="event-00000001",
        client_op_id="op-00000001",
        visit_id="visit-00001",
        nurse_id="nurse-0001",
        type="check_in",
        device_time=datetime.now(UTC),
        sent_at_device=datetime.now(UTC),
    )
    await event.insert()
    duplicate = VisitEvent(
        id="event-00000002",
        client_op_id="op-00000001",
        visit_id="visit-00001",
        nurse_id="nurse-0001",
        type="check_in",
        device_time=datetime.now(UTC),
        sent_at_device=datetime.now(UTC),
    )
    with pytest.raises(DuplicateKeyError):
        await duplicate.insert()
