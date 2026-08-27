# Codex handoff

## Current state

The repository is now the LOGO ROBO Oracle 1 integration checkpoint. The remote repository is `stefanGuiton/LOGO-ROBO-MCP`; the local checkout remains `D:\ROBO-SIM-MCP`. The default page is the UR10-class Cartesian manipulation vertical slice, while the earlier SCARA/WebGL/Newton foundation remains retained for later adaptation.

Oracle 1 was reviewed from the local package under `downloads from oracle`. Its adapted runtime now provides:

- published UR10 DH-based FK/IK with fixed-down TCP orientation;
- bounded workspace, joint limits, branch continuity, speed cap, interpolation, cancellation, and fail-closed accepted state;
- generic 2x4 brick capture, rigid carry, release, and board snap;
- manual Cartesian controls and a hard-coded complete pick/place demonstration;
- primitive WebMCP tools: `get_scene_state`, `get_robot_state`, `get_workspace`, `move_tool`, `latch`, `unlatch`, and `reset_workcell`;
- browser-visible tool lifecycle diagnostics;
- current qualification evidence under `evidence/oracle1/`.

No physical robot, Duet, ROS system, or `D:\SCARA-Simulator` checkout was contacted or modified.

## Verified integration evidence

- Oracle 1 kinematics/controller/latch/reliability/WebMCP focused tests pass.
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
3. Add compiler-generated boards and simulator-native observation/overlay data.
4. Add the red/blue multi-brick scenario and Co-Build/Race state.
5. Run live WebMCP acceptance in a supported secure browser context.
6. Revisit premium Three.js UR10 rendering only after the manipulation contract remains stable.

## Commands

```powershell
.venv\Scripts\python.exe scripts\verify.py
.venv\Scripts\python.exe scripts\run_foundation.py
npm run test:oracle1
```

Newton remains opt-in:

```powershell
.venv\Scripts\python.exe scripts\run_foundation.py --physics-backend newton
```
