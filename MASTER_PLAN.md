# ROBO BRIDGE MCP — V3 Master Plan

## 1. Product identity

The project is now **ROBO BRIDGE MCP**.

ROBO BRIDGE MCP is a browser-based collaborative bridge-building game and robot simulation. The human, Codex and a UR10 robot design and build a bridge together, then test it with a train or road vehicle.

The core loop is:

`challenge -> co-design -> hologram -> build together -> TEST -> fail/succeed -> diagnose -> repair -> TEST again`

The bridge must be both:

- **structural** — it must carry the vehicle;
- **aesthetic** — the user can ask for a style such as Roman aqueduct, beam, truss or suspension.

The main challenge is deliberately narrower than the old LOGO ROBO vision. Bridges give a clear objective, simpler geometry, deterministic validation, visible physics failure and a strong human + AI co-design loop.

Logos, houses and general mesh-to-brick construction are no longer V3 priorities. Existing logo/build demos may remain as regression examples, but they must not drive the architecture.

---

## 2. V3 objective

Build one complete browser demo where:

1. procedural terrain creates a river, ravine or gap;
2. an ENTRY and EXIT are generated on opposite sides;
3. a railway path defines the required crossing;
4. Codex and/or the player create a bridge design;
5. the design appears as a live hologram;
6. the design compiles into the existing robot-buildable brick plan;
7. the player and UR10 build it in one shared world;
8. every build action supports fast undo/redo;
9. TEST Mode moves the robot clear and starts the train;
10. the train crosses, derails, falls or causes structural failure;
11. Codex can use the failure result to modify the design;
12. the bridge can be repaired and tested again.

This complete loop is more important than adding many bridge families, vehicle meshes or realistic engineering simulation.

---

## 3. Preserve the proven systems

V3 must merge and reuse the systems that already work. Do not rewrite them without evidence that replacement is required.

Known working foundations include:

- UR10 visual/runtime;
- animated gripper;
- reliable gripper rotation and brick pickup/placement logic;
- BuildPlan/build-plan execution;
- hologram preview;
- shared human/agent construction concepts;
- player environment and intuitive manual brick placement controls.

V3 should make these parts operate through one application and one authoritative state.

### Single-authority rule

The existing runtime safety principle remains mandatory:

`RevisionClock -> BuildBoard + RobotController -> Runtime -> Perception/WebMCP + Renderer`

There must not be a second accepted robot state, board state or hidden playback state.

The visual robot renders accepted `RobotController` state. The build hologram renders the current design/build state. Physics may animate failure, but it must not silently become a second construction authority.

See `FULL_REMEDIATION_PLAN_5_6_PRO.md` for the existing runtime and fail-closed safety foundation. Preserve those principles unless later evidence deliberately supersedes them.

---

## 4. One shared world model

All actors must use the same canonical world state:

- human;
- Codex/WebMCP;
- UR10;
- bridge generator;
- BuildPlan compiler;
- hologram renderer;
- terrain system;
- Test Mode;
- structural solver;
- train/vehicle physics.

A player placement and a robot placement must pass through the same placement/state API.

The design representation and the live construction state remain separate until a plan is approved.

### Design plane

`Challenge + User/Codex intent`

`-> BridgeSpec`

`-> 2D structural design`

`-> 3D bridge volume / path clearance`

`-> brick packing + supports + build order`

`-> BuildPlan`

`-> hologram + validation`

### Execution plane

`Approved BuildPlan`

`-> BuildBoard`

`-> player + RobotController`

`-> completed physical bridge state`

`-> TEST snapshot`

`-> structural evaluation + vehicle physics`

---

## 5. Procedural challenge and terrain

V3 terrain should be intentionally simple and cheap.

Use a height-field mesh generated from noise plus smoothing. Perlin/Simplex-style noise is sufficient. It does not need geological realism.

### Challenge generator

Generate:

- terrain seed;
- river/ravine centre line;
- obstacle width;
- bank heights;
- ENTRY zone;
- EXIT zone;
- required railway/road direction;
- buildable/supportable terrain regions.

