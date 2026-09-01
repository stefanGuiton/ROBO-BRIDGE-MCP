# ROBO BRIDGE MCP — Submission Master Plan

**Status:** Final submission sprint  
**Date:** 2026-09-01  
**Submission target:** Submission-ready demonstration by 2026-09-02  
**Project:** ROBO BRIDGE MCP  
**Canonical runtime:** `MAIN_DEMO` Player V8  
**Main vehicle:** Train  
**Main rule:** Preserve the proven build systems. Integrate only what is required for the complete hero demonstration.

---

# 0. Authority and priority

This file is the current authoritative execution plan for the submission sprint.

The previous broad V3 roadmap remains available in Git history. Where that older roadmap conflicts with this file, **this submission plan wins**.

The priority is not to integrate every V3 prototype.

The priority is to make this exact loop reliable:

`CURATED TERRAIN -> BRIDGE DESIGN -> HOLOGRAM -> HUMAN + CODEX + UR10 BUILD -> TRAIN TEST -> SUCCESS/FAILURE -> MISSION COMPLETE`

A short complete demonstration is more valuable than a large set of disconnected features.

---

# 1. Demonstration north star

ROBO BRIDGE MCP is a browser-based collaborative building game.

The human and Codex design a bridge together. The human and a simulated UR10 build it together. A train then proves whether the bridge works.

The demonstration must make Codex visibly useful without making Codex perform repetitive low-level motion planning.

Use this division:

**Codex = intent, design, planning, decisions and live control.**

**Deterministic runtime = exact geometry, source-brick allocation, motion execution, snapping, validation, physics and statistics.**

The demonstration must prove that Codex is not only triggering a prerecorded animation.

---

# 2. Proven foundation — preserve it

`MAIN_DEMO` is the canonical root application.

It already provides the main systems required for the submission:

- polished Player V8 table/workbench;
- good lighting and materials;
- desktop/mobile player movement;
- intuitive player brick pickup and placement;
- brick rotation and snapping;
- MORE BRICKS supply;
- UR10 visual/runtime;
- animated real-gripper model;
- reliable robot brick pickup and placement;
- one authoritative `RevisionClock`;
- one authoritative `BuildBoard`;
- one authoritative robot controller;
- shared player/robot world state;
- WebMCP primitive robot control;
- browser camera/perception tools;
- deterministic placement validation;
- revision-safe state changes;
- short placement lookahead;
- dynamic replacement of a source brick if the human takes the brick that Codex intended to use.

Do not replace these systems during the final sprint.

Use adapters at integration boundaries.

The repository safety rule remains mandatory:

`RevisionClock -> BuildBoard + RobotController -> Runtime -> Perception/WebMCP + Renderer`

Do not create a second robot authority, board authority, physics truth or hidden build state.

This repository remains simulation-only. Do not connect it to physical robotics hardware.

---

# 3. What has changed from the older V3 plan

The submission path is now deliberately smaller.

## 3.1 Procedural terrain is not on the submission critical path

Do not integrate the procedural terrain generator for the hero demonstration.

Do not voxelise the terrain.

Do not rebuild the terrain system.

Use the curated two-mountain/valley 3D asset supplied for the demonstration.

The existing procedural terrain prototype can remain in `PROTOTYPES/01_Terrain_Challenge/` as research and future work.

## 3.2 Only two bridge families are required

The submission bridge selector uses:

1. **Roman Aqueduct**
2. **Viaduct**

Do not restore the large bridge-family catalogue before submission.

A future Custom mode can use the same generic plan pipeline.

## 3.3 Full structural-solver integration is not required before the hero loop works

The standalone structural solver remains useful future work.

For submission, an incomplete rail support path causing the train to fall is enough to prove a meaningful TEST loop.

Integrate advanced structural collapse only after the complete hero path is reliable.

---

# 4. Curated terrain strategy

Use one curated 3D terrain asset with two mountains/banks and a valley between them.

The terrain is part of `MAIN_DEMO`.

It must have deterministic placement, scale and bridge anchor locations.

## 4.1 EASY preset

Purpose:

- short build;
- low terrain;
- fast live demonstration;
- best match for the Roman Aqueduct.

