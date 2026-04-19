from datetime import datetime

from sqlalchemy import String, Float, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class DiveSite(Base):
    __tablename__ = "dive_sites"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    mag_declination: Mapped[float] = mapped_column(Float, default=-12.0)
    crs_proj4: Mapped[str] = mapped_column(
        String(500),
        default="+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs",
    )
    z_scale: Mapped[float] = mapped_column(Float, default=2.0)
    base_extent: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    dive_plans: Mapped[list["DivePlan"]] = relationship(  # noqa: F821
        back_populates="site"
    )
