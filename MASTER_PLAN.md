# ROBO BRIDGE MCP — Submission Master Plan

**Status:** FINAL SUBMISSION SPRINT  
**Plan version:** 2026-09-02-D  
**Last repository audit:** `4a9b88ac026b290e617abc3d336b37499127a71c`  
**Deep WebMCP audit:** `robo_bridge_webmcp_deep_audit` — 2026-09-02  
**Submission deadline:** 2026-09-03 13:00 PDT  
**Internal target:** submission-ready demo before final submission day  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Canonical authority:** existing `RevisionClock` + `BuildBoard` + `PlacementAuthority` + `RobotController`  
**Primary goal:** one complete, reliable, judge-visible WebMCP collaboration journey

---

# 0. Authority

This file is the authoritative submission execution plan.

If an older V3 plan, prototype README, chat instruction, Oracle report, standalone package, or experimental branch conflicts with this file, **this file wins for the submission sprint**.

Oracle packages and audits are accepted evidence inputs. They do not become production truth until their integration gates pass in `MAIN_DEMO`.

The required hero loop is:

`CURATED TERRAIN -> CODEX CO-DESIGN -> V4.6 BUILDPLAN -> EXACT HOLOGRAM -> FREEZE -> HUMAN + CODEX/UR10 BUILD -> EARLY TRAIN FAILURE -> REPAIR/CONTINUE -> TRAIN SUCCESS -> MISSION COMPLETE -> TRY AGAIN`

Judging priority:

1. WebMCP Leverage.
2. Execution.
3. Potential Impact.
4. Creativity & Ambition.

All are equally weighted. WebMCP Leverage is the first tie-break criterion.

---

# 1. Completion tracking contract

Every major deliverable has:

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
3. `IN_PROGRESS`, `READY`, and `NEEDS_FIX` never imply completion.
4. Never infer dependent completion automatically.
5. If a later change breaks an accepted feature, set it back to `completed: false`.
6. Every completion change must include evidence.
7. The dashboard below is the sprint status source of truth.

---

# 2. Current completion dashboard

**Planning estimate:** approximately **70% of P0 engineering/package work is complete**, but the integrated hero runtime and final WebMCP acceptance remain the critical unfinished work.

