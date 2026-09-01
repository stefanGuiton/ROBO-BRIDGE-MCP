# ROBO BRIDGE MCP · MAIN_DEMO Player V8

`MAIN_DEMO` is the root player runtime for ROBO BRIDGE MCP V3. It integrates the supplied LOGO ROBO Player V8 controls and settings into the post-audit shared-state browser simulator. A human and a WebMCP agent use the same UR10-class Cartesian controller, calibrated real-gripper state, brick state, `BuildBoard`, and monotonic world revision.

## What is included

- six-axis UR10-class FK/IK with fixed-down Cartesian control;
- automatic internal tool yaw with a calibrated full-pose IK target;
- the supplied real animated gripper GLB, JSON material overrides, and authoritative jaw/held-brick state;
- a project-local Three.js r185 light-mode workcell renderer;
- the exact V8 workbench geometry, 80 × 60 stud mat, MORE BRICKS button, floor, materials, lighting, and minimal full-screen HUD;
- a slide-out panel containing all 231 source settings, all robot actions, and live UR10 mount X/Y/Z/yaw controls;
- desktop and mobile first-person player controls with capsule/workcell collision;
- V8 held-brick spring/pendulum physics plus free-drop gravity, 3D angular motion, restitution, friction, sleep, and brick OBB contacts;
- L/M/R brick connectors, 8 mm mat snapping, target snapping, and collision-blocked previews;
- explicit BUILD and TEST-lock modes, with production structural collapse disabled;
- 240 Hz fixed-step player, held-brick, and loose-brick updates independent of render cadence;
- ACES rendering, optional local 17/33/65 `.cube` LUT grading, and placed-brick batching;
- reference-derived UR10 smooth-by-angle normals (15° / 0.002 mm weld / corner weighting) rebuilt off the render thread, plus live PBR controls for every UR10 material family, the real gripper, table, mat, floor, and bricks;
- a V8-table workcell profile with deterministic reachable brick inventory and red/blue availability guarantees;
- bounded TCP speed, acceleration, joint speed, and joint acceleration;
- cancellation, reset epochs, and serialized robot moves;
- conservative workcell, brick, link, and self-collision checks;
- one authoritative `BuildBoard` for occupancy, claims, correctness, and contributions;
- deterministic local image-to-Blueprint compiler;
- explicit Blueprint-to-live-machine transform;
- compiler-generated red/blue tray inventory;
- an eight-brick deterministic red/blue MAIN_DEMO round;
- simulator-native bounded perception with actionable `recommendedTcp` coordinates;
- one fourteen-tool primitive WebMCP surface, including bounded scene reads, read-only placement preview, and bounded logical placement streaming;
- production red/blue build tests and persistent reliability tests.

NVIDIA Newton and the old duplicate SCARA/physics service have been removed. The browser includes the bounded Player V8 brick solver described above; it is not a general-purpose or calibrated industrial physics engine.

## MAIN_DEMO controls

- `WASD`: move; `Shift`: sprint; `Space` / `Ctrl`: vertical movement.
- Mouse: click the scene once to capture the pointer, then look freely without holding a button. Press `Esc` to release the pointer and use the UI. Wheel: zoom.
- Centre click: pick or place; `R`: rotate the held brick by 90 degrees.
- `PLAYER` / `ORBIT`: switch between player navigation and inspection camera.
- `BUILD` / `TEST LOCK`: allow or reject player construction edits.
- Mobile: on-screen movement, rotate, and pick/place controls when coarse-pointer mode is active.

The Oracle HTML is provenance reference material, not a second embedded runtime. `MAIN_DEMO` adapts its controls, deterministic fixed-step model, placement semantics, supplied settings, and grading features to the existing canonical UR10 machine frame and shared authority. It does not load the reference page in an iframe or create a duplicate world.

## Start

Windows:

```powershell
SETUP_WINDOWS.bat
START_WINDOWS.bat
```

Or:

```powershell
python scripts\verify.py
python scripts\run_foundation.py
```

