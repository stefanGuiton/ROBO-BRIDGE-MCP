# ROBO BRIDGE MCP — V2 Terrain Generator Plan

**Status:** Plan only; no implementation in this document
**Scope:** `PROTOTYPES/01_Terrain_Challenge/` only
**Generator version:** Terrain Generator V2
**Export contract:** V3 `ChallengeState` remains version `3`

## 1. Purpose

Terrain Generator V2 will create a deterministic, watertight terrain chunk for bridge challenges.

Every generated challenge must contain:

- exactly one left land mass;
- exactly one right land mass;
- exactly one separating obstacle corridor;
- one protected flat platform on the left;
- one protected flat platform on the right;
- both platforms on the exact same horizontal plane;
- a closed outer volume with top, side walls and bottom cap;
- controlled procedural displacement outside protected engineering regions;
- a valid ENTRY on the left and EXIT on the right;
- a route and clearance envelope crossing the obstacle;
- support data that agrees with the height and slope query API.

The generator knows nothing about bridge bricks, robot placement, structural simulation or train physics.

## 2. Visual analysis of the mountain concepts

### 2.1 Variant A — broad mountain pass

This is the best base for the default mountain mode.

Useful qualities:

- two unambiguous land masses;
- broad top areas that can contain large protected build platforms;
- one wide valley with a readable crossing direction;
- tall continuous valley walls;
- a strong closed-volume silhouette;
- enough slope area for procedural rock corruption without affecting the build planes.

Required corrections:

- the visible top surfaces are not mathematically flat;
- stepped shelves cannot enter the protected platform footprints;
- both build platforms must use one exact shared height;
- the valley should be parameterised by a centreline and signed-distance field, not sculpted independently on each side.

Recommended use: `MOUNTAIN_PASS` default preset.

### 2.2 Variant B — narrow alpine ravine

This is visually dramatic but is not safe as the default geometry.

Useful qualities:

- strong vertical scale;
- a clearly separated left and right side;
- a difficult narrow crossing;
- excellent visual reference for slope corruption, rock exposure and cliff materials.

Required corrections:

- the ravine is too narrow for stable support search and camera readability;
- the rim shelves are too small and irregular;
- the mountains contain several competing peaks rather than two controlled bank components;
- the top silhouettes are not coplanar;
- the extreme walls need bounded slope and clearance rules.

Recommended use: `ALPINE_RAVINE` expert preset after the default mountain mode passes.

### 2.3 Variant C — asymmetric highland valley

This is a useful warning and a useful secondary reference.

Useful qualities:

- a smooth, readable valley profile;
- broad plateaus;
- a clean cross-section silhouette;
- asymmetry makes procedural terrain feel less artificial.

Conflict with the V2 invariant:

- the two top elevations are visibly different.

V2 may use asymmetric outer silhouettes, slope shapes and secondary ridges, but the left and right protected build platforms must remain exactly coplanar. Asymmetry is allowed only outside the protected platforms.

Recommended use: corruption/silhouette reference, not a direct preset contract.

## 3. Non-negotiable invariants

### 3.1 Two-side invariant

The challenge-local crossing axis is `u`:

- left bank: negative `u`;
- right bank: positive `u`;
- valley centre: near `u = 0`;
- obstacle direction: challenge-local `v`;
- height: `y`.

The valley must cross the complete chunk in the `v` direction and separate the high ground into exactly two connected components.

The generator may later rotate this local frame into world space, but it must preserve the semantic IDs `left` and `right`.

### 3.2 Shared build-plane invariant

Both protected platform surfaces must use one value:

```text
leftPlatform.planeY === rightPlatform.planeY === sharedTopY
```

Within each complete platform polygon:

```text
height(u, v) = sharedTopY
slope(u, v) = 0
normal(u, v) = (0, 1, 0)
displacementMask(u, v) = 0
```

No noise, terraces, smoothing error or interpolation may change those values.

The protected platform must be larger than the transport deck footprint. The first default should reserve:

```text
platformWidth  >= deckWidth + 2 * sideMargin
platformLength >= approachLength + padMargin
```

### 3.3 Closed-volume invariant

The rendered terrain is one closed visual volume:

- height-field top surface;
- four perimeter skirts;
- bottom cap;
- consistent winding;
- no holes;
- no open edges;
- no separate floating bank meshes.

Every undirected mesh edge must belong to exactly two triangles.

### 3.4 Single-source terrain invariant

One generated height field must drive:

- top-surface rendering;
- `getHeightAt`;
- `getSlopeAt`;
- build-platform validation;
- supportability;
- ENTRY/EXIT placement;
- corridor validation;
- future approximate collision input.

