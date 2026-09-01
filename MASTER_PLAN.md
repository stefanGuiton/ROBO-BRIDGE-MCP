# ROBO BRIDGE MCP — Submission Master Plan

**Status:** FINAL SUBMISSION SPRINT  
**Audit date:** 2026-09-01  
**Submission deadline:** 2026-09-03 13:00 PDT  
**Internal target:** submission-ready demo by 2026-09-02  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Main vehicle:** pre-assembled three-part train  
**Primary goal:** top-10-calibre WebMCP submission through one complete, reliable human-agent experience

---

# 0. Authority

This file is the current authoritative execution plan.

If an older V3 plan, prototype README, chat instruction, or experimental branch conflicts with this file, **this file wins for the submission sprint**.

The project is not trying to integrate every prototype before submission.

The project is trying to make this exact loop work reliably:

`CURATED TERRAIN -> CODEX CO-DESIGN -> REAL HOLOGRAM -> HUMAN + CODEX/UR10 CO-BUILD -> EARLY TRAIN FAILURE -> FINISH -> TRAIN SUCCESS -> MISSION COMPLETE -> TRY AGAIN`

The judging priority is:

1. WebMCP Leverage.
2. Execution.
3. Potential Impact.
4. Creativity & Ambition.

All four are equally weighted. WebMCP Leverage is the first tie-break criterion.

---

# 1. Competition constraints that are release blockers

Before submission, the project must have:

- a working live URL accessible in ChatGPT's in-app browser or WebMCP-enabled Chrome;
- a public code repository;
- a visible open-source licence;
- all source, required assets, and clear run/test instructions;
- a public YouTube demo with audio under three minutes;
- clear documentation that distinguishes pre-existing work from WebMCP work added during the challenge;
- cleared rights for every asset shipped in the public submission;
- a frozen submitted site/repository after the deadline during judging.

Current repository audit notes:

- GitHub repository visibility is still **private**.
- Apache-2.0 licence is already present.
- `PREEXISTING_WORK.md` still records unresolved redistribution confirmation for the supplied gripper/contribution material.
- GitHub About text is stale and still mentions Newton physics, although Newton was removed.
- Public-release/IP review must happen before changing repository visibility.

---

# 2. Critical repository audit — current truth

## 2.1 Proven and integrated in `MAIN_DEMO`

These are strong assets. Do not rewrite them.

- Player V8 workbench, table, lighting, HUD, controls, and settings.
- Human first-person movement.
- Human brick pickup, rotation, snapping, and placement.
- MORE BRICKS supply.
- UR10 visual/runtime.
- Animated calibrated gripper.
- Reliable robot pickup and placement.
- One authoritative `RevisionClock`.
- One authoritative `BuildBoard`.
- One authoritative `RobotController`.
- Shared player/agent placement authority.
- Revision-safe mutations.
- Cancellation and fail-closed robot execution.
- Six simulated camera views.
- Native WebMCP browser acceptance evidence.
- Placement preview.
- Five-placement lookahead.
- Dynamic source-brick reassignment when the world changes.
- Revision-safe undo/placement behaviour.

The latest integrated MAIN_DEMO merge reported 124/124 JavaScript tests plus 20/20 reliability trials.

## 2.2 Current WebMCP surface

The implementation now exposes **13 tools**, not 11:

- `get_scene_state`
- `get_build_state`
- `get_robot_state`
- `get_workspace`
- `observe_camera`
- `preview_placement`
- `plan_placement_queue`
- `execute_next_placement`
- `move_tool`
- `latch`
- `unlatch`
- `claim_target`
- `reset_workcell`

`README.md` is stale and must be updated before public submission.

## 2.3 Proven but isolated prototypes

These are useful source modules, not integrated product features yet.

### Bridge generator

`PROTOTYPES/02_Bridge_Generator_2D/`

- deterministic bridge generation exists;
- a `viaduct` fixture exists;
- schemas and tests exist;
- it remains isolated from `MAIN_DEMO`.

**Important:** the audited repository does not contain an Aqueduct-specific submission implementation under that name. The latest working two-family Aqueduct/Viaduct generator described in the submission plan must be committed/imported as an authoritative source module before it can be integrated.

### Bridge-to-bricks compiler

`PROTOTYPES/03_Bridge_To_Bricks/`

