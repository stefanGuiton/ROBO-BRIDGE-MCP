# Codex handoff

## Current state

The repository is now the LOGO ROBO Oracle 3 perception/WebMCP integration checkpoint. The remote repository is `stefanGuiton/LOGO-ROBO-MCP`; the local checkout remains `D:\ROBO-SIM-MCP`. The default page is the UR10-class Cartesian manipulation vertical slice with the six-tool Oracle 3 surface bound to the same controller, the standalone compiler lab is available at `/compiler.html`, the perception qualification page is available at `/oracle3.html`, and the earlier SCARA/WebGL/Newton foundation remains retained for later adaptation.

Oracle 1 was reviewed from the local package under `downloads from oracle`. Its adapted runtime now provides:

- published UR10 DH-based FK/IK with fixed-down TCP orientation;
- bounded workspace, joint limits, branch continuity, speed cap, interpolation, cancellation, and fail-closed accepted state;
- generic 2x4 brick capture, rigid carry, release, and board snap;
- manual Cartesian controls and a hard-coded complete pick/place demonstration;
- retained Oracle 1 compatibility tools: `get_scene_state`, `get_robot_state`, `get_workspace`, `move_tool`, `latch`, `unlatch`, and `reset_workcell`;
- active Oracle 3 tools: `get_build_state`, `observe_camera`, `move_tool`, `latch`, `unlatch`, and `claim_target`;
- browser-visible tool lifecycle diagnostics;
- simulator-native perception snapshots, camera projection, approximate occlusion, and stale-coordinate recovery;
- an explicit production adapter at `apps/web/src/logo/runtime.js` that maps the Oracle 3 bridge to the existing UR10 controller and board state;
- deterministic OKLab image-to-Blueprint compilation with alpha-aware coverage, stable target IDs, seeded inventory, BuildBoard occupancy, Co-Build, Race, and deterministic scoring;
- a local compiler lab and compiler/game verification scripts under `evidence/oracle2/`;
- current qualification evidence under `evidence/oracle1/`.

No physical robot, Duet, ROS system, or `D:\SCARA-Simulator` checkout was contacted or modified.

## Verified integration evidence

- Oracle 1 kinematics/controller/latch/reliability/WebMCP focused tests pass.
- Oracle 2 compiler/inventory/board/game focused tests pass: 27/27 test cases across five modules.
- Oracle 2 randomized invariants pass: 1,000/1,000 fixed-seed cases.
- Oracle 2 manual compiler/game flow passes and reproduces the same Blueprint and inventory from the same seed.
- Oracle 3 focused suite passes: 23/23 assertions, including the production adapter loop.
- Oracle 3 fixture reliability passes: 50/50 primitive loops, with structured stale-state, failed-latch, collision, and occupied-target recovery cases.
- Fresh browser acceptance passes on the main page: six tools discovered, shared pick/place completes at `target-white-001`, invalid XYZ is rejected without changing the TCP, and no console warnings/errors were observed.
- Fresh browser acceptance passes on `/oracle3.html`: two camera views render 7 tray detections and 4 canvas detections for the placed scenario, with no console warnings/errors.
- Full project verification now records 86/86 JavaScript assertions, 6 Python physics tests, 46 JavaScript syntax checks, and 15 Python compilation checks.
- Workspace qualification: 1,000/1,000 samples pass.
- Reliability qualification: 50/50 complete pick/place trials pass.
- Maximum local planning segment: approximately 292 ms in the latest dependency-free benchmark (an earlier run measured approximately 186 ms).
- Full project verification is run through `scripts/verify.py`, including the retained foundation suites.

The managed Windows environment may reject Node’s worker-based test runner with `spawn EPERM`; the verification script records and uses a direct-module fallback so assertions still execute.

## Retained foundation and Newton boundary

The previous SCARA foundation remains available in `apps/web/src/core/`, `apps/web/src/render/scene.js`, `apps/web/src/ui/`, and `apps/web/src/webmcp/register-tools.js`. It retains the PBR Three.js workcell, bins, cubes, obstacle, gripper, and deterministic/Newton physics service. It is not silently mixed into the new UR10 kinematics authority.

Newton remains an optional explicit physics backend. It must validate bounded manipulation physics through the service and must not duplicate or replace the browser controller’s accepted UR10 state.

## Remaining bounded work

1. Bridge compiler-generated Blueprint targets and inventory to the authoritative Oracle 1 controller and board adapter.
2. Add compiler-generated boards and simulator-native observation/overlay data to the browser state.
3. Add the red/blue multi-brick scenario and expose the validated build state through WebMCP.
4. Run native WebMCP tool-selection/call acceptance in a supported secure browser backend.
5. Run browser-to-Newton trajectory validation and revisit premium Three.js UR10 rendering.

## Commands

```powershell
.venv\Scripts\python.exe scripts\verify.py
.venv\Scripts\python.exe scripts\run_foundation.py
npm run test:oracle1
npm run test:oracle2
npm run test:oracle3
npm run test:logo
```

Newton remains opt-in:

```powershell
.venv\Scripts\python.exe scripts\run_foundation.py --physics-backend newton
```
