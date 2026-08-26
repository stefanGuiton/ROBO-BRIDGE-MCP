# Browser/physics protocol

## Coordinate frame

All request trajectory coordinates are in millimetres:

- machine `+X` → browser world `+X`;
- machine `+Y` → browser world `-Z`;
- machine `Z` → SCARA carriage height;
- browser carriage world height = `92 mm + machine Z`.

Scene-object `position.zMm` is the object centre above the table surface. The foundation physics service converts it to the machine-Z frame with the documented tool offset.

## Endpoints

- `GET /health` — backend, package, scene, and result-store status;
- `POST /v1/scene/sync` — synchronise the structured scene without moving the robot;
- `POST /v1/scene/reset` — clear the physics scene and stored results;
- `POST /v1/simulate/trajectory` — validate a complete candidate trajectory;
- `GET /v1/results/{requestId}` — retrieve a stored structured result.

## Trajectory simulation

`POST /v1/simulate/trajectory`

Request:

```json
{
  "requestId": "plan-123",
  "robot": {},
  "scene": { "revision": 0, "objects": [] },
  "trajectory": [
    { "xMm": 300, "yMm": 0, "zMm": 220, "phase": "start", "gripperOpenFraction": 1 }
  ],
  "task": {
    "type": "pick_and_place",
    "objectId": "red-cube-1",
    "destinationId": "red-bin"
  },
  "endEffectorRadiusMm": 34
}
```

Response fields:

- `ok`;
- `backend`;
- `deterministic`;
- `collisions`;
- `events`;
- `graspSuccess`;
- `finalObjectStates`;
- `validatedTrajectory`;
- `reason`;
- `warnings`;
- `metrics`.

## Source-of-truth rules

- SCARA joint and Cartesian state: browser `RobotController`.
- Scene semantic state: browser `SceneState`.
- Proposed trajectory: browser planner.
- Contact, collision, grasp, and object dynamics: physics backend.
- Visual playback: browser renderer.

Newton must return validation and object state. It must not silently change SCARA kinematics or invent a different accepted robot pose.