For V3, keep the crossing path approximately straight and perpendicular to the river/ravine. This reduces bridge generation to a controllable 2D problem while the world remains 3D.

### River/ravine generator

Use a mostly straight centre line with low-frequency noise and smoothing. Create the obstacle by modifying the height field around that line.

Modes:

- river — depressed channel plus water surface;
- ravine — deeper channel without water;
- gap — simple test terrain.

Terrain collision can use a simplified collision mesh or height-field representation. Robot path planning only needs enough terrain awareness to prevent obvious clipping.

---

## 6. ENTRY, EXIT and transport corridor

The challenge owns a canonical route from ENTRY to EXIT.

For railway mode, the route contains:

- track centre line;
- rail/deck width;
- vehicle clearance envelope;
- approach zones on both banks.

The bridge generator must preserve this transport corridor.

When a 2D bridge design is extruded into 3D, remove or reserve a central cuboid clearance region so the train or road vehicle can pass through the structure.

The clearance width should be parameterised as a proportion of total bridge width. Example:

- bridge width: 10 brick units;
- route clearance: 70%;
- structural side zones: remaining 30% split between both sides.

Do not make structural side walls wider than required merely because the bridge itself is wide.

---

## 7. BridgeSpec and bridge generation

Codex should modify a high-level **BridgeSpec**, not invent machine coordinates or thousands of brick placements directly.

Example BridgeSpec fields:

- bridge family;
- span;
- deck height;
- total width;
- transport clearance width;
- pier count/spacing;
- truss height;
- arch count/radius;
- tower height;
- cable sag;
- hanger spacing;
- brick density/detail;
- palette/material style;
- train or road mode;
- target load class.

The bridge generator should be mainly **2D**.

Pipeline:

`terrain cross-section + route + BridgeSpec -> feasible 2D structure -> validation -> 3D extrusion -> path clearance -> brick compiler -> BuildPlan`

This is a major V3 simplification. Most bridge reasoning happens in the elevation plane. Width is added afterwards.

---

## 8. Parameterised bridge families

Do not ask Codex to invent arbitrary bridge geometry from scratch. Store deterministic bridge families and let Codex select and tune parameters.

V3 priority order:

1. beam bridge;
2. pier/trestle bridge;
3. Roman arch / aqueduct;
4. Pratt-style truss;
5. Howe-style truss;
6. suspension bridge.

Each family needs:

- parameter schema;
- deterministic 2D generator;
- basic feasibility limits;
- support points;
- load-path hints;
- visual/style parameters;
- extrusion rules;
- brick conversion rules.

Codex language should map to these parameters.

Examples:

- “Make it more Roman.” -> larger/cleaner arches, repeated piers, stronger symmetry.
- “Use fewer bricks.” -> lower density, larger legal bricks, wider structural spacing where safe.
- “Make the truss taller.” -> increase truss height while preserving route clearance.
- “Add another support in the river.” -> change pier count/positions and regenerate.

Codex remains the co-designer. Deterministic code remains the geometric and structural compiler.

---

## 9. Brick catalogue

Use a small robot-compatible catalogue first.

Priority:

- 2x4;
- 2x2;
- 1x4;
- 1x2;
- optional 1x1 for local filling;
- long structural beams up to approximately **80 x 2 studs** where useful for fast bridge construction;
- railway deck/track component;
- later road/deck component.

Long beams are important because a bridge made only from short bricks creates excessive placement count and makes long spans impractical.

Every part definition must contain:

- dimensions/grid footprint;
- allowed orientation;
- support/contact information;
- collision bounds;
- gripper capture information where robot-placeable;
- structural properties used by the simplified solver.

The compiler should prefer larger legal parts when they reduce build time without creating obviously poor structure.

---

## 10. Fast structural model

Do **not** run engineering-grade finite-element simulation continuously.

V3 needs a fast, deterministic structural approximation that gives believable results.

Represent the built bridge as a lightweight structural graph.

Each structural element/brick stores data such as:

- ID;
- position/orientation;
- neighbours/connections;
- support path;
- span from nearest effective support;
- local capacity;
- current test load;
- structural role;
- failure state.

