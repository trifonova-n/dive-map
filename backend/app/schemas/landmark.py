from pydantic import BaseModel, Field


class LandmarkResponse(BaseModel):
    id: int
    site_id: int
    user_id: int | None
    name: str
    latitude: float
    longitude: float
    depth_m: float | None
    description: str | None
    image_url: str | None

    model_config = {"from_attributes": True}


class LandmarkCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    latitude: float
    longitude: float
    depth_m: float | None = None
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=500)


# Lat/lon/depth intentionally omitted: to move a landmark, delete and recreate.
class LandmarkUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=500)
