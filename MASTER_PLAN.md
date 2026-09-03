# ROBO BRIDGE MCP — Submission Master Plan

**Status:** SIMPLE WEBMCP HERO EXTERNALLY PROVEN — TOWER SEMANTICS FIX IN PROGRESS — DEPLOY / RECORD NEXT  
**Plan version:** 2026-09-03-K  
**Production branch:** `main`  
**Current production merge:** `118abaeadb04031ac2a48b572206ceae90c5bdd5`  
**Merged integration PR:** #6 — `P0 downstream Train, Mission, WebMCP and Construction prep`  
**Submission deadline:** 2026-09-03 13:00 PDT / 21:00 BST  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Canonical authority:** `RevisionClock` + `BuildBoard` + `PlacementAuthority` + `RobotController`  
**Primary submission demo:** SIMPLE BRICKS WebMCP hero  
**Secondary demo:** Terrain 7 + Viaduct + Train + Mission

---

# 0. Authority

This file is the authoritative submission execution plan.

If an older Oracle package, branch note, handoff file, README or chat instruction conflicts with this file, **this file wins for the submission sprint**.

Evidence must remain tied to a concrete runtime/commit. Do not combine incompatible evidence into a fake release claim.

Hard authority chain:

`RevisionClock -> BuildBoard + PlacementAuthority + RobotController -> Runtime -> Renderer / Player / Perception / WebMCP`

Never create:

- a second BuildBoard;
- a second accepted inventory/occupancy truth;
- a second RobotController;
- a second RevisionClock;
- WebMCP-only placement truth;
- a train-owned bridge-complete Boolean;
- mission-owned physical-part truth;
- direct completion/support setters;
- joint-level WebMCP controls;
- a second production render/frame loop.

Simulator evidence must never be described as physical UR10 readiness.

---

# 1. Executive status — CURRENT TRUTH

PR #6 has now been merged into `main`.

Current merged production commit:

```text
118abaeadb04031ac2a48b572206ceae90c5bdd5
```

The project now has two intentional demo modes:

```text
SIMPLE BRICKS
BRIDGE
```

The Simple Bricks mode is now the primary submission/video path because it proves the generic WebMCP + shared-world interaction with much lower execution risk.

The Bridge mode remains a stronger secondary demonstration of Terrain 7, Viaduct design, Train failure/recovery and Mission orchestration.

Current critical path:

```text
FIX TOWER REQUEST SEMANTICS
-> RE-RUN EXTERNAL-BROWSER WEBMCP SIMPLE TESTS
-> FREEZE SIMPLE HERO
-> CLOUDFLARE apps/web
-> LIVE-SITE WEBMCP SMOKE
-> VIDEO
-> DEVPOST / SUBMIT
```

Do not reopen bridge collision work before the submission is safe.

---

# 2. Merged Simple Bricks implementation — PRESERVE

Merged PR #6 reports the following integrated Simple mode behaviour:

```text
one brick: 1/1
3x3 wall: 9/9
2x2x6 tower: 24/24
Human blue placement: ADOPTED
no duplicate placement on adopted slot
live cadence changes: PASS
browser console: 0 errors / 0 warnings
```

The Simple/Bridge mode selector reuses the same:

- RobotController;
- BuildBoard;
- PlacementAuthority;
- PlacementLookaheadCoordinator;
- PlannedPlacementCycleRunner;
- worldRevision;
- WebMCP registrar.

Do not create separate Simple-mode authorities.

---

# 3. WebMCP — NOW 28 TOOLS

The merged runtime now intentionally has:

```text
28 unique WebMCP tools
1 registrar
```

The additional Simple-demo control tool is:

```text
control_placement_stream
```

It controls the existing placement-cycle runner; it is not a second executor.

Current Simple cadence contract:

```text
normal: 2000 ms/cycle
50% faster: about 1333 ms/cycle
hard minimum: 1000 ms/cycle
```

Changing cadence must not weaken collision, IK, workspace or placement-authority rules.

---

# 4. IMPORTANT NEW EVIDENCE — EXTERNAL-BROWSER WEBMCP CONTROL WORKS

The user has now manually tested Codex controlling the real WebMCP surface through a local external browser.

User-reported successful WebMCP demonstrations:

```text
1. create/place a single red brick — WORKS
2. generate and build a red brick wall — WORKS
3. generate and build a red brick tower — WebMCP/execution works, but current tower shape/count interpretation needs correction
```

This is important because it moves the project beyond registration/callback-only evidence: Codex has successfully driven the actual local browser WebMCP flow for real Simple-demo tasks.

Treat this as user-observed functional evidence, not a replacement for a final recorded release test.

