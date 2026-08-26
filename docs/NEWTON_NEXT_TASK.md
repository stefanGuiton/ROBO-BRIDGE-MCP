# Next bounded Newton task

## Goal

Replace one deterministic fallback case with a real Newton rigid-body simulation while preserving the existing API.

## Scope

Implement only a cube pick-and-place test scene:

- one fixed table;
- one dynamic cube;
- one fixed bin;
- one fixed obstacle;
- one kinematic two-finger gripper proxy;
- trajectory-driven gripper pose;
- gravity, friction, collision, and release;
- final cube pose extraction.

Do not implement the complete SCARA articulation in the first Newton task. Drive a kinematic gripper proxy from the already validated SCARA trajectory. This proves the browser/Newton protocol and grasp physics with less risk.

## Acceptance criteria

- Newton and Warp import successfully on the target PC.
- `GET /health` reports Newton available.
- A known safe grasp lifts and places the cube.
- A wide or offset grasp fails.
- A low transfer collides with the obstacle.
- The API response schema is unchanged.
- Results are deterministic enough for repeated challenge demos, or variability is measured and bounded.
- Existing five physics tests remain green.
- At least three new Newton-only tests pass.

## Stop conditions

Stop and retain the deterministic backend when:

- Newton cannot install cleanly before the internal deadline;
- contact tuning remains unstable after three bounded attempts;
- GPU hosting cannot be made reliable;
- the integration changes the browser controller's accepted robot state.
