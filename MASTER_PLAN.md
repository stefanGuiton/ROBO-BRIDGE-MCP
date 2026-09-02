# ROBO BRIDGE MCP — Submission Master Plan

**Status:** FINAL SUBMISSION DAY — GEOMETRY CALIBRATION + INTEGRATION SPRINT  
**Plan version:** 2026-09-02-G  
**Authoritative production `main`:** `ec3c9237c224210112acd0ba71ddc06ea95f9f91`  
**Active Construction WIP:** draft PR #5, `codex/p0-construction-integration` at `d6154a58d97f52b3058d04c50eeb3ab5066de70c`  
**Submission deadline:** 2026-09-03 13:00 PDT / 21:00 BST  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Canonical authority:** `RevisionClock` + `BuildBoard` + `PlacementAuthority` + `RobotController`  
**Primary goal:** one complete, reliable, judge-visible WebMCP collaboration journey

---

# 0. Authority

This file is the authoritative submission execution plan.

If an older plan, prototype README, Oracle report, standalone package, experimental branch, or chat instruction conflicts with this file, **this file wins for the submission sprint**.

A standalone Oracle ZIP can be package-complete without being production-integrated. A draft PR can contain valuable integration work without being accepted for `main`.

Required hero loop:

`CURATED TERRAIN -> CODEX CO-DESIGN -> V4.6 BUILDPLAN -> EXACT HOLOGRAM -> FREEZE -> HUMAN + CODEX/UR10 BUILD -> EARLY TRAIN FAILURE -> CONTINUE/REPAIR -> TRAIN SUCCESS -> MISSION COMPLETE -> TRY AGAIN`

Central narrative:

**Codex decides. Deterministic systems execute. Human actions change the shared world. The runtime adapts. BuildBoard controls TEST. The train proves the result.**

Hard architecture rule:

`RevisionClock -> BuildBoard + PlacementAuthority + RobotController -> Runtime -> Renderer / Player / Perception / WebMCP`

Never create:

- a second BuildBoard;
- a second accepted inventory/occupancy truth;
- a second RobotController;
- a second RevisionClock;
- a WebMCP-only bridge state;
- a train-owned bridge-complete Boolean;
- a mission-owned physical-part truth;
- an instant-build shortcut;
- direct mission/support completion setters;
- joint-level WebMCP controls.

Do not restore NVIDIA Newton.

---

# 1. Executive status

Three progress numbers are now useful:

- **Required P0 code/components available:** approximately **98%**. Bridge, Construction, Train, Mission adapters and the Submission Gate all exist as production-oriented implementations/packages.
- **Accepted production `main` integration:** approximately **82%**. `main` remains intentionally stable while Construction geometry is unresolved.
- **Construction integration branch maturity:** approximately **88–90% of the integration path is demonstrated**, but PR #5 remains BLOCKED and MUST NOT merge until geometry acceptance passes.

The project is no longer missing major software subsystems.

The remaining critical problem is now:

`FINAL CHALLENGE/SUPPORT GEOMETRY -> CLEAN V4.6 BUILDPLAN -> COMPLETE CONSTRUCTION ACCEPTANCE -> WIRE TRAIN -> WIRE MISSION -> QA -> RELEASE`

Do not start another large subsystem from scratch.

---

# 2. Current production main — accepted checkpoint

Production `main`:

`ec3c9237c224210112acd0ba71ddc06ea95f9f91`

This merged PR #4 and currently proves:

- authoritative V4.6 BridgeHost;
- exact BuildPlan-derived Aqueduct hologram;
- five bridge-design WebMCP tools;
- existing fourteen low-level robot/build WebMCP tools;
- 19 total production tools;
- curated EASY terrain integration;
- unified challenge-owned bridge / ENTRY / EXIT transform;
- final old-terrain orientation across the worktable;
- corrected display-frame collision proxies;
- player navigation cleanup;
- no TCP indicator;
- reliability 20/20.

This old terrain remains the accepted production fallback until the new terrain/support-floor challenge is validated.

Do not destabilise `main` while the calibration work is still exploratory.

---

# 3. Construction WIP — preserve, do not merge yet

Draft PR #5:

- branch: `codex/p0-construction-integration`
- checkpoint: `d6154a58d97f52b3058d04c50eeb3ab5066de70c`
- base: `main @ ec3c9237...`
- status: **valuable WIP / blocked acceptance / do not merge**

Verified WIP accomplishments:

- imported the final Construction/PartRegistry production modules;
- current BridgeHost -> immutable freeze -> dynamic PartRegistry/inventory;
- same existing BuildBoard;
- same existing lookahead / cycle runner / RobotController / PlacementAuthority;
- no stale 476-part production fixture imported;
- no actor-exclusive source pool;
- both `human` and `agent` permitted for every current part class;
- actor preference is scheduling metadata, not permission;
- typed capture offsets and collision metadata;
- exact custom-part visual adapter;
- BuildBoard target loading and dependency checks;
- frozen-design mutation lock;
- Settings-panel ENTRY/EXIT XYZ controls;
- linked endpoint height and atomic shared challenge transform;
- browser persistence/reset of endpoint controls;
- one human and three robot ARCH_B placements accepted on the same BuildBoard in real MAIN_DEMO service-path evidence;
- human stole a planned source -> lookahead reassigned it;
- human completed a Codex-intended target -> runtime adopted it and continued;
- controller integration accepted 15 parts before correctly stopping at a collision;
- JavaScript 163/163;
- Robot 30/30;
- Compiler 26/26;
- WebMCP 15/15;
- Player 26/26;
- Reliability 20/20;
- final Chrome run: zero console errors/warnings.

Current WIP BuildPlan evidence:

```text
planId: bp_0d7627b1
parts: 131
1x1x1: 87
1x2x1: 15
ARCH_A: 21
ARCH_B: 6
TRACK_SEGMENT: 2
```

Current WIP registry:

```text
revision: bridge-part-registry.p0.v1
hash: pr_767a6c8c
freeze checksum: freeze_5c084eff
```

Important timing note:

The bridge custom-part browser cycle evidence averaged approximately 3.61 s start-to-start for the measured sequence. Do **not** claim one-second bridge cycles. The earlier simple-brick one-second simulator evidence remains separate.

---

# 4. Current hard blocker — exact V4.6 internal part intersections

PR #5's independent exact geometry audit confirmed **21 real generated-part intersections** in the current old-terrain BuildPlan:

```text
9 arch/arch
12 standard-brick/arch
21 total exact intersecting pairs
```

These are not merely AABB false positives.

A common world transform cannot remove intersections between generated bridge parts.

Therefore:

- do not disable collision checks;
- do not force-accept colliding targets;
- do not hide the problem with rendering tricks;
- do not merge PR #5 while this remains true.

The previous provisional +100 mm challenge elevation solved the old-tabletop vertical placement issue but **cannot** solve internal bridge-part overlap.

The preferred next step is NOT immediate compiler surgery.

First test the new terrain + manually authored support floor + new challenge geometry. That can legitimately change the V4.6 challenge/support input and therefore the generated BuildPlan.

Only if the new calibrated challenge still produces internal intersections should a bounded V4.6 compiler/custom-geometry repair be authorised.

---

# 5. New terrain strategy — current critical path

The user has prepared a newer terrain that is visually cleaner and easier to author for construction.

Current Blender bridge reference:

```text
ENTRY = (0.00, 0.00, 0.00) m
EXIT  = (0.37, 0.00, 0.00) m
```

Blender / ROBO convention:

```text
X = bridge longitudinal direction
Y = horizontal transverse direction
Z = up
```

Therefore:

```text
ENTRY -> EXIT = +X
nominal span = 370 mm
bridge yaw = 0 degrees in the authored terrain frame
```

This is intentionally simpler than the old production terrain, which required a larger machine-frame rotation/rebase.

Do not rotate the canonical robot/table coordinate system merely to compensate for terrain orientation. Prefer terrain/challenge authoring that is naturally aligned to the bridge grid.

Recommended final GLB marker nodes:

```text
RB_ENTRY
RB_EXIT
RB_BRIDGE_FRAME
```

The loader should also tolerate `Entry` / `Exit` during calibration.

---

# 6. Manual transparent support-floor strategy — P0 calibration authority

The immediate geometry task is to author a deterministic support/floor field underneath the bridge using the Player-based visual lab.

This support floor is a **challenge/terrain support definition**.

It is NOT:

- bridge BOM;
- BuildBoard inventory;
- Human/Codex contribution;
- robot source inventory.

It may become nearly or fully transparent in the final presentation.

## 6.1 Independent grid frame

Create one independent support-floor frame:

`RB_FLOOR_GRID`

with editable:

```text
origin X mm
origin Y mm
origin Z mm
yaw deg (normally 0)
cell X = 16 mm
cell Y = 16 mm
layer height Z = 9.6 mm
```

ENTRY/EXIT remain terrain/challenge markers.

