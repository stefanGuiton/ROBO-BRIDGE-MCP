# ROBO BRIDGE MCP — Submission Master Plan

**Status:** FINAL SUBMISSION DAY INTEGRATION SPRINT  
**Plan version:** 2026-09-02-F  
**Main checkpoint before this plan update:** `4f2114260a3fdee4bb5c16f236de4d0e92d4b4ac`  
**Latest verified integrated runtime checkpoint:** `dc062cfa8f986b4a05228fe5c48f7b82c5d6bb6a` on `codex/p0-final-integration`  
**Required next integration base:** `dc062cfa8f986b4a05228fe5c48f7b82c5d6bb6a`  
**Submission deadline:** 2026-09-03 13:00 PDT / 21:00 BST  
**Internal goal:** fully working hero demo and submission package today  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Canonical authority:** `RevisionClock` + `BuildBoard` + `PlacementAuthority` + `RobotController`  
**Primary goal:** one complete, reliable, judge-visible WebMCP collaboration journey

---

# 0. Authority

This file is the authoritative submission execution plan.

If an older plan, prototype README, Oracle report, standalone package, experimental branch, or chat instruction conflicts with this file, **this file wins for the submission sprint**.

Oracle ZIPs may contain production-quality code, but a ZIP is not counted as integrated until its MAIN_DEMO integration gate passes.

Required hero loop:

`CURATED EASY TERRAIN -> CODEX CO-DESIGN -> V4.6 BUILDPLAN -> EXACT HOLOGRAM -> FREEZE -> HUMAN + CODEX/UR10 BUILD -> EARLY TRAIN FAILURE -> CONTINUE/REPAIR -> TRAIN SUCCESS -> MISSION COMPLETE -> TRY AGAIN`

Central narrative:

**Codex decides. Deterministic systems execute. Human actions change the shared world. The runtime adapts. BuildBoard controls TEST. The train proves the result.**

Judging priority:

1. WebMCP Leverage
2. Execution
3. Potential Impact
4. Creativity & Ambition

All are equally weighted. WebMCP Leverage is the first tie-break criterion.

---

# 1. Completion tracking contract

Every major deliverable uses:

```yaml
id: unique-stable-id
completed: true | false
status: COMPLETE | IN_PROGRESS | READY | BLOCKED | NEEDS_FIX | DEFERRED
last_verified: YYYY-MM-DD or null
evidence: commit / branch / test result / screenshot / audit / package
```

Rules:

1. `completed: true` means the acceptance gate for that exact deliverable has been demonstrated.
2. A standalone/package implementation may be complete while its MAIN_DEMO integration remains incomplete.
3. Do not infer dependent completion automatically.
4. If a later change breaks an accepted feature, set it back to `completed: false`.
5. Simulator timing is never evidence of physical-robot timing.
6. This dashboard is the sprint status source of truth.

---

# 2. Current executive status

Two progress numbers are now required:

- **Code/components available:** approximately **94–95%** of the P0 implementation needed for the final demo now exists either in production or in verified integration packages.
- **Actually integrated in MAIN_DEMO:** approximately **81–82%**. The remaining risk is overwhelmingly integration, physical bridge placement/reachability, hero-loop reliability, and release evidence rather than invention of new subsystems.

The project has moved from:

`BUILD MISSING SUBSYSTEMS`

into:

`INTEGRATE COMPLETED SUBSYSTEMS -> FIX PHYSICAL BUILD FRAME -> RUN HERO GATE -> RELEASE`

Current verified production baseline `dc062cfa...` already proves:

- curated EASY terrain in the real MAIN_DEMO;
- one production ChallengeService/transform authority;
- bridge rebased into the usable robot area;
- bridge span rotated 90 degrees along MAIN_DEMO Y;
- authoritative V4.6 BridgeHost;
- exact BuildPlan-derived Aqueduct hologram;
- atomic WebMCP bridge design mutation;
- 19 native WebMCP tools;
- 0 browser console warnings/errors in the accepted browser run;
- current regression checkpoint: JavaScript 153/153, WebMCP 15/15, Robot 30/30, Player 25/25, Compiler 26/26, Reliability 20/20, `npm run verify` PASS.

---

# 3. Current completion dashboard