---

# 5. CURRENT SIMPLE-DEMO BLOCKER — TOWER SHAPE / COUNT SEMANTICS

Latest manual external-WebMCP test found one bounded issue:

```text
tower request expected two blocks in the relevant tower arrangement
current generated plan used four blocks instead
```

Codex is actively fixing this.

Do NOT redesign the placement stream or robot runtime.

This is a natural-language plan-generation / shape-semantics issue.

Required fix:

1. preserve the generic placement-stream API;
2. preserve stable placement IDs and dependencies;
3. interpret the user's requested tower footprint/count exactly;
4. generate only the requested number of placements per layer/step;
5. re-run the same external-browser WebMCP request;
6. confirm no regression to one-brick and wall demos.

The previously merged automated `2x2x6 = 24 placements` test remains valid for that exact specification. The new bug concerns the latest user-requested tower semantics and must be fixed without breaking the existing explicit 2x2x6 case.

---

# 6. Final Simple WebMCP recording set

The primary recording should demonstrate a compact progression.

## A. One brick

Example request:

```text
Place a red brick on the mat.
```

Expected journey:

```text
scene/perception read
-> workspace read
-> placement plan
-> robot pick/place
-> authoritative state readback
```

## B. Wall

Example request:

```text
Build a 3 by 3 wall.
```

Expected:

```text
9 logical targets
bottom-up dependencies
continuous execution
```

## C. Tower + Human adaptation

Use the exact tower wording/geometry that is confirmed after the current count-semantics fix.

During execution the Human may place a blue brick into a compatible pending slot.

Required adaptive behaviour:

```text
Human placement
-> worldRevision changes
-> compatible pending target becomes ADOPTED
-> actor = human
-> actualBrickId recorded
-> no duplicate robot placement
-> dependent steps continue
```

This is a key submission moment because it demonstrates one shared world rather than a scripted animation.

---

# 7. Colour semantics — PRESERVE

For Simple-demo structures, red may be a source preference rather than a strict geometric-validity condition.

Preserve distinction:

```text
colour = strict colour requirement when requested
preferredColour = source preference; compatible Human colour may still satisfy geometry
```

Do not globally weaken strict colour rules.

---

# 8. Final scene layout — LOCKED

The user has approved the current layout.

Table:

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

It appears visually diagonal / roughly 45 degrees relative to the table/camera, but its internal/world XY remains aligned to the authoritative coordinate frame.

Do not visually straighten it by changing world coordinates.

No more layout tuning unless the user explicitly requests it.

---

# 9. Bridge mode — SECONDARY / PRESERVED

The merged runtime retains:

- Terrain 7;
- V4.6 Viaduct;
- WebMCP bridge design;
- Train;
- Mission;
- explicit `simulated_fast_forward` construction completion.

Latest merged Bridge hero plan evidence before merge:

```text
Viaduct
276 total parts
internal prohibited intersections: 0
unsupported declared targets: 0
```

Mixed-mode hero evidence:

```text
Human: 1
real simulated UR10: 3
accelerated simulation: 272
276/276 accepted and correct
incorrect: 0
TRAIN_FELL -> same mission BUILD -> CROSSED -> COMPLETE
reset -> new missionId
hero:1 PASS
```

This is a truthful simulator hero path.

Do NOT claim all 276 placements were robot-executed.

---

# 10. Bridge collision limitation — DEFERRED

Normal robot-only Viaduct progression previously reached:

```text
183 / 276
```

and then stopped on an empty-gripper retreat collision.

Collision checks remain enabled and fail closed.

This is explicitly deferred until after the submission is safe.

Do not spend current critical-path time on:

- retreat collision tuning;
- general path planning;
- workspace widening;
- proxy redesign;
- robot-only 276/276 proof.

---

# 11. Terrain 7 invariants — PRESERVE

Production Terrain 7 asset fingerprint previously reported:

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

Water is not BuildBoard truth, Train support truth or Mission completion truth.

---

# 12. Human terrain occlusion — PRESERVE

Required invariant:

```text
camera -> terrain -> target = block Human interaction
camera -> target -> terrain = allow Human interaction
```

Solid terrain may occlude Human placement.

Water and authored markers do not.

Occlusion must never change Agent legality, BuildPlan, BuildBoard, Train support or Mission truth.

---

# 13. ChatGPT Work / remote testing

While the user is away from the physical computer, ChatGPT Work may safely:

- clone/fetch `main`;
- use a bounded test/fix branch;
- run automated tests;
- run browser/console verification;
- test the WebMCP rectangle capability page;
- test deployed/public Simple-demo flows if the browser exposes Site Tools;
- take screenshots for acceptance where useful;
- commit/push bounded P0 fixes on a separate branch.

