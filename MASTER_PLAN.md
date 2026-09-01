# ROBO BRIDGE MCP — Submission Master Plan

**Status:** FINAL SUBMISSION SPRINT  
**Plan version:** 2026-09-01-C  
**Last repository audit:** `43317f50b710e5c4eed09fd2dbc89f0b44a64e11`  
**Submission deadline:** 2026-09-03 13:00 PDT  
**Internal target:** submission-ready demo by 2026-09-02  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Main vehicle:** pre-assembled three-part train  
**Primary goal:** top-10-calibre WebMCP submission through one complete, reliable human-agent experience

---

# 0. Authority

This file is the current authoritative execution plan.

If an older V3 plan, prototype README, chat instruction, Oracle report, or experimental branch conflicts with this file, **this file wins for the submission sprint**.

Oracle reports are independent audit/evidence inputs. They do not replace this plan.

The project is not trying to integrate every prototype before submission.

The project is trying to make this exact loop reliable:

`CURATED TERRAIN -> CODEX CO-DESIGN -> REAL HOLOGRAM -> HUMAN + CODEX/UR10 CO-BUILD -> EARLY TRAIN FAILURE -> FINISH -> TRAIN SUCCESS -> MISSION COMPLETE -> TRY AGAIN`

The judging priority is:

1. WebMCP Leverage.
2. Execution.
3. Potential Impact.
4. Creativity & Ambition.

All four are equally weighted. WebMCP Leverage is the first tie-break criterion.

---

# 1. Completion tracking contract

Every major deliverable in this file has an explicit completion variable.

Use these fields:

```yaml
id: unique-stable-id
completed: true | false
status: COMPLETE | IN_PROGRESS | READY | BLOCKED | AWAITING_DELIVERABLE | DEFERRED
last_verified: YYYY-MM-DD or null
evidence: short evidence reference or null
```

## Rules

1. `completed: true` means the **acceptance gate for that exact deliverable has been demonstrated**, not merely that source code exists.
2. A standalone prototype may be `completed: true` while its MAIN_DEMO integration remains `completed: false`.
3. `IN_PROGRESS` never implies completion.
4. An Oracle ZIP can complete an external-package task, but not its repository-integration task.
5. A task may change to `completed: true` only when evidence exists: tests, browser acceptance, screenshot/video, or deterministic output as appropriate.
6. If later work breaks a previously accepted feature, change it back to `completed: false` and set `status: BLOCKED` or `IN_PROGRESS`.
7. Agents updating this plan must update `last_verified` and `evidence` with the completion variable.
8. Do not mark an entire workstream complete until every P0 acceptance item in that workstream is complete.

---

# 2. Current completion dashboard

This is the fastest place to understand project state.