Use approximately `0.3-0.4` of the full vertical terrain scale, subject to visual acceptance.

Reduce the effective crossing width so the bridge requires fewer parts.

This is the default submission mode.

## 4.2 CHALLENGING preset

Purpose:

- full visual mountain height;
- deeper valley;
- taller bridge;
- best match for the Viaduct.

Use full or near-full terrain height.

This is the secondary hero mode after EASY passes.

## 4.3 ENTRY and EXIT

Each preset owns deterministic ENTRY and EXIT transforms.

They define:

- bridge start;
- bridge end;
- track start/end alignment;
- bridge generator span;
- train route.

Use simple visible markers in design/debug mode.

Do not require runtime terrain analysis to find these points for submission.

---

# 5. Bridge design system

The bridge system must remain parametric and deterministic.

The expected pipeline is:

`natural language -> BridgeSpec -> deterministic bridge generator -> brick placements -> BuildPlan -> hologram`

Codex changes design intent and parameters.

Deterministic code calculates exact bridge geometry and placements.

## 5.1 Roman Aqueduct

Use for lower/shorter crossings.

Required controls include the tested generator parameters, including where applicable:

- tier count;
- top arch count;
- middle arch count;
- bottom arch count;
- arch dimensions;
- pier dimensions;
- deck dimensions;
- bridge height;
- colour/material family.

Use tested defaults when the user does not give a value.

## 5.2 Viaduct

Use for taller/deeper crossings.

Required controls include:

- arch count;
- arch dimensions;
- pier height/width;
- deck dimensions;
- bridge height;
- colour/material family.

Use tested defaults when the user does not give a value.

## 5.3 Fixed bridge width

Keep the submission bridge width constrained.

Do not allow arbitrary bridge width to increase build time or collision risk.

## 5.4 Custom arch pieces

Keep the custom clean arch components.

Use them to reduce placement count and improve the appearance of the bridge.

Rectangular bricks can form:

- piers;
- courses;
- spandrels;
- deck support;
- top structure.

## 5.5 BuildPlan

The generator must produce one generic ordered BuildPlan.

Each placement must contain enough information for the existing runtime to know:

- placement ID;
- part type;
- colour/material;
- target transform/grid position;
- orientation;
- dependencies/build order;
- optional structural group/member ID.

The bridge generator must not execute robot motion directly.

The existing MAIN_DEMO build path remains the execution authority.

---

# 6. Hologram and conversational co-design

The hologram is the main bridge-design feedback surface.

It must come from the same BuildPlan that can be approved for construction.

Do not render a fake artistic preview that differs from the real plan.

Example interaction:

> Codex, make this a Roman aqueduct with ten arches at the top, six in the middle and three at the bottom.

Codex updates BridgeSpec.

The deterministic generator recompiles the bridge.

The hologram updates.

The user can then say:

> Change the top to eight arches and the bottom to four.

Or:

> Make it taller.

Or:

> Use fewer bricks.

Or:

> Actually, change it to a viaduct.

Only the requested parameters change. Unspecified values retain valid defaults.

No construction starts until the current plan is accepted.

---

# 7. Codex / WebMCP strategy

The impressive part is not the number of MCP tools.

The impressive part is the visible chain:

`natural language -> Codex decision -> live state change -> generated plan -> robot action -> human interference -> automatic adaptation -> TEST -> success/failure`

## 7.1 Do not create MCP tool bloat

Do not expose one MCP tool for every UI slider.

Use a small composable control surface.

Recommended logical groups:

### Scene

- inspect scene;
- inspect settings;
- update an allow-listed setting;
- inspect inventory;
- inspect build state;
- inspect robot state.

A generic setting tool can support requests such as:

> Make the table 20% wider.

> Increase the background brightness by 10%.

The setting path must be allow-listed and validated.

### Design

- get current BridgeSpec;
- set/update BridgeSpec;
- validate design;
- compile/update preview;
- inspect current BuildPlan;
- submit a validated custom BuildPlan.

### Construction

- start/pause collaborative construction;
- control build speed;
- reserve/claim build targets where needed;
- keep the existing primitive move/latch/unlatch path available for direct proof.

### TEST

- prepare/reset train;
- start TEST;
- inspect TEST state/result;
- reset challenge.

