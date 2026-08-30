# Terrain Challenge API

The terrain module is independent of Three.js. Rendering consumes its `Float32Array`; queries never read mesh vertices.

## `generateChallenge(seed, settings)`

Returns `{ state, settings, heights, api, generationMs }`. `state` follows the V3 `ChallengeState` contract: top-level `mode` is the transport family (`rail`), while `challengeMode` and `terrain.obstacle.type` identify `gap`, `ravine`, or `river`.

## `api.getHeightAt(x, z)`

Returns the bilinearly interpolated height in world units, clamped to the terrain bounds. At grid sample positions it is identical to the rendered height-field value.

## `api.getSlopeAt(x, z)`

Returns the local height gradient magnitude. It is dimensionless (rise/run).

## `api.isSupportable(x, z)`

Returns `true` only outside the obstacle transition and at or below `maxSupportSlope`.

## `api.getTerrainBounds()`

Returns `{ minX, maxX, minZ, maxZ }` in world coordinates.

## Coordinate convention

- `x`: along the obstacle;
- `z`: normal to the obstacle and normally the bridge crossing direction;
- `y`: height;
- ENTRY is on negative `z`, EXIT on positive `z`.

## Determinism

The generator uses integer hashing, smooth value noise, fixed octave weights, stable iteration order, and a `Float32Array`. No system randomness or time enters challenge generation.
