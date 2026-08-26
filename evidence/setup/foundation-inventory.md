# Foundation inventory

Date: 2026-08-26

## Transfer identity

- Working project: `D:\ROBO-SIM-MCP`.
- Verified source snapshot: `D:\ROBO-SIM-MCP\ROBO-SIM-MCP-foundation-v0.1.0\ROBO-SIM-MCP`.
- The source snapshot matched all 49 entries in `evidence/release-manifest.json`; zero files were missing or hash-mismatched before promotion.
- The source ZIP and extracted source snapshot remain preserved.
- The supplied project has no Git metadata. `D:\ROBO-SIM-MCP` was not a Git repository at the start of this pass.

## Already implemented

- Analytic two-link SCARA FK/IK with branch selection, joint limits, radial/Z workspace checks, and structured rejection.
- One revisioned `RobotController` used by browser actions and WebMCP actions.
- Last-valid-pose behaviour for rejected Cartesian and joint requests.
- Isolated trajectory preview and revision-checked execution.
- Revisioned semantic `SceneState` with red/blue cubes, red/blue bins, and a yellow obstacle.
- Procedural Three.js SCARA, gripper, workcell, camera controls, XY/Z pointer manipulation, trajectory rendering, quality modes, and UI.
- Nine tools registered through `document.modelContext.registerTool()` with JSON Schema inputs and structured results.
- FastAPI health, scene reset/synchronisation, trajectory simulation, and result endpoints.
- A deterministic fallback backend covering conservative obstacle collision, grasp proximity, attachment, release, settlement, and final object state.
- JavaScript, WebMCP-contract, Python API, and fallback-physics tests plus syntax/compile verification.

## Placeholders or provisional components

- `NewtonBackend` is an integration boundary. It reports unavailable until Newton/Warp import and does not yet perform rigid-body simulation.
- The deterministic backend is a tested fallback, not real Newton contact physics.
- Three.js `0.185.0` is loaded from jsDelivr; it is pinned but not yet project-local.
- SCARA geometry/materials are a clean foundation implementation, not a pinned V8 extraction or pixel-parity result.
- WebMCP diagnostics are limited to availability/status and normal operation logging; real agent-side discovery/execution remains to be proven.

## Untested at transfer time

- Browser rendering and direct manipulation on this PC.
- Runtime agreement between visible state and structured debug state.
- Real WebMCP discovery/execution in a supported signed-in browser surface.
- Newton/Warp import, GPU backend, and official example.
- Browser-to-Newton trajectory simulation.
- Repeated end-to-end pick-and-place reliability.

## Missing for final acceptance

- A project-local installed environment and reproducible setup evidence.
- Browser screenshots, console logs, timing evidence, and interaction acceptance.
- A provenance-pinned SCARA import audit and any approved adaptations.
- Real Newton rigid-body collision/grasp/drop/place implementation and Newton-only tests.
- Browser-visible WebMCP execution lifecycle diagnostics.
- Final end-to-end acceptance and refreshed handoff/status evidence.

## Dependency boundaries

- SCARA-SIM dependency: dimensions, interaction patterns, fail-closed semantics, visual/material/camera research, and renderer seams are reference inputs only. ROBO-SIM-MCP currently contains its own clean implementation.
- Newton dependency: only the physics-service backend and real manipulation-physics milestone depend on Newton. Browser kinematics, scene state, rendering, WebMCP contracts, and deterministic fallback do not.

