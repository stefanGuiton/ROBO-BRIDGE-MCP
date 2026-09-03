# ROBO BRIDGE MCP — Submission Master Plan

**Status:** FINAL SUBMISSION MORNING — TERRAIN 7 + DOWNSTREAM COMPOSITION + WEBMCP RELEASE GATE  
**Plan version:** 2026-09-03-I  
**Production runtime code baseline:** `ec3c9237c224210112acd0ba71ddc06ea95f9f91`  
**Active Construction WIP:** draft PR #5, `codex/p0-construction-integration` at `d6154a58d97f52b3058d04c50eeb3ab5066de70c`  
**Planned downstream branch:** `codex/p0-downstream-integration-prep` — not yet visible remotely at the time of this update; any Sol work remains local/unverified until pushed  
**Submission deadline:** 2026-09-03 13:00 PDT / 21:00 BST  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Canonical authority:** `RevisionClock` + `BuildBoard` + `PlacementAuthority` + `RobotController`  
**Primary goal:** one complete, reliable, judge-visible WebMCP collaboration journey

---

# 0. Authority

This file is the authoritative submission execution plan.

If an older plan, prototype README, Oracle report, standalone package, experimental branch, or chat instruction conflicts with this file, **this file wins for the submission sprint**.

A package can be production-quality without being integrated. A draft branch can contain useful work without being release-ready. Evidence from different commits must never be combined into a fake green release result.

Required hero loop:

`CURATED TERRAIN -> CODEX CO-DESIGN -> V4.6 BUILDPLAN -> EXACT HOLOGRAM -> FREEZE -> HUMAN + CODEX/UR10 BUILD -> EARLY TRAIN FAILURE -> CONTINUE/REPAIR -> TRAIN SUCCESS -> MISSION COMPLETE -> TRY AGAIN`

Central narrative:

**Codex decides. Deterministic systems execute. Human actions change the shared world. The runtime adapts. BuildBoard controls TEST. The train proves the result.**

Hard authority chain:

`RevisionClock -> BuildBoard + PlacementAuthority + RobotController -> Runtime -> Renderer / Player / Perception / WebMCP`

Never create:

- a second BuildBoard;
- a second accepted inventory/occupancy truth;
- a second RobotController;
- a second RevisionClock;
- a WebMCP-only bridge state;
- a train-owned bridge-complete Boolean;
- a mission-owned brick/support truth;
- an instant-build shortcut;
- direct completion/support setters;
- joint-level WebMCP controls.

Do not restore NVIDIA Newton.

---

# 1. Executive status

The project is no longer missing major P0 subsystems. The remaining work is final challenge geometry, small Construction/reset hardening, downstream composition, WebMCP semantic integration, one exact hero loop, release evidence and submission.

Approximate status:

- **Required P0 code/components available:** ~98%.
- **Accepted production runtime integration:** ~82%.
- **Construction WIP:** substantial and useful, but not mergeable while the current BuildPlan has prohibited internal intersections and reset safety is unresolved.
- **Train / Mission / Submission Gate:** verified packages exist; their final composition must be proven on one pushed downstream commit.
- **WebMCP:** current accepted runtime exposes 19 tools; intended final runtime must expose exactly 27 unique tools through one registrar.

Current critical path:

`PUSH DOWNSTREAM BRANCH -> TERRAIN 7 WATER DATUM -> CLEAN V4.6 BUILDPLAN -> RESET/ERROR HARDENING -> CONSTRUCTION ACCEPTANCE -> TRAIN/MISSION -> 27-TOOL NATIVE WEBMCP -> SUBMISSION GATE -> HERO 3/3 -> DEPLOY -> VIDEO/SUBMIT`

Do not start another large subsystem from scratch.

---

# 2. Accepted production runtime baseline

Production runtime code baseline:

`ec3c9237c224210112acd0ba71ddc06ea95f9f91`

`main` contains later plan-only commits; the runtime code baseline above is the accepted gameplay checkpoint.

It proves:

- authoritative V4.6 BridgeHost;
- exact BuildPlan-derived Aqueduct hologram;
- five bridge-design WebMCP tools;
- fourteen low-level robot/build WebMCP tools;
- 19 unique current production tools;
- accepted older EASY terrain integration;
- unified challenge-owned bridge / ENTRY / EXIT transform;
- player and collision-proxy cleanup;
- reliability checkpoint 20/20.

The older terrain remains a fallback only. The final submission direction is Terrain 7.

---

# 3. Construction WIP — preserve, fix, do not merge yet

Draft PR #5:

```text
branch: codex/p0-construction-integration
checkpoint: d6154a58d97f52b3058d04c50eeb3ab5066de70c
base runtime: ec3c9237...
status: valuable WIP / blocked acceptance / do not merge
```

Verified WIP accomplishments include:

- current BridgeHost BuildPlan freeze;
- dynamic shared PartRegistry and inventory;
- one existing BuildBoard;
- existing placement lookahead/cycle runner/RobotController/PlacementAuthority;
- no stale 476-part production BOM imported;
- both Human and Agent permitted for current part classes;
- typed custom-part capture/collision metadata;
- exact custom-part visuals;
- frozen-design mutation lock;
- shared challenge endpoint controls;
- one human + multiple robot placements accepted on the same BuildBoard;
- planned-source theft -> automatic compatible-source reassignment;
- human completion of a Codex-intended target -> `ADOPTED` rather than duplicate placement;
- controller accepted 15 parts before correctly stopping at a real collision;
- branch-reported regression evidence: JS 163/163, Robot 30/30, Compiler 26/26, WebMCP 15/15, Player 26/26, Reliability 20/20, verify PASS;
- final reported Chrome run: 0 console errors, 0 warnings.

Current audited old-plan BOM:

```text
planId: bp_0d7627b1
parts: 131
1x1x1: 87
1x2x1: 15
ARCH_A: 21
ARCH_B: 6
TRACK_SEGMENT: 2
```

Measured custom-part cycle starts averaged approximately **3.61 s**. Do not claim one-second bridge cycles. Earlier ~1 s evidence applies only to simpler generic simulator structures.

---

# 4. Old-plan geometry blocker — replace with final Terrain 7 compile before compiler surgery

The Construction branch exact geometry audit confirmed:

```text
9 arch/arch intersections
12 standard-brick/arch intersections
21 prohibited internal part-part intersections total
```

These are exact physical intersections, not conservative AABB false positives.

A common world transform cannot fix internal generated-part overlap.

Therefore:

- never disable collision checks;
- never force-accept colliding targets;
- never silently delete required parts;
- never merge PR #5 while the final production BuildPlan still contains prohibited exact intersections.

However, **do not repair the old 21-intersection BuildPlan first**. Terrain 7 changes the challenge span/support input and can legitimately produce a different V4.6 BuildPlan.

Decision rule:

```text
Compile final Terrain 7 challenge first.
IF exact internal intersections == 0:
    continue Construction acceptance.
ELSE:
    freeze final challenge geometry;
    perform one bounded V4.6 geometry/compiler repair against that final plan only.
```

---

# 5. FINAL TERRAIN STRATEGY — Terrain 7 + fixed water datum

The manually authored 3D support-floor / stair-step strategy is **superseded for P0**.

Final terrain asset direction:

`Terrain_7_Main.glb`

Authoring frame:

```text
ENTRY = (0.000, 0.000, 0.000) m
EXIT  = (0.370, 0.000, 0.000) m
ENTRY -> EXIT = +X
nominal span = 370 mm
```

The terrain contains a water object named:

`Plane`

Final authoritative build/foundation datum:

```text
Z = -132.718 mm
```

This is the authored water level and is now the P0 challenge support baseline.

## 5.1 Final support rule

Use one constant horizontal build datum through the real ChallengeService/V4.6 support seam:

```text
support baseline = Z -132.718 mm
```

Do NOT use:

- a manually painted supportTopMap;
- terrain-height stair-stepping;
- per-cell support-floor bricks;
- a second challenge/support authority.

