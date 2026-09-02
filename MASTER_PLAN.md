# ROBO BRIDGE MCP — Submission Master Plan

**Status:** FINAL SUBMISSION DAY SPRINT  
**Plan version:** 2026-09-02-E  
**Current main HEAD:** `c3ad43b03ef5a3b710cee07b75830cf9e7873778`  
**Latest verified runtime implementation checkpoint:** `4a9b88ac026b290e617abc3d336b37499127a71c`  
**Submission deadline:** 2026-09-03 13:00 PDT  
**Internal goal:** fully working hero demo and submission package today  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Canonical authority:** `RevisionClock` + `BuildBoard` + `PlacementAuthority` + `RobotController`  
**Primary goal:** one complete, reliable, judge-visible WebMCP collaboration journey

---

# 0. Authority

This file is the authoritative submission execution plan.

If an older plan, prototype README, Oracle report, standalone package, experimental branch, or chat instruction conflicts with this file, **this file wins for the submission sprint**.

Oracle packages and audits are source/evidence inputs only. They are not production-complete until their MAIN_DEMO integration gates pass.

Required hero loop:

`CURATED EASY TERRAIN -> CODEX CO-DESIGN -> V4.6 BUILDPLAN -> EXACT HOLOGRAM -> FREEZE -> HUMAN + CODEX/UR10 BUILD -> EARLY TRAIN FAILURE -> CONTINUE/REPAIR -> TRAIN SUCCESS -> MISSION COMPLETE -> TRY AGAIN`

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
2. A standalone package may be complete while its MAIN_DEMO integration remains incomplete.
3. Do not infer dependent completion automatically.
4. If a later change breaks an accepted feature, set it back to `completed: false`.
5. Simulator timing is never evidence of physical-robot timing.
6. This dashboard is the sprint status source of truth.

---

# 2. Current completion dashboard

**Planning estimate:** approximately **72% of P0 engineering/package work is complete**. The remaining work is dominated by production integration, hero-loop proof, WebMCP mission usability, release QA, and submission evidence.

