# ROBO BRIDGE MCP — Submission Master Plan

**Status:** SIMPLE WEBMCP HERO EXTERNALLY PROVEN — CLOUDFLARE GIT PIPELINE PROVEN — PR #7 TOWER CHECKPOINT UNDER RELEASE REVIEW  
**Plan version:** 2026-09-03-M  
**Production branch:** `main`  
**Latest known main before this update:** `4b68aff2d13b11acbdbaad5e928f3b4ba763e501`  
**Merged production integration:** `118abaeadb04031ac2a48b572206ceae90c5bdd5`  
**Candidate tower/pickup checkpoint:** `29953f01d994b9b877a7871e6c2aeda2dee3d77e` on `codex/p0-downstream-integration-prep`  
**Draft PR:** #7 — `Fix pickup colours and alternating tower demo` — **NOT MERGED**  
**Submission deadline:** 2026-09-03 13:00 PDT / **21:00 BST**  
**Primary submission demo:** SIMPLE BRICKS WebMCP hero  
**Secondary demo:** Terrain 7 + Viaduct + Train + Mission  
**Production hosting target:** `https://robo-bridge-mcp-git.pages.dev`

---

# 0. Authority

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

# 1. Executive release truth

The release is now in **freeze / verify / deploy / record / submit** mode.

Already proven:

```text
Simple WebMCP external-browser invocation: PASS
single red brick: PASS
wall construction: PASS
tower planning/execution: PASS in several bounded runs
Cloudflare private GitHub connection: PASS
main -> automatic Pages deployment: PASS
public pages.dev update after push: PASS
static-only hosting: PASS
```

The current product blocker is no longer basic WebMCP execution or hosting.

The current blocker is to make one **final tower + Human interjection scenario** deterministic enough for the recording, freeze its exact semantics, merge only the bounded release changes, and deploy the real app.

Strict remaining path:

```text
RECONCILE FINAL TOWER SPEC
-> FIX / TIGHTEN HUMAN INTERJECTION TEST
-> REVIEW PR #7 EXACT DIFF
-> FINAL SIMPLE BROWSER ACCEPTANCE
-> MERGE BOUNDED RELEASE FIX
-> FREEZE MAIN SHA
-> CLOUDFLARE cloudflare-smoke -> apps/web
-> PUBLIC LIVE-SITE ACCEPTANCE
-> RECORD <3 MIN VIDEO
-> UPLOAD YOUTUBE
-> SUBMIT BEFORE 21:00 BST
```

Do not reopen Bridge collision work.

---

# 2. PR #7 — current candidate checkpoint

PR #7 is open and draft against `main`.

Candidate commit:

```text
29953f01d994b9b877a7871e6c2aeda2dee3d77e
```

Branch:

```text
codex/p0-downstream-integration-prep
```

Reported focused validation:

```text
14 / 14 PASS
staged whitespace checks PASS
browser-script syntax checks PASS
```

PR #7 includes bounded work around:

- Simple-demo tower planning;
- alternating 90-degree tower orientation;
- pickup colour persistence;
- reused source-mesh colour refresh;
- Human pickup diagnostics/logging;
- focused browser pickup checks.

Important: **PR #7 is not release-approved yet and must not be merged only because 14/14 focused tests pass.**

---

# 3. Tower specification conflict — MUST RESOLVE BEFORE MERGE

The earlier authoritative submission handoff specified the final recording tower as:

```text
2 bricks per layer
6 layers
12 placements total
```

with wording:

```text
Build a tower six layers tall using two red bricks per layer.
```

PR #7 currently describes a different alternating cross-laminated tower and its latest collaborative evidence uses:

```text
10 levels
2 bricks per level
20 placements total
alternating 0 / 90 degree orientation
```

This is a real specification difference.

Do not silently convert the final submission target from 12 to 20 placements.

Release rule:

1. choose one final tower specification for the video;
2. make the prompt unambiguous;
3. make the automated/browser acceptance use that same specification;
4. make the Human-interjection guidance use that same target geometry;
5. record only after that exact scenario passes.

Until explicitly superseded, the earlier handoff target remains the safer final-user requirement:

```text
6 layers x 2 bricks = 12 placements
```

The 10-level/20-brick PR #7 implementation can remain available if needed, but it must not overwrite the final recording requirement by accident.

---

# 4. Human brick interjection — CURRENT P0 QA ISSUE

