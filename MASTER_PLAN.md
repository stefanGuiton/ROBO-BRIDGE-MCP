# ROBO BRIDGE MCP — V3 Master Plan

**Status:** Active V3 architecture and execution plan  
**Project name:** ROBO BRIDGE MCP  
**Primary target:** Browser-first, local-first collaborative bridge building  
**Main vehicle for V3:** Train  
**Main rule:** Reuse the proven robot/build systems. Build the missing bridge game around them.

---

# Current foundation checkpoint — MAIN_DEMO Player V8

`MAIN_DEMO` is now the canonical root browser/player runtime. The supplied Player V8 behavior is integrated through adapters into the existing authoritative `RevisionClock -> BuildBoard + RobotController -> Runtime` chain; it is not an iframe or a second world.

This checkpoint supplies desktop/mobile navigation, held-brick interaction, L/M/R connectors, BUILD/TEST locking, fixed-step updates, batching, ACES/LUT support, the exact V8 workbench/material/lighting scene, all 231 supplied settings, live robot mount controls, and the existing UR10/real-gripper/WebMCP surface. The one canonical machine frame is mounted on the V8 table; no second robot or brick truth was introduced. Bridge terrain, generator, brick compiler, structural solver, and train remain separate verified prototypes until their contracts are deliberately connected to this root runtime.

See `docs/MAIN_DEMO_V8_INTEGRATION.md` for the implementation and acceptance boundary.

---

# 0. V3 north star

ROBO BRIDGE MCP is a browser-based bridge-building game where the **human, Codex and a simulated UR10 robot design and build a bridge together**.

The world generates a bridge problem. The user and Codex solve it. The user and robot build it. A train then proves whether it works.

The core loop is:

`GENERATE -> DESIGN -> HOLOGRAM -> BUILD TOGETHER -> TEST -> FAIL/SUCCEED -> DIAGNOSE -> REPAIR -> TEST AGAIN`

The product must make two questions fun:

1. **Will the bridge work?**
2. **Can we make it look better?**

The bridge is therefore both structural and aesthetic.

A simple complete loop is more valuable than a large collection of disconnected systems.

---

# 1. Locked V3 product decisions

These decisions are the default unless measured evidence requires a change.

## 1.1 Project direction

The project is now **ROBO BRIDGE MCP**.

Logos, houses and general mesh-to-brick construction are not V3 priorities. Existing prototypes can remain as regression references, but they must not drive the new architecture.

## 1.2 Main gameplay

V3 starts with trains.

A challenge generates:

- procedural terrain;
- a river, ravine or gap;
- an ENTRY point;
- an EXIT point;
- a required rail corridor between them;
- buildable terrain/support regions.

The user and Codex then create a bridge that connects the route.

## 1.3 Build rule

**Bridges do not collapse during BUILD Mode.**

All placed parts stay fixed while the bridge is being built. Structural checks can show warnings, but they cannot destroy the bridge.

## 1.4 Test rule

Failure is enabled in **TEST Mode**.

The player may test a complete or incomplete bridge.

The train can:

- cross successfully;
- derail;
- fall;
- lose support;
- trigger local bridge failure;
- trigger progressive bridge failure.

## 1.5 Physics rule

Do not simulate every brick continuously.

Use this architecture:

`deterministic structural solver -> choose failing members -> Rapier activates visible failure physics`

The structural solver decides **what fails**. The rigid-body system decides **how the failed pieces move**.

## 1.6 Design rule

Codex controls a constrained **BridgeSpec**.

Codex must not generate thousands of raw brick transforms or arbitrary machine coordinates.

The expected flow is:

`natural language -> BridgeSpec -> deterministic 2D bridge graph -> 3D bridge -> brick plan -> validation -> hologram`

## 1.7 Performance rule

The render loop must not depend on bridge solving, bridge generation or brick packing.

Expensive work runs on state changes, in TEST setup, or in a Worker when needed.

## 1.8 Local-first rule

Core generation, bridge solving, train physics and failure simulation must run in the browser.

Do not require continuous cloud compute or paid simulation APIs.

---

# 2. Proven systems that V3 must preserve

The following systems are already working and are **inputs to V3**, not research projects to replace.

- UR10 visual/runtime.
- Animated gripper.
- Reliable brick pickup.
- Reliable brick placement.
- Gripper orientation logic.
- Working brick placement algorithm.
- BuildPlan V1.
- Hologram preview.
- Player-controlled build environment.
- Intuitive player brick placement controls.

## 2.1 Integration rule

V3 agents must wrap and integrate these systems before they consider rewriting them.

If an existing system needs an adapter, add an adapter.

If a V3 module needs different data, transform the data at the boundary.

Do not fork a second robot controller, a second accepted brick board, or a second hidden build state.

## 2.2 Single-authority rule

The existing runtime safety principle remains mandatory:

`RevisionClock -> BuildBoard + RobotController -> Runtime -> Perception/WebMCP + Renderer`

There must be one accepted robot state and one accepted construction state.

Physics may create temporary visual bodies during TEST Mode. Those bodies do not become a second construction authority.

The deterministic V3 state decides which bridge elements are intact, failed, removed, planned or placed.

See `FULL_REMEDIATION_PLAN_5_6_PRO.md` for the existing runtime and fail-closed safety foundation.

---

# 3. V3 completion gate

The first complete V3 draft is done when this exact loop works in one browser application:

1. A seed generates terrain.
2. A river, ravine or gap separates two banks.
3. ENTRY and EXIT are valid.
4. A rail corridor connects them.
5. A bridge design is generated from a BridgeSpec.
6. A hologram shows the exact proposed bridge.
7. The bridge compiles into the existing build-plan system.
8. The user can place bridge parts.
9. The UR10 can place bridge parts.
10. Both use the same accepted world state.
11. Undo and redo work.
12. The user can press TEST at any point.
13. The robot leaves the test corridor.
14. A train drives towards and onto the bridge.
15. A valid bridge can support the train.
16. An incomplete or weak bridge can fail.
17. Lost rail support can cause a real derailment or fall.
18. TEST produces a structured result.
19. The failed bridge returns to a repairable BUILD state.
20. The user/Codex can repair it.
21. The train can test it again.

**This loop is the V3 definition of done.**

Suspension bridges, roads, advanced truss analysis and polished vehicle meshes improve V3, but they must not block this loop.

---

# 4. Explicit V3 non-goals

Do not spend V3 time on the following unless a later acceptance test proves they are required.

- Full civil-engineering finite-element analysis.
- Engineering certification or real-world safety prediction.
- Continuous rigid-body simulation of every brick during BUILD.
- A physics constraint for every brick contact.
- Exact wheel flange versus rail contact.
- Detailed locomotive mechanics.
- Hydraulic terrain erosion.
- General mesh CSG for vehicle clearance.
- Full robot task-and-motion planning.
- General-purpose 3D geometry invented directly by Codex.
- Cloud structural simulation.
- WebGPU compute without a measured need.
- Road mode before train mode works end to end.
- High-detail train meshes before placeholder train physics works.
- Breakable suspension wires before tower/anchor failure works.

V3 is a **game simulation with deterministic structural rules**, not an engineering package.

---

# 5. Locked technical stack

## 5.1 Renderer

Use the existing **Three.js** application.

Start with the existing WebGL path.

`WebGPURenderer` may be tested later, but V3 does not depend on it.

Use:

- `InstancedMesh` for repeated equal geometry;
- `BatchedMesh` where repeated geometry varies;
- low-cost materials for repeated bricks;
- shared geometry and material objects.

## 5.2 Rigid-body physics

Use **Rapier 3D WASM** as the V3 physics engine.

Primary uses:

- train rigid bodies;
- train couplers/joints;
- gravity;
- collision;
- derailment;
- failed bridge pieces;
- debris;
- spatial queries where useful;
- sleeping bodies;
- CCD only where required.

Repository: `https://github.com/dimforge/rapier`  
Licence: Apache-2.0.

Do not ship a second physics engine unless a measured Rapier failure makes it necessary.

JoltPhysics.js is a benchmark/fallback, not a parallel runtime dependency.

## 5.3 Terrain noise

Use **simplex-noise.js** or an equivalent very small deterministic noise implementation.

Repository: `https://github.com/jwagner/simplex-noise.js`  
Licence: MIT.

## 5.4 Optional static mesh acceleration

Use `three-mesh-bvh` only if primitive/Rapier scene queries become insufficient.

Repository: `https://github.com/gkjohnson/three-mesh-bvh`  
Licence: MIT.

Do not add it by default just because it exists.

## 5.5 Structural solver

Write a small custom TypeScript solver.

Start with plain TypeScript and typed arrays.

Move it to a Web Worker if profiling shows visible UI stalls.

Use WASM only if the Worker implementation is still too slow.

## 5.6 Research-only references

The following projects can inform algorithms, but must not become core dependencies without licence and architecture review:

- BrickGPT: buildability and rollback concepts.
- Stabileo: browser stiffness-method reference; AGPL-3.0, study only.
- greedy-mesher: rectangle merging concept.
- BridgeSimulator: structural-game concepts; no clear licence, study only.
- three.js-train: arc-length carriage concepts; no clear licence, study only.

Do not copy source from repositories with no licence.

---

# 6. V3 system architecture

V3 is divided into nine logical layers.