Some bridge/terrain clipping at the terrain banks is acceptable for P0 if the required bridge remains visible/placeable and authoritative internal bridge geometry is valid.

Terrain overlap is diagnostic only; it is not completion truth.

## 5.2 One coherent challenge transform

Terrain, ENTRY, EXIT, bridge, hologram, BuildBoard targets, train route and interaction occlusion inherit one challenge/world transform.

Do not rotate/move only the bridge or hologram.

Preferred authored bridge direction is +X with yaw 0 in terrain-local coordinates.

---

# 6. Human placement visibility — terrain-first ray occlusion

The final Human placement UX must prevent click-through placement behind hills/rocks.

This is **line-of-sight interaction state**, not BuildPlan validity.

Required rule:

```text
camera -> terrain -> target
= BLOCK HUMAN INTERACTION

camera -> target -> terrain
= ALLOW
```

Compare nearest solid-terrain ray hit against candidate target/snap-point distance with a small precision epsilon.

Likely solid occluders to verify from Terrain 7:

```text
Terrain
Tunnel
Entry_Structure
```

Explicitly exclude:

```text
Plane       // water
ENTRY
EXIT
lights/cameras
holograms
ghosts/debug helpers
```

Water must never block placement.

Camera occlusion must NOT mutate:

- BuildPlan;
- required placement IDs;
- BuildBoard;
- Agent/Robot target legality;
- Mission completion;
- Train support truth.

A target hidden from one camera angle becomes interactable again when the player moves to a clear line of sight.

---

# 7. Adversarial Hero QA — confirmed P0 hardening

Package:

`ORACLE_P0_ADVERSARIAL_HERO_QA_V1.zip`

Important evidence boundary:

The requested downstream branch was unavailable remotely, so the Oracle audited Construction fallback `d6154a58...`. Its findings are valid risks for that code; they are not proof about any newer unpushed Sol branch.

## 7.1 Construction reset defect — MUST FIX

Reset is unsafe when:

- unrelated RobotController motion is active; or
- the gripper is holding a construction part.

Required contract:

```text
reset request
-> cancel relevant execution
-> await full robot idle
-> resolve/no held part
-> reset Construction/Train/BuildBoard/controller coherently
-> verify clean fingerprint
```

Also fix the startup rollback path so cleanup cannot depend on an unsafe bound `this.reset()` call.

## 7.2 Runtime availability/error preservation — HIGH PRIORITY

The runtime preflight can incorrectly report placement availability without all required placement methods, and known machine errors can be collapsed to generic `internal_error`.

Final semantic error shape should contain, where applicable:

```text
ok
code
retryable
currentPhase
currentMissionId
currentRevision
permittedNextActions
recoveryAction
```

## 7.3 Human/Agent race handling — preserve

Current Construction evidence is strong:

- human steals planned source -> compatible source reselected;
- human completes planned target -> `ADOPTED`;
- reserved-source conflict repaired before latch;
- design mutation before freeze revision-checks correctly;
- design mutation after freeze rejected.

---

# 8. Browser Performance / Soak QA — reassuring but GPU still needs one real check

Package:

`ORACLE_BROWSER_PERFORMANCE_SOAK_QA_V1.zip`

Evidence scope again used Construction fallback because downstream was unavailable.

Reassuring bounded lifecycle evidence:

```text
50/50 workcell resets PASS
listener delta 0
timeout/interval delta 0
scene-object delta 0
brick/target delta 0
active RAF delta 0
20/20 pointer-lock entries PASS
50/50 bounded Construction module cycles PASS
12 registrar lifecycles: 19 tools, 19 unique, 0 duplicates
```

No duplicate production RAF loop was found.

The Oracle could not create a WebGL context, so render-disabled ~60 FPS measurements are **not production GPU evidence**.

Minimum final-machine recording check:

```text
10-second real WebGL sample
one RAF authority
no console errors
no progressive reset slowdown
no repeated >33.3 ms long-frame storm
```

---

# 9. Independent WebMCP Judge Audit — NEW release gate

Package:

`ORACLE_WEBMCP_JUDGE_AUDIT_FINAL_V1.zip`

SHA-256:

`6296439c7691a245b4edf1638ecf7fc155cefdcd1a8d9de659e6c833a40e7312`

Evidence boundary:

- audited accepted runtime source `ec3c9237...`;
- current browser evidence showed the 19-tool catalogue;
- Mission and Train packages were separately inspected/tested;
- no final integrated 27-tool browser page was available;
- package tests are not production integration proof.

The Oracle independently reran:

```text
Mission package: 114/114 PASS
Train package: 47/47 PASS
```

Judge assessment:

```text
current accepted WebMCP score: 6.6 / 10
intended potential after P0 fixes: 9.1 / 10
```

Interpretation:

The idea and authority architecture are strong enough for a top-tier WebMCP submission, but the accepted production surface is not yet a complete semantic mission because only 19 tools are live.

## 9.1 Final tool composition — BLOCKING RELEASE REQUIREMENT

Current accepted browser/source:

```text
14 low-level
+ 5 bridge-design
= 19 unique tools
```

Final required surface:

```text
14 low-level
+ 5 guarded bridge-design
+ 8 mission/terrain
= 27 unique tools
```

Required Mission/Terrain tools:

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

Release gate:

```text
registeredToolCount === 27
uniqueToolCount === 27
registrationOwnerCount === 1
missionServiceReady === true
constructionServiceReady === true
trainServiceReady === true
```

Do not accept a partial 14-tool or 19-tool catalogue in the final profile.

## 9.2 Semantic tool journey — make this the flagship path

Recommended agent journey:

```text
get_mission_state
-> update_bridge_design
-> start_bridge_build
-> build_next_parts
-> get_build_progress
-> test_bridge -> TRAIN_FELL
-> build_next_parts
-> test_bridge -> CROSSED
-> COMPLETE
```

`get_mission_state` should explicitly be the first call for a bridge mission and after stale/wrong-phase/cancelled results.

`build_next_parts` should explicitly be the preferred mission build action.

Low-level tools remain available but must not look like the recommended normal bridge workflow.

## 9.3 Blocking annotation fix

`plan_placement_queue` currently changes logical placement-stream, ghost and activity state.

Therefore:

```text
readOnlyHint must be false
```

Its description must state that it is a low-level planning tool and does **not** advance the normal mission.

Do not change behavior merely to preserve a read-only annotation.

## 9.4 Low-level reset guard

`reset_workcell` must not undermine an active MissionService-owned mission.

Final description/guard should make clear:

```text
use reset_mission during an active bridge mission
```

`reset_workcell` is a destructive low-level workcell reset, not the flagship recovery action.

## 9.5 Response-size / paging fixes

Current browser evidence found four reads above the preferred ~1,500-character normal-response target:

```text
get_scene_state        ~2,414 chars — truncated, no cursor
observe_camera         ~1,914 chars
get_bridge_design      ~2,626 chars
get_bridge_capabilities ~5,202 chars
```

Highest priority is correctness:

`get_scene_state` must not silently truncate later objects without a paging/retrieval path.

Deadline-safe fixes:

- page `get_scene_state` or provide a cursor/continuation;
- default bridge capabilities off in `get_bridge_design`;
- compact `get_bridge_capabilities`;
- compact `observe_camera`;
- preserve revision/identity fields.

The Mission package's normal outputs are already compact in the audit, typically ~333–688 characters for measured summary operations.

## 9.6 Recovery / next-action fixes

Mission package behavior is strong:

- exact mission ID/revision/world revision required for mutations;
- stale identities rejected;
- concurrent build/test guarded;
- `TRAIN_FELL` returns to BUILD;
- only `CROSSED` may complete;
- reset creates a new mission ID;
- old IDs fail after reset.

Deadline-safe usability fixes:

- when build remaining == 0, return `test_bridge` first and remove `build_next_parts` from next actions;
- optionally return `alreadyComplete:true` when a build batch has nothing left;
- source waiting/reassignment should give a specific recovery action;
- low-level errors should include `retryable`, `recovery`, and a semantic `recommendedTool` where practical.

