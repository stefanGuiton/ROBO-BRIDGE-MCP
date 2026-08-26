from __future__ import annotations

import math
import time
from copy import deepcopy

from .models import (
    CollisionEvent,
    PhysicsEvent,
    SceneObject,
    SimulationRequest,
    SimulationResponse,
    TrajectoryPoint,
    Vec3Mm,
)

TABLE_TOP_WORLD_Y_MM = 45.0
TOOL_WORLD_OFFSET_MM = 65.0


def _machine_z_for_scene_object(obj: SceneObject) -> float:
    return TABLE_TOP_WORLD_Y_MM + obj.position.zMm - TOOL_WORLD_OFFSET_MM


def _inside_expanded_box(point: TrajectoryPoint, obj: SceneObject, expansion: float) -> tuple[bool, float]:
    center_z = _machine_z_for_scene_object(obj)
    dx = obj.size.xMm / 2 + expansion - abs(point.xMm - obj.position.xMm)
    dy = obj.size.yMm / 2 + expansion - abs(point.yMm - obj.position.yMm)
    dz = obj.size.zMm / 2 + expansion - abs(point.zMm - center_z)
    inside = dx >= 0 and dy >= 0 and dz >= 0
    return inside, min(dx, dy, dz) if inside else 0.0


def _distance_to_object(point: TrajectoryPoint, obj: SceneObject) -> float:
    dz = point.zMm - _machine_z_for_scene_object(obj)
    return math.sqrt(
        (point.xMm - obj.position.xMm) ** 2
        + (point.yMm - obj.position.yMm) ** 2
        + dz**2
    )