| ID | Deliverable | completed | status | Evidence / current truth |
|---|---|---:|---|---|
| FND-01 | MAIN_DEMO Player V8 foundation | true | COMPLETE | Integrated on `main` |
| FND-02 | Human pickup/rotate/snap/place | true | COMPLETE | Integrated + regression coverage |
| FND-03 | UR10 + calibrated animated gripper | true | COMPLETE | Integrated production runtime |
| FND-04 | One RevisionClock + BuildBoard + RobotController authority | true | COMPLETE | Current architecture |
| FND-05 | Deterministic robot structure cycles | true | COMPLETE | `4a9b88ac...` |
| MCP-BASE-01 | Native WebMCP base execution surface | true | COMPLETE | Existing 14-tool surface |
| MCP-BASE-02 | Camera perception + placement preview | true | COMPLETE | Existing evidence/tests |
| MCP-BASE-03 | Scalable logical placement stream | true | COMPLETE | `3a57455...` |
| MCP-BASE-04 | Five-slot active execution window | true | COMPLETE | Current planner |
| MCP-BASE-05 | Automatic source-part reassignment | true | COMPLETE | Current runtime |
| MCP-BASE-06 | Bounded placement cancellation | true | COMPLETE | `7a0a39a...` |
| ORA-AUDIT-01 | Submission readiness Oracle audit | true | COMPLETE | Reviewed |
| ORA-AUDIT-02 | Deep WebMCP audit | true | COMPLETE | 2026-09-02 audit adopted into this plan |
| BRG-V46-01 | V4.6 Aqueduct/Viaduct compiler package | true | COMPLETE | Deterministic V4.6 package |
| BRG-CORE-PKG-01 | Production DOM-free V4.6 bridge-core package | true | COMPLETE | `oracle/bridge-core-main-demo-v1`; 39/39 independently rerun |
| MCP-DESIGN-PKG-01 | Five-tool bridge-design WebMCP package | true | COMPLETE | `oracle/webmcp-bridge-design-v1`; 21/21 package tests |
| TERRAIN-PKG-01 | Curated terrain/challenge package | true | COMPLETE | 26/26 independently rerun |
| TRAIN-PKG-01 | Train TEST V2 package | true | COMPLETE | 11/11 independently rerun |
| MISSION-PKG-01 | Mission/session package | true | COMPLETE | 37/37 independently rerun |
| TERRAIN-INT-01 | Terrain integrated in MAIN_DEMO | false | READY | Integration not yet proven |
| TERRAIN-INT-02 | EASY challenge rebased into real UR10 workspace | false | NEEDS_FIX | Standalone mount used X≈820 mm; current robot workspace ends at X=710 mm |
| BRG-INT-01 | BridgeHost/compiler integrated in MAIN_DEMO | false | READY | Production package exists |
| BRG-INT-02 | Exact BuildPlan hologram in MAIN_DEMO | false | READY | Adapter exists; integration unproven |
| PART-01 | Authoritative PartRegistry | false | READY | New P0 blocker from deep audit |
| PART-02 | Hero BuildPlan part types fully supported | false | READY | Standard bricks + custom arches + track required |
| BRG-INT-03 | Frozen BuildPlan projected into BuildBoard | false | READY | P0 integration gap |
| BRG-INT-04 | BUILD freezes full mission/plan identity | false | READY | Contract defined below |
| MCP-MISSION-01 | Outcome-level mission WebMCP surface | false | READY | New deep-audit P0 requirement |
| MCP-MISSION-02 | `build_next_parts` high-level real-robot action | false | READY | New deep-audit P0 requirement |
| MCP-OUTPUT-01 | Normal mission outputs ≈1.5K chars | false | READY | Current legacy cap ≈12K |
| MCP-ERROR-01 | Common recovery-aware error envelope | false | READY | New P0 requirement |
| MCP-ANNOT-01 | Tool annotations audited/correct | false | READY | `plan_placement_queue` requires review |
| TRAIN-INT-01 | Pre-assembled train at ENTRY in MAIN_DEMO | false | READY | Train package exists |
| TRAIN-INT-02 | BuildBoard-derived rail support map | false | READY | Must replace standalone execution-state adapter |
| TRAIN-INT-03 | Incomplete accepted build -> visible failure | false | READY | P0 integration gap |
| TRAIN-INT-04 | Complete accepted build -> CROSSED | false | READY | P0 integration gap |
| GAME-01 | DESIGN/BUILD/TEST/COMPLETE integrated | false | READY | Mission package exists |
| GAME-02 | Real event log + collaboration statistics | false | READY | Mission package exists |
| GAME-03 | MISSION COMPLETE from CROSSED only | false | READY | Integration unproven |
| GAME-04 | TRY AGAIN deterministic clean reset | false | READY | Integration unproven |
| UI-EVIDENCE-01 | Judge-visible mission HUD/activity chain | false | READY | Extend existing activity panel |
| EVAL-01 | Deterministic integrated mission tests | false | BLOCKED | Requires MEGA_MERGE |
| EVAL-02 | `webmcp-evals smoke` 100% | false | BLOCKED | Requires integrated URL |
| EVAL-03 | Local/isolated model tool evals | false | READY | Can begin after tool schema freeze |
| EVAL-04 | Browser mission evals | false | BLOCKED | Requires integrated URL |
| EVAL-05 | Flagship autonomous mission 5/5 | false | BLOCKED | Requires integrated hero loop |
| EVAL-06 | Nekuda Workbench W01-W20 | false | BLOCKED | Requires integrated URL |
| EVAL-07 | Chrome Model Context Tool Inspector | false | BLOCKED | Requires integrated URL |
| REL-01 | Hero loop 3 consecutive complete runs | false | BLOCKED | Freeze gate |
| REL-02 | Hero loop 10 consecutive complete runs | false | BLOCKED | Final target |
| PUB-01 | Asset/IP public-release clearance | false | IN_PROGRESS | Must resolve before public |
| PUB-02 | README/tool count/provenance current | false | READY | Final tool surface not frozen |
| PUB-03 | Hosted WebMCP URL | false | READY | No accepted final URL |
| PUB-04 | Repository public and submission-safe | false | BLOCKED | IP gate first |
| PUB-05 | Final <3 minute public video | false | BLOCKED | Record after hero freeze |

