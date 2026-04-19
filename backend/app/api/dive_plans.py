from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..database import get_db
from ..models.user import User
from ..models.dive_plan import DivePlan
from ..schemas.dive_plan import DivePlanCreate, DivePlanResponse, DivePlanDetailResponse

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.get("/", response_model=list[DivePlanResponse])
async def list_plans(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DivePlan).where(DivePlan.user_id == user.id).order_by(DivePlan.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=DivePlanResponse, status_code=201)
async def create_plan(
    body: DivePlanCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan = DivePlan(user_id=user.id, site_id=body.site_id, name=body.name)
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("/{plan_id}", response_model=DivePlanDetailResponse)
async def get_plan(
    plan_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DivePlan)
        .options(selectinload(DivePlan.waypoints))
        .where(DivePlan.id == plan_id, DivePlan.user_id == user.id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DivePlan).where(DivePlan.id == plan_id, DivePlan.user_id == user.id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    await db.delete(plan)
    await db.commit()