| ID | Deliverable | completed | status | Evidence / current truth |
|---|---|---:|---|---|
| FND-01 | MAIN_DEMO Player V8 foundation | true | COMPLETE | Integrated Player V8 runtime on `main` |
| FND-02 | Human brick pickup/rotate/snap/place | true | COMPLETE | MAIN_DEMO integration + regression coverage |
| FND-03 | UR10 + calibrated animated gripper | true | COMPLETE | Integrated robot/gripper runtime |
| FND-04 | One RevisionClock + BuildBoard + RobotController authority | true | COMPLETE | Current architecture |
| MCP-BASE-01 | Native WebMCP base tool surface | true | COMPLETE | Current `register-tools.js` exposes 14 tools |
| MCP-BASE-02 | Camera perception + placement preview | true | COMPLETE | Existing native browser evidence/tests |
| MCP-BASE-03 | Scalable logical placement stream | true | COMPLETE | Commit `3a57455...` |
| MCP-BASE-04 | Five-slot active placement execution window | true | COMPLETE | Current streaming planner |
| MCP-BASE-05 | Automatic source-brick reassignment | true | COMPLETE | Existing lookahead repair behaviour |
| MCP-BASE-06 | Bounded placement cancellation | true | COMPLETE | Commit `7a0a39a...` |
| ORA-AUDIT-01 | Independent Oracle submission audit | true | COMPLETE | `ORACLE_ROBO_BRIDGE_SUBMISSION_AUDIT_V1` reviewed against current HEAD |
| BRG-PKG-01 | V4.6 two-family Aqueduct/Viaduct compiler package | true | COMPLETE | Supplied V4.6 HTML/package; both families compile |
| BRG-PKG-02 | V4.6 deterministic BuildPlan/checksum/debug API | true | COMPLETE | Supplied V4.6 package |
| BRG-INT-01 | V4.6 bridge compiler imported as reusable MAIN_DEMO module | false | READY | Not yet integrated in audited `main` |
| BRG-INT-02 | BridgeSpec -> exact MAIN_DEMO hologram | false | READY | P0 integration gap |
| BRG-INT-03 | BuildPlan -> existing BuildBoard adapter | false | READY | P0 integration gap |
| BRG-INT-04 | Freeze plan/checksum at BUILD start | false | READY | Oracle audit recommendation adopted |
| MCP-DESIGN-01 | Conversational bridge WebMCP tools | false | AWAITING_DELIVERABLE | Oracle package requested / integration not proven |
| CHAL-01 | Curated terrain loaded in MAIN_DEMO | false | READY | Terrain GLB exists but runtime integration absent |
| CHAL-02 | EASY challenge preset | false | READY | Planned only |
| CHAL-03 | CHALLENGING challenge preset | false | READY | Secondary after EASY |
| TRAIN-PKG-01 | Simplified train TEST package | false | AWAITING_DELIVERABLE | Oracle train job requested; not yet accepted |
| TRAIN-INT-01 | Pre-assembled train at ENTRY in MAIN_DEMO | false | READY | P0 integration gap |
| TRAIN-INT-02 | BuildBoard-derived support map | false | READY | Oracle audit recommendation adopted |
| TRAIN-INT-03 | Incomplete bridge -> visible train failure | false | READY | P0 integration gap |
| TRAIN-INT-04 | Complete bridge -> train reaches EXIT | false | READY | P0 integration gap |
| GAME-01 | DESIGN/BUILD/TEST/COMPLETE state machine | false | READY | Required integration control |
| GAME-02 | Event log + collaboration statistics | false | READY | P0 integration gap |
| GAME-03 | MISSION COMPLETE | false | READY | P0 integration gap |
| GAME-04 | TRY AGAIN clean reset | false | READY | P0 integration gap |
| REL-01 | Full hero loop passes 3 consecutive times | false | BLOCKED | Requires integrated hero loop |
| REL-02 | Full hero loop passes target 10 consecutive times | false | BLOCKED | Stretch reliability gate after REL-01 |
| PUB-01 | Asset/IP public-release clearance | false | IN_PROGRESS | `PREEXISTING_WORK.md` still flags unresolved items |
| PUB-02 | README/tool count/provenance corrected | false | READY | README stale; tool count is now 14 |
| PUB-03 | Working hosted WebMCP URL | false | READY | No accepted live deployment yet |
| PUB-04 | Repository public and submission-safe | false | BLOCKED | Wait for asset/IP audit |
| PUB-05 | Final <3 minute public video | false | BLOCKED | Record after hero loop freeze |

## Current interpretation

The difficult enabling technologies are largely complete.

The main weakness is **Execution/integration**, not lack of WebMCP capability or lack of ambition.

Do not add major new concepts before closing the false P0 items above.

---

# 3. Current repository truth

## 3.1 Proven integrated foundation

Do not rewrite these systems:

- Player V8 workbench, lighting, HUD and controls;
- human brick interaction;
- MORE BRICKS;
- UR10 visual/runtime;
- animated gripper;
- one authoritative `RevisionClock`;
- one authoritative `BuildBoard`;
- one authoritative `RobotController`;
- shared player/agent placement authority;
- revision-safe mutations;
- cancellation and fail-closed robot execution;
- six camera views;
- placement preview;
- logical placement streaming;
- five-slot active lookahead/execution window;
- dynamic source reassignment;
- revision-safe undo/placement behaviour.

The current repository now exposes **14 base WebMCP tools**:

1. `get_scene_state`
2. `get_build_state`
3. `get_robot_state`
4. `get_workspace`
5. `observe_camera`
6. `preview_placement`
7. `get_placement_stream_status`
8. `plan_placement_queue`
9. `execute_next_placement`
10. `move_tool`
11. `latch`
12. `unlatch`
13. `claim_target`
14. `reset_workcell`

The README must be updated to match this current surface.

## 3.2 Oracle audit note

The independent Oracle audit targeted current HEAD `43317f50b710e5c4eed09fd2dbc89f0b44a64e11`.

It correctly identified the newer placement-streaming and bounded-cancellation work.