## Current interpretation

The difficult standalone systems now exist.

The remaining risk is **integration, mission-level WebMCP usability, authority proof, evaluation, and release evidence**.

Do not add large new product features before the false P0 items above are closed.

---

# 3. Accepted Oracle packages

These packages are now source material for the integration owner.

## 3.1 Bridge Core

Branch:

`oracle/bridge-core-main-demo-v1`

Use:

- DOM-free V4.6 compiler/data;
- BuildPlan 4.6;
- atomic BridgeHost;
- world transform;
- hologram adapter;
- construction-stream adapter;
- plan-freeze data;
- custom-part definitions.

Do not use:

- standalone renderer loop;
- standalone V4.6 execution authority.

## 3.2 Bridge WebMCP Design

Branch:

`oracle/webmcp-bridge-design-v1`

Accepted tools:

- `get_bridge_design`
- `get_bridge_capabilities`
- `update_bridge_design`
- `get_bridge_build_plan`
- `reset_bridge_design`

The production mission layer may wrap/re-expose the useful capabilities, but must not create a second bridge state.

`update_bridge_design` remains atomic: patch -> validate -> compile -> new plan -> hologram.

Do not add a separate public compile tool.

## 3.3 Terrain

Package:

`ORACLE_TERRAIN_CHALLENGE_V1`

Accepted standalone package, but production integration must **rebase the challenge into the actual UR10 work envelope**.

Current production workspace is approximately:

```text
X 470..710 mm
Y -275..275 mm
Z 40..470 mm
```

The standalone EASY mount around X≈820 mm is not production-valid.

Prefer changing the challenge/bridge transform, not widening robot safety limits.

## 3.4 Train

Package:

`ORACLE_ROBO_BRIDGE_TRAIN_TEST_V2`

Reuse:

- preassembled 3-part train;
- couplers;
- supported analytic/guided motion;
- unsupported fall/derail;
- deterministic staged reset;
- `TRAIN_FELL`;
- `CROSSED`.

Replace its standalone support input with:

`BuildBoard snapshot -> support adapter -> rail support map -> TrainTestService`

## 3.5 Mission/session

Package:

`ORACLE_MISSION_SESSION_V1`

Reuse:

- DESIGN/BUILD/TEST/COMPLETE;
- plan freeze;
- append-only events;
- contribution stats;
- reset orchestration;
- MISSION COMPLETE UI.

MissionService may own **mode transitions**, but never physical world truth.

---

# 4. Architecture invariants

Canonical authority:

`RevisionClock -> BuildBoard + PlacementAuthority + RobotController -> Runtime -> Renderer / Player / Perception / WebMCP`

Never create:

- a second BuildBoard;
- a second accepted inventory/occupancy truth;
- a second RobotController;
- a WebMCP-only bridge state;
- a train-owned bridge-complete Boolean;
- a mission-owned part count that can override BuildBoard;
- an instant-build shortcut;
- a direct `set_mission_complete`;
- a direct `set_bridge_complete`;
- a direct `set_rail_support`.

The page and tool result must agree after every completed call.

---

# 5. Frozen mission identity

`start_bridge_build` must freeze one immutable identity bundle:

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

Every build and TEST action must verify the active mission, plan ID, checksum, and applicable revisions.

Rules:

1. DESIGN allows terrain/design changes.
2. BUILD locks the accepted design.
3. A redesign during BUILD requires reset/return to DESIGN.
4. TEST reads a snapshot of accepted BuildBoard state.
5. Failed TEST returns to BUILD and preserves construction.
6. CROSSED transitions to COMPLETE.
7. TRY AGAIN creates a new mission ID and invalidates all old IDs/revisions.

