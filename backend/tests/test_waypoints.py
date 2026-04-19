import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import TestSession


async def _seed_site():
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO dive_sites (id, name, latitude, longitude, mag_declination, crs_proj4, z_scale)
            VALUES (1, 'Point Lobos', 36.55, -121.94, -12.0,
                    '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs', 2.0)
        """))
        await session.commit()


async def _create_plan(client: AsyncClient) -> int:
    res = await client.post("/api/plans/", json={"site_id": 1, "name": "WP test"})
    return res.json()["id"]


async def test_add_waypoint(authed_client: AsyncClient):
    await _seed_site()
    plan_id = await _create_plan(authed_client)

    res = await authed_client.post(
        f"/api/plans/{plan_id}/waypoints/",
        json={"seq": 1, "latitude": 36.515, "longitude": -121.94, "depth_m": 12.5},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["seq"] == 1
    assert data["latitude"] == 36.515
    assert data["depth_m"] == 12.5


async def test_list_waypoints(authed_client: AsyncClient):
    await _seed_site()
    plan_id = await _create_plan(authed_client)

    await authed_client.post(
        f"/api/plans/{plan_id}/waypoints/",
        json={"seq": 1, "latitude": 36.515, "longitude": -121.94, "depth_m": 10},
    )
    await authed_client.post(
        f"/api/plans/{plan_id}/waypoints/",
        json={"seq": 2, "latitude": 36.516, "longitude": -121.939, "depth_m": 14},
    )

    res = await authed_client.get(f"/api/plans/{plan_id}/waypoints/")
    assert res.status_code == 200
    wps = res.json()
    assert len(wps) == 2
    assert wps[0]["seq"] == 1
    assert wps[1]["seq"] == 2


async def test_bulk_save_waypoints(authed_client: AsyncClient):
    await _seed_site()
    plan_id = await _create_plan(authed_client)

    # Add initial waypoints
    await authed_client.post(
        f"/api/plans/{plan_id}/waypoints/",
        json={"seq": 1, "latitude": 0, "longitude": 0, "depth_m": 0},
    )

    # Bulk replace
    res = await authed_client.put(
        f"/api/plans/{plan_id}/waypoints/",
        json={
            "waypoints": [
                {"seq": 1, "latitude": 36.515, "longitude": -121.94, "depth_m": 10},
                {"seq": 2, "latitude": 36.516, "longitude": -121.939, "depth_m": 14},
                {"seq": 3, "latitude": 36.517, "longitude": -121.938, "depth_m": 18},
            ]
        },
    )
    assert res.status_code == 200
    wps = res.json()
    assert len(wps) == 3
    assert wps[0]["latitude"] == 36.515
    assert wps[2]["seq"] == 3


async def test_bulk_save_replaces_existing(authed_client: AsyncClient):
    await _seed_site()
    plan_id = await _create_plan(authed_client)

    # First save: 2 waypoints
    await authed_client.put(
        f"/api/plans/{plan_id}/waypoints/",
        json={"waypoints": [
            {"seq": 1, "latitude": 1, "longitude": 1, "depth_m": 1},
            {"seq": 2, "latitude": 2, "longitude": 2, "depth_m": 2},
        ]},
    )

    # Second save: 1 waypoint — should replace, not append
    await authed_client.put(
        f"/api/plans/{plan_id}/waypoints/",
        json={"waypoints": [
            {"seq": 1, "latitude": 99, "longitude": 99, "depth_m": 99},
        ]},
    )

    res = await authed_client.get(f"/api/plans/{plan_id}/waypoints/")
    wps = res.json()
    assert len(wps) == 1
    assert wps[0]["latitude"] == 99


async def test_waypoints_require_plan_ownership(client: AsyncClient, authed_client: AsyncClient):
    await _seed_site()
    plan_id = await _create_plan(authed_client)

    # Register a different user
    res = await client.post(
        "/auth/register",
        json={"email": "other@example.com", "password": "pass"},
    )
    other_token = res.json()["access_token"]

    # Other user should not see the plan's waypoints
    res = await client.get(
        f"/api/plans/{plan_id}/waypoints/",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert res.status_code == 404
