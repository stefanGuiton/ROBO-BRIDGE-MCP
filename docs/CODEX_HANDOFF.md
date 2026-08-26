# Codex handoff

## Current state

ROBO-SIM-MCP foundation v0.1.0 is built.

Verified in the build VM:

- 12 JavaScript and WebMCP-contract tests pass;
- 5 Python physics/API tests pass;
- 11 browser JavaScript files pass syntax checks;
- 12 Python files compile;
- physics health endpoint works;
- static web server returns the app HTML.

Not verified:

- Three.js browser rendering;
- WebMCP in Chrome/ChatGPT;
- Newton/Warp runtime;
- private SCARA-SIM file-by-file visual comparison.

## First target-PC commands

```bat
SETUP_WINDOWS.bat
START_WINDOWS.bat
```

Then open:

- web: `http://127.0.0.1:8769`
- physics health: `http://127.0.0.1:8001/health`

## First Codex task

Read:

- `MASTER_PLAN.md`
- `AGENTS.md`
- `evidence/FOUNDATION_STATUS.md`
- `docs/SCARA_SIM_ADAPTATION_MATRIX.md`
- `docs/NEWTON_NEXT_TASK.md`

Then perform only P1 target-PC qualification.

Do not start Newton work until the browser qualification passes.

## Recommended Codex prompt

```text
Review and qualify the local ROBO-SIM-MCP foundation. Read MASTER_PLAN.md,
AGENTS.md, evidence/FOUNDATION_STATUS.md, and docs/SCARA_SIM_ADAPTATION_MATRIX.md.

First run the existing verification without editing code. Then start the web and
physics services and test the real browser on this PC. Verify scene boot, manual
XY drag, Shift/vertical Z drag, gripper controls, red plan, physics validation,
execution, reset, console output, and frame rate. Capture fixed screenshots and
record exact observed results.

Also inspect the private SCARA-SIM checkout at the exact pinned branch/commit,
but do not copy files yet. Produce a ranked visual/control adaptation report and
update provenance evidence. Do not install Newton, do not create a public repo,
do not push, and do not change architecture during this task.

Give a PASS / CHANGES REQUIRED verdict for P1 browser qualification.
```