## 7.2 Codex must not perform repetitive Cartesian reasoning

Codex should not spend one reasoning cycle calculating every millimetre of every pick-and-place action.

Codex chooses **what** to build.

The deterministic runtime decides **how** to execute the repeated placements safely and quickly.

## 7.3 Keep primitive control visible

The generic planner does not replace the existing primitive WebMCP tools.

The repository must still show that Codex can inspect real state and drive the UR10 through the accepted primitive controller path.

This is important evidence that the robot action is genuine application control.

---

# 8. Small autonomous-build proof

Before the bridge hero sequence, use one short example to prove that Codex can create structures that are not the bridge preset.

The wall is the preferred submission proof because it is short and easy to read visually.

## 8.1 Single brick

Possible opening proof:

> Codex, place a red brick on the table.

Codex selects a legal target and a suitable available red brick.

The generic executor performs the placement.

## 8.2 Wall

User:

> Codex, build a small wall.

Codex creates a small BuildPlan.

Example bonded pattern:

- layer 1: four bricks;
- layer 2: three offset bricks;
- layer 3: four bricks;
- layer 4: three offset bricks.

The exact dimensions can change with the request.

The important requirement is that the plan enters the same generic validation and execution path as other custom plans.

## 8.3 Tower

Secondary example:

> Codex, build a tower.

Codex can create an alternating/interlocking plan with courses rotated by 90 degrees.

Do not make the tower a submission blocker if the wall already proves the generic planner.

---

# 9. Anti-scripting requirement

Reviewers may inspect the repository.

The implementation must make it clear that Codex is controlling real data and generic systems.

Do not add hidden replay functions such as:

- `buildWallDemo()` with fixed transforms;
- `buildTowerDemo()` with fixed transforms;
- `playAqueductDemo()`;
- `instantBuildBridge()`;
- `fakeTrainSuccess()`.

The correct architecture is:

`request -> Codex plan/parameters -> strict schema validation -> generic BuildPlan/BridgeSpec -> generic executor -> accepted runtime state`

Deterministic generation is allowed and preferred.

A deterministic generator is not a prerecorded demonstration if Codex controls its valid input parameters and the generated output is real application state.

For authenticity evidence, log at least:

- request/intent category where available;
- design revision;
- BuildPlan checksum/ID;
- actor for each accepted brick placement;
- source-brick reassignment events;
- TEST start/result;
- world revision.

---

# 10. Collaborative build execution

Human and Codex/UR10 must build the same plan and the same accepted world.

## 10.1 Human

The human can:

- move around;
- pick bricks up;
- rotate them;
- snap them into legal targets;
- add more bricks;
- work on any valid available section.

## 10.2 Codex/UR10

Codex chooses a useful unbuilt region.

The runtime then streams upcoming placements to the robot.

Use the existing short lookahead, approximately five placements where appropriate.

Each upcoming item contains:

- target placement;
- required part type/colour;
- current source-brick assignment.

## 10.3 Build away from the human

Prefer an unbuilt region away from recent player construction activity.

A simple spatial rule is sufficient for submission:

**prefer the legal unbuilt region farthest from the player's active build area.**

This reduces interference and makes collaboration easy to understand visually.

Do not implement a general multi-agent task scheduler before submission.

## 10.4 Dynamic source-brick reassignment

Do not permanently bind a target to one physical source brick.

For each upcoming target:

1. determine the required part type/colour;
2. rank suitable available source bricks;
3. assign one source brick;
4. invalidate the assignment if the human takes that brick;
5. select the next valid source brick automatically.

Codex must not need to replan the whole structure because one source brick moved.

---

# 11. Robot build speed control

Natural-language speed changes are a useful MCP demonstration.

Examples:

> Build a bit faster.

> Go much faster.

> Slow down.

> Use maximum demo speed.

Map vague language onto a small deterministic set of speed profiles.

Suggested intent mapping:

| Intent | Relative profile |
|---|---:|
| Slow | 0.5x |
| Normal | 1.0x |
| Faster | 1.5x |
| Very fast | 2.0x |
| Maximum | capped tested demo maximum |

The final maximum is set by reliability testing.

Aim for about a one-second complete pick/place cycle at the fastest profile if the current motion system can do this reliably.

