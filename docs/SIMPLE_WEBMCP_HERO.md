# SIMPLE WebMCP hero — current release truth

Updated: 2026-09-03

## Active launch-readiness update (Level 1 acceptance in progress)

This section supersedes the old deferred-audit/publication instructions below. Current work follows `Downloads/OVERALL_PLAN_LAUNCH_READY.md` on `codex/p0-downstream-integration-prep`; do not merge or deploy. See `docs/LAUNCH_READY_PROGRESS.md` for gate status.

- Wall planning now supports positive integer width, height and depth; the mandatory strict-blue wall is 5 x 7 x 1 = 35 targets. The recording tower is six alternating layers with two bricks per layer = 12 targets; ten layers remains supported.
- Native registration now includes 31 unique tools: the existing 28 plus `request_more_bricks`, `get_scene_settings`, and `update_scene_settings`, using the same registrar.
- `request_more_bricks({expectedWorldRevision})` moves the empty robot to the shared rendered button and presses twice. Refill occurs only after verified TCP contact. Human clicks use the same demand-aware dispenser. Sources have unique IDs, validated reachable feeder poses and unchanged colours; no accepted targets are fabricated. If the feeder fills before enough sources are available, consume sources, request another physical double press, then resume the same plan.
- `get_scene_settings({})` returns current presentation values, supported bounds and revision. `update_scene_settings({brightness, tableColor, expectedWorldRevision})` atomically changes the existing settings store. Brightness is renderer exposure in 0.1..4; table colour accepts #RRGGBB or supported simple names such as `dark grey`. Existing motion/layout guards still apply.
- An amber pending-slot guide is derived from the live stream. Match its yaw using R, aim at it while holding a compatible brick, then click to release normally. Pickup alone never accepts a target. Strict target colour is enforced; a red preference with no strict colour permits a blue Human contribution.
- Test-only `tests/helpers/human-simulator.js` drives HumanBuildAdapter pickup/validated-preview/release and labels evidence `simulation: true`. It is not loaded by production, never writes ADOPTED directly and does not replace actual pointer acceptance.

Repeat browser acceptance explicitly with `node scripts/level1-launch-browser.mjs --write-evidence`; screenshots are local evidence, not a substitute for inspecting board state. Full browser/visual acceptance is still in progress; do not treat this implementation summary as the Level 1 completion gate.


## Recording contract

Use this exact request:

> Build a tower six layers tall using two red bricks per layer.

The required result is:

- 2 bricks in each layer.
- 6 layers.
- 12 placement targets.
- Alternating 0-degree and 90-degree layer orientation.
- One fixed 32 mm by 32 mm tower footprint.

The implementation uses `createSimpleStructurePlan`, ordinary placement records, `plan_placement_queue`, and the existing placement stream. It does not add a `build_tower` tool. The generic planner can still make the optional 10-layer, 20-target tower.

## Guided Human contribution

Plan the tower before the robot stream starts. The SIMPLE panel then shows one dependency-ready pending slot that is not the robot's first slot. It shows:

- Placement ID.
- Layer and slot.
- X, Y, and Z position.
- Required yaw.

Place one compatible blue brick in this exact slot. Use the normal valid placement preview. Do not use an off-plan position.

The required state sequence is:

1. Human pickup changes `worldRevision`.
2. Human placement changes `worldRevision` again.
3. The pending target becomes `ADOPTED`.
4. `actor` is `human`.
5. `actualBrickId` is the blue brick ID.
6. The adopted target leaves the robot queue.
7. The robot places the other 11 targets.
8. Dependencies continue to the top layer.
9. Final status is 12 of 12 satisfied: 1 `ADOPTED` and 11 `COMPLETED`.

This is a guided valid-slot contribution. General arbitrary off-plan replanning is not implemented or claimed.

## Preserved architecture and limits

The release keeps one existing `BuildBoard`, `RobotController`, `RevisionClock`, placement coordinator, and cycle runner. It registers 31 WebMCP tools. It adds no second execution authority.

Placement legality is unchanged. Strict `colour` still rejects a wrong robot source. The recording plan uses red as the preferred robot source while allowing the valid Human blue contribution to satisfy the guided geometric target.

The simulator cadence is:

- Normal: 2000 ms.
- 50 percent faster: approximately 1333 ms.
- Hard minimum: 1000 ms.

Pickup colour fixes remain active. A held or Human-preview blue brick stays blue. Robot proposal status colours remain separate.

## Validation

Run:

```text
node --test --test-concurrency=1 tests/js/simple-webmcp-hero.test.js tests/js/held-brick-colour.test.js tests/js/player-pickup-audit.test.js
npm run simple:browser
```

The focused checks cover one red brick, the current 3-by-4 wall, the final 12-target tower, alternating orientation, guided Human adoption, no duplicate, dependency continuation, final completion, the optional 20-target capability, pickup colours, cadence, reset behaviour, and tool registration. The browser check uses the native Chrome WebMCP testing path and requires zero console errors and zero console warnings.

Use PR #7 and its latest branch audit for the exact candidate SHA and final results. Do not use the older 10-level off-plan insertion run as evidence for the recording tower.

## Boundaries

This document covers the SIMPLE simulation hero only. It does not claim physical UR10 readiness. It does not cover Bridge retreat collision, Aqueduct, Terrain, train physics, or a general Human off-plan replanner.