- deterministic candidate BuildPlans exist;
- dependency graph and member mapping exist;
- it remains isolated from `MAIN_DEMO`;
- it is not automatically the same as the newest custom-arch submission bridge generator.

### Structural solver

`PROTOTYPES/04_Structural_Solver/`

- useful future TEST logic exists;
- do not integrate it before the simpler fail/pass train path works.

### Train/Rapier

`PROTOTYPES/05_Train_Rapier/`

- supported crossing is proven;
- lost support causing derail/fall is proven;
- reset is proven in the isolated prototype;
- it remains isolated from `MAIN_DEMO`.

## 2.4 Assets already in repository

`Scene_and_3D_Files/Terrain_Optimised_10k.glb` is backed up through Git LFS.

The asset is not yet loaded by `apps/web`.

## 2.5 Missing integrated submission systems

There is no committed integrated proof yet for:

- curated terrain inside MAIN_DEMO;
- EASY/CHALLENGING challenge presets in MAIN_DEMO;
- authoritative two-family Aqueduct/Viaduct submission generator in MAIN_DEMO;
- bridge BuildPlan -> MAIN_DEMO adapter;
- bridge design WebMCP tools;
- bridge hologram from the submission BuildPlan;
- train/test runtime inside MAIN_DEMO;
- MISSION COMPLETE;
- submission event/statistics log;
- public live deployment;
- public-repository release readiness.

These are the real submission gaps.

---

# 3. Locked scope cuts

These features are **not submission blockers** and must not consume time until P0 is complete.

## Cut now

- new interior room;
- sofas/furniture;
- custom HDRI workflow;
- major environment redesign;
- procedural terrain integration;
- terrain voxelisation;
- Codex picking up and assembling all three train vehicles;
- train magnetic coupling engineering;
- realistic robot/train contact dynamics;
- train recovery with the robot;
- individual brick painting;
- camera pickup/photo framing/ImageGen feature;
- full structural-solver integration;
- progressive bridge collapse;
- suspension/cable systems;
- extra bridge families;
- general robot task-and-motion planning.

## Locked train simplification

The train starts **already assembled and positioned on the ENTRY track**.

When TEST starts:

1. the assembled train is reset to its deterministic start pose;
2. optionally the UR10 performs a short visible push if this is trivial and reliable;
3. the train simulation runs;
4. on failure, train pieces may fall and separate visually;
5. TEST reset respawns the assembled train at ENTRY.

Robot loading of train parts is no longer part of P0.

## Locked colour strategy

Do not build a paint system.

Bridge colours remain generated by the selected bridge palette.

If time remains, Codex may switch a small set of validated palettes such as sandstone, grey stone, red/blue, or custom predefined colours. Palette control is P1.

---

# 4. Hero WebMCP story

The final submission must show a visible chain that cannot be mistaken for scripted playback:

1. User asks Codex for a bridge design.
2. Codex changes structured bridge parameters.
3. Deterministic generator creates the real BuildPlan.
4. Exact hologram updates.
5. User changes one design parameter through natural language.
6. Hologram updates again.
7. User and Codex/UR10 build the same accepted structure.
8. Human deliberately takes a source brick Codex planned to use.
9. Lookahead automatically reassigns another valid brick.
10. User can ask Codex to build faster.
11. TEST runs before completion and the train visibly fails at unsupported track.
12. Build continues.
13. TEST runs again after completion.
14. Train reaches EXIT.
15. MISSION COMPLETE and human/Codex contribution statistics appear.
16. TRY AGAIN returns to a clean state.

This is the P0 product.

---

# 5. Architecture boundary

Keep the existing authority chain:

`RevisionClock -> BuildBoard + RobotController -> Runtime -> Perception/WebMCP + Renderer`

New submission modules must be adapters around this chain.

Do not create:

- a second robot controller;
- a second placement board;
- a second accepted inventory truth;
- a hidden instant-build state;
- a fake TEST success function.

Codex controls intent and data.

Deterministic code controls exact repetitive execution.

Expected design pipeline:

`natural language -> BridgeSpec -> deterministic bridge generator -> BuildPlan -> validation -> hologram -> accepted build execution`

Expected TEST pipeline:

`accepted build state -> rail support map -> TEST -> supported train guidance OR unsupported dynamic fall -> result`