| ID | Deliverable | completed | status | Evidence / current truth |
|---|---|---:|---|---|
| FND-01 | MAIN_DEMO Player V8 foundation | true | COMPLETE | Integrated on `main` |
| FND-02 | Human pickup/rotate/snap/place | true | COMPLETE | Integrated + regression coverage |
| FND-03 | UR10 + calibrated animated gripper | true | COMPLETE | Integrated simulator runtime |
| FND-04 | One RevisionClock + BuildBoard + RobotController authority | true | COMPLETE | Current architecture |
| MCP-BASE-01 | Native WebMCP base execution surface | true | COMPLETE | Existing 14-tool surface |
| MCP-BASE-02 | Camera perception + placement preview | true | COMPLETE | Existing evidence/tests |
| MCP-BASE-03 | Scalable logical placement stream | true | COMPLETE | `3a57455...` |
| MCP-BASE-04 | Five-slot active execution window | true | COMPLETE | Current planner |
| MCP-BASE-05 | Automatic source-part reassignment | true | COMPLETE | Current runtime |
| MCP-BASE-06 | Bounded placement cancellation | true | COMPLETE | `7a0a39a...` |
| BUILD-DEMO-01 | Deterministic generic structure planner | true | COMPLETE | `4a9b88ac...` |
| BUILD-DEMO-02 | Single-brick Codex/UR10 demo | true | COMPLETE | Browser verified 1/1 |
| BUILD-DEMO-03 | 3×4 wall Codex/UR10 demo | true | COMPLETE | Browser verified 12/12 |
| BUILD-DEMO-04 | 4-layer cross-laminated tower demo | true | COMPLETE | Browser verified 8/8; alternating 0°/90° |
| BUILD-DEMO-05 | Browser-local planned-cycle runner | true | COMPLETE | Removes per-brick agent reasoning delay |
| BUILD-DEMO-06 | Configurable `cycleTimeMs` | true | COMPLETE | 1,000 ms target demonstrated in simulator |
| BUILD-DEMO-07 | 146/146 JS regression checkpoint | true | COMPLETE | `4a9b88ac...` checkpoint |
| BUILD-DEMO-08 | 20/20 reliability checkpoint | true | COMPLETE | `4a9b88ac...` checkpoint |
| ORA-AUDIT-01 | Submission readiness Oracle audit | true | COMPLETE | Reviewed |
| ORA-AUDIT-02 | Deep WebMCP audit | true | COMPLETE | Adopted into plan |
| BRG-V46-01 | V4.6 Aqueduct/Viaduct compiler package | true | COMPLETE | Deterministic V4.6 package |
| BRG-CORE-PKG-01 | Production DOM-free V4.6 bridge-core package | true | COMPLETE | 39/39 independently rerun |
| MCP-DESIGN-PKG-01 | Five-tool bridge-design WebMCP package | true | COMPLETE | 21/21 package tests |
| TERRAIN-PKG-01 | Curated terrain/challenge package | true | COMPLETE | 26/26 independently rerun |
| TRAIN-PKG-01 | Train TEST V2 package | true | COMPLETE | 11/11 independently rerun |
| MISSION-PKG-01 | Mission/session package | true | COMPLETE | 37/37 independently rerun |
| TERRAIN-INT-01 | EASY terrain integrated in MAIN_DEMO | false | READY | Must integrate today |
| TERRAIN-INT-02 | EASY challenge rebased into real UR10 workspace | false | NEEDS_FIX | Standalone mount used X≈820 mm; production X max 710 mm |
| BRG-INT-01 | BridgeHost/compiler integrated in MAIN_DEMO | false | READY | Production package exists |
| BRG-INT-02 | Exact BuildPlan hologram in MAIN_DEMO | false | READY | Adapter exists |
| PART-01 | Authoritative hero PartRegistry | false | READY | P0 blocker |
| PART-02 | Hero Aqueduct part types fully supported | false | READY | Only exact hero types required today |
| BRG-INT-03 | Frozen BuildPlan projected into BuildBoard | false | READY | P0 integration gap |
| BRG-INT-04 | BUILD freezes full mission/plan identity | false | READY | Contract defined below |
| MCP-MISSION-01 | Outcome-level mission WebMCP surface | false | READY | P0 requirement |
| MCP-MISSION-02 | `build_next_parts` high-level real-robot simulator action | false | READY | Reuse planned-cycle runner |
| MCP-OUTPUT-01 | Normal mission outputs ≈1.5K chars | false | READY | Current legacy cap larger |
| MCP-ERROR-01 | Common recovery-aware error envelope | false | READY | P0 requirement |
| MCP-ANNOT-01 | Tool annotations audited/correct | false | READY | `plan_placement_queue` requires review |
| TRAIN-INT-01 | Preassembled Train V2 at ENTRY in MAIN_DEMO | false | READY | Package exists |
| TRAIN-INT-02 | BuildBoard-derived rail support map | false | READY | Must replace standalone support source |
| TRAIN-INT-03 | Incomplete build -> visible train failure | false | READY | P0 gap |
| TRAIN-INT-04 | Complete build -> CROSSED | false | READY | P0 gap |
| GAME-01 | DESIGN/BUILD/TEST/COMPLETE integrated | false | READY | Mission package exists |
| GAME-02 | Real event log + collaboration statistics | false | READY | Mission package exists |
| GAME-03 | MISSION COMPLETE from CROSSED only | false | READY | Integration unproven |
| GAME-04 | TRY AGAIN deterministic clean reset | false | READY | Integration unproven |
| UI-EVIDENCE-01 | Judge-visible mission HUD/activity chain | false | READY | Extend existing activity panel |
| EVAL-01 | Deterministic integrated mission tests | false | BLOCKED | Requires integrated hero runtime |
| EVAL-02 | `webmcp-evals smoke` 100% | false | BLOCKED | Requires integrated URL |
| EVAL-03 | Flagship autonomous mission 5/5 | false | BLOCKED | Requires integrated hero loop |
| EVAL-04 | Nekuda Workbench/Chrome Inspector acceptance | false | BLOCKED | Requires integrated URL |
| REL-01 | Hero loop 3 consecutive complete runs | false | BLOCKED | Minimum freeze gate |
| REL-02 | Hero loop 10 consecutive complete runs | false | BLOCKED | Final target if time permits |
| PUB-01 | Asset/IP public-release clearance | false | IN_PROGRESS | Must resolve before public |
| PUB-02 | README/tool count/provenance current | false | READY | Final surface not frozen |
| PUB-03 | Hosted WebMCP URL | false | READY | No final URL yet |
| PUB-04 | Repository public and submission-safe | false | BLOCKED | IP gate first |
| PUB-05 | Final <3 minute public video | false | BLOCKED | Record after hero freeze |

