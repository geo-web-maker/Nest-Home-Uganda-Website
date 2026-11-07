from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import Principal, require_scopes
from app.modules.dashboard.schemas import DashboardOut
from app.modules.dashboard.service import get_dashboard

router = APIRouter(prefix="/admin/dashboard", tags=["admin-dashboard"])
CanRead = Annotated[Principal, Depends(require_scopes("dashboard:view"))]


@router.get("", response_model=DashboardOut)
async def dashboard(_: CanRead) -> DashboardOut:
    return await get_dashboard()
