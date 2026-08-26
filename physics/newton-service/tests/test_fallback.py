from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.fallback_backend import DeterministicFallbackBackend
from app.models import SimulationRequest
from app.service import PhysicsService


def request_payload(*, collide: bool = False, grasp_offset: float = 0.0) -> dict:
    safe_z = 70.0 if collide else 220.0
    return {
        "requestId": "test-plan",
        "robot": {"joints": {"thetaDeg": 0, "psiDeg": 90, "zMm": 220}},
        "scene": {
            "revision": 0,
            "objects": [
                {
                    "id": "cube",
                    "label": "Cube",
                    "type": "cube",
                    "semanticRole": "workpiece",
                    "position": {"xMm": 220, "yMm": -150, "zMm": 25},
                    "size": {"xMm": 50, "yMm": 50, "zMm": 50},
                    "massKg": 0.18,
                    "friction": 0.72,
                    "movable": True,
                    "graspable": True,
                },
                {
                    "id": "bin",
                    "label": "Bin",
                    "type": "bin",
                    "semanticRole": "destination",
                    "position": {"xMm": -190, "yMm": 210, "zMm": 35},
                    "size": {"xMm": 150, "yMm": 130, "zMm": 70},
                    "movable": False,
                    "graspable": False,
                },
                {
                    "id": "obstacle",
                    "label": "Obstacle",
                    "type": "box",
                    "semanticRole": "obstacle",
                    "position": {"xMm": 20, "yMm": 20, "zMm": 90},
                    "size": {"xMm": 120, "yMm": 110, "zMm": 180},
                    "movable": False,
                    "graspable": False,
                },
            ],
        },
        "trajectory": [
            {"xMm": 300, "yMm": 0, "zMm": safe_z, "phase": "start", "gripperOpenFraction": 1},
            {"xMm": 220 + grasp_offset, "yMm": -150, "zMm": 5, "phase": "close_gripper", "gripperOpenFraction": 0, "objectId": "cube"},
            {"xMm": 220, "yMm": -150, "zMm": safe_z, "phase": "lift", "gripperOpenFraction": 0, "objectId": "cube"},
            {"xMm": -190, "yMm": 210, "zMm": safe_z, "phase": "transfer", "gripperOpenFraction": 0, "objectId": "cube"},
            {"xMm": -190, "yMm": 210, "zMm": 50, "phase": "release", "gripperOpenFraction": 1, "objectId": "cube"},
        ],
        "task": {"type": "pick_and_place", "objectId": "cube", "destinationId": "bin"},
        "endEffectorRadiusMm": 34,
    }


def test_valid_pick_and_place_passes_and_settles_object() -> None:
    request = SimulationRequest.model_validate(request_payload())
    result = DeterministicFallbackBackend().simulate(request)
    assert result.ok is True
    assert result.graspSuccess is True
    cube = next(obj for obj in result.finalObjectStates if obj.id == "cube")
    assert cube.position.xMm == -190
    assert cube.position.yMm == 210
    assert any(event.type == "object_settled" for event in result.events)


def test_collision_fails_closed() -> None:
    payload = request_payload(collide=True)
    payload["trajectory"].insert(1, {"xMm": 20, "yMm": 20, "zMm": 70, "phase": "unsafe_transfer", "gripperOpenFraction": 1})
    request = SimulationRequest.model_validate(payload)
    result = DeterministicFallbackBackend().simulate(request)
    assert result.ok is False
    assert result.reason == "trajectory_collision"
    assert result.collisions


def test_bad_grasp_is_rejected() -> None:
    request = SimulationRequest.model_validate(request_payload(grasp_offset=120))
    result = DeterministicFallbackBackend().simulate(request)
    assert result.ok is False
    assert result.reason == "grasp_failed"
    assert result.graspSuccess is False


def test_service_health_reports_newton_boundary_honestly() -> None:
    health = PhysicsService().health()
    assert health["ok"] is True
    assert health["backend"] == "deterministic-physics-fallback"
    assert health["requestedBackend"] == "fallback"
    assert health["requestedBackendReady"] is True
    assert health["newton"]["integrationReady"] is True
    assert health["newton"]["available"] is True