## 9.7 Native registration nuance — VERIFY, DO NOT ASSUME

The accepted source uses:

```text
document.modelContext.registerTool
```

The independent judge audit found this consistent with the GoogleChromeLabs support prompt it reviewed.

Previous browser evidence also observed an environment exposing `navigator.modelContext`.

Therefore the final rule is:

- do not assume either location globally;
- inspect the exact judging/supported browser;
- use one normalized supported native object;
- keep one registrar;
- do not register on both objects independently;
- do not create a fake production shim;
- record which native object is actually used in final release evidence.

## 9.8 Judge-video tool sequence

Best eight visible calls:

```text
1. get_mission_state
2. update_bridge_design
3. start_bridge_build
4. build_next_parts
5. get_build_progress
6. test_bridge -> TRAIN_FELL
7. build_next_parts
8. test_bridge -> CROSSED
```

Do not spend video time on low-level `move_tool`, `latch`, `unlatch`, `plan_placement_queue`, etc. unless needed for a tiny explanatory cut.

---

# 10. Canonical package inventory

## Bridge core/design

Reference package:

`ORACLE_BRIDGE_CORE_MAIN_DEMO_V1`

Do not restore standalone V4.6 execution authority.

## Construction

Use only:

`ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_V1.zip`

Most integration is already represented in PR #5.

Do not use old `ALL_AVAILABLE_WORK` packages.

## Train

Canonical integration package:

`ORACLE_TRAIN_MAIN_DEMO_ADAPTERS_V1(1).zip`

Verified package evidence includes:

- 47/47 Node tests;
- browser acceptance 10/10;
- Construction compatibility 7/7;
- source-equivalence 16/16;
- partial authoritative BuildBoard -> `TRAIN_FELL`;
- complete authoritative support -> `CROSSED`;
- yaw/translation/elevation independence;
- repeated reset and coupler/self-overlap regression coverage.

The package must consume live ChallengeService route/transform data.

## Mission

Canonical integration package:

`ORACLE_MISSION_INTEGRATION_ADAPTERS_V1(1).zip`

Verified:

- 114/114 Mission + adapter tests;
- package verification PASS;
- Construction adapter smoke PASS;
- Train `TRAIN_FELL` smoke PASS;
- Train `CROSSED` smoke PASS.

Prefer:

```text
createMissionTrainAdapter(trainIntegration)
-> getState()
-> test()
-> reset()
```

Do not regress to a second raw Train wrapper.

## Submission Gate

Canonical package:

`ORACLE_SUBMISSION_GATE_CURRENT_RUNTIME_V1(1).zip`

Commands:

```bash
npm run test:submission
npm run submission:smoke
npm run submission:gate
npm run webmcp:audit
npm run hero:1
npm run hero:3
npm run hero:10
npm run release:evidence
```

All final services must be composed into one remote commit before release evidence counts.

## Release/deployment readiness

Package:

`ORACLE_RELEASE_DEPLOYMENT_READINESS_V1`

Recommended path:

`GitHub -> Cloudflare Pages -> clean-browser acceptance -> public submission`

Final release checker must target Terrain 7 and the actual final native WebMCP seam.

---

# 11. Current completion dashboard

