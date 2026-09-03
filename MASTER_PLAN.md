# ROBO BRIDGE MCP — Submission Master Plan

**Status:** SIMPLE WEBMCP HERO EXTERNALLY PROVEN — CLOUDFLARE GIT PIPELINE PROVEN — TOWER SEMANTICS FIX / FINAL RELEASE NEXT  
**Plan version:** 2026-09-03-L  
**Production branch:** `main`  
**Main head before this plan update:** `261ee3fd95b66b3205d6a9299242b7e6844917c0`  
**Merged production integration:** `118abaeadb04031ac2a48b572206ceae90c5bdd5`  
**Merged integration PR:** #6 — `P0 downstream Train, Mission, WebMCP and Construction prep`  
**Submission deadline:** 2026-09-03 13:00 PDT / **21:00 BST**  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Canonical authority:** `RevisionClock` + `BuildBoard` + `PlacementAuthority` + `RobotController`  
**Primary submission demo:** SIMPLE BRICKS WebMCP hero  
**Secondary demo:** Terrain 7 + Viaduct + Train + Mission  
**Production hosting target:** `robo-bridge-mcp-git.pages.dev`

---

# 0. Authority

This file is the authoritative submission execution plan.

If an older Oracle package, handoff, README, branch note or chat instruction conflicts with this file, **this file wins for the submission sprint**.

Evidence must remain tied to a concrete runtime/commit. Do not combine incompatible evidence into a release claim.

Hard authority chain:

```text
RevisionClock / worldRevision
-> BuildBoard
-> PlacementAuthority
-> RobotController
-> Runtime
-> Renderer / Player / Perception / WebMCP
```

Never create:

- a second BuildBoard;
- a second inventory/occupancy truth;
- a second RobotController;
- a second RevisionClock;
- WebMCP-only placement truth;
- Train-owned bridge completion truth;
- Mission-owned physical-part truth;
- direct fake completion/support setters;
- joint-level WebMCP controls;
- a second production render loop.

Simulator evidence must never be described as physical UR10 readiness.

---

# 1. Executive status — CURRENT TRUTH

PR #6 is merged into `main`.

The project has two intentional demo modes:

```text
SIMPLE BRICKS
BRIDGE
```

The Simple Bricks mode is the primary submission/video path because it proves generic WebMCP planning, execution and Human adaptation with lower execution risk.

The Bridge mode remains the richer secondary demonstration of Terrain 7, Viaduct design, Train failure/recovery and Mission orchestration.

Important release facts now proven:

```text
Simple WebMCP external-browser invocation: PROVEN
single red brick: WORKING
3x3 wall: WORKING
tower execution: WORKING IN PRINCIPLE, final 12-target semantics still to freeze
Cloudflare private GitHub access: PASS
main -> automatic Cloudflare Pages deployment: PASS
public pages.dev update after push: PASS
static-only hosting: PASS
Pages Functions / server compute: ABSENT
```

Current strict critical path:

```text
FINALISE 12-TARGET TOWER SEMANTICS
-> EXTERNAL-BROWSER SIMPLE RETEST
-> FREEZE RELEASE SHA
-> CHANGE CLOUDFLARE OUTPUT cloudflare-smoke -> apps/web
-> LIVE-SITE ASSET + WEBMCP ACCEPTANCE
-> RECORD <3 MIN VIDEO
-> UPLOAD YOUTUBE
-> COMPLETE SUBMISSION BEFORE 21:00 BST
```

Do not reopen Bridge collision work before the submission is safe.

---

# 2. Simple Bricks implementation — PRESERVE

Merged Simple mode evidence includes:

```text
one brick: 1/1
3x3 wall: 9/9
historical explicit 2x2x6 tower: 24/24
Human blue placement: ADOPTED
no duplicate placement on adopted slot
live cadence changes: PASS
browser console: 0 errors / 0 warnings
```

The Simple/Bridge selector reuses the same:

- `RobotController`;
- `BuildBoard`;
- `PlacementAuthority`;
- `PlacementLookaheadCoordinator`;
- `PlannedPlacementCycleRunner`;
- `worldRevision`;
- WebMCP registrar.