---

# 6. Parallel execution model

Use separate branches/worktrees. Parallel agents must not repeatedly edit the same central files.

## Central integration files — ONE OWNER ONLY

Only the integration owner should make final edits to:

- `apps/web/src/logo/main.js`
- `apps/web/index.html`
- `apps/web/src/webmcp/register-tools.js`
- root `package.json` script wiring

All other workstreams must export self-contained modules and tests. The integration owner wires them together.

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

# 7. PARALLEL WORKSTREAM 0 — Integration owner

**Priority:** P0 / critical path  
**Start:** immediately  
**Goal:** own the one integrated application and merge contract

## Owns

- central files listed above;
- top-level submission state machine;
- bridge/challenge/train module wiring;
- final WebMCP tool registration;
- merge order;
- final end-to-end acceptance.

## Steps

1. Freeze the current working MAIN_DEMO behaviour as regression baseline.
2. Define minimal public APIs expected from A-E before those agents start.
3. Add no feature implementation that another workstream owns.
4. Create a small submission state object:
   - challenge preset;
   - BridgeSpec;
   - design revision;
   - BuildPlan ID/checksum;
   - mode `DESIGN|BUILD|TEST|RESULT`;
   - train result;
   - session/event state.
5. Merge terrain module first with no bridge logic.
6. Merge bridge module and render exact hologram.
7. Merge WebMCP design tools.
8. Connect approved BuildPlan to existing BuildBoard/placement authority.
9. Merge train/test module.
10. Merge mission/stats module.
11. Run existing MAIN_DEMO regression after every merge.
12. Reject any merge that breaks human placement or primitive WebMCP robot control.

## Acceptance

- all subsystem modules can be enabled/disabled independently;
- original player/robot demo still works;
- no second state authority exists.

---

# 8. PARALLEL WORKSTREAM A — Curated terrain + challenge presets

**Priority:** P0  
**Can run in parallel with:** B, C, D, E, F

## Owns

Suggested new area:

- `apps/web/src/challenge/`
- `apps/web/assets/terrain/`
- challenge-focused tests

Do not edit `logo/main.js`.

## Steps

1. Bring the cleared runtime terrain GLB into the runtime asset path.
2. Load it with the existing Three.js stack.
3. Define one canonical terrain local transform.
4. Define EASY preset:
   - reduced vertical scale around 0.3-0.4;
   - reduced effective crossing span;
   - fixed ENTRY transform;
   - fixed EXIT transform;
   - fixed rail corridor.
5. Define CHALLENGING preset:
   - full/near-full height;
   - larger span;
   - fixed ENTRY/EXIT;
   - fixed rail corridor.
6. Keep terrain scaling deterministic and data-driven.
7. Use a cheap collision representation; do not use terrain voxelisation.
8. Export API such as:
   - `createChallengePreset(name)`
   - `mountChallenge(scene, preset)`
   - `getEntryExit()`
   - `getTrackCorridor()`
   - `resetChallenge()`
9. Add tests for deterministic transforms and ENTRY/EXIT values.
10. Produce one screenshot for EASY and one for CHALLENGING.

## Acceptance

- terrain loads every time;
- no large performance regression;
- ENTRY/EXIT are stable;
- bridge span data is available without terrain analysis;
- no changes to player/robot authority.

---

# 9. PARALLEL WORKSTREAM B — Authoritative submission bridge generator

**Priority:** P0 / highest feature priority  
**Can run in parallel with:** A, C, D, E, F

## Owns

Suggested new area:

- `apps/web/src/bridge/`
- `apps/web/assets/bridge/`
- bridge schemas/tests

Do not edit `logo/main.js` or `register-tools.js`.

## First action — mandatory

Locate and commit/import the **latest working two-family Aqueduct/Viaduct generator** that currently exists outside audited `main`.

Do not assume `PROTOTYPES/02` is the same implementation.

Preserve the newest working visual rules:

- Aqueduct family;
- Viaduct family;
- custom clean arch pieces;
- fixed practical width;
- rail deck visible above masonry;
- deck height kept compact;
- arch material/colour matching surrounding structure;
- ordered BuildPlan output.

## Steps

