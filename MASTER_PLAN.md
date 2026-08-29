# LOGO ROBO — Master Plan

## Product vision

LOGO ROBO is a browser-based collaborative physical creation system. A human and Codex design a robot-buildable structure together, inspect and refine a live hologram and material plan, then build the approved design together through one shared robot world.

The core experience is:

`idea -> co-design with Codex -> compile -> preview -> refine -> approve -> build together`

The logo race remains a useful demo and regression case, but it is no longer the product architecture. The same system should support:

- 2D logos and geometric patterns;
- bridges and aqueducts;
- houses and simple buildings;
- fences, roads and simple landscape elements;
- custom Codex-generated structures;
- later, voxelised 3D meshes.

The strongest challenge story is collaborative creation. The human is not selecting a fixed preset and watching an AI. The human and Codex iteratively decide what to make, see whether it is physically buildable, change it, then construct it together.

A bridge or aqueduct is a priority showcase. It has repeated geometry that can be generated and validated with deterministic maths, and it gives a strong human/AI metaphor: both sides can build toward the middle while MCP acts as the bridge between intent, planning and physical action.

## Competition priorities

In order:

1. Deliver a reliable, beautiful, live WebMCP demonstration.
2. Make human + Codex co-design the centre of the experience.
3. Prove that the final build is generated from live state and a real build plan, not prerecorded playback.
4. Make custom plans reusable through one stable JSON format.
5. Support both 2D and 3D construction through one compiler architecture.
6. Keep all compute local in the browser where practical.
7. Preserve deterministic build validation, recovery and shared human/agent state.
8. Add broader import formats only after the core loop is stable.

Arbitrary GLB/GLTF import is a stretch goal. It must not block the competition demo.

## Source and migration strategy

The current GitHub `main` is the repaired LOGO ROBO V2 baseline with one authoritative UR10 runtime, one `BuildBoard`, one revision clock, one runtime adapter, one perception service and one WebMCP registration path.

A newer Co-Build prototype exists outside the repository and is the preferred next feature foundation because it already contains the stronger build-planning concepts, including multi-part construction, support relationships, assembly ordering, hologram display, BOM data, human/agent claims and plan adaptation.

Migration rule:

1. Preserve the current GitHub `main` as a known recovery point.
2. Import the exact Co-Build prototype unchanged into a dedicated baseline branch first.
3. Verify that baseline before architectural edits.
4. Create the universal BuildPlan work from that baseline.
5. Merge into `main` only after the new baseline passes its required tests and browser checks.

Do not combine baseline import, BuildPlan redesign, GLB voxelisation and robot visual replacement in one change.

## Two-plane architecture

LOGO ROBO has two separate conceptual planes.

### Design plane

The design plane turns human/Codex intent into an immutable robot-buildable plan.

`User + Codex`

`-> Source / BuildSpec`

`-> canonical cells or VoxelModel`

`-> brick packing`

`-> support + connection graph`

`-> assembly DAG`

`-> BuildPlan v1`

`-> Preview Studio + BOM + validation`

The design can be edited and recompiled many times. It does not mutate the live physical world until the user approves it for construction.

### Execution plane

The execution plane performs the approved plan in the shared robot world.

`BuildPlan v1`

`-> workcell adapter`

`-> BuildBoard + RobotController`

`-> Runtime`

`-> Perception/WebMCP + Renderer`

The existing single-authority rule remains mandatory:

`RevisionClock -> BuildBoard + RobotController -> Runtime -> Perception/WebMCP + Renderer`

The design system must never create a second accepted robot or board state.

## BuildPlan v1 — universal construction contract

The next architectural milestone is a stable JSON build-plan format.

Every source type must compile to the same BuildPlan. The runtime must consume the same BuildPlan regardless of whether the source was a logo, bridge, house, procedural generator, painted preview or future 3D mesh.

BuildPlan coordinates are local construction coordinates, not machine coordinates.

Recommended base grid:

- X/Y: LEGO stud units;
- stud pitch: 8 mm;
- Z: brick layers;
- standard brick layer: 9.6 mm initially.

A minimal placement record contains:

- stable placement ID;
- part type;
- colour;
- local X stud coordinate;
- local Y stud coordinate;
- layer/Z coordinate;
- rotation in 90-degree increments;
- dependency/support IDs where needed;
- optional construction group or actor hint.