| ID | Deliverable | completed | status | Evidence / current truth |
|---|---|---:|---|---|
| FND-01 | MAIN_DEMO Player V8 foundation | true | COMPLETE | Production foundation |
| FND-02 | Human pickup/rotate/snap/place | true | COMPLETE | Integrated + regression coverage |
| FND-03 | UR10 + calibrated animated gripper | true | COMPLETE | Integrated simulator runtime |
| FND-04 | One RevisionClock + BuildBoard + RobotController authority | true | COMPLETE | Current architecture |
| MCP-BASE-01 | Native WebMCP base execution surface | true | COMPLETE | Existing 14-tool surface |
| MCP-BASE-02 | Camera perception + placement preview | true | COMPLETE | Existing evidence/tests |
| MCP-BASE-03 | Scalable logical placement stream | true | COMPLETE | Existing production runtime |
| MCP-BASE-04 | Five-slot active execution window | true | COMPLETE | Current planner |
| MCP-BASE-05 | Automatic source-part reassignment | true | COMPLETE | Current runtime |
| MCP-BASE-06 | Bounded placement cancellation | true | COMPLETE | Current runtime |
| BUILD-DEMO-01 | Deterministic generic structure planner | true | COMPLETE | `4a9b88ac...` |
| BUILD-DEMO-02 | Single-brick Codex/UR10 demo | true | COMPLETE | Browser verified 1/1 |
| BUILD-DEMO-03 | 3×4 wall Codex/UR10 demo | true | COMPLETE | Browser verified 12/12 |
| BUILD-DEMO-04 | 4-layer cross-laminated tower demo | true | COMPLETE | Browser verified 8/8 |
| BUILD-DEMO-05 | Browser-local planned-cycle runner | true | COMPLETE | Reuse for bridge build |
| BUILD-DEMO-06 | Configurable `cycleTimeMs` | true | COMPLETE | Simulator-only 1,000 ms target demonstrated |
| BUILD-DEMO-07 | Current JS regression | true | COMPLETE | 153/153 at `dc062cfa...` |
| BUILD-DEMO-08 | Reliability checkpoint | true | COMPLETE | 20/20 at `dc062cfa...` |
| ORA-AUDIT-01 | Submission readiness Oracle audit | true | COMPLETE | Reviewed |
| ORA-AUDIT-02 | Deep WebMCP audit | true | COMPLETE | Adopted into plan |
| BRG-V46-01 | V4.6 Aqueduct/Viaduct compiler package | true | COMPLETE | Deterministic V4.6 package |
| BRG-CORE-PKG-01 | Production DOM-free V4.6 bridge-core package | true | COMPLETE | 39/39 independently rerun |
| MCP-DESIGN-PKG-01 | Five-tool bridge-design WebMCP package | true | COMPLETE | Integrated into production |
| TERRAIN-PKG-01 | Curated terrain/challenge package | true | COMPLETE | 26/26 package acceptance |
| TERRAIN-INT-01 | EASY terrain integrated in MAIN_DEMO | true | COMPLETE | `dc062cfa...` |
| TERRAIN-INT-02 | EASY rebased into real UR10 area | true | COMPLETE | Bridge centre X=650 mm, yaw 90 degrees |
| BRG-INT-01 | BridgeHost/compiler integrated in MAIN_DEMO | true | COMPLETE | `69b970bb...` -> preserved in `dc062cfa...` |
| BRG-INT-02 | Exact BuildPlan hologram in MAIN_DEMO | true | COMPLETE | Reactive plan/checksum/hologram proof |
| MCP-DESIGN-INT-01 | Five bridge WebMCP tools registered | true | COMPLETE | 19 total tools in browser |
| CONST-PKG-01 | Construction/PartRegistry production package | true | COMPLETE | Final `ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_V1.zip`; 17/17 package tests + browser harness |
| TRAIN-PKG-02 | Train V2.2 production package | true | COMPLETE | `ROBO_BRIDGE_TRAIN_V22_PRODUCTION`; 19/19 verification |
| MCP-MISSION-PKG-01 | Mission + outcome-level WebMCP package | true | COMPLETE | `ORACLE_MISSION_WEBMCP_RUNTIME_V1`; 103/103 verification |
| QA-PKG-01 | Automated submission gate package | true | COMPLETE | `oracle/p0-submission-gate` `fc37ddd...`; 45 PASS / 0 FAIL / future hooks NOT_AVAILABLE on old baseline |
| PART-01 | Authoritative current-hero PartRegistry integrated | false | READY | Package exists; must regenerate from current 131-part BuildPlan |
| PART-02 | Current hero part types supported by real build runtime | false | NEEDS_FIX | Oracle conservative actor policy is too human-heavy for hero demo |
| GEO-BUILD-01 | Physical bridge elevation clears tabletop/terrain | false | BLOCKED | Current lower Aqueduct geometry extends below physical work surface |
| GEO-BUILD-02 | Codex-assigned hero targets robot-reachable | false | BLOCKED | Must be verified after coherent elevation correction |
| BRG-INT-03 | Frozen current BuildPlan projected into BuildBoard | false | READY | Construction package exists |
| BRG-INT-04 | BUILD freezes full mission/plan identity | false | READY | Freeze implementation/package exists |
| MCP-MISSION-01 | Outcome-level mission WebMCP surface integrated | false | READY | Package exists; thin adapters required |
| MCP-MISSION-02 | `build_next_parts` executes existing real simulator cycle runner | false | READY | Construction/Mission packages expose seam |
| MCP-OUTPUT-01 | Normal mission outputs ~1.5K chars | false | READY | Mission package implements bounded outcome surface; production integration unproven |
| MCP-ERROR-01 | Common recovery-aware error envelope | false | READY | Mission package exists |
| MCP-ANNOT-01 | Tool annotations audited/correct | false | NEEDS_FIX | Submission gate flags `plan_placement_queue` readOnlyHint=true as high risk |
| TRAIN-INT-01 | Train V2.2 rendered at ENTRY in MAIN_DEMO | false | READY | Production package exists |
| TRAIN-INT-02 | BuildBoard-derived rail support map | false | READY | Production package implements authority adapter; integrate against current BuildBoard |
| TRAIN-INT-03 | Incomplete build -> visible linked train failure | false | READY | V2.2 package proves isolated behaviour |
| TRAIN-INT-04 | Complete build -> CROSSED | false | READY | V2.2 package proves isolated behaviour |
| TRAIN-INT-05 | Train self-overlap/coupler regression fixed in production package | true | COMPLETE | V2.2 production package |
| GAME-01 | DESIGN/BUILD/TEST/COMPLETE integrated | false | READY | Mission package exists |
| GAME-02 | Real event log + collaboration statistics | false | READY | Mission package exists |
| GAME-03 | MISSION COMPLETE from CROSSED only | false | READY | Package behaviour proven; integration unproven |
| GAME-04 | TRY AGAIN deterministic clean reset | false | READY | Package behaviour proven; integration unproven |
| UI-EVIDENCE-01 | Judge-visible mission HUD/activity chain | false | READY | Extend existing activity panel after services wire |
| EVAL-01 | Automated submission gate integrated | false | READY | Gate branch/package exists |
| EVAL-02 | Deterministic integrated mission tests | false | BLOCKED | Requires integrated construction/train/mission |
| EVAL-03 | `webmcp-evals`/external native smoke | false | BLOCKED | Requires final integrated URL |
| EVAL-04 | Flagship autonomous mission 5/5 | false | BLOCKED | Requires integrated hero loop |
| EVAL-05 | Nekuda Workbench/Chrome Inspector acceptance | false | BLOCKED | Requires final hosted URL |
| REL-01 | Hero loop 3 consecutive complete runs | false | BLOCKED | Minimum freeze gate |
| REL-02 | Hero loop 10 consecutive complete runs | false | BLOCKED | Final target if time permits |
| PUB-01 | Asset/IP public-release clearance | false | IN_PROGRESS | Must resolve before public |
| PUB-02 | README/tool count/provenance current | false | READY | Final expected semantic tool count 27 after mission integration |
| PUB-03 | Hosted WebMCP URL | false | READY | No final URL yet |
| PUB-04 | Repository public and submission-safe | false | BLOCKED | IP gate first |
| PUB-05 | Final <3 minute public video | false | BLOCKED | Record after hero freeze |

