# V2 Terrain Generator API

The pure generator is exported from `src/v2/index.js`. It has no Three.js dependency.

## `generateChallenge(seed, settings)`

Returns a frozen result object containing:

- `sourceSettings` — validated canonical V2 settings before secondary stretching;
- `settings` — effective world-space settings after secondary stretching;
- `heightField` / `heights` — authoritative `Float32Array` top surface;
- `slopes` — sampled local gradient magnitudes;
- `displacementMask` — final allowed corruption weights;
- `platformMask` — protected platform grid samples;
- `supportMask` — authoritative binary support samples;
- `obstacle` — exact generated centreline and widths;
- `platforms.left` / `platforms.right` — explicit protected polygons and shared plane;
- `entry`, `exit`, and `corridor` — route contract;
- `supportRegions` — conservative mask-derived rectangles with stable IDs;
- `meshData` — positions, normals, indices, material IDs, counts, and bottom Y;
- `waterMeshData` — river strip data, or `null` for non-river modes;
- `checksums` — height, support, mesh, and challenge checksums;
- `timings` — validation, height, support, mesh, export, and total times;
- `state` — V3 `ChallengeState` export object;
- `api` — spatial terrain-query methods.

Invalid or mutually impossible settings throw `TerrainGenerationError` with a stable `code` and structured `details` before large arrays are allocated.

### Secondary XYZ post-process

`stretchX`, `stretchY`, and `stretchZ` default to `1` and accept positive values from `0.1` through `5` in the generator API (the UI exposes the practical `0.25` through `3` range). The canonical mountain is generated first, then transformed about the world origin:

- X stretches the crossing direction, obstacle width, ENTRY/EXIT separation, and platform length;
- Y stretches all elevations, relief, base thickness, water level, and clear height;
- Z stretches the obstacle direction, platform width, deck width, and vehicle clear width.

After transformation, slopes and supportability are recomputed and mesh normals are rebuilt. `getHeightAt`, `getSlopeAt`, ENTRY/EXIT, corridor dimensions, water, support regions, mesh positions, and `ChallengeState.json` therefore use the same effective coordinate system. The export records `terrain.postProcess.axisStretch` and the canonical `sourceDimensions`.

### Mound envelope settings

`moundFalloffWidth` controls the width of the analytic side and longitudinal mountain envelopes. `moundEdgeDrop` defines the exact ground shelf as `sharedTopY - moundEdgeDrop`; both outer bank edges reach that elevation. `mountainPeakScale` raises or lowers the unclipped mountain before it is clamped to `sharedTopY`, creating deterministic flat caps without starting from a slab. A zero edge drop preserves the completely flat integration fixture.

`ridgeAmplitude`, `ridgeScale`, `ridgeWarpAmplitude`, and `ridgeWarpScale` control a three-octave ridged multifractal sampled through a separate deterministic warp stream. The analytic mountain/ravine shape owns the high-ground classification; ridge, macro, slope, and detail corruption cannot create or sever bank components. Protected approach spines connect both exact pads to their respective bank bodies.

## Query API

### `api.getHeightAt(x, z)`

Returns bilinear height from the final height field. Protected-platform queries return `sharedTopY` exactly. Queries outside the chunk clamp to its boundary.

### `api.getSlopeAt(x, z)`

Returns the interpolated rise/run magnitude. Protected-platform queries return zero exactly.

### `api.getNormalAt(x, z)`

Returns a unit `{x, y, z}` normal derived from the final height field. Protected platforms return `{x: 0, y: 1, z: 0}` exactly.

### `api.isSupportable(x, z)`

Returns `false` outside the chunk. Exact grid queries agree with `supportMask`; between-grid queries are conservative and require all four surrounding samples to be supportable. Protected-platform points are always supportable by construction.

### `api.getObstacleAt(z)`

Returns `{centreX, floorHalfWidth, shoulderWidth}` interpolated from the generated obstacle centreline.

### `api.getTerrainBounds()`

Returns `{minX, maxX, minZ, maxZ}`.

### `api.getGridSample(ix, iz)`

Returns the exact world position, height, slope, and support flag for one authoritative grid sample. Invalid indices throw `RangeError`.

## Coordinate convention

- `x` / local `u`: crossing direction; left is negative and right is positive.
- `z` / local `v`: obstacle direction.
- `y`: height.
- ENTRY is on the left platform and EXIT is on the right platform.

## Mesh contract

`meshData` contains one watertight indexed volume. `validateWatertightMesh(meshData)` verifies finite values, valid indices, no degenerate triangles, edge degree two, one connected component, and non-zero signed volume. Full topology validation is intentionally a test/evidence operation; normal runtime generation does not pay its map-allocation cost.

## Export

`serialiseChallenge(result.state)` returns stable-key-order pretty JSON with a trailing newline. The export remains `version: 3`; Terrain Generator V2 is recorded in `terrain.generatorVersion`.