The floor-grid origin moves independently and is expected to sit below ENTRY Z=0 as required by the terrain.

When the grid origin moves, all floor blocks retain integer grid indices and move coherently with the frame.

## 6.2 Required virtual floor-block catalogue

Logical XYZ sizes:

| Type | X | Y | Z |
|---|---:|---:|---:|
| `1x1x1` | 16 mm | 16 mm | 9.6 mm |
| `2x1x1` | 32 mm | 16 mm | 9.6 mm |
| `5x1x1` | 80 mm | 16 mm | 9.6 mm |
| `10x1x1` | 160 mm | 16 mm | 9.6 mm |
| `20x2x1` | 320 mm | 32 mm | 9.6 mm |
| `3x3x1` | 48 mm | 48 mm | 9.6 mm |

Support-floor blocks may be embedded into terrain deliberately.

They must have deterministic integer-grid occupancy and 0/90 degree rotation.

## 6.3 Terrain/floor visual authoring

The Player-based lab must provide:

- Player V7 pointer-lock / WASD / reticle interaction;
- terrain opacity 0–100%;
- floor opacity 0–100%;
- active support layer;
- grid origin nudge controls;
- place/select/rotate/delete floor blocks;
- undo/redo;
- autosave + JSON save/load;
- support-top map visualisation;
- top/side/entry/exit inspection views as secondary tools.

The user should be able to fade terrain to ~15–30%, build the support field underneath it, and visually establish the correct floor.

## 6.4 370 mm / 16 mm grid detail

Current nominal span:

```text
370 mm
```

At 16 mm cells:

```text
23 cells = 368 mm
remainder = 2 mm
```

A useful calibration option is to centre the 368 mm whole-cell span between ENTRY and EXIT, leaving approximately:

```text
1 mm at ENTRY
1 mm at EXIT
```

Do not silently move ENTRY or EXIT to achieve this.

---

# 7. Support-floor output contract

The floor authoring lab should export canonical integer-grid data including:

```text
terrainAsset
entryMm
exitMm

gridFrame:
  originMm {x,y,z}
  yawDeg
  cellXmm
  cellYmm
  layerHeightMm

floorBlocks[]:
  id
  type
  sizeCells {x,y,z}
  gridIndex {x,y,z}
  yawDeg

expandedOccupancyCells[]
supportTopMap[]
bounds
```

`supportTopMap` should describe, for each occupied X/Y cell, the highest authored support layer/top Z and the source floor-block ID.

This support-top map becomes the calibrated terrain/support input for V4.6 through the real compiler's accepted terrain/support seam.

Do not invent a second incompatible bridge compiler.

---

# 8. New-terrain V4.6 decision gate

After the manual support floor is authored:

1. load the real accepted V4.6 bridge core;
2. feed the calibrated support-top map through the supported challenge/support callback/API;
3. compile the actual hero Aqueduct;
4. render exact hologram + solid custom geometry;
5. run the exact internal geometry audit;
6. inspect terrain/support contact;
7. export final calibration JSON and BuildPlan identity.

Decision:

```text
IF internal exact intersections == 0
    -> adopt new challenge/support definition
    -> resume PR #5 Construction on that BuildPlan
ELSE
    -> freeze the new challenge/support geometry
    -> give exact new BuildPlan + audit evidence to a Pro Oracle
    -> perform only a bounded V4.6 geometry/compiler repair
```

Do not repair the old 21-intersection BuildPlan first if the new challenge makes it obsolete.

---

# 9. Package inventory — current verified outputs

## Bridge core / design

Production bridge design is already integrated.

Reference package:

`ORACLE_BRIDGE_CORE_MAIN_DEMO_V1`

Do not restore the standalone V4.6 execution engine as authority.

## Construction

Use only:

`ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_V1.zip`

The production integration work is already largely represented in PR #5.

Do not use old `ALL_AVAILABLE_WORK` Construction ZIPs.

## Train — canonical integration package

Use:

`ORACLE_TRAIN_MAIN_DEMO_ADAPTERS_V1(1).zip`

Verified independently:

- ZIP/package integrity PASS;
- 47/47 Node tests PASS;
- browser acceptance 10/10 PASS;
- Construction compatibility 7/7 PASS;
- source-equivalence checks 16/16;
- partial BuildBoard -> `TRAIN_FELL`;
- complete supported BuildBoard -> `CROSSED`;
- yaw 0 and 90 degree route support;
- translated/elevated route support;
- coupled-body overlap/self-collision regression;
- repeated reset coverage.

