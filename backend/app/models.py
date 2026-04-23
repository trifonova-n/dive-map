from datetime import datetime

from sqlalchemy import String, Integer, Float, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    dive_plans: Mapped[list["DivePlan"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


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

    dive_plans: Mapped[list["DivePlan"]] = relationship(back_populates="site")


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

    user: Mapped["User"] = relationship(back_populates="dive_plans")
    site: Mapped["DiveSite"] = relationship(back_populates="dive_plans")
    waypoints: Mapped[list["Waypoint"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan",
        order_by="Waypoint.seq",
    )


class Waypoint(Base):
    __tablename__ = "waypoints"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("dive_plans.id", ondelete="CASCADE")
    )
    seq: Mapped[int] = mapped_column(Integer)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    depth_m: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    plan: Mapped["DivePlan"] = relationship(back_populates="waypoints")


class Landmark(Base):
    __tablename__ = "landmarks"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("dive_sites.id"), index=True
    )
    # NULL = global/curated landmark; non-NULL = user-owned.
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    depth_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
