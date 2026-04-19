import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import TestSession


async def _seed_site():
    """Insert a dive site for FK references."""
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO dive_sites (id, name, latitude, longitude, mag_declination, crs_proj4, z_scale)
            VALUES (1, 'Point Lobos', 36.55, -121.94, -12.0,
                    '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs', 2.0)
        """))
        await session.commit()


async def test_create_plan(authed_client: AsyncClient):
    await _seed_site()
    res = await authed_client.post(
        "/api/plans/", json={"site_id": 1, "name": "Morning dive"}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Morning dive"
    assert data["site_id"] == 1


async def test_list_plans(authed_client: AsyncClient):
    await _seed_site()
    await authed_client.post("/api/plans/", json={"site_id": 1, "name": "Plan A"})
    await authed_client.post("/api/plans/", json={"site_id": 1, "name": "Plan B"})

    res = await authed_client.get("/api/plans/")
    assert res.status_code == 200
    plans = res.json()
    assert len(plans) == 2


async def test_get_plan_detail(authed_client: AsyncClient):
    await _seed_site()
    create_res = await authed_client.post(
        "/api/plans/", json={"site_id": 1, "name": "Detail test"}
    )
    plan_id = create_res.json()["id"]

    res = await authed_client.get(f"/api/plans/{plan_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Detail test"
    assert "waypoints" in data


async def test_delete_plan(authed_client: AsyncClient):
    await _seed_site()
    create_res = await authed_client.post(
        "/api/plans/", json={"site_id": 1, "name": "To delete"}
    )
    plan_id = create_res.json()["id"]

    res = await authed_client.delete(f"/api/plans/{plan_id}")
    assert res.status_code == 204

    res = await authed_client.get(f"/api/plans/{plan_id}")
    assert res.status_code == 404


async def test_plan_not_found(authed_client: AsyncClient):
    res = await authed_client.get("/api/plans/9999")
    assert res.status_code == 404


async def test_plans_require_auth(client: AsyncClient):
    res = await client.get("/api/plans/")
    assert res.status_code in (401, 403)