---

# 6. Authoritative PartRegistry — NEW P0 workstream

This is a P0 blocker.

V4.6 can produce standard parts of different sizes, custom arch pieces, and track modules. One authoritative registry must map every hero-plan part type through the entire production chain.

Required path:

`BuildPlan part type -> PartRegistry -> inventory/source strategy -> render/hologram geometry -> collision/placement rule -> BuildBoard identity -> support mapping`

Minimum P0 tasks:

| ID | Task | completed |
|---|---|---:|
| PART-01 | Create one PartRegistry | false |
| PART-02 | Register every part type used by the curated hero BuildPlan | false |
| PART-03 | Bind source/inventory strategy | false |
| PART-04 | Bind exact render/hologram geometry | false |
| PART-05 | Bind collision/placement acceptance | false |
| PART-06 | Bind stable BuildBoard type/placement IDs | false |
| PART-07 | Bind train-support semantics where applicable | false |
| PART-08 | Validate full plan before BUILD; fail closed on unsupported type | false |

Acceptance gate:

> Every frozen placement has one supported part type, one source strategy, one collision model, one renderer representation, and one BuildBoard acceptance rule.

Do not replace unsupported exact parts with visual-only fake boxes.

---

# 7. Production pipelines

## 7.1 Design

`natural language -> mission WebMCP -> BridgeDesignService/BridgeHost -> V4.6 compiler -> draft BuildPlan -> exact hologram`

UI and WebMCP call the same BridgeHost.

## 7.2 Freeze

`draft challenge + BridgeSpec + BuildPlan -> visible confirmation -> frozen mission identity -> BuildBoard requirements + placement stream -> BUILD`

Re-read revisions after confirmation before committing.

## 7.3 Construction

`frozen BuildPlan -> PartRegistry -> normalized placement records -> logical placement stream -> five-slot active window -> source selection/reassignment -> RobotController -> PlacementAuthority -> BuildBoard`

One stable placement identity should connect plan -> stream -> target -> BuildBoard -> events.

## 7.4 TEST

`frozen plan identity + accepted BuildBoard snapshot -> rail support map -> TrainTestService -> TRAIN_FELL/DERAILED/CROSSED`

TEST fails closed if:

- session/plan/revision is stale;
- robot is moving;
- gripper holds a part;
- part registry is invalid;
- support map cannot be derived safely.

Do not require 100% completion merely to run an early TEST; the incomplete TEST is an intentional hero feature.

---

# 8. Default mission-level WebMCP surface — NEW P0 workstream

The current 14 low-level tools remain valuable execution/debug tools, but an unfamiliar agent must have a small outcome-level route to the mission.

Target default mission tools:

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

Exact terrain enums must come from the **real ChallengeService**. Do not copy example LOW/MEDIUM/HIGH values unless the final challenge registry actually uses them.

Do not add:

- `compile_bridge`
- `instant_build_bridge`
- `set_game_state`
- `set_bridge_complete`
- `set_mission_complete`
- `set_rail_support`

## Advanced existing tools

Keep the current low-level robot/placement tools for diagnostics, proof, or explicit advanced BUILD control.

The normal mission journey should not require dozens of primitive calls for every part.

---

# 9. `build_next_parts` — NEW P0 action

Provide one bounded high-level build action:

```text
build_next_parts(
  count: 1..5,
  speed_profile: SAFE | NORMAL | FAST,
  expected_world_revision
)
```

It must:

- use the real existing placement stream;
- use the real RobotController;
- use real latch/collision/placement acceptance;
- recheck world revision before each part;
- preserve already accepted work on cancellation/error;
- use existing source reassignment;
- stop safely when human/world changes require revalidation;
- update BuildBoard only after accepted placement;
- expose internal substeps in the activity panel.

It must not instant-place parts.

---