```text
USER / CODEX
    |
    v
[1] CHALLENGE
    terrain + ENTRY/EXIT + corridor
    |
    v
[2] DESIGN
    BridgeSpec
    |
    v
[3] GENERATOR
    deterministic BridgeGraph2D
    |
    v
[4] COMPILER
    3D extrusion + clearance + brick packing
    |
    v
[5] BUILD PLAN / HOLOGRAM
    existing BuildPlan + preview
    |
    v
[6] BUILD EXECUTION
    player + UR10 + shared BuildBoard
    |
    v
[7] STRUCTURAL TEST MODEL
    StructureSnapshot + StructuralGraph
    |
    v
[8] TEST PHYSICS
    train + selective collapse
    |
    v
[9] RESULT / REPAIR
    TestResult + failure delta + next design/build action
```

Each layer must have a small public contract.

Parallel agents may change internal code inside their layer. They must not reach into another layer's private state.

---

# 7. Application state machine

Use one explicit V3 state machine.

Recommended states:

```text
BOOT
  -> CHALLENGE_READY
  -> DESIGN
  -> PREVIEW
  -> BUILD
  -> TEST_PREP
  -> TEST_RUNNING
  -> TEST_RESULT
  -> REPAIR
  -> BUILD
```

## 7.1 `BOOT`

Allowed work:

- load Three.js scene;
- load robot;
- load gripper;
- initialise physics;
- initialise state store;
- initialise dependencies.

No challenge actions are accepted until required systems are ready.

## 7.2 `CHALLENGE_READY`

The terrain, ENTRY, EXIT and transport corridor exist.

The user can regenerate the challenge or continue to DESIGN.

## 7.3 `DESIGN`

The user and Codex change BridgeSpec parameters.

Changes regenerate the preview.

No real construction state changes.

## 7.4 `PREVIEW`

The current deterministic bridge graph has compiled into a valid candidate BuildPlan.

The hologram shows the candidate.

The user can:

- approve;
- change parameters;
- regenerate;
- inspect warnings.

## 7.5 `BUILD`

The approved plan is active.

The player and robot can place/remove allowed components.

The bridge cannot collapse.

Undo and redo are enabled.

Structural warnings may update after changes.

## 7.6 `TEST_PREP`

Construction input locks.

The robot moves to a safe parked pose.

A StructureSnapshot is created.

The rail support map is compiled.

The train resets to the start state.

Dynamic failure bodies are prepared or retrieved from pools.

## 7.7 `TEST_RUNNING`

The train moves.

The structural solver receives moving load events.

Failed structural members are marked deterministically.

Rapier displays the related collapse.

Build edits remain locked.

## 7.8 `TEST_RESULT`

The test stops when one of these conditions is reached:

- train reaches EXIT;
- locomotive falls below the fail plane;
- train is immobile beyond a configured limit;
- critical route support is lost;
- the test is stopped manually.

A TestResult is created.

## 7.9 `REPAIR`

The deterministic damage list is applied to the canonical build state as one transaction.

Visual debris is disposable.

The user/Codex can inspect the failure and repair or redesign.

The state then returns to BUILD.

---

# 8. Shared V3 contracts

These are logical TypeScript contracts. Existing working schemas must be adapted rather than silently broken.

All IDs must be stable for the lifetime of a challenge.

## 8.1 Common types

```ts
type EntityId = number;
type PlacementId = number;
type MemberId = number;
type NodeId = number;
type CableId = number;
type RailSegmentId = number;

type Vec2 = { x: number; y: number };
type Vec3 = { x: number; y: number; z: number };
```

Use integer IDs internally where practical. Avoid using random strings as hot-path lookup keys.

## 8.2 `ChallengeState`

```ts
type ChallengeState = {
  version: 3;
  seed: number;
  mode: "rail" | "road";
  terrain: TerrainSpec;
  entry: RouteAnchor;
  exit: RouteAnchor;
  corridor: TransportCorridor;
  supportRegions: SupportRegion[];
};
```

## 8.3 `TerrainSpec`

```ts
type TerrainSpec = {
  seed: number;
  width: number;
  depth: number;
  gridX: number;
  gridZ: number;
  heightScale: number;
  obstacle: {
    type: "river" | "ravine" | "gap";
    width: number;
    depth: number;
    noiseAmplitude: number;
    noiseFrequency: number;
  };
};
```

The runtime terrain object may also hold the generated `Float32Array` height field and query helpers.

## 8.4 `RouteAnchor`

```ts
type RouteAnchor = {
  position: Vec3;
  forward: Vec3;
  platformWidth: number;
  platformLength: number;
};
```

## 8.5 `TransportCorridor`

```ts
type TransportCorridor = {
  centreline: Vec3[];
  deckWidth: number;
  vehicleClearWidth: number;
  vehicleClearHeight: number;
  mode: "rail-single" | "rail-double" | "road";
};
```

The corridor is authoritative for vehicle clearance.

Bridge geometry must route around it.

## 8.6 `BridgeSpec`

```ts
type BridgeFamily =
  | "beam"
  | "trestle"
  | "arch"
  | "aqueduct"
  | "pratt"
  | "howe"
  | "warren"
  | "box"
  | "suspension"
  | "cableStayed";

type BridgeSpec = {
  version: 3;
  family: BridgeFamily;
  seed: number;
  span: number;
  deckHeight: number;
  deckWidth: number;
  vehicleClearWidth: number;
  targetLoadClass: number;

  panelCount?: number;
  trussHeightRatio?: number;

  pier?: {
    count?: number;
    spacing?: number;
    width?: number;
    brace: "none" | "x";
  };

  arch?: {
    count?: number;
    shape: "circle" | "parabola";
    riseRatio?: number;
    thicknessStuds: number;
  };

  tower?: {
    heightRatio: number;
    positions?: number[];
  };

  cable?: {
    sagRatio: number;
    hangerEveryPanels: number;
    layout: "main" | "fan" | "harp";
  };

  deck: {
    mode: "rail-single" | "rail-double" | "road";
    thicknessLayers: number;
  };

  brick: {
    allowed: string[];
    maxBeamStuds: number;
    sideThicknessStuds: number;
  };

  style: {
    symmetry: boolean;
    crossBracing: boolean;
    density: number;
    paletteId?: string;
  };
};
```

Codex can change BridgeSpec values. Deterministic code calculates exact geometry.

## 8.7 `BridgeGraph2D`

```ts
type BridgeNode2D = {
  id: NodeId;
  position: Vec2;
  role: "support" | "deck" | "pier" | "tower" | "joint" | "anchor";
  supportType?: "fixed" | "terrain" | "none";
};

type BridgeMember2D = {
  id: MemberId;
  a: NodeId;
  b: NodeId;
  role: "beam" | "chord" | "diagonal" | "vertical" | "pier" | "arch" | "deck";
  memberClass: string;
  capacityClass: number;
};

type BridgeGraph2D = {
  nodes: BridgeNode2D[];
  members: BridgeMember2D[];
  cables: CableDesign[];
  metadata: {
    family: BridgeFamily;
    span: number;
    designRevision: number;
  };
};
```

## 8.8 `CableDesign`

```ts
type CableDesign = {
  id: CableId;
  anchorA: Vec3;
  anchorB: Vec3;
  sag: number;
  hangerTargets: Vec3[];
  breakable: boolean;
  structuralRole: "main" | "stay" | "hanger" | "decorative";
};
```

Default `breakable` is `false` in V3.

## 8.9 Part catalogue

Every V3 part definition must expose enough data for render, build, robot and structure systems.

```ts
type PartDefinition = {
  partType: string;
  studWidth: number;
  studLength: number;
  layerHeight: number;
  allowedRotations: number[];
  collisionBounds: Vec3;
  robotPlaceable: boolean;
  gripperProfile?: string;
  structuralClass: string;
};
```

Initial catalogue:

- 2x4;
- 2x2;
- 1x4;
- 1x2;
- optional 1x1;
- long 2-stud-wide structural beams up to about 80 studs;
- railway/deck component.

Road components can follow later.

## 8.10 `BuildPlan`

The existing BuildPlan V1 remains the physical construction contract.

Do not rename or break working consumers only for V3 terminology.

V3 generation must compile into the existing required fields, including stable placement IDs, part type, colour/material, grid position, orientation and dependency/support information.

Add V3 metadata only through backward-compatible extension fields or an adapter.

## 8.11 `BuildElementState`

Recommended logical states:

```text
PLANNED
AVAILABLE
RESERVED_PLAYER
RESERVED_ROBOT
PLACING
PLACED
VERIFIED
FAILED
REMOVED
```

Only one actor may reserve one placement at a time.

## 8.12 `StructuralGraph`

The structural graph is coarser than the visual brick list.

```ts
type StructuralNode = {
  id: NodeId;
  position: Vec2;
  supportType: "fixed" | "terrain" | "none";
};

type StructuralMember = {
  id: MemberId;
  a: NodeId;
  b: NodeId;
  type: "truss" | "beam" | "pier" | "arch" | "deck" | "cable";
  capacity: number;
  demand: number;
  utilisation: number;
  brickIds: PlacementId[];
  failed: boolean;
};

type StructuralGraph = {
  nodes: StructuralNode[];
  members: StructuralMember[];
};
```

A structural member can map to many bricks.

## 8.13 `StructureSnapshot`

A TEST snapshot must be immutable.

It contains:

- placed bridge elements;
- structural graph;
- support state;
- rail-support mappings;
- cable state;
- test revision;
- target load class.

Do not allow player or robot edits to modify it while TEST runs.

## 8.14 `TestResult`

