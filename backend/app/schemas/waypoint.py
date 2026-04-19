from pydantic import BaseModel


class WaypointCreate(BaseModel):
    seq: int
    latitude: float
    longitude: float
    depth_m: float


class WaypointResponse(BaseModel):
    id: int
    plan_id: int
    seq: int
    latitude: float
    longitude: float
    depth_m: float

    model_config = {"from_attributes": True}


class WaypointBulkSave(BaseModel):
    waypoints: list[WaypointCreate]