Example:

```json
{
  "schemaVersion": "logo-robo.buildplan.v1",
  "title": "Three Arch Aqueduct",
  "grid": {
    "studPitchMm": 8,
    "layerHeightMm": 9.6
  },
  "placements": [
    {
      "id": "p0001",
      "partType": "2x4",
      "colour": "sand",
      "x": 0,
      "y": 0,
      "layer": 0,
      "yawQuarterTurns": 0,
      "dependsOn": []
    }
  ]
}
```

BuildPlan must also expose enough summary data for the Preview Studio:

- plan dimensions;
- total part count;
- count by part type;
- count by colour;
- layer count;
- compiler/settings metadata;
- validation result;
- deterministic plan ID/hash.

Machine XYZ must not be stored as the authoritative design representation. The workcell adapter performs the explicit local-plan-to-machine transform and validates reachability before execution.

## Brick catalogue

Do not start with a large LEGO catalogue.

The competition path should use the smallest useful robot-compatible part set.

Priority catalogue:

1. 2×4 brick;
2. 2×2 brick;
3. add 1×2 / 1×4 only when they materially improve build quality;
4. add 1×1 only when required for detail or edge filling.

Each part definition must contain:

- stud footprint;
- physical dimensions;
- supported rotations;
- gripper capture information;
- collision bounds;
- placement/support rules.

The compiler should prefer larger compatible parts to reduce robot actions and build time.

## Canonical cell and voxel model

The compiler needs a representation that is independent of final brick choice.

### 2D

A 2D source becomes a coloured stud-cell grid.

`image/logo -> coloured cells -> brick packer -> BuildPlan`

The existing image mosaic path should be migrated to this model rather than replaced with a separate system.

### 3D

A 3D source becomes a coloured occupancy grid:

`VoxelModel[x, y, z] = empty | colour`

Initially:

- X/Y voxel = one stud;
- Z voxel = one brick layer.

The voxel model is an intermediate compiler representation only. The final plan should contain legal bricks, not thousands of 1×1 voxel cubes.

### Resolution/detail

Resolution is a user-facing design control because it directly affects shape fidelity, part count and build time.

The Preview Studio should show the effect immediately, for example:

- Low detail — 74 parts;
- Medium detail — 183 parts;
- High detail — 491 parts.

The compiler must place hard limits on voxel dimensions and part count so a user cannot accidentally generate an impractical plan.

## Universal compiler pipeline

All build sources should converge on this pipeline:

1. Parse or generate source.
2. Normalise scale and orientation.
3. Rasterise/voxelise to canonical coloured cells.
4. Quantise colours to the active physical palette.
5. Remove invalid or disconnected noise where appropriate.
6. Pack same-colour cells into legal bricks.
7. Prefer larger parts where safe.
8. Improve layer seam staggering and structural connectivity.
9. Generate support/connection relationships.
10. Generate an assembly DAG/build order.
11. Validate part inventory, support, access and workcell constraints.
12. Emit immutable BuildPlan v1.

The compiler must be deterministic for identical inputs and settings.

## Brick packing

Brick packing is the universal optimiser between voxels/cells and the physical plan.

At minimum it must enforce:

- exact coverage of occupied cells;
- same colour within one brick;
- no overlap;
- legal part footprints and rotations;
- support from the layer below where required;
- no impossible floating placements;
- robot-compatible grasp and placement orientation.

Optimisation order should favour:

1. buildability;
2. stability;
3. fewer placements;
4. seam staggering;
5. visual fidelity.

Do not optimise only for minimum brick count if that creates a weak or inaccessible construction.

## Source adapters

### Priority 1 — Codex / procedural BuildSpec

Codex should create and edit a higher-level `BuildSpec`, not directly manipulate robot machine coordinates.

Examples:

- bridge length, width, pier spacing and arch count;
- house footprint, height, openings and colours;
- fence length and height;
- logo/image source and palette.

The BuildSpec is compiled into BuildPlan.

This gives Codex a safe, expressive design interface while keeping robot execution primitive.

### Priority 2 — 2D image/logo

Support PNG/JPEG/WebP and generated patterns.

Pipeline:

`image -> coloured stud cells -> brick packing -> BuildPlan`

Controls:

- fit/crop;
- output dimensions;
- detail/resolution;
- active colours;
- part budget.