```ts
type TestResult = {
  testId: number;
  success: boolean;
  outcome:
    | "CROSSED"
    | "DERAILED"
    | "TRAIN_FELL"
    | "BRIDGE_FAILED"
    | "ROUTE_LOST"
    | "STOPPED";
  failedMemberIds: MemberId[];
  failedPlacementIds: PlacementId[];
  maxUtilisation: number;
  firstFailure?: {
    memberId: MemberId;
    reason: string;
    trainProgress: number;
  };
  diagnostics: TestDiagnostic[];
};
```

This result is the main feedback object for Codex.

---

# 9. Procedural terrain and challenge generator

The terrain system must be simple, deterministic and cheap to query.

## 9.1 Height field

Store one height field in a `Float32Array`.

Recommended flow:

```text
seed
-> low-cost simplex noise
-> optional broad shape noise
-> analytic ravine/river channel
-> local smoothing near banks
-> height array
-> Three.js terrain mesh
```

The same height field must serve:

- rendering;
- terrain height queries;
- ENTRY/EXIT generation;
- support validation;
- robot safe-height checks;
- approximate terrain collision.

Do not maintain a second terrain representation unless required by Rapier TEST collision.

## 9.2 Base terrain

Use 2–4 cheap noise octaves at most.

The base terrain should be low-frequency enough that bridges remain readable.

Avoid small noisy bumps that create unnecessary robot and rail problems.

## 9.3 Ravine/river centre line

Use a mostly straight path with small low-frequency variation.

Concept:

```text
centre(x) = baseCentre + noiseAmplitude * noise(x / frequency)
```

For each terrain sample, find the lateral distance `d` from the centre line.

Create the channel with a smooth function such as:

```text
channelDepth = -D * exp(-(d / W)^2)
```

Then:

```text
height = baseTerrain + channelDepth
```

This gives direct control over:

- obstacle depth;
- obstacle width;
- bank slope;
- crossing difficulty.

## 9.4 River mode

River mode adds a simple horizontal or gently varying water surface inside the channel.

Water physics is not required.

The train and bridge only need collision with terrain/bridge, not fluid simulation.

## 9.5 Ravine mode

Ravine mode uses the same terrain channel without water.

Make deeper sides possible than river mode.

## 9.6 Gap mode

Gap mode is a deterministic test fixture.

Use flat banks with a clean rectangular or smooth gap.

This is important for integration and structural tests because it removes terrain noise from debugging.

## 9.7 ENTRY and EXIT generation

ENTRY and EXIT should sit on opposite sides of the obstacle.

For V3, the route should be close to perpendicular to the river/ravine.

Recommended method:

1. Choose a crossing centre on the obstacle line.
2. Calculate the local obstacle tangent.
3. Calculate its normal.
4. Walk along the normal in each direction.
5. Find stable bank positions with acceptable slope.
6. Flatten small approach pads if required.
7. Store those pads as supportable zones.

The result must be deterministic for a seed.

## 9.8 Terrain query API

Terrain agents must expose at least:

```ts
getHeightAt(x: number, z: number): number
getSlopeAt(x: number, z: number): number
isSupportable(x: number, z: number): boolean
getTerrainBounds(): Bounds
```

Keep these functions independent from Three.js mesh internals.

## 9.9 Terrain acceptance tests

- Same seed produces the same height field checksum.
- Same seed produces the same ENTRY and EXIT.
- ENTRY and EXIT do not sit inside the ravine.
- ENTRY and EXIT slopes are below the configured limit.
- Straight line from ENTRY to EXIT crosses the obstacle.
- Height query matches rendered mesh samples within tolerance.
- Regeneration does not leak old terrain meshes or physics colliders.

---

# 10. Transport corridor, railway and clearance

The route is a separate first-class object.

Do not infer the train path from bridge bricks after the bridge is built.

## 10.1 Rail centre line

V3 uses a simple centre line between ENTRY and EXIT.

The first version can be straight.

Later terrain modes can use short approach curves while the bridge crossing itself stays straight.

## 10.2 Rail geometry

For centreline point `P(s)` and horizontal normal `N(s)`:

```text
leftRail  = P(s) - N(s) * gauge/2
rightRail = P(s) + N(s) * gauge/2
```

Sleepers can be placed at fixed arc-length intervals.

Use instancing for rails/sleepers where possible.

## 10.3 Rail support map

Each rail/deck segment must know what bridge structure supports it.

```ts
type RailSupportSegment = {
  id: RailSegmentId;
  startS: number;
  endS: number;
  supportMemberIds: MemberId[];
  supportPlacementIds: PlacementId[];
  supported: boolean;
};
```

This map is how bridge failure releases the train from its rail guide.

## 10.4 Clearance envelope

The transport corridor owns a central clearance volume.

Example:

- bridge width: 10 brick units;
- vehicle clear width: 7 units;
- structural side zones: remaining 3 units.

Do not use a general mesh Boolean operation.

Use an occupancy mask during 3D/brick generation.

Any structural cell inside the vehicle clearance mask is rejected unless it is part of the deck/track system.

## 10.5 Double track

The architecture must allow double track.

Do not make double track mandatory for the first end-to-end V3 test.

Use two centreline offsets inside one wider transport corridor.

---

# 11. Bridge generation architecture

Bridge generation is one of the main V3 systems.

It must be deterministic and easy for Codex to control.

## 11.1 Core rule: generate in 2D first

Most structural geometry is generated in elevation space.

```text
ChallengeState + BridgeSpec
-> BridgeGraph2D
-> validation
-> 3D extrusion
-> clearance mask
-> stud-grid rasterisation
-> brick packing
-> BuildPlan
```

This keeps the problem small.

## 11.2 Common bridge graph

Every bridge family must output the same node/member representation.

This lets the same downstream systems support:

- holograms;
- extrusion;
- brickification;
- structural solving;
- build dependencies;
- Codex diagnostics.

## 11.3 Family priority

Implementation order:

1. Beam.
2. Trestle/pier.
3. Warren truss.
4. Pratt truss.
5. Howe truss.
6. Arch.
7. Aqueduct.
8. Box bridge.
9. Suspension.
10. Cable-stayed later if useful.

Beam and trestle give the shortest route to the first complete TEST loop.

Warren/Pratt/Howe share most graph code.

Aqueduct is repeated arch generation.

## 11.4 Beam generator

Inputs:

- span;
- deck height;
- beam depth;
- support positions;
- side spacing.

Output:

- deck nodes;
- deck members;
- support nodes;
- optional lower girder/chord.

This is the baseline bridge family for pipeline tests.

## 11.5 Trestle/pier generator

Add repeated vertical supports below a beam deck.

Parameters:

- pier count;
- pier spacing;
- pier width;
- optional X brace.

Piers terminate on supportable terrain.

Reject a pier if its foundation is inside a forbidden terrain region unless the challenge allows river piers.

## 11.6 Warren truss

Create alternating triangular panels.

Parameters:

- panel count;
- truss height;
- deck position;
- side thickness.

This is the simplest repeated truss family.

## 11.7 Pratt truss

Create:

- upper chord;
- lower/deck chord;
- vertical members;
- diagonals that trend toward the centre.

Parameters:

- panel count;
- truss height ratio;
- deck height;
- cross-bracing option.

## 11.8 Howe truss

Reuse Pratt code with the diagonal direction reversed.

Do not maintain a fully separate geometry implementation.

## 11.9 Arch bridge

Support two forms:

- circular/semicircular;
- parabolic.

Rasterise the generated arch curve into structural cells later.

Do not generate artistic mesh arches that cannot map to bricks.

## 11.10 Aqueduct

Aqueduct is a repeated arch module.

Parameters:

- arch count;
- arch rise;
- pier width;
- upper deck/channel thickness.

Optimise for strong repetition and symmetry.

## 11.11 Box bridge

Treat this as two side graphs plus transverse connectors and a deck.

The central transport clearance must remain empty.

## 11.12 Suspension bridge

Generate:

- deck;
- towers;
- anchor nodes;
- main cable definitions;
- vertical hanger targets.

The cable itself is not brickified.

Towers and deck are brickified normally.

## 11.13 Bridge validation

Generation must return explicit machine-readable errors.

Recommended error codes:

```text
SPAN_INVALID
DECK_OUTSIDE_CORRIDOR
VEHICLE_CLEARANCE
PIER_NO_FOUNDATION
TOO_MANY_PARTS
NO_BUILDABLE_PATH
UNSUPPORTED_MEMBER
BRICK_RASTER_FAILED
ROBOT_REACH_WARNING
INVALID_CABLE_ANCHOR
INVALID_PARAMETER_RANGE
```

Do not return only free-text failure messages.

Codex needs error codes it can act on.

## 11.14 Determinism

`ChallengeState + BridgeSpec` must always create the same BridgeGraph2D and BuildPlan ordering for the same compiler version.

Use stable sorting and explicit tie-break rules.

Do not depend on object iteration order when it can change output ordering.

---

# 12. Codex design boundary

Codex is the co-designer, not the low-level geometry engine.

## 12.1 Codex may control

- bridge family;
- span strategy;
- deck height within valid range;
- truss height;
- panel count;
- pier count;
- pier spacing;
- arch count;
- arch rise;
- tower height;
- cable sag;
- hanger spacing;
- side thickness;
- brick density;
- allowed large beam preference;
- symmetry;
- cross-bracing;
- colour/material palette;
- target visual style.

## 12.2 Deterministic code controls

- exact ENTRY/EXIT geometry;
- exact graph node positions;
- vehicle clearance;
- terrain intersections;
- exact support locations after validation;
- exact brick placements;
- brick orientation;
- dependency ordering;
- robot coordinates;
- capacity values;
- structural failure thresholds;
- train physics.

## 12.3 Example interaction

User:

> Make a Roman aqueduct across this ravine.

