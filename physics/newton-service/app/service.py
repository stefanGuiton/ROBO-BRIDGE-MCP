from __future__ import annotations

import os
from dataclasses import asdict

from .fallback_backend import DeterministicFallbackBackend
from .models import SimulationRequest, SimulationResponse
from .newton_backend import NewtonBackend


class PhysicsService:
    def __init__(self) -> None:
        self.fallback = DeterministicFallbackBackend()
        self.newton = NewtonBackend()
        self.requested_backend = os.getenv("ROBO_SIM_PHYSICS_BACKEND", "auto").strip().lower()

    @property
    def active_backend_name(self) -> str:
        if self.requested_backend == "newton" and self.newton.implementation_ready and self.newton.availability.available:
            return self.newton.name
        return self.fallback.name

    def health(self) -> dict[str, object]:
        return {
            "ok": True,
            "service": "robo-sim-mcp-physics",
            "backend": self.active_backend_name,
            "requestedBackend": self.requested_backend,
            "deterministic": self.active_backend_name == self.fallback.name,
            "newton": {
                **asdict(self.newton.availability),
                "integrationReady": self.newton.implementation_ready,
            },
        }

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        if self.active_backend_name == self.newton.name:
            return self.newton.simulate(request)
        return self.fallback.simulate(request)
