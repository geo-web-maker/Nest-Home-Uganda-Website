"""Seed the deterministic Track E nurse/admin end-to-end fixture.

Run by CI only (`.github/workflows/e2e-real-backend.yml`), after `python -m app.migrate`:

    cd backend && python scripts/seed_e2e.py

It connects with the same settings as the app (MONGODB_URI, CARE_MONGODB_*), creates one superadmin,
one supervisor, one nurse, one client assigned to that nurse, one place with an open stay, and one
visit that is scheduled for today (Kampala) and is inside the check-in window. Safe to run twice.
"""

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core import db
from app.core.config import get_settings
from app.core.security import hash_password
from app.modules.auth.models import User
from app.modules.auth.scopes import SCOPE_PRESETS
from app.modules.care_clients.models import CareClient
from app.modules.nurses.models import NurseProfile
from app.modules.places.models import CarePlace, PlaceStay
from app.modules.visits.models import Visit
from app.modules.visits.rules import make_snapshot
from app.registry import CARE_DOCUMENT_MODELS, DOCUMENT_MODELS
from app.seed import seed_first_superadmin

KAMPALA = ZoneInfo("Africa/Kampala")

ADMIN_EMAIL = os.getenv("E2E_SUPERADMIN_EMAIL", "e2e-admin@example.test")
NURSE_EMAIL = os.getenv("E2E_NURSE_EMAIL", "nurse-e2e@example.test")
SUPERVISOR_EMAIL = os.getenv("E2E_SUPERVISOR_EMAIL", "supervisor-e2e@example.test")
PASSWORD = os.getenv("E2E_PASSWORD", "E2E-Only-Password-Change-Me!")

CLIENT_ID = "client-e2e-001"
PLACE_ID = "place-e2e-001"
STAY_ID = "stay-e2e-001"
VISIT_ID = "visit-e2e-001"
# Must match the geolocation that nurse/e2e/real-backend.spec.ts gives the browser.
PLACE_LAT = 0.3476
PLACE_LNG = 32.5825


async def _user(email: str, name: str, *, kind: str, scopes: list[str], reach: str) -> User:
    row = await User.find_one(User.email == email)
    if row is None:
        row = User(
            name=name,
            email=email,
            password_hash=hash_password(PASSWORD),
            scopes=scopes,
            kind=kind,
            reach=reach,
            is_active=True,
        )
        await row.insert()
    return row


def _visit_window(now: datetime) -> tuple[datetime, datetime]:
    """Start 10 minutes ago, but not before today's Kampala midnight (Today is per day)."""
    midnight = now.astimezone(KAMPALA).replace(hour=0, minute=0, second=0, microsecond=0)
    start = max(now - timedelta(minutes=10), midnight.astimezone(UTC))
    return start, start + timedelta(hours=1)


async def seed() -> None:
    settings = get_settings()
    if not settings.mongodb_uri:
        raise SystemExit("MONGODB_URI is empty.")
    await db.connect(
        settings.mongodb_uri,
        settings.mongodb_db,
        DOCUMENT_MODELS,
        care_uri=settings.care_mongodb_uri or settings.mongodb_uri,
        care_db_name=settings.care_mongodb_db,
        care_models=CARE_DOCUMENT_MODELS,
    )
    try:
        await seed_first_superadmin(ADMIN_EMAIL, PASSWORD)
        supervisor = await _user(
            SUPERVISOR_EMAIL,
            "E2E Supervisor",
            kind="staff",
            scopes=sorted(SCOPE_PRESETS["supervisor"]),
            reach="team",
        )
        nurse = await _user(
            NURSE_EMAIL,
            "E2E Nurse",
            kind="nurse",
            scopes=sorted(SCOPE_PRESETS["nurse"]),
            reach="own",
        )
        nurse_id, supervisor_id = str(nurse.id), str(supervisor.id)

        if await NurseProfile.find_one(NurseProfile.user_id == nurse_id) is None:
            await NurseProfile(
                user_id=nurse_id, staff_number="E2E-001", supervisor_id=supervisor_id, active=True
            ).insert()

        if await CareClient.find_one(CareClient.id == CLIENT_ID) is None:
            await CareClient(
                id=CLIENT_ID,
                display_name="E2E Client",
                supervisor_id=supervisor_id,
                assigned_nurse_ids=[nurse_id],
                photo_allowed=False,
            ).insert()

        place = await CarePlace.find_one(CarePlace.id == PLACE_ID)
        if place is None:
            place = CarePlace(
                id=PLACE_ID,
                client_id=CLIENT_ID,
                label="Home",
                address_text="E2E Home, Kampala",
                lat=PLACE_LAT,
                lng=PLACE_LNG,
                radius_m=150,
                is_primary=True,
            )
            await place.insert()
        if await PlaceStay.find_one(PlaceStay.id == STAY_ID) is None:
            today = datetime.now(KAMPALA).date().isoformat()
            await PlaceStay(
                id=STAY_ID, client_id=CLIENT_ID, place_id=PLACE_ID, starts_on=today
            ).insert()

        start, end = _visit_window(datetime.now(UTC))
        visit = await Visit.find_one(Visit.id == VISIT_ID)
        fields = dict(
            client_id=CLIENT_ID,
            nurse_id=nurse_id,
            supervisor_id=supervisor_id,
            place_id=PLACE_ID,
            scheduled_start=start,
            scheduled_end=end,
            status="scheduled",
            instructions="E2E visit",
            place_snapshot=make_snapshot(place.model_dump()),
            check_in_at=None,
            check_out_at=None,
        )
        if visit is None:
            await Visit(id=VISIT_ID, **fields).insert()
        else:  # a rerun resets the visit so the browser test can check in again
            for key, value in fields.items():
                setattr(visit, key, value)
            await visit.save()
        print("e2e fixture ready:", NURSE_EMAIL, VISIT_ID)  # noqa: T201
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(seed())
