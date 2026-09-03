# ROBO BRIDGE MCP — Submission Master Plan

**Status:** FINAL SUBMISSION MORNING PREP — TERRAIN 7 WATER DATUM + DOWNSTREAM INTEGRATION + HERO QA  
**Plan version:** 2026-09-03-H  
**Production runtime code baseline:** `ec3c9237c224210112acd0ba71ddc06ea95f9f91`  
**Active Construction WIP:** draft PR #5, `codex/p0-construction-integration` at `d6154a58d97f52b3058d04c50eeb3ab5066de70c`  
**Planned downstream branch:** `codex/p0-downstream-integration-prep` — **not visible remotely at this plan update; treat any Sol work as local/unverified until pushed**  
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

The project is no longer missing major P0 subsystems. Most remaining work is integration, final challenge geometry, one Construction reset safety fix, native WebMCP verification, hero reliability, deployment and submission evidence.

Approximate status:

- **Required P0 code/components available:** ~98%.
- **Accepted production runtime integration:** ~82%.
- **Construction WIP:** substantial and useful, but not mergeable while the current BuildPlan has prohibited internal intersections and reset safety is unresolved.
- **Train / Mission / Submission Gate:** verified integration packages exist, but their final composition must be proven in one pushed downstream commit.

Current critical path:

`TERRAIN 7 WATER DATUM -> CLEAN V4.6 BUILDPLAN -> CONSTRUCTION RESET + ALL-CLASS ACCEPTANCE -> TRAIN/MISSION COMPOSITION -> NATIVE WEBMCP -> SUBMISSION GATE -> HERO 3/3 -> DEPLOY -> VIDEO/SUBMIT`

Do not start another large subsystem from scratch.

---

# 2. Accepted production runtime baseline

Production runtime code baseline:

`ec3c9237c224210112acd0ba71ddc06ea95f9f91`

`main` may contain later plan-only commits; the runtime code baseline above is the accepted gameplay checkpoint.

It proves:

- authoritative V4.6 BridgeHost;
- exact BuildPlan-derived Aqueduct hologram;
- five bridge-design WebMCP tools;
- fourteen low-level robot/build WebMCP tools;
- 19 current production tools;
- accepted older EASY terrain integration;
- unified challenge-owned bridge / ENTRY / EXIT transform;
- player and collision-proxy cleanup;
- reliability checkpoint 20/20.

The older terrain remains a fallback only. The final submission direction is now Terrain 7.

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

Current measured custom-part cycle starts averaged approximately **3.61 s**. Do not claim one-second bridge cycles. Earlier ~1 s evidence applies only to simpler generic simulator structures.

---

# 4. Old-plan geometry blocker — still real until Terrain 7 compile replaces it

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

The manually authored 3D support-floor / stair-step strategy from Plan G is **superseded for P0**.

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

Terrain overlap must remain a diagnostic, not a completion shortcut.

## 5.2 One coherent challenge transform

Terrain, ENTRY, EXIT, bridge, hologram, BuildBoard targets, train route and interaction occlusion all inherit one challenge/world transform.

Do not rotate/move only the bridge or hologram.

Preferred authored bridge direction is +X with yaw 0 in the terrain-local frame.

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

Compare the nearest solid-terrain ray hit against the candidate target/snap-point distance with a small precision epsilon.

Solid terrain occluders should be explicitly classified from Terrain 7. Likely examples to verify include:

```text
Terrain
Tunnel
Entry_Structure
```

Explicitly exclude from terrain occlusion:

```text
Plane       // water
ENTRY
EXIT
lights/cameras
holograms
ghosts/debug helpers
```

Water must never block placement.

Important invariant:

Camera occlusion must NOT mutate:

- BuildPlan;
- required placement IDs;
- BuildBoard;
- Agent/Robot target legality;
- Mission completion;
- Train support truth.

A target hidden from one camera angle becomes interactable again when the player moves to a clear line of sight.

Terrain 7 integration Oracle task/prompt exists separately and should return a bounded overlay + `SOL_HIGH_APPLY_CHECKLIST.md`.