### Priority 3 — manual preview editing

Users must be able to modify the compiled result visually.

Minimum editing:

- paint colour;
- erase/add cells where practical;
- choose active palette;
- recompile/repack.

The preview editor should edit the design representation, then regenerate BuildPlan. It should not manually corrupt live machine targets.

### Priority 4 — GLB/GLTF mesh import

Stretch goal only after BuildPlan, Preview Studio and Co-Build are stable.

Potential pipeline:

`GLB/GLTF -> scale/orient -> voxelise -> sample mesh/material colour -> VoxelModel -> pack -> BuildPlan`

Required mesh decisions include:

- solid versus shell mode;
- watertight/non-watertight handling;
- material and texture colour sampling;
- thin-feature filtering;
- disconnected-component filtering;
- voxel-resolution limits.

This must run locally in the browser if included in the challenge site. Do not add paid server compute as a dependency.

## Preview / Design Studio

The current compiler/debug concept should evolve into a first-class Design Studio.

The centre of the Studio is a live 3D hologram of the compiled BuildPlan.

Minimum UI:

- orbit/zoom/pan 3D preview;
- hologram/solid display toggle;
- layer slider or layer isolate mode;
- plan dimensions;
- total part count;
- counts by part type;
- counts by colour;
- active palette;
- detail/resolution control;
- part-budget control;
- simple paint/recolour mode;
- buildability status and warnings;
- `BUILD TOGETHER` approval action.

A material/BOM area should visually show the required inventory, similar to a pile or tray of materials beside the hologram.

Example:

```text
RED
2x4  24
2x2   8

WHITE
2x4  12

TOTAL 44 PARTS
```

Every material count must come from the exact BuildPlan that will be executed.

## Codex co-design loop

Co-design is a core product feature, not optional polish.

Target interaction:

1. User: "Build a Roman aqueduct."
2. Codex creates or edits a BuildSpec.
3. Compiler creates BuildPlan.
4. Hologram and BOM update.
5. User: "Make it longer and add a third arch."
6. Codex changes the BuildSpec.
7. Plan recompiles and validates.
8. User changes colour/detail manually or by language.
9. User approves the final plan.
10. Human and robot construct it together.

Codex should be able to reason about compiler feedback such as:

- too many parts;
- outside workcell;
- unsupported section;
- insufficient inventory;
- unreachable placement;
- blocked gripper approach.

It can then revise the design rather than sending unsafe robot actions.

## Hologram during construction

The same BuildPlan should drive both design preview and live build guidance.

During construction, the renderer can show:

- completed parts as solid;
- unbuilt plan as transparent hologram;
- next available placements highlighted;
- human claims and agent claims;
- current layer;
- contribution/progress state.

The hologram is a view of BuildPlan and BuildBoard state. It is not a second construction authority.

## Assembly DAG and buildability

3D structures cannot use a simple "first empty target" rule.

Every plan needs an assembly dependency graph.

A placement becomes ready only when its required supports/dependencies are satisfied.

Validation should include:

- valid support footprint;
- no unsupported floating part;
- reasonable structural connectivity;
- collision-free gripper approach;
- reachable target pose;
- required inventory available;
- build order does not permanently trap later placements.

For bridges and aqueducts, deterministic structural templates can add stronger domain-specific rules, such as symmetrical pier growth and controlled arch closure.

## Human + agent Co-Build

Co-Build remains one shared physical world.

The human and Codex/agent may:

- claim ready placements;
- work on separate regions;
- work from opposite ends of a bridge;
- adapt when the other actor completes a task first;
- detect changed world state and replan.

Contributions must come from accepted physical placement actor identity.

For the bridge showcase, a preferred collaboration strategy is:

- human begins one side;
- agent begins the other side;
- both follow the same dependency graph;
- available work changes as each side progresses;
- the structure meets in the middle.

## Game modes

### Co-Build — primary

Human + Codex construct one approved BuildPlan in one shared world.

This is the main competition mode.

### Race — secondary

Human and agent build equivalent plans on explicit separate board instances. The worlds must remain distinct and must not be confused with Co-Build state.

### Design-only / Preview

User and Codex can iterate on structures without starting robot execution.

### Templates

Templates are starting points, not separate architectures.

Priority templates:

- logo/pattern;
- bridge;
- aqueduct;
- simple house;
- fence/wall.

## State authority

`RobotController` owns:

- accepted TCP;
- accepted joint values;
- planning/moving/idle state;
- held part;
- motion limits;
- cancellation epoch;
- robot revision.

`BuildBoard` owns live execution state for the approved plan:

- target placements;
- occupancy;
- claims;
- correctness;
- ready/blocked/completed state;
- human/agent contribution.

Both use the same `RevisionClock`.

Read-only design preview does not change the live world revision.

Approving/loading a new BuildPlan into the live workcell is an explicit session transition. Do not silently replace a plan while the robot is moving or holding a part.

## Workcell adapter

Compiler coordinates and robot coordinates remain explicitly separated.

The workcell adapter must:

- position and orient the local BuildPlan in the challenge workcell;
- convert studs/layers to machine millimetres;
- validate plan bounds;
- validate target reachability;
- generate/validate physical inventory layout;
- reject a plan that cannot fit the active workcell.

Local design coordinates must never be treated as machine XYZ without this transform.

## Robot and gripper visual integration

The latest high-quality UR10 and animated gripper should be integrated only after the BuildPlan boundary and Preview Studio are stable.

The visual robot must remain a renderer of accepted `RobotController` state. It must not introduce another motion authority.

The real gripper animation can follow latch/unlatch state, but grasp success remains controlled by the authoritative manipulation logic.

## Perception

Perception remains simulator-native structured observation, not computer vision.

It should expose enough information for the agent to act through primitive tools:

- object/part IDs;
- target IDs;
- centres and bounds;
- visibility approximation;
- state;
- recommended grasp/placement TCP where appropriate;
- atomic snapshot world revision.

Do not present simulator projection as real image recognition.

## WebMCP

Robot-control WebMCP remains primitive and Cartesian-only.

The execution API should not expose hidden `build_structure` or `execute_plan` playback tools.

Core physical tools remain conceptually:

- read build state;
- read robot state/workspace;
- observe world/camera;
- claim task;
- move Cartesian tool;
- latch;
- unlatch;
- reset.

Every physical mutation requires the exact latest world revision.

Design interactions may use a separate safe design interface that edits BuildSpec/compiler settings, but design commands must not bypass the live robot controller.

## Safety model

The browser controller fails closed on:

- non-finite input;
- workspace violation;
- speed violation;
- IK failure;
- singularity-margin failure;
- branch-continuity violation;
- tool/workcell collision;
- free or placed part collision;
- held-part collision;
- conservative link/raised-workcell collision;
- self-collision;
- stale world revision;
- cancellation;
- reset/session epoch change.

The controller rechecks live collision before each accepted motion sample.

Do not claim exact moving-link/table mesh collision fidelity until the project-owned visual robot is explicitly calibrated to the kinematic/collision model.

## Motion model

Cartesian segments use bounded triangular/trapezoidal time profiles.

Configured speed is a peak speed cap, not an average-speed label.

Joint speed and joint acceleration remain bounded by segment-time scaling where needed.

## Browser and compute policy

The main challenge page must work without runtime CDN dependence where practical.

WebMCP is progressive enhancement. Manual simulation and design preview must remain usable when native WebMCP is unavailable.

Core compilation should run client-side.

Do not require paid cloud compute for:

- image conversion;
- BuildSpec compilation;
- brick packing;
- plan validation;
- preview rendering;
- future mesh voxelisation if included.

## Scope control — what not to build first

Do not make these blockers for the challenge submission:

- arbitrary GLB/GLTF import;
- large LEGO part catalogues;
- exact rigid-body physics;
- cloud compute services;
- photorealistic robot contact simulation;
- automatic structural-engineering claims;
- complex curved/special bricks.

A robust bridge/aqueduct + logo + Codex custom BuildSpec workflow is more valuable than many partially working import formats.

## Implementation order

### P0 — preserve the strongest current Co-Build baseline

1. Import the exact current Co-Build prototype to a dedicated baseline branch.
2. Verify it unchanged.
3. Record test/browser status.
4. Keep current `main` as recovery until migration is accepted.

### P1 — BuildPlan boundary

1. Define `logo-robo.buildplan.v1`.
2. Add schema validation and deterministic IDs.
3. Make existing Co-Build compilers emit BuildPlan.
4. Make existing hologram/BOM/assembly logic consume BuildPlan.
5. Preserve current behaviour with regression tests.