It reported repository evidence consistent with 137 JavaScript tests, but its VM could not freshly clone/rerun the entire repository test suite because of outbound DNS restrictions. Treat the final integrated QA rerun as mandatory.

The Oracle did freshly inspect/test the supplied V4.6 bridge package.

## 3.3 V4.6 bridge package status

The latest supplied bridge package already includes:

- Aqueduct;
- Viaduct;
- configurable arch counts and family-specific parameters;
- custom arch definitions;
- fixed bridge width;
- track generation;
- collaboration territories;
- ordered construction information;
- deterministic BuildPlan;
- design revision;
- plan ID/checksum;
- debug API;
- self-tests.

Therefore the problem is no longer “build the bridge generator.”

The problem is “extract/wrap the V4.6 compiler cleanly and integrate its data into MAIN_DEMO without creating a second runtime authority.”

---

# 4. Locked scope cuts

These features are **not submission blockers** and must not consume time until P0 passes.

## Cut now

- new interior room;
- sofas/furniture;
- custom HDRI workflow;
- major environment redesign;
- procedural terrain integration;
- terrain voxelisation;
- Codex picking up and assembling train vehicles;
- magnetic train coupling engineering;
- realistic robot/train contact dynamics;
- robot recovery of crashed train pieces;
- individual brick painting;
- camera pickup/photo framing/ImageGen feature;
- full structural-solver integration;
- progressive bridge collapse;
- extra bridge families;
- general robot task-and-motion planning.

## Locked train simplification

The train starts **already assembled and positioned on the ENTRY track**.

TEST:

1. reset assembled train to deterministic ENTRY pose;
2. optionally perform a short UR10 visual push only if trivial/reliable;
3. start the train;
4. supported route continues across bridge;
5. unsupported route releases train into failure physics;
6. reset reconstructs the assembled train at ENTRY.

Robot train loading is not P0.

## Locked colour strategy

Do not build a paint system.

Bridge colours come from family/palette parameters.

A small validated palette selector is P1 only.

---

# 5. Hero product state machine

Adopt the Oracle audit recommendation: the submission has an explicit small state machine.

```text
DESIGN -> BUILD -> TEST -> BUILD -> TEST -> COMPLETE
   ^        |       |                    |
   |        |       +---- failure -------+
   +--------+---- explicit reset/redesign
```

Use actual internal states such as:

```text
DESIGN
BUILD
TEST
COMPLETE
```

Optional transient states (`RESETTING`, `FAILED_TEST`) may exist internally.

## Critical rules

1. Bridge parameters can be edited freely in `DESIGN`.
2. Starting `BUILD` freezes the accepted `BridgeSpec`, `planId`, `designChecksum`, and coordinate transform.
3. Do not silently mutate the bridge design while construction is active.
4. A major redesign during BUILD requires an explicit reset/return to DESIGN.
5. TEST reads accepted BuildBoard state.
6. Failed TEST returns to BUILD without destroying accepted construction.
7. Successful TEST transitions to COMPLETE.
8. TRY AGAIN resets challenge, design, board, robot, train and session stats deterministically.

---

# 6. Architecture boundary

Keep the authority chain:

`RevisionClock -> BuildBoard + RobotController -> Runtime -> Perception/WebMCP + Renderer`

New systems are adapters around this chain.

Do not create:

- a second robot controller;
- a second placement board;
- a second accepted inventory truth;
- a V4.6 `BuildExecutionEngine` as a competing MAIN_DEMO build authority;
- hidden instant-build state;
- fake TEST success.

## 6.1 V4.6 integration rule

Import/reuse V4.6 as **compiler/data**, not as a second game runtime.

Reuse:

- BridgeSpec/defaults;
- deterministic geometry/compiler logic;
- custom arch definitions;
- BuildPlan generation;
- track route description;
- checksum/revision logic;
- useful validation.

Do not wholesale integrate:

- its independent renderer loop;
- its construction execution engine as authoritative state;
- its own accepted build state in parallel with BuildBoard.

## 6.2 Design pipeline

`natural language -> WebMCP BridgeSpec patch -> V4.6 compiler -> BuildPlan -> MAIN_DEMO adapter -> exact hologram -> frozen accepted plan -> BuildBoard`

## 6.3 Construction pipeline

`frozen BuildPlan -> logical placement stream -> five-slot active window -> source selection -> RobotController -> PlacementAuthority/BuildBoard`

## 6.4 TEST pipeline

This is now a locked rule:

`BuildBoard accepted occupancy -> rail support map -> train TEST`