### Construction rule

**The bridge never collapses while it is being built.**

During BUILD Mode, all placed parts remain fixed regardless of temporary support state. Structural calculations may update predictions and warnings, but they must not destroy the structure.

### Load approximation

Use simple beam/cantilever principles and tuned game coefficients.

For unsupported horizontal structure, capacity should reduce strongly with distance from support. A bending-style relationship such as load capacity scaling approximately with inverse span squared/cubed may be used where it produces intuitive behaviour.

Example concept:

A T-shaped structure has a strong vertical column. Horizontal parts near the column have high effective capacity. Parts farther from the column have progressively lower effective capacity.

Exact physical accuracy is not the objective. The behaviour must be:

- deterministic;
- fast;
- visually believable;
- easy for Codex and users to understand;
- tunable.

### Incremental updates

After one brick is placed or removed, update only the affected support/connectivity region where practical. Do not recompute expensive global simulation every frame.

---

## 11. TEST Mode

TEST Mode is a core feature, not polish.

The player can test a complete or incomplete bridge.

Sequence:

1. freeze construction edits;
2. move/park the robot outside the test corridor;
3. create a test snapshot of the built structure;
4. evaluate support graph and load capacity;
5. identify weak/overloaded elements;
6. enable destructive/failure physics for the required elements;
7. spawn or release the train/vehicle;
8. apply moving loads as the vehicle crosses;
9. allow derailment, falling and bridge failure;
10. record a structured failure/success result;
11. restore BUILD controls for repair.

Possible outcomes:

- successful crossing;
- excessive deformation warning;
- local structural failure;
- progressive collapse;
- track failure;
- derailment;
- train/vehicle falling into the river/ravine.

The fast structural solver decides **where failure should occur**. The physics system makes that failure visible and entertaining.

Expensive destructive physics should be active mainly in TEST Mode, not during normal building.

---

## 12. Train V1

Start with simple articulated cuboids. Visual train meshes can replace them later without changing the simulation API.

Basic structure:

`locomotive -> joint -> carriage -> joint -> carriage`

Required behaviour:

- gravity;
- articulated cars;
- forward drive;
- track following/guide constraint;
- collision;
- derailment;
- falling;
- response to missing or failed track/deck sections.

The train must be able to drive onto an unfinished bridge and fall. Do not fake success/failure with a prerecorded animation.

Use a simplified rail guide if full wheel/rail contact is unnecessarily expensive. The result only needs to look and behave convincingly.

---

## 13. Road mode

Train mode is V3 priority.

The architecture should allow later road mode with:

- road/deck components;
- block-car placeholders;
- trucks with higher load class;
- route clearance envelope;
- vehicle falling/collision behaviour.

Road vehicles can initially use simple cuboids and constrained steering/path following.

Do not let road mode delay the first complete train loop.

---

## 14. Suspension bridge wire system

Wires/cables are their own lightweight system.

### Build interaction

The user can:

1. select one anchor point;
2. select another anchor point;
3. create a cable between them;
4. add vertical hangers;
5. connect cable segments to bricks or other cable nodes where allowed.

### BUILD Mode

Use a non-destructive analytic cable representation. An analytic catenary or tuned sag curve is preferred over full continuous cable physics.

Inputs include:

- endpoints;
- sag;
- segment count;
- hanger spacing.

This gives immediate, cheap visual feedback.

### TEST Mode

Use a lightweight segmented constraint/particle representation only if needed for visible movement.

By default, cables do **not** break. Cable breaking may be enabled in settings later.

Cable forces can still transfer approximate load to towers/anchors so a bad suspension design can fail at its brick supports even when the wire itself remains intact.

---

## 15. Undo/redo is mandatory

All meaningful BUILD operations must use a command/history system.

Examples:

- place brick;
- remove brick;
- robot placement completion;
- player placement;
- cable creation/removal;
- BridgeSpec design change where practical;
- approved-plan changes.

Undo/redo must avoid cloning the complete world for every step.

Prefer compact reversible operations/deltas and deterministic state restoration.

The user must be able to recover quickly from manual mistakes, robot actions and experimental bridge changes.

