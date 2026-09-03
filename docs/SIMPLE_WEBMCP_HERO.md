# SIMPLE WebMCP hero — current release truth

Updated: 2026-09-03

## Verified smooth-cycle follow-up

The existing native `control_placement_stream` now opts the Simple board into the profile-informed smooth cycle. Normal remains2000ms, faster1333ms, minimum1000ms; Bridge cadence is unchanged. The speed is a target, not a promise or hardware claim.

Fresh Chrome 148 native check: one 3x4 blue wall plan, legitimate double-press refill, one continuous start at 1000 ms, and 12/12 unique accepted blue sources. The final strengthened harness measured 12,748.7 ms total, six overruns (maximum 308.1 ms), 238 moving frames, restored playback and zero console errors/warnings/exceptions. It checks exact target poses, matching board events, finite timing records and actual completion; moving-frame counts are not a frame-rate or guaranteed-smoothness benchmark. Main inspected the screenshots; the final HUD capture precedes its last display refresh, while the authoritative stream and board are complete. Evidence: `output/playwright/level1-fast-timing-hardened/acceptance.json`.

The separate native Human tower regression passed 7/7 checks: one real canvas pickup/release of a blue brick, colour preserved, plus 11 robot placements complete the 12-target tower. Brightness/table settings preserve the camera; console errors/warnings are zero. All three screenshots were inspected. Evidence: `output/playwright/level1-smooth-human-regression/acceptance.json`. Full source verification passed 637/637 JavaScript tests and 20/20 reliability.

Run the short wall explicitly with `node scripts/level1-fast-timing-browser.mjs --write-evidence` (optional `ROBO_FAST_URL` and `ROBO_FAST_OUTPUT`). It does not replace the full 35-brick acceptance matrix below. Earlier `level1-fast-timing-final` passed at 12,698.8 ms; `level1-fast-timing-current` is a failed camera-harness run, not acceptance. Generated evidence stays local.

## Active launch-readiness update (Level 1 acceptance in progress)

This section supersedes the old deferred-audit/publication instructions below. Current work follows `Downloads/OVERALL_PLAN_LAUNCH_READY.md` on `codex/p0-downstream-integration-prep`; do not merge or deploy. See `docs/LAUNCH_READY_PROGRESS.md` for gate status.

- Wall planning now supports positive integer width, height and depth; the mandatory strict-blue wall is 5 x 7 x 1 = 35 targets. The recording tower is six alternating layers with two bricks per layer = 12 targets; ten layers remains supported.
- Native registration now includes 31 unique tools: the existing 28 plus `request_more_bricks`, `get_scene_settings`, and `update_scene_settings`, using the same registrar.
- `request_more_bricks({expectedWorldRevision})` moves the empty robot to the shared rendered button and presses twice. Refill occurs only after verified TCP contact. Human clicks use the same demand-aware dispenser. Sources have unique IDs, validated reachable feeder poses and unchanged colours; no accepted targets are fabricated. If the feeder fills before enough sources are available, consume sources, request another physical double press, then resume the same plan.
- `get_scene_settings({})` returns current presentation values, supported bounds and revision. `update_scene_settings({brightness, tableColor, expectedWorldRevision})` atomically changes the existing settings store. Brightness is renderer exposure in 0.1..4; table colour accepts #RRGGBB or supported simple names such as `dark grey`. Existing motion/layout guards still apply.
- An amber pending-slot guide is derived from the live stream. Match its yaw using R, aim at it while holding a compatible brick, then click to release normally. Pickup alone never accepts a target. Strict target colour is enforced; a red preference with no strict colour permits a blue Human contribution.
- Test-only `tests/helpers/human-simulator.js` drives HumanBuildAdapter pickup/validated-preview/release and labels evidence `simulation: true`. It is not loaded by production, never writes ADOPTED directly and does not replace actual pointer acceptance.

Repeat browser acceptance explicitly with `node scripts/level1-launch-browser.mjs --write-evidence`; screenshots are local evidence, not a substitute for inspecting board state. Full browser/visual acceptance is still in progress; do not treat this implementation summary as the Level 1 completion gate.