Codex creates a valid BridgeSpec.

Generator creates the graph and preview.

User:

> Make the arches taller and use fewer bricks.

Codex changes only the related parameters.

The deterministic compiler regenerates the same type of bridge.

This keeps natural-language control powerful without making geometry unpredictable.

---

# 13. 2D bridge to 3D bridge

Do not build a general-purpose mesh modeller.

## 13.1 Side structures

For truss/beam/arch families:

1. Generate one 2D elevation graph.
2. Place one side at `z = -sideOffset`.
3. Duplicate it at `z = +sideOffset`.
4. Add selected cross-members.
5. Add deck members.
6. Add track/deck structure.
7. Apply clearance mask.

## 13.2 Structural width

BridgeSpec controls total bridge width.

The corridor controls clear vehicle width.

Side structure can only occupy the remaining side zones.

## 13.3 Cross-members

Cross-members can connect:

- lower chords;
- upper chords;
- towers;
- deck supports.

Reject any cross-member that enters the required vehicle clearance volume.

## 13.4 No general CSG requirement

All core bridge parts already live on a grid.

Use occupancy tests instead of mesh subtraction.

General CSG is a fallback for later decorative geometry only.

---

# 14. Brickification / structural part compilation

The bridge generator outputs structure. The brick compiler turns that structure into legal parts.

## 14.1 Coordinate system

Keep a strict local bridge grid.

The local bridge origin must not be the robot machine origin.

The workcell adapter maps local build coordinates to robot/machine coordinates later.

## 14.2 Rasterisation

For each structural member:

1. Project/rasterise it to occupied stud/layer cells.
2. Remove cells inside forbidden clearance.
3. Merge valid runs.
4. Assign legal parts.
5. Validate support and collisions.

## 14.3 Longest-first packing

Prefer the longest legal part that fits the required occupied cells.

Example order for a 2-stud-wide structural run:

```text
80x2 beam
-> shorter long beam sizes
-> 2x4
-> 2x2
-> 1x4 / 1x2 where required
-> local fill
```

Exact long-beam sizes can be tuned later.

The important rule is to reduce robot placement count for long bridge members.

## 14.4 Greedy packing objective

Use a deterministic score such as:

```text
score =
  placementCount
+ unsupportedPenalty
+ seamPenalty
+ robotAccessPenalty
```

Do not add a global optimiser in V3.

Use:

- longest-first greedy packing;
- local repair when a choice causes an invalid residue;
- rollback of only the local failed choice.

## 14.5 Layer seam rules

Where a structural region uses multiple layers, offset joints between layers when practical.

Avoid creating one continuous seam through all layers at the same span coordinate.

## 14.6 Structural-member mapping

Every generated placement should retain:

```text
placementId -> structuralMemberId
```

This mapping is critical for TEST Mode.

If one structural member fails, the game knows which bricks should be released or marked failed.

## 14.7 Build dependency DAG

The compiler should create a dependency graph.

Typical order:

```text
foundations
-> piers / towers
-> lower supported members
-> deck support
-> diagonals / verticals
-> upper members
-> rail/deck components
-> cables
```

Do not require one fixed global order.

A placement becomes `AVAILABLE` when its dependencies are satisfied.

This gives the player and robot parallel build choices.

## 14.8 Brickification acceptance tests

- Same input gives identical placement IDs and ordering.
- No placement enters vehicle clearance.
- Every placement uses a legal part type.
- Long straight members prefer larger legal parts.
- Dependency graph contains no cycle.
- Every placed rail segment has support references.
- Hologram placement transforms match BuildPlan transforms.

---

# 15. Hologram and preview system

The existing hologram remains the main design communication surface.

## 15.1 Hologram must show

- exact proposed part positions;
- exact part orientation;
- completed parts;
- remaining parts;
- next available parts;
- supports;
- cables;
- transport clearance;
- optional weak-region overlay.

## 15.2 No fake preview

The preview must come from the same BuildPlan that can be approved for construction.

Do not render an artistic bridge and then compile a different bridge behind the scenes.

## 15.3 Design revisions

Every regenerated design receives a new `designRevision`.

The hologram, BridgeGraph2D and candidate BuildPlan must report the same revision.

This prevents stale previews from being approved.

---

# 16. Structural gameplay model

The structural system must be fast, deterministic and easy to explain.

## 16.1 Structural graph is not the brick list

A ten-brick truss diagonal can remain one structural member.

This keeps structural solving cheap.

Bricks are used for build state and visual failure.

Members are used for game strength.

## 16.2 BUILD Mode structure

After a placement/removal, update only cheap structural data:

- support connectivity;
- member completion percentage;
- affected support paths;
- optional estimated utilisation.

Do not run collapse.

Do not create dynamic bridge bodies.

## 16.3 Support connectivity

Use BFS, DFS or union-find where suitable.

The system must answer:

- does this member connect to terrain/support?
- which supports carry this component?
- did failure disconnect a region?

## 16.4 Beam/cantilever model

Use a game bending moment:

```text
M* = sum(F_i * d_i)
```

Then:

```text
utilisation = demand / capacity
```

For unsupported overhangs, reduce effective capacity as unsupported length increases.

Example tunable rule:

```text
capacityEffective = capacity0 / (1 + k * (L / L0)^p)
```

Start with `p` around 1.5–2 as a gameplay value.

Do not claim this is an engineering prediction.

The required player experience is simple:

- close to a support = strong;
- farther from a support = weaker;
- more/better supports = stronger;
- long unsupported spans = risky.

## 16.5 T-shaped example

For a T structure:

- the vertical leg acts as the main support;
- horizontal members near the leg have low bending demand;
- horizontal members farther from the leg have higher demand;
- train load near the edge can overload the far region first.

This is the intended intuitive behaviour.

## 16.6 Truss model

For Pratt, Howe and Warren bridges, use a small 2D truss/direct-stiffness solver when ready.

Inputs:

- node coordinates;
- member connectivity;
- support conditions;
- axial stiffness class;
- applied train/deck loads.

Output:

- member demand;
- utilisation;
- candidate failed member.

The first integrated V3 can use simpler member load rules if the stiffness solver delays the end-to-end loop.

The interface must allow the simple solver to be replaced later without changing TEST Mode.

## 16.7 Pier model

Piers collect loads from the supported deck region.

Pier demand increases with:

- supported deck span;
- vehicle load above/near it;
- loads transferred from truss/arch members.

A pier with incomplete brick construction can have reduced capacity.

## 16.8 Arch model

V3 does not need full masonry contact analysis.

Represent the arch as a chain of compression-like structural members with capacity classes.

Transfer load to the nearest effective piers/abutments.

The main gameplay failures are:

- missing arch segment;
- weak pier;
- insufficient abutment/support;
- overload near mid-span.

## 16.9 Member completion

A structural member that maps to many bricks can use a completion factor.

Example:

```text
memberCapacityNow = baseCapacity * completionFactor
```

A missing critical brick can also create a hard connectivity break when appropriate.

Keep the rule deterministic and family-specific where needed.

## 16.10 Train load events

Do not solve every render frame.

Split the route into load segments.

When the train load crosses into a new segment:

1. update applied load nodes/members;
2. solve affected structure;
3. calculate utilisation;
4. check failure threshold.

## 16.11 Failure threshold

A member fails when its deterministic utilisation exceeds the configured limit.

Use stable tie-breaking if several members fail at once.

Example tie order:

1. highest utilisation;
2. lowest remaining capacity;
3. lowest member ID.

This preserves replay determinism.

## 16.12 Progressive failure

When a member fails:

1. mark it failed in the structural snapshot;
2. remove its structural contribution;
3. recompute connectivity/load for the affected component;
4. find the next overloaded member;
5. repeat until stable or a cascade limit is reached.

Use a strict iteration limit to prevent pathological loops.

## 16.13 Structural result versus physics result

The **structural solver is authoritative for bridge damage**.

Rapier can produce different debris poses without changing the deterministic failed-member list.

Do not decide canonical bridge damage from where a physics body happens to land.

## 16.14 Structural acceptance fixtures

Create small deterministic fixtures:

### Fixture A — supported beam

A short beam between two supports must survive a baseline train load.

### Fixture B — long cantilever

A long unsupported beam must fail before a short unsupported beam of the same class.

### Fixture C — T structure

The far ends must show higher demand than the centre near the support.

### Fixture D — missing pier

Removing one pier must increase demand in the adjacent span.

### Fixture E — truss member removal

Removing one critical truss member must alter the load path or disconnect the relevant region.

### Fixture F — incomplete deck

Rail support over a missing deck section must report unsupported.

---

# 17. TEST Mode and destructive physics

TEST Mode is the main dramatic feedback loop.

## 17.1 TEST setup

Before the train moves:

1. lock BUILD edits;
2. release all build reservations;
3. park the robot;
4. create immutable StructureSnapshot;
5. compile StructuralGraph;
6. compile rail-support map;
7. reset train;
8. prepare failure-body pools;
9. reset test telemetry;
10. start TEST.

## 17.2 Bridge physics during BUILD

Bridge parts remain static/instanced.

They do not need active rigid bodies.

Use only cheap collision proxies required by player/robot interaction.

## 17.3 Bridge physics during TEST

Keep intact bridge parts static.

When a structural member fails:

- find its mapped brick IDs;
- hide/remove their static render instances as required;
- activate pooled Rapier bodies for the visible failed pieces or clusters;
- transfer matching transforms;
- apply initial velocities/forces only when useful;
- let gravity/collision take over.

## 17.4 Failure clustering

Do not require one active rigid body for every brick.