This package is transform-independent and should consume current ChallengeService route/transform interfaces at integration time.

## Mission — canonical integration package

Use:

`ORACLE_MISSION_INTEGRATION_ADAPTERS_V1(1).zip`

Verified independently:

- 114/114 Mission + adapter tests PASS;
- package verification PASS;
- real Construction adapter smoke PASS;
- real Train `TRAIN_FELL` smoke PASS;
- real Train `CROSSED` smoke PASS.

Semantic mission tools:

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

Expected final WebMCP count:

```text
14 low-level
+ 5 bridge design
+ 8 mission/terrain
= 27 tools
```

Important compatibility rule:

Prefer the newer Train integration's clean Mission-facing adapter:

```text
getState()
test()
reset()
```

Do not regress Mission integration back to the older raw Train service seam.

## Submission Gate — canonical current-runtime package

Use:

`ORACLE_SUBMISSION_GATE_CURRENT_RUNTIME_V1(1).zip`

Verified:

- package unit suite 11/11 PASS;
- Oracle current-runtime evidence: JavaScript 164/164;
- browser acceptance 46 PASS / 0 FAIL;
- blocking browser errors 0;
- current tool profile 19;
- future Construction/Train/Mission checks activate only when those services actually exist.

Useful commands remain:

```bash
npm run submission:gate
npm run submission:smoke
npm run webmcp:audit
npm run hero:1
npm run hero:3
npm run hero:10
npm run release:evidence
```

---

# 10. Production pipelines

## Design

`natural language -> WebMCP -> BridgeHost -> V4.6 -> BuildPlan -> exact hologram`

**Status: COMPLETE in main.**

## Challenge/support calibration

`new terrain -> ENTRY/EXIT -> independent RB_FLOOR_GRID -> manually authored floor blocks -> supportTopMap -> V4.6 challenge/support input`

**Status: IN PROGRESS / immediate critical path.**

## Freeze

`accepted calibrated challenge + BridgeSpec + clean BuildPlan -> freeze identity -> BuildBoard requirements -> BUILD`

**Status: implementation exists; final clean geometry pending.**

## Construction

`frozen BuildPlan -> PartRegistry -> shared inventory -> normalized placements -> existing cycle runner -> RobotController -> PlacementAuthority -> same BuildBoard`

**Status: strong WIP in PR #5; blocked by current BuildPlan geometry.**

## TEST

`frozen identity + accepted BuildBoard snapshot -> Train integration -> support/collision snapshot -> TRAIN_FELL/CROSSED`

**Status: package-complete; MAIN_DEMO integration pending Construction acceptance.**

## Mission

`DESIGN -> BUILD -> TEST -> BUILD on TRAIN_FELL / COMPLETE on CROSSED -> reset`

**Status: adapter/package-complete; MAIN_DEMO integration pending Train/Construction.**

---

# 11. Shared Human + Codex construction rule

Hard P0 rule:

**No hero part class is Human-only or Codex-only.**

Both actors share:

- one PartRegistry;
- one source inventory;
- one BuildBoard;
- the same pending targets.

`actorPreference` is a scheduling hint, never a permission boundary.

A specific robot placement may be unreachable for geometric/workspace reasons, but the part class itself must not become Human-only.

PR #5 already demonstrates the intended shared-inventory/adoption architecture and must preserve it when the new challenge geometry lands.

---

# 12. Frozen mission identity

`start_bridge_build` freezes at least:

```text
missionId
challengeId
bridgeSpec
designRevision
planId
designChecksum
worldTransform / calibrated challenge frame
requiredPlacementIds
partRegistryRevision/hash
support-floor/grid identity or checksum where used
```

Every build and TEST action verifies the same frozen identity.

A redesign during BUILD requires reset/return to DESIGN. It may not silently replace the frozen mission.

---

# 13. Revised strict execution order

## TODAY-1 — keep production main stable

**COMPLETE.**

`main @ ec3c9237...` is the fallback production checkpoint.

Do not merge PR #5 yet.

## TODAY-2 — finish Player-based new-terrain support-floor lab

**CURRENT CRITICAL PATH.**

Required acceptance:

1. latest new terrain loads with materials;
2. ENTRY reads as `(0,0,0)` m or its authored marker equivalent;
3. EXIT reads as `(0.37,0,0)` m or its authored marker equivalent;
4. independent grid origin X/Y/Z can move without moving ENTRY/EXIT;
5. terrain opacity works;
6. all six floor block types place correctly;
7. multi-layer floor works;
8. grid occupancy is deterministic;
9. floor save/reload is lossless;
10. supportTopMap is exported;
11. real V4.6 compiles against the authored support input;
12. exact internal intersection count is reported.