## Low-latency continuous demos

### Two-cue recording preset

For the short recording, use one blue brick followed by a 2 x 2 tower: six
alternating layers, two flat red bricks per layer (12 bricks), not four bricks
per layer. Omit the wall. Keep the requested 1000 ms target; do not lower the
Simple minimum or change the normal 2000 ms default.

- Before recording, keep the live browser and native tool handles ready, check
  the intended footprint, and prefill available feeder capacity for the agreed
  colours. A reset/reload invalidates prepared plans and source/revision state.
  If a plan is submitted before the recording cue to drive demand-aware refill,
  label its subsequent timing as a **prepared run**, not prompt-to-completion.
- For an unprepared cue, generate the ordinary placement records once, then
  batch the inventory/plan/start/completion workflow in one host invocation.
  Await mutators sequentially and forward each latest exact revision. Batch
  orchestration is not a new WebMCP tool and never bypasses runtime checks.
- Do not spend a model turn between successful planning and starting, or between
  each brick. Use a bounded completion wait on the live stream's visible COMPLETE
  state, then one bounded final status read. On timeout, inspect the exception
  and current stream state before proceeding; never equate timeout with success.
  Preserve cancellation, Human adoption and source reassignment throughout.
- Store timing fields on one host-side result object before awaits. Capture
  setup, start dispatch, observed completion, and verified completion immediately
  in that invocation. Agent/tool latency is included; these are not the runner's
  exact motion-only duration. Report refill time and overruns separately.

In-app spot check on 2026-09-03, using existing code and the warm connection:
one blue brick took 12.1 s from initial inventory read to visible completion and
14.9 s through verification (previous workflow: 20.6 s). A prepared six-layer
tower took 15.3 s from start dispatch to visible completion and 17.3 s through
verification; its separate plan/refill invocation took 14.4 s. All 12 tower
targets completed with unique actual brick IDs; the runner reported seven
overruns. This is a limited workflow check, not a ten-second guarantee or a
replacement for the full Human-adoption acceptance matrix.

Use the existing native WebMCP tools in the open Level 1 browser. Keep the
browser/tool handles for the recording session; do not rediscover the application
or inspect a screenshot after every brick.

1. Interpret the requested dimensions, orientation and colour once. Generate
   ordinary placement records with stable IDs and support dependencies. A 3 x 4
   wall is 12 targets, not 12 separate agent conversations. Preserve existing
   Human work; a strict colour request must not silently become a preference.
2. Submit one `plan_placement_queue` plan with the current exact
   `expectedWorldRevision`. Use `cycleTimeMs: 1000` only when one-second cycles
   are requested; otherwise use the normal 2000 ms setting. Planning first also
   gives the demand-aware dispenser the requested colour demand.
3. Check loose, unheld, reachable source inventory by colour once before the run
   (use bounded `get_scene_state` pages, restarting if the revision changes).
   Do not count accepted wall bricks as feeder inventory. If short, call
   `request_more_bricks` with the latest revision to prefill available feeder
   capacity. This performs real simulated button presses, not fabricated sources.
   Stop prefilling when demand is covered or capacity prevents further supply;
   a full feeder may still be insufficient for the entire structure.
4. Start **one** existing `control_placement_stream` call with `action: "start"`,
   the chosen `cycleTimeMs`, and the latest exact `expectedWorldRevision`.
   The existing runner executes sequentially without agent calls between bricks.
   Do not use an agent-side loop of `execute_next_placement` for this demo.
5. Observe status at bounded intervals appropriate to the expected finish time,
   rather than after every brick. Runtime collision checks, exact revisions,
   source availability/reassignment, dependencies, strict colours and valid Human
   adoption remain active throughout. Stop/cancel is still available immediately.
6. If execution pauses for `WAITING_SOURCE`, replenish within feeder capacity and
   resume the **same** stream. If there is a conflict or stale revision, inspect
   that exception before resuming; do not erase Human work or bypass the guard.
   Requests beyond a 50-placement run may require bounded plan batches/runs.