---

# 4. Verified current production baseline — `dc062cfa...`

Branch:

`codex/p0-final-integration`

Commit:

`dc062cfa8f986b4a05228fe5c48f7b82c5d6bb6a`

This is the required base for all remaining integration work. Do not start Construction/Train/Mission integration again from `69b970bb...`.

Verified production geometry:

```text
Challenge display offset: (-170, 0, +4) mm
Bridge world translation: (650, -111.2, 0) mm
Bridge yaw: 90 degrees
Bridge scale: 2
ENTRY: (650, -248, 56) mm
EXIT:  (650, 25.6, 56) mm
Physical span: 273.6 mm primarily along MAIN_DEMO Y
Aqueduct baseline: top/middle/bottom = 4/3/2
```

Verified WebMCP design journey:

```text
Initial: revision 1, 4/3/2, bp_6a45b6bc, 131 parts
Changed: revision 2, 3/3/2, bp_1b886868, 137 parts
Reset: revision 3, 4/3/2, bp_6a45b6bc, 131 parts
```

Plan ID/checksum and the visible exact hologram changed together.

Current browser acceptance:

- 19 tools registered;
- 0 warnings;
- 0 errors;
- EASY terrain loaded;
- player collisions include conservative EASY terrain proxies;
- exact hologram remains readable through the current low ravine/tabletop for design evidence.