# 10. Common WebMCP response contract — NEW P0 gate

Normal mission responses should target **about 1.5K characters or less**.

Page detailed data instead of dumping the full scene/plan/board.

Success envelope:

```json
{
  "ok": true,
  "phase": "BUILD",
  "missionId": "MIS-...",
  "missionRevision": 8,
  "worldRevision": 104,
  "planId": "BP-...",
  "planChecksum": "abcd1234",
  "summary": {},
  "nextActions": []
}
```

Error envelope:

```json
{
  "ok": false,
  "code": "STALE_WORLD_REVISION",
  "message": "The workcell changed.",
  "phase": "BUILD",
  "retryable": true,
  "currentRevision": 104,
  "recovery": {
    "tool": "get_build_progress",
    "arguments": {}
  },
  "allowedNextActions": []
}
```

Requirements:

- stable code;
- current phase/revisions;
- retryability;
- one safe recovery action;
- no exception stack leakage;
- no more than 2–3 next actions;
- millimetres for world distances;
- degrees for user-facing angles;
- explicit coordinate frame when coordinates are returned.

---

# 11. Tool annotations, cancellation, and confirmation

P0:

1. Audit every `readOnlyHint` against real side effects.
2. A tool that creates queues, ghosts, reservations, planning state, or mutations is not read-only.
3. Review/fix `plan_placement_queue` annotation.
4. Use execution `AbortSignal` for long robot/train operations.
5. Cancellation must leave one stable inspectable state and preserve accepted work.
6. `start_bridge_build` requires visible user approval because it freezes the session.
7. `reset_mission` requires visible user approval because progress is destroyed.
8. Do not treat agent-supplied `confirm: true` as user approval.
9. Verify the exact confirmation API in the final target Chrome; retain a visible application-UI fallback.

---

# 12. Judge-visible WebMCP evidence

Extend the existing agent activity UI. Do not create a second debug dashboard.

Recommended mission stages:

```text
SCOUT
DESIGN
COMPILE
FREEZE
BUILD
TEST
RECOVER
PASS
```

Keep roughly the latest 8 events.

Minimum judge HUD:

```text
PHASE       BUILD
PLAN        BP-... · checksum · FROZEN
PROGRESS    accepted / required
HUMAN       count
CODEX/UR10  count
ROBOT       IDLE/BUSY
TEST        last outcome
NEXT        next recommended action
```

During TEST show:

```text
SUPPORT     supported / required segments
TRAIN       RUNNING / outcome
SOURCE      BUILD BOARD SNAPSHOT
```

At completion:

```text
MISSION COMPLETE
TRAIN CROSSED
accepted / required
plan ID · checksum
```

A reviewer should understand the WebMCP chain with sound off.

---

# 13. Workstreams

## WS-0 — MEGA_MERGE / integration owner

```yaml
id: WS-0
completed: false
status: IN_PROGRESS
last_verified: 2026-09-02
evidence: accepted subsystem packages exist; production merge not yet accepted
```

Tasks:

| ID | Task | completed |
|---|---|---:|
| WS0-01 | Freeze current MAIN_DEMO regression baseline | false |
| WS0-02 | Integrate/rebase terrain into real robot workspace | false |
| WS0-03 | Integrate BridgeHost/V4.6 compiler | false |
| WS0-04 | Add exact BuildPlan hologram | false |
| WS0-05 | Integrate PartRegistry | false |
| WS0-06 | Project frozen BuildPlan to BuildBoard/stream | false |
| WS0-07 | Integrate bridge design tools through same BridgeHost | false |
| WS0-08 | Integrate mission-level WebMCP tools | false |
| WS0-09 | Add bounded `build_next_parts` | false |
| WS0-10 | Integrate BuildBoard-derived train TEST | false |
| WS0-11 | Integrate mission/events/stats/reset | false |
| WS0-12 | Extend judge-visible activity/HUD | false |
| WS0-13 | Preserve existing human/robot/advanced WebMCP behavior | false |
| WS0-14 | Full regression + visual acceptance | false |

---