1. Freeze a known-good visual fixture for Aqueduct.
2. Freeze a known-good visual fixture for Viaduct.
3. Define strict submission `BridgeSpec` with only parameters needed by these families.
4. Define tested defaults.
5. Make ENTRY/EXIT span an explicit input.
6. Produce deterministic local bridge placements.
7. Keep custom arch components as legal part types.
8. Emit one generic BuildPlan shape compatible with an adapter.
9. Emit stable design revision/checksum.
10. Ensure the hologram can use the exact same placements.
11. Add bridge-local -> MAIN_DEMO world transform helper, but do not mutate MAIN_DEMO state directly.
12. Add tests:
    - same spec -> same plan;
    - changed arch count -> changed plan;
    - family switch -> changed plan;
    - track deck remains above masonry;
    - bridge width remains bounded;
    - all placement IDs stable/deterministic.
13. Produce screenshot evidence for both families.

## Acceptance

- both hero families exist in source;
- generator is not hidden playback;
- same BuildPlan drives preview and execution;
- output can be consumed without rewriting robot code.

---

# 10. PARALLEL WORKSTREAM C — Submission WebMCP design/control tools

**Priority:** P0  
**Can run in parallel with:** A, B, D, E, F

## Owns

Suggested module:

- `apps/web/src/webmcp/submission-tools.js`
- tool handler tests

Do not directly edit `register-tools.js`; integration owner registers the final definitions.

## Keep existing 13 tools

Do not remove or weaken primitive robot tools.

## Add only a small high-value surface

Recommended submission additions:

- `get_challenge_state`
- `get_bridge_spec`
- `set_bridge_spec`
- `get_bridge_plan`
- `start_build` or equivalent mode transition
- `set_build_speed` if a dedicated speed profile is useful
- `start_bridge_test`
- `get_bridge_test_result`
- `reset_challenge`

Do not expose every UI setting as a separate tool.

## Steps

1. Create strict JSON schemas.
2. Require exact latest world/design revision for mutations where applicable.
3. Return small bounded structured results.
4. Make bridge edits call the real B generator through an injected adapter.
5. Make TEST call the real D module through an injected adapter.
6. Do not add `instant_build_bridge` or any playback shortcut.
7. Add one optional allow-listed generic settings tool only after P0.
8. Add tests for:
   - unknown parameter rejection;
   - stale revision rejection;
   - family change;
   - arch-count change;
   - TEST intent;
   - reset;
   - tool result size.

## Acceptance

A WebMCP agent can:

- inspect challenge;
- create/update bridge design;
- cause the real hologram to change;
- start build/test;
- inspect real result.

---

# 11. PARALLEL WORKSTREAM D — Train + TEST integration

**Priority:** P0  
**Can run in parallel with:** A, B, C, E, F

## Owns

Suggested new area:

- `apps/web/src/train/`
- train/test tests

Adapt from `PROTOTYPES/05_Train_Rapier/`.

Do not edit central MAIN_DEMO files.

## Locked simplification

Use one pre-assembled three-part train at ENTRY.

Do not implement UR10 train loading.

## Steps

1. Extract the smallest supported-route/fall-on-missing-support logic from Prototype 05.
2. Adapt to MAIN_DEMO's coordinate frame through an injected route definition.
3. Create deterministic train reset pose behind ENTRY.
4. Keep the train guided/analytic while route support exists.
5. Define rail support in simple discrete segments.
6. Determine support from accepted bridge/track completion.
7. When required support disappears:
   - release the train into Rapier/dynamic physics;
   - preserve velocity;
   - allow visible fall/collision.
8. Complete route reaches EXIT and returns `CROSSED`.
9. Missing route returns `TRAIN_FELL` or equivalent.
10. TEST reset reconstructs/respawns the assembled train.
11. Optional P1: short UR10 visual push to start.
12. Add deterministic tests for:
    - complete support -> CROSSED;
    - centre support missing -> falls;
    - reset returns same pose;
    - repeated tests do not leak bodies.

## Acceptance

- early incomplete bridge visibly fails;
- complete route visibly succeeds;
- train is immediately reusable after reset;
- no robot train assembly is required.

---

# 12. PARALLEL WORKSTREAM E — Session events, MISSION COMPLETE, stats, reset

**Priority:** P0  
**Can run in parallel with:** A-D, F

## Owns

Suggested new area:

- `apps/web/src/game/submission-session.js`
- `apps/web/src/ui/mission-complete.js`
- focused UI/session tests

Avoid central file edits; export mount/update functions.

## Steps

1. Add append-only session event log.
2. Record:
   - session start;
   - challenge selected;
   - design generated/changed;
   - build start;
   - accepted human placement;
   - accepted Codex placement;
   - source-brick reassignment;
   - speed change;
   - TEST start;
   - train failure;
   - train crossed;
   - mission complete;
   - reset.
3. Use accepted placement authority events, not duplicate counters.
4. Compute minimum final stats:
   - total elapsed time;
   - total bricks;
   - human bricks;
   - Codex bricks;
   - human/Codex percentages;
   - average placement interval for each actor;
   - test attempts;
   - successful tests.
5. Implement MISSION COMPLETE overlay.
6. Implement TRY AGAIN action.
7. Reset event/session data without leaving stale subscriptions.
8. Add tests that compare stats to synthetic accepted events.

## Acceptance

- MISSION COMPLETE only fires when train reaches EXIT;
- counts match accepted board events;
- TRY AGAIN produces a clean new session.

---

# 13. PARALLEL WORKSTREAM F — Public submission, IP, deployment, documentation

**Priority:** P0 release blocker  
**Can run entirely in parallel with:** A-E

## Owns

- public-release documentation;
- asset/IP inventory;
- deployment setup;
- challenge provenance;
- Devpost materials draft.

## Steps

1. Resolve redistribution status of the supplied gripper and other user/Oracle assets.
2. Remove or replace anything that cannot be publicly redistributed.
3. Review Git LFS files before public release.
4. Update `PREEXISTING_WORK.md` with a clear final provenance boundary.
5. Create `CHALLENGE_WORK.md`:
   - pre-Aug-25 foundation;
   - WebMCP work added during challenge;
   - dated key commits;
   - current architecture.
6. Update README:
   - ROBO BRIDGE submission story;
   - current **13** base WebMCP tools plus final submission tools;
   - how to run;
   - how to test WebMCP;
   - demo prompts;
   - simulation-only boundary.
7. Update GitHub About description; remove stale Newton reference.
8. Verify Apache-2.0 is visible.
9. Prepare working hosted URL.
10. Test live URL in ChatGPT in-app browser.
11. Test live URL in WebMCP-enabled Chrome if available.
12. Prepare public-repository transition only after IP audit.
13. Draft Devpost description around:
    - agent-native collaborative construction;
    - robotics/STEM/maker audience;
    - what human + agent can do together;
    - why WebMCP is necessary.
14. Draft <3-minute video script.
15. Do not add copyrighted music/trademarks without permission.

## Acceptance

- public repo is legally/technically safe;
- live URL works without developer machine assumptions;
- a judge can understand the project from README/video alone.

---

# 14. PARALLEL WORKSTREAM G — QA, native WebMCP evidence, performance

**Priority:** P0 after interfaces exist; start test scaffolding early  
**Can run in parallel with:** all streams

## Owns

- new integration tests;
- reliability trials;
- evidence documents/screenshots;
- visual/browser acceptance;
- performance regression checks.

## Steps

1. Preserve all existing test commands.
2. Add focused tests for each new module without modifying central implementations.
3. Add one end-to-end submission acceptance test/harness where practical.
4. After each merge wave run:
   - `npm run test:js`
   - `npm run test:webmcp`
   - `npm run test:robot`
   - `npm run test:player`
   - `npm run test:reliability`
   - `npm run verify`
5. Repeat native WebMCP discovery in the final submission browser.
6. Prove at least once:
   - design parameter change through WebMCP;
   - visible hologram change;
   - robot placement;
   - human steals planned source brick;
   - automatic reassignment;
   - early failed TEST;
   - final successful TEST.
7. Run the complete EASY hero loop at least three consecutive times.
8. Prefer 10 consecutive loops if time allows.
9. Record console errors/warnings.
10. Record FPS/frame time during the final bridge scene.
11. Reject environment polish that causes material frame-rate regression.

## Acceptance

- no regression in original MAIN_DEMO controls;
- complete hero loop is repeatable;
- evidence matches what is claimed in submission.

---

# 15. Merge waves — do not wait for every stream to finish

