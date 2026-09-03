# Simple WebMCP hero — 2026-09-03

## Open follow-up — brick interjection test needs tweaking

The latest user-driven 10-level tower rerun stopped at **6/20**, after an off-plan blue placement (yaw0 where the pending level required yaw90), followed by a second blue brick on top. Both pickups and placed records retained blue. Improve the interjection test's pending-slot alignment/rotation guidance and blocked-build recovery expectations; do not treat arbitrary off-plan insertions as successful adoption. The earlier correctly aligned **19 robot + 1 human = 20/20** run is separate evidence. No further interjection fix is included in this checkpoint.

Publication scope: push the current tower/colour/logging checkpoint on `codex/p0-downstream-integration-prep`; no new merge requested. Focused checks pass14/14; the full audit remains deferred, including three previously documented Player saved-settings expectation failures.

## Pickup colour follow-up

Fixed stale loose-mesh colours after inventory reset/reused source IDs, stale displayHex batch colours, and red/green full-body human preview overlays. Both actual held material and human preview retain source colour. The existing activity log now records `Player picked up <id> · colour blue · after pickup blue · unchanged`; release logs also check colour identity. For retained diagnostic history use `__ROBO_BRIDGE__.humanBuildAdapter.getPickupLog()` (last100 successful pickups; copied read-only data, retained across workcell reset, cleared on page reload). No new placement authority or WebMCP tool.

Focused14/14 PASS. Isolated Chrome148 mouse check: all28 sources match post-reset material colours; red source0 and blue sources24..27 keep colour across pickup and produce correct logs; console0errors/0warnings. Test camera held stationary by pausing the diagnostic renderer loop; no visual/moving-camera acceptance claimed. Repeat with `node scripts/player-pickup-colour-browser.mjs`. Refresh the user's demo to load this local fix; refresh resets the build.

## Current demo correction — 2026-09-03

The user's clarified demos supersede the historical 1/9/24 recording below: single red brick **1**, wall **3 wide x 4 levels = 12**, and a Jenga-style tower **two parallel bricks per level x five levels = 10**. Tower yaw alternates 0/90/0/90/0 degrees with a fixed logical 32x32mm footprint; each upper brick depends on both bricks below. The helper reuses the existing cross-laminated planner and its connector metadata, then submits ordinary Cartesian placements to the same stream. No new shape tool or execution authority.

The carried physical brick and human placement preview no longer get a red/green status tint; robot proposal previews retain status colouring. A focused test proves blue pickup plus preview does not accept a placement or change the source's colour. Intentional human release remains necessary; the exact reported accidental-click sequence has not been reproduced. Red remains a source preference for wall/tower so a valid human blue placement is still adoptable.

The browser harness now calls Chrome's native `navigator.modelContextTesting.executeTool`, not captured callbacks. This is native browser testing API execution, not an external MCP client's transport. Latest browser rerun and limitations are recorded in `handoff_progress.md`.

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
4. `control_placement_stream` action=`start`, cycleTimeMs=2000, maximumPlacements=1/12/10. Poll `get_placement_stream_status`; no per-brick call needed.
5. During tower execution, place a blue brick into a pending valid slot. Its state should become ADOPTED, actor=human. Request `set_speed` with cycleTimeMs=1333, then 1000, using a fresh worldRevision. A stale revision rejects rather than bypassing safety.

Wall means 3 bricks wide x 4 layers = 12. Tower means two parallel bricks per layer x 5 layers = 10, alternating 90 degrees each layer. Each brick's logical footprint is32x16mm and the tower footprint is32x32mm; stack height is9.6mm per layer. Upper tower placements depend on both lower bricks and preserve the cross-laminated planner's support/connector identities. Tests generate these plans outside the live execution authority. The former24-brick rectangular grid remains covered as a regression, not the current tower demo.

## Verification and boundaries

Final focused results: 27/27 deterministic tests (Simple hero5, cadence3, placement stream11, WebMCP8). Chrome148 state-only acceptance PASS: single1/1; wall9/9; tower24/24 = robot23 + human-blue ADOPTED1 (`tower.z0.x1.y1`, actual `v8-brick-24`), unique accepted brick identities, dependent layers complete, no duplicate. Live speed accepted1333 then clamped889→1000; zero cycle overruns in these browser runs. Mode switch preserves all four authority object identities and bridge plan identity; native28 unique tools; console0errors/0warnings. Initial diagnostic failures (legacy400mm singular transfer and truncated status pagination) were corrected and rerun successfully, without relaxing assertions or safety limits. The generic stream harness now uses the same Simple250mm transfer setting as production.

Focused deterministic tests exercise real controller/PlacementAuthority/BuildBoard placement, red source preference, blue human adoption, distinct accepted bricks, continuation, strict-colour preservation, source fallback, exact cadence and revision/speed bounds. State-only browser runner: `npm run simple:browser`, JSON evidence in `output/playwright/simple-webmcp/acceptance.json` (ignored, not published). Native registration is tested against Chrome's real provider; calls exercise the registered callbacks, not an external agent transport. Human placement uses the real human controller commit path, not a mouse-driven visual acceptance.

The broad bridge/full repository/hero:3 suites were intentionally not rerun. Historical bridge test results remain historical; this task does not claim bridge collisions, full robot-only bridge construction, train readiness, physical robot performance, or final submission readiness. Visual: USER APPROVED ("looks good!").
