"""Track C indexes for release policy, sync idempotency and durable push delivery."""

from pymongo import ASCENDING, DESCENDING


async def up(db):
    await db["app_releases"].create_index(
        [("platform", ASCENDING), ("active", ASCENDING), ("published_at", DESCENDING)],
        name="ix_app_releases_platform_active_published",
    )
    await db["app_releases"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_app_releases_id"
    )
    await db["field_sync_push_receipts"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_field_sync_push_receipts_id"
    )
    await db["field_sync_push_receipts"].create_index(
        [("user_id", ASCENDING), ("client_op_id", ASCENDING)],
        unique=True,
        name="uq_field_sync_receipt_user_op",
    )
    await db["push_deliveries"].create_index(
        [("id", ASCENDING)], unique=True, name="uq_push_deliveries_id"
    )
    await db["push_deliveries"].create_index(
        [("status", ASCENDING), ("next_attempt_at", ASCENDING)],
        name="ix_push_deliveries_pending_retry",
    )
    await db["push_deliveries"].create_index(
        [("notification_id", ASCENDING), ("device_id", ASCENDING)],
        unique=True,
        name="uq_push_delivery_notification_device",
    )


async def down(db):
    for collection, index in (
        ("app_releases", "ix_app_releases_platform_active_published"),
        ("app_releases", "uq_app_releases_id"),
        ("field_sync_push_receipts", "uq_field_sync_push_receipts_id"),
        ("field_sync_push_receipts", "uq_field_sync_receipt_user_op"),
        ("push_deliveries", "uq_push_deliveries_id"),
        ("push_deliveries", "ix_push_deliveries_pending_retry"),
        ("push_deliveries", "uq_push_delivery_notification_device"),
    ):
        try:
            await db[collection].drop_index(index)
        except Exception:  # noqa: S110 (index may not exist)
            pass  # noqa: S110 (index may not exist)
