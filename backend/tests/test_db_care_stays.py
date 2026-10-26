from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.db import get_care_database
from app.core.deps import Principal, ReachContext
from app.modules.care_admin.router import StayIn, move_client
from app.modules.care_clients.models import CareClient
from app.modules.places.models import CarePlace, PlaceStay


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


async def test_move_client_closes_previous_stay_and_creates_new_stay_atomically(mongo):
    client_id = uid("client")
    old_place_id = uid("place")
    new_place_id = uid("place")
    supervisor_id = uid("supervisor")
    await CareClient(
        id=client_id, display_name="Stay test client", supervisor_id=supervisor_id
    ).insert()
    await CarePlace(
        id=old_place_id, client_id=client_id, address_text="Old place", lat=0, lng=0
    ).insert()
    await CarePlace(
        id=new_place_id, client_id=client_id, address_text="New place", lat=1, lng=1
    ).insert()
    old_stay = PlaceStay(
        id=uid("stay"), client_id=client_id, place_id=old_place_id, starts_on="2024-01-01"
    )
    await old_stay.insert()
    starts_on = date.today()
    context = ReachContext(user_id=supervisor_id, reach="all", is_superadmin=True)
    principal = Principal(user_id=supervisor_id, scopes=frozenset(), is_superadmin=True)

    created = await move_client(
        client_id,
        StayIn(id=uid("stay"), place_id=new_place_id, starts_on=starts_on),
        context,
        principal,
    )

    saved_old = await get_care_database()["place_stays"].find_one({"_id": old_stay.id})
    assert saved_old["ends_on"] == (starts_on - timedelta(days=1)).isoformat()
    assert created.place_id == new_place_id
    assert created.starts_on == starts_on.isoformat()
    assert (
        await get_care_database()["place_stays"].count_documents(
            {"client_id": client_id, "ends_on": None}
        )
        == 1
    )


async def test_move_client_rejects_place_owned_by_another_client(mongo):
    client_id = uid("client")
    other_client_id = uid("client")
    place_id = uid("place")
    supervisor_id = uid("supervisor")
    await CareClient(id=client_id, display_name="Client one").insert()
    await CareClient(id=other_client_id, display_name="Client two").insert()
    await CarePlace(
        id=place_id, client_id=other_client_id, address_text="Wrong place", lat=0, lng=0
    ).insert()
    context = ReachContext(user_id=supervisor_id, reach="all", is_superadmin=True)
    principal = Principal(user_id=supervisor_id, scopes=frozenset(), is_superadmin=True)

    with pytest.raises(HTTPException) as error:
        await move_client(
            client_id,
            StayIn(id=uid("stay"), place_id=place_id, starts_on=date.today()),
            context,
            principal,
        )
    assert error.value.status_code == 422
    assert await get_care_database()["place_stays"].count_documents({"client_id": client_id}) == 0
