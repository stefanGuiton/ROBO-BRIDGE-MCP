# ROBO BRIDGE MCP V3

ROBO BRIDGE MCP V3 is the post-audit, simulation-only browser robotics demo. A human and a WebMCP agent use the same UR10-class Cartesian controller, calibrated real-gripper state, brick state, board state, and world revision.

## What is included

- six-axis UR10-class FK/IK with fixed-down Cartesian control;
- automatic internal tool yaw with a calibrated full-pose IK target;
- the supplied real animated gripper GLB, JSON material overrides, and authoritative jaw/held-brick state;
- a project-local Three.js r185 light-mode workcell renderer;
- bounded TCP speed, acceleration, joint speed, and joint acceleration;
- cancellation, reset epochs, and serialized robot moves;
- conservative workcell, brick, link, and self-collision checks;
- one authoritative `BuildBoard` for occupancy, claims, correctness, and contributions;
- deterministic local image-to-Blueprint compiler;
- explicit Blueprint-to-live-machine transform;
- compiler-generated red/blue tray inventory;
- simulator-native bounded perception with actionable `recommendedTcp` coordinates;
- one nine-tool primitive WebMCP surface;
- production red/blue build tests and persistent reliability tests.

NVIDIA Newton and the old duplicate SCARA/physics runtime have been removed. ROBO BRIDGE does not claim rigid-body contact physics.

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
npm run test:reliability
python scripts\verify.py
```

`verify.py` is read-only by default. Use `--write-evidence` only when you explicitly want a generated verification record.

## Release ZIP

```powershell
python scripts\build_release.py
```

This creates `dist/ROBO_BRIDGE_MCP_V3.zip` with `RELEASE_MANIFEST.json` inside the archive.

## WebMCP

The current primitive tools are:

- `get_build_state`
- `get_robot_state`
- `get_workspace`
- `observe_camera`
- `move_tool`
- `latch`
- `unlatch`
- `claim_target`
- `reset_workcell`

Every mutation requires the exact latest `worldRevision`. WebMCP is progressive enhancement. The manual browser demo still works when `document.modelContext` is not available.

Page-side registration and the tool contract are tested locally. Native agent tool enumeration/call/cancel must still be checked in the final supported challenge browser when that capability is available; do not treat mocked registration as that external acceptance proof.

## Safety scope

The controller checks live state before each accepted motion sample. It includes tool/table, brick, board/tray, conservative moving-link/raised-workcell, and self-collision checks.

The high-detail UR10 V2 visual is articulated from the authoritative controller FK but is not an exact moving-link collision mesh against the table. The real gripper GLB is calibrated to the controller TCP, but do not claim exact moving-link/table collision fidelity.

No physical robot, ROS, Duet, or hardware command path is included.

See `FULL_REMEDIATION_PLAN_5_6_PRO.md` and `MASTER_PLAN.md`.
