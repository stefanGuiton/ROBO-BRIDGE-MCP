from __future__ import annotations

import os
from dataclasses import asdict
from threading import Lock

from .fallback_backend import DeterministicFallbackBackend
from .models import SceneState, SimulationRequest, SimulationResponse
from .newton_backend import NewtonBackend


class PhysicsService:
    def __init__(self) -> None:
        self.fallback = DeterministicFallbackBackend()
        self.newton = NewtonBackend()
        self.requested_backend = os.getenv("ROBO_SIM_PHYSICS_BACKEND", "fallback").strip().lower()
        self._lock = Lock()
        self._scene: SceneState | None = None
        self._results: dict[str, SimulationResponse] = {}

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
            "requestedBackendReady": self.requested_backend != "newton" or self.active_backend_name == self.newton.name,
            "deterministic": self.active_backend_name == self.fallback.name,
            "sceneRevision": self._scene.revision if self._scene is not None else None,
            "resultCount": len(self._results),
            "newton": {
                **asdict(self.newton.availability),
                "integrationReady": self.newton.implementation_ready,
            },
        }

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        with self._lock:
            self._scene = request.scene.model_copy(deep=True)
        if self.active_backend_name == self.newton.name:
            result = self.newton.simulate(request)
        else:
            result = self.fallback.simulate(request)
        with self._lock:
            self._results[request.requestId] = result.model_copy(deep=True)
        return result

    def synchronise_scene(self, scene: SceneState) -> dict[str, object]:
        with self._lock:
            self._scene = scene.model_copy(deep=True)
        return {"ok": True, "sceneRevision": scene.revision, "objectCount": len(scene.objects)}

    def reset_scene(self) -> dict[str, object]:
        with self._lock:
            self._scene = None
            self._results.clear()
        return {"ok": True, "sceneRevision": None, "resultCount": 0}

    def get_result(self, request_id: str) -> SimulationResponse | None:
        with self._lock:
            result = self._results.get(request_id)
            return result.model_copy(deep=True) if result is not None else None
