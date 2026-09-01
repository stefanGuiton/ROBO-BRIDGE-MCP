# ROBO BRIDGE V4.6 production bridge core

## Status

This package is ready for MAIN_DEMO integration review.

It is not merged into MAIN_DEMO. It does not change GitHub.

Source repository HEAD used:

`b66cc07c7be7c9743338611edc794d5805d2066f`

Completed WebMCP checkpoint used:

- branch: `oracle/webmcp-bridge-design-v1`
- head: `59a3d1458f7edfab074f6d0dfddd6e18fd0bf848`

## Purpose

This package extracts the useful V4.6 compiler and BuildPlan logic from the standalone HTML.

The production flow is:

```text
BridgeSpec
-> V4.6 compiler core
-> BuildPlan 4.6
-> explicit world transform
-> hologram data
-> construction stream data
```

The package does not create or import:

- `BuildBoard`;
- `PlacementAuthority`;
- `RobotController`;
- a second revision clock;
- the V4.6 `BuildExecutionEngine`;
- procedural submission terrain.

MAIN_DEMO keeps all accepted construction and robot authority.

## Main modules

- `bridge-compiler-service.js`: asynchronous compiler interface.
- `v46-compiler-core.js`: DOM-free V4.6 geometry, raster, packing, and custom-arch compiler.
- `buildplan-adapter.js`: authoritative BuildPlan 4.6 builder.
- `bridge-host.js`: atomic, revision-safe host for the completed WebMCP package.
- `world-transform.js`: one explicit bridge-local to MAIN_DEMO transform.
- `hologram-adapter.js`: exact BuildPlan to renderer data.
- `three-hologram-adapter.js`: Three.js instanced hologram consumer.
- `construction-adapter.js`: exact BuildPlan to logical placement stream and BuildBoard targets.
- `custom-part-geometry.js`: custom arch and track geometry registry.
- `bridge-freeze.js`: immutable BUILD-start snapshot.
- `support-profile.js`: deterministic support-height input. It is not a terrain generator.

## Quick start

```js
import {
  createBridgeHost,
  createHologramSnapshot,
  createConstructionPlacementStream,
  freezeBridgePlan
} from './src/index.js';

const host = await createBridgeHost({
  initialSettings: { family: 'aqueduct' },
  challengePolicy: 'locked',
  challenge: {
    span: 220,
    roadY: 75,
    worldTransform: {
      translationMm: { xMm: 620, yMm: 0, zMm: 30 },
      yawDeg: 0,
      scale: 1
    },
    supportProfile: { type: 'flat', heightY: 0 }
  }
});

const hologram = createHologramSnapshot(host.buildPlan, host.worldTransform);
const construction = createConstructionPlacementStream(host.buildPlan, host.worldTransform);
const frozen = freezeBridgePlan({
  bridgeSpec: host.settings,
  buildPlan: host.buildPlan,
  worldTransform: host.worldTransform,
  challenge: host.challenge
});
```

For a viaduct over a ravine, supply a deterministic `piecewiseLinear` or `sampled1d` support profile. Do not add procedural terrain to this package.

Legacy V4.6 terrain and render values remain in the internal settings snapshot for source compatibility. Production compilation does not generate terrain from them.

## Tests

```bash
npm test
npm run test:schema
npm run verify:equivalence
npm run performance
npm run standalone
npm run test:browser
```

Accepted local result:

- 39 Node tests passed;
- two accepted V4.6 plans matched exactly;
- two reference plans passed the supplied BuildPlan JSON Schema;
- five design views and one transform view passed browser acceptance;
- zero browser console errors;
- zero browser page errors.

See `ACCEPTANCE_REPORT.md` for exact evidence and limits.

## Demo

Open:

`demo/ORACLE_BRIDGE_CORE_MAIN_DEMO_V1_STANDALONE.html`

The file is self-contained. It uses no server and no external request.

The Canvas renderer is evidence only. MAIN_DEMO should use the included Three.js instancing adapter.
