# ROBO BRIDGE MCP — Submission Master Plan

**Status:** FINAL HERO EXECUTION SPRINT — TERRAIN 7 CLEAN, CONSTRUCTION PATH NOW CRITICAL  
**Plan version:** 2026-09-03-J  
**Accepted production runtime baseline:** `ec3c9237c224210112acd0ba71ddc06ea95f9f91`  
**Active final integration branch:** `codex/p0-downstream-integration-prep`  
**Active final integration checkpoint:** `23f254bca37fdef2a283d09d5e2bfe9b77211d74`  
**Draft final integration PR:** #6 — `P0 downstream Train, Mission, WebMCP and Construction prep`  
**PR #6 base for now:** `codex/p0-construction-integration`  
**Submission deadline:** 2026-09-03 13:00 PDT / 21:00 BST  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Canonical authority:** `RevisionClock` + `BuildBoard` + `PlacementAuthority` + `RobotController`  
**Primary goal:** get one complete reliable hero loop working, then prove it three times, merge once, deploy and record.

---

# 0. Authority

This file is the authoritative submission execution plan.

If an older plan, Oracle package, prototype README, branch note, handoff file or chat instruction conflicts with this file, **this file wins for the submission sprint**.

Evidence must always be tied to one exact commit. Never combine green results from different revisions into a fake release result.

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
- a mission-owned physical-part truth;
- terrain-owned completion truth;
- camera-owned target validity;
- an instant-build shortcut;
- direct completion/support setters;
- joint-level WebMCP controls;
- a second production render/frame loop.

Do not restore NVIDIA Newton.

Simulator evidence must never be described as physical UR10 readiness.

---

# 1. Executive status — CURRENT TRUTH

The project is now beyond the previous geometry blocker.

Major P0 systems are integrated on PR #6. Terrain 7 is integrated. The final V4.6 geometry audit is clean. The immediate critical path is now **robot execution of the full 303-part Construction sequence**, followed immediately by Train CROSSED, Mission COMPLETE and hero reliability.

Current critical path:

`SAFE CONSTRUCTION TRAVEL -> 303/303 -> TRAIN CROSSED -> MISSION COMPLETE -> HERO:1 -> HERO:3 -> RETARGET PR #6 -> MERGE -> DEPLOY -> VIDEO/SUBMIT`

Do not start another subsystem.

Do not launch another broad Oracle task.

Do not spend submission time on screenshot-driven self-inspection; the user owns visual inspection.

---

# 2. Final working branch — single integration trunk

Use only:

```text
branch: codex/p0-downstream-integration-prep
current published checkpoint: 23f254bca37fdef2a283d09d5e2bfe9b77211d74
PR: #6
status: draft / unmerged / current final integration trunk
```

PR #6 contains the Construction parent work plus downstream Train, Mission, WebMCP, Submission Gate, Terrain 7 and current hardening.

Do not merge PR #5 separately.

Do not merge PR #6 yet.

All remaining code changes go to PR #6's branch.

When the final runtime passes the freeze gate:

1. retarget PR #6 to `main`;
2. rerun final checks on the exact PR #6 head;
3. merge PR #6 only;
4. close PR #5 as superseded;
5. deploy that exact merged/release SHA.

---

# 3. PR #6 downstream integration — COMPLETE ENOUGH TO PRESERVE

Initial downstream checkpoint `eae3ba1415f6e4edeb8fa6be92526c8e92036787` integrated:

- current Train runtime into the existing MAIN_DEMO scene/frame loop;
- current ChallengeService and BuildBoard authority;
- Mission orchestration;
- exactly 27 WebMCP tools through one registrar;
- Submission Gate;
- real native `modelContext` path on the tested browser seam without a fake production shim;
- all five then-live bridge part classes usable by Human and Codex;
- real Player mouse placement into authoritative BuildBoard state.

Reported downstream verification at that checkpoint included:

```text
345/345 JavaScript PASS
20/20 reliability PASS
Train 49/49 PASS
Mission package 114/114 PASS
focused Construction/Player 37/37 PASS
real Player mouse placement PASS
0 console errors/warnings in that Player acceptance run
```

Do not redo these integrations unless a current regression demonstrates a real problem.

---

# 4. Terrain 7 — INTEGRATED

Current Terrain 7 checkpoint:

```text
23f254bca37fdef2a283d09d5e2bfe9b77211d74
```

Production Terrain 7 asset fingerprint reported by Codex:

```text
SHA256 419adc72b8fb408eea5060142890682fbcd03709b4cd4d292742286ba1518217
```