## TODAY-3 — choose geometry path

If new BuildPlan has zero internal exact intersections:

- adopt the new challenge/support calibration;
- update PR #5 to that BuildPlan;
- rerun full Construction acceptance.

If intersections remain:

- freeze new terrain/support calibration;
- send the exact current BuildPlan/audit to Pro Oracle;
- perform a small compiler/custom-geometry repair only;
- do not redesign Construction.

## TODAY-4 — complete Construction PR #5

Hard acceptance:

- current clean BuildPlan freezes;
- PartRegistry generated dynamically;
- all required hero classes represented;
- Human + Codex both permitted for all hero classes;
- one shared inventory;
- one shared BuildBoard;
- human real placement accepted;
- Codex/UR10 meaningful sequence accepted;
- stolen source reassigned;
- human takeover/adoption succeeds;
- no illegal internal bridge collisions;
- relevant terrain/support clearance accepted;
- regressions and browser console clean.

Then merge to `main`.

## TODAY-5 — integrate Train adapter package

Use `ORACLE_TRAIN_MAIN_DEMO_ADAPTERS_V1(1).zip`.

Wire only:

`ChallengeService + frozen BuildPlan + live BuildBoard + PartRegistry -> TrainIntegration`

Acceptance:

1. partial accepted bridge -> `TRAIN_FELL`;
2. reset train;
3. continue same frozen construction;
4. sufficient/complete support -> `CROSSED`;
5. no hardcoded pass/fail;
6. no train-owned bridge truth.

## TODAY-6 — integrate Mission adapter package

Use `ORACLE_MISSION_INTEGRATION_ADAPTERS_V1(1).zip`.

Target 27 tools through the one existing registrar.

Acceptance:

`DESIGN -> BUILD -> failed TEST -> BUILD -> successful TEST -> COMPLETE -> reset -> new missionId DESIGN`

Only `CROSSED` may produce COMPLETE.

## TODAY-7 — install/run current Submission Gate

Use `ORACLE_SUBMISSION_GATE_CURRENT_RUNTIME_V1(1).zip`.

Run:

```bash
npm run submission:gate
npm run hero:3
```

If hero 3/3 passes, freeze feature work.

Then if time permits:

```bash
npm run webmcp:audit
npm run hero:10
npm run release:evidence
```

## TODAY-8 — release + video

Only after hero 3/3:

1. final native WebMCP acceptance;
2. hosted URL;
3. public-repo/IP/provenance gate;
4. README + 27-tool catalogue + judge instructions;
5. record/edit public <3-minute video;
6. Devpost submission.

---

# 14. Hero acceptance gate

Submission runtime is ready only when all are true:

1. final curated terrain loads in real MAIN_DEMO;
2. ENTRY/EXIT/challenge geometry are authoritative and coherent;
3. support-floor/grid definition is frozen or otherwise deterministic;
4. WebMCP changes BridgeSpec;
5. V4.6 creates the authoritative BuildPlan;
6. exact hologram matches plan identity;
7. internal bridge geometry audit passes;
8. BUILD freezes mission/plan/challenge/registry/support identity;
9. every hero part is represented by PartRegistry;
10. Human and Codex can both use every supported hero part class;
11. Human places an accepted part;
12. UR10 places a meaningful accepted sequence;
13. Human removes/uses a source planned for Codex;
14. runtime reassigns another valid source;
15. Human completes a Codex-intended target and runtime adopts it;
16. early TEST derives support from accepted BuildBoard state only;
17. train visibly fails at real unsupported support;
18. accepted construction survives failure;
19. build continues on same frozen plan;
20. final TEST returns CROSSED from real support;
21. Mission enters COMPLETE only from CROSSED;
22. TRY AGAIN creates a clean new mission and invalidates old IDs;
23. final WebMCP semantic responses are bounded/recovery-aware;
24. no page/tool authority mismatch;
25. no blocking console errors or unhandled rejections;
26. full hero sequence passes 3 consecutive times minimum.

---

# 15. WebMCP final surface

Existing 19 tools remain unless deliberately deprecated after final review.

Add eight mission/terrain tools:

1. `get_mission_state`
2. `get_terrain_options`
3. `select_terrain`
4. `start_bridge_build`
5. `get_build_progress`
6. `build_next_parts`
7. `test_bridge`
8. `reset_mission`

