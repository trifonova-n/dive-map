import pytest
from httpx import AsyncClient


async def test_register(client: AsyncClient):
    res = await client.post(
        "/auth/register",
        json={"email": "new@example.com", "password": "pass123"},
    )
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_register_duplicate(client: AsyncClient):
    await client.post(
        "/auth/register",
        json={"email": "dup@example.com", "password": "pass123"},
    )
    res = await client.post(
        "/auth/register",
        json={"email": "dup@example.com", "password": "pass456"},
    )
    assert res.status_code == 409


async def test_login(client: AsyncClient):
    await client.post(
        "/auth/register",
        json={"email": "login@example.com", "password": "secret"},
    )
    res = await client.post(
        "/auth/login",
        json={"email": "login@example.com", "password": "secret"},
    )
    assert res.status_code == 200
    assert "access_token" in res.json()


async def test_login_wrong_password(client: AsyncClient):
    await client.post(
        "/auth/register",
        json={"email": "wrong@example.com", "password": "right"},
    )
    res = await client.post(
        "/auth/login",
        json={"email": "wrong@example.com", "password": "wrong"},
    )
    assert res.status_code == 401


async def test_login_nonexistent_user(client: AsyncClient):
    res = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "pass"},
    )
    assert res.status_code == 401
