from datetime import datetime

from sqlalchemy import String, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class DivePlan(Base):
    __tablename__ = "dive_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    site_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("dive_sites.id")
    )
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="dive_plans")  # noqa: F821
    site: Mapped["DiveSite"] = relationship(back_populates="dive_plans")  # noqa: F821
    waypoints: Mapped[list["Waypoint"]] = relationship(  # noqa: F821
        back_populates="plan", cascade="all, delete-orphan",
        order_by="Waypoint.seq",
    )