class DeterministicFallbackBackend:
    """A conservative foundation backend.

    It validates end-effector AABB clearance, deterministic grasp proximity,
    object attachment, release, and gravity-to-destination settlement. It is
    intentionally smaller than Newton and must not be represented as final
    rigid-body/contact fidelity.
    """

    name = "deterministic-physics-fallback"
    deterministic = True

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        start = time.perf_counter()
        objects = {obj.id: deepcopy(obj) for obj in request.scene.objects}
        obstacles = [obj for obj in objects.values() if obj.semanticRole == "obstacle"]
        collisions: list[CollisionEvent] = []
        events: list[PhysicsEvent] = []

        for index, point in enumerate(request.trajectory):
            for obstacle in obstacles:
                inside, penetration = _inside_expanded_box(point, obstacle, request.endEffectorRadiusMm)
                if inside:
                    collisions.append(
                        CollisionEvent(
                            trajectoryIndex=index,
                            obstacleId=obstacle.id,
                            phase=point.phase,
                            point=Vec3Mm(xMm=point.xMm, yMm=point.yMm, zMm=point.zMm),
                            penetrationEstimateMm=round(penetration, 4),
                        )
                    )
                    events.append(
                        PhysicsEvent(
                            type="collision",
                            trajectoryIndex=index,
                            details={"obstacleId": obstacle.id, "phase": point.phase},
                        )
                    )

        if collisions:
            return SimulationResponse(
                ok=False,
                requestId=request.requestId,
                backend=self.name,
                deterministic=self.deterministic,
                collisions=collisions,
                events=events,
                validatedTrajectory=request.trajectory,
                reason="trajectory_collision",
                finalObjectStates=list(objects.values()),
                warnings=["Robot-link self-collision is not yet checked by the fallback backend."],
                metrics={"elapsedMs": round((time.perf_counter() - start) * 1000, 3)},
            )

        grasp_success: bool | None = None
        task = request.task
        if task.type == "pick_and_place":
            if not task.objectId or not task.destinationId:
                return SimulationResponse(
                    ok=False,
                    requestId=request.requestId,
                    backend=self.name,
                    deterministic=self.deterministic,
                    reason="pick_and_place_ids_required",
                    validatedTrajectory=request.trajectory,
                    finalObjectStates=list(objects.values()),
                )
            target = objects.get(task.objectId)
            destination = objects.get(task.destinationId)
            if target is None or destination is None:
                return SimulationResponse(
                    ok=False,
                    requestId=request.requestId,
                    backend=self.name,
                    deterministic=self.deterministic,
                    reason="task_object_not_found",
                    validatedTrajectory=request.trajectory,
                    finalObjectStates=list(objects.values()),
                )
            if not target.graspable:
                return SimulationResponse(
                    ok=False,
                    requestId=request.requestId,
                    backend=self.name,
                    deterministic=self.deterministic,
                    reason="target_not_graspable",
                    validatedTrajectory=request.trajectory,
                    finalObjectStates=list(objects.values()),
                )

            close_candidates = [
                (index, point)
                for index, point in enumerate(request.trajectory)
                if point.phase == "close_gripper" or (point.gripperOpenFraction is not None and point.gripperOpenFraction <= 0.05)
            ]
            if not close_candidates:
                grasp_success = False
                return SimulationResponse(
                    ok=False,
                    requestId=request.requestId,
                    backend=self.name,
                    deterministic=self.deterministic,
                    reason="no_gripper_close_phase",
                    graspSuccess=False,
                    validatedTrajectory=request.trajectory,
                    finalObjectStates=list(objects.values()),
                )

            grasp_index, grasp_point = min(close_candidates, key=lambda item: _distance_to_object(item[1], target))
            grasp_distance = _distance_to_object(grasp_point, target)
            object_span = min(target.size.xMm, target.size.yMm)
            closing_width = 8.0 + (grasp_point.gripperOpenFraction or 0.0) * 38.0
            grasp_success = grasp_distance <= 48.0 and closing_width <= object_span + 16.0
            events.append(
                PhysicsEvent(
                    type="grasp_check",
                    trajectoryIndex=grasp_index,
                    objectId=target.id,
                    details={
                        "distanceMm": round(grasp_distance, 3),
                        "closingWidthMm": round(closing_width, 3),
                        "objectSpanMm": object_span,
                        "success": grasp_success,
                    },
                )
            )
            if not grasp_success:
                return SimulationResponse(
                    ok=False,
                    requestId=request.requestId,
                    backend=self.name,
                    deterministic=self.deterministic,
                    events=events,
                    reason="grasp_failed",
                    graspSuccess=False,
                    validatedTrajectory=request.trajectory,
                    finalObjectStates=list(objects.values()),
                    warnings=["Install and activate Newton for final contact/friction validation."],
                    metrics={"elapsedMs": round((time.perf_counter() - start) * 1000, 3)},
                )

            events.append(PhysicsEvent(type="object_attached", trajectoryIndex=grasp_index, objectId=target.id))
            release_candidates = [
                (index, point)
                for index, point in enumerate(request.trajectory[grasp_index:], start=grasp_index)
                if point.phase == "release" or (point.gripperOpenFraction is not None and point.gripperOpenFraction >= 0.95)
            ]
            if not release_candidates:
                return SimulationResponse(
                    ok=False,
                    requestId=request.requestId,
                    backend=self.name,
                    deterministic=self.deterministic,
                    events=events,
                    reason="no_release_phase",
                    graspSuccess=True,
                    validatedTrajectory=request.trajectory,
                    finalObjectStates=list(objects.values()),
                )
            release_index, release_point = release_candidates[0]
            inside_destination_xy = (
                abs(release_point.xMm - destination.position.xMm) <= destination.size.xMm / 2
                and abs(release_point.yMm - destination.position.yMm) <= destination.size.yMm / 2
            )
            if not inside_destination_xy:
                return SimulationResponse(
                    ok=False,
                    requestId=request.requestId,
                    backend=self.name,
                    deterministic=self.deterministic,
                    events=events,
                    reason="release_outside_destination",
                    graspSuccess=True,
                    validatedTrajectory=request.trajectory,
                    finalObjectStates=list(objects.values()),
                )

            target.position.xMm = destination.position.xMm
            target.position.yMm = destination.position.yMm
            target.position.zMm = destination.size.zMm + target.size.zMm / 2
            target.heldBy = None
            events.append(
                PhysicsEvent(
                    type="object_settled",
                    trajectoryIndex=release_index,
                    objectId=target.id,
                    destinationId=destination.id,
                    details={"gravityApplied": True, "settledZMm": target.position.zMm},
                )
            )

        return SimulationResponse(
            ok=True,
            requestId=request.requestId,
            backend=self.name,
            deterministic=self.deterministic,
            collisions=[],
            events=events,
            graspSuccess=grasp_success,
            finalObjectStates=list(objects.values()),
            validatedTrajectory=request.trajectory,
            warnings=[
                "Foundation backend validates conservative clearance and deterministic grasp proximity.",
                "Newton integration is scaffolded but is not active in this build.",
            ],
            metrics={
                "elapsedMs": round((time.perf_counter() - start) * 1000, 3),
                "trajectoryPoints": len(request.trajectory),
                "obstacleCount": len(obstacles),
            },
        )
