# LOGO ROBO SIM V2 — Codex handoff

## Current state

The repaired source has one live UR10 controller, one live BuildBoard, one revision clock, one runtime adapter, one perception service, and one WebMCP registrar.

NVIDIA Newton, the old physics HTTP service, the duplicate SCARA controller, the duplicate board adapter, and duplicate WebMCP registrars are removed.

## Read first

- `MASTER_PLAN.md`
- `FULL_REMEDIATION_PLAN_5_6_PRO.md`
- `README.md`
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

If the final challenge browser exposes native WebMCP, test real enumeration, tool execution, and cancellation there. Page-side registration tests are not a substitute.

Do not reintroduce Newton or a second state stack to satisfy that gate.