This is the highest-priority architectural change.

### P2 — Design / Preview Studio

1. Promote the hologram to the main design preview.
2. Add orbit/zoom/pan.
3. Add dimensions and exact BOM.
4. Add layer viewing.
5. Add palette controls.
6. Add detail/resolution and part-budget controls.
7. Add simple recolour/paint.
8. Add clear buildability status.
9. Add explicit `BUILD TOGETHER` approval.

### P3 — Codex co-design + showcase structures

1. Expose safe BuildSpec editing.
2. Add bridge/aqueduct parametric generator.
3. Keep house/fence/logo as templates using the same compiler.
4. Let Codex react to validation feedback and regenerate.
5. Demonstrate user/agent building from separate sides of one bridge.

### P4 — universal cell/voxel compiler

1. Formalise the canonical coloured cell/VoxelModel.
2. Route 2D image conversion through it.
3. Route it through the common brick packer.
4. Add 3D voxel structures generated from BuildSpec.
5. Add resolution limits and part-count safeguards.

### P5 — polish and stretch work

1. Integrate the latest high-quality UR10 and animated gripper.
2. Improve hologram and material presentation.
3. Add GLB/GLTF voxelisation only if schedule permits.
4. Add more brick types only when needed.

## Testing policy

Tests remain read-only by default.

The final release suite should prove both design-plane and execution-plane invariants.

### Design/compiler tests

- BuildPlan schema validation;
- deterministic compile/hash;
- no overlapping parts;
- exact colour/part BOM counts;
- valid support graph;
- acyclic assembly DAG;
- stable 2D image compilation;
- resolution/part-budget bounds;
- bridge/aqueduct deterministic generation;
- compiler local coordinates remain independent of machine coordinates.

### Execution tests

- FK/IK;
- singularity handling;
- speed/acceleration bounds;
- reset and queued-operation cancellation;
- latch/release concurrency protection;
- live human interference;
- wrong-colour and occupied-target behaviour;
- one shared world revision;
- perception snapshot/read-only behaviour;
- WebMCP schemas, stable errors and cancellation;
- explicit BuildPlan-to-machine mapping;
- ready/blocked dependency handling;
- complete primitive co-build round;
- persistent reliability testing.

### Co-design acceptance test

A release-quality showcase should prove:

1. a user/Codex design change alters the compiled plan;
2. the hologram and BOM update from that exact plan;
3. validation passes;
4. the approved plan enters the shared workcell;
5. human and agent complete placements through the same BuildBoard;
6. final progress reaches 100%;
7. contribution accounting is exact.

## Evidence policy

Old Oracle/Newton evidence is not release proof.

`python scripts/verify.py` remains read-only unless evidence generation is explicitly requested.

Release packaging must include reproducible verification and a SHA-256 file manifest.

## Public-release gate

Before publication:

- verify the final source ZIP hash;
- verify no local/private paths, credentials or private assets are included;
- confirm licence/provenance for all redistributed source and assets;
- run a clean-browser smoke test;
- validate design -> BuildPlan -> preview -> approval -> execution end to end;
- validate at least one 2D logo plan;
- validate at least one bridge/aqueduct Co-Build plan;
- run native WebMCP enumeration/call/cancel acceptance if the supported challenge browser exposes it;
- record external gates that could not be run rather than claiming they passed.

## Target challenge demonstration

Preferred final sequence:

1. User asks Codex to build a bridge or aqueduct.
2. Codex generates a buildable design.
3. Hologram appears with dimensions and exact materials.
4. User asks for a design change, such as another arch or a colour change.
5. Hologram and BOM update immediately.
6. User changes detail/resolution and sees the part-count trade-off.
7. User approves `BUILD TOGETHER`.
8. Human begins on one side while Codex controls the UR10 on the other.
9. Both use the same live plan, claims, dependencies and world revision.
10. They meet in the middle and complete the structure.

This demonstration expresses the product in one sentence:

**Human and AI design together, plan together and build together.**

See `FULL_REMEDIATION_PLAN_5_6_PRO.md` for the existing runtime/safety acceptance foundation. Future implementation plans must preserve its single-authority and fail-closed execution principles unless that document is deliberately superseded by tested evidence.