Do not sacrifice reliability only to hit this number.

---

# 12. Railway and train

The objective is to move a train from ENTRY to EXIT.

The railway must visibly sit above the bridge deck.

It must not be buried inside bridge geometry.

The railway can be generated as part of the challenge/bridge route. It does not need to be built brick-by-brick for submission.

## 12.1 Train composition

Use three train elements:

1. locomotive/steam engine;
2. carriage 1;
3. carriage 2.

When placed in the valid starting track zones, adjacent train elements automatically couple.

## 12.2 Codex train setup

Preferred visual sequence:

1. UR10 places the locomotive;
2. UR10 places carriage 1;
3. UR10 places carriage 2;
4. the pieces automatically couple;
5. the UR10 moves behind the rear train;
6. the UR10 performs a short visual push, about 50 mm;
7. the train simulation receives its start trigger/velocity.

The push does not require calibrated contact dynamics.

The robot action is a visual start trigger. The train simulation becomes autonomous after release.

## 12.3 Fast fallback

If robot placement of all train pieces threatens reliability, use this fallback:

- reset/spawn the assembled train on the start track;
- let the UR10 perform only the visible starting push.

The bridge TEST is more important than robot train assembly.

## 12.4 Supported route

If rail support is valid, the train follows the route and can reach EXIT.

## 12.5 Missing route support

If the bridge/track is incomplete, the train loses support and becomes dynamic.

It can:

- derail;
- fall;
- collide with bridge pieces;
- collide with terrain.

A fully calibrated wheel/rail simulation is not required.

## 12.6 Recovery

After a failed test, make train pieces easy to reuse.

Allowed gameplay recovery methods include:

- automatic self-right after settling;
- known pickup pose after failure;
- deterministic reset to start.

Do not spend submission time on realistic overturned-train recovery.

---

# 13. TEST through natural language

The TEST action must accept broad natural language intent through Codex.

Examples:

> Test the bridge.

> Try the train.

> See if it works.

> Run the train across it.

> Test what we have built.

These all map to the same validated TEST operation.

TEST can run before the bridge is complete.

This is important because an early failed test proves that success is not a prerecorded animation.

---

# 14. Mission Complete

When the complete train reaches EXIT, show a large:

# MISSION COMPLETE

Then show collaboration statistics.

At minimum record:

- total session/build time;
- total bricks placed;
- player bricks placed;
- Codex bricks placed;
- player percentage;
- Codex percentage;
- average player placement interval;
- average Codex placement interval;
- train tests attempted;
- successful train tests.

Useful optional metrics:

- bridge family;
- design revisions;
- arch counts;
- source-brick reassignments;
- fastest placement;
- failed tests before success.

---

# 15. Event log

Use simple append-only session events.

Recommended event types:

```text
session_started
challenge_selected
design_generated
design_changed
build_started
brick_placed_player
brick_placed_codex
source_brick_reassigned
build_speed_changed
train_test_started
train_failed
train_crossed
mission_complete
session_reset
```

Each event should contain:

- monotonic timestamp or elapsed session time;
- actor (`player`, `codex`, `system`);
- current world revision where relevant;
- relevant placement/design/test IDs;
- small metadata object where needed.

Calculate final statistics from the event log.

Do not create a separate statistics truth that can disagree with accepted placement events.

---

# 16. TRY AGAIN and reset

MISSION COMPLETE exposes **TRY AGAIN**.

Reset must return the application to a known deterministic start state.

Reset:

- bridge design;
- placed bridge pieces;
- hologram;
- train;
- robot;
- reservations/lookahead;
- TEST state;
- statistics/event session;
- challenge preset state as required.

The user can then select another preset or make another custom design.

---

# 17. General custom building

The architecture must not artificially limit Codex to the two bridge families.

Support this generic future path:

`user idea -> Codex creates BuildPlan -> validation -> hologram -> construction`

Example:

> Build a small boat.

Codex can design a legal plan, preview it and iterate with the user.

This general path does not need extensive submission polish.

The wall example is enough to prove that the executor is generic.

---

# 18. LEGO construction skill

Add a project skill/instruction file for Codex building knowledge.

Suggested location/name:

`skills/lego-building/SKILL.md`

