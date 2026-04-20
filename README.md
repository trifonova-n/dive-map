# dive-map

A 3D dive route planner for Point Lobos / Monterey Bay bathymetry, built on a Qgis2threejs export. Plan dives in the browser with distance and magnetic-heading segment labels, save plans to a backend, and view them in AR on a phone.

- **Frontend:** TypeScript + Three.js (via Qgis2threejs), bundled by Vite
- **Backend:** FastAPI + async SQLAlchemy 2.0 + PostGIS, JWT auth
- **Database:** PostgreSQL with PostGIS

Production deployment is documented in [DEPLOY.md](DEPLOY.md).

## Running the full stack

Start all three components (database, backend, frontend):

```bash
# 1. Database (PostGIS)
docker compose up db -d

# 2. Backend (first time: create venv + install + migrate)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` and `/auth` to the backend at `localhost:8000`.

Swagger docs at `http://localhost:8000/docs`. Health check at `GET /health`.

## Running tests

```bash
# Frontend (Vitest — CRS, segment math, config fallback)
cd frontend
npm test                         # run once
npm run test:watch               # watch mode
npm test -- crs                  # run a single file / filter by name

# Type-check + production build
npm run build                    # tsc --noEmit && vite build

# Backend (pytest — auth, plans, waypoints, sites)
# Requires PostGIS running (docker compose up db -d)
cd backend && source .venv/bin/activate
pytest tests/ -v
pytest tests/test_auth.py -v     # single file
pytest -k "login" -v             # filter by name
```

The backend tests use a separate `divemap_test` database. Create it once with:

```bash
docker exec dive-map-db-1 psql -U divemap -d divemap -c "CREATE DATABASE divemap_test;"
```

## Repository layout

```
frontend/    Vite + TypeScript app; Qgis2threejs scene viewer
backend/     FastAPI app, Alembic migrations, pytest tests
docker-compose.yml        Dev stack (just the db service is used locally)
docker-compose.prod.yml   Production stack (see DEPLOY.md)
Caddyfile                 Production reverse proxy config
```