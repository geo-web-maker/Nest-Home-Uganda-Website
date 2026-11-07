"""Audit log and content versions. Other modules call only these functions."""

from typing import Any
from contextvars import ContextVar

from beanie import PydanticObjectId

from app.core.deps import Principal
from app.modules.audit.models import AuditLog, ContentVersion

KEEP_VERSIONS = 10
_current_request_id: ContextVar[str | None] = ContextVar("nest_audit_request_id", default=None)

def set_request_id(value: str | None):
    return _current_request_id.set(value)

def reset_request_id(token) -> None:
    _current_request_id.reset(token)

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
        request_id=_current_request_id.get(),
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


async def record_system_event(
    *, action: str, message: str, severity: str = "error", source: str = "system",
    request_id: str | None = None, endpoint: str | None = None, http_status: int | None = None,
    user_id: str | None = None, outcome: str = "failure", details: dict[str, Any] | None = None,
    event_type: str | None = None,
) -> None:
    """Persist a sanitised system event. Never pass credentials, clinical payloads or file bytes."""
    await AuditLog(
        user_id=_oid(user_id) if user_id else None, action=action, item_type="system_event",
        item_label=action.replace(".", " ").replace("_", " ").title(),
        event_type=event_type or ("error" if severity in {"error", "critical"} else "system"),
        severity=severity, source=source, outcome=outcome, message=message[:1000],
        request_id=(request_id or _current_request_id.get())[:100] if (request_id or _current_request_id.get()) else None,
        endpoint=endpoint[:300] if endpoint else None, http_status=http_status,
        after=details or None,
    ).insert()