---

# 3. Verified generic Codex/UR10 checkpoint — 4a9b88ac

This checkpoint proves that deterministic multi-part construction no longer requires the agent to pause and reason between every brick.

Supported generic demonstrations:

1. single brick;
2. wall;
3. cross-laminated tower.

Planner inputs include:

- structure type;
- colour;
- width;
- height/layers;
- block count.

The resulting placements retain:

- stable placement IDs;
- dependency ordering;
- support relationships;
- exact world-revision safety;
- cancellation/live validation.

The browser-local planned-cycle runner executes an already-created placement stream and keeps up to five executable proposals active.

Verified browser results:

| Demo | Result | Planning | Simulator start-to-start cycle |
|---|---:|---:|---:|
| Single red brick | 1/1 | ~1.3 ms | n/a |
| Blue wall 3×4 | 12/12 | ~3.1 ms | ~1,003 ms mean |
| Red cross-laminated tower 4×2 | 8/8 | ~2.0 ms | ~1,004 ms mean |

Runtime settings used for these measurements:

- requested `cycleTimeMs`: 1,000 ms;
- simulation playback multiplier: 20×;
- configured Cartesian speed: 650 mm/s.

**Important:** these are simulator settings and simulator measurements only. They are not physical UR10 cycle-time, speed, safety, accuracy, or readiness claims.

Native WebMCP was exercised in the supported in-app browser for this checkpoint.

This generic deterministic planning/execution pipeline should be reused for bridge construction rather than replaced.

---

# 4. Accepted Oracle source packages

## Bridge Core

Use `oracle/bridge-core-main-demo-v1` for:

- DOM-free V4.6 compiler/data;
- authoritative BuildPlan 4.6;
- BridgeHost;
- world transform;
- exact hologram adapter;
- construction-stream adapter;
- plan-freeze data;
- custom-part definitions.

Do not use the standalone V4.6 renderer loop or execution authority.

## Bridge WebMCP Design

Use `oracle/webmcp-bridge-design-v1` and preserve atomic:

`patch -> validate -> compile -> new plan -> hologram`

Do not add a separate public compile tool.

## Terrain

Use `ORACLE_TERRAIN_CHALLENGE_V1`, but rebase EASY into the real production robot workspace.

## Train

Use `ORACLE_ROBO_BRIDGE_TRAIN_TEST_V2`, but replace its standalone support source with:

`BuildBoard snapshot -> rail support map -> TrainTestService`

## Mission

Use `ORACLE_MISSION_SESSION_V1` for DESIGN/BUILD/TEST/COMPLETE, events, stats, COMPLETE UI, and reset orchestration.

---

# 5. Architecture invariants

Canonical authority:

`RevisionClock -> BuildBoard + PlacementAuthority + RobotController -> Runtime -> Renderer / Player / Perception / WebMCP`

Never create:

- a second BuildBoard;
- a second accepted inventory/occupancy truth;
- a second RobotController;
- a WebMCP-only bridge state;
- a train-owned bridge-complete Boolean;
- a mission-owned physical part truth;
- an instant-build shortcut;
- joint-level WebMCP controls;
- direct completion/support setters.

Do not restore NVIDIA Newton.

Keep exact world-revision checks and cancellation fail-closed.

---

# 6. Frozen mission identity

`start_bridge_build` freezes:

```text
missionId
challengeId
challengeChecksum
bridgeSpec
designRevision
planId
planChecksum
worldTransform
requiredPlacementIds
partRegistryRevision
```