Do not create separate Simple-mode authorities.

---

# 3. Final tower semantics — P0 RELEASE GATE

The final recording tower is **not** the earlier 2x2 footprint/four-bricks-per-layer tower.

Final required semantics:

```text
2 red bricks per layer
6 layers
12 placement targets total
```

Use unambiguous natural language:

```text
Build a tower six layers tall using two red bricks per layer.
```

Acceptance target:

```text
12/12 satisfied
```

The earlier explicit `2x2x6 = 24 placements` automated behaviour may remain valid for that different explicit specification.

The final-user request must produce 12 targets.

At the time plan `2026-09-03-L` was written, the latest `main` head before this documentation update was the Cloudflare smoke commit `261ee3fd...`; no later tower-fix commit was yet present on `main`.

Do not redesign the placement stream or robot runtime to solve this. Keep the fix bounded to plan/shape semantics.

---

# 4. Human blue-brick adaptation — MUST RETEST

During the final tower build, the Human may place a blue brick into a compatible pending slot.

Required behaviour:

```text
Human blue brick placed
-> worldRevision changes
-> placement stream reconciles
-> compatible pending target becomes ADOPTED
-> actor = human
-> actualBrickId retained
-> robot does not place a duplicate
-> dependencies become satisfied
-> robot continues
```

This passed on the historical 24-target tower and must be rechecked on the final 12-target tower.

Colour distinction remains:

```text
colour = strict requirement when required
preferredColour = source preference; compatible Human colour may satisfy geometry
```

Do not globally weaken colour validation.

---

# 5. WebMCP surface — 28 TOOLS

Expected production surface:

```text
28 unique WebMCP tools
1 registrar
```

The added placement-stream control tool is:

```text
control_placement_stream
```

It controls the existing placement-cycle runner. It is not a second executor.

Relevant generic tools include:

```text
get_scene_state
get_build_state
get_robot_state
get_workspace
observe_camera
preview_placement
get_placement_stream_status
plan_placement_queue
execute_next_placement
move_tool
latch
unlatch
claim_target
reset_workcell
```

Mission/Terrain tools include:

```text
get_mission_state
get_terrain_options
select_terrain
start_bridge_build
get_build_progress
build_next_parts
test_bridge
reset_mission
```

Do not create bespoke `build_wall` or `build_tower` tools unless a release blocker makes this unavoidable.

Preferred story:

```text
natural language
-> model reasons about geometry/dependencies
-> generic WebMCP tools
-> deterministic runtime executes
```

---

# 6. Cadence / conversational speed

Current Simple cadence contract:

```text
normal = 2000 ms per complete cycle
"50% faster" = about 1333 ms per cycle
hard minimum = 1000 ms per cycle
```

Another speed increase from ~1333 ms must clamp at 1000 ms.

Changing cadence must not weaken collision, IK, workspace or placement-authority rules.

---

# 7. External-browser WebMCP evidence

The user has personally observed Codex controlling the real local external-browser WebMCP surface.

User-observed successful tasks:

```text
single red brick: WORKING
red brick wall: WORKING
red brick tower: execution/planning works; final requested count semantics need the bounded 12-target fix
```

This is stronger than registration/callback-only evidence.

Still repeat a bounded release test after the final tower fix and again on the public site if the supported WebMCP browser can access it.

---

# 8. Final Simple recording set

## A. One brick

```text
Place a red brick on the mat.
```

Expected:

```text
scene/workspace read
-> placement plan
-> robot pick/place
-> authoritative state readback
```

## B. Wall

```text
Build a 3 by 3 wall.
```

Expected:

```text
9 targets
bottom-up dependencies
continuous execution
```

## C. Tower + Human adaptation

```text
Build a tower six layers tall using two red bricks per layer.
```

Expected:

```text
12 targets
Human blue brick -> ADOPTED
no duplicate
robot continues
```

## D. Speed

```text
Codex, could you move 50% faster?
```

Expected:

```text
2000 ms -> about 1333 ms
```

---

# 9. Final scene layout — LOCKED

Approved table:

```text
X = -100 mm
Y = 200 mm
Width = 1750 mm
Depth = 1200 mm
Top thickness = 130 mm
Top height = 1200 mm
Leg width = 60 mm
Leg depth = 60 mm
Leg inset = 70 mm
Roughness = 0.58
Metalness = 0.02
```

Terrain 7:

```text
KEEP current authored Blender orientation
```

It looks diagonal relative to the table/camera by design. Do not straighten it.

No more layout tuning unless the user explicitly requests it.

---

# 10. Bridge mode — SECONDARY / PRESERVED

Final bridge family:

```text
V4.6 Type 2 Viaduct
```

Do not return to the Roman Aqueduct as the primary Bridge demo.

Known checkpoint:

```text
4 arches
276 total parts
261 bricks
12 arches
3 tracks
0 internal prohibited intersections
0 unsupported declared targets
```

Generic bridge design remains the correct interface for changes such as:

```text
Make it a viaduct with 4 arches.
Try 5 arches.
```

Do not create arch-count-specific WebMCP tools.

---

# 11. Bridge construction truth / limitation

Normal simulated robot-only progression previously reached:

```text
183 / 276
```

then stopped on an empty-gripper retreat collision.

This is deferred and is not a submission blocker.

Explicit authoritative `simulated_fast_forward` supports a truthful mixed-mode completion through the same BuildBoard/PlacementAuthority seam.

Proven mixed-mode evidence:

```text
Human: 1
normal simulated UR10: 3
accelerated simulated placements: 272
276/276 accepted
incorrect: 0
TRAIN_FELL -> same mission BUILD -> CROSSED -> COMPLETE
reset -> new missionId
```

Safe claim:

> The deterministic shared board was completed using explicit mixed simulation mode.

Do not claim all 276 parts were robot-executed.

---

# 12. Train + Mission truth

Train support comes from authoritative BuildBoard state.

Water does not count as support.

Required flow:

```text
incomplete BuildBoard
-> test_bridge
-> TRAIN_FELL / SUPPORT_LOSS
-> same mission returns to BUILD

complete BuildBoard
-> test_bridge
-> CROSSED
-> Mission COMPLETE
```

Mission states:

```text
DESIGN
BUILD
TEST
COMPLETE
```

Reset must create a new mission ID.

Do not weaken Mission rules to force success.

---

# 13. Terrain 7 invariants — PRESERVE

Production asset:

```text
Scene_and_3D_Files/Terrain_7_Main.glb
```

Reported fingerprint:

```text
SHA256 419adc72b8fb408eea5060142890682fbcd03709b4cd4d292742286ba1518217
```

Authoring frame:

```text
ENTRY = (0.000, 0.000, 0.000) m
EXIT  = (0.370, 0.000, 0.000) m
ENTRY -> EXIT = +X
span = 370 mm
```

Water object:

```text
Plane
```

Authoritative build/foundation datum:

```text
Z = -132.718 mm
```

Deployment must serve the real GLB binary, not a Git LFS pointer.

Human terrain occlusion invariant:

```text
camera -> terrain -> target = block Human interaction
camera -> target -> terrain = allow Human interaction
```

Solid terrain may occlude Human placement. Water and authored markers do not.

---

# 14. Cloudflare Pages — GIT PIPELINE PROVEN

This section supersedes older deployment uncertainty.

The Cloudflare Git pipeline is now proven end-to-end:

```text
private GitHub repo
-> push to main
-> Cloudflare Pages detects github:push
-> automatic production deployment
-> public pages.dev site updates
```

Observed redeploy time in the user's browser:

```text
about 20-30 seconds
```

Working Git-connected project:

```text
robo-bridge-mcp-git
```

Public URL:

```text
https://robo-bridge-mcp-git.pages.dev
```

Current proven settings:

```text
Git provider: GitHub
Repository: stefanGuiton/ROBO-BRIDGE-MCP
Repository visibility: PRIVATE
Production branch: main
Framework preset: None
Root directory: /
Build command: exit 0
Build output directory: cloudflare-smoke
Environment variables: none
Pages Functions: none
Server compute: none
```

Cloudflare reports:

```text
source type: github
trigger: github:push
production_deployments_enabled: true
uses_functions: false
```

Automatic redeployment was proven twice:

```text
31c761cd...  Deployment connected. -> Git deployment connected.
261ee3fd...  dark text -> blue text
```

Therefore:

```text
Git connection: PASS
private repo access: PASS
main deployment: PASS
automatic github:push deployment: PASS
public Pages URL: PASS
static hosting: PASS
Pages Functions absent: PASS
server compute absent: PASS
```

## Old Direct Upload project — DO NOT TOUCH

An older project still exists:

```text
robo-bridge-mcp
https://robo-bridge-mcp.pages.dev
```

User instruction:

```text
DO NOT DELETE ANYTHING.
```

Do not delete, replace or modify that old project unless the user explicitly changes this instruction.

Do not create more test Pages projects.

Do not change GitHub permissions or repository visibility.

Do not enable Workers, Pages Functions, Workers AI, D1, R2, Durable Objects, Queues or other server compute.

Do not ask Cloudflare Agent to modify GitHub.

## Final Cloudflare switch

When the final `apps/web` release is frozen on `main`, reuse:

```text
robo-bridge-mcp-git
```

Change only:

```text
Build output directory:
cloudflare-smoke
->
apps/web
```

Keep:

```text
Repository: stefanGuiton/ROBO-BRIDGE-MCP
Production branch: main
Root directory: /
Git integration: enabled
```

Do not make this switch before the final playable `apps/web` build is ready.

---

# 15. Final public deployment acceptance

After changing the output directory to `apps/web`, verify:

```text
index.html -> 200
Terrain 7 GLB -> 200 and real binary bytes
required textures/assets -> 200
Three.js/vendor modules -> 200
page opens in current Chrome
canvas renders
Player controls initialise
native WebMCP tools are discoverable where supported
no blocking console errors
no Pages Functions
no server compute
```

Then run the strongest bounded hero path available on the deployed build:

```text
one red brick
wall or final 12-target tower
speed change
```

If WebMCP Site Tools are available in the public-test browser, verify actual invocation, not only registration.

---

# 16. Hosting / cost architecture — PRESERVE

Production architecture remains:

```text
Cloudflare Pages
-> serves static HTML / JS / GLB / textures
-> user's browser downloads assets
-> user's CPU/GPU runs simulation and rendering
```

Do not move simulation, physics, rendering, WebMCP runtime or Bridge logic to Cloudflare server compute.

---

# 17. ChatGPT Work / Oracle remote tasks

While the user is away from the physical PC, remote work should focus on release QA.

Good tasks:

```text
fetch latest main / tower-fix branch
read this MASTER_PLAN.md
clean-clone verification
npm run verify
npm run submission:smoke
npm run submission:gate
npm run webmcp:audit
focused Simple tests
asset/Git-LFS audit
browser/console checks
rectangle WebMCP capability test
submission-content preparation
bounded P0 fixes on a branch
```

Tower acceptance:

```text
2 bricks per layer
6 layers
12 placements
Human blue ADOPTED
no duplicate
execution continues
```

Do not:

- force-push `main`;
- rewrite history;
- delete branches/assets;
- change secrets;
- change repository visibility;
- perform broad redesign;
- spend hours on the Bridge retreat collision.

If a P0 bug is found, fix it on a bounded branch and report exact SHA/PR unless the user explicitly authorises another path.

---

# 18. Immediate strict execution order

## NOW-1 — find/finalise tower fix

Check remote state for the two-bricks-per-layer correction.

Required result:

```text
2 bricks/layer
6 layers
12 targets
```

## NOW-2 — external-browser Simple acceptance

Prove:

```text
one red brick: PASS
3x3 wall: PASS
12-target tower: PASS
```

Also retest:

```text
Human blue compatible brick -> ADOPTED
no duplicate
execution continues
speed change works
```

## NOW-3 — freeze release SHA

Run focused regression:

```text
Simple mode
28-tool registration
one brick
wall
12-target tower
ADOPTED
speed change
mode reset/toggle
console
```

Run the strongest time-boxed repository gates that fit:

```bash
npm run verify
npm run submission:smoke
npm run submission:gate
npm run webmcp:audit
```

Do not make robot-only Bridge completion or `hero:3` a blocker.

