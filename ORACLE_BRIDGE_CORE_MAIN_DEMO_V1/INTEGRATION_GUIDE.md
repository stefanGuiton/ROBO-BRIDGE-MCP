# MAIN_DEMO integration guide

## 1. Files to copy into `apps/web`

Create:

`apps/web/src/bridge-core/`

Copy all files from this package `src/` folder into it:

```text
bridge-compiler-service.js
bridge-defaults.js
bridge-freeze.js
bridge-host.js
buildplan-adapter.js
challenge-input.js
construction-adapter.js
custom-part-geometry.js
errors.js
hologram-adapter.js
index.js
placement-expansion.js
schemas.js
support-profile.js
three-hologram-adapter.js
v46-compiler-core.js
v46-worker-adapter.js
v46-worker-entry.js
world-transform.js
```

Keep the worker entry beside the worker adapter. The default module URL depends on this location.

## 2. Modules not to copy

Do not copy these items into production code:

- `demo/`;
- `tests/`;
- `fixtures/`;
- `reference/`;
- `screenshots/`;
- `evidence/`;
- `scripts/`;
- the original V4.6 HTML;
- the original V4.6 procedural terrain code;
- the original V4.6 renderer;
- the original V4.6 `BuildExecutionEngine`.

The file `fixtures/v46-reference-terrain.js` is test-only. Do not copy it to MAIN_DEMO.

## 3. Instantiate the compiler and host

Create one `BridgeHost` for the active mission. Do not create one host for each tool call.

Use a locked challenge during submission play:

```js
import {
  createBridgeHost,
  createHologramSnapshot,
  createThreeBridgeHologram,
  createConstructionPlacementStream,
  createBuildBoardTargets,
  freezeBridgePlan
} from '../bridge-core/index.js';

const bridgeChallenge = {
  id: challenge.id,
  entry: { x: -110, y: 75, z: 0 },
  exit: { x: 110, y: 75, z: 0 },
  span: 220,
  roadY: 75,
  worldTransform: {
    id: 'bridge-local-to-main-demo',
    translationMm: { xMm: bridgeOriginX, yMm: bridgeOriginY, zMm: bridgeOriginZ },
    yawDeg: bridgeYawDeg,
    scale: 1
  },
  supportProfile: {
    type: 'piecewiseLinear',
    outside: 'clamp',
    samples: challengeSupportSamples
  }
};

const bridgeHost = await createBridgeHost({
  initialSettings: { family: 'aqueduct' },
  challenge: bridgeChallenge,
  challengePolicy: 'locked',
  compilerOptions: { preferWorker: true }
});
```

Challenge points use the V4.6 bridge-local frame:

- local X: ENTRY to EXIT;
- local Y: up;
- local Z: bridge width.

`worldTransform` maps this frame to MAIN_DEMO machine millimetres:

- machine X and Y: horizontal;
- machine Z: up.

Do not put bridge offsets in renderer code. Change only `worldTransform`.

Use a Worker in production. Inline mode is useful for tests. A Worker gives real cancellation while the compile runs.

## 4. Connect the completed Oracle WebMCP package

Copy the approved WebMCP V1 production files to a separate folder, for example:

`apps/web/src/bridge-design/`

Use its existing factory with this `bridgeHost` as `host`:

```js
import { createBridgeDesignPackage } from '../bridge-design/create-bridge-design-package.js';

const bridgeDesign = createBridgeDesignPackage({
  host: bridgeHost,
  modelContext: document.modelContext,
  onLifecycle: recordBridgeToolLifecycle
});
```

The new host supports the required seam:

```text
ready
settings
compiled
buildPlan
exportPlan()
getFamilyPreset()
getCompileState()
applySettingsBatch()
compileExpectedRevision()
```

The compatibility tests pass for all five existing tools:

- `get_bridge_design`;
- `get_bridge_capabilities`;
- `update_bridge_design`;
- `get_bridge_build_plan`;
- `reset_bridge_design`.

Add these five tools to the one existing WebMCP registration loop. Do not create a second registrar.

The UI and WebMCP must both use `bridgeHost.applySettingsBatch()`. Do not let UI controls write independent bridge settings.

## 5. Render the hologram

Create the hologram from the current authoritative BuildPlan:

```js
let bridgeHologramGroup = null;

function refreshBridgeHologram() {
  bridgeHologramGroup?.removeFromParent();
  const snapshot = createHologramSnapshot(
    bridgeHost.buildPlan,
    bridgeHost.worldTransform,
    { limit: 5000 }
  );
  bridgeHologramGroup = createThreeBridgeHologram({
    THREE,
    snapshot,
    buildPlan: bridgeHost.buildPlan,
    opacity: 0.34
  });
  scene.add(bridgeHologramGroup);
}
```

The default Three.js position mapping is:

```text
machine x -> Three x
machine y -> Three z
machine z -> Three y
```

Pass `machinePositionToThree` only when MAIN_DEMO uses a different display mapping.

Use `disposeThreeBridgeHologram()` when the design changes or the mission resets.