or another repository-local equivalent that fits the runtime/tooling architecture.

It should define:

- available part types;
- dimensions;
- stud spacing;
- layer height;
- coordinate system;
- supported orientations;
- valid connections;
- support rules;
- collision rules;
- bonding/overlap rules;
- practical build-size limits;
- wall example;
- tower example;
- BuildPlan schema;
- validation procedure;
- how to avoid creating inaccessible placements.

This is Codex's construction handbook, not a library of prerecorded finished structures.

---

# 19. Final submission user flow

Keep the visible UI small.

Minimum challenge controls:

- EASY;
- CHALLENGING;
- AQUEDUCT;
- VIADUCT;
- GENERATE/UPDATE;
- BUILD;
- TEST;
- RESET / TRY AGAIN.

Detailed bridge parameters can remain in Settings and be controllable through Codex.

The preferred complete flow is:

1. Start `MAIN_DEMO`.
2. Show one direct Codex scene-setting change.
3. Optionally ask Codex to build a small wall.
4. Load/select the curated terrain challenge.
5. Select EASY by default.
6. Ask Codex for an Aqueduct or Viaduct.
7. Show the generated hologram.
8. Change one or more bridge parameters through natural language.
9. Accept the design.
10. Human starts one region.
11. Codex/UR10 starts a distant region.
12. Change robot build speed through natural language.
13. Run an early TEST if useful.
14. Incomplete bridge causes a visible train failure.
15. Continue building.
16. Run TEST again.
17. Train reaches EXIT.
18. Show MISSION COMPLETE and collaboration statistics.
19. TRY AGAIN resets the application.

---

# 20. Suggested submission demonstration sequence

Use a short sequence that proves progressively more intelligence.

## Part A — Direct MCP control

Example:

> Make the table 20% wider.

Then:

> Increase the background brightness by 10%.

This proves that Codex controls live application state.

Keep this section short.

## Part B — Generic autonomous build

Example:

> Build a small wall.

Codex creates a generic BuildPlan and the UR10 builds it.

This proves that the system is not only a bridge playback tool.

## Part C — Conversational bridge design

Example:

> Make a Roman aqueduct with ten arches at the top, six in the middle and three at the bottom.

Hologram appears.

Then:

> Change the top to eight and the bottom to four.

Hologram updates.

Then optionally:

> Change it to a viaduct and use fewer bricks.

This is the strongest co-design moment.

## Part D — Collaborative build

Example:

> Great. Let's build it. I will work on this side.

Codex chooses a distant valid build region.

Human and UR10 build at the same time.

Then:

> Build faster.

The runtime changes the robot speed profile.

## Part E — Early failure

Example:

> Test it.

The train runs before the bridge is ready and falls at missing support.

This proves the TEST result is live.

## Part F — Final success

Finish the bridge.

Run TEST again.

The train crosses.

Show MISSION COMPLETE and statistics.

---

# 21. Submission P0 — must work

Do these before optional features.

## P0.1 Terrain integration

- import curated terrain into `MAIN_DEMO`;
- correct scale and position;
- good material/lighting integration;
- player collision as required;
- stable UR10/table relationship.

## P0.2 Challenge presets

- EASY;
- CHALLENGING;
- deterministic ENTRY/EXIT;
- deterministic track route;
- bounded bridge dimensions.

## P0.3 Two bridge families

- Roman Aqueduct;
- Viaduct;
- tested defaults;
- fixed practical width;
- custom arch pieces;
- deterministic BuildPlan output.

## P0.4 MAIN_DEMO bridge adapter

Connect generated local bridge coordinates to the canonical live machine/world frame.

No duplicate board or controller.

## P0.5 Hologram

The exact generated BuildPlan appears as a preview.

Design changes update it reliably.

## P0.6 MCP bridge design control

Codex can:

- select family;
- change arch/tier parameters;
- change supported bridge dimensions;
- request fewer/more parts within bounded limits;
- regenerate the real hologram.

## P0.7 Collaborative build

- human placement works unchanged;
- UR10 placement works unchanged;
- source-brick reassignment works;
- short lookahead works;
- Codex can select a build region away from the player.

## P0.8 Train route and TEST