Expected final total: **27 tools**.

Normal mission responses should remain concise, approximately <=1.5K characters where practical, with paged detail.

Errors should include stable code, retryable flag, recovery action, current phase/revisions and allowed next actions.

P0 annotation review item:

`plan_placement_queue` mutates logical planning/ghost state and must not remain incorrectly advertised as read-only.

---

# 16. QA / evidence gate

The current Submission Gate package is ready to become the referee once the services exist in MAIN_DEMO.

Required strict sequence:

```bash
npm run submission:gate
npm run hero:3
# freeze feature work if 3/3 passes
npm run webmcp:audit
npm run hero:10       # only if time permits
npm run release:evidence
```

Do not count isolated package tests as integrated hero acceptance.

Do not hide `NOT_AVAILABLE`; the gate must activate real checks only when the actual production service is present.

---

# 17. Simulation-only boundary

Do not claim:

- physical UR10 cycle timing;
- physical 650 mm/s readiness;
- physical safety;
- physical accuracy;
- hardware collision validation;
- hardware reliability.

Current robot/train timing and collision evidence is simulation evidence only.

Physical hardware is not required for this submission.

---

# 18. Scope cuts until P0 passes

Do not spend submission time on:

- CHALLENGING terrain;
- Viaduct production acceptance;
- trees/grass polish beyond genuine readability blockers;
- NVIDIA Newton;
- procedural terrain;
- extra bridge families;
- structural collapse;
- fancy train art / final train GLBs;
- robot loading/coupling train vehicles;
- custom HDRI/interior redesign;
- photo/ImageGen mode;
- individual brick paint system;
- joint-level MCP controls;
- general motion planning;
- physical UR10 deployment.

The support-floor authoring lab is not optional polish: it is currently part of resolving the P0 geometry blocker.

---

# 19. Submission presentation gate — after hero freeze

Project name:

**ROBO BRIDGE MCP**

One-line description:

> Human and AI co-design and build the same bridge, then prove the result with a train test.

Central submission story:

`HUMAN + AGENT SHARE ONE WORLD -> CO-DESIGN -> SHARED BUILDPLAN -> CO-BUILD -> TEST FAILS -> AGENT OBSERVES -> CONTINUE/REPAIR -> TRAIN CROSSES`

Video requirements:

- under 3 minutes;
- public YouTube;
- audio narration;
- working result in first 10–15 seconds;
- real WebMCP tool use visible;
- no login/setup/loading footage;
- protect failure -> observe -> repair/continue -> successful crossing.

Target duration: **2:20–2:40**.

Recommended cut:

| Time | Show |
|---|---|
| 0:00–0:12 | Working bridge/human/Codex/train-success hook |
| 0:12–0:35 | User goal + real WebMCP calls |
| 0:35–1:05 | Terrain/design read + proposal/change + hologram |
| 1:05–1:35 | Human + Codex build same frozen BuildPlan |
| 1:35–2:00 | Early TEST fails + agent observes |
| 2:00–2:20 | Continue/repair + final CROSSED + MISSION COMPLETE |
| 2:20–2:35 | Short authority/WebMCP explanation |

Never overstate physical hardware evidence.

---

# 20. Final submission checklist

| ID | Task | completed |
|---|---:|---:|
| SUB-01 | Lock final runtime and hero geometry | false |
| SUB-02 | Hero loop 3/3 | false |
| SUB-03 | Final Submission Gate PASS | false |
| SUB-04 | Final native WebMCP browser acceptance | false |
| SUB-05 | Hosted URL | false |
| SUB-06 | Public repo / licence / provenance / IP gate | false |
| SUB-07 | README + judge testing instructions | false |
| SUB-08 | Record/edit <3-minute video | false |
| SUB-09 | Public YouTube video | false |
| SUB-10 | Complete Devpost fields | false |
| SUB-11 | Submit before 2026-09-03 21:00 BST | false |

If time becomes constrained, cut optional polish before cutting reliability, visible WebMCP evidence, fail/repair/pass, or submission clarity.

---

# 21. Final principle

**Do not build another major subsystem from scratch.**

**First establish the final terrain/support grid visually. Then demand a clean real V4.6 BuildPlan. Preserve PR #5's shared-authority Construction work, wire the already-finished Train and Mission packages, and let the Submission Gate decide readiness.**

**Today, optimise for one undeniable working mission, not feature count.**

**Codex decides. Deterministic systems execute. Human actions change the shared world. The runtime adapts. BuildBoard controls TEST. The train proves the result.**