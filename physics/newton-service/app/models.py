from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Vec3Mm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    xMm: float
    yMm: float
    zMm: float


class Size3Mm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    xMm: float = Field(gt=0)
    yMm: float = Field(gt=0)
    zMm: float = Field(gt=0)


class SceneObject(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    label: str | None = None
    type: str
    semanticRole: str | None = None
    colour: str | None = None
    position: Vec3Mm
    size: Size3Mm
    massKg: float | None = Field(default=None, ge=0)
    friction: float | None = Field(default=None, ge=0)
    movable: bool = False
    graspable: bool = False
    heldBy: str | None = None


class SceneState(BaseModel):
    model_config = ConfigDict(extra="allow")
    revision: int = 0
    objects: list[SceneObject]


class TrajectoryPoint(BaseModel):
    model_config = ConfigDict(extra="allow")
    xMm: float
    yMm: float
    zMm: float
    gripperOpenFraction: float | None = Field(default=None, ge=0, le=1)
    objectId: str | None = None
    phase: str | None = None


class TaskSpec(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: Literal["pick_and_place", "motion_only"] = "motion_only"
    objectId: str | None = None
    destinationId: str | None = None


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    requestId: str
    robot: dict[str, Any]
    scene: SceneState
    trajectory: list[TrajectoryPoint] = Field(min_length=2, max_length=20_000)
    task: TaskSpec = Field(default_factory=TaskSpec)
    endEffectorRadiusMm: float = Field(default=34, gt=0, le=250)


class CollisionEvent(BaseModel):
    trajectoryIndex: int
    obstacleId: str
    phase: str | None = None
    point: Vec3Mm
    penetrationEstimateMm: float


class PhysicsEvent(BaseModel):
    type: str
    trajectoryIndex: int | None = None
    objectId: str | None = None
    destinationId: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class SimulationResponse(BaseModel):
    ok: bool
    requestId: str
    backend: str
    deterministic: bool
    collisions: list[CollisionEvent] = Field(default_factory=list)
    events: list[PhysicsEvent] = Field(default_factory=list)
    graspSuccess: bool | None = None
    finalObjectStates: list[SceneObject] = Field(default_factory=list)
    validatedTrajectory: list[TrajectoryPoint] = Field(default_factory=list)
    reason: str | None = None
    warnings: list[str] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)