The closed skirts and bottom cap are derived render geometry. They are not a second terrain authority.

### 3.5 Determinism invariant

Canonical settings plus a seed and generator version must produce identical:

- height-field checksum;
- obstacle centreline samples;
- left/right platform polygons;
- ENTRY/EXIT transforms;
- support mask checksum;
- mesh positions and indices;
- exported `ChallengeState` ordering.

## 4. V2 terrain model

V2 should generate a valid macro shape first, then add bounded detail.

```text
validated settings
-> deterministic random streams
-> local challenge frame
-> base solid chunk
-> valley signed-distance field
-> left/right macro elevation
-> protected build platforms
-> masked procedural displacement
-> final Float32 height field
-> support mask and regions
-> ENTRY/EXIT and corridor
-> watertight render mesh
-> ChallengeState
```

### 4.1 Base macro surface

Define a valley centreline in challenge-local coordinates:

```text
valleyCentre(v)
= centreOffset
+ centreNoiseAmplitude * simplex1D(v / centreNoiseScale)
```

Define signed lateral distance:

```text
d(u, v) = abs(u - valleyCentre(v))
```

Define three lateral zones:

1. valley floor: `d <= floorHalfWidth`;
2. transition/cliff: `floorHalfWidth < d < floorHalfWidth + shoulderWidth`;
3. bank top: beyond the transition.

The base height should be a continuous deterministic profile:

```text
bankBlend = smootherstep(0, 1, normalisedShoulderDistance)
baseHeight = valleyFloorY + bankBlend * (sharedTopY - valleyFloorY)
```

Mountain mode increases the difference between `sharedTopY` and `valleyFloorY`. It does not independently raise one protected platform above the other.

### 4.2 Mode profiles

#### `flat-gap`

- zero top noise;
- wide flat left/right banks;
- simple rectangular or softly rounded gap;
- shallow visual base thickness;
- integration fixture and compiler reference.

#### `ravine`

- medium valley depth;
- smooth low-frequency centre variation;
- moderate shoulders;
- restrained slope displacement.

#### `river`

- ravine-like bed;
- deterministic water ribbon derived from the exact valley centreline;
- constant or gently varying water level;
- no fluid simulation.

#### `mountain-pass`

- high `sharedTopY - valleyFloorY` difference;
- broad bank plateaus;
- steep but bounded shoulders;
- strong rock/slope corruption outside platforms;
- valley floor remains wide enough for visual readability.

#### `alpine-ravine`

- expert preset;
- deeper and narrower than mountain pass;
- minimum platform and clearance dimensions still enforced;
- stronger slope corruption but identical protected-plane rules.

## 5. Protected build platforms

### 5.1 Platform representation

Each platform is explicit contract data:

```ts
type TerrainPlatform = {
  id: "left-platform" | "right-platform";
  side: "left" | "right";
  centre: Vec3;
  planeY: number;
  width: number;
  length: number;
  forward: Vec3;
  polygon: Vec2[];
};
```

### 5.2 Exact flattening

Do not multiply arbitrary terrain heights toward zero.

Use explicit masks:

```text
platformCoreMask = 1 inside exact platform polygon
platformBlendMask = smooth falloff around platform perimeter

height = sharedTopY                         inside core
height = mix(rawHeight, sharedTopY, blend) in blend ring
height = rawHeight                          outside blend ring
```

The core boundary must align to or be conservatively rasterised onto height-field samples so interpolation cannot reintroduce slope inside the platform.

### 5.3 Platform placement

The generator must search deterministic candidate locations rather than assume `u = +/- fixedOffset` is valid.

Candidate order must be stable:

1. derive the crossing centre and local obstacle normal;
2. create mirrored candidate distances on left/right;
3. evaluate complete platform footprints;
4. reject candidates intersecting the shoulder, chunk edge or clearance exclusion;
5. select the nearest valid symmetric pair;
6. apply exact flattening and blend rings;
7. validate the footprints again after final displacement.

The platforms may have different surrounding terrain, but they must have the same dimensions and `planeY` in the initial V2 contract.

## 6. Procedural displacement and corruption

V2 does not use erosion simulation. Detail comes from deterministic masked displacement.

### 6.1 Noise bands

Use seeded simplex noise with separate deterministic streams:

- macro domain warp: very low frequency, small centreline movement;
- mound variation: low frequency, broad silhouette variation;
- slope breakup: medium frequency, applied mainly to shoulders/cliffs;
- surface detail: high frequency, very low amplitude;
- terrace signal: optional quantised/smoothed banding for mountain slopes.

