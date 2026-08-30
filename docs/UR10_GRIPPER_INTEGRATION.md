# UR10 real-gripper integration

## Scope

This V3 checkpoint integrates the supplied animated real-gripper asset into the existing single-authority ROBO BRIDGE runtime. It does not introduce a second robot, a second IK stack, joint-level WebMCP commands, hardware control, ROS, Duet, or NVIDIA Newton.

## Authority

`RevisionClock -> BuildBoard + RobotController -> runtime -> WebMCP/UI/renderer` remains the only state path. `RobotController` owns tool yaw, jaw gap/state, held-brick identity, and the captured brick-in-TCP transform. The renderer consumes that state and never commits robot truth.

Public motion remains Cartesian XYZ. Tool yaw is selected internally and solved by the same full-pose IK path used by manual and WebMCP motion.

## Calibration lock

- Gripper GLB SHA-256: `e866760a7bd5ee91f4944d073b1d96db315786e51c540a0f97463f79ae62126e`
- GLB scale: `0.4`
- Open jaw gap: `46 mm`
- Contact jaw gap: `16 mm`
- Open animation frame: `23.025494813919067`
- Contact animation frame: `11.800022006034851`
- Gripper-root to contact point, source coordinates at runtime scale: `[-0.19481336268922256, 0, -164.04423236678767] mm`
- Three.js module SHA-256: `86bcee248b64f44bcfc23c331ae74619061957d59cab040171dcb6fb5900beb6`
- Three.js core SHA-256: `0e9dd2793e01d0d9eb4f2ab00b4ffcdd4488275ebebee5c31fa8d347bc29f0bf`
- Parameters JSON SHA-256: `95ba58464a8e5be8849fde16e1b1a40d8a253b1dcac1397f59f83ca7ec2b7838`
- Materials JSON SHA-256: `f4b54ba0b0d8920bc4bfa4ef312df4b77645a4c63c8002b8ace9c02933175c79`
- Settings JSON SHA-256: `3c6def19bef3942971e8f5daaa52417d6f9372f96f365ee41ff852b8985d6e21`

## Browser acceptance

The project server exposes `/health` and uses a bounded Windows-friendly connection backlog with persistent HTTP/1.1 for the ES-module graph. Browser acceptance must bypass any system proxy for `127.0.0.1`.

A local Edge run verified:

- HTTP 200;
- `REAL GLB READY`;
- no console or network errors;
- manual UI and runtime share one controller;
- a UI-driven red-brick pick, latch, move, release, and board snap;
- board progress `0/2 -> 1/2`;
- final TCP returned to `600/0/450 mm`;
- held state returned to `NONE`.

## Known boundary

The current arm geometry remains the project-owned procedural UR10 representation. The Oracle guidance's optional high-detail UR10 manufacturer mesh is not included in this bounded gripper checkpoint. Native signed-in WebMCP enumeration/execution remains an external acceptance gate when a supported browser context is available.