7. Verify final satisfied count, unique actual brick IDs and accepted board
   placements using bounded status/board reads. Check that the robot is idle and
   empty. The compact board response is limited; do not mistake its first page
   for the whole wall. Report any incomplete targets or required refill pauses.

### Smooth-cycle timing contract

The existing stream control opts into `timingMode: "simple-smooth"` internally
only when the authoritative board blueprint is `simple-bricks`. No extra WebMCP
tool or stream-ID naming convention is required. Ordinary runner callers retain
the old `cadence` mode and 40x playback, including bridge execution. Terrain travel
policies cannot opt into Simple smooth timing.

- Simple's normal default remains **2000 ms**; 50 percent faster is **1333 ms**;
  its control still clamps to a **1000 ms minimum**. The shared bridge runner's
  separate 250 ms minimum and 1000 ms default are not changed by this feature.
- The target covers initial pickup approach, descent, latch, lift, transfer,
  descent, release and retreat, plus timing preparation. The playback multiplier
  is selected **before** taking the existing exclusive operation lease and stays
  fixed during that cycle, bounded to **1..40**.
  After success, cancellation or failure, the runner restores the prior playback
  setting once its motion is idle, without overwriting a later external rate
  change. Legacy bridge playback is unaffected.
- The timing helper reads the existing validated first-leg profile and estimates
  remaining legs from previous actual per-leg durations and changed distances.
  Cold-start extrapolation and route/yaw changes can be inaccurate. It is not a
  second motion planner, collision proof or guarantee of total duration.
- Every move still uses the existing live validated profiles, physical speed and
  acceleration limits, collisions and cancellation. Timing preparation yields
  responsively and the runner rechecks exact revision and queue identity before
  pickup. Observed overhead informs subsequent cycles. Playback never increases
  beyond its bound to conceal an overrun.
- Runner results distinguish `physicalDurationMs`, `playbackDurationMs`,
  `executionWallDurationMs` (actual coordinator execution), `preparationElapsedMs`,
  `executionElapsedMs` (preparation plus execution), and `cycleElapsedMs` (also
  includes any cadence wait). They report per-cycle `overrunMs`, aggregate
  `overruns` and `totalElapsedMs`, including partial-run failure/cancellation.
  Full timing is in the runner result; current compact WebMCP status does not
  expose all these fields. Do not infer timing from its cycle-time label alone.
  A failed or cancelled attempt is reported separately as `failedCycle` with
  `completed: false`, observed preparation/execution time and its `overrunMs`;
  aggregate `overruns` includes it. It never enters completed `results` or
  `completedPlacements`. `attemptedPlacements` counts only calls that reached
  execution (not rejected preparation). Unavailable physical/playback durations
  are `null`, not estimates. Cancelling a cadence wait keeps the preceding brick
  completed and does not create a failed placement.

A 12-brick wall targets roughly **12 seconds of execution, plus initial
planning/refill overhead and any overruns**. This is not a ten-second prompt-to-
completion guarantee. Node timing tests are not native-browser acceptance;
refresh/reload the demo modules before a separate browser acceptance run, at a
safe reset boundary agreed with the presenter.

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
node --test --test-concurrency=1 tests/js/placement-cycle-runner.test.js tests/js/placement-smooth-timing.test.js tests/js/placement-stream.test.js
npm run simple:browser
```

The focused checks cover one red brick, the current 3-by-4 wall, the final 12-target tower, alternating orientation, guided Human adoption, no duplicate, dependency continuation, final completion, the optional 20-target capability, pickup colours, cadence, reset behaviour, and tool registration. The browser check uses the native Chrome WebMCP testing path and requires zero console errors and zero console warnings.

Use PR #7 and its latest branch audit for the exact candidate SHA and final results. Do not use the older 10-level off-plan insertion run as evidence for the recording tower.

## Boundaries

This document covers the SIMPLE simulation hero only. It does not claim physical UR10 readiness. It does not cover Bridge retreat collision, Aqueduct, Terrain, train physics, or a general Human off-plan replanner.