| Deliverable | Status | Current truth |
|---|---|---|
| MAIN_DEMO authority chain | COMPLETE | Accepted architecture |
| BridgeHost + exact hologram | COMPLETE | Production main |
| 19 current WebMCP tools | COMPLETE | 14 low-level + 5 design |
| Final 27-tool semantic surface | BLOCKED / READY | Mission tools package exists; production registration unproven |
| Construction package | COMPLETE | Package complete |
| Construction integration | IN_PROGRESS | PR #5 substantial WIP |
| Final clean V4.6 BuildPlan | BLOCKED | Old plan has 21 intersections; Terrain 7 recompile pending |
| Atomic Construction reset | NEEDS_FIX | Adversarial QA reproduced defect |
| Human source theft + target adoption | PASS | Existing evidence preserved |
| Terrain 7 final challenge | IN_PROGRESS | Final asset chosen |
| Water datum -132.718 mm | READY | Final support strategy selected |
| Terrain-first Human occlusion | READY | Integration Oracle prepared |
| Train package | COMPLETE | 47/47 package evidence |
| Train final integration | READY / UNVERIFIED | Must prove in pushed downstream commit |
| Mission package | COMPLETE | 114/114 package evidence |
| Mission final integration | READY / UNVERIFIED | Must prove in pushed downstream commit |
| `plan_placement_queue` annotation | NEEDS_FIX | Must be mutation / readOnly false |
| Semantic error/recovery envelope | NEEDS_FIX / VERIFY | Mission strong; low-level path needs alignment |
| `get_scene_state` paging | NEEDS_FIX | Current truncation has no continuation |
| Other oversized reads | SHOULD_FIX | Compact if deadline-safe |
| Native WebMCP exact browser | VERIFY | final native object + 27-tool enumeration required |
| Registrar duplicate/lifecycle | PASS IN HARNESS | 19 unique / 0 duplicates across bounded lifecycles |
| Submission Gate package | COMPLETE | Integration pending |
| Browser lifecycle soak | PASS IN BOUNDED HARNESS | no progressive leak/duplicate RAF found |
| Real integrated GPU profile | NOT_VERIFIED | needs short final-machine check |
| One integrated hero loop | BLOCKED | final geometry + composition required |
| Hero 3/3 | BLOCKED | release minimum |
| Hosted URL | READY | Cloudflare procedure prepared |
| Public repo/provenance | IN_PROGRESS | complete before public release |
| Final video | BLOCKED | record after exact hero freeze |

---

# 12. Immediate Sol High branch rule

Intended branch:

`codex/p0-downstream-integration-prep`

At this plan update it is not visible remotely.

Therefore:

1. if Sol has local work, push it immediately;
2. record exact HEAD SHA;
3. preserve checkpoint commits for Train, Mission, QA/WebMCP and Construction hardening;
4. draft PR base remains `codex/p0-construction-integration`, NOT `main`;
5. do not merge until final Terrain 7 geometry and hero gates pass.

No Oracle result from an older fallback branch may be used as proof that the final downstream composition passed.

---

# 13. STRICT EXECUTION ORDER — submission morning

## MORNING-1 — identify/push the real downstream commit

Record:

```text
branch
HEAD SHA
parent SHA
Train status
Mission status
Submission Gate status
native tool count
```

If Sol has not finished, resume from PR #5 with the canonical packages.

## MORNING-2 — integrate Terrain 7 water datum

Required final challenge:

```text
ENTRY -> EXIT = +X, ~370 mm
foundation/build datum = Z -132.718 mm
water Plane preserved visually
water excluded from Human occlusion
solid terrain blocks Human click-through placement
```

Apply through ChallengeService only.

## MORNING-3 — compile and audit the REAL final V4.6 plan

Run exact audits separately:

```text
A. internal bridge part-part intersections
B. bridge-terrain overlap diagnostics
C. buried/visibility-risk Human targets
D. unsupported required targets
```

Release requirement:

`A == 0 prohibited exact intersections`

If A > 0, perform only one bounded compiler/custom-geometry repair against this final plan.

## MORNING-4 — apply reset/error hardening

Fix against the actual downstream SHA:

1. Construction reset idle/held-part/startup-rollback hardening;
2. runtime availability + error-code preservation;
3. low-level reset guard during active mission.

Add repository-native tests.

## MORNING-5 — complete Construction acceptance

Prove on final BuildPlan:

- PartRegistry covers every required part;
- Human and Agent permitted for every hero class;
- real mouse/Player placement accepted;
- meaningful Codex/UR10 sequence accepted;
- source theft -> reassignment;
- human target -> ADOPTED;
- no collision bypass;
- orchestrated safe reset.

## MORNING-6 — verify Train composition

Against same ChallengeService + frozen BuildPlan + BuildBoard:

- Train renders on current ENTRY/route;
- TEST rejects while robot moves;
- TEST rejects while part held;
- partial accepted support -> `TRAIN_FELL`;
- Train reset clean;
- same mission returns to BUILD;
- sufficient/complete support -> `CROSSED`;
- no duplicate bodies/listeners.

## MORNING-7 — verify Mission + final semantic WebMCP

Prove:

```text
DESIGN
-> BUILD
-> TEST
-> TRAIN_FELL
-> same mission BUILD
-> TEST
-> CROSSED
-> COMPLETE exactly once
-> TRY AGAIN
-> new missionId DESIGN
```

Old IDs must fail after reset.

Register exactly 27 unique tools through the existing registrar.

Make semantic descriptions guide the agent:

- `get_mission_state` first;
- `build_next_parts` preferred normal build action;
- `test_bridge` explains failure/recovery;
- `reset_mission` preferred mission reset.

## MORNING-8 — WebMCP usability fixes

Required before release:

- `plan_placement_queue.readOnlyHint = false`;
- page/fix `get_scene_state` truncation;
- guard low-level reset during mission;
- preserve recovery-aware Mission errors;
- make zero-remaining build next actions point to `test_bridge`.

If very quick, compact:

- `observe_camera`;
- `get_bridge_design` default detail;
- `get_bridge_capabilities`.

Do not rename the catalogue or redesign schemas now.

## MORNING-9 — native WebMCP exact-browser acceptance

On actual supported secure browser:

- inspect genuine native `modelContext` location;
- use one normalized native object;
- one registrar;
- exactly 27 unique names;
- no duplicate names after reload/reset;
- semantic tool handlers execute;
- no fake shim/mock registration used as release proof.

## MORNING-10 — Submission Gate + hero reliability

Run on ONE exact commit:

```bash
npm run test:submission
npm run submission:smoke
npm run submission:gate
npm run webmcp:audit
npm run hero:1
npm run hero:3
```

`hero:3` is the minimum feature-freeze gate.

If stable and time remains:

```bash
npm run hero:10
npm run release:evidence
```

Do not mix evidence from separate commits.

## MORNING-11 — real GPU recording check

Run a short real-browser sample:

- actual WebGL rendering;
- no console errors;
- one RAF authority;
- no repeated >33.3 ms frame storm;
- no progressive reset slowdown;
- Train TEST visually stable;
- terrain/water materials load.

## MORNING-12 — deploy / clean-browser / public gate

Use final frozen GitHub commit -> Cloudflare Pages -> clean/incognito browser -> native WebMCP acceptance.

Verify Terrain 7 is deployed as a real GLB, not a Git LFS pointer.

Complete secrets/provenance/README/public-repo checks before public release.

## MORNING-13 — video + Devpost

Target video:

`2:20–2:40`, under 3 minutes.

Protect:

`get_mission_state -> design change -> frozen shared build -> TRAIN_FELL -> continue -> CROSSED -> COMPLETE`

Do not overclaim physical UR10 evidence.

---

# 14. Hero acceptance gate

The submission runtime is ready only when all are true on one exact release commit:

1. Terrain 7 loads with correct materials/water.
2. One ChallengeService owns Terrain/ENTRY/EXIT/bridge/train route/build datum.
3. Build datum is Z = -132.718 mm through the real support seam.
4. Human cannot place through solid terrain from an occluded view.
5. Water does not block Human placement.
6. WebMCP can inspect/change bridge design.
7. Exact hologram follows authoritative BuildPlan identity.
8. Final BuildPlan has zero prohibited internal part intersections.
9. BUILD freezes mission/challenge/plan/transform/registry identity.
10. Every required part is represented in PartRegistry.
11. Every required target has a legal actor/source strategy.
12. Human places a real frozen-plan target through Player.
13. Agent/UR10 places a meaningful frozen-plan sequence.
14. Human steals a planned source; Agent reassigns.
15. Human completes an Agent target; runtime adopts it.
16. Construction reset is safe during unrelated robot activity and held-part states.
17. Exactly 27 unique native WebMCP tools register once.
18. `plan_placement_queue` has truthful mutation annotation.
19. `get_scene_state` does not silently lose unpageable objects.
20. Semantic Mission errors give actionable recovery information.
21. Early TEST reads BuildBoard only and produces `TRAIN_FELL`.
22. Same frozen mission returns to BUILD.
23. Build continues without losing accepted construction.
24. Final TEST returns `CROSSED` from authoritative support.
25. Mission enters COMPLETE exactly once from CROSSED only.
26. TRY AGAIN creates a new missionId and invalidates old operations.
27. No duplicate RAF/body/listener/service authority.
28. No blocking console errors/unhandled rejections.
29. Real GPU browser is stable enough to record.
30. Complete sequence passes three consecutive times minimum.