---

# 7. Overnight Adversarial Hero QA — NEW P0 findings

Package:

`ORACLE_P0_ADVERSARIAL_HERO_QA_V1.zip`

SHA-256:

`918f0f793f3ecc4dbe53c6d8fc74eb51ef1939cdf33c99698f8e6f1d5aaec19f`

Important scope limitation:

The Oracle requested `codex/p0-downstream-integration-prep`, but that branch was not available remotely. It therefore audited the exact Construction fallback:

`d6154a58d97f52b3058d04c50eeb3ab5066de70c`

It executed **44/44 independent harness assertions** across exact-source Node tests and an isolated Chromium registration harness. A green harness assertion sometimes means a defect was successfully reproduced; it is not a release pass.

## 7.1 New confirmed Construction reset defect — MUST FIX

Construction reset is safe during its own active `buildNextParts` operation, but it is NOT safe when:

- an unrelated RobotController motion is active; or
- the gripper is holding a construction part.

The current service can dispose Construction/board/session state while robot inventory restoration is rejected or while held-part state is discarded.

This can split authoritative state.

Required fix:

```text
reset request
-> cancel relevant execution
-> await full robot idle
-> require no held part / safely resolve held state
-> reset Construction/Train/BuildBoard/controller state coherently
-> verify clean fingerprint
```

The Oracle supplied review-only patch:

`0001-construction-reset-idle-and-rollback.diff`

Its isolated validation tests passed.

Do not copy blindly; reimplement/review against the latest downstream branch and add repository-native tests.

## 7.2 Startup rollback binding defect — MUST FIX WITH RESET PATCH

`startBuild()` cleanup can call `this.reset()` from a catch path in a way that is unsafe if the method is invoked unbound, causing cleanup to throw and hide the original startup error.

Use a closure-safe API reference / internal reset implementation.

## 7.3 Runtime availability/error preservation — HIGH PRIORITY

The runtime preflight can report placement availability without requiring all placement methods, producing misleading `runtime_unavailable` results.

Known thrown machine errors may also be collapsed to generic `internal_error`, losing useful recovery data.

The Oracle supplied review-only patch:

`0002-runtime-placement-availability-and-errors.diff`

Its isolated validation passed.

Required final semantic error shape should contain, where applicable:

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

Mission semantic errors must not force an agent to guess what to do next.

## 7.4 Human/Agent race handling — reassuring result

Current Construction evidence remains strong:

- human steals planned source -> compatible source reselected;
- human completes planned target -> placement becomes `ADOPTED`;
- reserved-source conflict repaired before latch;
- design mutation before freeze revision-checks correctly;
- design mutation after freeze is rejected.

Keep these behaviors through final integration.

---

# 8. Overnight Browser Performance / Soak QA — NEW stability evidence

Package:

`ORACLE_BROWSER_PERFORMANCE_SOAK_QA_V1.zip`

SHA-256:

`54e9908139b86a28dde668703ac9505dcdb5e95009d4a4a40d352b07001fc819`

Same scope limitation: the downstream branch was unavailable, so this audited Construction fallback `d6154a58...` plus bounded lifecycle harnesses.

## 8.1 Reassuring lifecycle results

### Workcell reset soak

```text
50/50 resets PASS
listener delta: 0
active timeout delta: 0
active interval delta: 0
scene-object delta: 0
brick delta: 0
target delta: 0
WebMCP registration delta: 0
active RAF delta: 0
```

Forced-GC heap first-to-last delta was only +56,560 bytes with no progressive rise.

### Pointer-lock lifecycle

```text
20/20 pointer-lock entries PASS
settings reopened 20/20
listener growth: 0
no stale key/lock state
```

### Construction module soak

```text
50/50 bounded module cycles PASS
mean: ~49.7 ms
p95: ~55.6 ms
p99/max: ~58.8 ms
controller listener growth: 0
active-handle growth: 0
```

This is module lifecycle evidence, not full MAIN_DEMO bridge-cycle performance.