The train module must not maintain an independent truth about whether the bridge is complete.

Supported route:

`BuildBoard -> support=true -> guided/analytic train motion`

Unsupported route:

`BuildBoard -> support=false -> release into dynamic fall/derail`

## 6.5 BuildPlan WebMCP output rule

Do not return the full V4.6 BuildPlan by default.

Return a bounded summary containing at minimum:

- plan ID;
- design checksum;
- design revision;
- family;
- key parameters;
- total physical part count;
- arch count;
- track segment count;
- collaboration summary;
- ENTRY/EXIT summary;
- validation/warnings.

Detailed plan retrieval, if needed, must be paged/bounded.

---

# 7. Hero WebMCP story

The final demo must show:

1. User asks Codex for a bridge.
2. Codex changes structured BridgeSpec.
3. V4.6 compiler generates the real plan.
4. Exact hologram appears.
5. User changes one bridge parameter conversationally.
6. Hologram changes.
7. User accepts BUILD; plan/checksum freezes.
8. Human and UR10 build the same accepted plan.
9. Human deliberately takes/moves a source brick Codex intended to use.
10. Placement stream repairs/reassigns automatically.
11. User asks Codex to build faster.
12. TEST runs before completion.
13. Train reaches unsupported section and visibly fails.
14. Build continues.
15. TEST runs again.
16. Train reaches EXIT.
17. MISSION COMPLETE shows contribution statistics.
18. TRY AGAIN creates a clean new session.

---

# 8. Parallel execution model

Use separate branches/worktrees.

## Central integration files — one owner only

Only the integration owner should make final edits to:

- `apps/web/src/logo/main.js`
- `apps/web/index.html`
- `apps/web/src/webmcp/register-tools.js`
- root `package.json` script wiring

Other workstreams export isolated modules and tests.

Recommended branches:

- `codex/submission-integration`
- `codex/submission-a-terrain`
- `codex/submission-b-bridge`
- `codex/submission-c-webmcp`
- `codex/submission-d-train`
- `codex/submission-e-mission`
- `codex/submission-f-public-release`
- `codex/submission-g-qa`

---

# 9. WORKSTREAM 0 — Integration owner

```yaml
id: WS-0
completed: false
status: READY
last_verified: 2026-09-01
evidence: foundation exists; hero integration not complete
```

**Priority:** P0 / critical path

## Tasks

| ID | Task | completed |
|---|---|---:|
| WS0-01 | Freeze current MAIN_DEMO regression baseline | false |
| WS0-02 | Define module contracts for terrain/bridge/WebMCP/train/session | false |
| WS0-03 | Add DESIGN/BUILD/TEST/COMPLETE state machine | false |
| WS0-04 | Add frozen plan/checksum contract at BUILD start | false |
| WS0-05 | Merge terrain module | false |
| WS0-06 | Merge bridge compiler/adapter/hologram | false |
| WS0-07 | Merge bridge WebMCP tools | false |
| WS0-08 | Connect BuildPlan to existing BuildBoard/placement stream | false |
| WS0-09 | Merge train/support-map TEST | false |
| WS0-10 | Merge mission/stats/reset | false |
| WS0-11 | Preserve primitive WebMCP robot control after every merge | false |

## Acceptance

- original player/robot demo still works;
- new features use one accepted world;
- no second BuildBoard/RobotController/build execution authority;
- subsystem modules can be tested independently.

---

# 10. WORKSTREAM A — Curated terrain + challenge presets

```yaml
id: WS-A
completed: false
status: READY
last_verified: 2026-09-01
evidence: Terrain_Optimised_10k.glb exists; MAIN_DEMO integration absent
```

**Priority:** P0

## Tasks

| ID | Task | completed |
|---|---|---:|
| WSA-01 | Copy cleared terrain GLB into runtime asset path | false |
| WSA-02 | Load terrain through current Three.js stack | false |
| WSA-03 | Define canonical terrain transform | false |
| WSA-04 | Define EASY scale/span | false |
| WSA-05 | Define EASY ENTRY/EXIT/rail corridor | false |
| WSA-06 | Add cheap collision proxy | false |
| WSA-07 | Add deterministic preset tests | false |
| WSA-08 | Visual/performance acceptance for EASY | false |
| WSA-09 | Define CHALLENGING preset | false |

Do EASY first. CHALLENGING must not block the hero loop.

---

# 11. WORKSTREAM B — V4.6 bridge compiler integration