## Wave 0 — Contracts

Integration owner freezes minimal APIs for A-E.

## Wave 1 — Terrain

Merge A.

Required result:

`MAIN_DEMO + curated terrain + EASY/CHALLENGING + ENTRY/EXIT`

Do not wait for bridge/train.

## Wave 2 — Bridge preview

Merge B.

Required result:

`preset -> BridgeSpec -> Aqueduct/Viaduct -> exact hologram`

This is the most important early visual milestone.

## Wave 3 — WebMCP co-design

Merge C.

Required result:

`voice/agent -> set BridgeSpec -> hologram changes`

At this point record a backup demo video. This alone is already meaningful WebMCP evidence.

## Wave 4 — Collaborative build

Connect B BuildPlan to existing placement authority/lookahead.

Required result:

`human + UR10 build same plan -> human moves source brick -> queue repairs`

Record another backup video.

## Wave 5 — Train TEST

Merge D.

Required result:

`incomplete route -> train falls`  
`complete route -> train crosses`

Record another backup video.

## Wave 6 — Mission/result

Merge E.

Required result:

`CROSSED -> MISSION COMPLETE -> stats -> TRY AGAIN`

## Wave 7 — Public/release

F finalises public-safe repo and live deployment.

## Wave 8 — Freeze

G runs final reliability and native WebMCP evidence.

After freeze, no new features unless they fix a demonstrated blocker.

---

# 16. What the user can do in parallel outside coding

These tasks can run while agents implement A-E.

1. **Terrain asset:** finalise only the existing terrain GLB/materials. Do not create a new room.
2. **Bridge assets:** provide the latest custom arch meshes and latest working bridge-generator demo/source to the bridge workstream.
3. **Train assets:** provide final locomotive + two carriage meshes as one known assembled layout. Do not engineer robot grasping.
4. **Visual identity:** choose one clean ROBO BRIDGE logo/title treatment and remove third-party branding.
5. **Palette:** choose 2-4 fixed bridge palettes; no paint system.
6. **IP audit:** confirm rights for gripper, terrain, train, textures, robot visual, and any audio.
7. **Hosting:** prepare the deployment account/domain now.
8. **Devpost:** create/save the draft submission now; do not wait for final video.
9. **Video:** draft a 2:30-2:50 script now.
10. **Demo prompts:** prepare exact natural-language prompts and backup wording.
11. **Screenshots:** prepare one clean hero screenshot after each merge milestone.
12. **Submission copy:** explain audience as robotics/STEM/maker collaborative design, not only a toy bridge game.

---

# 17. Strict P0 must-have list

A top-10-calibre attempt needs these before optional polish:

1. MAIN_DEMO still works.
2. Curated terrain loads.
3. EASY preset works.
4. One hero bridge family works completely; Aqueduct is preferred.
5. Second family Viaduct works if it does not threaten #4.
6. Codex can create/change bridge parameters through real WebMCP.
7. Exact real BuildPlan drives hologram.
8. Human can build the same plan.
9. UR10/Codex can build the same plan.
10. Five-placement lookahead remains active.
11. Human can take a planned source brick and automatic reassignment works.
12. Build speed can be changed without breaking reliability.
13. Pre-assembled train is on/reset to ENTRY.
14. Incomplete route produces visible train failure.
15. Complete route produces train crossing.
16. MISSION COMPLETE fires on EXIT.
17. Human/Codex contribution stats are correct.
18. TRY AGAIN/reset works.
19. Native WebMCP works on hosted app.
20. Public repo, cleared assets, licence, README, provenance, and <3-minute video are ready.

If time collapses, prioritise one perfect EASY + Aqueduct path over two unreliable bridge modes.

---

# 18. P1 only after P0 works repeatedly

Ranked by judge value versus effort:

1. One generic Codex wall BuildPlan demonstration.
2. One allow-listed generic scene-setting tool.
3. Fixed bridge palette control through Codex.
4. Visible short UR10 push to start the pre-assembled train.
5. CHALLENGING + Viaduct if EASY is already reliable.
6. Richer mission statistics.
7. LEGO/toy-brick construction skill document.
8. Better camera framing and modest lighting polish.

Do not do P1 until the full P0 loop has passed three consecutive times.

---

# 19. P2 / post-submission

