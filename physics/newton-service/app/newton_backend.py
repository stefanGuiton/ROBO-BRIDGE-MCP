from __future__ import annotations

import math
import os
import time
from copy import deepcopy
from dataclasses import dataclass
from importlib import metadata
from pathlib import Path
from typing import Any

from .models import CollisionEvent, PhysicsEvent, SimulationRequest, SimulationResponse, Vec3Mm


MM_TO_M = 0.001
M_TO_MM = 1000.0
TABLE_TOP_WORLD_Y_MM = 45.0
TOOL_WORLD_OFFSET_MM = 65.0


@dataclass(frozen=True)
class NewtonAvailability:
    available: bool
    reason: str | None = None
    newton_version: str | None = None
    warp_version: str | None = None


def detect_newton() -> NewtonAvailability:
    try:
        return NewtonAvailability(
            available=True,
            newton_version=metadata.version("newton"),
            warp_version=metadata.version("warp-lang"),
        )
    except metadata.PackageNotFoundError as exc:  # pragma: no cover - depends on optional environment
        return NewtonAvailability(available=False, reason=f"{type(exc).__name__}: {exc}")


def _tool_height_m(machine_z_mm: float) -> float:
    return (machine_z_mm + TOOL_WORLD_OFFSET_MM - TABLE_TOP_WORLD_Y_MM) * MM_TO_M


def _point_position(point: Any) -> tuple[float, float, float]:
    return point.xMm * MM_TO_M, point.yMm * MM_TO_M, _tool_height_m(point.zMm)


def _interpolate(a: Any, b: Any, fraction: float) -> tuple[tuple[float, float, float], float]:
    pa = _point_position(a)
    pb = _point_position(b)
    position = tuple(pa[index] + (pb[index] - pa[index]) * fraction for index in range(3))
    open_a = 1.0 if a.gripperOpenFraction is None else a.gripperOpenFraction
    open_b = open_a if b.gripperOpenFraction is None else b.gripperOpenFraction
    return position, open_a + (open_b - open_a) * fraction


def _contact_pairs(model: Any, contacts: Any) -> set[tuple[int, int]]:
    count = int(contacts.rigid_contact_count.numpy()[0])
    shape_0 = contacts.rigid_contact_shape0.numpy()[:count]
    shape_1 = contacts.rigid_contact_shape1.numpy()[:count]
    return {tuple(sorted((int(a), int(b)))) for a, b in zip(shape_0, shape_1, strict=True)}