### 6.2 Displacement mask

```text
allowedDisplacement
= slopeMask
* outsidePlatformCoreMask
* platformBlendSafetyMask
* perimeterSafetyMask
* corridorSafetyMask
```

Rules:

- exactly zero displacement inside both platform cores;
- fade displacement to zero through platform blend rings;
- zero horizontal edge corruption at outer chunk seams;
- no displacement on skirts or bottom cap;
- bounded displacement near the corridor clearance volume;
- slope corruption may change visual normals and rock profile, but may not create a third connected bank or close the valley.

### 6.3 Corruption layers

Apply corruption in this order:

1. centreline domain warp;
2. broad bank silhouette variation;
3. slope-only medium noise;
4. optional smooth terraces;
5. very small surface noise;
6. material classification from final height and slope.

Every stage must preserve protected masks.

### 6.4 Material realism

Geological layers should initially be visual, not separate physical meshes.

Recommended material groups or shader inputs:

- grass/top material for low-slope exposed top surfaces;
- rock material for high slopes;
- soil strata on closed perimeter skirts;
- dark stone base near `bottomY`;
- water material only for river mode.

Side-wall strata can be generated from world `y`, seed-based colour variation and a small 2D noise function. This keeps the volume closed and inexpensive.

## 7. Watertight mesh construction

### 7.1 Top surface

- regular `gridU x gridV` indexed grid;
- positions copied from the final Float32 height field;
- stable triangle diagonal convention;
- normals calculated after final positions;
- optional material classification attribute.

### 7.2 Side skirts

For each perimeter edge:

- duplicate top boundary vertices when a hard normal/material seam is required;
- create vertical wall vertices at `bottomY`;
- join them with consistently wound indexed quads;
- preserve exact corner sharing or deliberate duplicated corner groups.

The visible side-wall top edge follows the terrain boundary height. The bottom edge is flat.

### 7.3 Bottom cap

- one flat bottom plane at `bottomY`;
- reversed winding relative to the top;
- no displacement;
- minimal subdivisions unless required for material mapping.

### 7.4 Mesh validation

Automated validation must check:

- finite vertex values;
- indices within bounds;
- non-degenerate triangles;
- every undirected edge has degree two;
- consistent outward winding;
- positive enclosed signed volume;
- one connected mesh component;
- no duplicate coincident surfaces;
- stable vertex/index checksum.

## 8. V2 settings contract

Suggested generator settings:

```ts
type TerrainGeneratorV2Settings = {
  generatorVersion: 2;
  seed: number;
  mode: "flat-gap" | "ravine" | "river" | "mountain-pass" | "alpine-ravine";

  chunkWidth: number;
  chunkDepth: number;
  baseThickness: number;
  gridU: number;
  gridV: number;

  sharedTopY: number;
  valleyFloorY: number;
  floorWidth: number;
  shoulderWidth: number;
  shoulderExponent: number;

  centreOffset: number;
  centreNoiseAmplitude: number;
  centreNoiseScale: number;

  platformWidth: number;
  platformLength: number;
  platformSetback: number;
  platformBlendWidth: number;

  macroAmplitude: number;
  macroScale: number;
  slopeNoiseAmplitude: number;
  slopeNoiseScale: number;
  detailAmplitude: number;
  detailScale: number;
  terraceStrength: number;
  terraceCount: number;

  deckWidth: number;
  vehicleClearWidth: number;
  vehicleClearHeight: number;
  railMode: "rail-single" | "rail-double" | "road";

  maxSupportSlope: number;
  minEdgeMargin: number;
};
```

Validation must reject non-finite, negative or mutually impossible settings before allocating arrays.

## 9. Runtime data model

Suggested pure generator result:

```ts
type TerrainGeneratorV2Result = {
  settings: TerrainGeneratorV2Settings;
  frame: {
    origin: Vec3;
    crossingAxis: Vec3;
    obstacleAxis: Vec3;
    up: Vec3;
  };
  heightField: Float32Array;
  supportMask: Uint8Array;
  obstacle: {
    centreline: Vec3[];
    floorHalfWidths: Float32Array;
    shoulderWidths: Float32Array;
  };
  platforms: {
    left: TerrainPlatform;
    right: TerrainPlatform;
    sharedPlaneY: number;
  };
  entry: RouteAnchor;
  exit: RouteAnchor;
  corridor: TransportCorridor;
  supportRegions: SupportRegion[];
  meshData: {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    materialIds: Uint8Array;
  };
  checksums: {
    heightField: string;
    supportMask: string;
    mesh: string;
    challenge: string;
  };
  timings: TerrainGenerationTimings;
};
```