Support three visual failure levels:

1. **clustered** — several bricks fail as one rigid cluster;
2. **member-level** — one structural member becomes one/few bodies;
3. **brick-level** — selected visible bricks become individual bodies.

Default to clustered/member-level failure for performance.

Use brick-level failure only for important visible regions or small scenes.

## 17.5 TEST end and repair state

At TEST end:

- destroy or pool visual debris;
- reset train bodies;
- apply deterministic failed placement IDs to the build state as one `TEST_DAMAGE` transaction;
- mark those placements `FAILED` or `REMOVED`;
- restore BUILD controls;
- enter REPAIR.

This keeps repair state deterministic.

Undoing `TEST_DAMAGE` can restore the pre-test bridge if the product allows that action.

## 17.6 TEST result telemetry

Record at least:

- train progress;
- first structural failure;
- maximum utilisation;
- failed members;
- failed placements;
- derailment time/progress;
- route support loss;
- final outcome.

Codex uses this telemetry for repair suggestions.

---

# 18. Train V1 architecture

Start with cuboids.

Mesh quality is not part of the physics milestone.

## 18.1 Train structure

```text
locomotive
-> coupler
-> carriage
-> coupler
-> carriage
```

Use a small train at first.

The visual model can be replaced later without changing physics interfaces.

## 18.2 Two guide points per carriage

Each carriage has:

- front guide point;
- rear guide point.

The guide points target positions on the rail centre line.

Use them to control lateral and vertical alignment while support exists.

## 18.3 Guide force

Use a simple spring/damper controller:

```text
Fguide = kp * positionError - kd * lateralVelocity
```

Apply forward traction along the route tangent.

This is game guidance, not wheel physics.

## 18.4 Couplers

Use Rapier joints/constraints between cars.

Tune them for stable visible articulation.

Avoid very stiff settings that create solver instability.

## 18.5 Rail support loss

Each guide point queries the current rail support segment.

If the segment loses support:

- reduce or remove guide force;
- leave gravity active;
- leave rigid-body collisions active;
- preserve current velocity.

The carriage can then derail or fall naturally.

## 18.6 Simplest fallback train

If dynamic rail guidance delays integration, use this temporary system:

- train follows the rail kinematically while support is valid;
- when support disappears, create/activate dynamic Rapier bodies with the current pose and velocity;
- continue with gravity/collision.

This fallback is acceptable for the first complete V3 loop.

The two-guide dynamic model remains the target.

## 18.7 Derail conditions

A carriage can be considered derailed when one or more conditions are true:

- both guide points have no support;
- lateral error exceeds a limit;
- roll/pitch exceeds a limit;
- carriage falls below the route deck by a limit;
- coupler failure state is triggered.

Do not rely only on a visual wheel mesh.

## 18.8 Train acceptance tests

- Train crosses a flat fully supported test track.
- Train remains articulated through the crossing.
- Removing one support segment releases the correct carriage guide.
- A locomotive can fall under gravity.
- TEST reset returns all cars to identical start transforms.
- Repeated tests do not leak rigid bodies or joints.

---

# 19. Suspension bridge cable system

Cables are a separate lightweight system.

## 19.1 User interaction

The user can:

1. select anchor A;
2. select anchor B;
3. create a cable;
4. change sag;
5. create vertical hangers;
6. connect hangers to valid deck/brick anchors.

## 19.2 BUILD Mode curve

Use an analytic curve.

For equal-height supports, a simple parabola is enough:

```text
y(x) = yTop - 4f * x(L - x) / L^2
```

Where:

- `L` = span;
- `f` = sag.

Sample the curve for rendering.

Use a line or low-cost tube.

No rope rigid bodies are needed in BUILD Mode.

## 19.3 Hangers

Generate hangers at panel/deck intervals.

Each hanger references:

- one point on the main cable;
- one valid deck anchor/member.

## 19.4 Approximate tower demand

Use simple game-level cable force estimates.

For approximate uniform load `q`:

```text
H ~= qL^2 / (8f)
Vtower ~= qL / 2
```

Use these values as demand proxies for tower and anchor structural members.

This creates useful gameplay:

- very shallow cable sag creates high horizontal tower demand;
- larger sag reduces horizontal demand;
- weak towers can fail even when the cable does not break.

## 19.5 Cable failure rule

Default V3 cable setting:

`breakable = false`

The cable remains intact.

Towers, anchors, hangers or deck members can fail.

A later setting can allow cable failure.

## 19.6 Optional TEST cable animation

Only if needed, animate a failed/loose cable with a small Verlet/PBD/XPBD particle chain.

Do not use one rigid body per cable segment.

## 19.7 Cable acceptance tests

- Two anchors create one deterministic curve.
- Sag control changes the curve immediately.
- Hangers remain vertical in BUILD Mode.
- Invalid anchors are rejected.
- Default cable does not break in TEST.
- Tower demand changes when sag changes.

---

# 20. Undo, redo and transactions

Undo/redo is mandatory because player, robot and Codex all change the world.

## 20.1 Command log

Use a compact command model:

```ts
type HistoryCommand = {
  id: number;
  type: string;
  transactionId: number;
  forward: Delta[];
  inverse: Delta[];
  affectedIds: EntityId[];
};
```

## 20.2 Reversible actions

At minimum support:

- player place brick;
- player remove brick;
- robot completed placement;
- remove/restore failed brick;
- add cable;
- remove cable;
- change cable sag;
- approved design transaction where valid;
- TEST damage transaction.

## 20.3 Transactions

One high-level user action may create many low-level changes.

Examples:

- regenerate bridge plan;
- apply TEST damage;
- accept a multi-part repair;
- remove one structural member made from many bricks.

These should appear as one undo step when appropriate.

## 20.4 No full-world copies per action

Do not clone:

- terrain;
- scene graph;
- all bricks;
- physics world;
- robot state;
- train state.

Store changed entities and their prior values.

## 20.5 Stable IDs

Undo/redo depends on stable IDs.

A restored placement must keep its original placement ID unless the command explicitly creates a new design revision.

## 20.6 Optional checkpoints

If very long sessions make replay expensive, add periodic compact checkpoints later.

Do not use checkpoints as a reason to copy the world after every action.

## 20.7 Undo acceptance tests

- Place -> undo -> state equals previous checksum.
- Place -> undo -> redo -> state equals post-place checksum.
- Robot placement uses same history path as player placement.
- Cable creation is reversible.
- TEST damage is reversible if enabled.
- 1000 simple actions do not cause linear full-world memory growth per action.

---

# 21. Human + robot shared construction

The user and UR10 must build the same structure, not parallel copies.

## 21.1 Reservation model

Available placements can be reserved by one actor.

```text
AVAILABLE
-> RESERVED_PLAYER
or
-> RESERVED_ROBOT
```

A second actor cannot take that placement until the reservation is released or completed.

## 21.2 Completion

A successful placement goes through the same accepted placement API regardless of actor.

Recommended flow:

```text
reserve
-> validate
-> move/position
-> place
-> verify
-> commit BuildBoard state
-> append history command
-> release reservation
```

## 21.3 Player freedom

The player may place manually using the existing intuitive controls.

The shared state must detect whether a manual placement:

- completes a planned placement;
- creates an extra valid support;
- conflicts with the current BuildPlan;
- blocks another placement.

Do not silently ignore manual construction.

## 21.4 Robot scheduling

The robot can select from currently `AVAILABLE` placements.

Prefer placements that:

- satisfy dependencies;
- are reachable;
- do not block future access;
- are not reserved;
- have low collision risk.

No global optimal scheduler is required for V3.

---

# 22. UR10 collision avoidance

Do not replace the existing reliable movement algorithm.

Add only conservative bridge-world collision checks.

## 22.1 Default motion pattern

```text
pick
-> rise to safe Z
-> horizontal transfer
-> descend
-> place
-> rise
```

## 22.2 Safe Z

Calculate:

```text
safeZ = max(
  terrain under route,
  bridge top under route,
  static obstacle top
) + clearance
```

## 22.3 Collision volumes

Use simple collision volumes for planning checks:

- gripper capsule/AABB/OBB;
- key robot link capsules where required;
- bridge AABBs;
- terrain envelope;
- test corridor bounds.

Do not test every robot mesh triangle.

## 22.4 Alternate waypoint

If the direct safe-Z route fails:

1. test one lateral waypoint;
2. test the opposite lateral waypoint;
3. if both fail, reject/defer the placement.

Do not attempt a full sampling-based motion planner in V3.

## 22.5 TEST safety

The robot must be outside the train/test corridor before TEST starts.

TEST cannot start if the robot parking condition is not satisfied.

---

# 23. WebMCP / Codex tool boundary

Codex needs high-level design visibility plus the existing primitive build/robot abilities.

## 23.1 Recommended design tools

Conceptual tool set:

```text
get_challenge_state
get_terrain_profile
get_bridge_spec
set_bridge_spec
validate_bridge_spec
compile_bridge_preview
get_bridge_validation
get_build_progress
get_structural_summary
get_test_result
```

Names may change to fit the existing tool architecture.

The important point is the data boundary.

## 23.2 Physical tools

Physical work remains on the accepted build/robot path.

Do not create hidden tools such as:

```text
win_bridge
instant_build_bridge
execute_whole_bridge_without_state
fake_train_success
```

The WebMCP proof should show that Codex reads live state and changes a real bridge design or build decision.

## 23.3 Structured outputs

BridgeSpec updates should use strict schema validation.

Reject unknown or invalid parameters.

Return explicit validation errors to Codex.

## 23.4 Test diagnostics for Codex