## NOW-4 — deploy real app

In the existing Cloudflare project `robo-bridge-mcp-git`, change only:

```text
cloudflare-smoke -> apps/web
```

## NOW-5 — public live-site acceptance

Check assets, canvas, console and WebMCP.

## NOW-6 — record

Record the strongest stable Simple-led demo.

Do not wait for Bridge collision perfection.

## NOW-7 — upload + submit

Upload the public YouTube video and complete the submission well before **21:00 BST**.

After a valid submission is secured, use remaining time only for optional polish.

---

# 19. Final video strategy

Target:

```text
2:20-2:40
hard maximum under 3:00
```

Suggested sequence:

```text
0:00-0:10  working app immediately; place one red brick
0:10-0:40  build 3x3 wall
0:40-1:15  build 6-layer / 2-bricks-per-layer tower
             Human inserts blue brick -> ADOPTED -> no duplicate
1:15-1:30  "Move 50% faster" -> ~1333 ms cycle
1:30-1:55  explain shared browser world / BuildBoard / WebMCP
1:55-2:20  optional BRIDGE mode: Terrain 7 + Viaduct + arch-count change
2:20-2:35  concise architecture/end statement
```

Do not start with login, setup, loading or a long title card.

If Bridge mode is not presentation-ready, omit live Bridge execution and keep the video focused on stable Simple WebMCP interaction.

---

# 20. Claim safety

Safe claims:

- Codex controls a deterministic browser workcell through WebMCP;
- Codex can inspect state, generate generic placement plans and execute them through shared authorities;
- Human actions change the same shared world;
- compatible Human placements can be adopted into an active build;
- placement cadence can be changed conversationally;
- the same architecture supports Terrain 7 / Viaduct / Train / Mission;
- the Bridge board can be completed using an explicitly labelled accelerated-simulation path for remaining deterministic targets;
- Cloudflare Pages hosts the application as static browser-delivered assets.

Do not claim:

- physical UR10 readiness;
- physical collision safety;
- all 276 Viaduct parts robot-executed;
- physical one-second pick/place proof;
- physical accuracy/repeatability;
- 120 FPS based only on render-disabled Oracle results;
- native Work/Cloud WebMCP invocation unless the tested environment actually exposes and invokes the Site Tools.

This is a browser simulator. Be explicit about simulation.

---

# 21. Hard scope cuts for the rest of submission day

Unless a new release blocker proves otherwise, do not spend time on:

```text
Bridge retreat collision repair
new terrain variants
new bridge families
Aqueduct resurrection
new physics engine
renderer rewrite
trees/grass
advanced reflection systems
new path planner
physical robot deployment
extra UI dashboards
large refactors
hero:10
perfect visual polish
new Cloudflare test projects
server-side Cloudflare architecture
```

The project already has enough technical depth.

The remaining job is:

```text
FREEZE
-> VERIFY
-> DEPLOY
-> DEMONSTRATE
-> SUBMIT
```

---

# 22. Final human deliverables

Before the deadline, the user must have:

```text
working public site
final stable release SHA
public YouTube video under 3 minutes with audio
project/submission description
WebMCP explanation
source repository link / required visibility state
submission form completed before 21:00 BST
```

A separate short user-facing checklist is maintained as:

```text
USER_SUBMISSION_MINI_PLAN_2026-09-03.md
```

The mini plan must stay simple and action-oriented. This `MASTER_PLAN.md` remains the technical authority.

---

# 23. Release principle

**Simple Bricks is the primary submission hero.**

**The final tower is two bricks per layer for six layers: 12 placements.**

**Human blue placement must be ADOPTED without a duplicate robot placement.**

**Cloudflare Git deployment is already proven. Do not experiment with hosting again.**

**Keep `robo-bridge-mcp-git` connected to private `stefanGuiton/ROBO-BRIDGE-MCP` on `main`. When the app is frozen, change only the output directory from `cloudflare-smoke` to `apps/web`.**

**Do not delete or modify the old `robo-bridge-mcp` Direct Upload project.**

**Bridge collision perfection is not a submission blocker.**

**The rest of the day is release QA, final deployment, recording and submission.**