Three.js consumes `meshData`; it does not own or recalculate terrain truth.

## 10. Supportability and regions

### 10.1 Support mask

Calculate supportability per height-field sample from:

- obstacle exclusion;
- local slope;
- distance from chunk boundary;
- platform/core membership;
- optional material/rock exclusion;
- corridor exclusion where foundations must not intrude.

Protected platform cores are always supportable by construction.

### 10.2 Region extraction

Do not export entire bank rectangles.

Use the support mask to derive deterministic connected components or conservative polygons:

1. label connected supportable cells;
2. retain left and right bank components separately;
3. remove components below a minimum area;
4. trace/simplify conservative boundaries;
5. verify every exported polygon cell is supportable;
6. use stable ordering and IDs.

## 11. ENTRY, EXIT and corridor

- ENTRY is centred on the left protected platform.
- EXIT is centred on the right protected platform.
- both positions use `y = sharedTopY` exactly;
- both forward vectors use the final crossing axis;
- the centreline starts and ends on the protected platforms;
- the crossing portion remains close to the obstacle normal;
- the corridor owns deck width and vehicle clearance.

The debug renderer must display:

- both complete platform polygons;
- the shared plane datum;
- the centreline;
- the full vehicle-clearance volume;
- the support mask;
- obstacle floor and shoulder boundaries.

## 12. Deterministic presets

### `V2_FLAT_GAP_SMALL`

- integration fixture;
- zero corruption;
- wide level platforms;
- shallow closed chunk.

### `V2_RAVINE_SIMPLE`

- moderate valley depth;
- gentle centreline variation;
- low slope corruption.

### `V2_RIVER_SIMPLE`

- ravine bed plus centreline-derived water ribbon;
- flat platform pair;
- no water simulation.

### `V2_MOUNTAIN_PASS`

- visual basis: Variant A;
- tall, broad paired banks;
- wide valley floor;
- moderate rock corruption;
- large protected platforms.

### `V2_ALPINE_RAVINE`

- visual basis: Variant B;
- tall and narrow expert mode;
- guaranteed minimum platform shelves;
- stronger bounded corruption.

### `V2_CORRUPTION_STRESS`

- maximum allowed displacement and centreline warp;
- used to prove invariants, not as a default game preset.

## 13. Test plan

### 13.1 Golden determinism

For every preset:

- fixed seed/settings fixture;
- golden height checksum;
- golden support-mask checksum;
- golden mesh checksum;
- golden exported challenge JSON;
- same result in Node and supported browser.

### 13.2 Two-side topology

For every tested seed:

- exactly two high-ground connected components;
- left component contains left platform;
- right component contains right platform;
- obstacle separates them across the complete chunk depth;
- route crosses the obstacle.

### 13.3 Shared plane

For every platform vertex and interior sample:

```text
abs(height - sharedTopY) <= 1e-6
slope <= 1e-6
normal.y >= 0.999999
```

Also assert:

- left and right `planeY` are identical;
- both platform dimensions meet the minimum contract;
- a single flat test plane can contact both without terrain penetration;
- displacement and corruption are exactly zero inside cores.

### 13.4 Support truth

- every exported support-region sample returns `isSupportable === true`;
- every platform sample is supportable;
- no support region enters the obstacle or chunk safety margin;
- region ordering and IDs are stable.

### 13.5 Mesh closure

- all edge degrees equal two;
- one connected component;
- no invalid/degenerate triangle;
- positive volume;
- closed side and bottom bounds match settings;
- regeneration releases old Three.js resources.

### 13.6 Property tests

Run at least 1,000 bounded seeds across all presets and setting extremes.

For every run assert:

- no exception or NaN;
- all invariants hold;
- valid platforms found or generation fails with a structured reason;
- performance remains within budget.

### 13.7 Performance measurements

Measure separately:

- settings validation;
- height-field generation;
- platform search/flattening;
- support mask/region extraction;
- watertight mesh creation;
- normal/material generation;
- Three.js buffer upload;
- first rendered frame;
- steady-state FPS;
- repeated-regeneration GPU and heap counts.

## 14. Performance targets

Initial desktop targets at approximately 129 x 97 top samples:

- pure challenge generation median: `< 20 ms`;
- complete mesh-data generation median: `< 35 ms`;
- first visible regenerated frame: `< 75 ms`;
- steady render: `>= 60 FPS`;
- no terrain generation during animation frames;
- no growth in Three.js geometry/texture counts after 100 regenerations.