The hologram is a view. It must not record accepted occupancy, claims, inventory, or completion.

## 6. Feed the existing placement stream

At BUILD start, create one neutral stream from the frozen BuildPlan:

```js
const constructionStream = createConstructionPlacementStream(
  frozen.buildPlan,
  frozen.worldTransform,
  {
    resolveColour({ colourHex, role, family, partClass }) {
      return materialRegistry.resolveSourceColour({ colourHex, role, family, partClass });
    }
  }
);
```

The neutral entry keeps:

- stable `placementId`;
- `physicalPlacementId`;
- part class and part type;
- custom definition ID;
- material role;
- target position and yaw;
- all dependency IDs;
- territory and actor preference;
- support data;
- structure-complete barrier for track.

The current logical stream accepts batches of at most 50 and keeps a five-slot active window. Use `pageConstructionPlacementStream()` for admission, or use `createExistingPlacementQueueChunks()` only after every part type is supported.

`createExistingPlacementQueueChunks()` fails closed when `supportsPart()` rejects any V4.6 part. This is intentional.

The current MAIN_DEMO does not yet have production support for all of these parts:

- `1x1x1`;
- `1x2x1`;
- `1x20x1`;
- custom Arch A/B parts;
- track modules.

Add a part registry and source inventory before queue execution. Do not pretend that every part is the existing 2x4 brick.

The current queue has one `supportPlacementId` field. The bridge stream can have more than one dependency. The admission layer must wait until every `dependencyIds` item is accepted by `BuildBoard`. It can then pass one physical support reference to the current placement preview when needed.

## 7. Preserve `BuildBoard` authority

At BUILD start, create target records from the same frozen stream:

```js
const targetSet = createBuildBoardTargets(constructionStream);
```

Use these targets when the integration owner creates or resets the one production `BuildBoard`.

`BuildBoard` remains the only accepted occupancy and completion truth.

The immutable BuildPlan and custom-part registry can store part definitions. They are definition data, not occupancy state.

Do not add:

- an accepted flag in this package;
- a second progress counter;
- a second inventory counter;
- a bridge completion engine;
- direct robot calls from this package.

The existing `PlacementAuthority` and `RobotController` must accept or reject physical placement.

## 8. Freeze the plan at BUILD

Call `freezeBridgePlan()` during the explicit DESIGN to BUILD transition:

```js
const frozenBridge = freezeBridgePlan({
  bridgeSpec: bridgeHost.settings,
  buildPlan: bridgeHost.buildPlan,
  worldTransform: bridgeHost.worldTransform,
  challenge: bridgeHost.challenge
});
```

Store this object in the mission session.

During BUILD and TEST, use only:

```text
frozenBridge.buildPlan
frozenBridge.planId
frozenBridge.designChecksum
frozenBridge.designRevision
frozenBridge.worldTransform
```

Use the same frozen plan for:

- hologram;
- BuildBoard targets;
- construction stream;
- custom-part definitions;
- track route;
- later train support mapping.

A design change must return to DESIGN and perform an explicit mission reset. Do not silently replace a frozen plan.

## 9. Required MAIN_DEMO acceptance tests

Run these tests after integration:

1. Compile the default aqueduct and show its exact hologram.
2. Set aqueduct counts to 10 / 6 / 3.
3. Change only top to 8 and bottom to 4. Confirm middle stays 6.
4. Switch to the tested viaduct preset.
5. Set five viaduct arches and opening ratio 0.9.
6. Confirm the UI and WebMCP report the same revision, plan ID, and checksum.
7. Reject a stale design revision with no state change.
8. Abort a Worker candidate compile with no state change.
9. Reject an invalid count with no partial state change.
10. Confirm ENTRY, EXIT, standard bricks, custom arches, and track use one transform.
11. Confirm arch material matches the active family body material.
12. Confirm track is visibly above the deck.
13. Freeze the plan at BUILD and reject design edits until reset.
14. Confirm every BuildBoard target maps to one frozen BuildPlan placement.
15. Confirm every construction stream entry maps to one frozen BuildPlan placement.
16. Confirm custom parts are registered before stream execution.
17. Confirm the five-slot placement window never receives more than 50 entries in one batch.
18. Confirm all dependencies are accepted before each entry is admitted.
19. Confirm `BuildBoard` alone determines accepted completion.
20. Run an early train TEST from BuildBoard-derived support data.
21. Run a complete bridge train TEST with the same frozen plan.
22. Run three full mission loops with zero console errors.
23. Run the final native WebMCP acceptance in a supported secure browser.

## Integration limits that require owner action

This ZIP proves the compiler, BuildPlan, transforms, hologram data, host seam, and neutral construction stream.

It does not prove:

- a real Three.js render inside current MAIN_DEMO;
- custom-part grasp and collision behavior;
- V4.6 part inventory spawning;
- final palette names for tan and grey masonry;
- BuildBoard creation/reset wiring;
- native WebMCP in the final browser;
- train support integration;
- the complete mission loop.

These are MAIN_DEMO integration tasks. Do not mark them complete from this package alone.
