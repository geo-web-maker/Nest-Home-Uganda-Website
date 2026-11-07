"""POST /public/clicks: counted for the dashboard sources chart, creates no enquiry (spec 6.2)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response

from app.core.rate_limit import rate_limit
from app.modules.clicks.models import ClickStat
from app.modules.clicks.schemas import ClickIn

public_router = APIRouter(prefix="/public/clicks", tags=["public-clicks"])


@public_router.post("", status_code=204, dependencies=[Depends(rate_limit("clicks", 120, 60))])
async def record_click(body: ClickIn) -> Response:
    day = datetime.now(UTC).strftime("%Y-%m-%d")
    await ClickStat.get_pymongo_collection().update_one(
        {"date": day, "channel": body.channel, "page": body.page},
        {"$inc": {"count": 1}},
        upsert=True,
    )
    return Response(status_code=204)