Authoring intent:

```text
ENTRY = (0.000, 0.000, 0.000) m
EXIT  = (0.370, 0.000, 0.000) m
ENTRY -> EXIT = +X
span = 370 mm
yaw = 0 degrees in terrain-local coordinates
```

Final water object:

```text
Plane
```

Final authoritative build/foundation datum:

```text
Z = -132.718 mm
```

Terrain 7 implementation now preserves named node hierarchy, authored transforms, materials and water normal/UV transforms.

One ChallengeService preset owns:

- terrain;
- ENTRY / EXIT;
- bridge/route transform;
- build datum;
- Train route;
- Human terrain occlusion.

No second terrain/support authority is allowed.

---

# 5. Final support rule — FIXED WATER DATUM

The old manual 3D support-floor / stair-step strategy is permanently superseded for P0.

Final support rule:

```text
one constant horizontal support datum
Z = -132.718 mm
```

Do NOT use:

- manually authored supportTopMap;
- terrain-height stair-stepping;
- per-cell floor blocks;
- a separate floor-authoring runtime.

Current implementation reports compiler-local support mapped coherently through the existing ChallengeService/compiler seam.

Water is visual/datum reference only.

Water is NOT:

- Human placement occlusion;
- Train support truth;
- BuildBoard truth;
- Mission completion truth.

---

# 6. Human terrain occlusion — IMPLEMENTED, USER VISUAL CHECK PENDING

Human-only click-through prevention is implemented.

Required invariant remains:

```text
camera -> terrain -> target = block Human interaction
camera -> target -> terrain = allow Human interaction
```

Solid terrain can occlude Human placement.

Water and authored markers are excluded.

Occlusion must never change:

- BuildPlan;
- BuildBoard;
- Agent/Robot target legality;
- Train support;
- Mission completion.

Codex should not spend time taking screenshots.

Visual status should be reported as:

```text
VISUAL: USER-VERIFY PENDING
```

until the user checks it.

---

# 7. FINAL V4.6 BUILDPLAN — GEOMETRY BLOCKER SOLVED

Current final Terrain 7 compile:

```text
planId: bp_818c1694
checksum: 818c1694
parts: 303
PartRegistry: pr_55ecaf7f
```

Current BOM:

```text
108 × 1x1x1
159 × 1x2x1
3 × 1x20x1
21 × ARCH_A
9 × ARCH_B
3 × TRACK_SEGMENT
```

All six non-zero classes permit both Human and Agent.

Final Aqueduct tuning reported at checkpoint:

```text
top/middle/bottom: 4 / 3 / 3
offset: 0.4
support bands: 2.4
deck: 4.8
standard brick scale: 2
```

Most important current result:

```text
exact prohibited internal part-part intersections: 0
track enclosing-proxy overlaps: 0
```

The former 21-intersection blocker is therefore obsolete for the final Terrain 7 plan.

Do not reopen the old BuildPlan.

Do not do more V4.6 compiler work unless a new exact geometry failure is demonstrated on `bp_818c1694` or a later intentional final plan.

---

# 8. Current verification checkpoint

At `23f254b...` Codex reports:

```text
npm run verify: 356/356 JavaScript PASS
reliability: 20/20 PASS
154 production JavaScript syntax checks PASS
4 Python syntax checks PASS
screenshot-free gate hardening: 17/17 PASS
```

Construction diagnostic progression:

```text
46 / 303 accepted
Human: 1
Agent: 45
```

Shared-source reassignment PASS.

Human completion of an Agent-intended target / adoption PASS.

Terrain 7 Train failure path currently passes:

```text
TRAIN_FELL / SUPPORT_LOSS
```

A completed-board fixture still proves CROSSED at unit level, but that fixture is NOT final hero proof.

Final CROSSED must come from the physically executable authoritative final board.

---

# 9. CURRENT BLOCKER — post-placement retreat collision

Current exact blocker:

```text
placement: bp_818c1694.s.12.0
placement accepted successfully after unlatch
then empty-tool retreat collides with source:
bridge-src.eecff488.009
```

No collision bypass is allowed.

No workspace widening is allowed.

No BuildBoard force acceptance is allowed.

This is now a motion/travel-policy problem, not a bridge-geometry problem.

---

# 10. FINAL SIMPLE MOTION POLICY — TERRAIN-MAX Z-HOP

Use a simple 3D-printer-style travel policy for the submission runtime.

After every successful placement:

```text
PLACE
-> UNLATCH
-> MOVE STRAIGHT UP ONLY
-> REACH GLOBAL SAFE TRAVEL HEIGHT
-> X/Y TRAVEL
-> DESCEND FOR NEXT APPROACH
```

Likewise after a source pick where appropriate:

```text
LATCH
-> VERTICAL LIFT
-> SAFE TRAVEL HEIGHT
-> HORIZONTAL TRAVEL
-> TARGET APPROACH
```

Do not make a diagonal/lateral low-level retreat immediately after unlatch.

## 10.1 Safe travel height

Derive one deterministic travel plane from the final solid Terrain 7 challenge:

```text
terrainMaxZ = maximum Z of solid Terrain 7 geometry
```

Exclude:

- water Plane;
- ENTRY / EXIT markers;
- lights;
- cameras;
- holograms;
- ghosts/debug helpers.

Include solid terrain/challenge structures that can obstruct travel.

Because the TCP is not necessarily the top/bottom of the physical tool, derive the actual TCP travel Z as:

```text
safeTcpTravelZ
= terrainMaxZ
+ required gripper/tool vertical clearance
+ tiny numerical safety margin
```

The gripper/tool clearance must come from the existing collision proxy dimensions, not an arbitrary large constant.

If the derived safe Z lies outside the current workspace, fail clearly. Never widen the workspace just to make the Z-hop fit.

Every motion segment still passes through the existing:

- IK;
- workspace checks;
- collision checks;
- RobotController;
- PlacementAuthority.

No teleporting.

No collision bypass.

No general path-planner project.

---

# 11. Immediate execution goal — RUN TO 303/303

After implementing the global Z-hop travel rule:

1. rerun Construction from a clean deterministic state;
2. confirm the previous 46/303 retreat blocker is gone;
3. do NOT stop at 47/303;
4. continue through the full final sequence;
5. if another genuine blocker appears, capture structured evidence and fix that demonstrated blocker only;
6. rerun until `303/303` or a fundamentally different hard blocker is proven.

Final Construction acceptance must exercise all six non-zero classes:

```text
1x1x1
1x2x1
1x20x1
ARCH_A
ARCH_B
TRACK_SEGMENT
```

Record accepted counts per class.

Do not claim complete Construction acceptance if one required class never has an executable placement path.

---

# 12. Construction reset/error hardening — IMPLEMENTED AT CURRENT CHECKPOINT

Current Terrain 7 checkpoint reports:

- asynchronous Construction reset fences runner/controller idle and held-part state;
- startup rollback no longer relies on unsafe `this.reset()` binding;
- runtime errors preserve known codes/recovery fields;
- low-level workcell reset rejects active missions with `mission_reset_required`;
- scene reads now have bounded revision-checked cursor paging;
- runtime availability includes the required placement methods.

Preserve these fixes.

Do not reopen them unless current tests fail.

---

# 13. WebMCP final contract

PR #6 integrated the intended semantic surface.

Release requirement:

```text
27 unique tools
1 registrar
MissionService ready
ConstructionService ready
TrainService ready
```

Expected composition:

```text
14 low-level
+ 5 bridge-design
+ 8 mission/terrain
= 27
```

Mission/Terrain tools:

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

Flagship sequence:

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

`plan_placement_queue` must remain truthfully annotated as mutating (`readOnlyHint: false`).

`reset_workcell` must not undermine an active mission; use `reset_mission` for mission recovery/reset.

Do not redesign WebMCP now.

---

# 14. Train final acceptance

Train package/integration is already present.

Current required final proof must use the same final runtime, ChallengeService and BuildBoard:

```text
early incomplete BuildBoard
-> TEST
-> TRAIN_FELL / SUPPORT_LOSS
-> same mission returns to BUILD

complete physically executable final BuildBoard
-> TEST
-> CROSSED
```

Water datum is not Train support.

Do not use a separate completed-board fixture as the flagship release proof.

---

# 15. Mission final acceptance

Required final state journey:

```text
DESIGN
-> BUILD
-> TEST
-> TRAIN_FELL
-> BUILD
-> continue accepted construction
-> TEST
-> CROSSED
-> COMPLETE exactly once
-> TRY AGAIN / reset_mission
-> new missionId
-> DESIGN
```

Old mission IDs must fail after reset.

Failure recovery must retain accepted construction from the same frozen mission.

---

# 16. User/Codex division of labour — TIME CRITICAL

## Codex owns

