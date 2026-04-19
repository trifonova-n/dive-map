from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import DiveSite
from ..schemas.dive_site import SiteConfigResponse

router = APIRouter(prefix="/api/sites", tags=["sites"])


@router.get("/", response_model=list[SiteConfigResponse])
async def list_sites(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DiveSite))
    return result.scalars().all()


@router.get("/{site_id}/config", response_model=SiteConfigResponse)
async def get_site_config(site_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DiveSite).where(DiveSite.id == site_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site
