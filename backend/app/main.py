from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth, site_config, dive_plans, waypoints, landmarks

app = FastAPI(title="Dive Map API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(site_config.router)
app.include_router(dive_plans.router)
app.include_router(waypoints.router)
app.include_router(landmarks.router)
app.include_router(landmarks.flat_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