---

## 16. Robot collision avoidance

Do not build a general robotics motion planner for V3.

Use the existing reliable placement motion and add only the collision checks required for the bridge environment.

Priority hazards:

- terrain;
- completed bridge volume;
- train/track corridor during TEST;
- obvious static scene obstacles.

A simple safe-height / approach / descend strategy plus bounding-volume checks is sufficient if it prevents visible clipping.

Robot motion must stop or reject the action when a required safe path cannot be found.

---

## 17. Hologram and co-design

The hologram is the main communication surface between user and Codex.

It must show the exact current bridge design that will compile into the BuildPlan.

Useful states:

- proposed structure;
- approved plan;
- completed parts;
- remaining parts;
- next available placements;
- weak predicted regions;
- supports;
- cables;
- route/clearance envelope.

Target interaction:

1. User: “Build a Roman aqueduct across this ravine.”
2. Codex creates a BridgeSpec.
3. deterministic generator creates the 2D structure;
4. compiler creates the 3D/brick plan;
5. hologram updates;
6. user: “Make the arches taller and use fewer bricks.”
7. Codex changes parameters;
8. plan regenerates and validates;
9. user approves;
10. user + robot build;
11. user presses TEST;
12. train crosses or fails;
13. Codex receives structured failure data and proposes a repair.

---

## 18. BuildPlan contract

All approved physical bridge construction must still compile into one stable BuildPlan format.

For new V3 work, use ROBO BRIDGE terminology in documentation and new schemas. Do not silently break existing working runtime consumers solely to rename a legacy schema string.

BuildPlan must continue to contain stable placement IDs, part type, colour/material, local grid coordinates, orientation, support/dependency data and deterministic plan metadata.

Machine coordinates are never the authoritative design format. The workcell adapter converts local plan coordinates to machine coordinates and validates reachability.

---

## 19. WebMCP/Codex boundary

Codex should have high-level design tools and primitive physical tools, but must not bypass the simulation state.

Conceptual design tools:

- inspect challenge;
- inspect terrain/profile;
- create/update BridgeSpec;
- compile/validate preview;
- inspect structural warnings;
- inspect TEST result.

Physical execution stays primitive through the existing accepted robot/build interfaces.

Do not create a hidden `win_bridge`, `execute_whole_bridge` or prerecorded playback tool.

The competition proof must show that Codex is reading live state and changing a real design/build plan.

---

## 20. Performance strategy

ROBO BRIDGE MCP must remain browser-first and local-first. Do not require paid server compute for simulation.

Performance principles:

- instanced rendering for repeated bricks;
- object pooling for train parts, debris and effects;
- low-poly collision proxies;
- sleeping physics bodies;
- structural graph updates on state changes, not every render frame;
- destructive physics mainly during TEST;
- analytic cables during BUILD;
- simple train guide constraints instead of expensive detailed wheel simulation where needed;
- terrain LOD or modest fixed terrain resolution;
- workers/Web Workers for CPU-heavy generation where useful;
- WebGPU compute only where measurement shows a real benefit;
- avoid GPU/CPU synchronisation stalls;
- profile before adding complexity.

Target a very smooth interactive render on a capable desktop. The render loop must not be coupled to bridge structural calculations.

---

## 21. Parallel V3 workstreams

The work should now split into parallel tasks with stable interfaces.

### A — Unified application integration

Owns:

- one V3 HTML/application shell;
- UR10 + gripper integration;
- player controls;
- BuildBoard/BuildPlan integration;
- hologram integration;
- shared state and command history;
- undo/redo.

Acceptance:

- player and robot can both place into one shared plan/world;
- no duplicate authority;
- hologram and occupancy stay synchronised;
- undo/redo works for core placement actions.

### B — Procedural terrain/challenge

Owns:

- noise height field;
- river/ravine/gap generation;
- ENTRY/EXIT generation;
- route profile;
- terrain collision proxy;
- deterministic challenge seed.

Acceptance:

- repeated seeds reproduce the same challenge;
- ENTRY/EXIT are valid and connected by a clear bridge corridor;
- terrain is cheap to render and query.

