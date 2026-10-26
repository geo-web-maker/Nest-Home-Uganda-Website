from datetime import UTC, datetime, timedelta

from app.core.deps import Principal
from app.modules.care_clients.models import CareClient
from app.modules.field_ops.router import sync_pull
from app.modules.visits.models import Visit, VisitSyncTombstone


async def test_sync_pull_pages_visits_and_removals_without_duplicates(mongo):
    now = datetime.now(UTC)
    nurse_id = "nurse-sync-pull-0001"
    await CareClient(id="client-sync-pull-0001", display_name="Assigned client").insert()
    for index, changed_at in enumerate(
        (now - timedelta(seconds=3), now - timedelta(seconds=2)), start=1
    ):
        await Visit(
            id=f"visit-sync-pull-{index:04d}",
            client_id="client-sync-pull-0001",
            nurse_id=nurse_id,
            place_id="place-sync-pull-0001",
            scheduled_start=now + timedelta(days=1),
            scheduled_end=now + timedelta(days=1, hours=1),
            status="scheduled",
            safety_timer_until=(now + timedelta(days=1, hours=2) if index == 1 else None),
            safety_state=("armed" if index == 1 else "off"),
            updated_at=changed_at,
        ).insert()
    await VisitSyncTombstone(
        id="tombstone-sync-pull-0001",
        nurse_id=nurse_id,
        visit_id="visit-removed-sync-0001",
        reason="reassigned",
        updated_at=now - timedelta(seconds=1),
    ).insert()

    principal = Principal(user_id=nurse_id, scopes=frozenset({"field:use"}), is_superadmin=False)
    cursor = None
    visit_ids = []
    removed_ids = []
    pages = 0
    while True:
        page = await sync_pull(principal=principal, cursor=cursor, limit=1)
        visit_ids.extend(item["id"] for item in page["items"])
        removed_ids.extend(page["removed_visit_ids"])
        pages += 1
        if not page["has_more"]:
            cursor = page["cursor"]
            break
        cursor = page["cursor"]
        assert cursor
        assert pages < 10

    assert visit_ids == ["visit-sync-pull-0001", "visit-sync-pull-0002"]
    # The nurse app needs the authoritative deadline to show the foreground safety prompt.
    timer_page = await sync_pull(principal=principal, cursor=None, limit=10)
    timer_visit = next(item for item in timer_page["items"] if item["id"] == "visit-sync-pull-0001")
    assert timer_visit["safety_state"] == "armed"
    assert timer_visit["safety_timer_until"] is not None
    assert removed_ids == ["visit-removed-sync-0001"]
    assert pages == 3
    repeated = await sync_pull(principal=principal, cursor=cursor, limit=1)
    assert repeated["items"] == []
    assert repeated["removed_visit_ids"] == []
    assert repeated["has_more"] is False
    assert repeated["cursor"] == cursor