If higher mountain detail requires more geometry, prefer adaptive visual normal/material detail before increasing the authoritative height-field resolution.

## 15. Implementation layout

Suggested files:

```text
src/v2/
  contracts.js
  settings.js
  prng.js
  simplex.js
  challenge-frame.js
  valley-field.js
  platform-generator.js
  displacement.js
  height-field.js
  support-mask.js
  support-regions.js
  mesh-builder.js
  mesh-validation.js
  challenge-export.js
  checksums.js
  timings.js
  index.js

src/render/
  terrain-renderer.js
  water-renderer.js
  debug-overlays.js
  resource-disposal.js

tests/v2/
  golden-presets.test.js
  platform-plane.test.js
  topology.test.js
  support-regions.test.js
  mesh-closure.test.js
  property-seeds.test.js
  browser-render.test.js
  regeneration-memory.test.js
```

## 16. Phased implementation

### Phase 0 — freeze contracts

- agree coordinate frame and left/right semantics;
- freeze V2 settings and result shapes;
- keep `ChallengeState.version = 3`;
- define structured generation failures;
- add schema validation tests.

Exit gate: contracts reviewed before geometry work.

### Phase 1 — deterministic macro generator

- implement PRNG and simplex noise;
- implement signed-distance valley field;
- implement flat-gap and ravine macro surfaces;
- add golden checksums.

Exit gate: deterministic two-side topology without corruption.

### Phase 2 — protected shared platforms

- implement deterministic candidate search;
- generate left/right platform polygons;
- enforce exact shared plane;
- add blend rings;
- validate entire footprints.

Exit gate: all platform-plane tests pass over 1,000 seeds.

### Phase 3 — support truth

- compute support mask;
- derive conservative regions;
- place ENTRY/EXIT;
- generate the corridor and clearance data.

Exit gate: exported regions never contradict `isSupportable`.

### Phase 4 — procedural mountain detail

- add masked macro, slope and detail noise;
- add terraces and material classification;
- implement `MOUNTAIN_PASS` and `ALPINE_RAVINE`;
- prove corruption cannot alter platform cores or topology.

Exit gate: stress preset passes invariants.

### Phase 5 — watertight cross-section mesh

- build top surface, four skirts and bottom cap;
- add material groups/strata;
- add mesh closure validation;
- add river ribbon from centreline data.

Exit gate: one closed connected volume for every preset.

### Phase 6 — renderer and debug overhaul

- render generated mesh data without recalculating terrain;
- terrain-drape support overlays;
- show protected planes and shared datum;
- show real clearance envelope;
- show obstacle floor/shoulder bounds;
- add camera reset and consistent isometric default.

Exit gate: overlays accurately match query data.

### Phase 7 — acceptance and evidence

- run golden, property, topology, mesh and browser tests;
- measure full pipeline and resource lifecycle;
- export new example `ChallengeState.json`;
- update API and evidence documents;
- visually inspect all presets.

Exit gate: V2 acceptance matrix is fully green with raw results preserved.

## 17. Acceptance matrix

V2 is complete only when all are true:

1. Same seed/settings produce identical checksums.
2. Every challenge has exactly one left and one right bank component.
3. The obstacle separates the banks across the chunk.
4. Left and right protected platforms are exactly coplanar.
5. Every platform interior sample is flat and supportable.
6. A single flat plane can span the two platform datums without mismatch.
7. ENTRY and EXIT sit inside the protected platform polygons.
8. The route crosses the obstacle close to its local normal.
9. Exported support regions contain only supportable terrain.
10. Mountain corruption never modifies protected platforms.
11. Water follows the generated river centreline.
12. The mesh is one closed watertight volume with a bottom cap.
13. Height queries agree with rendered top-surface vertices.
14. Regeneration does not increase GPU or heap resource counts.
15. Generation, mesh construction and render timings meet their separate budgets.

## 18. Explicit non-goals

- no erosion simulation;
- no bridge generation;
- no bridge bricks;
- no UR10 or robot placement;
- no structural analysis;
- no train physics;
- no fluid simulation;
- no physical hardware connection;
- no integration into the main application during this prototype stage.

## 19. First recommended implementation target

Implement one deliberately simple vertical slice before mountain corruption:

```text
V2_MOUNTAIN_PASS seed 24001
-> two broad connected banks
-> one smooth valley
-> exact shared top plane
-> valid left/right platforms
-> support mask and regions
-> closed top/skirts/bottom mesh
-> deterministic checksums
```

Only after this passes should slope breakup, terraces, rock materials and the alpine expert mode be enabled.
