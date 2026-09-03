# ROBO BRIDGE MCP — Submission Master Plan

**Status:** THREE-LEVEL DEMO RELEASE — LEVELS 1 AND 2 ACCEPTED; LEVEL 3 TCP FOUNDATION IN PROGRESS, PHYSICAL CROSSING BLOCKED
**Plan version:** 2026-09-03-N  
**Production branch:** `main`  
**Candidate Simple checkpoint:** Level 1 completion commit on `codex/p0-downstream-integration-prep` (see `docs/LAUNCH_READY_PROGRESS.md`)
**Draft PR:** #7 — three-level launch readiness — **NOT MERGED**
**Submission deadline:** 2026-09-03 13:00 PDT / **21:00 BST**  
**Production hosting target:** `https://robo-bridge-mcp-git.pages.dev`

---

# 0. Authority

## Verified Level 2 checkpoint — 2026-09-03

Level2 is the current Type2 Viaduct on Terrain7 with no Train initialized. Native Chrome148 acceptance15/15: four/five arches, opening-width change and restored exact four-arch design; one frozen276-part plan, one shared inventory/board,91Human/185Codex advisory targets, both actors allowed every class,276 unique accepted targets/sources. Actual contributions:58 test-Human through normal HumanBuildAdapter,120 genuine simulator robot placements (including visible ARCH_B carry/acceptance),98 explicitly labelled accelerated placements. At154/276 the empty gripper retreat collided with the accepted arch; remaining122 comprised24 more Human and98 accelerated. No collision/IK/workspace rule was relaxed. This is not robot-only276-part completion.

The exact depth-prepass hologram hides interior clutter and preserves arches/track. Visual review discovered and fixed invisible solid arches caused by ungrouped geometry with an array material; scalar arch material now renders and raycasts exact geometry. Main and Sol reviewers opened the corrected carried-arch, accepted/full bridge and fresh label/selector screenshots. No Train service, physics, renderer root or frame subscription exists in Level2; native test_bridge rejects before mutation.31unique native tools retain one registrar.

Verification468/468JS,20/20reliability,167JS+4Python syntax/repository checks PASS; full Level1 native regression14/14 PASS after Level2. Level2 browser application errors0/warnings0/unexpected exceptions0; two exact intentional native pre-aborted probe exceptions are retained in raw evidence, not counted as runtime faults.300ms was requested, not achieved:119 successful full-cycle samples mean1201.26ms,p951978ms. Evidence: `output/playwright/launch-level2-final/acceptance.json`, `output/playwright/launch-level2-ui-current/acceptance.json`, and `output/playwright/launch-level1-after-level2/acceptance.json`. See `docs/LEVEL2_COLLABORATIVE_VIADUCT.md` and active progress for limitations/checkpoint SHA. Level3 physical TCP push/failure/crossing and final release audit remain unaccepted; no main merge or deployment.

## Verified Level 1 checkpoint — 2026-09-03

Plan N direction is preserved. The release branch safely incorporated main at `14441e3` and parallel feature updates at `6edffc4`; main is not merged or deployed by this task. Level 1 passes: requested-blue single, strict-blue5×7×1 wall35/35 with35 unique sources and physical double-press refill/resume, six-layer12-target tower with one actual canvas Human blue ADOPTED plus11 robot placements,1333ms cadence and1000ms floor, camera-invariant brightness/table-colour tools,31 unique native WebMCP tools/one registrar. Test-only concurrent Human Simulator also passes without duplicate acceptance or colour changes.

Verification:425/425 JavaScript,20/20 reliability,163 JS and4 Python syntax files; Chrome148 full Level1 browser14/14 and legacy Simple browser8/8, console0errors/0warnings/0exceptions. Main and independent Sol reviewer opened the fresh screenshots, including measured button approach/contact/retreat. Local evidence: `output/playwright/launch-level1/acceptance.json` and its eight listed PNGs; legacy report `output/playwright/simple-webmcp/acceptance.json`. Evidence is generated explicitly and not committed. Do not use the unlisted historical `03-more-bricks-press.png`.

