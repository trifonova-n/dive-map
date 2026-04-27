from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, get_optional_user
from ..database import get_db
from ..models import DiveSite, Landmark, User
from ..schemas.landmark import LandmarkCreate, LandmarkResponse, LandmarkUpdate

router = APIRouter(prefix="/api/sites", tags=["landmarks"])
flat_router = APIRouter(prefix="/api/landmarks", tags=["landmarks"])


@router.get(
    "/{site_id}/landmarks",
    response_model=list[LandmarkResponse],
)
async def list_site_landmarks(
    site_id: int,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    site = await db.get(DiveSite, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    stmt = select(Landmark).where(Landmark.site_id == site_id)
    if user is None:
        stmt = stmt.where(Landmark.user_id.is_(None))
    else:
        stmt = stmt.where(
            or_(Landmark.user_id.is_(None), Landmark.user_id == user.id)
        )
    stmt = stmt.order_by(Landmark.id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/{site_id}/landmarks",
    response_model=LandmarkResponse,
    status_code=201,
)
async def create_landmark(
    site_id: int,
    body: LandmarkCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site = await db.get(DiveSite, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    landmark = Landmark(
        site_id=site_id,
        user_id=user.id,
        **body.model_dump(),
    )
    db.add(landmark)
    await db.commit()
    await db.refresh(landmark)
    return landmark


@flat_router.patch("/{landmark_id}", response_model=LandmarkResponse)
async def update_landmark(
    landmark_id: int,
    body: LandmarkUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    landmark = await db.get(Landmark, landmark_id)
    if not landmark:
        raise HTTPException(status_code=404, detail="Landmark not found")
    is_owner = landmark.user_id == user.id
    is_admin_editing_public = user.is_admin and landmark.user_id is None
    if not (is_owner or is_admin_editing_public):
        raise HTTPException(status_code=404, detail="Landmark not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(landmark, field, value)
    await db.commit()
    await db.refresh(landmark)
    return landmark


@flat_router.delete("/{landmark_id}", status_code=204)
async def delete_landmark(
    landmark_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    landmark = await db.get(Landmark, landmark_id)
    if not landmark or landmark.user_id != user.id:
        raise HTTPException(status_code=404, detail="Landmark not found")
    await db.delete(landmark)
    await db.commit()