The last point is **design-only evidence**. Physical BUILD must not rely on depth-test bypasses or geometry hidden below the work surface.

---

# 5. Verified generic Codex/UR10 execution checkpoint — `4a9b88ac...`

This checkpoint proves deterministic multi-part construction can run without the agent pausing to reason between every brick.

Supported demonstrations:

1. single brick;
2. wall;
3. cross-laminated tower.

The placements retain:

- stable IDs;
- dependency ordering;
- support relationships;
- exact world-revision safety;
- cancellation/live validation;
- five-slot lookahead;
- source reassignment.

Verified examples:

| Demo | Result | Planning | Simulator start-to-start cycle |
|---|---:|---:|---:|
| Single red brick | 1/1 | ~1.3 ms | n/a |
| Blue wall 3×4 | 12/12 | ~3.1 ms | ~1,003 ms mean |
| Red cross-laminated tower 4×2 | 8/8 | ~2.0 ms | ~1,004 ms mean |

Runtime settings used for these measurements:

- requested `cycleTimeMs`: 1,000 ms;
- simulation playback multiplier: 20×;
- configured Cartesian speed: 650 mm/s.

**These are simulator settings and simulator measurements only.**

Bridge construction must reuse this pipeline rather than introduce a new per-brick execution system.

---

# 6. Accepted package inventory — use exactly these

## 6.1 Bridge Core / design

Production bridge functionality is already integrated.

Reference source package:

`ORACLE_BRIDGE_CORE_MAIN_DEMO_V1`

Do not reintroduce the standalone V4.6 renderer or `BuildExecutionEngine` as authority.

## 6.2 Terrain

`ORACLE_TERRAIN_CHALLENGE_V1` is already integrated at `dc062cfa...`.

Do **not** re-integrate duplicate Terrain ZIP downloads.

Production ChallengeService now exposes the useful seams:

```text
getActiveChallenge()
getBridgeTransform()
getEntry()
getExit()
getTrainRoute()
getCollisionProxy()
```

## 6.3 Construction

Use only the final:

`ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_V1.zip`

Do not use:

`ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_ALL_AVAILABLE_WORK*.zip`

The final package contains production modules under `apps/web/src/bridge-construction/` and passed 17/17 package tests plus its browser acceptance harness.

Important: its packaged fixture/BOM was created against an older larger Aqueduct and is **not production truth for the current EASY hero**.

Current 4/3/2 EASY BuildPlan must regenerate registry/inventory dynamically. Current verified hero BOM for `bp_6a45b6bc`:

```text
TOTAL                 131
STANDARD_BRICK        102
  1x1x1                87
  1x2x1                15
  1x20x1                0
CUSTOM_ARCH            27
TRACK_SEGMENT            2
```

Do not copy the package's old 476-part HERO_BOM into the final runtime.

## 6.4 Train

Use:

`ROBO_BRIDGE_TRAIN_V22_PRODUCTION.zip`

The `(1)` / `(2)` downloaded copies are byte-identical to the original generated package.

Verified package test result: 19/19.

Production package includes:

- 120 Hz failure physics;
- BuildBoard-derived support adapter;
- immutable collision snapshot machinery;
- route-frame/yaw-independent motion;
- Push Position Block placeholder/external adapter;
- speed/push controls;
- `TRAIN_FELL` and `CROSSED`;
- deterministic reset;
- train/coupler self-overlap regression fix.

Do not use the older Train V2 package as the production source of truth.

## 6.5 Mission + semantic WebMCP

Use:

`ORACLE_MISSION_WEBMCP_RUNTIME_V1.zip`

Verified package result: 103/103 plus package verification checks.

It supplies the missing outcome-level tools:

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

Expected final native WebMCP count after integration: **27** = existing 19 + 8 mission/terrain tools.

Thin production adapters are expected; do not redesign the package.

## 6.6 Automated submission gate

Use branch/package:

`oracle/p0-submission-gate`

checkpoint:

`fc37ddd694192373364ea38c750237066583173b`

The gate already produced 45 PASS / 0 FAIL on its old bridge-only baseline and correctly marked future Construction/Train/Mission/Terrain tests as NOT_AVAILABLE rather than faking success.

Useful commands:

```bash
npm run submission:gate
npm run submission:smoke
npm run webmcp:audit
npm run hero:3
npm run hero:10
npm run release:evidence
```

After service integration, bring this gate forward and turn the current NOT_AVAILABLE hero assertions into real pass/fail checks.

