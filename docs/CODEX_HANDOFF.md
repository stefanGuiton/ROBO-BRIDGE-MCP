# ROBO BRIDGE MCP V3 — Codex handoff

## Current state

The V3 source has one live UR10 controller, one live BuildBoard, one revision clock, one placement authority, one runtime adapter, one perception service, and one WebMCP registrar. The controller owns calibrated real-gripper jaw state, automatic tool yaw, and the captured brick-in-TCP transform; the light-mode Three.js renderer consumes that shared state. Read-only perception now includes hidden top/left/right inspection views and the human's current camera, with on-demand off-screen snapshots for Codex visual QA.

The current MAIN_DEMO also has reference-derived UR10 PBR/smooth-by-angle tuning, a deterministic reachable V8 supply, bounded scene and placement-preview tools, and a bounded logical placement stream that materializes at most five executable ghosts. The complete JavaScript suite is 137/137 and persistent reliability is 20/20 at this checkpoint.

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

`tests/js/placement-stream.test.js` is the stream acceptance suite. It covers 2,000 logical placements in bounded chunks, five-slot lookahead, paged read-only status, exact retry idempotency, duplicate conflicts, human adoption and incompatible occupancy, source reassignment/exhaustion/recovery, dependency reopening, stale-revision failure, abort cleanup, reset invalidation, overlapping execution rejection, and repeated deterministic mixed runs.

`scripts/reliability.mjs` keeps one production runtime, resets it between rounds, applies small deterministic human brick-position changes, and requires at least 19/20 full rounds.

## Remaining external release gate

Native WebMCP enumeration and real mutating tool execution passed in the Codex in-app browser on 2026-09-01. The browser enumerated all fourteen production-origin tools, planned ten logical placements in two five-placement chunks, kept the active queue at or below five, and completed all ten placements. A human UI placement was subsequently reconciled as `ADOPTED`; an incompatible colour request was `BLOCKED` with structured mismatch detail while the human brick remained in place. Source reassignment after moving the reserved source also passed.

Live reset invalidation passed after explicit approval: reset advanced the revision, restored all twelve bricks to free state, removed all placements, and made the prior stream return `stream_not_found`. Native production cancellation through `execute_next_placement` now passes with the optional `maxExecutionWallMs` deadline: the logical entry became terminal `CANCELLED`, the active queue emptied, and TCP/revision stayed stable across a delayed second read. Browser-host timeout and outer control-session interruption still do not forward cancellation to an active call, so callers requiring a hard bound must use the in-page deadline. See `docs/PLACEMENT_STREAM.md`.

Do not reintroduce Newton or a second state stack to satisfy that gate.
