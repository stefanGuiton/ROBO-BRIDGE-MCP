# ROBO-SIM-MCP

An agent-native browser robotics workcell. Humans and WebMCP agents use the same SCARA controller, scene state, gripper, trajectories, and physics-validation protocol.

## Foundation status

This ZIP is a **working foundation**, not a finished challenge submission.

Implemented:

- procedural high-detail SCARA browser model using the locked `340.313 mm` and `249.960 mm` links;
- PBR metal materials, product-style lighting, shadows, workcell, bins, cubes, and obstacle;
- manual XY and Z end-effector manipulation;
- fail-closed analytic FK/IK with branch continuity and last-valid-pose behaviour;
- parallel-gripper state and animation;
- structured scene and robot state;
- path planning, preview, validation, and playback;
- nine WebMCP tools registered through `document.modelContext.registerTool()`;
- FastAPI physics protocol;
- deterministic collision, grasp, release, gravity-settlement, and final-state backend;
- bounded Newton/Warp rigid-body validation with a trajectory-driven gripper proxy;
- automated JavaScript, WebMCP-contract, and Python tests.

Not yet implemented or proven:

- final SCARA-SIM V8 visual extraction and pixel-level comparison;
- browser-to-Newton end-to-end acceptance and repeated-run variability measurement;
- hosted physics backend;
- WebMCP execution in ChatGPT's built-in browser;
- browser runtime testing in this build VM;
- production WebGPU renderer;
- challenge submission assets.

## Quick start on Windows

1. Extract the ZIP.
2. Run `SETUP_WINDOWS.bat`.
3. Run `START_WINDOWS.bat`.
4. Open `http://127.0.0.1:8769` if the browser does not open.

The browser loads Three.js from jsDelivr. Internet access is required for the first browser run unless Three.js is later vendored.

## Manual commands

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r physics/newton-service/requirements.txt
.venv/Scripts/python -m pip install -r physics/newton-service/requirements-dev.txt
.venv/Scripts/python scripts/verify.py
.venv/Scripts/python scripts/run_foundation.py
```

Newton is optional and intentionally separate from the baseline setup:

```powershell
.venv\Scripts\python.exe -m pip install --use-feature=truststore -r physics\newton-service\requirements-newton.txt
```

## Newton setup

Use the project Python 3.10-3.12 environment and follow Newton's current installation guide. The deterministic fallback remains the default; opt into the bounded Newton validator only after installation and thermal qualification:

```powershell
.venv\Scripts\python.exe scripts\check_newton.py
.venv\Scripts\python.exe scripts\run_foundation.py --physics-backend newton
```

## Important files

- `MASTER_PLAN.md` — complete project and challenge execution plan.
- `PREEXISTING_WORK.md` — provenance boundary for SCARA-SIM work.
- `apps/web/src/core/robot-controller.js` — shared human/agent robot state.
- `apps/web/src/webmcp/register-tools.js` — WebMCP tool definitions.
- `physics/newton-service/app/newton_backend.py` — Newton integration boundary.
- `physics/newton-service/app/fallback_backend.py` — tested foundation physics.
- `docs/PROTOCOL.md` — browser/physics contract.
- `docs/NEWTON_NEXT_TASK.md` — next bounded Newton implementation task.
- `evidence/foundation-verification.json` — generated verification record.

## Safety boundary

This project is simulation-only. It contains no Duet connection, no physical robot control, and no real-machine command path.