A TestResult should let Codex say useful things such as:

- “The centre span failed first.”
- “The right pier was incomplete.”
- “The far cantilever exceeded capacity.”
- “The tower demand is high because the cable sag is too small.”
- “The rail lost support between these two segments.”

Codex should then change BridgeSpec or propose repair placements.

---

# 24. UI and interaction plan

Keep the main interface simple.

## 24.1 Main visible controls

Priority controls:

- challenge/new terrain;
- design/edit;
- BUILD/TEST state;
- large **TEST** action;
- undo;
- redo;
- train reset when relevant;
- settings panel.

Do not fill the main viewport with status chips.

## 24.2 Settings panel

Detailed values can live in settings:

- terrain seed;
- terrain difficulty;
- bridge family parameters;
- train mass/speed;
- structural difficulty multiplier;
- cable breakable toggle;
- debug overlays;
- physics debug;
- performance stats.

## 24.3 Weak-region overlay

Optional structural preview colours can show utilisation ranges.

Do not make the user read engineering numbers unless requested.

The default visual language can be:

- safe;
- stressed;
- critical.

## 24.4 TEST presentation

When TEST starts:

- hide unnecessary build handles;
- keep the bridge readable;
- make the train easy to follow;
- allow camera control;
- show concise result feedback after success/failure.

## 24.5 Cable interaction

Cable tool interaction:

```text
click/select anchor A
-> click/select anchor B
-> cable preview
-> confirm
```

Then expose sag and hanger-spacing controls.

---

# 25. Performance architecture

V3 should be designed for high frame rate from the start.

A capable desktop should be able to target a high-refresh experience. Do not hard-couple gameplay correctness to a specific FPS number.

## 25.1 Every render frame

Only do work that must be visual or interactive:

- input;
- camera;
- renderer;
- hologram visibility;
- interpolation of active physics transforms;
- lightweight UI state.

Do not run bridge generation or structural solving here.

## 25.2 Fixed TEST physics step

Run:

- Rapier stepping;
- train guide forces;
- active collapse bodies;
- train collision;
- limited TEST sensors.

Keep this independent from render refresh.

## 25.3 On brick placement/removal

Run only dirty updates:

- occupancy;
- dependency state;
- local support connectivity;
- affected structural-member completion;
- hologram progress state.

## 25.4 On BridgeSpec change

Run:

- BridgeGraph2D generation;
- validation;
- 3D extrusion;
- brickification;
- candidate BuildPlan;
- hologram rebuild.

Move this to a Worker if it causes visible stalls.

## 25.5 At TEST start

Run:

- immutable snapshot creation;
- structural graph compile;
- rail-support mapping;
- train reset;
- body-pool preparation.

## 25.6 On train load-region change

Run:

- structural load update;
- affected solve;
- failure check.

Do not solve continuously if the train remains inside the same load region.

## 25.7 On failure

Run:

- structural member removal;
- local/cascade re-solve;
- static-to-dynamic visual swap;
- rail support update.

## 25.8 Instancing

Use instancing for:

- repeated bricks by type/material;
- sleepers;
- rail segments where geometry allows;
- repeated terrain props;
- hologram bricks where practical.

Do not create one heavyweight Three.js material per brick.

## 25.9 Object pools

Pool where repeated creation is likely:

- failed brick/member rigid bodies;
- debris meshes;
- train helper objects;
- cable particles if added;
- debug markers.

## 25.10 Physics sleeping

Allow settled debris to sleep.

Do not keep failed bodies awake for the full session.

## 25.11 CCD

Enable continuous collision detection only on bodies that need it.

Likely candidates:

- fast locomotive/carriage bodies;
- very fast debris when visible tunnelling occurs.

Do not enable CCD globally.

## 25.12 Spatial hash

Use a simple spatial hash/grid for logical brick queries.

Examples:

```text
cell -> placement IDs
```

Use it for:

- local support queries;
- local collision candidates;
- damage lookup;
- nearby build options.

## 25.13 Worker strategy

First escalation path:

```text
main-thread TypeScript
-> TypeScript Web Worker
-> WASM only if measured need remains
```

Candidate Worker tasks:

- terrain generation;
- BridgeGraph2D generation;
- brickification;
- structural solve.

Do not move the Three.js renderer to a Worker unless profiling proves it helps.

## 25.14 WebGPU policy

Use GPU for rendering.

Do not implement WebGPU compute for structural solving in V3 unless CPU/Worker profiling proves a real bottleneck.

The structural graph should be too small and too event-driven to justify GPU compute initially.

## 25.15 Performance telemetry

The integrated application must expose a debug performance panel with at least:

- FPS/frame time;
- draw calls;
- triangle count;
- total visible brick instances;
- active Rapier body count;
- sleeping body count if available;
- structural solve time;
- bridge generation time;
- brickification time;
- active train body count;
- memory trend where available.

Optimisation work must use measured values.

---

# 26. Determinism and reproducible fixtures

Parallel development needs reproducible scenes.

Create fixed fixtures that every agent can run.

## 26.1 Challenge fixtures

At minimum:

- `FLAT_GAP_SMALL`;
- `FLAT_GAP_LARGE`;
- `RAVINE_SIMPLE`;
- `RIVER_SIMPLE`;
- one fixed noisy seed.

## 26.2 BridgeSpec fixtures

At minimum:

- simple beam;
- beam with centre pier;
- Warren truss;
- Pratt truss;
- arch;
- suspension.

## 26.3 Test fixtures

At minimum:

- complete strong bridge -> success;
- missing centre deck -> train fall;
- weak long cantilever -> structural failure;
- missing pier -> span failure;
- tower overload -> suspension support failure.

## 26.4 State checksums

Where useful, calculate deterministic checksums for:

- height field;
- BridgeGraph2D;
- BuildPlan placement sequence;
- build-state occupancy;
- failed-member list.

This helps parallel agents detect unintended behaviour changes.

---

# 27. Parallel implementation rules

Parallel work is a V3 requirement.

Agents must be able to work at the same time without repeatedly changing the same internals.

## 27.1 Contract-first rule

The shared contracts in this plan are the integration boundary.

If an agent needs a contract change:

1. document the required change;
2. keep it backward compatible when possible;
3. notify the integration owner;
4. do not silently change another workstream's interface.

## 27.2 Module ownership rule

Each workstream owns its module internals.

Other agents consume its public interface or a mock.

Do not reach into another module's private arrays, Three.js objects or Rapier handles.

## 27.3 Mock-first rule

A workstream must not wait for another workstream when a mock can represent the shared contract.

Examples:

- train team can use a flat test rail and fake support map;
- structure team can use hand-written StructuralGraph fixtures;
- bridge generator can use a flat gap ChallengeState;
- terrain team does not need the robot;
- cable team can use two fixed towers;
- integration team can use placeholder train/terrain modules.

## 27.4 Existing-system protection

Agents must not rewrite proven robot/gripper/player systems while working on unrelated V3 tasks.

## 27.5 Agent handoff requirement

Every parallel workstream must return:

- changed files;
- public interfaces;
- how to run its demo/test;
- deterministic fixture used;
- screenshots/video evidence when visual;
- test results;
- performance measurements where relevant;
- known limitations;
- merge risks;
- next integration action.

---

# 28. Parallel workstream A — Unified application, state and existing-system integration

## Mission

Create the canonical V3 application shell and connect the proven systems through one shared state.

## Owns

- V3 mode state machine;
- canonical V3 world state;
- integration adapters;
- BuildBoard bridge adapter;
- existing BuildPlan adapter;
- player/robot reservation state;
- undo/redo command history;
- TEST/BUILD state transitions;
- top-level UI mode controls.

## Must preserve

- existing UR10 behaviour;
- gripper animation;
- proven pickup/placement algorithm;
- current player placement controls;
- existing hologram behaviour where compatible.

## Inputs

- ChallengeState from B;
- candidate BuildPlan from E;
- TestResult from D;
- train module from C;
- cable state from F.

## Outputs

- authoritative mode state;
- authoritative build state;
- reservation API;
- command-history API;
- adapters used by player and robot.

## Tasks

1. Inventory the proven V2/V1 prototype systems.
2. Select the canonical integration entry point.
3. Create the V3 mode state machine.
4. Create stable IDs and shared build-element states.
5. Wrap player placement through one accepted placement API.
6. Wrap robot placement through the same accepted API.
7. Add reservation ownership.
8. Add command-based undo/redo.
9. Add TEST_PREP lock and robot park requirement.
10. Add result/repair transition.
11. Keep a simple mock terrain/train path so integration can proceed before B/C merge.

## Must not own

- terrain algorithms;
- bridge-family geometry;
- structural equations;
- train physics internals;
- cable curve internals.

## Acceptance

- Player and robot can place into one shared state.
- Two actors cannot reserve the same placement.
- Hologram completion state follows the accepted board.
- Undo/redo works for player and robot placements.
- TEST locks construction.
- Robot must be parked before TEST_RUNNING.
- No duplicate accepted robot/build state exists.

---

# 29. Parallel workstream B — Procedural terrain and challenge

## Mission

Generate deterministic bridge challenges with cheap terrain queries.

## Owns

- TerrainSpec implementation;
- height-field generator;
- river/ravine/gap generation;
- ENTRY/EXIT generation;
- supportable region detection;
- terrain rendering mesh;
- terrain query API;
- challenge seeds/fixtures.

## Inputs

- seed;
- challenge difficulty/settings.

## Outputs

- ChallengeState;
- terrain mesh data;
- height/slope/support query API.

## Tasks

