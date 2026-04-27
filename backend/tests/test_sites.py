import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import TestSession


async def _seed_site():
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO dive_sites (id, name, latitude, longitude, mag_declination, crs_proj4, z_scale, scene_path)
            VALUES (1, 'Point Lobos', 36.55, -121.94, -12.0,
                    '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs', 2.0,
                    '/data/sites/point-lobos/scene.js')
        """))
        await session.commit()


async def test_get_site_config(client: AsyncClient):
    await _seed_site()
    res = await client.get("/api/sites/1/config")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Point Lobos"
    assert data["mag_declination"] == -12.0
    assert data["z_scale"] == 2.0
    assert data["scene_path"] == "/data/sites/point-lobos/scene.js"


async def test_list_sites(client: AsyncClient):
    await _seed_site()
    res = await client.get("/api/sites/")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["scene_path"] == "/data/sites/point-lobos/scene.js"


async def test_list_sites_multi(client: AsyncClient):
    await _seed_site()
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO dive_sites (id, name, latitude, longitude, mag_declination, crs_proj4, z_scale, scene_path)
            VALUES (2, 'Monastery', 36.52, -121.92, -12.0,
                    '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs', 2.0,
                    '/data/sites/monastery/scene.js')
        """))
        await session.commit()
    res = await client.get("/api/sites/")
    assert res.status_code == 200
    rows = res.json()
    paths = {r["id"]: r["scene_path"] for r in rows}
    assert paths == {1: "/data/sites/point-lobos/scene.js", 2: "/data/sites/monastery/scene.js"}


async def test_site_not_found(client: AsyncClient):
    res = await client.get("/api/sites/9999/config")
    assert res.status_code == 404


async def test_health(client: AsyncClient):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