- visible track above deck;
- train resets at ENTRY;
- train crosses a complete supported route;
- train falls on missing support;
- TEST can be started through Codex.

## P0.9 Mission result

- EXIT triggers MISSION COMPLETE;
- basic collaboration statistics appear;
- TRY AGAIN/reset works.

## P0.10 Reliability

Run the complete EASY hero path repeatedly before adding more scope.

Freeze feature work after the hero path is reliable.

Only fix demonstrated blockers after the freeze.

---

# 22. Submission P1 — valuable after P0

Implement only after the complete P0 loop works.

- generic scene-setting MCP tool;
- small wall autonomous-build proof;
- tower autonomous-build proof;
- robot train-piece placement;
- visible robot push start;
- richer train collision/derail presentation;
- automatic train self-right;
- richer mission statistics;
- project LEGO building skill;
- Custom BuildPlan import/preview UX;
- more robust Codex work-area allocation.

The wall proof and scene-setting MCP tool are especially valuable if they can be added without risking the hero path.

---

# 23. Post-submission / P2

Do not allow these items to block the submission:

- procedural terrain integration;
- terrain voxelisation;
- automatic arbitrary terrain analysis;
- full structural solver integration;
- progressive brick/member collapse;
- advanced debris physics;
- full truss catalogue;
- suspension bridges;
- cable systems;
- roads/cars/trucks;
- general optimal brick packing;
- full robot task-and-motion planning;
- engineering-grade train/rail contact;
- physical robot control.

The existing standalone prototypes remain useful references for this later work.

---

# 24. Acceptance gates

## Gate A — MAIN_DEMO preserved

Pass when:

- player movement still works;
- human brick building still works;
- MORE BRICKS still works;
- UR10 pickup/placement still works;
- existing WebMCP primitive tools still work;
- no duplicate world authority exists.

## Gate B — Curated challenge

Pass when:

- terrain loads every time;
- EASY/CHALLENGING are deterministic;
- ENTRY/EXIT and track align correctly;
- bridge corridor is visually clear.

## Gate C — Conversational bridge design

Pass when:

- Codex can create an Aqueduct;
- Codex can create a Viaduct;
- natural-language parameter changes update BridgeSpec;
- the same BuildPlan drives hologram and construction.

## Gate D — Collaborative BUILD

Pass when:

- human and UR10 build one accepted plan;
- source-brick replacement handles human interference;
- Codex can work away from the player;
- speed changes do not break placement reliability.

## Gate E — TEST

Pass when:

- train can run at any build stage;
- missing support creates a visible failure;
- complete route reaches EXIT;
- TEST is not a fake success trigger.

## Gate F — Mission flow

Pass when:

- MISSION COMPLETE is correct;
- stats match accepted events;
- TRY AGAIN gives a clean deterministic reset.

---

# 25. Definition of done for tomorrow's submission

The application is submission-ready when this sequence works repeatedly:

1. Launch `MAIN_DEMO`.
2. Curated terrain loads correctly.
3. Select EASY.
4. Ask Codex for a Roman Aqueduct.
5. Correct hologram appears between ENTRY and EXIT.
6. Ask Codex to change one bridge parameter.
7. Correct hologram updates.
8. Start BUILD.
9. Human places valid bridge parts.
10. Codex/UR10 places valid bridge parts.
11. Human can take a source brick without breaking Codex's build stream.
12. Codex can change build speed.
13. TEST can run before completion and produce a real visible failure.
14. Construction can continue/reset after the failed test as required by the submission flow.
15. Complete bridge supports the route.
16. TEST runs again.
17. Train reaches EXIT.
18. MISSION COMPLETE appears.
19. Player/Codex brick counts and timing statistics are correct.
20. TRY AGAIN restores a clean state.

After this passes, repeat the same acceptance with CHALLENGING + Viaduct if time permits.

---

# 26. Authenticity checks for repository review

The repository must make the real agent boundary easy to inspect.

Reviewers should be able to see:

- `MAIN_DEMO` is the one canonical world;
- WebMCP reads accepted live state;
- mutating calls respect world revisions;
- Codex controls BridgeSpec or generic BuildPlan data;
- generators are deterministic but not hidden playback;
- the same generated plan drives the hologram and build executor;
- player and Codex placements enter the same accepted board;
- source-brick reassignment reacts to real inventory state;
- early TEST can fail;
- successful TEST depends on valid route support;
- statistics come from accepted events.

