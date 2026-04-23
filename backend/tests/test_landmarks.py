from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import TestSession


async def _seed_site_and_landmarks():
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO dive_sites (id, name, latitude, longitude, mag_declination, crs_proj4, z_scale)
            VALUES (1, 'Point Lobos', 36.55, -121.94, -12.0,
                    '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs', 2.0)
        """))
        await session.execute(text("""
            INSERT INTO landmarks (site_id, user_id, name, latitude, longitude, depth_m) VALUES
                (1, NULL, 'Whaler''s Cove',    36.52150, -121.93950, NULL),
                (1, NULL, 'Bluefish Cove',     36.52500, -121.94100, NULL),
                (1, NULL, 'Granite Point',     36.52700, -121.94250, NULL),
                (1, NULL, 'Sea Lion Point',    36.51850, -121.95100, NULL),
                (1, NULL, 'Hidden Beach',      36.52280, -121.94580, NULL),
                (1, NULL, 'Hole-in-the-Wall',  36.51950, -121.94650, NULL)
        """))
        await session.commit()


async def test_list_landmarks_returns_globals_for_point_lobos(client: AsyncClient):
    await _seed_site_and_landmarks()
    res = await client.get("/api/sites/1/landmarks")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 6
    for r in rows:
        assert r["user_id"] is None
        assert r["site_id"] == 1
        assert r["depth_m"] is None
    names = {r["name"] for r in rows}
    assert "Whaler's Cove" in names
    assert "Hole-in-the-Wall" in names


async def test_list_landmarks_excludes_user_owned(client: AsyncClient):
    await _seed_site_and_landmarks()
    # Insert a user + a user-owned landmark; it must NOT appear in v1 response.
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO users (id, email, hashed_password) VALUES (1, 'a@b.c', 'x')
        """))
        await session.execute(text("""
            INSERT INTO landmarks (site_id, user_id, name, latitude, longitude, depth_m)
            VALUES (1, 1, 'My Secret Spot', 36.5, -121.9, 10.0)
        """))
        await session.commit()

    res = await client.get("/api/sites/1/landmarks")
    assert res.status_code == 200
    names = {r["name"] for r in res.json()}
    assert "My Secret Spot" not in names
    assert len(res.json()) == 6


async def test_list_landmarks_site_not_found(client: AsyncClient):
    res = await client.get("/api/sites/9999/landmarks")
    assert res.status_code == 404


async def test_list_landmarks_empty_when_site_has_none(client: AsyncClient):
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO dive_sites (id, name, latitude, longitude, mag_declination, crs_proj4, z_scale)
            VALUES (2, 'Barren Site', 0, 0, 0,
                    '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs', 1.0)
        """))
        await session.commit()
    res = await client.get("/api/sites/2/landmarks")
    assert res.status_code == 200
    assert res.json() == []