```yaml
id: WS-B
completed: false
status: READY
last_verified: 2026-09-01
evidence: external V4.6 package complete; repository integration absent
```

**Priority:** P0 / highest feature priority

## Already complete externally

```yaml
id: WS-B-EXT-V46
completed: true
status: COMPLETE
last_verified: 2026-09-01
evidence: supplied V4.6 package contains Aqueduct, Viaduct, BuildPlan, track and self-tests
```

## Tasks

| ID | Task | completed |
|---|---|---:|
| WSB-01 | Extract V4.6 compiler/data from standalone HTML/package | false |
| WSB-02 | Preserve Aqueduct known-good fixture | false |
| WSB-03 | Preserve Viaduct known-good fixture | false |
| WSB-04 | Define clean public BridgeSpec mapping | false |
| WSB-05 | Accept ENTRY/EXIT/challenge transform as inputs | false |
| WSB-06 | Preserve custom arches and fixed width | false |
| WSB-07 | Keep track visibly above masonry/deck | false |
| WSB-08 | Produce deterministic MAIN_DEMO-ready BuildPlan data | false |
| WSB-09 | Add bridge-local -> MAIN_DEMO transform | false |
| WSB-10 | Render exact BuildPlan as hologram | false |
| WSB-11 | BuildPlan -> BuildBoard/placement-stream adapter | false |
| WSB-12 | Freeze plan/checksum at BUILD start | false |
| WSB-13 | Determinism/parameter-change tests | false |

## Acceptance

- Aqueduct and Viaduct remain deterministic;
- same plan drives hologram and construction;
- V4.6 construction engine does not become a second authority;
- changing design in DESIGN changes checksum;
- BUILD freezes the accepted checksum.

---

# 12. WORKSTREAM C — Submission WebMCP design/control

```yaml
id: WS-C
completed: false
status: AWAITING_DELIVERABLE
last_verified: 2026-09-01
evidence: Oracle WebMCP bridge package requested; final package/integration not yet accepted
```

**Priority:** P0

## Preserve all 14 current base tools

Do not remove or weaken them.

## Add a small high-value bridge surface

Preferred semantic surface:

- `get_challenge_state`
- `get_bridge_design`
- `update_bridge_design`
- bounded `get_bridge_plan`
- `start_build`
- `set_build_speed`
- `start_bridge_test`
- `get_bridge_test_result`
- `reset_challenge`

Exact naming can change if Oracle package provides a cleaner equivalent.

## Tasks

| ID | Task | completed |
|---|---|---:|
| WSC-01 | Review/import Oracle bridge WebMCP ZIP | false |
| WSC-02 | Strict public BridgeSpec schema | false |
| WSC-03 | Partial patches preserve unspecified parameters | false |
| WSC-04 | Stale design revision rejection | false |
| WSC-05 | Family switch works | false |
| WSC-06 | Parameter patch recompiles real hologram | false |
| WSC-07 | Bounded plan summary | false |
| WSC-08 | BUILD freezes design | false |
| WSC-09 | TEST invokes real train module | false |
| WSC-10 | Reset invokes real challenge reset | false |
| WSC-11 | Native hosted WebMCP acceptance | false |

Do not expose one tool per slider.

---

# 13. WORKSTREAM D — Train + TEST

```yaml
id: WS-D
completed: false
status: AWAITING_DELIVERABLE
last_verified: 2026-09-01
evidence: Prototype 05 exists; simplified Oracle package requested; MAIN_DEMO integration absent
```

**Priority:** P0

## Locked implementation

- one pre-assembled three-part train;
- deterministic ENTRY pose;
- no robot train loading;
- guided/analytic motion while supported;
- dynamic fall when support is lost;
- deterministic respawn.

## Tasks

| ID | Task | completed |
|---|---|---:|
| WSD-01 | Review/import Oracle simplified train ZIP | false |
| WSD-02 | Define train service API | false |
| WSD-03 | Define deterministic ENTRY pose | false |
| WSD-04 | Derive support map from BuildBoard | false |
| WSD-05 | Supported route guidance | false |
| WSD-06 | Unsupported route -> physics release/fall | false |
| WSD-07 | Complete route -> CROSSED | false |
| WSD-08 | Failed route -> TRAIN_FELL | false |
| WSD-09 | Reset destroys/reuses bodies without leak | false |
| WSD-10 | Repeat fail-reset-success test | false |
| WSD-11 | Optional UR10 visual push | false |