- implementation;
- automated tests;
- geometry/intersection checks;
- BuildBoard/authority correctness;
- Robot execution;
- browser state assertions when allowed;
- console checks;
- WebMCP checks;
- Train/Mission logic;
- hero execution;
- commits and pushes.

## User owns

- visual appearance;
- terrain placement judgement;
- water appearance;
- bridge visual placement;
- camera framing;
- obvious clipping/art judgement;
- final recording-quality judgement.

Codex should not take screenshots unless explicitly requested.

Whenever visual judgement is needed, return a tiny checklist and mark:

```text
VISUAL: USER-VERIFY PENDING
```

Then continue with any machine-verifiable work that does not depend on the answer.

---

# 17. Current terrain visibility diagnostics — DO NOT TURN INTO A NEW BLOCKER YET

Current offline/conservative diagnostics report:

```text
100 potential bridge-vs-terrain overlaps
303 centres blocked from at least one of five synthetic views
59 centres blocked from all five synthetic QA views
0 missing declared dependencies / above-datum targets lacking declared support
```

These are not yet proof of a real Player/hero blocker.

Do not halt Construction to solve them automatically.

The user will visually inspect.

Only promote a visibility/burial case to P0 if an actual required Human interaction in the hero is demonstrably impossible.

---

# 18. Submission Gate / reliability sequence

Do not spend time polishing non-blocking audit output until full Construction can complete.

As soon as 303/303 works and Train/Mission complete on the same board, run on ONE exact commit:

```bash
npm run verify
npm run submission:smoke
npm run submission:gate
npm run webmcp:audit
npm run hero:1
```

If `hero:1` passes:

```bash
npm run hero:3
```

`hero:3` is the minimum functional freeze gate.

If time remains after freeze:

```bash
npm run hero:10
npm run release:evidence
```

Do not block the submission on hero:10 if hero:3 is stable and the deadline is at risk.

---

# 19. Browser / GPU acceptance

Previous performance Oracle lifecycle results were reassuring:

- no duplicate production RAF detected;
- no progressive reset/listener leak in bounded soak tests;
- pointer-lock lifecycle stable;
- registrar lifecycle stable.

However, that Oracle could not create WebGL, so its render-disabled FPS data is not GPU evidence.

Before recording, on the user's actual machine perform a short real browser check:

```text
actual WebGL rendering
one intended frame authority
no blocking console errors
no progressive reset slowdown
no repeated >33.3 ms frame storm
Train TEST visually stable
Terrain 7/water materials load
```

The user performs visual judgement.

---

# 20. Strict execution order — FROM NOW

## NOW-1 — Z-hop motion policy

Implement the global terrain-max safe travel plane and vertical-lift/horizontal-travel/vertical-approach policy.

Checkpoint:

```text
old 46/303 retreat collision removed
```

## NOW-2 — Full Construction progression

Run repeatedly until:

```text
303 / 303
```

or a genuinely different hard blocker is proven.

Fix demonstrated execution blockers only.

## NOW-3 — Train + Mission on the completed real board

Prove:

```text
TRAIN_FELL
-> same mission BUILD
-> complete board
-> CROSSED
-> COMPLETE
```

## NOW-4 — hero:1

Run the complete flagship workflow on one exact commit.

## NOW-5 — hero:3

Three consecutive successful hero journeys are the functional freeze gate.

## NOW-6 — final branch consolidation

Once green:

```text
push final PR #6 head
retarget PR #6 to main
rerun final gate on exact head
merge PR #6 only
close PR #5 as superseded
record release SHA
```

## NOW-7 — deploy

Preferred route:

```text
GitHub final release SHA
-> Cloudflare Pages
-> clean/incognito browser
-> native WebMCP/tool check
```

Verify Terrain 7 is a real deployed GLB, not a Git LFS pointer.

## NOW-8 — video / submission

Record only after the strongest stable functional freeze.

Target video length:

```text
2:20–2:40
under 3 minutes
```

Protect the story:

```text
WebMCP design
-> exact hologram
-> Human + Codex shared build
-> early TRAIN_FELL
-> continue/repair
-> CROSSED
-> MISSION COMPLETE
```

---

# 21. Scope cuts until hero:3

Do NOT spend time on:

- advanced support-floor authoring;
- terrain stair-step voxels;
- extra terrain variants;
- extra bridge families;
- structural-collapse expansion;
- trees/grass/environment polish;
- renderer rewrite;
- new physics engine;
- BVH unless measured and absolutely necessary;
- physical UR10 deployment;
- train GLB visual replacement before functional freeze;
- screenshot evidence generation;
- non-blocking UI polish.

