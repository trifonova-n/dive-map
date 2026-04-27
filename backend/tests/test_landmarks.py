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


async def test_list_landmarks_includes_own_when_authed(authed_client: AsyncClient):
    await _seed_site_and_landmarks()
    # Caller creates their own landmark.
    res = await authed_client.post(
        "/api/sites/1/landmarks",
        json={"name": "My Spot", "latitude": 36.5, "longitude": -121.9, "depth_m": 8.0},
    )
    assert res.status_code == 201

    # Directly insert a landmark belonging to a different user.
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO users (id, email, hashed_password) VALUES (99, 'x@y.z', 'h')
        """))
        await session.execute(text("""
            INSERT INTO landmarks (site_id, user_id, name, latitude, longitude, depth_m)
            VALUES (1, 99, 'Other User Spot', 36.5, -121.9, 5.0)
        """))
        await session.commit()

    res = await authed_client.get("/api/sites/1/landmarks")
    assert res.status_code == 200
    names = {r["name"] for r in res.json()}
    assert "My Spot" in names
    assert "Other User Spot" not in names
    # 6 curated + 1 own = 7
    assert len(res.json()) == 7


async def test_create_landmark(authed_client: AsyncClient):
    await _seed_site_and_landmarks()
    res = await authed_client.post(
        "/api/sites/1/landmarks",
        json={
            "name": "New Pinnacle",
            "latitude": 36.521,
            "longitude": -121.950,
            "depth_m": 12.5,
            "description": "A nice spot",
            "image_url": "https://example.com/img.jpg",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "New Pinnacle"
    assert data["user_id"] is not None
    assert data["description"] == "A nice spot"
    assert data["image_url"] == "https://example.com/img.jpg"
    assert data["depth_m"] == 12.5


async def test_create_landmark_requires_auth(client: AsyncClient):
    await _seed_site_and_landmarks()
    res = await client.post(
        "/api/sites/1/landmarks",
        json={"name": "x", "latitude": 0, "longitude": 0},
    )
    assert res.status_code in (401, 403)


async def test_create_landmark_site_not_found(authed_client: AsyncClient):
    res = await authed_client.post(
        "/api/sites/9999/landmarks",
        json={"name": "x", "latitude": 0, "longitude": 0},
    )
    assert res.status_code == 404


async def test_update_landmark_own(authed_client: AsyncClient):
    await _seed_site_and_landmarks()
    create = await authed_client.post(
        "/api/sites/1/landmarks",
        json={"name": "Before", "latitude": 36.5, "longitude": -121.9, "depth_m": 3.0},
    )
    landmark_id = create.json()["id"]

    res = await authed_client.patch(
        f"/api/landmarks/{landmark_id}",
        json={"name": "After", "description": "New desc", "image_url": "https://x/y.png"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "After"
    assert data["description"] == "New desc"
    assert data["image_url"] == "https://x/y.png"
    # Coords and depth must not change.
    assert data["latitude"] == 36.5
    assert data["longitude"] == -121.9
    assert data["depth_m"] == 3.0


async def test_update_landmark_others_returns_404(authed_client: AsyncClient):
    await _seed_site_and_landmarks()
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO users (id, email, hashed_password) VALUES (77, 'z@z.z', 'h')
        """))
        await session.execute(text("""
            INSERT INTO landmarks (id, site_id, user_id, name, latitude, longitude, depth_m)
            VALUES (500, 1, 77, 'Not Yours', 36.5, -121.9, 5.0)
        """))
        await session.commit()
    res = await authed_client.patch(
        "/api/landmarks/500", json={"name": "stolen"}
    )
    assert res.status_code == 404


async def test_update_landmark_curated_returns_404(authed_client: AsyncClient):
    await _seed_site_and_landmarks()
    # The seeded curated landmarks have user_id=NULL, so PATCH must 404.
    res = await authed_client.get("/api/sites/1/landmarks")
    curated = next(r for r in res.json() if r["user_id"] is None)
    res = await authed_client.patch(
        f"/api/landmarks/{curated['id']}", json={"name": "hijacked"}
    )
    assert res.status_code == 404


async def test_delete_landmark_own(authed_client: AsyncClient):
    await _seed_site_and_landmarks()
    create = await authed_client.post(
        "/api/sites/1/landmarks",
        json={"name": "Doomed", "latitude": 36.5, "longitude": -121.9},
    )
    landmark_id = create.json()["id"]

    res = await authed_client.delete(f"/api/landmarks/{landmark_id}")
    assert res.status_code == 204

    res = await authed_client.get("/api/sites/1/landmarks")
    names = {r["name"] for r in res.json()}
    assert "Doomed" not in names


async def test_delete_landmark_others_returns_404(authed_client: AsyncClient):
    await _seed_site_and_landmarks()
    async with TestSession() as session:
        await session.execute(text("""
            INSERT INTO users (id, email, hashed_password) VALUES (88, 'q@q.q', 'h')
        """))
        await session.execute(text("""
            INSERT INTO landmarks (id, site_id, user_id, name, latitude, longitude, depth_m)
            VALUES (600, 1, 88, 'Other', 36.5, -121.9, 5.0)
        """))
        await session.commit()
    res = await authed_client.delete("/api/landmarks/600")
    assert res.status_code == 404


async def test_admin_can_update_public_landmark(authed_client: AsyncClient):
    await _seed_site_and_landmarks()
    # Promote the registered test user to admin.
    async with TestSession() as session:
        await session.execute(text(
            "UPDATE users SET is_admin = true WHERE email = 'test@example.com'"
        ))
        await session.commit()

    res = await authed_client.get("/api/sites/1/landmarks")
    curated = next(r for r in res.json() if r["user_id"] is None)

    res = await authed_client.patch(
        f"/api/landmarks/{curated['id']}",
        json={"name": "Renamed By Admin", "description": "Curator note"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Renamed By Admin"
    assert data["description"] == "Curator note"
    # Public landmark stays public after an admin edit.
    assert data["user_id"] is None


async def test_admin_cannot_delete_public_landmark(authed_client: AsyncClient):
    await _seed_site_and_landmarks()
    async with TestSession() as session:
        await session.execute(text(
            "UPDATE users SET is_admin = true WHERE email = 'test@example.com'"
        ))
        await session.commit()

    res = await authed_client.get("/api/sites/1/landmarks")
    curated = next(r for r in res.json() if r["user_id"] is None)

    res = await authed_client.delete(f"/api/landmarks/{curated['id']}")
    assert res.status_code == 404