---

# 7. Architecture invariants

Canonical authority:

`RevisionClock -> BuildBoard + PlacementAuthority + RobotController -> Runtime -> Renderer / Player / Perception / WebMCP`

Bridge design authority:

`ChallengeService -> BridgeHost -> V4.6 BuildPlan`

Never create:

- a second BuildBoard;
- a second accepted inventory/occupancy truth;
- a second RobotController;
- a second RevisionClock;
- a WebMCP-only bridge state;
- a train-owned bridge-complete Boolean;
- a mission-owned physical part truth;
- an instant-build shortcut;
- joint-level WebMCP controls;
- direct completion/support setters.

Do not restore NVIDIA Newton.

Keep exact world-revision checks and cancellation fail-closed.

---

# 8. Frozen mission identity

`start_bridge_build` freezes at least:

```text
missionId
challengeId
challengeChecksum
bridgeSpec
designRevision
planId
designChecksum
worldTransform
requiredPlacementIds
partRegistryRevision/hash
```

Every build and TEST action verifies the current mission, plan, checksum, and applicable revisions.

A redesign during BUILD requires an explicit reset/return to DESIGN. It may not silently replace the frozen mission.

---

# 9. P0 physical-build blocker — resolve before BUILD freeze

The current EASY bridge transform is excellent for the design/hologram demonstration but is not yet physically buildable as-is.

The current lower Aqueduct extends below the existing tabletop/work surface and below useful robot Z reach. Approximate current physical envelope from the Construction adapter is:

```text
X: 634 .. 666 mm
Y: -247 .. +25 mm
Z: approximately -62 .. +59 mm
```

Current ENTRY/EXIT deck level is approximately Z=56 mm.

Therefore the next integration task must make one coherent challenge-frame correction so that:

1. the complete hero bridge exists above the work surface;
2. Codex-assigned parts remain inside RobotController workspace;
3. ENTRY/EXIT remain aligned;
4. the train route remains aligned;
5. terrain/ravine remains coherent;
6. hologram, BuildBoard targets, Train and Mission all inherit the same transform.

Likely P0 solution: raise the challenge/bridge deck coherently by roughly the amount required to make the lowest physical proxy clear the work surface, then verify exact reachability. The final offset must be calculated and browser-verified; do not blindly hardcode an arbitrary +100 mm.

**Never fix this by widening RobotController limits, disabling physical collision, or independently moving only the hologram.**

---

# 10. Authoritative PartRegistry / current hero — P0

Required path:

`current frozen BuildPlan -> PartRegistry -> source inventory -> exact target -> placement stream -> PlacementAuthority -> BuildBoard`

Current hero BOM is only 131 parts, so use it as production truth.

Tasks:

| ID | Task | completed |
|---|---|---:|
| PART-01 | Integrate one current-plan PartRegistry | false |
| PART-02 | Regenerate BOM from current `bp_6a45b6bc` | true |
| PART-03 | Register current standard types | false |
| PART-04 | Register current custom arch definitions | false |
| PART-05 | Register current track definitions | false |
| PART-06 | Bind current-plan source inventory | false |
| PART-07 | Bind collision/placement acceptance | false |
| PART-08 | Preserve plan -> stream -> target -> BuildBoard identity | false |
| PART-09 | Validate every required current hero placement before BUILD | false |
| PART-10 | Verify Codex actor allocation is demo-viable | false |

The Construction Oracle's conservative demo policy assigned too much of the current hero to the human because it limited Codex to a narrow standard-part subset.

Do **not** preserve that policy blindly.

Priority actor-support expansion:

1. make `1x1x1` robot-buildable through the existing gripper/capture system;
2. keep `1x2x1` robot support;
3. assess custom arches using their existing deterministic grasp/collision proxies;
4. track can remain human if necessary for P0, but it must still be an authoritative required placement;
5. any unreachable target must be explicitly human-assigned, not silently skipped.

The final hero needs a visibly meaningful Codex construction contribution, not 9 robot parts versus 122 human parts.

---

# 11. Production pipelines

## Design

`natural language -> WebMCP -> BridgeDesignService/BridgeHost -> V4.6 -> current BuildPlan -> exact hologram`

**Status: integrated and verified.**

## Challenge

`curated EASY -> ChallengeService -> single bridge/ENTRY/EXIT/train-route transform authority`

**Status: integrated and verified.**

## Freeze

`draft challenge + BridgeSpec + current BuildPlan -> confirmation -> frozen identity -> BuildBoard requirements + construction stream -> BUILD`

**Status: implementation package ready; integration pending.**