---

# 15. WebMCP judge-facing success condition

The independent judge audit's main conclusion is now a release requirement:

**Do not submit the application as merely a 19-tool design/robot surface. Submit the semantic mission.**

The strongest WebMCP story is:

```text
agent reads the same mission as the human
-> agent changes the authoritative design
-> exact plan is frozen
-> human and agent build the same plan
-> real Train test fails from accepted BuildBoard state
-> agent observes structured failure
-> same frozen mission continues
-> Train crosses
-> Mission completes
```

That is the evidence that makes WebMCP essential rather than incidental UI automation.

---

# 16. Release / claim safety

Do not claim:

- physical one-second UR10 cycles;
- physical 650 mm/s readiness;
- physical collision safety;
- physical reliability/accuracy;
- final native WebMCP support before exact browser proof;
- 27 tools before exact final enumeration;
- zero intersections before final Terrain 7 compile/audit.

Safe central claim:

**The human and Codex share one deterministic browser world and one frozen BuildPlan; WebMCP lets Codex understand, change, build and test the mission, while Train outcomes prove whether the shared construction succeeded.**

---

# 17. Scope cuts until hero 3/3

Do not spend P0 time on:

- advanced support-floor authoring;
- terrain stair-step voxel maps;
- extra bridge families;
- CHALLENGING terrain;
- structural collapse;
- environment/grass/tree polish;
- renderer rewrite;
- new physics engine;
- BVH without measured need;
- joint-level MCP;
- physical UR10 deployment;
- catalogue renaming;
- train art swap if it risks functional Train/Mission acceptance.

The final Train GLB may be integrated only as a bounded visual swap after the functional hero path is green.

---

# 18. Submission presentation guidance

Project name:

**ROBO BRIDGE MCP**

One-line description:

> Human and AI co-design and build the same bridge, then prove the result with a train test.

Best visible WebMCP calls:

```text
get_mission_state
update_bridge_design
start_bridge_build
build_next_parts
get_build_progress
test_bridge -> TRAIN_FELL
build_next_parts
test_bridge -> CROSSED
```

Recommended video sequence:

| Time | Show |
|---|---|
| 0:00–0:12 | Immediate working scene / human + robot / train-success glimpse |
| 0:12–0:35 | Mission state + visible WebMCP goal/calls |
| 0:35–1:05 | Design change + exact hologram update |
| 1:05–1:35 | Human + Codex build same frozen plan |
| 1:35–2:00 | Early TEST -> visible TRAIN_FELL |
| 2:00–2:20 | Continue/repair -> CROSSED -> COMPLETE |
| 2:20–2:35 | Short same-state/WebMCP architecture explanation |

If the ideal loop is not stable, use the strongest truthful reduced demo. Never fake success.

Hard deadline:

**Thursday 3 September 2026, 13:00 PDT / 21:00 BST.**

---

# 19. Final principle

**Terrain 7 is a simple fixed-water-datum challenge, not a support-floor authoring problem.**

**The remaining technical work is integration and release hardening, not architecture invention.**

**Push Sol's downstream branch, compile the final Terrain 7 plan, remove only demonstrated blockers, expose the semantic 27-tool mission, prove failure/recovery/success three times, deploy, record and submit.**

**Codex plans. Deterministic systems execute. Human actions change the shared world. The runtime adapts. BuildBoard controls TEST. The train proves the result.**