WS-D is not complete unless its support decision comes from accepted BuildBoard state.

---

# 14. WORKSTREAM E — Mission, events, stats, reset

```yaml
id: WS-E
completed: false
status: READY
last_verified: 2026-09-01
evidence: planned only
```

**Priority:** P0

## Tasks

| ID | Task | completed |
|---|---|---:|
| WSE-01 | Append-only session event log | false |
| WSE-02 | Record accepted human placements | false |
| WSE-03 | Record accepted Codex placements | false |
| WSE-04 | Record source reassignments | false |
| WSE-05 | Record TEST attempts/results | false |
| WSE-06 | Compute contribution/timing stats from events | false |
| WSE-07 | MISSION COMPLETE on real CROSSED result | false |
| WSE-08 | TRY AGAIN clean reset | false |

Minimum stats:

- elapsed session/build time;
- total bricks;
- human bricks;
- Codex bricks;
- percentages;
- average placement interval by actor;
- TEST attempts;
- successful TEST count.

---

# 15. WORKSTREAM F — Public release / competition readiness

```yaml
id: WS-F
completed: false
status: IN_PROGRESS
last_verified: 2026-09-01
evidence: private repo + unresolved public asset clearance remain
```

**Priority:** P0 release blocker

## Tasks

| ID | Task | completed |
|---|---|---:|
| WSF-01 | Resolve gripper/asset redistribution status | false |
| WSF-02 | Remove/replace uncleared assets | false |
| WSF-03 | Finalise PREEXISTING_WORK provenance | false |
| WSF-04 | Create/update CHALLENGE_WORK provenance | false |
| WSF-05 | Update README to current 14 base tools + submission tools | false |
| WSF-06 | Remove stale Newton wording | false |
| WSF-07 | Prepare hosted URL | false |
| WSF-08 | Test hosted URL in in-app/WebMCP browser | false |
| WSF-09 | Make repo public only after IP gate | false |
| WSF-10 | Draft/finalise Devpost submission | false |
| WSF-11 | Record/publicise <3 minute video | false |

---

# 16. WORKSTREAM G — QA / evidence / reliability

```yaml
id: WS-G
completed: false
status: READY
last_verified: 2026-09-01
evidence: existing subsystem evidence strong; final integrated hero evidence absent
```

**Priority:** P0 after interfaces exist; scaffolding can start immediately

## Existing evidence

The current repo has strong subsystem tests/evidence, but the final integrated suite must be rerun after merge.

Do not rely on the Oracle audit's inability to freshly clone/run the repository.

## Tasks

| ID | Task | completed |
|---|---|---:|
| WSG-01 | Rerun full root JS suite on final integrated HEAD | false |
| WSG-02 | Rerun WebMCP tests | false |
| WSG-03 | Rerun robot tests | false |
| WSG-04 | Rerun player tests | false |
| WSG-05 | Rerun reliability harness | false |
| WSG-06 | Rerun verify | false |
| WSG-07 | Native WebMCP design-change evidence | false |
| WSG-08 | Native robot placement evidence | false |
| WSG-09 | Human steals source -> reassignment evidence | false |
| WSG-10 | Early train failure evidence | false |
| WSG-11 | Final train success evidence | false |
| WSG-12 | Full hero loop x3 consecutive | false |
| WSG-13 | Full hero loop target x10 consecutive | false |
| WSG-14 | Final console/FPS/frame-time review | false |

Three consecutive loops is the minimum freeze gate.

Ten consecutive loops is the target before final recording if time permits.

---

# 17. Oracle parallel work status

## Oracle audit

```yaml
id: ORACLE-AUDIT
completed: true
status: COMPLETE
last_verified: 2026-09-01
evidence: ORACLE_ROBO_BRIDGE_SUBMISSION_AUDIT_V1 reviewed and reconciled with current GitHub HEAD
```

Adopted recommendations:

- explicit completion tracking;
- lock accepted plan/checksum in BUILD;
- small mission state machine;
- BuildBoard-derived train support;
- bounded WebMCP BuildPlan responses;
- V4.6 as compiler/data, not second runtime authority;
- 10-loop reliability target after 3-loop minimum.

## Oracle WebMCP bridge package

```yaml
id: ORACLE-WEBMCP-BRIDGE
completed: false
status: AWAITING_DELIVERABLE
last_verified: null
evidence: requested; not yet accepted
```

## Oracle train package