This accepts Level1 only, not arbitrary off-plan replanning, Level2 bridge completion, Level3 TCP-pushed Train physics, external MCP-client transport, hardware performance, or public deployment. Continue the remaining gates sequentially under `Downloads/OVERALL_PLAN_LAUNCH_READY.md`; do not merge main or change Cloudflare.

This file is the authoritative submission execution plan.

If an older handoff, README, Oracle package, branch note or chat instruction conflicts with this file, this file wins for the submission sprint.

Evidence must remain tied to a concrete runtime/commit. Do not combine separate runs into a false release claim.

Canonical authority chain:

```text
RevisionClock / worldRevision
-> BuildBoard
-> PlacementAuthority
-> RobotController
-> Runtime
-> Renderer / Player / Perception / WebMCP
```

Do not create a second BuildBoard, RobotController, RevisionClock, inventory truth, occupancy truth, render loop or WebMCP-only execution authority.

Simulation evidence must never be described as physical UR10 readiness.

---

# 1. NEW RELEASE STRATEGY — THREE DEMO LEVELS

The submission is now intentionally split into three independently useful demo levels.

The key rule is:

```text
LEVEL 1 = MUST WORK AND BECOME RECORDABLE FIRST
LEVEL 2 = MUST WORK NEXT AND HAS NO TRAIN
LEVEL 3 = FULL TRAIN + TRAIN PHYSICS; MUST NOT BLOCK LEVEL 1 OR LEVEL 2
```

The user may start recording Level 1 clips as soon as Level 1 is frozen.

The user may then record Level 2 clips as soon as Level 2 is frozen.

Level 3 can be recorded later if it reaches a stable state.

This avoids waiting for the most complex Train/physics path before useful recording can begin.

Target for the next two hours:

```text
FIRST HOUR: Level 1 fully working / recordable
SECOND HOUR: Level 2 fully working / recordable
AFTER THAT: Level 3 full Train/physics if time permits
```

Do not delay Level 1 or Level 2 for Level 3 work.

---

# 2. LEVEL 1 — SIMPLE BRICKS — P0 / PRIMARY FOUNDATION

Level 1 is the complete Simple Bricks WebMCP workcell.

The user must be able to use natural language to request structures and settings.

Representative requests:

```text
Place one blue brick on the mat.

Build a blue wall 5 bricks wide and 7 bricks high, one brick deep.

Build a red tower six layers tall using two bricks per layer.

Move 50% faster.

Make the scene brighter.

Make the table dark grey.
```

## Level 1 structure capabilities

Level 1 must support:

```text
single brick
requested brick colour
wall width
wall height
wall depth
tower height / layers
tower dimensions / bricks per layer
Human + Codex collaborative placement
conversational placement speed
scene visual settings through WebMCP
```

The model should reason about geometry using generic tools.

Do not add shape-specific `build_wall` or `build_tower` WebMCP tools unless absolutely necessary as a last release-rescue measure.

Preferred path:

```text
natural language
-> scene/workspace read
-> generic placement planning
-> dependency plan
-> authoritative BuildBoard
-> RobotController / Human placement
-> shared state readback
```

---

# 3. LEVEL 1 — INVENTORY / REFILL IS NOW P0

A ChatGPT Work local code-level test created the correct **35-target** plan for a 5 x 7 blue wall.

The real RobotController and BuildBoard executed four blue placements, then stopped because only four blue source bricks were available.

Evidence classification:

```text
35-target wall planner: PASS
real placement path: PARTIAL PASS
BuildBoard: 4/35 blue placements
stop reason: no more blue bricks
visible Work browser acceptance: NOT PROVEN
native Work Site Tools: NOT PROVEN
```

Therefore Level 1 requires a legitimate source/inventory strategy that can satisfy requested structures within the supported workspace.

Required behaviour:

```text
requested plan determines required BOM / source count
-> existing refill/inventory authority supplies enough compatible bricks
-> robot never fabricates accepted BuildBoard completion
-> unique source IDs remain valid
-> colour semantics remain correct
```

Do not fake completed targets.

Do not bypass source identity.

Use the existing legitimate inventory/reset/refill seam where possible.

A 5 x 7 x 1 blue wall must not stop after four bricks merely because the initial visible blue source pool is four.

---

# 4. LEVEL 1 — HUMAN + CODEX COLLABORATION

Level 1 must support a Human building along with Codex.

Required guided behaviour:

```text
Human places compatible brick into a valid pending target
-> worldRevision changes
-> placement stream reconciles
-> target becomes ADOPTED
-> actor = human
-> actualBrickId retained
-> robot does not duplicate the slot
-> dependencies continue
-> build completes
```

A general arbitrary off-plan replanner is not required for submission.

The intended valid slot and orientation should be obvious enough for the user to place correctly during recording.

Known evidence from PR #7:

```text
correctly aligned collaborative run: 20/20
19 robot COMPLETED
1 Human ADOPTED
no duplicate
robot continued
```

Known limitation:

```text
off-plan Human insertion caused a later 20-target run to stop at 6/20
```

Do not weaken BuildBoard legality to accept arbitrary placements.

---

# 5. LEVEL 1 — FINAL TOWER SEMANTICS

The final recording request remains:

```text
Build a tower six layers tall using two red bricks per layer.
```

Required result:

```text
2 bricks per layer
6 layers
12 placement targets
12/12 satisfied
```

PR #7 also contains a useful 10-level / 20-brick alternating cross-laminated tower capability.

That capability may remain, but it must not silently replace the 12-target recording requirement.

Both specifications may coexist if the natural-language planner distinguishes them correctly.

---

# 6. LEVEL 1 — WEBMCP TOOL SURFACE + SCENE SETTINGS

Current merged baseline before the new Level 1 settings requirement was:

```text
28 unique WebMCP tools
1 registrar
```

Do **not** treat 28 as a permanent fixed count if Level 1 requires bounded new generic settings tools.

The final tool count must be audited and frozen after the Level 1 settings surface is complete.

Prefer a small generic settings surface rather than one tool per visual property.

Conceptually the surface should support operations equivalent to:

```text
read scene settings
update supported scene settings
```

Supported Level 1 visual controls should include, where the runtime exposes them safely:

```text
scene / light brightness
table colour
other already-supported presentation settings that are useful in the demo
```

Use existing naming conventions if suitable tools already exist.

Do not create a second renderer or state authority.

Settings updates must flow into the existing Player/runtime configuration.

Cadence controls remain:

```text
normal = 2000 ms/cycle
50% faster = about 1333 ms/cycle
hard minimum = 1000 ms/cycle
```

Changing cadence must not weaken IK, collision, workspace or placement authority.

---

# 7. LEVEL 1 — RECORDING GATE

Level 1 becomes recordable when the exact candidate SHA proves:

```text
single requested-colour brick: PASS
5 x 7 x 1 blue wall planning: 35 targets
5 x 7 x 1 blue wall execution: 35/35
requested tower: 12/12
Human valid-slot placement: ADOPTED
no duplicate after ADOPTED
build continues after Human contribution
requested colour preserved
inventory/refill supports the requested BOM
speed change works
scene brightness can be changed through WebMCP
Table colour can be changed through WebMCP
final WebMCP catalogue audited
one registrar
mode reset/toggle works
0 blocking console errors
```

Once this gate passes:

```text
FREEZE LEVEL 1
RECORD LEVEL 1 CLIPS IMMEDIATELY
DO NOT WAIT FOR LEVEL 2 OR LEVEL 3
```

---

# 8. LEVEL 2 — COLLABORATIVE BRIDGE — NO TRAIN

**There is no Train in Level 2.**

**There is no Train physics in Level 2.**

Train, Train testing, Train success/failure and Train physics belong only to Level 3.