## WS-A — Terrain

Standalone package complete.

Integration tasks:

- rebase EASY into real UR10 workspace;
- verify source supply and build targets are reachable;
- verify player spawn/collision;
- verify train route;
- keep CHALLENGING secondary if it threatens EASY reliability.

P0 hero can ship with one excellent EASY configuration.

---

## WS-B — Bridge/PartRegistry/BuildBoard

Standalone Bridge Core complete.

Integration tasks:

- one BridgeHost;
- same BuildPlan drives hologram and construction;
- exact custom arches/track supported through PartRegistry;
- frozen placement IDs project into BuildBoard;
- no V4.6 execution authority in production.

---

## WS-C — WebMCP

Standalone bridge-design package complete.

Production tasks:

- register/wrap through one production registration owner;
- add mission-level surface;
- keep normal outputs near ≤1.5K;
- fix annotations;
- add recovery envelopes;
- add visible approval for freeze/reset;
- keep advanced primitives out of the default mission path where practical.

---

## WS-D — Train

Standalone Train V2 complete.

Production tasks:

- mount preassembled train;
- replace standalone support adapter with BuildBoard snapshot adapter;
- early incomplete TEST visibly fails;
- complete TEST returns CROSSED;
- repeated reset has no leaked bodies/listeners.

---

## WS-E — Mission

Standalone Mission package complete.

Production tasks:

- consume real ChallengeService/BridgeHost/BuildBoard/RobotController/TrainService;
- derive events from accepted actions;
- COMPLETE only from real CROSSED;
- TRY AGAIN invalidates old session/plan/stream/test IDs.

---

## WS-F — Public release

P0:

- resolve asset redistribution/IP;
- remove/replace uncleared assets;
- update PREEXISTING_WORK/challenge provenance;
- update README to final tool surface;
- remove stale Newton wording;
- deploy final URL;
- test exact hosted URL in target browser;
- make repository public only after clearance;
- record/publicise <3 minute video;
- freeze submitted repo/site after deadline.

---

## WS-G — QA / WebMCP evals

P0 tasks:

| ID | Task | completed |
|---|---|---:|
| WSG-01 | Full integrated unit/regression suite | false |
| WSG-02 | Native WebMCP manual smoke | false |
| WSG-03 | `webmcp-evals smoke` | false |
| WSG-04 | Local/isolated tool-selection evals | false |
| WSG-05 | Browser multi-step evals | false |
| WSG-06 | Wrong-phase/stale-revision recovery evals | false |
| WSG-07 | Human source-interference eval | false |
| WSG-08 | Early failure -> repair -> pass eval | false |
| WSG-09 | Nekuda Workbench W01-W20 | false |
| WSG-10 | Chrome Model Context Tool Inspector | false |
| WSG-11 | Saved-call/schema drift regression | false |
| WSG-12 | Flagship autonomous mission 5/5 | false |
| WSG-13 | Full hero loop x3 | false |
| WSG-14 | Full hero loop x10 | false |
| WSG-15 | Final console/FPS/frame-time/memory review | false |

---

# 14. WebMCP evaluation specification

## 14.1 Deterministic tests

Must always pass:

1. No BuildBoard mutation with stale world revision.
2. No design mutation outside DESIGN.
3. No build before freeze.
4. No build against a different plan/checksum/session.
5. No TEST while robot is busy or holding a part.
6. No train pass with missing required support.
7. No COMPLETE without CROSSED.
8. No old-session mutation after reset.
9. No hidden instant placement through mission tools.
10. No page/tool-state mismatch after a completed call.

## 14.2 Flagship autonomous eval

Give the agent only:

> Build a valid bridge across the terrain and successfully get the train to the other side.

Do not provide tool names, phases, plan IDs, robot instructions, or recovery instructions.

Hard final assertions:

```text
phase == COMPLETE
train.outcome == CROSSED
build.accepted == build.required
build.incorrect == 0
active missionId == tested missionId
frozen planId == tested planId
frozen planChecksum == tested planChecksum
support map source == BUILD_BOARD_SNAPSHOT
robot.state == IDLE
gripper.heldPartId == null
```