A reliable functional demo beats additional polish.

---

# 22. Canonical package/reference inventory

Keep these as reference/evidence only; current PR #6 code is the integration authority.

## Construction

```text
ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_V1.zip
```

## Train

```text
ORACLE_TRAIN_MAIN_DEMO_ADAPTERS_V1(1).zip
```

Earlier package evidence included 47/47 Node, 10/10 browser, 7/7 Construction compatibility and source-equivalence checks. PR #6 later reported Train 49/49.

## Mission

```text
ORACLE_MISSION_INTEGRATION_ADAPTERS_V1(1).zip
```

Package evidence:

```text
114/114 PASS
```

## Submission Gate

```text
ORACLE_SUBMISSION_GATE_CURRENT_RUNTIME_V1(1).zip
```

## Adversarial Hero QA

```text
ORACLE_P0_ADVERSARIAL_HERO_QA_V1.zip
```

Its reset/error findings have now been incorporated into the current Terrain 7 checkpoint.

## Browser Performance / Soak QA

```text
ORACLE_BROWSER_PERFORMANCE_SOAK_QA_V1.zip
```

No progressive bounded-lifecycle leak was found; GPU rendering still requires the final user's-machine check.

## Independent WebMCP Judge Audit

```text
ORACLE_WEBMCP_JUDGE_AUDIT_FINAL_V1.zip
```

Judge assessment of the earlier accepted 19-tool runtime:

```text
6.6 / 10 current
9.1 / 10 potential after P0 integration/fixes
```

The missing 27-tool semantic integration identified by that audit is now present on PR #6 and must be reverified on the final release commit.

## Release / Deployment Readiness

```text
ORACLE_RELEASE_DEPLOYMENT_READINESS_V1
```

Use its Cloudflare/release guidance after hero freeze, updated for Terrain 7 and the final native WebMCP seam.

---

# 23. Final release acceptance checklist

One exact release commit should prove all of the following:

1. Terrain 7 loads.
2. Authored water material/normal map loads.
3. ENTRY / EXIT and challenge frame are coherent.
4. Build datum is `Z = -132.718 mm` through the real challenge/support seam.
5. Human terrain click-through prevention is active.
6. Water does not block Human placement.
7. Final V4.6 BuildPlan has zero prohibited internal intersections.
8. Every non-zero BOM class is represented in PartRegistry.
9. Human and Agent are legal for every required hero class.
10. Human places at least one real frozen-plan target.
11. Agent executes a meaningful sequence through real RobotController/collision checks.
12. Global Z-hop travel prevents low-level lateral retreat collisions without bypassing safety.
13. Full final Construction can reach 303/303.
14. Human source theft -> Agent source reassignment still works.
15. Human completion of an Agent target -> ADOPTED still works.
16. Atomic reset remains safe during motion/held-part state.
17. Early TEST reads BuildBoard only and produces TRAIN_FELL.
18. Same frozen mission returns to BUILD.
19. Accepted construction persists after Train failure.
20. Completed final board produces CROSSED.
21. Mission enters COMPLETE exactly once from CROSSED.
22. TRY AGAIN / reset_mission creates a new missionId.
23. Old mission operations fail after reset.
24. Final native WebMCP surface has exactly 27 unique tools through one registrar.
25. Tool annotations and recovery errors remain truthful/actionable.
26. No duplicate RAF/body/listener/service authority.
27. No blocking console errors/unhandled rejections.
28. Real GPU/browser behavior is stable enough to record.
29. `hero:1` passes.
30. `hero:3` passes.

---

# 24. Final claim safety

Do not claim:

- physical UR10 readiness;
- physical one-second bridge cycles;
- physical collision safety;
- physical reliability/accuracy;
- 120 FPS based on the render-disabled Oracle environment;
- a completed Train crossing based only on a fixture;
- visual PASS where only the user can verify it.

Safe core claim:

**The human and Codex share one deterministic browser world and one frozen BuildPlan; WebMCP lets Codex understand, change, build and test the mission, while Train outcomes prove whether the shared construction succeeded.**

---

# 25. Final principle

**Terrain 7 is solved enough to move on. Internal V4.6 geometry is clean. Do not reopen those problems.**

**The immediate blocker is executable robot travel. Use the simple terrain-max Z-hop policy, run Construction all the way to 303/303, then immediately unlock Train CROSSED, Mission COMPLETE and hero:3.**

**User = eyes. Codex = implementation/test engine.**

**Once hero:3 passes, stop feature work, consolidate PR #6 into main, deploy, record and submit.**
