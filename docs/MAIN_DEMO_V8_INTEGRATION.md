# ROBO BRIDGE MCP — MAIN_DEMO Player V8 Integration

## Status

`MAIN_DEMO` is the canonical root player runtime for ROBO BRIDGE MCP. The Player V8 reference was adapted into the existing browser application; it is not embedded as an iframe and does not own a second robot, board, brick list, revision, renderer, or WebMCP registrar.

## Authority model

Accepted state follows one path:

`RevisionClock -> BuildBoard + RobotController -> Runtime -> Renderer / Perception / WebMCP`

Human player mutations go through `HumanBuildAdapter`, then `RobotController` and `BuildBoard`. Robot UI and WebMCP operations keep using the same `RobotController`. Player previews, camera movement, held-brick presentation, LUT changes, and derived connection-graph updates do not mutate accepted world state.

`TEST` mode cancels an active human carry and rejects new player construction edits. Production `structuralCollapseEnabled` is forcibly false even though the supplied reference settings recorded it as true.

## Integrated Player V8 behavior

- desktop WASD and sprint at one configurable fixed eye height, original V8 click-to-capture pointer-lock look, `Esc` release, wheel zoom, pick/place, and 90-degree brick rotation; Space/Ctrl vertical movement is intentionally disabled;
- coarse-pointer mobile look, directional controls, rotate, and pick/place;
- capsule collision against the worktable and robot-base exclusion volume;
- fixed 240 Hz player, held-brick, and loose-brick updates with bounded catch-up, independent of render cadence;
- held-brick gravity, full 3D angular inertia, gyroscopic torque, constrained-pendulum response, collision-aware lift, and placement assistance;
- released-brick gravity, linear/angular damping, full quaternion rotation, table restitution/friction/sleep, and brick OBB collision response;
- 8 mm mat snapping, blueprint-target snapping, L/M/R four-stud connector masks, connector occupancy, hysteresis, collision-blocked candidates, and derived `ConnectionGraph` diagnostics;
- BUILD/TEST editing modes;
- instanced placed-brick batches with ray-pick identity;
- ACES tone mapping and optional local 17/33/65 `.cube` LUT grading;
- all supplied primitive settings retained, with local persisted overrides restricted to known setting keys;
- the source V8 white 1750 × 690 × 1200 mm workbench, four legs, 640 × 480 mm stud mat, 80 × 60 instanced studs, red MORE BRICKS control, floor, materials, ACES exposure, and three-light rig;
- the source-style full-screen FPS/HUD/help/bottom-toolbar shell, with all robot actions and 231 live settings moved into the slide-out Settings panel;
- four live robot-mount controls (`X`, `Y`, `Z`, and yaw) that transform the one renderer machine frame without changing controller-space truth;
- an eight-brick deterministic red/blue production round that remains inside the one authoritative tray/board/controller state;
- exact existing UR10 V2 visual and calibrated real-gripper GLB preserved.
- the tuned UR10 material lab and 15° smooth-by-angle normal pipeline, including welded seams, hard-edge preservation, degenerate-face cleanup, corner weighting, and a shared worker;
- deterministic reachable supply slots in the visible V8 pile, with actionable pickup/approach/lift TCPs exposed through structured scene state;
- performance-safe shadow throttling, one brick snapshot per rendered frame, stable placed-batch signatures, and frame/draw diagnostics.

## Deliberate adaptations

The reference demo's table, mat, floor, materials, lighting, camera composition, HUD, and settings surface are mapped into the browser as a display-world layer. The existing canonical millimetre machine frame is mounted on that table through one `AUTHORITATIVE_UR10_MACHINE_FRAME` transform. UR10 links, real gripper, bricks, target ghosts, placed-brick batches, ray hits, and player placement coordinates all pass through that same transform. The reference demo's standalone brick truth was not copied.

Display-only geometry/material/mount changes do not advance the authoritative world revision. `get_scene_state` exposes the current machine-to-display transform and display-table dimensions so structured and visible coordinates can be reconciled explicitly.

The Player V8 physics is bounded to interactive bricks and placement intent. Every accepted free-body pose is committed through the authoritative `RobotController` and shared world revision; the renderer does not own hidden brick truth. This remains a browser demo solver, not a claim of calibrated general-purpose rigid-body physics. BUILD mode never structurally collapses.

## Source provenance

- Player V8 HTML SHA-256: `1a9e333dde43a9b223bca47c586e32b5a276f3faf90c6140f2c764a36b947bb9`
- Oracle default settings SHA-256: `10ed9e86601f5daab465d0eb7a966907b4841a1618fb31a207d3a7945a6deccb`
- supplied settings SHA-256: `3e9a58a4b23b96d4ce98a1cd77b8c123ebf14270c1806016da49620713cbc9b9`
- source test report SHA-256: `0f78b4d37a17c67a449165a370231b6289f4af778f37eba8306e90885229e632`

The large self-contained Oracle HTML and local download/archive folders are reference inputs and are intentionally excluded from Git and release archives.
The supplied settings path is marked `-text` in `.gitattributes` so fresh clones retain its exact LF byte representation; the provenance test also tolerates a legacy worktree that was populated before that attribute existed.

## WebMCP boundary

The eleven production tools remain primitive and Cartesian-only. `get_scene_state` exposes bounded authoritative inventory, while `preview_placement` validates mat/target/stud intent and returns exact approach/required/retreat TCPs without mutating the world. No joint command or high-level build/playback shortcut was added.

`observe_camera` supports the deterministic `tray_camera`, `canvas_camera`, hidden `top_camera`, `left_camera`, and `right_camera`, plus `user_camera`. The human view is converted from the renderer back into the shared machine frame before projection. All observations are read-only and preserve `worldRevision`.

For local visual QA, `window.__LOGO_ROBO__.actions.captureCamera(cameraId)` renders any of those six views to an off-screen JPEG. It does not move the visible camera, register another WebMCP surface, or mutate simulator state.

On 2026-08-31, the Codex in-app browser natively enumerated all eleven tools. Codex then used only `get_scene_state`, `get_robot_state`, `get_workspace`, `preview_placement`, `move_tool`, `latch`, and `unlatch` to select three reported-reachable bricks and build a real interlocked wall in the visible live scene. The final top brick matched five studs across two base-brick support connections. The robot finished empty-handed at safe height; browser state reached monotonic world revision 1239 with no console warnings/errors. Native cancellation forwarding remains covered by the automated suite and should be repeated in the final submission session.

Evidence: `evidence/browser/main-demo-v8-native-webmcp-wall.md`, `evidence/browser/main-demo-v8-native-webmcp-wall.png`, and `evidence/browser/main-demo-multicamera-acceptance.md`.

## Verification commands

```powershell
npm run test:player
npm run test:js
npm run test:reliability
python scripts\verify.py
python scripts\build_release.py
```

The five V3 parallel prototypes retain their own package-level tests and builds. They are verified repository work, but they do not become authoritative `MAIN_DEMO` runtime state until a bounded adapter integration is completed.
