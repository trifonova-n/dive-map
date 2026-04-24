from pydantic import BaseModel


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
