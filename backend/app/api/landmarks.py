from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import DiveSite, Landmark
from ..schemas.landmark import LandmarkResponse

router = APIRouter(prefix="/api/sites", tags=["landmarks"])


@router.get(
    "/{site_id}/landmarks",
    response_model=list[LandmarkResponse],
)
async def list_site_landmarks(
    site_id: int, db: AsyncSession = Depends(get_db)
):
    site = await db.get(DiveSite, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    result = await db.execute(
        select(Landmark)
        .where(Landmark.site_id == site_id)
        .where(Landmark.user_id.is_(None))
        .order_by(Landmark.id)
    )
    return result.scalars().all()
