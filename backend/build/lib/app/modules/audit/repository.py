from app.modules.audit.models import AuditLog


async def append_audit(entry: AuditLog) -> AuditLog:
    await entry.insert()
    return entry


async def list_audit(item_type: str, item_id: str) -> list[AuditLog]:
    return (
        await AuditLog.find(AuditLog.item_type == item_type, AuditLog.item_id == item_id)
        .sort("-at")
        .to_list()
    )