Open `http://127.0.0.1:8769/`.

Compiler lab: `http://127.0.0.1:8769/compiler.html`

## Tests

```powershell
npm run test:js
npm run test:robot
npm run test:webmcp
npm run test:compiler
npm run test:player
npm run test:reliability
python scripts\verify.py
```

`verify.py` is read-only by default. Use `--write-evidence` only when you explicitly want a generated verification record.

## Release ZIP

```powershell
python scripts\build_release.py
```

This creates `dist/ROBO_BRIDGE_MCP_MAIN_DEMO.zip` with `RELEASE_MANIFEST.json` inside the archive.

## WebMCP

The current primitive tools are:

- `get_scene_state`
- `get_build_state`
- `get_robot_state`
- `get_workspace`
- `observe_camera` (`tray`, `canvas`, hidden `top`/`left`/`right`, or the human's current view)
- `preview_placement`
- `get_placement_stream_status`
- `plan_placement_queue`
- `execute_next_placement`
- `move_tool`
- `latch`
- `unlatch`
- `claim_target`
- `reset_workcell`

Every mutation requires the exact latest `worldRevision`. WebMCP is progressive enhancement. The manual browser demo still works when `document.modelContext` is not available.

Placement streams accept stable `placementId` values in `replace` or `append` chunks of at most 50 placements, with a logical-stream ceiling of 5,000. At most five proposals are materialized as active ghosts at once. Status is paged in bounded groups of at most 50 and reports deterministic lifecycle states including `PLANNED`, `COMPLETED`, `ADOPTED`, `BLOCKED`, `WAITING_SOURCE`, `WAITING_DEPENDENCY`, and `CANCELLED`. Exact append retries are idempotent; reuse of a placement ID with different content is rejected.

Plans may request a simulator `cycleTimeMs` (250-60,000 ms). **RUN PLANNED CYCLE** in the page UI consumes the already validated Cartesian stream locally, avoiding browser-host thinking gaps while keeping the WebMCP surface primitive. The default showcase cadence is one second per brick and remains accelerated simulation, not a one-second physical-robot claim.

Page-side registration and the tool contract are tested locally. On 2026-09-01, the Codex in-app browser natively enumerated all fourteen production-origin tools, planned a ten-placement stream in two chunks, and completed all ten placements through `execute_next_placement`. The same session verified UI-created human occupancy reconciliation as `ADOPTED`, structured incompatible-colour blocking without moving the human brick, source reassignment after a human moved a reserved brick, and live reset invalidation of the active stream. Native production cancellation also passed using the optional `maxExecutionWallMs` deadline: the placement became terminal `CANCELLED`, the active queue emptied, and TCP/revision remained stable during the late-sample check. Browser-host timeout or control-session interruption still does not propagate an abort into an active call; callers that require a hard bound must provide `maxExecutionWallMs`.

See `docs/PLACEMENT_STREAM.md` for the stream contract, verification coverage, timing categories, and current native acceptance boundary.

For the deterministic red-brick, 3-by-4 wall, and five-layer cross-laminated tower demonstrations, open the demo with `?showcase=robot-basics` and see `docs/SIMPLE_STRUCTURE_SHOWCASE.md`. Codex expands these requests into explicit Cartesian placement streams; the production WebMCP surface remains primitive and contains no instant-build tool.

## Safety scope

The controller checks live state before each accepted motion sample. It includes tool/table, brick, board/tray, conservative moving-link/raised-workcell, and self-collision checks.

The high-detail UR10 V2 visual is articulated from the authoritative controller FK but is not an exact moving-link collision mesh against the table. The real gripper GLB is calibrated to the controller TCP, but do not claim exact moving-link/table collision fidelity.

No physical robot, ROS, Duet, or hardware command path is included.

See `docs/MAIN_DEMO_V8_INTEGRATION.md`, `FULL_REMEDIATION_PLAN_5_6_PRO.md`, and `MASTER_PLAN.md`.