Every build and TEST action verifies the current mission, plan, checksum, and applicable revisions.

A redesign during BUILD requires reset/return to DESIGN.

---

# 7. Authoritative PartRegistry — P0

For today's P0, support **only the exact part types used by the selected EASY Aqueduct hero fixture**.

Required path:

`BuildPlan type -> PartRegistry -> source/inventory strategy -> exact render/hologram geometry -> collision/placement rule -> BuildBoard identity -> support mapping`

Tasks:

| ID | Task | completed |
|---|---|---:|
| PART-01 | Create one PartRegistry | false |
| PART-02 | Enumerate actual hero Aqueduct part types | false |
| PART-03 | Register standard hero brick types | false |
| PART-04 | Register hero custom arch definitions | false |
| PART-05 | Register hero track modules | false |
| PART-06 | Bind source/inventory strategy | false |
| PART-07 | Bind collision/placement acceptance | false |
| PART-08 | Bind stable plan/stream/BuildBoard identities | false |
| PART-09 | Validate complete hero plan before BUILD | false |

Do not spend today supporting unused theoretical V4.6 part types.

---

# 8. Production pipelines

## Design

`natural language -> WebMCP -> BridgeDesignService/BridgeHost -> V4.6 -> draft BuildPlan -> exact hologram`

## Freeze

`draft challenge + BridgeSpec + BuildPlan -> confirmation -> frozen identity -> BuildBoard requirements + placement stream -> BUILD`

## Construction

`frozen BuildPlan -> PartRegistry -> normalized placements -> existing planned-cycle/placement stream -> five-slot window -> source reassignment -> RobotController -> PlacementAuthority -> BuildBoard`

Reuse the generic deterministic planner/executor proven at `4a9b88ac`; do not reintroduce per-brick agent pauses.

## TEST

`frozen identity + accepted BuildBoard snapshot -> rail support map -> TrainTestService -> TRAIN_FELL/DERAILED/CROSSED`

An incomplete TEST is allowed and intentionally produces failure evidence.

---

# 9. Default mission-level WebMCP surface — P0

Target outcome-level journey:

1. `get_mission_state`
2. terrain options read
3. terrain selection
4. `get_bridge_capabilities`
5. `get_bridge_design`
6. `update_bridge_design`
7. bounded BuildPlan read
8. `start_bridge_build`
9. `get_build_progress`
10. `build_next_parts`
11. `test_bridge`
12. `reset_mission`

Exact terrain enums come from the real ChallengeService.

Keep existing primitive tools for diagnostics/advanced control, but do not require them for the normal mission.

`build_next_parts` must call the real existing placement stream/RobotController and should build only a bounded 1–5 parts per call.

Normal mission outputs target approximately 1.5K characters. Page detailed placement/problem data.

Errors return stable code, retryable flag, recovery action, current phase/revisions, and permitted next actions.

---

# 10. TODAY — strict execution order

The previous giant MEGA_MERGE attempt is not the critical path. Integrate sequentially with a runnable checkpoint after each stage.

## TODAY-1 — EASY terrain + BridgeHost + exact hologram

**Goal:** real MAIN_DEMO visibly does:

`EASY terrain -> Aqueduct draft -> WebMCP design change -> exact hologram changes`

Requirements:

- rebase EASY into real UR10 workspace;
- import BridgeHost/compiler/data only;
- connect the accepted five bridge-design tools;
- zero browser console errors;
- preserve player/robot baseline.

**Acceptance:** one visible WebMCP Aqueduct parameter change updates plan ID/checksum and exact hologram.

## TODAY-2 — PartRegistry + BuildPlan -> BuildBoard + real co-build

**Goal:** BUILD freezes the exact hero Aqueduct and both human and UR10 can place real frozen-plan parts.

Requirements:

- enumerate only actual hero fixture part types;
- create minimal PartRegistry;
- initialize BuildBoard from frozen placements;
- reuse existing logical stream + planned-cycle runner;
- maintain stable plan -> stream -> target -> BuildBoard placement ID linkage;
- preserve source reassignment.

**Acceptance:** human places ≥1 accepted hero part, UR10 places ≥1 accepted hero part, BuildBoard records both, and a stolen planned source is reassigned.