## Construction

`frozen current BuildPlan -> PartRegistry -> normalized placements -> existing planned-cycle/placement stream -> five-slot window -> source reassignment -> RobotController -> PlacementAuthority -> BuildBoard`

Reuse the generic deterministic executor proven at `4a9b88ac...`.

## TEST

`frozen identity + accepted BuildBoard snapshot -> rail support map -> Train V2.2 -> TRAIN_FELL/CROSSED`

An incomplete TEST is intentionally allowed and produces failure evidence. Construction persists after failure.

## Mission

`DESIGN -> BUILD -> TEST -> BUILD on TRAIN_FELL / COMPLETE on CROSSED -> reset to new DESIGN mission`

MissionService orchestrates only. It owns no brick/support truth.

---

# 12. Final mission-level WebMCP surface — P0

Existing 19 production tools remain available.

Add the eight semantic tools from the Mission package:

1. `get_mission_state`
2. `get_terrain_options`
3. `select_terrain`
4. `start_bridge_build`
5. `get_build_progress`
6. `build_next_parts`
7. `test_bridge`
8. `reset_mission`

Existing bridge design tools remain:

- `get_bridge_design`
- `get_bridge_capabilities`
- `update_bridge_design`
- `get_bridge_build_plan`
- `reset_bridge_design`

Expected final total: **27 tools**.

Thin adapter requirements:

Construction package approximately exposes:

```text
startBuild
getBuildProgress
buildNextParts
cancelBuild
reset
```

Mission expects:

```text
startBuild
getProgress
buildNextParts
cancel
reset
```

Adapter:

```text
getProgress -> getBuildProgress
cancel -> cancelBuild
```

Train package approximately exposes:

```text
getState
prepareTest/startTest
runToTerminal
resetTrain
```

Mission expects semantic:

```text
test
reset
```

Adapter:

```text
test() -> prepare/start -> bounded run to authoritative terminal outcome
reset() -> resetTrain()
```

Do not fork either subsystem to solve naming differences.

Normal mission outputs target approximately 1.5K characters. Page detail.

Errors return stable code, retryable flag, recovery action, current phase/revisions, and permitted next actions.

Annotation P0 fix:

`plan_placement_queue` currently creates logical stream/ghost state and therefore must not remain marked `readOnlyHint: true` without a justified correction.

---

# 13. TODAY — revised strict execution order

The major packages now exist. Do not start another implementation-from-scratch Oracle or mega-merge.

## TODAY-1 — EASY terrain + BridgeHost + exact hologram

**Status: COMPLETE** at `dc062cfa...`.

Acceptance already proved:

`EASY -> BridgeHost -> WebMCP mutation -> new plan/checksum -> visible exact hologram`

Do not spend more time on terrain polish now.

## TODAY-2 — Construction V1 -> current EASY BuildPlan

**CURRENT CRITICAL PATH.**

Steps:

1. start from `dc062cfa...`;
2. integrate `ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_V1.zip` production modules;
3. regenerate PartRegistry/inventory from the current 131-part BuildPlan, not the package's old 476-part fixture;
4. solve physical bridge elevation coherently through ChallengeService;
5. verify all current targets against work surface and robot workspace;
6. enable robot support for `1x1x1` plus existing `1x2x1`;
7. initialise the same BuildBoard with frozen plan targets;
8. human satisfies >=1 target;
9. Codex/UR10 satisfies a meaningful sequence through the existing cycle runner;
10. steal/move a planned source and prove automatic reassignment;
11. preserve stable placement identity throughout.

**Hard acceptance:** BuildBoard contains accepted human + Codex placements from the same frozen current plan; source reassignment works; physical targets are not hidden below the table.

## TODAY-3 — Integrate Train V2.2

Use `ROBO_BRIDGE_TRAIN_V22_PRODUCTION`.

Wire:

`current frozen BuildPlan + accepted BuildBoard + ChallengeService.getTrainRoute() -> support/collision snapshot -> TrainService`

Do not re-create terrain or use the package's old standalone environment source.

Acceptance:

1. partial accepted construction -> Push Position Block -> first unsupported section -> linked derail -> `TRAIN_FELL`;
2. reset train only;
3. continue same frozen construction;
4. sufficient/complete accepted support -> same TEST path -> `CROSSED`.

## TODAY-4 — Integrate Mission + semantic WebMCP

Use `ORACLE_MISSION_WEBMCP_RUNTIME_V1`.

Add only thin Construction, Train and Challenge adapters.

Register eight new tools through the one existing registrar.

Acceptance:

`DESIGN -> BUILD -> failed TEST -> BUILD -> successful TEST -> COMPLETE -> reset -> new missionId DESIGN`

Only `CROSSED` may produce COMPLETE.

## TODAY-5 — Bring forward Submission Gate

Integrate/cherry-pick `oracle/p0-submission-gate` tooling after service composition is stable.

Run:

```bash
npm run submission:gate
npm run hero:3
```

Turn all current P0 future-service NOT_AVAILABLE entries into real pass/fail assertions.

Fix only demonstrated blockers.

Then, if stable:

```bash
npm run hero:10
npm run release:evidence
```

## TODAY-6 — release + video

Only after hero 3/3:

1. final native WebMCP acceptance;
2. hosted URL;
3. public repo/IP/provenance gate;
4. README final tool count and judge instructions;
5. record/edit <3-minute video;
6. Devpost submission.

---

# 14. Hero acceptance gate

Submission runtime is ready only when all are true:

1. EASY terrain loads in real MAIN_DEMO.
2. One ChallengeService owns terrain/ENTRY/EXIT/bridge/train route alignment.
3. WebMCP changes BridgeSpec.
4. V4.6 creates the authoritative current BuildPlan.
5. Exact hologram updates with plan identity.
6. Physical hero bridge geometry clears the work surface.
7. BUILD freezes mission/plan/transform/registry identity.
8. Every required current hero part is represented by PartRegistry.
9. Every required target has a legal actor/source strategy.
10. Human places an accepted frozen-plan part.
11. UR10 places a meaningful sequence of accepted frozen-plan parts.
12. Human changes/removes a source planned for Codex.
13. Runtime reassigns another valid source.
14. Early TEST derives support from accepted BuildBoard state only.
15. Train visibly fails at real unsupported support.
16. Existing accepted construction survives failure.
17. Build continues on the same frozen plan.
18. Final TEST reads the same authority and returns CROSSED.
19. Mission enters COMPLETE only from CROSSED.
20. Statistics match accepted events.
21. TRY AGAIN creates a new clean mission and invalidates old IDs.
22. Final WebMCP semantic tools return bounded, recovery-aware responses.
23. No page/tool authority mismatch exists.
24. No blocking console errors or unhandled rejections.
25. Complete sequence passes 3 consecutive times minimum.

---

# 15. Automated QA / evidence gate

The submission-gate branch already proves the harness itself.

Old bridge-only report:

```text
45 PASS
0 FAIL
17 NOT_AVAILABLE
1 SKIPPED_WITH_REASON
```

Those NOT_AVAILABLE entries are expected to become real checks after service integration.

The gate also identified current WebMCP review items:

- `plan_placement_queue` annotation: high-priority fix;
- some read tool responses are larger than the desired ~1.5K normal mission target;
- mission-level tools should be used for the flagship journey rather than low-level tool soup.

Final strict sequence:

```bash
npm run submission:gate
npm run hero:3
# freeze feature work if 3/3 passes
npm run webmcp:audit
npm run hero:10       # only if time permits
npm run release:evidence
```

---

# 16. Simulation-only timing and hardware boundary

Current browser cycle evidence is simulator-only.

Do not claim:

- physical UR10 1-second cycles;
- physical 650 mm/s readiness;
- physical safety;
- physical accuracy;
- hardware collision validation;
- hardware reliability.

Physical hardware is not required for this submission.

Eventual hardware integration requires a separate gated programme:

1. physical workspace calibration;
2. safe speed/acceleration caps;
3. E-stop and safety validation;
4. TCP/gripper calibration;
5. dry-run reachability;
6. single-placement verification;
7. low-speed multi-placement cycles;
8. controlled acceleration only after acceptance.

---

# 17. Scope cuts until P0 passes

Do not spend submission time on:

- trees/grass/environment polish beyond fixing genuine readability blockers;
- CHALLENGING terrain;
- Viaduct production acceptance;
- NVIDIA Newton;
- procedural terrain;
- extra bridge families;
- structural collapse;
- fancy train art or final GLB substitution;
- robot loading/coupling train vehicles;
- custom HDRI/interior redesign;
- ImageGen/photo mode;
- individual brick paint system;
- joint-level MCP controls;
- general motion planning;
- physical UR10 deployment.

The placeholder train cubes and Push Position Block are acceptable for P0 if the fail/pass physics and WebMCP story are clear.

---

# 18. Post-submission robustness / larger builds

After the submission hero loop is frozen:

1. broaden PartRegistry beyond the curated hero plan;
2. support additional custom parts/robot grasps;
3. test much larger placement streams;
4. add resumable/paged mission execution;
5. test inventory exhaustion/replenishment;
6. test longer dependency chains;
7. add CHALLENGING and Viaduct production path;
8. improve terrain/trees/lighting;
9. replace train placeholder geometry with final art;
10. profile memory/frame-time over long sessions;
11. broaden model/eval coverage;
12. only then plan carefully gated hardware integration.

---

# 19. Submission presentation gate — after hero freeze

Start this work when the hero runtime is frozen and hero 3/3 passes. Do not add new product features during this phase unless they fix a demonstrated submission blocker.

## 19.1 Project positioning

Project name:

**ROBO BRIDGE MCP**

Concrete one-line description:

> Human and AI co-design and build the same bridge, then prove the result with a train test.

Central submission story:

`HUMAN + AGENT SHARE ONE WORLD -> CO-DESIGN -> SHARED BUILDPLAN -> CO-BUILD -> TEST FAILS -> AGENT OBSERVES -> CONTINUE/REPAIR -> TRAIN CROSSES`

Avoid vague AI marketing language.

## 19.2 Demo video requirements

Hard requirements:

- under 3 minutes;
- public on YouTube;
- audio narration;
- show the project working in the first 10–15 seconds;
- visibly show the agent using real WebMCP tools;
- no sign-up, login, setup, loading, or title-screen footage;
- use one strong end-to-end example rather than repeated examples.

Target final duration: **2:20–2:40**.

Recommended cut:

| Time | Show | Main proof |
|---|---|---|
| 0:00–0:12 | Working bridge scene, human + Codex/UR10 action, train-success glimpse | Immediate shared-task hook |
| 0:12–0:35 | Give agent bridge goal and show real WebMCP calls | WebMCP is the control surface |
| 0:35–1:05 | Terrain/design read, bridge proposal/change, hologram update | Agent understands and changes spatial design |
| 1:05–1:35 | Human + Codex/UR10 build same frozen BuildPlan | Shared authoritative construction |
| 1:35–2:00 | Early TEST, visible failure, agent observes and continues | Outcome-driven recovery |
| 2:00–2:20 | Final TEST, train crosses, MISSION COMPLETE | Verified shared result |
| 2:20–2:35 | Short architecture explanation | Same page state powers human + WebMCP |

Protect the **failure -> observe -> continue/repair -> successful crossing** sequence above all optional footage.

## 19.3 Script rules

1. Describe concrete actions/outcomes, not marketing language.
2. State that human and agent operate on the same mission state and frozen BuildPlan.
3. Show actual WebMCP tool use while narration explains the result.
4. Explain that Codex makes decisions while deterministic runtime systems execute accepted construction actions.
5. Use early train failure as useful evidence, not an embarrassment.
6. Never overstate physical hardware evidence.
7. Put the best visual result first.
8. Remove waits, filler and repeated actions.

Suggested WebMCP explanation:

> WebMCP gives the agent structured access to the same interactive environment as the human. It can understand the bridge state, change the design, perform construction actions, test the result, and continue from the outcome.

## 19.4 Written submission description

The description must answer:

1. Why is this a strong WebMCP use case?
2. How does WebMCP improve the experience?
3. What can the human and agent now do together?
4. How is WebMCP implemented?

Only describe tools/functionality present in the submitted runtime.

## 19.5 Final submission checklist

| ID | Task | completed |
|---|---|---:|
| SUB-01 | Lock final project name and one-line description | false |
| SUB-02 | Write complete <3 minute narration and shot list | false |
| SUB-03 | Record short hero clips with real WebMCP visible | false |
| SUB-04 | Edit/upload final public YouTube video | false |
| SUB-05 | Write Devpost description against judging criteria | false |
| SUB-06 | Write exact judge testing instructions | false |
| SUB-07 | Verify hosted URL from clean/incognito browser | false |
| SUB-08 | Verify public repo, licence, README and provenance | false |
| SUB-09 | Verify video link without account access | false |
| SUB-10 | Check every submission-form field | false |
| SUB-11 | Submit before hard deadline | false |

Hard deadline: **Thursday 3 September 2026, 13:00 PDT / 21:00 BST**.

If time becomes constrained, cut optional polish before cutting reliability, visible WebMCP evidence, fail/repair/pass, or submission clarity.

---

# 20. Final principle

**Do not build another subsystem from scratch. Integrate the completed packages into `dc062cfa...`, solve the physical build frame, and prove the mission.**

**Today, optimise for one undeniable working mission, not feature count.**

**Codex plans. Deterministic systems execute. Human actions change the shared world. The runtime adapts. BuildBoard controls TEST. The train proves the result.**
