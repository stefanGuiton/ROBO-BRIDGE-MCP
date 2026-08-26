from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models import SimulationRequest
from app.newton_backend import NewtonBackend

from test_fallback import request_payload


pytestmark = pytest.mark.skipif(
    os.getenv("ROBO_SIM_RUN_NEWTON_TESTS") != "1",
    reason="Newton runtime tests require explicit thermal/device qualification",
)


def _simulate(payload: dict, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ROBO_SIM_NEWTON_DEVICE", "cpu")
    backend = NewtonBackend()
    assert backend.availability.available, backend.availability.reason
    return backend.simulate(SimulationRequest.model_validate(payload))


def test_newton_safe_grasp_lifts_and_places(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _simulate(request_payload(), monkeypatch)
    assert result.backend == "newton"
    assert result.ok is True, result.model_dump()
    assert result.graspSuccess is True
    cube = next(obj for obj in result.finalObjectStates if obj.id == "cube")
    assert abs(cube.position.xMm - (-190.0)) <= 20.0
    assert abs(cube.position.yMm - 210.0) <= 20.0
    assert any(event.type == "object_settled" for event in result.events)


def test_newton_offset_grasp_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _simulate(request_payload(grasp_offset=120.0), monkeypatch)
    assert result.backend == "newton"
    assert result.ok is False
    assert result.graspSuccess is False
    assert result.reason == "grasp_failed"


def test_newton_low_transfer_reports_obstacle_collision(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = request_payload()
    payload["trajectory"].insert(
        3,
        {
            "xMm": 20,
            "yMm": 20,
            "zMm": 70,
            "phase": "unsafe_transfer",
            "gripperOpenFraction": 0,
            "objectId": "cube",
        },
    )
    result = _simulate(payload, monkeypatch)
    assert result.backend == "newton"
    assert result.ok is False
    assert result.reason == "trajectory_collision"
    assert result.collisions
