# LOGO ROBO

LOGO ROBO is an agent-native browser robotics workcell. A human and a WebMCP agent share one authoritative six-axis UR10-class robot, brick scene, controller, perception layer, and accepted state. The current checkpoint combines the Oracle 1 Cartesian manipulation vertical slice, the Oracle 2 deterministic compiler/game foundation, and the Oracle 3 simulator-native perception/WebMCP integration for the private repository `stefanGuiton/LOGO-ROBO-MCP`.

## Current checkpoint

The default browser page now demonstrates:

- procedural six-axis UR10-class geometry driven by published DH dimensions;
- fixed-down Cartesian TCP control with damped-least-squares IK, limits, continuity, and fail-closed motion;
- one generic unbranded 2x4 construction brick;
- measured latch, rigid carry, release, and board snap behaviour;
- a procedural workcell renderer with tray, board, TCP marker, camera presets, and frame timing;
- manual Cartesian controls and the same controller exposed through six primitive perception/manipulation WebMCP tools;
- structured robot/world revisions and browser-visible WebMCP lifecycle diagnostics;
- simulator-native camera observations with bounded pixel boxes, world poses, approximate occlusion, stale-observation recovery, and agent activity phases;
- deterministic local image-to-Blueprint compilation with OKLab palette matching, alpha-aware coverage, stable target IDs, seeded inventory spawning, and invariant validation;
- standalone compiler lab at `http://127.0.0.1:8769/compiler.html` plus tested Co-Build and Race state models;
- the retained SCARA/WebGL/Newton foundation for later challenge work.

This is a working integration checkpoint, not the finished compiler-to-multi-brick robot bridge, Newton-authoritative browser loop, or submission package. The Oracle 3 default primitive surface is connected to the single-target Oracle 1 vertical slice; generated multi-brick rounds remain the next bounded task.

## Quick start on Windows

From `D:\ROBO-SIM-MCP`:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r physics\newton-service\requirements.txt
.venv\Scripts\python.exe -m pip install -r physics\newton-service\requirements-dev.txt
.venv\Scripts\python.exe scripts\verify.py
.venv\Scripts\python.exe scripts\run_foundation.py
```

Open [http://127.0.0.1:8769](http://127.0.0.1:8769) if the browser does not open automatically. The default browser path has no Node dependency installation; the retained SCARA page still uses its existing Three.js import map from jsDelivr.

Useful JavaScript commands:

```powershell
npm run test:js
npm run test:oracle1
npm run test:oracle2
npm run test:oracle3
npm run test:logo
npm run manual:logo
npm run qualify:oracle1
npm run reliability:oracle1
npm run performance:oracle1
```

## Newton boundary

Newton is optional and intentionally separate from the browser baseline. It validates bounded manipulation physics through the existing HTTP service; it does not replace the browser’s UR10 kinematics or accepted robot state.

```powershell
.venv\Scripts\python.exe -m pip install --use-feature=truststore -r physics\newton-service\requirements-newton.txt
.venv\Scripts\python.exe scripts\check_newton.py
.venv\Scripts\python.exe scripts\run_foundation.py --physics-backend newton
```

Do not use this project to connect to a physical robot, Duet, or ROS system.

## Important files

- `MASTER_PLAN.md` — authoritative LOGO ROBO challenge plan.
- `apps/web/index.html` and `apps/web/src/logo/main.js` — default UR10 browser vertical slice with the Oracle 3 runtime adapter.
- `apps/web/src/robot/controller.js` — authoritative UR10-class accepted state.
- `apps/web/src/robot/kinematics.js` — browser FK/IK authority.
- `apps/web/src/webmcp/register-oracle3-tools.js` — active six-tool Oracle 3 WebMCP contract.
- `apps/web/src/webmcp/register-logo-tools.js` — retained Oracle 1 seven-tool compatibility contract.
- `apps/web/src/perception/` — structured camera projection, visibility, and observation snapshots.
- `apps/web/src/logo/runtime.js` — adapter from Oracle 3's narrow runtime contract to the authoritative UR10 controller and board.
- `apps/web/oracle3.html` — deterministic perception/recovery qualification page.
- `apps/web/src/logo/compiler.js` and `apps/web/src/logo/compiler-debug.js` — Oracle 2 deterministic compiler and local lab.
- `apps/web/src/bricks/build-board.js` and `apps/web/src/game/` — compiler target state, Co-Build, Race, and scoring models.
- `apps/web/src/core/` and `apps/web/src/webmcp/register-tools.js` — retained SCARA foundation path.
- `physics/newton-service/app/` — optional physics integration boundary.
- `docs/ORACLE_1_IMPORT_AUDIT.md` — source-by-source Oracle 1 integration decisions.
- `docs/ORACLE_2_IMPORT_AUDIT.md` — source-by-source Oracle 2 compiler/game integration decisions.
- `docs/ORACLE_3_IMPORT_AUDIT.md` — source-by-source Oracle 3 perception/WebMCP integration decisions.
- `evidence/oracle1/` — current Oracle 1 qualification and reliability evidence.
- `evidence/oracle2/` — current Oracle 2 compiler/game evidence.
- `evidence/oracle3/` — current Oracle 3 perception, recovery, browser, and performance evidence.
- `evidence/foundation-verification.json` — generated full-project verification record.

## Safety and provenance

The project is simulation-only. No physical robot or Duet hardware command path is included. Generic bricks and procedural robot visuals are used; no LEGO branding, manufacturer mesh, or RepRapFirmware source is copied. See `PREEXISTING_WORK.md`, `THIRD_PARTY_NOTICES.md`, and the Oracle import audits for provenance boundaries.