Do not let Work:

- force-push `main`;
- rewrite history;
- delete branches/assets;
- change repository visibility/secrets;
- make broad architecture changes.

If Work finds a bug, fix it on a branch and report exact SHA/PR.

---

# 14. Cloudflare — NOW PARALLEL CRITICAL PATH

Deployment should be made safe independently of remaining demo refinement.

Preferred production route:

```text
GitHub main
-> Cloudflare Pages
-> apps/web
```

First prove Git connectivity with the tiny smoke page if not already complete.

Then switch the same project to:

```text
production branch: main
output directory: apps/web
```

Before final recording verify:

```text
public index returns 200
Terrain 7 GLB returns 200 / real binary, not LFS pointer
Three/vendor assets load
canvas renders
no blocking console errors
native WebMCP surface available in the chosen recording browser
```

Do not redesign deployment after it is working.

---

# 15. Immediate strict execution order

## NOW-1 — finish tower semantics fix

Codex finishes the current bounded tower placement-count/footprint correction.

No unrelated work.

## NOW-2 — re-run external WebMCP Simple acceptance

On the same local external-browser route prove:

```text
one red brick: PASS
red wall: PASS
corrected tower: PASS
```

If the tower includes Human interference, also prove:

```text
blue compatible brick -> ADOPTED
no duplicate
execution continues
```

## NOW-3 — freeze Simple hero

Run focused regression on:

```text
Simple mode
28-tool registration
one brick
wall
tower
ADOPTED
speed change
mode reset/toggle
console
```

Do not wait for Bridge collision work.

## NOW-4 — deploy apps/web

Deploy the selected `main`/release SHA through Cloudflare.

## NOW-5 — live-site smoke

Verify public page + assets + WebMCP discovery/invocation.

## NOW-6 — record video

Primary story should be Simple WebMCP because it is fast and reliable.

Secondary Bridge segment is optional/brief.

## NOW-7 — submit

Complete Devpost/source/live URL/video fields and stop mutating the submitted release.

---

# 16. Release tests — TIME-BOXED

After the tower fix and before recording, run the strongest tests that fit the remaining time.

Priority:

```bash
npm run verify
npm run submission:smoke
npm run submission:gate
npm run webmcp:audit
```

Then focused external-browser hero smoke.

Do not make `hero:3` or robot-only Bridge completion a blocker if the Simple hero and merged mixed-mode Bridge fallback remain stable.

Record failures truthfully.

Do not hide gates.

---

# 17. Final recording narrative

A strong under-3-minute recording can now be:

```text
0:00 working Simple scene immediately
0:10 Codex reads WebMCP scene/workspace
0:25 place one red brick
0:45 request a wall -> plan -> rapid execution
1:15 request tower -> plan -> execution
1:40 user places blue brick -> ADOPTED -> Codex continues
1:55 ask Codex to move 50% faster -> cadence changes
2:10 switch/show Bridge mode briefly
2:20 Codex changes Viaduct arch count / hologram
2:35 mention Train failure/recovery + shared BuildBoard
2:50 close
```

If Bridge mode is not presentation-ready, omit the live Bridge execution and keep the video focused on the fully stable Simple WebMCP interaction.

Judges need a clear working WebMCP story more than maximum feature count.

---

# 18. Final claim safety

Safe claims include:

- Codex successfully controls the browser simulator through WebMCP;
- Codex can inspect state, plan placements and execute generic brick structures;
- the shared placement stream adapts when the Human satisfies a compatible target;
- the user can change placement cadence through WebMCP;
- the same application retains the Terrain 7 / Viaduct / Train / Mission mode;
- the mixed-mode Bridge path reached authoritative 276/276 and CROSSED/COMPLETE using explicit accelerated simulation for most remaining placements.

Do not claim:

- physical UR10 readiness;
- physical one-second robot cycles;
- all 276 Viaduct placements robot-executed;
- physical collision safety;
- physical reliability/accuracy;
- `hero:3` if it has not actually been proven;
- native Cloud/Work WebMCP invocation unless the tested browser actually discovers/invokes Site Tools.

---

# 19. Final principle

**The submission no longer depends on perfecting the 276-part physical robot path.**

**The primary demo is now the Simple Bricks WebMCP hero, which has already been successfully controlled by Codex in a local external browser for one brick, a wall and a tower. Fix the current tower count semantics, retest, freeze, deploy and record.**

**Bridge mode is preserved as the richer secondary story, not the release blocker.**

**User = final visual/recording judgement. Codex/Work = implementation and test engines.**