```yaml
id: ORACLE-TRAIN
completed: false
status: AWAITING_DELIVERABLE
last_verified: null
evidence: requested; not yet accepted
```

Oracle ZIP completion does not automatically complete WS-C or WS-D integration.

---

# 18. Merge waves

Do not wait for all streams to finish.

## Wave 0 — Contracts

`completed: false`

Integration owner freezes module APIs and state ownership.

## Wave 1 — Terrain

`completed: false`

Target:

`MAIN_DEMO + curated EASY terrain + ENTRY/EXIT`

## Wave 2 — Bridge preview

`completed: false`

Target:

`BridgeSpec -> V4.6 compiler -> exact MAIN_DEMO hologram`

Record a backup video here.

## Wave 3 — WebMCP co-design

`completed: false`

Target:

`Codex -> update BridgeSpec -> real hologram changes`

Record another backup video.

## Wave 4 — Collaborative build

`completed: false`

Target:

`frozen BuildPlan -> BuildBoard -> human + UR10 -> source reassignment`

Record another backup video.

## Wave 5 — Train TEST

`completed: false`

Target:

`BuildBoard support map -> incomplete fail / complete cross`

Record another backup video.

## Wave 6 — Mission

`completed: false`

Target:

`CROSSED -> MISSION COMPLETE -> stats -> TRY AGAIN`

## Wave 7 — Public/release

`completed: false`

Target:

public-safe repo + hosted native WebMCP + final docs.

## Wave 8 — Freeze

`completed: false`

Target:

3 consecutive hero loops minimum, 10 target, final video recorded.

---

# 19. Work the user can do in parallel

These do not require waiting for integration code:

1. Finalise only the existing terrain GLB/materials. No new room.
2. Keep the supplied V4.6 bridge package as the authoritative bridge-design reference.
3. Provide final train meshes as one known assembled configuration when ready; placeholder boxes remain acceptable until P0 works.
4. Choose 2-4 fixed bridge palettes. No paint system.
5. Confirm public asset rights.
6. Prepare deployment account/domain.
7. Start/save Devpost draft.
8. Draft exact 2:30-2:50 demo script.
9. Prepare exact demo prompts and backups.
10. Capture a clean screenshot after each successful merge wave.
11. Keep submission positioning focused on collaborative robotics/STEM/maker design, not merely a toy bridge game.

---

# 20. Strict P0 top-10 must-have list

Every item below must be `completed: true` before optional feature expansion.

| ID | Must-have | completed |
|---|---|---:|
| P0-01 | MAIN_DEMO preserved | true |
| P0-02 | Current native WebMCP/robot foundation preserved | true |
| P0-03 | V4.6 Aqueduct/Viaduct source package available | true |
| P0-04 | Curated EASY terrain integrated | false |
| P0-05 | ENTRY/EXIT fixed and correct | false |
| P0-06 | One hero bridge family integrated completely | false |
| P0-07 | Exact BuildPlan hologram | false |
| P0-08 | Conversational WebMCP bridge editing | false |
| P0-09 | Accepted design/checksum freezes in BUILD | false |
| P0-10 | BuildPlan feeds existing BuildBoard/placement stream | false |
| P0-11 | Human builds accepted bridge plan | false |
| P0-12 | UR10 builds accepted bridge plan | false |
| P0-13 | Human source-brick interference causes automatic reassignment | true for base runtime / false for bridge hero integration |
| P0-14 | Build speed change works in hero build | false |
| P0-15 | Pre-assembled train at ENTRY | false |
| P0-16 | Train support derives from BuildBoard | false |
| P0-17 | Incomplete bridge visibly fails TEST | false |
| P0-18 | Complete bridge reaches EXIT | false |
| P0-19 | MISSION COMPLETE | false |
| P0-20 | Contribution stats correct | false |
| P0-21 | TRY AGAIN clean reset | false |
| P0-22 | Hosted native WebMCP accepted | false |
| P0-23 | Public-safe repo/docs/provenance | false |
| P0-24 | Hero loop x3 consecutively | false |
| P0-25 | Final <3 minute video | false |

If time collapses, prioritise **one perfect EASY + Aqueduct path** over two unreliable families/presets.

---

# 21. P1 only after P0 x3 passes

Ranked by judge value / effort:

1. One generic Codex wall BuildPlan demonstration.
2. One allow-listed general scene-setting tool.
3. Bridge palette control through Codex.
4. Short visible UR10 push to start pre-assembled train.
5. CHALLENGING + Viaduct if not already proven.
6. Richer mission statistics.
7. Construction skill/instruction document.
8. Camera framing and modest lighting/material polish.

