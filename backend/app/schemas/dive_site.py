from pydantic import BaseModel


class SiteConfigResponse(BaseModel):
    id: int
    name: str
    latitude: float
    longitude: float
    mag_declination: float
    crs_proj4: str
    z_scale: float
    base_extent: dict | None = None
    scene_path: str

    model_config = {"from_attributes": True}