### WebMCP registration lifecycle

Across 12 independent page lifecycles using a registrar recorder:

```text
19 registrations
19 unique names
0 duplicates
one shared owner signal
```

This proves registrar contract stability in the harness, not native browser WebMCP acceptance.

## 8.2 Single frame-loop result

No duplicate production RAF loop was found in the available runtime.

One intended renderer recursion remained active before/after 50 resets.

Current architecture is stable for one page boot + repeated in-page reset.

Optional low-risk hardening if time permits:

- store/cancel RAF ID on dispose;
- clear the 500 ms HUD interval;
- disconnect ResizeObserver;
- remove owned listeners through one runtime dispose path.

Do not turn this into a renderer rewrite.

## 8.3 GPU performance is NOT VERIFIED

The Oracle environment could not create a WebGL context.

Its ~60 FPS / 16.7 ms tables are **render-disabled scheduler evidence only** and must NOT be used as production GPU FPS claims.

Final release still requires a real supported-GPU browser profile on the actual integrated runtime.

Minimum morning recording check:

```text
10-second real frame sample
one active RAF
no console errors
no progressive resource growth
no repeated >33.3 ms long-frame storm
```

---

# 9. Native WebMCP — current final verification gate

Current registrar lifecycle is stable, but native WebMCP remains unverified in the target browser.

Observed mismatch in previous browser evidence:

```text
browser exposed: navigator.modelContext
registrar expected: document.modelContext
```

Required action:

- inspect the real supported browser API;
- resolve the genuine native object once;
- keep one registrar;
- keep duplicate guard/owner cleanup;
- do not create a fake production shim;
- enumerate the final native tool surface from the deployed secure origin.

Also correct the known annotation:

`plan_placement_queue` must not remain `readOnlyHint: true` if it mutates logical stream/ghost/planning state.

Expected final semantic composition after Mission integration:

```text
14 low-level
+ 5 bridge-design
+ 8 mission/terrain
= 27 unique tools
```

Do not claim 27 until the exact final browser enumerates 27 unique native tools.

---

# 10. Canonical package inventory

## 10.1 Bridge core/design

Use the already integrated production bridge core. Reference package:

`ORACLE_BRIDGE_CORE_MAIN_DEMO_V1`

Do not restore standalone V4.6 execution authority.

## 10.2 Construction

Use only:

`ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_V1.zip`

Most integration is already represented in PR #5.

Do not use old `ALL_AVAILABLE_WORK` Construction packages.

## 10.3 Train

Canonical integration package:

`ORACLE_TRAIN_MAIN_DEMO_ADAPTERS_V1(1).zip`

Verified package evidence:

- 47/47 Node tests;
- browser acceptance 10/10;
- Construction compatibility 7/7;
- source-equivalence 16/16;
- partial authoritative BuildBoard -> `TRAIN_FELL`;
- complete authoritative support -> `CROSSED`;
- yaw/translation/elevation independence;
- repeated reset and coupler/self-overlap regression coverage.

The package must consume live ChallengeService route/transform data. Do not hardcode final Terrain 7 coordinates into Train.

## 10.4 Mission

Canonical integration package:

`ORACLE_MISSION_INTEGRATION_ADAPTERS_V1(1).zip`

Verified:

- 114/114 Mission + adapter tests;
- package verification PASS;
- Construction adapter smoke PASS;
- Train `TRAIN_FELL` smoke PASS;
- Train `CROSSED` smoke PASS.

Semantic tools:

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

Prefer the newer Train integration Mission adapter:

```text
createMissionTrainAdapter(trainIntegration)
-> getState()
-> test()
-> reset()
```

Do not regress to a second raw Train wrapper.

## 10.5 Submission Gate

Canonical package:

`ORACLE_SUBMISSION_GATE_CURRENT_RUNTIME_V1(1).zip`

Package evidence includes:

- 11/11 unit suite PASS;
- current-runtime browser evidence 46 PASS / 0 FAIL;
- 0 blocking browser errors in the audited source;
- dynamic future-service checks.

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

