# LOGO ROBO

LOGO ROBO is an agent-native browser robotics workcell. A human and a WebMCP agent share one authoritative six-axis UR10-class robot, brick scene, controller, and accepted state. The current checkpoint is the Oracle 1 Cartesian manipulation vertical slice for the private repository `stefanGuiton/LOGO-ROBO-MCP`.

## Current checkpoint

The default browser page now demonstrates:

- procedural six-axis UR10-class geometry driven by published DH dimensions;
- fixed-down Cartesian TCP control with damped-least-squares IK, limits, continuity, and fail-closed motion;
- one generic unbranded 2x4 construction brick;
- measured latch, rigid carry, release, and board snap behaviour;
- a procedural workcell renderer with tray, board, TCP marker, camera presets, and frame timing;
- manual Cartesian controls and the same controller exposed through seven primitive WebMCP tools;
- structured robot/world revisions and browser-visible WebMCP lifecycle diagnostics;
- the retained SCARA/WebGL/Newton foundation for later challenge work.

This is a working integration checkpoint, not the finished image compiler, perception, Co-Build/Race, or submission package.

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
- `apps/web/index.html` and `apps/web/src/logo/main.js` — default Oracle 1 browser vertical slice.
- `apps/web/src/robot/controller.js` — authoritative UR10-class accepted state.
- `apps/web/src/robot/kinematics.js` — browser FK/IK authority.
- `apps/web/src/webmcp/register-logo-tools.js` — primitive WebMCP contract.
- `apps/web/src/core/` and `apps/web/src/webmcp/register-tools.js` — retained SCARA foundation path.
- `physics/newton-service/app/` — optional physics integration boundary.
- `docs/ORACLE_1_IMPORT_AUDIT.md` — source-by-source Oracle 1 integration decisions.
- `evidence/oracle1/` — current Oracle 1 qualification and reliability evidence.
- `evidence/foundation-verification.json` — generated full-project verification record.

## Safety and provenance

The project is simulation-only. No physical robot or Duet hardware command path is included. Generic bricks and procedural robot visuals are used; no LEGO branding, manufacturer mesh, or RepRapFirmware source is copied. See `PREEXISTING_WORK.md`, `THIRD_PARTY_NOTICES.md`, and `docs/ORACLE_1_IMPORT_AUDIT.md` for provenance boundaries.
