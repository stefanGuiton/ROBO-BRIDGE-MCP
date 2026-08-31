# ROBO BRIDGE MCP V3 — Codex handoff

## Current state

The V3 source has one live UR10 controller, one live BuildBoard, one revision clock, one placement authority, one runtime adapter, one perception service, and one WebMCP registrar. The controller owns calibrated real-gripper jaw state, automatic tool yaw, and the captured brick-in-TCP transform; the light-mode Three.js renderer consumes that shared state. Read-only perception now includes hidden top/left/right inspection views and the human's current camera, with on-demand off-screen snapshots for Codex visual QA.

The current MAIN_DEMO also has reference-derived UR10 PBR/smooth-by-angle tuning, a deterministic reachable V8 supply, bounded scene and placement-preview tools, and a native Codex-built three-brick wall acceptance. The complete JavaScript suite is 109/109 and persistent reliability is 20/20 at this checkpoint.

NVIDIA Newton, the old physics HTTP service, the duplicate SCARA controller, the duplicate board adapter, and duplicate WebMCP registrars are removed.

## Read first

- `MASTER_PLAN.md`
- `FULL_REMEDIATION_PLAN_5_6_PRO.md`
- `README.md`
- `docs/UR10_GRIPPER_INTEGRATION.md`
- `apps/web/src/robot/controller.js`
- `apps/web/src/robot/collision.js`
- `apps/web/src/bricks/build-board.js`
- `apps/web/src/logo/runtime.js`
- `apps/web/src/webmcp/register-tools.js`
- `tests/helpers/live-harness.js`

## Verification

Run:

```powershell
python scripts\verify.py
```

Do not edit source until this baseline passes.

The important end-to-end test is `tests/js/production-round.test.js`. It compiles a red/blue Blueprint, uses the live machine transform and live inventory, then completes the round through production primitive tool handlers without importing a private grasp constant into the tool loop.

`scripts/reliability.mjs` keeps one production runtime, resets it between rounds, applies small deterministic human brick-position changes, and requires at least 19/20 full rounds.

## Remaining external release gate

Native WebMCP enumeration and real mutating tool execution passed in the Codex in-app browser on 2026-08-31. Native read-only observation also passed for tray, canvas, hidden top/left/right, and live user cameras while preserving the exact world revision. The Debug panel provides page-local raster previews without moving the human camera. Repeat native motion cancellation in the final challenge-browser submission session; page-side registration tests alone are not a substitute.

Do not reintroduce Newton or a second state stack to satisfy that gate.