## TODAY-3 — Train V2 + BuildBoard support + Mission

**Goal:** complete fail/repair/pass/reset loop.

Requirements:

- train support derives only from BuildBoard snapshot;
- early incomplete TEST visibly fails;
- construction survives failure;
- final completed TEST produces `CROSSED`;
- CROSSED alone causes COMPLETE;
- stats come from real accepted events;
- TRY AGAIN creates clean DESIGN state.

**Acceptance:** one full manual hero loop works end-to-end.

## TODAY-4 — Mission-level WebMCP simplification

**Goal:** unfamiliar agent can operate the mission without primitive-call soup.

Implement only the minimum outcome-level tools required by the functioning hero runtime, especially:

- `get_mission_state`;
- `start_bridge_build`;
- `get_build_progress`;
- `build_next_parts`;
- `test_bridge`;
- `reset_mission`.

Do not refactor working low-level systems merely for elegance.

## TODAY-5 — hardening / evidence / release

1. full JS/WebMCP/robot/player/reliability/verify suite;
2. Playwright visual acceptance;
3. hero loop 3/3 minimum;
4. 10/10 only if time remains;
5. native WebMCP external inspection/smoke;
6. public release/IP/docs;
7. deploy;
8. final <3 minute video.

---

# 11. Hero acceptance gate

Submission runtime is ready only when all are true:

1. EASY terrain loads in real MAIN_DEMO.
2. ENTRY/EXIT are inside the production workcell.
3. WebMCP changes BridgeSpec.
4. V4.6 creates the authoritative BuildPlan.
5. Exact hologram updates.
6. BUILD freezes mission/plan identity.
7. Every hero part type is supported by PartRegistry.
8. Human places an accepted frozen-plan part.
9. UR10 places an accepted frozen-plan part.
10. Human changes/removes a source planned for Codex.
11. Runtime reassigns another valid source.
12. Early TEST reads BuildBoard-derived support and visibly fails.
13. Existing accepted construction remains after failure.
14. Build continues on the same frozen plan.
15. Final TEST reads BuildBoard support and returns CROSSED.
16. Mission enters COMPLETE only from CROSSED.
17. Statistics match accepted events.
18. TRY AGAIN creates a new clean mission and invalidates old IDs.
19. No page/tool authority mismatch exists.
20. Complete sequence passes 3 consecutive times minimum.

---

# 12. Simulation-only timing and hardware boundary

Current browser cycle evidence is simulator-only.

Do not claim:

- physical UR10 1-second cycles;
- physical 650 mm/s readiness;
- physical safety;
- physical accuracy;
- hardware collision validation;
- hardware reliability.

Eventual hardware integration requires a separate gated programme:

1. physical workspace calibration;
2. safe speed/acceleration caps;
3. E-stop and safety validation;
4. TCP/gripper calibration;
5. dry-run reachability;
6. single-placement verification;
7. low-speed multi-placement cycles;
8. only then controlled acceleration.

Physical hardware is not required for this submission.

---

# 13. Post-submission robustness / larger builds

After the submission hero loop is frozen:

1. broaden PartRegistry beyond the curated hero plan;
2. test much larger placement streams;
3. add resumable/paged mission execution;
4. test inventory exhaustion/replenishment;
5. test longer dependency chains;
6. add more curated terrains and Viaduct production path;
7. profile memory/frame-time over long sessions;
8. broaden model/eval coverage;
9. only then plan carefully gated hardware integration.

---

# 14. Scope cuts until P0 passes

Do not spend submission time on:

- NVIDIA Newton;
- procedural terrain;
- extra bridge families;
- structural collapse;
- realistic train dynamics;
- robot loading/coupling train vehicles;
- custom HDRI/interior redesign;
- ImageGen/photo mode;
- individual brick paint system;
- joint-level MCP controls;
- general motion planning.

---

# 15. Final principle

**Today, optimise for one undeniable working mission, not feature count.**

**Codex plans once. Deterministic systems execute. Human actions change the shared world. The runtime adapts. BuildBoard controls TEST. The train proves the result.**
