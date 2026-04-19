from datetime import datetime

from pydantic import BaseModel

from .waypoint import WaypointResponse


class DivePlanCreate(BaseModel):
    site_id: int
    name: str


class DivePlanResponse(BaseModel):
    id: int
    user_id: int
    site_id: int
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DivePlanDetailResponse(DivePlanResponse):
    waypoints: list[WaypointResponse] = []
