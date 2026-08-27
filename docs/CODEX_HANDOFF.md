# Codex handoff

## Current state

The repository is now the LOGO ROBO Oracle 2 compiler/game integration checkpoint. The remote repository is `stefanGuiton/LOGO-ROBO-MCP`; the local checkout remains `D:\ROBO-SIM-MCP`. The default page is the UR10-class Cartesian manipulation vertical slice, the standalone compiler lab is available at `/compiler.html`, and the earlier SCARA/WebGL/Newton foundation remains retained for later adaptation.

Oracle 1 was reviewed from the local package under `downloads from oracle`. Its adapted runtime now provides:

- published UR10 DH-based FK/IK with fixed-down TCP orientation;
- bounded workspace, joint limits, branch continuity, speed cap, interpolation, cancellation, and fail-closed accepted state;
- generic 2x4 brick capture, rigid carry, release, and board snap;
- manual Cartesian controls and a hard-coded complete pick/place demonstration;
- primitive WebMCP tools: `get_scene_state`, `get_robot_state`, `get_workspace`, `move_tool`, `latch`, `unlatch`, and `reset_workcell`;
- browser-visible tool lifecycle diagnostics;
- deterministic OKLab image-to-Blueprint compilation with alpha-aware coverage, stable target IDs, seeded inventory, BuildBoard occupancy, Co-Build, Race, and deterministic scoring;
- a local compiler lab and compiler/game verification scripts under `evidence/oracle2/`;
- current qualification evidence under `evidence/oracle1/`.

No physical robot, Duet, ROS system, or `D:\SCARA-Simulator` checkout was contacted or modified.

## Verified integration evidence

- Oracle 1 kinematics/controller/latch/reliability/WebMCP focused tests pass.
- Oracle 2 compiler/inventory/board/game focused tests pass: 27/27 test cases across five modules.
- Oracle 2 randomized invariants pass: 1,000/1,000 fixed-seed cases.
- Oracle 2 manual compiler/game flow passes and reproduces the same Blueprint and inventory from the same seed.
- Workspace qualification: 1,000/1,000 samples pass.
- Reliability qualification: 50/50 complete pick/place trials pass.
- Maximum local planning segment: approximately 292 ms in the latest dependency-free benchmark (an earlier run measured approximately 186 ms).
- Full project verification is run through `scripts/verify.py`, including the retained foundation suites.

The managed Windows environment may reject Node’s worker-based test runner with `spawn EPERM`; the verification script records and uses a direct-module fallback so assertions still execute.

## Retained foundation and Newton boundary

The previous SCARA foundation remains available in `apps/web/src/core/`, `apps/web/src/render/scene.js`, `apps/web/src/ui/`, and `apps/web/src/webmcp/register-tools.js`. It retains the PBR Three.js workcell, bins, cubes, obstacle, gripper, and deterministic/Newton physics service. It is not silently mixed into the new UR10 kinematics authority.

Newton remains an optional explicit physics backend. It must validate bounded manipulation physics through the service and must not duplicate or replace the browser controller’s accepted UR10 state.

## Remaining bounded work

1. Run the full combined verification after this checkpoint and preserve its JSON evidence.
2. Run a fresh browser acceptance pass against the new default page, including manual movement, invalid-motion rejection, latch/release, and the UI state readback.
3. Bridge compiler-generated Blueprint targets and inventory to the authoritative Oracle 1 controller and board adapter.
4. Add compiler-generated boards and simulator-native observation/overlay data to the browser state.
5. Add the red/blue multi-brick scenario and expose the validated build state through WebMCP.
6. Run live WebMCP acceptance in a supported secure browser context, then revisit premium Three.js UR10 rendering.

## Commands

```powershell
.venv\Scripts\python.exe scripts\verify.py
.venv\Scripts\python.exe scripts\run_foundation.py
npm run test:oracle1
npm run test:oracle2
npm run test:logo
```

Newton remains opt-in:

```powershell
.venv\Scripts\python.exe scripts\run_foundation.py --physics-backend newton
```
