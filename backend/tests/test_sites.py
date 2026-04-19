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


async def test_get_site_config(client: AsyncClient):
    await _seed_site()
    res = await client.get("/api/sites/1/config")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Point Lobos"
    assert data["mag_declination"] == -12.0
    assert data["z_scale"] == 2.0


async def test_list_sites(client: AsyncClient):
    await _seed_site()
    res = await client.get("/api/sites/")
    assert res.status_code == 200
    assert len(res.json()) == 1


async def test_site_not_found(client: AsyncClient):
    res = await client.get("/api/sites/9999/config")
    assert res.status_code == 404


async def test_health(client: AsyncClient):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