1. Implement deterministic simplex noise source.
2. Generate low-frequency base terrain.
3. Implement analytic channel/ravine function.
4. Add river water plane mode.
5. Add flat-gap fixture mode.
6. Generate crossing centre and local obstacle normal.
7. Find/flatten valid ENTRY and EXIT pads.
8. Generate supportable mask/regions.
9. Expose query functions independent from rendering.
10. Add deterministic test fixtures and checksums.
11. Measure terrain generation and render cost.

## Must not own

- bridge design;
- BuildPlan;
- train;
- structural failure.

## Acceptance

- Same seed creates identical challenge data.
- Terrain can regenerate without leaks.
- ENTRY/EXIT are valid.
- Route crosses the obstacle.
- Height queries are fast enough for frequent robot/world checks.
- Flat-gap fixture is available to all teams.

---

# 30. Parallel workstream C — Railway, train and derailment physics

## Mission

Create a convincing placeholder train that can cross supported track and fall from failed track.

## Owns

- rail centreline representation;
- rail/sleeper visual generation;
- RailSupportSegment interface consumption;
- Rapier train bodies;
- couplers;
- guide-point controller;
- forward drive;
- derailment state;
- train reset;
- placeholder train visuals.

## Inputs

- TransportCorridor;
- rail support map;
- support-change events from D;
- mode state from A.

## Outputs

- train progress;
- train load positions for D;
- derailment/fall events;
- deterministic reset API.

## Tasks

1. Initialise Rapier in an isolated test demo.
2. Create locomotive + two carriage cuboids.
3. Create stable couplers.
4. Implement flat rail centreline.
5. Implement front/rear guide points.
6. Add spring/damper rail guidance.
7. Add forward traction.
8. Implement support-map lookup.
9. Disable/fade guide force on lost support.
10. Detect derailment/fall.
11. Add deterministic reset.
12. Add temporary kinematic-until-failure fallback if required.
13. Measure physics cost for expected train/body count.

## Must not own

- bridge structural failure decision;
- bridge generation;
- robot state.

## Acceptance

- Train crosses a fully supported flat fixture.
- Train falls when a centre support segment disappears.
- Carriages articulate without unstable explosions.
- Reset is repeatable.
- Train physics can stop completely outside TEST.

---

# 31. Parallel workstream D — Structural solver, TEST orchestration and failure

## Mission

Create the deterministic game-strength model and convert structural failure into visible Rapier collapse events.

## Owns

- StructuralGraph compiler/adapter;
- support connectivity;
- member completion/capacity;
- beam/cantilever demand;
- truss solver when added;
- moving-load application;
- failure ordering;
- progressive failure loop;
- StructureSnapshot;
- rail support state updates;
- TestResult;
- failed-member-to-brick activation request.

## Inputs

- built placement state from A;
- bridge/member mapping from E;
- train load/progress from C;
- cable/tower demand from F.

## Outputs

- member utilisation;
- failed members;
- rail support changes;
- TestResult;
- deterministic failed placement IDs.

## Tasks

1. Define StructuralGraph adapter from generated bridge data.
2. Implement support connectivity.
3. Implement member completion factor.
4. Implement beam/cantilever demand model.
5. Add load regions along track.
6. Apply train loads only when load region changes.
7. Implement deterministic failure threshold/tie-break.
8. Implement progressive failure cascade with iteration cap.
9. Build structural fixtures A–F.
10. Map failed member IDs to placement IDs.
11. Publish support-loss events to C.
12. Produce TestResult diagnostics.
13. Add simple 2D truss stiffness solver after baseline loop works.
14. Add pooled/static-to-dynamic activation requests for visible failure.

## Must not own

- train guide-force internals;
- bridge-family geometry;
- UI rendering;
- robot placement.

## Acceptance

- Short supported span survives baseline.
- Long cantilever fails before short cantilever.
- Same snapshot and train load path produce same failed-member order.
- BUILD never collapses.
- Failure removes rail support where expected.
- TestResult is useful to Codex.

---

# 32. Parallel workstream E — Bridge generator, extrusion, brickification and BuildPlan compilation

## Mission

Convert a ChallengeState and BridgeSpec into a robot-buildable bridge plan.

## Owns

- BridgeSpec validation;
- BridgeGraph2D;
- bridge-family generators;
- 2D-to-3D extrusion;
- clearance occupancy mask;
- structural-member mapping;
- stud/layer rasterisation;
- longest-first brick packing;
- build dependency DAG;
- candidate BuildPlan adapter;
- deterministic generation fixtures.

## Inputs

- ChallengeState from B;
- BridgeSpec from A/Codex;
- existing BuildPlan requirements.

## Outputs

- BridgeGraph2D;
- structural-member metadata;
- candidate BuildPlan;
- validation result;
- hologram-ready placements;
- dependency graph.

## Tasks

1. Define strict BridgeSpec validator.
2. Implement beam generator.
3. Implement trestle/pier generator.
4. Implement common truss graph helpers.
5. Implement Warren.
6. Implement Pratt.
7. Implement Howe as a Pratt variation.
8. Implement arch curve generator.
9. Implement repeated aqueduct arches.
10. Implement side duplication/3D extrusion.
11. Implement transport clearance mask.
12. Implement stud-grid member rasterisation.
13. Implement longest-first packing.
14. Add long 2-stud structural beams.
15. Add local packing rollback/repair.
16. Create memberId -> placementIds mapping.
17. Create dependency DAG.
18. Compile to existing BuildPlan V1 via adapter.
19. Produce explicit validation error codes.
20. Add deterministic fixtures and checksums.

## Must not own

- train physics;
- TEST failure thresholds;
- robot motion;
- cable physics animation.

## Acceptance

- Same input creates identical graph and plan.
- Beam and trestle compile first.
- At least one truss family compiles.
- No generated structural brick enters vehicle clearance.
- Output can be displayed by the existing hologram.
- Output can be consumed by the existing robot build path.
- Long members reduce placement count compared with only short bricks.

---

# 33. Parallel workstream F — Suspension/cable system

## Mission

Provide low-cost suspension bridge cables and user-created wires.

## Owns

- cable anchor selection;
- CableDesign;
- analytic cable curves;
- hanger generation;
- cable rendering;
- approximate cable/tower demand;
- cable-to-brick/member attachment references;
- optional loose-cable TEST animation.

## Inputs

- tower/deck nodes from E;
- user anchor selections;
- TEST loads from D where needed.

## Outputs

- CableDesign objects;
- cable render data;
- hanger links;
- tower/anchor demand contribution.

## Tasks

1. Implement anchor selection API.
2. Implement parabolic sag curve.
3. Add catenary option only if it adds visible value.
4. Render cable efficiently.
5. Generate vertical hangers.
6. Validate cable-to-bridge anchors.
7. Calculate approximate tower forces from span/load/sag.
8. Send structural demand contribution to D.
9. Keep cables unbreakable by default.
10. Add optional small PBD/Verlet loose-cable animation after core system works.

## Must not own

- brick structural solver;
- train;
- bridge family except cable-specific supplement.

## Acceptance

- Two valid anchors create a cable.
- Sag is editable.
- Hangers are deterministic.
- Invalid anchor is rejected.
- Cable rendering has low frame cost.
- Tower demand responds to cable sag.

---

# 34. Parallel workstream G — Performance, integration validation and end-to-end QA

## Mission

Keep V3 fast and prove that parallel modules merge into one complete game loop.

## Owns

- profiler/debug stats;
- draw-call review;
- instancing strategy;
- active-body review;
- object-pool validation;
- dirty-update validation;
- end-to-end fixtures;
- regression checks for proven robot/gripper behaviour;
- merge validation;
- visual inspection.

## Inputs

All workstreams.

## Outputs

- performance report;
- integration defects;
- end-to-end acceptance evidence;
- optimisation patches that do not change module ownership without agreement.

## Tasks

1. Add performance metrics panel.
2. Establish baseline with existing integrated robot scene.
3. Measure terrain draw/generation cost.
4. Measure bridge instance counts/draw calls.
5. Measure Rapier active-body cost.
6. Verify bridge solver never runs every render frame.
7. Verify body pools/sleeping work.
8. Test large brick plans.
9. Test repeated BUILD->TEST->REPAIR cycles for leaks.
10. Run deterministic fixture suite.
11. Visually inspect robot pickup/placement after merge.
12. Visually inspect train crossing and failure.
13. Verify undo/redo after integration.
14. Verify no stale hologram revision can be built.
15. Create final V3 end-to-end evidence.

## Acceptance

- Core build controls remain responsive in a practical bridge scene.
- No continuous structural solve is tied to rendering.
- TEST physics can start/stop cleanly.
- Repeated tests do not grow active body count indefinitely.
- Existing reliable robot/gripper placement remains reliable.
- End-to-end completion gate passes.

---

# 35. Parallel dependency graph

The workstreams are deliberately structured so they can start together.

```text
              +------------------+
              | A: Core / state  |
              +--------+---------+
                       |
         shared contracts / mocks
                       |
   +---------+---------+---------+---------+
   |         |                   |         |
   v         v                   v         v
+-----+   +-----+             +-----+   +-----+
|  B  |   |  C  |             |  D  |   |  E  |
|terrain| |train|             |struct|   |gen  |
+--+--+   +--+--+             +--+--+   +--+--+
   |         |                   |         |
   |         +--------+----------+         |
   |                  |                    |
   +------------------+--------------------+
                      |
                      v
               integrated world
                      |
                      v
                   +-----+
                   |  F  |
                   |cable|
                   +--+--+
                      |
                      v
                   +-----+
                   |  G  |
                   | QA  |
                   +-----+
```

