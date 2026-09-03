# Simple WebMCP hero — 2026-09-03

Publication update: user subsequently requested **push and merge**, superseding the no-merge scope below. Accepted runtime checkpoint `d8173b9` is pushed; PR6 now targets main. Merge `e2d6100` preserves main's exact Plan2026-09-03-J and smoke page, with no runtime/test changes. Merge PR6 normally; leave PR5 unmerged. This publication authorization is not full bridge/hero:3 acceptance.

Scope: user-approved `CODEX_SIMPLE_WEBMCP_HERO_20_MINUTE_PLAN (1).md`. Branch `codex/p0-downstream-integration-prep`, starting at `8ce113d`. No merge/retarget, no screenshots, no bridge collision work. User owns visual inspection and reported "looks good!" after the code landed. Scene visual approval is user-reported, not automated or proof of a mouse-driven takeover recording.

## What changed

- MAIN_DEMO defaults to SIMPLE BRICKS. Select BRIDGE to restore the existing Terrain7/Viaduct/Train/Mission presentation. `?demo=simple` and `?demo=bridge` select explicitly; submission/evidence/legacy robot-showcase URLs retain their existing mode. Switching resets through existing authorities, without replacing the robot, board, placement coordinator or runner. Hidden bridge mission mutations reject with `wrong_mode` in Simple mode; read tools remain available.
- Simple source inventory: 24 red and 4 blue normal physical bricks, shared with Player and robot. Sources use one aligned yaw, with the existing reachable spawn validation. Flat-table transfer uses 250mm within the unchanged workspace: legacy 400mm crosses a wrist singularity on transfers from the newly positioned supply area. No collision, IK, speed or workspace safety limit is relaxed. Bridge travel policy is untouched.
- `preferredColour` ranks sources but does not constrain target colour. Existing strict `colour` still rejects mismatches; `colour: null` accepts compatible colours. Existing reconciliation records `ADOPTED`, actor and actual brick identity, releases dependencies and avoids duplicate placement.
- One new tool: `control_placement_stream` (`start`, `set_speed`, `stop`). Uses the existing PlannedPlacementCycleRunner; starts asynchronously, exact current `expectedWorldRevision` required, cancellation forwarded, max 50 placements. Default 2000ms; `2000 / 1.5 -> 1333`, next faster request clamps to 1000ms. Changes apply at subsequent cycle boundaries. This is simulator start-to-start cadence, not hardware throughput; overruns remain visible.
- Exactly 28 native registered tools: 14 existing primitives + 5 bridge design + 8 Mission + 1 stream control. No wall/tower tools. Bounded stream-status responses now retain the correct pagination cursor when shortened.
- Table defaults from the user: X=-100, Y=200, width1750, depth1200, top thickness130, top height1200mm. No rotation changes. Saved browser preferences still override defaults.

## Recording flow

1. Open `http://127.0.0.1:8774/?demo=simple`. Reset between demonstrations.
2. Codex reads `get_scene_state` and `get_workspace` (including grid dimensions, mat bounds and placement surface). Optional `observe_camera`/`preview_placement` remain available.
3. Generate ordinary coordinates and stable IDs, then `plan_placement_queue` with streamId, mode=`replace`, finalChunk=true, preferredColour=`red`, colour=null, and exact current worldRevision.
4. `control_placement_stream` action=`start`, cycleTimeMs=2000, maximumPlacements=1/9/24. Poll `get_placement_stream_status`; no per-brick call needed.
5. During tower execution, place a blue brick into a pending valid slot. Its state should become ADOPTED, actor=human. Request `set_speed` with cycleTimeMs=1333, then 1000, using a fresh worldRevision. A stale revision rejects rather than bypassing safety.

Wall means 3 bricks wide x 3 layers = 9. Tower means 2 x 2 footprint x 6 layers = 24, not the previous cross-laminated-tower interpretation. Grid footprint32x16mm, stack height9.6mm. Upper placements use supportPlacementId and dependencies on the corresponding lower placement. Tests generate these plans outside production; no hard-coded production animation or shape authority was added.

## Verification and boundaries

Final focused results: 27/27 deterministic tests (Simple hero5, cadence3, placement stream11, WebMCP8). Chrome148 state-only acceptance PASS: single1/1; wall9/9; tower24/24 = robot23 + human-blue ADOPTED1 (`tower.z0.x1.y1`, actual `v8-brick-24`), unique accepted brick identities, dependent layers complete, no duplicate. Live speed accepted1333 then clamped889→1000; zero cycle overruns in these browser runs. Mode switch preserves all four authority object identities and bridge plan identity; native28 unique tools; console0errors/0warnings. Initial diagnostic failures (legacy400mm singular transfer and truncated status pagination) were corrected and rerun successfully, without relaxing assertions or safety limits. The generic stream harness now uses the same Simple250mm transfer setting as production.

Focused deterministic tests exercise real controller/PlacementAuthority/BuildBoard placement, red source preference, blue human adoption, distinct accepted bricks, continuation, strict-colour preservation, source fallback, exact cadence and revision/speed bounds. State-only browser runner: `npm run simple:browser`, JSON evidence in `output/playwright/simple-webmcp/acceptance.json` (ignored, not published). Native registration is tested against Chrome's real provider; calls exercise the registered callbacks, not an external agent transport. Human placement uses the real human controller commit path, not a mouse-driven visual acceptance.

The broad bridge/full repository/hero:3 suites were intentionally not rerun. Historical bridge test results remain historical; this task does not claim bridge collisions, full robot-only bridge construction, train readiness, physical robot performance, or final submission readiness. Visual: USER APPROVED ("looks good!").
