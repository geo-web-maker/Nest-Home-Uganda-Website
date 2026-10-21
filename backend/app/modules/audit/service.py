"""Audit log and content versions. Other modules call only these functions."""

from typing import Any

from beanie import PydanticObjectId

from app.core.deps import Principal
from app.modules.audit.models import AuditLog, ContentVersion

KEEP_VERSIONS = 10


def _oid(value: str) -> PydanticObjectId | None:
    return PydanticObjectId(value) if PydanticObjectId.is_valid(value) else None


async def record(
    principal: Principal | None,
    action: str,
    item_type: str,
    item_id: str | None = None,
    item_label: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    ip_hash: str | None = None,
) -> None:
    await AuditLog(
        user_id=_oid(principal.user_id) if principal else None,
        action=action,
        scope=",".join(principal.authorised_by) if principal and principal.authorised_by else None,
        item_type=item_type,
        item_id=item_id,
        item_label=item_label,
        before=before,
        after=after,
        ip_hash=ip_hash,
    ).insert()


async def save_version(
    principal: Principal, item_type: str, item_id: str, data: dict[str, Any]
) -> None:
    """Store a snapshot of the item as it was before a change; keep the newest 10."""
    await ContentVersion(
        item_type=item_type, item_id=item_id, data=data, user_id=_oid(principal.user_id)
    ).insert()
    old = (
        await ContentVersion.find(
            ContentVersion.item_type == item_type, ContentVersion.item_id == item_id
        )
        .sort("-at")
        .skip(KEEP_VERSIONS)
        .to_list()
    )
    for version in old:
        await version.delete()