class NewtonBackend:
    """Bounded Newton validator driven by the browser's accepted SCARA trajectory.

    Newton owns contact, grasp/lift, release, gravity settlement, and final cube
    pose. It deliberately does not duplicate SCARA FK/IK or browser robot state.
    """

    name = "newton"
    deterministic = False
    implementation_ready = True

    def __init__(self) -> None:
        self.availability = detect_newton()

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        if not self.availability.available:
            raise RuntimeError(self.availability.reason or "Newton is not installed")

        # Imports are intentionally lazy: service health/package detection must
        # not initialise CUDA or compile Warp kernels.
        os.environ.setdefault("WARP_CACHE_PATH", str(Path(__file__).resolve().parents[3] / ".cache" / "warp"))
        import newton  # type: ignore
        import numpy as np
        import warp as wp  # type: ignore

        device = os.getenv("ROBO_SIM_NEWTON_DEVICE", "cpu").strip().lower()
        if device not in {"cpu", "cuda"} and not device.startswith("cuda:"):
            raise RuntimeError(f"Unsupported ROBO_SIM_NEWTON_DEVICE: {device}")

        started = time.perf_counter()
        objects = {obj.id: deepcopy(obj) for obj in request.scene.objects}
        target = objects.get(request.task.objectId or "")
        destination = objects.get(request.task.destinationId or "")
        if request.task.type != "pick_and_place" or target is None or destination is None:
            return SimulationResponse(
                ok=False,
                requestId=request.requestId,
                backend=self.name,
                deterministic=False,
                reason="newton_requires_pick_and_place_objects",
                validatedTrajectory=request.trajectory,
                finalObjectStates=list(objects.values()),
            )
        if not target.graspable:
            return SimulationResponse(
                ok=False,
                requestId=request.requestId,
                backend=self.name,
                deterministic=False,
                reason="target_not_graspable",
                validatedTrajectory=request.trajectory,
                finalObjectStates=list(objects.values()),
            )

        wp.set_device(device)
        newton.use_coord_layout_targets = True
        builder = newton.ModelBuilder()
        # Newton's default 0.1 m broad contact gap is intentionally generous
        # for general scenes; this millimetre-scale workcell needs a tight gap.
        builder.rigid_gap = 0.002
        builder.default_shape_cfg.gap = 0.002
        builder.default_shape_cfg.mu = 1.0e3
        builder.default_shape_cfg.ke = 1.0e4
        builder.default_shape_cfg.kd = 1.0e6
        builder.add_ground_plane()

        cube_position = wp.vec3(
            target.position.xMm * MM_TO_M,
            target.position.yMm * MM_TO_M,
            target.position.zMm * MM_TO_M,
        )
        cube_body = builder.add_body(
            xform=wp.transform(cube_position, wp.quat_identity()),
            mass=0.0,
            label=target.id,
        )
        cube_cfg = builder.default_shape_cfg.copy()
        cube_volume_m3 = target.size.xMm * target.size.yMm * target.size.zMm * (MM_TO_M**3)
        cube_cfg.density = (target.massKg or 0.18) / cube_volume_m3
        cube_shape = builder.add_shape_box(
            cube_body,
            hx=target.size.xMm * MM_TO_M / 2.0,
            hy=target.size.yMm * MM_TO_M / 2.0,
            hz=target.size.zMm * MM_TO_M / 2.0,
            cfg=cube_cfg,
            label=f"{target.id}-shape",
        )

        obstacle_shapes: dict[int, str] = {}
        for obstacle in (obj for obj in objects.values() if obj.semanticRole == "obstacle"):
            shape = builder.add_shape_box(
                -1,
                xform=wp.transform(
                    wp.vec3(
                        obstacle.position.xMm * MM_TO_M,
                        obstacle.position.yMm * MM_TO_M,
                        obstacle.position.zMm * MM_TO_M,
                    ),
                    wp.quat_identity(),
                ),
                hx=obstacle.size.xMm * MM_TO_M / 2.0,
                hy=obstacle.size.yMm * MM_TO_M / 2.0,
                hz=obstacle.size.zMm * MM_TO_M / 2.0,
                label=f"{obstacle.id}-shape",
            )
            obstacle_shapes[shape] = obstacle.id

        # The foundation bins are solid raised landing platforms. This matches
        # their browser collision geometry and the protocol's settled Z value.
        destination_shape = builder.add_shape_box(
            -1,
            xform=wp.transform(
                wp.vec3(
                    destination.position.xMm * MM_TO_M,
                    destination.position.yMm * MM_TO_M,
                    destination.size.zMm * MM_TO_M / 2.0,
                ),
                wp.quat_identity(),
            ),
            hx=destination.size.xMm * MM_TO_M / 2.0,
            hy=destination.size.yMm * MM_TO_M / 2.0,
            hz=destination.size.zMm * MM_TO_M / 2.0,
            label=f"{destination.id}-landing-shape",
        )

        finger_half_x = 0.008
        finger_half_y = min(0.025, target.size.yMm * MM_TO_M / 2.0)
        finger_half_z = 0.035
        first_position = _point_position(request.trajectory[0])
        finger_bodies: list[int] = []
        finger_shapes: list[int] = []
        finger_cfg = builder.default_shape_cfg.copy()
        finger_cfg.density = 0.0
        for suffix in ("negative", "positive"):
            body = builder.add_body(
                xform=wp.transform(wp.vec3(*first_position), wp.quat_identity()),
                mass=0.0,
                is_kinematic=True,
                label=f"gripper-{suffix}",
            )
            shape = builder.add_shape_box(
                body,
                hx=finger_half_x,
                hy=finger_half_y,
                hz=finger_half_z,
                cfg=finger_cfg,
                label=f"gripper-{suffix}-shape",
            )
            finger_bodies.append(body)
            finger_shapes.append(shape)

        builder.color()
        model = builder.finalize(device=device)
        model.set_gravity((0.0, 0.0, -9.81))
        state_0 = model.state()
        state_1 = model.state()
        control = model.control()
        pipeline = newton.CollisionPipeline(model)
        contacts = pipeline.contacts()
        solver = newton.solvers.SolverVBD(
            model,
            iterations=5,
            rigid_avbd_contact_alpha=0.5,
            deterministic=wp.DeterministicMode.RUN_TO_RUN,
        )

        fps = 60
        substeps = 4
        dt = 1.0 / fps / substeps
        closed_offset = target.size.xMm * MM_TO_M / 2.0 + finger_half_x - 0.0005
        open_offset = closed_offset + 0.030
        finger_pair = set(finger_shapes)
        cube_contact_frames = 0
        obstacle_contact: tuple[int, str, tuple[float, float, float]] | None = None
        total_steps = 0
        max_cube_z = float(cube_position[2])
        release_seen = False
        sampled_frames: list[dict[str, Any]] = []

        def drive_gripper(position: tuple[float, float, float], open_fraction: float) -> None:
            offset = closed_offset + (open_offset - closed_offset) * open_fraction
            body_q = state_0.body_q.numpy()
            for body, sign in zip(finger_bodies, (-1.0, 1.0), strict=True):
                body_q[body] = np.array(
                    [position[0] + sign * offset, position[1], position[2], 0.0, 0.0, 0.0, 1.0],
                    dtype=np.float32,
                )
            state_0.body_q.assign(body_q)

        def step(position: tuple[float, float, float], open_fraction: float, trajectory_index: int) -> None:
            nonlocal state_0, state_1, cube_contact_frames, obstacle_contact, total_steps, max_cube_z
            for _ in range(substeps):
                state_0.clear_forces()
                drive_gripper(position, open_fraction)
                pipeline.collide(state_0, contacts)
                pairs = _contact_pairs(model, contacts)
                if any(tuple(sorted((cube_shape, finger))) in pairs for finger in finger_pair):
                    cube_contact_frames += 1
                if obstacle_contact is None:
                    for obstacle_shape, obstacle_id in obstacle_shapes.items():
                        if any(tuple(sorted((obstacle_shape, finger))) in pairs for finger in finger_pair):
                            obstacle_contact = (trajectory_index, obstacle_id, position)
                            break
                solver.step(state_0, state_1, control, contacts, dt)
                state_0, state_1 = state_1, state_0
                total_steps += 1
                max_cube_z = max(max_cube_z, float(state_0.body_q.numpy()[cube_body, 2]))

        # Settle the initial workpiece before applying the supplied trajectory.
        for _ in range(20):
            step(first_position, 1.0, 0)

        previous = request.trajectory[0]
        for trajectory_index, point in enumerate(request.trajectory[1:], start=1):
            distance = math.dist(_point_position(previous), _point_position(point))
            frames = max(1, min(360, int(math.ceil(distance / 0.002))))
            previous_open = 1.0 if previous.gripperOpenFraction is None else previous.gripperOpenFraction
            target_open = previous_open if point.gripperOpenFraction is None else point.gripperOpenFraction
            actuates_gripper = point.phase in {"close_gripper", "release"}
            for frame in range(1, frames + 1):
                position, interpolated_open = _interpolate(previous, point, frame / frames)
                open_fraction = previous_open if actuates_gripper else interpolated_open
                step(position, open_fraction, trajectory_index)
            if actuates_gripper:
                position = _point_position(point)
                for frame in range(1, 31):
                    open_fraction = previous_open + (target_open - previous_open) * (frame / 30.0)
                    step(position, open_fraction, trajectory_index)
            cube_q = state_0.body_q.numpy()[cube_body]
            sampled_frames.append(
                {
                    "trajectoryIndex": trajectory_index,
                    "phase": point.phase,
                    "cubePositionMm": [round(float(value) * M_TO_MM, 3) for value in cube_q[:3]],
                }
            )
            if point.phase == "release" or (point.gripperOpenFraction is not None and point.gripperOpenFraction >= 0.95):
                release_seen = True
            previous = point

        final_position, final_open = _interpolate(previous, previous, 1.0)
        if release_seen:
            for _ in range(120):
                step(final_position, final_open, len(request.trajectory) - 1)

        cube_q = state_0.body_q.numpy()[cube_body]
        final_x_mm, final_y_mm, final_z_mm = (float(value) * M_TO_MM for value in cube_q[:3])
        initial_z_mm = target.position.zMm
        lifted = max_cube_z * M_TO_MM >= initial_z_mm + 30.0
        inside_destination = (
            abs(final_x_mm - destination.position.xMm) <= destination.size.xMm / 2.0
            and abs(final_y_mm - destination.position.yMm) <= destination.size.yMm / 2.0
        )
        expected_z_mm = destination.size.zMm + target.size.zMm / 2.0
        settled = inside_destination and abs(final_z_mm - expected_z_mm) <= 12.0

        target.position.xMm = round(final_x_mm, 3)
        target.position.yMm = round(final_y_mm, 3)
        target.position.zMm = round(final_z_mm, 3)
        target.heldBy = None

        events: list[PhysicsEvent] = [
            PhysicsEvent(
                type="newton_contact_summary",
                objectId=target.id,
                details={"fingerContactSubsteps": cube_contact_frames, "device": device},
            )
        ]
        collisions: list[CollisionEvent] = []
        reason: str | None = None
        if obstacle_contact is not None:
            index, obstacle_id, position = obstacle_contact
            collisions.append(
                CollisionEvent(
                    trajectoryIndex=index,
                    obstacleId=obstacle_id,
                    phase=request.trajectory[index].phase,
                    point=Vec3Mm(
                        xMm=position[0] * M_TO_MM,
                        yMm=position[1] * M_TO_MM,
                        zMm=position[2] * M_TO_MM - TOOL_WORLD_OFFSET_MM + TABLE_TOP_WORLD_Y_MM,
                    ),
                    penetrationEstimateMm=0.0,
                )
            )
            events.append(PhysicsEvent(type="collision", trajectoryIndex=index, details={"obstacleId": obstacle_id}))
            reason = "trajectory_collision"
        elif not lifted:
            events.append(PhysicsEvent(type="grasp_failed", objectId=target.id, details={"lifted": False}))
            reason = "grasp_failed"
        elif not release_seen:
            reason = "no_release_phase"
        elif not settled:
            events.append(
                PhysicsEvent(
                    type="object_drop_or_slip",
                    objectId=target.id,
                    destinationId=destination.id,
                    details={"insideDestination": inside_destination, "finalZMm": round(final_z_mm, 3)},
                )
            )
            reason = "object_not_settled_in_destination"
        else:
            events.extend(
                [
                    PhysicsEvent(type="grasp_succeeded", objectId=target.id, details={"lifted": True}),
                    PhysicsEvent(
                        type="object_settled",
                        objectId=target.id,
                        destinationId=destination.id,
                        details={"finalPositionMm": [target.position.xMm, target.position.yMm, target.position.zMm]},
                    ),
                ]
            )

        elapsed_ms = round((time.perf_counter() - started) * 1000.0, 3)
        return SimulationResponse(
            ok=reason is None,
            requestId=request.requestId,
            backend=self.name,
            deterministic=device == "cpu",
            collisions=collisions,
            events=events,
            graspSuccess=lifted,
            finalObjectStates=list(objects.values()),
            validatedTrajectory=request.trajectory,
            reason=reason,
            warnings=[] if device == "cpu" else ["CUDA result determinism must be measured across repeated runs."],
            metrics={
                "elapsedMs": elapsed_ms,
                "device": device,
                "solver": "VBD",
                "simulationSteps": total_steps,
                "fingerContactSubsteps": cube_contact_frames,
                "maxCubeZMm": round(max_cube_z * M_TO_MM, 3),
                "sampledFrames": sampled_frames,
                "destinationShape": destination_shape,
            },
        )