The overnight Oracles could not run these on PR #5 because the gate is not integrated there. This is NOT evidence that the canonical gate package is bad; it is evidence that all final services must be composed into one remote commit before release.

## 10.6 Release/deployment readiness

Package exists:

`ORACLE_RELEASE_DEPLOYMENT_READINESS_V1`

Recommended path:

`GitHub -> Cloudflare Pages -> clean-browser acceptance -> public submission`

Final release checker must be updated to the actual Terrain 7 asset and final native WebMCP seam before use.

---

# 11. Current completion dashboard

| ID | Deliverable | Status | Current truth |
|---|---|---|---|
| FND-01 | MAIN_DEMO / one authority chain | COMPLETE | Accepted production architecture |
| BRG-01 | BridgeHost + exact hologram | COMPLETE | Production main |
| MCP-BASE | 14 low-level + 5 design tools | COMPLETE | 19 current tools |
| CONST-PKG | Construction package | COMPLETE | Package complete |
| CONST-INT | Construction integrated | IN_PROGRESS | PR #5 substantial WIP |
| CONST-GEO | Final clean V4.6 BuildPlan | BLOCKED | Old plan has 21 intersections; Terrain 7 recompile pending |
| CONST-RESET | Atomic/safe Construction reset | NEEDS_FIX | Overnight QA reproduced active/held reset defect |
| CONST-RACE | Human source theft + target adoption | PASS | Existing evidence preserved |
| TERRAIN7-01 | Final Terrain 7 challenge | IN_PROGRESS | Final asset chosen |
| TERRAIN7-02 | Water datum -132.718 mm | READY | Final support strategy selected |
| TERRAIN7-03 | Terrain-first Human occlusion | READY | Oracle prep task defined |
| FLOOR-OLD | Manual 3D support floor | DEFERRED | Superseded; not required for P0 |
| TRAIN-PKG | Train integration package | COMPLETE | Canonical package verified |
| TRAIN-INT | Train in final MAIN_DEMO | READY / UNVERIFIED | Must prove in pushed downstream commit |
| MISSION-PKG | Mission adapters | COMPLETE | 114/114 package evidence |
| MISSION-INT | Mission in final MAIN_DEMO | READY / UNVERIFIED | Must prove in pushed downstream commit |
| MCP-NATIVE | Native WebMCP in judging browser | NEEDS_FIX / VERIFY | navigator/document seam unresolved |
| MCP-ANNOT | `plan_placement_queue` annotation | NEEDS_FIX | Mutation cannot be read-only |
| MCP-ERR | Recovery-aware semantic error envelope | NEEDS_FIX | Overnight QA found incomplete primitive envelope |
| QA-GATE | Canonical Submission Gate package | COMPLETE | Integration pending |
| QA-ADV | Adversarial Oracle package | COMPLETE | 44 harness assertions; new reset defect found |
| QA-SOAK | Browser lifecycle soak package | COMPLETE | No progressive bounded-lifecycle leak found |
| PERF-GPU | Real integrated GPU frame profile | NOT_VERIFIED | Oracle lacked WebGL context |
| HERO-1 | One exact integrated hero loop | BLOCKED | final geometry + composition required |
| HERO-3 | Three consecutive hero loops | BLOCKED | release minimum |
| DEPLOY | Hosted final URL | READY | Cloudflare procedure prepared |
| PUBLIC | Public-repo/provenance gate | IN_PROGRESS | complete before public release |
| VIDEO | Final <3 minute video | BLOCKED | record after exact hero freeze |

---

# 12. Immediate Sol High branch rule

The intended child branch is:

`codex/p0-downstream-integration-prep`

As of this plan update, GitHub does not show that branch remotely.

Therefore:

1. if Sol has local work, it must push the branch before any further Oracle/release claim;
2. record exact head SHA;
3. preserve checkpoint commits for Train, Mission, QA/WebMCP and Construction hardening;
4. draft PR base remains `codex/p0-construction-integration`, NOT `main`;
5. do not merge until final Terrain 7 geometry and hero gates pass.