Level 2 is purely the conversational Bridge design + Human/Codex collaborative construction demonstration.

Final Bridge family:

```text
V4.6 Type 2 Viaduct
```

The user should be able to request semantic Bridge changes such as:

```text
Build a viaduct with four arches.

Try five arches.

Make the openings wider.
```

Existing generic Bridge design tools should update the design and regenerate the exact BuildPlan/hologram.

Do not create arch-count-specific tools.

---

# 9. LEVEL 2 — HUMAN + CODEX BUILD THE BRIDGE TOGETHER

Level 2 should demonstrate shared construction without requiring a Train test.

Desired journey:

```text
user selects / changes Bridge design
-> deterministic Bridge compiler creates BuildPlan
-> hologram / pending targets appear
-> work is divided between Human and Codex
-> Human builds one side / region
-> Codex builds the other side / region
-> both write into the same BuildBoard authority
-> progress updates continuously
-> bridge reaches authoritative construction completion
```

The exact split can be simple and deterministic.

For example:

```text
Human = left side / assigned region
Codex = right side / assigned region
```

or another clear spatial partition that fits the existing planner.

The goal is to make the collaboration obvious and intuitive on video.

Do not redesign the Bridge compiler.

Do not fix the old robot retreat collision as part of this Level 2 time box unless it directly blocks the selected bounded Level 2 recording path.

Use existing authoritative placement / accelerated-simulation seams only where they are explicitly labelled and truthful.

---

# 10. LEVEL 2 — RECORDING GATE

Level 2 becomes recordable when the release candidate proves:

```text
Terrain 7 loads
Viaduct is selected
user can change arch count conversationally
BuildPlan / hologram updates correctly
Human and Codex can contribute to the same Bridge plan
shared BuildBoard records both actors correctly
no duplicate accepted placement
progress state is readable
selected bounded Bridge build reaches its intended completion state
0 blocking console errors
NO TRAIN is required or invoked
```

Once this gate passes:

```text
FREEZE LEVEL 2
RECORD LEVEL 2 CLIPS
DO NOT WAIT FOR LEVEL 3
```

---

# 11. LEVEL 3 — FULL TRAIN + TRAIN PHYSICS

Level 3 is the full ambitious simulation.

Only Level 3 contains:

```text
Train
Train physics
Train collision/support behaviour
Train falling / derailment
failure detection
repair / retest
CROSSED
Mission COMPLETE
full success / statistics presentation
```

Desired Level 3 journey:

```text
BUILD
-> TEST
-> incomplete/unsupported Bridge can cause Train failure/fall
-> same mission returns to BUILD
-> repair / completion
-> TEST
-> Train physically crosses
-> CROSSED
-> COMPLETE
-> final statistics / result presentation
```

Level 3 should be intuitive and visually strong, but it is a stretch layer for the current submission sprint.

**Level 3 must never block recording or submission of Level 1 or Level 2.**

---

# 12. LEVEL 3 — EXISTING EVIDENCE / LIMITATIONS

Historical normal simulated robot-only Viaduct progression reached:

```text
183 / 276
```

then stopped on an empty-gripper retreat collision.

This collision is not a Level 1 or Level 2 blocker.

Existing explicit mixed simulation evidence remains:

```text
Human: 1
normal simulated UR10: 3
accelerated simulated placements: 272
276 / 276 accepted
incorrect: 0
TRAIN_FELL -> BUILD -> CROSSED -> COMPLETE
reset -> new missionId
```

Safe claim:

```text
the deterministic shared board can be completed through explicitly labelled mixed simulation
```

Do not claim all 276 Bridge parts were robot-executed.

Level 3 may build on this existing work if time remains.

---

# 13. TERRAIN / SCENE INVARIANTS

Production Terrain asset:

```text
Scene_and_3D_Files/Terrain_7_Main.glb
```

Reported SHA256:

```text
419adc72b8fb408eea5060142890682fbcd03709b4cd4d292742286ba1518217
```

Build/water datum:

```text
Z = -132.718 mm
```

Approved Terrain orientation is intentionally diagonal relative to the camera.

Do not straighten it.

Approved table baseline remains frozen except for user-controlled presentation properties such as colour/brightness:

```text
X = -100 mm
Y = 200 mm
Width = 1750 mm
Depth = 1200 mm
Top height = 1200 mm
```

Final deployment must serve the real GLB binary, not a Git LFS pointer.

---

# 14. PR #7 — CURRENT LEVEL 1 CANDIDATE

PR #7 remains draft and unmerged.

Candidate checkpoint:

```text
29953f01d994b9b877a7871e6c2aeda2dee3d77e
```

Reported focused validation:

```text
14 / 14 PASS
```

PR #7 contains useful Level 1 work:

```text
alternating tower planning
pickup colour persistence
source material refresh
Human pickup diagnostics/logging
focused browser pickup checks
```

It is not release-approved solely because focused tests pass.

Level 1 review must now also cover:

```text
12-target recording tower
requested colour structures
inventory/refill for larger requested BOMs
Human valid-slot ADOPTED path
scene brightness / table colour WebMCP settings
final tool catalogue
```

Do not merge automatically.

---

# 15. CLOUDFLARE — PIPELINE IS PROVEN

Do not spend more time experimenting with hosting.

Working Git-connected project:

```text
robo-bridge-mcp-git
```

Public URL:

```text
https://robo-bridge-mcp-git.pages.dev
```

Proven configuration:

```text
GitHub repository: stefanGuiton/ROBO-BRIDGE-MCP
repository visibility: PRIVATE
production branch: main
root directory: /
build command: exit 0
current output: cloudflare-smoke
Pages Functions: none
server compute: none
```

Automatic deployment is proven:

```text
private repo
-> push main
-> github:push detected
-> automatic Pages deployment
-> public site updates
```

Observed redeploy time was about 20-30 seconds.

Old Direct Upload project remains:

```text
robo-bridge-mcp
https://robo-bridge-mcp.pages.dev
```

User instruction:

```text
DO NOT DELETE ANYTHING.
```

Do not modify or delete the old project.

Do not create more Pages projects.

Do not enable Workers, Pages Functions, D1, R2, AI, Queues, Durable Objects or other server compute.

---

# 16. FINAL CLOUDFLARE SWITCH

Only after the intended release candidate is frozen on `main`, change the existing `robo-bridge-mcp-git` project from:

```text
Build output directory: cloudflare-smoke
```

to:

```text
Build output directory: apps/web
```

Keep:

```text
repo: stefanGuiton/ROBO-BRIDGE-MCP
production branch: main
root directory: /
Git integration: enabled
```

Then verify:

```text
index.html -> 200
Terrain 7 GLB -> 200 and real binary
textures/assets -> 200
Three/vendor modules -> 200
Chrome opens page
canvas renders
Player controls initialise
WebMCP tools are discoverable where supported
no blocking console errors
no Pages Functions
no server compute
```

Level 1 and Level 2 should be tested on the public deployment before final submission where practical.

---

# 17. TWO-HOUR EXECUTION PLAN

## PHASE A — LEVEL 1 — FIRST HOUR

Priority order:

```text
1. fix legitimate inventory/refill so requested colours/BOMs can complete
2. prove one requested-colour brick
3. prove 5 x 7 x 1 blue wall = 35/35
4. prove final 6-layer / 12-target tower
5. prove guided Human valid-slot ADOPTED + no duplicate + continuation
6. expose/audit useful scene settings through WebMCP
7. prove brightness change
8. prove table-colour change
9. audit final WebMCP catalogue + registrar
10. browser/console regression
11. freeze Level 1 recording candidate
```

As soon as Level 1 is stable, recording may begin.

## PHASE B — LEVEL 2 — SECOND HOUR

Priority order:

```text
1. load Terrain 7 + Viaduct reliably
2. conversational arch-count/design change
3. regenerate exact BuildPlan/hologram
4. establish clear Human/Codex Bridge work split
5. record both actors into the same BuildBoard
6. complete the selected bounded Bridge construction path
7. verify progress/readback
8. console regression
9. freeze Level 2 recording candidate
```

**Do not add or test Train in this phase.**

As soon as Level 2 is stable, record Level 2 clips.

## PHASE C — LEVEL 3 — AFTER LEVEL 1 + LEVEL 2

Only then spend remaining engineering time on:

```text
Train
Train physics
fall/derailment
support failure
repair/retest
CROSSED / COMPLETE
full statistics / final simulation presentation
```

---

# 18. TIME-BOXED RELEASE TESTS

Use the strongest tests that fit the remaining time:

```bash
npm run verify
npm run submission:smoke
npm run submission:gate
npm run webmcp:audit
```

But focused level acceptance takes priority over chasing unrelated historical failures.

Do not weaken tests.

Do not make robot-only 276/276 or the old Bridge retreat collision a Level 1/2 blocker.

---

# 19. RECORDING STRATEGY — RECORD IN INDEPENDENT CLIPS

Do not require one perfect uninterrupted demo session.

Record stable clips as each level becomes ready.

## Level 1 clips

Capture:

```text
single requested-colour brick
large requested-colour wall
requested tower
Human collaboration / ADOPTED
speed change
brightness change
table colour change
WebMCP state/tool interaction
```

## Level 2 clips

Capture:

```text
Terrain + Viaduct
conversational arch-count/design change
hologram / plan change
Human takes one Bridge region
Codex takes the other region
shared progress / BuildBoard
Bridge construction completion
```

**No Train footage belongs to Level 2.**

## Level 3 clips — only if stable

Capture:

```text
Train physics
failure / falling if useful
repair
retest
successful crossing
full result/stats
```

The final under-3-minute edit can combine the strongest Level 1, Level 2 and optional Level 3 clips.

---

# 20. CLAIM SAFETY

Safe:

- Codex controls a deterministic browser workcell through WebMCP;
- Codex can inspect state, plan generic placements and execute them through shared authorities;
- correctly aligned Human contributions can be adopted into the active plan;
- requested structure colours/dimensions can be model-planned within supported limits once release acceptance proves them;
- scene presentation settings can be changed conversationally once final acceptance proves the settings surface;
- Human and Codex can share one Bridge BuildPlan/BuildBoard in Level 2;
- Level 2 does not require Train simulation;
- Level 3 contains the Train/physics mission;
- Cloudflare serves static browser assets;
- explicit accelerated simulation remains clearly labelled when used.

Do not claim:

- arbitrary off-plan Human replanning unless proven;
- physical UR10 readiness;
- physical collision safety;
- all 276 Bridge parts robot-executed;
- physical one-second cycles;
- physical accuracy/repeatability;
- 120 FPS without real rendered evidence.

---

# 21. HARD SCOPE CUTS

Until Level 1 and Level 2 are recordable, do not spend time on:

```text
Train or Train physics
Bridge retreat collision repair
new path planner
arbitrary off-plan Human replanning
new terrain variants
new bridge families
Aqueduct resurrection
physics rewrite
renderer rewrite
trees/grass
reflection systems
physical robot deployment
extra dashboards
large refactors
new Cloudflare projects
server-side Cloudflare architecture
```

After Level 1 and Level 2 are recorded, Train/Train physics may resume as Level 3 work.

---

# 22. FINAL RELEASE PRINCIPLE

**The release is now progressive.**

**Level 1 is the complete Simple Bricks WebMCP workcell and must be recordable first.**

**Level 2 is collaborative Viaduct design/build with Human + Codex sharing the same authoritative build state. There is NO TRAIN in Level 2.**

**Level 3 is the only level containing Train, Train testing and Train physics.**

**Do not wait for Level 3 before recording Level 1 or Level 2.**

**The next two hours are for making Level 1 and Level 2 stable, browser-proven and recordable.**
