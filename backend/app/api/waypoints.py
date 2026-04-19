from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models.user import User
from ..models.dive_plan import DivePlan
from ..models.waypoint import Waypoint
from ..schemas.waypoint import WaypointCreate, WaypointResponse, WaypointBulkSave

router = APIRouter(prefix="/api/plans/{plan_id}/waypoints", tags=["waypoints"])


async def _get_user_plan(
    plan_id: int, user: User, db: AsyncSession
) -> DivePlan:
    result = await db.execute(
        select(DivePlan).where(DivePlan.id == plan_id, DivePlan.user_id == user.id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.get("/", response_model=list[WaypointResponse])
async def list_waypoints(
    plan_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_plan(plan_id, user, db)
    result = await db.execute(
        select(Waypoint).where(Waypoint.plan_id == plan_id).order_by(Waypoint.seq)
    )
    return result.scalars().all()


@router.post("/", response_model=WaypointResponse, status_code=201)
async def add_waypoint(
    plan_id: int,
    body: WaypointCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_plan(plan_id, user, db)
    wp = Waypoint(plan_id=plan_id, **body.model_dump())
    db.add(wp)
    await db.commit()
    await db.refresh(wp)
    return wp


@router.put("/", response_model=list[WaypointResponse])
async def save_all_waypoints(
    plan_id: int,
    body: WaypointBulkSave,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace all waypoints for a plan (bulk save)."""
    await _get_user_plan(plan_id, user, db)

    # Delete existing waypoints
    await db.execute(delete(Waypoint).where(Waypoint.plan_id == plan_id))

    # Insert new ones
    waypoints = [
        Waypoint(plan_id=plan_id, **wp.model_dump()) for wp in body.waypoints
    ]
    db.add_all(waypoints)
    await db.commit()

    # Re-fetch to get IDs
    result = await db.execute(
        select(Waypoint).where(Waypoint.plan_id == plan_id).order_by(Waypoint.seq)
    )
    return result.scalars().all()