No Oracle result from the fallback Construction branch may be used as proof that the final downstream composition passed.

---

# 13. STRICT EXECUTION ORDER — submission morning

## MORNING-1 — Push / identify the real downstream integration commit

Before anything else, obtain one exact remote branch/commit containing whatever Sol has completed.

Record:

```text
branch
head SHA
parent SHA
Train status
Mission status
Submission Gate status
native tool count
```

If Sol has not completed the downstream work, resume from PR #5 using the canonical Train, Mission and Submission Gate packages.

## MORNING-2 — Finish Terrain 7 water-datum prep

Use the Terrain 7 Oracle result when available.

Required final challenge:

```text
ENTRY -> EXIT = +X, ~370 mm
foundation/build datum = Z -132.718 mm
water Plane preserved visually
water excluded from Human occlusion
solid terrain blocks Human click-through placement
```

Apply through ChallengeService; do not create a separate terrain truth.

## MORNING-3 — Compile the REAL final V4.6 plan

Compile against the final Terrain 7 challenge and constant water support datum.

Run exact audits separately:

```text
A. internal bridge part-part intersections
B. bridge-terrain overlap diagnostics
C. buried/visibility-risk Human targets
D. unsupported required targets
```

Release requirement:

`A == 0 prohibited exact intersections`

Terrain overlap alone is not automatically a blocker.

If A > 0, perform only one bounded compiler/custom-geometry repair against this final plan, rerun exact geometry and stop feature work.

## MORNING-4 — Apply the two small adversarial QA hardenings

Review/reimplement against the actual downstream SHA:

1. Construction reset idle/held-part/rollback hardening;
2. runtime availability + error-code preservation hardening.

Add repository-native regression tests.

Required reset contract:

```text
cancel -> await idle -> resolve held part -> clear services coherently -> new mission identity -> clean fingerprint
```

## MORNING-5 — Complete Construction all-class acceptance

On the clean final BuildPlan prove:

- PartRegistry covers every required part;
- Human and Agent are permitted for every hero class;
- at least one real mouse/Player placement is accepted;
- meaningful Codex/UR10 sequence is accepted;
- source theft -> reassignment;
- human target -> ADOPTED;
- no collision bypass;
- reset while moving/holding fails closed or follows orchestrated safe reset.

## MORNING-6 — Verify Train composition

Against the same ChallengeService + frozen BuildPlan + BuildBoard:

- Train renders on current ENTRY/route;
- TEST rejects while robot moves;
- TEST rejects while part held;
- partial accepted support -> visible `TRAIN_FELL`;
- Train reset clean;
- same frozen mission returns to BUILD;
- sufficient/complete authoritative support -> `CROSSED`;
- no duplicate bodies/couplers/listeners across reset.

## MORNING-7 — Verify Mission + 27-tool semantic surface

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

Old mission IDs must fail after reset.

Add bounded recovery-aware errors and long-action deadlines/idempotency where required by the actual final implementation.

## MORNING-8 — Native WebMCP exact-browser acceptance

On the actual supported browser and secure origin:

- resolve genuine `modelContext` location;
- one registrar;
- unique tool enumeration;
- expected final semantic count;
- no duplicates;
- annotation audit passes;
- core semantic journey works through native tools.

Do not use mock registration as release proof.

## MORNING-9 — Submission Gate + hero reliability

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

## MORNING-10 — Real GPU recording check

Run at least a short real-browser sample on the submission machine:

- actual WebGL rendering;
- no console errors;
- one RAF authority;
- no repeated >33.3 ms frame storm;
- no progressive reset slowdown;
- Train TEST visually stable;
- terrain/water materials load.

Do not cite the Oracle render-disabled 60 FPS values as production performance.

## MORNING-11 — Deploy / clean-browser / public gate

Use the prepared release package.

Preferred path:

`final frozen GitHub commit -> Cloudflare Pages -> clean/incognito browser -> native WebMCP acceptance`