### C — Train and railway

Owns:

- track/deck representation;
- articulated cuboid train;
- drive/path guide;
- derailment/fall physics;
- later mesh replacement boundary.

Acceptance:

- train crosses a valid flat test bridge;
- train falls from missing track/deck;
- articulated cars remain stable enough for gameplay.

### D — Structural solver + TEST Mode

Owns:

- structural graph;
- support propagation;
- capacity/load approximation;
- moving train load interface;
- weak-element selection;
- TEST state machine;
- failure report.

Acceptance:

- supported span survives a tuned test;
- long unsupported span fails before a short one;
- bridge does not break during BUILD;
- TEST generates deterministic weak points for the same state.

### E — Bridge generator/compiler

Owns:

- BridgeSpec;
- 2D generators;
- beam/pier/arch/truss families;
- 3D extrusion;
- path clearance subtraction/reservation;
- BuildPlan conversion.

Acceptance:

- at least three bridge families generate valid previews from the same terrain input;
- width and route clearance are parameterised;
- output is robot-buildable through the existing plan pipeline.

### F — Suspension/cable system

Owns:

- cable anchors;
- analytic catenary/sag curve;
- hangers;
- cable-to-brick nodes;
- optional TEST motion/load transfer.

Acceptance:

- click/select two anchors to create a cable;
- vertical hangers generate deterministically;
- cable remains cheap in BUILD Mode;
- default cable cannot break.

### G — Performance and merge validation

Owns:

- frame profiling;
- draw-call reduction;
- instancing/pooling;
- physics activation/sleep policy;
- regression tests;
- visual inspection after integration.

Acceptance:

- no structural simulation tied to every render frame;
- TEST physics can be started/stopped cleanly;
- core build controls remain responsive with a practical bridge scene;
- merged V3 preserves the reliable robot/gripper placement behaviour.

---

## 22. Integration contracts between workstreams

Parallel work must converge on small shared contracts.

### `ChallengeState`

Contains:

- seed;
- terrain query/profile;
- river/ravine data;
- ENTRY;
- EXIT;
- transport corridor;
- mode: rail/road.

### `BridgeSpec`

High-level editable design parameters.

### `BridgeDesign2D`

Deterministic structural elevation plus semantic elements such as piers, deck, truss members, arches, towers and cables.

### `BuildPlan`

Immutable physical brick placement plan consumed by the current execution architecture.

### `StructureSnapshot`

Read-only built bridge state passed to TEST evaluation.

### `TestResult`

Contains:

- success/failure;
- failing element IDs;
- overload/capacity data;
- derailment/fall state;
- useful structured explanation for Codex.

Teams/agents should develop against these contracts rather than reaching into each other’s internal state.

---

## 23. V3 completion line

The first complete ROBO BRIDGE MCP V3 draft is done when this exact loop works in one browser demo:

**Random terrain appears -> ENTRY/EXIT and railway are generated -> Codex/player generates a feasible bridge -> hologram appears -> plan compiles -> human + UR10 place bricks -> actions can be undone -> TEST starts -> articulated train drives onto the real built state -> bridge/train can physically fail -> structured failure information is produced -> user/Codex repairs the design/build -> TEST can run again.**

A simple bridge with simple block graphics that completes this entire loop is more valuable than a beautiful but disconnected collection of subsystems.

---

## 24. V3 priority order

If time is limited, work in this order:

1. merge the proven UR10/gripper/player/BuildPlan/hologram systems;
2. add command-based undo/redo;
3. generate terrain + river/ravine + ENTRY/EXIT;
4. add straight railway + articulated block train;
5. make missing bridge sections cause real train failure;
6. add the simplified structural solver and destructive TEST Mode;
7. add beam/pier/arch bridge generation;
8. connect BridgeSpec changes to Codex and hologram regeneration;
9. add truss families;
10. add suspension cables;
11. optimise/profile the merged world;
12. replace placeholder vehicle/track graphics only after the loop is stable.

## V3 principle

**Human and Codex design the bridge together. Human and robot build it together. The train proves whether it works.**
