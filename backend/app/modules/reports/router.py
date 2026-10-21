from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.reports.schemas import ReportsSummary
from app.modules.reports.service import export_report, summary

router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])
CanRead = Annotated[Principal, Depends(require_scopes("reports:read"))]
CanExport = Annotated[Principal, Depends(require_scopes("reports:export"))]


@router.get("/summary", response_model=ReportsSummary)
async def report_summary(_: CanRead) -> ReportsSummary:
    return await summary()


@router.get("/export")
async def report_export(
    principal: CanExport,
    request: Request,
    type: Literal["enquiries", "applications", "activity"],
    format: Literal["csv", "xlsx"] = "csv",
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> Response:
    content, media_type, filename = await export_report(
        principal, type, start, end, format, hash_ip(client_ip(request))
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
