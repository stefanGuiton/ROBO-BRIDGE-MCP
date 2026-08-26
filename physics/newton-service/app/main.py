from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import SimulationRequest, SimulationResponse
from .service import PhysicsService

app = FastAPI(
    title="ROBO-SIM-MCP Physics Service",
    version="0.1.0-foundation",
    description="Newton integration boundary with a deterministic foundation backend.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8769", "http://localhost:8769", "http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)
service = PhysicsService()


@app.get("/health")
def health() -> dict[str, object]:
    return service.health()


@app.post("/v1/simulate/trajectory", response_model=SimulationResponse)
def simulate_trajectory(request: SimulationRequest) -> SimulationResponse:
    return service.simulate(request)