Run at least 5 model-driven flagship attempts before final recording.

## 14.3 External acceptance

Use:

- Nekuda WebMCP Workbench;
- Chrome Model Context Tool Inspector;
- `webmcp-evals local`;
- `webmcp-evals smoke`;
- `webmcp-evals browser`.

Record browser version, commit, model/backend, tool-schema checksum, console errors, JSON/HTML reports, and trajectories.

Targets:

- smoke: 100%;
- wrong-state recovery: 100% safe;
- flagship autonomous mission: 5/5;
- final hero reliability: 10/10 target after 3/3 minimum.

---

# 15. Strict P0 must-have list

| ID | Must-have | completed |
|---|---|---:|
| P0-01 | MAIN_DEMO foundation preserved | true |
| P0-02 | Existing native WebMCP/robot foundation preserved | true |
| P0-03 | Accepted V4.6/Oracle packages available | true |
| P0-04 | EASY terrain integrated and robot-reachable | false |
| P0-05 | ENTRY/EXIT/track corridor correct | false |
| P0-06 | BridgeHost + one hero bridge family integrated | false |
| P0-07 | Authoritative PartRegistry | false |
| P0-08 | Every hero-plan part type supported exactly | false |
| P0-09 | Exact BuildPlan hologram | false |
| P0-10 | Atomic conversational bridge editing | false |
| P0-11 | Full frozen mission identity at BUILD | false |
| P0-12 | Frozen BuildPlan initializes BuildBoard/stream | false |
| P0-13 | Human builds accepted frozen plan | false |
| P0-14 | UR10 builds accepted frozen plan | false |
| P0-15 | Source interference -> automatic reassignment | base true / hero integration false |
| P0-16 | Mission-level WebMCP surface | false |
| P0-17 | `build_next_parts` uses real robot path | false |
| P0-18 | Compact ≤~1.5K normal outputs + recovery errors | false |
| P0-19 | Correct annotations/cancellation/confirmation | false |
| P0-20 | Train preassembled at ENTRY | false |
| P0-21 | Train support derives from BuildBoard snapshot | false |
| P0-22 | Incomplete bridge visibly fails TEST | false |
| P0-23 | Failed TEST preserves construction and returns BUILD | false |
| P0-24 | Complete bridge reaches EXIT/CROSSED | false |
| P0-25 | MISSION COMPLETE from CROSSED only | false |
| P0-26 | Real contribution/event statistics | false |
| P0-27 | TRY AGAIN clean reset + stale-session rejection | false |
| P0-28 | Judge-visible mission/activity proof | false |
| P0-29 | Native/WebMCP external acceptance | false |
| P0-30 | `webmcp-evals smoke` 100% | false |
| P0-31 | Flagship autonomous mission 5/5 | false |
| P0-32 | Full hero loop 3/3 minimum | false |
| P0-33 | Full hero loop 10/10 target | false |
| P0-34 | Public-safe repo/docs/live URL | false |
| P0-35 | Final <3 minute public video | false |

If schedule collapses, prioritise **one perfect EASY + Aqueduct journey** over additional terrain/family variety.

---

# 16. Locked scope cuts

Do not spend P0 time on:

- new interior room;
- sofas/furniture;
- custom HDRI workflow;
- procedural terrain;
- terrain voxelisation;
- robot assembly/loading of train vehicles;
- sophisticated coupling engineering;
- realistic locomotive simulation;
- robot train recovery/self-righting;
- individual brick painting;
- camera pickup/ImageGen;
- full structural-solver collapse;
- suspension/cables;
- extra bridge families;
- general motion planning;
- large decorative scene redesign.

Visual polish follows authority/integration/evaluation.

---

# 17. Merge and acceptance order

Do not wait for all polish.