No P1 feature begins before the full P0 hero loop passes three consecutive times unless it is genuinely independent and cannot threaten P0.

---

# 22. P2 / post-submission

- interior room/sofas;
- custom HDRI;
- camera pickup + ImageGen photo workflow;
- individual brick painting;
- robot train loading/coupling;
- train self-righting robotics;
- procedural terrain;
- terrain voxelisation;
- full structural solver/collapse;
- extra bridge catalogue;
- suspension/cables;
- roads/cars;
- arbitrary-object building product UX;
- general motion planning.

---

# 23. Target <3-minute submission video

Target length: ~2:30-2:50.

## 0:00-0:15 — premise

Human + UR10 + terrain + bridge gap.

State: one shared WebMCP world.

## 0:15-0:40 — conversational design

> Make a Roman aqueduct...

Hologram appears.

> Change the top arches to eight...

Hologram changes.

## 0:40-1:25 — co-build

Human builds one region.

Codex/UR10 builds another.

Human deliberately takes/moves a planned source brick.

Show automatic reassignment.

> Build faster.

## 1:25-1:45 — early TEST

> Test the bridge.

Train falls at genuine unsupported route.

## 1:45-2:20 — finish + retest

Finish bridge.

Train reaches EXIT.

## 2:20-2:35 — result

MISSION COMPLETE + human/Codex stats.

## 2:35-2:50 — proof

Briefly show/state:

- native WebMCP;
- authoritative world revisions;
- generic placement stream;
- no hidden instant-build shortcut;
- adaptation to human state changes.

Do not spend video time on interior scenery, ImageGen, train assembly, or large settings tours.

---

# 24. Main risks and locked fallbacks

## Terrain collision causes trouble

Use visual terrain plus simple conservative collision.

Do not voxelise.

## V4.6 extraction takes too long

Use the supplied debug/service seam initially and isolate it behind an adapter.

Do not rewrite the bridge mathematics.

## Full BuildPlan is too large for WebMCP

Return bounded summary + checksum + paging.

Do not send the entire plan by default.

## Bridge build is too long

Reduce EASY span/arch counts and use custom arch pieces/larger legal parts.

## Train dynamics are unstable

Use analytic/guided motion while supported and dynamic physics only at failure.

## Train push is unreliable

Start train velocity directly through TEST.

## Tall Viaduct threatens schedule

Ship EASY + Aqueduct as hero; keep Viaduct as secondary evidence.

## Public asset uncertainty remains

Remove/replace uncertain asset before making repo public.

## Hosted WebMCP fails

Treat deployment/native WebMCP as P0 and resolve before final video.

---

# 25. Final acceptance gate

The submission is ready only when these conditions are all true on the hosted build:

1. App loads without console-breaking errors.
2. Native WebMCP tools register.
3. EASY challenge is visible.
4. ENTRY/EXIT are correct.
5. Codex creates bridge design.
6. Exact hologram appears.
7. Codex changes one parameter and hologram changes.
8. BUILD freezes plan/checksum.
9. Human places valid bridge part.
10. UR10 places valid bridge part.
11. Human interferes with source selection.
12. Source reassigns automatically.
13. Robot continues.
14. Early TEST reads BuildBoard-derived support.
15. Train fails visibly on incomplete support.
16. Train resets.
17. Bridge completion creates full support.
18. TEST runs again.
19. Train reaches EXIT.
20. MISSION COMPLETE appears.
21. Stats match accepted events.
22. TRY AGAIN produces clean state.
23. Complete sequence passes 3 consecutive times minimum.
24. Target 10 consecutive passes if time allows.
25. Public repo/live URL/video all match the demonstrated behaviour.

---

# 26. How to update this plan

Whenever an agent completes work:

1. update the relevant task row from `false` to `true`;
2. update the workstream `status`;
3. update `last_verified`;
4. add evidence: commit SHA, test result, screenshot path, browser evidence, or Oracle ZIP name;
5. update the completion dashboard near the top;
6. do not mark dependent tasks complete automatically;
7. commit the plan update together with or immediately after the accepted implementation.

The completion dashboard is the source of truth for sprint status.

---

# 27. Final principle

**Do not optimise for feature count. Optimise for one undeniable WebMCP collaboration story.**

**Codex decides. Deterministic systems execute. The human can interfere. The system adapts. The train proves the result.**