- interior room/sofas;
- custom HDRI;
- camera pickup + ImageGen photo workflow;
- individual brick painting;
- robot train loading/coupling;
- train self-righting robotics;
- procedural terrain;
- terrain voxelisation;
- full structural solver/collapse integration;
- arbitrary bridge catalogue;
- suspension/cables;
- roads/cars;
- general arbitrary-object building UX;
- general motion planning.

---

# 20. Submission demo sequence — target under 3 minutes

Target video length: approximately 2:30-2:50.

## 0:00-0:15 — premise

Show terrain, human, UR10, bridge gap.

State that human and Codex design and build in one shared WebMCP world.

## 0:15-0:40 — conversational design

> Make a Roman aqueduct...

Hologram appears.

> Change the top arches to eight...

Hologram visibly updates.

## 0:40-1:25 — co-build

Human builds one region.

Codex/UR10 builds another.

Deliberately take a brick Codex planned to use.

Show automatic source reassignment and continued robot build.

> Build faster.

## 1:25-1:45 — early TEST

> Test the bridge.

Train runs and falls at missing support.

## 1:45-2:20 — finish + retest

Complete enough remaining placements quickly.

TEST again.

Train crosses.

## 2:20-2:35 — result

MISSION COMPLETE + human/Codex stats.

## 2:35-2:50 — WebMCP proof

Briefly show or state:

- native `document.modelContext.registerTool`;
- shared authoritative revisions;
- no hidden instant-build shortcut;
- agent adapts to real human state changes.

Do not spend video time on sofas, ImageGen, train assembly, or many settings.

---

# 21. Main risks and locked fallbacks

## Aqueduct source not yet in repo

Fallback:

- immediately import the latest working generator;
- if only Viaduct is stable, use Viaduct as the hero family;
- one reliable family is better than two incomplete families.

## Terrain collision causes trouble

Fallback:

- use visual terrain plus simple conservative collision boxes/planes;
- do not voxelise.

## Bridge adapter takes too long

Fallback:

- adapt the latest generator's direct BuildPlan JSON output;
- do not force it through every older prototype layer.

## Human cannot manually complete custom arch pieces

Fallback:

- make arch pieces robot/system-target placements while human builds standard rectangular sections;
- preserve one accepted board state.

## Train dynamics unstable

Fallback:

- analytic/kinematic guidance while supported;
- dynamic Rapier only when support is lost.

## Train push is unreliable

Fallback:

- TEST starts train velocity directly;
- keep the train visibly present at ENTRY.

## Too many bricks / demo too slow

Fallback:

- reduce EASY span;
- reduce arch count;
- use larger/custom parts;
- accelerate playback only to a tested stable level;
- do not try to build the full dramatic CHALLENGING bridge live.

## Public IP uncertainty

Fallback:

- remove/replace uncertain asset before public release;
- do not make a private-history asset public until rights are confirmed.

## Hosted WebMCP fails

Fallback:

- treat hosted native WebMCP testing as P0, not final-day polish;
- verify secure-context requirements and exact deployment before recording final video.

---

# 22. Final acceptance gate

The submission is ready when this passes repeatedly on the hosted build:

1. App loads without console-breaking errors.
2. WebMCP tools register natively.
3. Curated EASY challenge is visible.
4. ENTRY/EXIT are correct.
5. Codex creates a bridge design.
6. Exact hologram appears.
7. Codex changes one parameter and hologram changes.
8. Build starts.
9. Human places a valid bridge part.
10. UR10 places a valid bridge part.
11. Human takes a source brick from the lookahead.
12. Source reassigns automatically.
13. Robot continues.
14. Early TEST runs.
15. Train fails visibly on incomplete support.
16. Train resets at ENTRY.
17. Bridge is completed enough for route support.
18. TEST runs again.
19. Train reaches EXIT.
20. MISSION COMPLETE appears.
21. Stats are correct.
22. TRY AGAIN produces clean state.
23. The complete sequence works three consecutive times minimum.
24. Public repo and live URL match what the video claims.
25. Final video is under three minutes and contains audio.

---

# 23. Final principle

**Do not optimise for feature count. Optimise for one undeniable WebMCP collaboration story.**

**Codex decides. Deterministic systems execute. The human can interfere. The system adapts. The train proves the result.**