1. **Contracts:** mission identity, normalized placement, PartRegistry, support adapter, response/error envelopes.
2. **Terrain:** EASY rebased into real workspace.
3. **BridgeHost:** V4.6 compiler + exact hologram.
4. **PartRegistry:** exact hero parts supported.
5. **Freeze/BuildBoard projection:** frozen plan -> required placements -> stream.
6. **Mission WebMCP:** outcome-level tools + compact envelopes.
7. **Construction:** `build_next_parts`, human + robot, source reassignment.
8. **Train TEST:** BuildBoard snapshot -> failure/pass.
9. **Mission:** COMPLETE/stats/TRY AGAIN.
10. **Judge evidence:** activity/HUD.
11. **Eval freeze:** deterministic + smoke + browser + Workbench + Inspector.
12. **Reliability:** 3/3 then 10/10.
13. **Release:** hosted URL, public-safe repo, final README/provenance, video.

---

# 18. Final acceptance gate

Submission-ready only when the hosted build demonstrates:

1. App loads with no unreviewed console-breaking error.
2. Target Chrome discovers the intended mission tools.
3. EASY terrain is visible and robot-reachable.
4. ENTRY/EXIT/track are correct.
5. Codex selects/uses the challenge without hidden developer knowledge.
6. Codex changes structured BridgeSpec.
7. V4.6 produces the authoritative draft BuildPlan.
8. Exact hologram matches that plan.
9. BUILD requires visible approval.
10. Full mission/plan identity freezes.
11. Every frozen part type is supported by PartRegistry.
12. BuildBoard initializes from the frozen plan.
13. Human places a valid frozen-plan part.
14. UR10 places a valid frozen-plan part.
15. Human changes a planned source.
16. Runtime reassigns a valid source and continues.
17. `build_next_parts` stays bounded and uses real robot execution.
18. Early TEST snapshots BuildBoard.
19. Train fails visibly on missing support.
20. Failure returns to BUILD without erasing accepted work.
21. Build continues against the same frozen plan.
22. Final TEST snapshots BuildBoard again.
23. Train reaches EXIT and returns CROSSED.
24. CROSSED alone triggers COMPLETE.
25. Statistics match accepted events.
26. TRY AGAIN creates a new mission and invalidates old IDs.
27. Normal mission tool outputs stay compact and recovery-aware.
28. Tool annotations match side effects.
29. Workbench/Inspector core acceptance passes.
30. `webmcp-evals smoke` is 100%.
31. Flagship autonomous mission passes 5/5.
32. Full hero loop passes 3 consecutive runs minimum.
33. Target 10 consecutive runs if time permits.
34. Public repo/live URL/video show the same behavior.

---

# 19. Three-minute video target

Approximate structure:

- **00:00–00:15:** mission + shared page/agent.
- **00:15–00:35:** select curated EASY terrain.
- **00:35–00:55:** request Aqueduct; exact hologram appears.
- **00:55–01:10:** conversational design revision; plan/checksum changes.
- **01:10–01:25:** approve BUILD; plan becomes frozen.
- **01:25–01:50:** human + UR10 build same BuildBoard.
- **01:50–02:05:** human changes expected source; runtime recovers/reassigns.
- **02:05–02:20:** early TEST; train genuinely fails from missing support.
- **02:20–02:40:** continue real build with bounded batches.
- **02:40–02:55:** final TEST -> CROSSED -> COMPLETE.
- **02:55–03:00:** TRY AGAIN + brief WebMCP/eval proof.

Do not spend the first minute explaining architecture. Show the real page changing.

---

# 20. How to update this plan

Whenever an implementation is accepted:

1. change the exact task row from `false` to `true`;
2. update its workstream status;
3. update `last_verified`;
4. add commit/test/browser evidence;
5. update the dashboard;
6. never mark dependent tasks complete automatically;
7. if a regression breaks it, reopen it;
8. update the plan immediately after accepted integration, not days later.

---

# 21. Final principle

**Do not optimise for feature count. Optimise for one undeniable WebMCP collaboration story.**

**Codex decides. Deterministic systems execute. The human can interfere. The runtime adapts. BuildBoard proves construction. The train proves the result.**