Verify Terrain 7 is actually deployed as a real GLB rather than a Git LFS pointer.

Complete secrets/provenance/README/public-repo checks before public release.

## MORNING-12 — Video + Devpost

Only after hero 3/3 or the strongest truthful reduced fallback is frozen.

Target video:

`2:20–2:40`, under 3 minutes.

Protect this sequence:

`WebMCP design -> shared build -> TRAIN_FELL -> observe/continue -> CROSSED -> MISSION COMPLETE`

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
7. Exact hologram follows the authoritative BuildPlan identity.
8. Final BuildPlan has zero prohibited internal part intersections.
9. BUILD freezes mission/challenge/plan/transform/registry identity.
10. Every required part is represented in PartRegistry.
11. Every required target has a legal actor/source strategy.
12. Human places a real frozen-plan target through the Player path.
13. Agent/UR10 places a meaningful frozen-plan sequence.
14. Human steals a planned source; Agent reassigns.
15. Human completes an Agent target; runtime adopts it.
16. Construction reset is safe during unrelated robot activity and held-part states.
17. Early TEST reads BuildBoard only and produces `TRAIN_FELL`.
18. Same frozen mission returns to BUILD.
19. Build continues without losing accepted construction.
20. Final TEST returns `CROSSED` from authoritative support.
21. Mission enters COMPLETE exactly once from CROSSED only.
22. TRY AGAIN creates a new missionId and invalidates old operations.
23. Semantic WebMCP errors give actionable recovery information.
24. Final native tool surface registers once with truthful annotations.
25. No duplicate RAF/body/listener/service authority.
26. No blocking console errors/unhandled rejections.
27. Real GPU browser is stable enough to record.
28. Complete sequence passes three consecutive times minimum.

---

# 15. Release / claim safety

Simulator evidence must never be described as physical UR10 readiness.

Do not claim:

- physical one-second cycles;
- physical 650 mm/s readiness;
- physical collision safety;
- physical reliability/accuracy;
- native WebMCP support before exact browser proof;
- 27 tools before exact enumeration;
- zero intersections before final Terrain 7 compile/audit.

Safe central claim:

**The human and Codex share one deterministic browser world and one frozen BuildPlan; WebMCP lets Codex understand, change, build and test the mission, while Train outcomes prove whether the shared construction succeeded.**

---

# 16. Scope cuts until hero 3/3

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
- train art swap if it risks the functional Train path.

The final Train GLB may be integrated only as a bounded visual swap after functional Train/Mission acceptance is green.

---

# 17. Submission presentation guidance

Project name:

**ROBO BRIDGE MCP**

One-line description:

> Human and AI co-design and build the same bridge, then prove the result with a train test.

Recommended video sequence:

| Time | Show |
|---|---|
| 0:00–0:12 | Immediate working scene / human + robot / train-success glimpse |
| 0:12–0:35 | Give Codex bridge goal + visible WebMCP calls |
| 0:35–1:05 | Design inspection/change + exact hologram update |
| 1:05–1:35 | Human + Codex build same frozen plan |
| 1:35–2:00 | Early TEST -> visible TRAIN_FELL |
| 2:00–2:20 | Continue/repair -> CROSSED -> COMPLETE |
| 2:20–2:35 | Short same-state/WebMCP architecture explanation |

If the ideal loop is not stable, use the strongest truthful reduced demo. Never fake a successful mission.

Hard submission deadline:

**Thursday 3 September 2026, 13:00 PDT / 21:00 BST.**

---

# 18. Final principle

**Terrain 7 is now a simple fixed-water-datum challenge, not a support-floor authoring problem.**

**The new overnight QA priority is to fix atomic reset/error recovery, not to redesign architecture.**

**Get all downstream services into one pushed commit, compile the final Terrain 7 BuildPlan, remove only demonstrated blockers, prove hero 3/3, deploy, record and submit.**

**Codex plans. Deterministic systems execute. Human actions change the shared world. The runtime adapts. BuildBoard controls TEST. The train proves the result.**