PR #7 reports two separate tower results that must not be combined.

Earlier correctly aligned collaborative run:

```text
20 / 20 satisfied
19 robot COMPLETED
1 Human ADOPTED
no duplicate on adopted slot
robot continued to top
```

Latest user-driven rerun with off-plan Human placement:

```text
stopped at 6 / 20
6 COMPLETED
3 BLOCKED
11 WAITING_DEPENDENCY
blue pickup colour stayed blue
placed blue records stayed blue
```

The problem is geometry/alignment, not colour persistence.

The latest Human bricks were placed off the planned slot/orientation, so automatic arbitrary replanning is **not proven**.

Required bounded correction before calling the interjection demo reliable:

```text
make the intended pending slot obvious
show required position/orientation clearly
ensure the Human places into a compatible pending target
confirm target becomes ADOPTED
confirm robot does not duplicate it
confirm dependencies continue
confirm build completes
```

Do not weaken BuildBoard legality or invent automatic acceptance of arbitrary off-plan placements just to make the demo pass.

A simple guided valid-slot Human contribution is sufficient for the video.

---

# 5. Pickup colour issue — current evidence

PR #7 provides good evidence that pickup colour persistence itself is fixed.

Reported browser evidence:

```text
28 post-reset source materials matched authoritative colours
actual red/blue mouse pickups retained colour
pickup logs retained brick identity and colour
0 console errors
0 console warnings
```

The latest stalled tower also preserved both blue pickups and placed records as blue.

Therefore treat colour persistence as **provisionally fixed**, subject to final visual/browser regression after merge.

Do not confuse this with proving arbitrary Human tower insertion.

---

# 6. Simple WebMCP surface — preserve

Expected production surface:

```text
28 unique WebMCP tools
1 registrar
```

The placement-stream control must continue to use the existing `PlannedPlacementCycleRunner`.

Do not create separate `build_wall` or `build_tower` tools.

Preferred architecture story:

```text
natural language
-> model reasons about geometry/dependencies
-> generic WebMCP tools
-> deterministic runtime executes
-> Human actions update the same world state
```

Cadence contract:

```text
normal = 2000 ms/cycle
50% faster = about 1333 ms/cycle
hard minimum = 1000 ms/cycle
```

Do not weaken IK, collision, workspace or placement authority to meet cadence.

---

# 7. Final Simple recording acceptance

Before recording, prove the exact final release SHA with:

```text
one red brick: PASS
chosen wall demo: PASS
chosen final tower specification: PASS
Human blue valid-slot contribution: ADOPTED
no duplicate robot placement
robot continues after ADOPTED
speed change: PASS
28 WebMCP tools: PASS
mode reset/toggle: PASS
0 blocking console errors
```

Important wall note:

Historical Simple evidence includes both a 3x3 wall and newer PR #7 material referring to a 3x4 wall.

For the final video, use one exact prompt/specification and test that exact one before recording. Do not rely on ambiguous shape wording.

---

# 8. Scene / Bridge scope — frozen

Simple Bricks remains the primary hero.

Bridge remains secondary.

Final Bridge family:

```text
V4.6 Type 2 Viaduct
```

Approved Terrain 7 orientation is intentionally diagonal relative to the camera. Do not straighten it.

Approved table baseline remains frozen:

```text
X = -100 mm
Y = 200 mm
Width = 1750 mm
Depth = 1200 mm
Top height = 1200 mm
```

Normal simulated robot-only Bridge progression previously reached:

```text
183 / 276
```

then stopped on a real fail-closed retreat collision.

This is deferred.

Mixed-mode deterministic completion remains valid evidence:

```text
Human: 1
normal simulated UR10: 3
accelerated simulated placements: 272
276 / 276 accepted
incorrect: 0
TRAIN_FELL -> BUILD -> CROSSED -> COMPLETE
```

Do not claim all 276 parts were robot-executed.

---

# 9. Terrain / deployment asset invariants

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

Final deployment must serve the actual GLB binary, not a Git LFS pointer.

---

# 10. Cloudflare — deployment pipeline is DONE / PROVEN

Do not spend more time experimenting with hosting.

Working project:

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

Observed update time was about 20-30 seconds.

Older Direct Upload project:

```text
robo-bridge-mcp
https://robo-bridge-mcp.pages.dev
```

User instruction:

```text
DO NOT DELETE ANYTHING.
```