F can also start immediately with fixed tower mocks. It does not need to wait for E.

## 35.1 Minimum shared contracts to freeze first

Before deep parallel changes, agree on these names/shapes:

- ChallengeState;
- TransportCorridor;
- BridgeSpec;
- BridgeGraph2D;
- BuildPlan adapter boundary;
- StructuralGraph;
- RailSupportSegment;
- TestResult;
- build placement states.

After that, each team can use mocks.

---

# 36. Merge sequence

Do not wait until all modules are “finished” before integration.

## Merge wave 1 — static world

Merge:

- A core shell;
- B terrain/challenge;
- E beam generator;
- existing hologram/BuildPlan.

Required result:

`terrain -> ENTRY/EXIT -> beam preview -> candidate BuildPlan`

## Merge wave 2 — collaborative BUILD

Merge:

- existing player controls;
- existing UR10/gripper placement;
- A shared reservation/history.

Required result:

`approved bridge -> user + robot place into same state -> undo/redo`

## Merge wave 3 — train without structural failure

Merge C with a flat/strong bridge.

Required result:

`TEST -> train crosses supported route -> missing route segment makes train fall`

This validates train physics before structural complexity.

## Merge wave 4 — structural failure

Merge D.

Required result:

`train load -> member overload -> failed member -> rail support loss -> Rapier collapse -> derail/fall`

## Merge wave 5 — repair loop

Required result:

`TEST_RESULT -> deterministic damage -> REPAIR -> rebuild -> TEST again`

## Merge wave 6 — bridge families

Add:

- trestle;
- Warren/Pratt/Howe;
- arch/aqueduct;
- box.

## Merge wave 7 — suspension

Add F cables and suspension generator.

## Merge wave 8 — optimisation and polish

G performs full profiling, stress tests and visual regression checks.

---

# 37. V3 milestone gates

## Gate 1 — Challenge

Pass when:

- deterministic terrain exists;
- ENTRY/EXIT exist;
- transport corridor exists.

## Gate 2 — Design

Pass when:

- BridgeSpec creates a bridge graph;
- hologram shows it;
- BuildPlan compiles.

## Gate 3 — Collaborative BUILD

Pass when:

- player and robot build the same plan;
- undo/redo works;
- bridge does not collapse during BUILD.

## Gate 4 — Train

Pass when:

- train crosses a supported flat bridge;
- missing track support can cause a fall.

## Gate 5 — Structural TEST

Pass when:

- structural load can fail a member;
- Rapier displays the collapse;
- train responds to lost support.

## Gate 6 — Repair

Pass when:

- failed placements become repairable deterministic state;
- bridge can be repaired;
- TEST can run again.

## Gate 7 — Multiple families

Pass when at least:

- beam;
- trestle;
- one truss;
- arch

use the same common pipeline.

## Gate 8 — Suspension

Pass when:

- towers/deck compile;
- analytic main cable exists;
- hangers exist;
- tower demand affects structural TEST.

## Gate 9 — Performance/regression

Pass when:

- integrated build is responsive;
- repeated tests do not leak physics objects;
- proven robot/gripper placement remains reliable;
- no major work runs unnecessarily every render frame.

---

# 38. Strict priority if V3 must be cut

If work must be reduced, keep this exact order.

## Must ship first

1. Unified existing robot/player/build systems.
2. Undo/redo.
3. Flat-gap deterministic challenge.
4. Simple terrain/ravine.
5. ENTRY/EXIT and straight rail corridor.
6. Beam bridge generator.
7. BuildPlan/hologram integration.
8. Articulated placeholder train.
9. Missing support causes real train fall.
10. Simplified structural solver.
11. TEST-only bridge failure.
12. Repair and TEST again.

## Next

13. Trestle/pier.
14. Warren/Pratt/Howe.
15. Arch/aqueduct.
16. Long structural beams.
17. Better failure clustering.
18. Codex BridgeSpec tools.

## Then

19. Suspension cables.
20. Box bridges.
21. Double rail track.
22. Road mode.
23. Cars/trucks.
24. Better train meshes.
25. More terrain types.

---

# 39. Main risks and fallback paths

## Risk: Rapier train guidance is unstable

Fallback:

- keep train kinematic while supported;
- switch to dynamic Rapier bodies only when support is lost.

Do not block V3 on perfect dynamic rail guidance.

## Risk: truss stiffness solver takes too long

Fallback:

- use deterministic graph/member demand heuristics first;
- keep the same StructuralGraph interface;
- replace internals later.

## Risk: brickification becomes complex

Fallback:

- support fewer part sizes;
- use long structural beams;
- use family-specific structural templates;
- add local greedy packing only where needed.

Do not build a general optimal packing engine.

## Risk: too many physics bodies during collapse

Fallback:

- fail structural members as clusters;
- release only visible/critical bricks;
- pool bodies;
- sleep debris quickly.

## Risk: suspension cable physics becomes expensive

Fallback:

- analytic BUILD curve only;
- no cable-body physics;
- transfer approximate loads to towers;
- keep cable unbreakable.

## Risk: terrain hurts robot placement

Fallback:

- use flatter build banks;
- enlarge safe approach pads;
- use conservative safe-Z routing.

## Risk: Codex creates invalid designs

Fallback:

- constrain BridgeSpec ranges;
- return validation error codes;
- never allow Codex to bypass the deterministic compiler.

## Risk: merge changes proven robot behaviour

Fallback:

- keep robot module unchanged;
- move V3 conversion into adapters;
- regression-test old known pickup/placement sequences.

---

# 40. Road mode after train mode

Road mode should reuse the same architecture.

Replace/extend:

- TransportCorridor mode;
- rail deck with road deck;
- train with block cars/trucks;
- load class by vehicle type.

Cars/trucks can use simple constrained path following.

When bridge support fails, vehicles become normal dynamic bodies and can fall.

Truck height must be included in the clearance envelope.

Do not change bridge-family generation just to support roads. The corridor abstraction should contain the difference.

---

# 41. Debug and developer tooling

V3 needs strong debug views because several systems interact.

Optional debug overlays:

- terrain height grid;
- supportable terrain mask;
- ENTRY/EXIT axes;
- transport clearance box;
- BridgeGraph2D nodes/members;
- structural member IDs;
- member utilisation;
- rail support segments;
- train guide points;
- Rapier colliders;
- robot safe-Z route;
- build dependencies;
- actor reservations;
- failed member -> brick mapping.

All debug overlays must be disabled in normal presentation mode.

---

# 42. Data/versioning rules

V3 state should be serialisable where practical.

Include explicit versions in:

- ChallengeState;
- BridgeSpec;
- generated design metadata;
- TestResult if persisted.

Do not assume old prototype state can be loaded without an adapter.

A saved challenge should record at least:

- seed;
- ChallengeState settings;
- BridgeSpec;
- approved BuildPlan revision;
- build-state deltas;
- cable state.

Physics debris does not need to be saved.

---

# 43. Security and WebMCP integrity

The competition experience must prove real state interaction.

Codex tools must:

- read accepted runtime state;
- use schema validation;
- reject stale revisions;
- reject invalid placements;
- never bypass build dependencies without an explicit safe override;
- never fake TEST results.

A tool result that reports success must correspond to the accepted world revision.

No hidden prerecorded bridge completion or train outcome is allowed.

---

# 44. Final V3 acceptance scenario

The final integrated acceptance scenario should be simple and repeatable.

1. Start ROBO BRIDGE MCP.
2. Generate a fixed ravine seed.
3. Show ENTRY and EXIT.
4. Ask Codex for a simple bridge.
5. Show the generated hologram.
6. Approve the plan.
7. Let the user place some parts.
8. Let the UR10 place other parts.
9. Undo one placement.
10. Redo it.
11. Press TEST before the bridge is fully strong.
12. Park the robot automatically.
13. Run the train.
14. Trigger one deterministic weak-member failure.
15. Show the failed bridge pieces falling with Rapier.
16. Let the train lose rail support and derail/fall.
17. Produce TestResult.
18. Return to REPAIR.
19. Ask Codex to strengthen the failed region.
20. Update the plan/hologram.
21. User + robot complete the repair.
22. Press TEST again.
23. Train crosses successfully.

This scenario demonstrates the full purpose of the project:

**the human and Codex design the bridge together, the human and robot build it together, and the train proves whether it works.**

---

# 45. Final architecture summary

```text
seed
  |
  v
simplex height field
  |
  v
analytic river / ravine
  |
  v
ENTRY + EXIT + corridor
  |
  v
Codex / user -> BridgeSpec
  |
  v
deterministic BridgeGraph2D
  |
  v
3D side extrusion + deck + clearance mask
  |
  v
stud-grid rasterisation + longest-first brick packing
  |
  v
existing BuildPlan + hologram
  |
  v
STATIC BUILD
player + UR10 + one shared state + undo/redo
  |
  v
TEST_PREP
immutable StructureSnapshot + robot park
  |
  v
TEST
small structural graph + articulated Rapier train
  |
  v
member utilisation > threshold
  |
  v
solver selects deterministic failure
  |
  v
selected bridge pieces become dynamic Rapier bodies
  |
  v
rail support disappears
  |
  v
train guide releases
  |
  v
derailment / fall / success
  |
  v
TestResult
  |
  v
REPAIR
  |
  +-------> BUILD -> TEST again
```

## V3 principle

**Build cheaply. Test dramatically. Keep the design deterministic. Keep physics selective. Keep Codex at the parameter level. Preserve the proven robot stack.**
