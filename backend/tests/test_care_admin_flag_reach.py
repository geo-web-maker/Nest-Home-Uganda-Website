"""Authorization regression tests for flag writes through the admin API."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.deps import ReachContext
from app.modules.care_admin.router import ReasonIn, resolve_flag
from app.modules.flags.models import VisitFlag
from app.modules.visits.models import Visit


@pytest.mark.asyncio
async def test_flag_resolution_rechecks_linked_visit_reach(monkeypatch):
    flag = SimpleNamespace(id="flag-0001", visit_id="visit-0001", status="open")
    visit = Visit.model_construct(
        id="visit-0001", nurse_id="nurse-b", supervisor_id="supervisor-b"
    )

    async def find_flag(*args, **kwargs):
        return flag

    async def find_visit(*args, **kwargs):
        return visit

    # Beanie is not initialised here, so class-level field expressions (VisitFlag.id) do not
    # exist yet; give them placeholders. The stubbed find_one ignores its arguments.
    monkeypatch.setattr(VisitFlag, "id", "id", raising=False)
    monkeypatch.setattr(Visit, "id", "id", raising=False)
    monkeypatch.setattr(VisitFlag, "find_one", find_flag)
    monkeypatch.setattr(Visit, "find_one", find_visit)

    with pytest.raises(HTTPException) as error:
        await resolve_flag(
            "flag-0001",
            ReasonIn(reason="Reviewed the reported issue"),
            SimpleNamespace(user_id="nurse-a"),
            ReachContext(user_id="nurse-a", reach="own"),
        )

    assert error.value.status_code == 404