Do not modify/delete the old project unless the user explicitly asks.

Do not create more Pages projects.

Do not enable Workers, Functions, D1, R2, AI, Queues, Durable Objects or other server compute.

---

# 11. Final Cloudflare switch

Only after the final app is frozen on `main`, change the existing `robo-bridge-mcp-git` project from:

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

---

# 12. PR #7 release decision procedure

Do **not** merge PR #7 automatically.

Use this order:

```text
1. inspect exact PR #7 diff
2. confirm no unrelated changes
3. resolve final tower count/spec conflict
4. tweak Human interjection guidance/test only as needed
5. rerun focused Simple acceptance
6. verify pickup colours still correct
7. verify Human valid-slot ADOPTED + continuation
8. verify no console regression
9. merge only if bounded and stable
10. note exact merge/main SHA
```

Do not require a general arbitrary-off-plan replanner for submission.

Do not broaden PR #7 into Bridge work.

---

# 13. Time-boxed release tests

After the final bounded fix, run the strongest tests that fit the remaining time:

```bash
npm run verify
npm run submission:smoke
npm run submission:gate
npm run webmcp:audit
```

Then run focused external-browser Simple acceptance.

Do not make `hero:3`, robot-only 276/276, or Bridge retreat collision a blocker.

Record any remaining limitations truthfully.

---

# 14. Final video strategy

Target length:

```text
2:20-2:40
hard maximum under 3:00
```

Recommended structure:

```text
0:00-0:10   start on working app; one red brick
0:10-0:40   wall demo
0:40-1:15   final agreed two-bricks-per-layer tower
             Human adds blue brick into clearly indicated valid pending slot
             show ADOPTED + no duplicate + continuation
1:15-1:30   "Move 50% faster" -> ~1333 ms
1:30-1:55   explain one shared browser world / BuildBoard / WebMCP
1:55-2:20   optional Bridge mode: Terrain 7 + Viaduct + semantic arch change
2:20-2:35   concise close
```

If the Human interjection remains unreliable, do not improvise arbitrary placement during recording. Use the known compatible slot/orientation that has already demonstrated ADOPTED behaviour.

If Bridge mode is not presentation-ready, omit live Bridge execution.

---

# 15. Claim safety

Safe:

- Codex controls a deterministic browser workcell through WebMCP;
- Codex can inspect state, plan generic placements and execute them through shared authorities;
- a correctly aligned compatible Human placement can be adopted into the active plan;
- pickup colour persistence is verified in bounded browser tests;
- placement cadence can be changed conversationally;
- Terrain / Viaduct / Train / Mission share the same application architecture;
- Cloudflare serves the application as static assets;
- deterministic Bridge completion can use an explicitly labelled accelerated-simulation path.

Do not claim:

- arbitrary off-plan Human insertion automatically replans successfully;
- physical UR10 readiness;
- physical collision safety;
- all 276 Bridge parts robot-executed;
- physical one-second cycles;
- physical accuracy/repeatability;
- 120 FPS based only on render-disabled tests.

---

# 16. Hard scope cuts

Do not spend submission time on:

```text
Bridge retreat collision repair
new path planner
arbitrary Human off-plan replanning
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

---

# 17. Exact remaining execution order

```text
A. Decide/freeze the exact final tower spec.
B. Make the Human valid target obvious and retest the interjection.
C. Review PR #7 exact diff and focused evidence.
D. Merge only the bounded accepted fix to main.
E. Record the exact final main SHA.
F. Run final Simple regression / strongest time-boxed gates.
G. Change Cloudflare output cloudflare-smoke -> apps/web.
H. Test public app, assets, console and WebMCP.
I. Record the <3 minute video.
J. Upload public YouTube video.
K. Complete submission before 21:00 BST.
L. Only then do optional polish.
```

---

# 18. Final release principle

**The deployment pipeline is solved. Stop experimenting with Cloudflare.**

**PR #7 is a useful candidate checkpoint, but it is not yet release-ready because the latest off-plan Human interjection stalled the 20-target tower at 6/20 and its 20-target tower specification conflicts with the earlier 12-target final handoff.**

**Do not solve this by weakening authority rules or building a general replanner. Use one explicit final tower specification and one clearly compatible Human slot, prove ADOPTED + continuation, then freeze and merge the bounded fix.**

**After that: deploy `apps/web`, test the public site, record, and submit.**
