from __future__ import annotations

from dataclasses import dataclass

from .models import SimulationRequest, SimulationResponse


@dataclass(frozen=True)
class NewtonAvailability:
    available: bool
    reason: str | None = None
    newton_version: str | None = None
    warp_version: str | None = None


def detect_newton() -> NewtonAvailability:
    try:
        import newton  # type: ignore
        import warp as wp  # type: ignore

        return NewtonAvailability(
            available=True,
            newton_version=getattr(newton, "__version__", "unknown"),
            warp_version=getattr(wp, "__version__", "unknown"),
        )
    except Exception as exc:  # pragma: no cover - depends on optional environment
        return NewtonAvailability(available=False, reason=f"{type(exc).__name__}: {exc}")


class NewtonBackend:
    """Integration boundary for the full Newton implementation.

    The package detection and service contract are complete. The next bounded
    implementation task is to build the SCARA articulation, gripper colliders,
    workcell bodies, and MuJoCo-Warp stepping behind this class. This foundation
    intentionally refuses to claim Newton fidelity before that work is tested.
    """

    name = "newton"
    deterministic = False
    implementation_ready = False

    def __init__(self) -> None:
        self.availability = detect_newton()

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        raise RuntimeError(
            "Newton is detected but the ROBO-SIM-MCP articulation/contact adapter is not implemented yet. "
            "Use the deterministic fallback until physics/newton-service/app/newton_backend.py is completed."
        )