Do not claim a capability that is only represented by a prerecorded video or fixed hidden placement list.

---

# 27. Main risks and fast fallbacks

## Risk: Curated terrain creates integration/collision problems

Fallback:

- simplify collision mesh;
- use conservative fixed collision regions;
- keep bridge zone and player/robot work zone simple.

Do not return to procedural terrain during the sprint.

## Risk: Bridge generator integration becomes brittle

Fallback:

- preserve the deterministic generator as a self-contained module;
- adapt its JSON BuildPlan output into MAIN_DEMO;
- do not rewrite the bridge maths inside the runtime.

## Risk: Tall Viaduct build is too slow or risky

Fallback:

- use EASY + Aqueduct as the official hero demonstration;
- keep CHALLENGING + Viaduct as optional evidence.

## Risk: Too many bricks make the demo too long

Fallback:

- constrain bridge dimensions;
- use larger legal pieces/custom arch pieces;
- reduce preset arch counts;
- cap Custom values;
- use the fastest tested robot profile.

## Risk: Robot train assembly is unreliable

Fallback:

- reset the assembled train directly on the start track;
- keep the robot push as the visible TEST start.

## Risk: Dynamic train guidance is unstable

Fallback:

- guide train deterministically while support exists;
- switch to dynamic physics when support disappears.

## Risk: Full structural failure takes too long

Fallback:

- use route-support state as the TEST condition;
- unsupported route releases the train and causes the visible failure.

## Risk: MCP setting surface becomes too large

Fallback:

- one generic allow-listed `set_setting(path, value)` style interface;
- expose only useful settings for submission.

## Risk: Custom building becomes a distraction

Fallback:

- prove generic planning with one wall;
- keep boat/other arbitrary builds as documented future capability.

---

# 28. Final development rules

1. **Do not replace working MAIN_DEMO systems.**
2. **Do not integrate every prototype because it exists.**
3. **Do not add a second state authority.**
4. **Do not let Codex calculate repetitive low-level motion.**
5. **Do let Codex make visible design and planning decisions.**
6. **Do not fake build or TEST outcomes.**
7. **Use deterministic generators for reliability.**
8. **Use generic BuildPlan execution for extensibility.**
9. **Keep the hero bridge small enough to finish live.**
10. **Make EASY + Aqueduct reliable before expanding scope.**
11. **Test failure before success to prove the simulation is live.**
12. **Freeze new features once the complete hero loop passes.**
13. **Keep simulation-only safety boundaries.**
14. **Run tests read-only by default.**
15. **Optimise for a clear, inspectable MCP story.**

---

# 29. Final architecture summary

```text
CURATED TERRAIN ASSET
        |
        v
EASY / CHALLENGING PRESET
        |
        v
ENTRY + EXIT + TRACK CORRIDOR
        |
        v
USER VOICE / CODEX
        |
        v
BRIDGE SPEC
AQUEDUCT / VIADUCT
        |
        v
DETERMINISTIC BRIDGE GENERATOR
        |
        v
GENERIC BUILDPLAN
        |
        +--------------------+
        |                    |
        v                    v
   HOLOGRAM             EVENT / DESIGN LOG
        |
        v
MAIN_DEMO SHARED BUILD WORLD
        |
        +-------------------------------+
        |                               |
        v                               v
     HUMAN                         CODEX / UR10
manual brick building         plan + short lookahead
        |                               |
        +---------------+---------------+
                        |
                        v
                 ONE BUILD BOARD
                        |
                        v
                      TEST
                        |
              +---------+---------+
              |                   |
              v                   v
       MISSING SUPPORT       COMPLETE ROUTE
              |                   |
              v                   v
       TRAIN FALLS/FAILS     TRAIN REACHES EXIT
                                  |
                                  v
                           MISSION COMPLETE
                                  |
                                  v
                              STATISTICS
                                  |
                                  v
                               TRY AGAIN
```

## Submission principle

**Codex decides. Deterministic systems execute. The human can interfere. The runtime adapts. The train proves the result.**
