# MAIN_DEMO Integration Guide

## Integration objective

Add conversational bridge design to MAIN_DEMO without creating a second bridge state.

The existing V4.6 compiler and its active settings remain the only design authority.
The existing V4.6 BuildPlan remains the only construction plan.
The WebMCP layer only reads and patches this authority.

## Files to copy

Copy these files into one MAIN_DEMO module folder, for example `apps/web/src/bridge-design/`:

- `src/errors.js`
- `src/bridge-spec.js`
- `src/v46-adapter.js`
- `src/bridge-design-service.js`
- `src/webmcp-bridge-tools.js`
- `src/create-bridge-design-package.js`
- `src/index.js`

Do not copy these files into production MAIN_DEMO:

- `src/standalone-entry.js`
- `src/demo-panel.js`
- the complete self-contained demo HTML
- the reference V4.6 HTML

Those files are demo and evidence files only.

## Required state rule

MAIN_DEMO must have one active object or store for these values:

- internal V4.6 settings;
- `designRevision`;
- `executionRevision`;
- current compiler result;
- current BuildPlan 4.6;
- current renderer data.

The UI and WebMCP must use the same update function for this state.
Do not keep another React state, WebMCP state, or hidden bridge copy that can change independently.
Do not use DOM sliders as the WebMCP source of truth.

## Adapter host contract

Create one host object around the current MAIN_DEMO compiler runtime.
The host must supply this contract:

```js
const host = {
  get ready() {},
  get settings() {},
  get buildPlan() {},
  get compiled() {},
  get renderer() {},

  exportPlan() {},
  getFamilyPreset(family) {},
  getCompileState() {},
  applySettingsBatch(candidateSettings, expectedRevision, { signal }) {},
  compileExpectedRevision(expectedRevision, { signal }) {}
};
```

### `settings`

Return a snapshot of the current full internal V4.6 settings.
Do not return a mutable reference.

### `getFamilyPreset(family)`

Return the tested V4.6 family preset:

```js
return { ...COMMON, ...PRESETS[family], family };
```

This preserves the current tested family-switch behaviour.

### `exportPlan()`

Return the current authoritative BuildPlan 4.6.
The returned plan must contain the exact current `planId`, `designChecksum`, `designRevision`, and `executionRevision`.

### `applySettingsBatch(...)`

This is the critical mutation seam.
It must use this sequence:

1. Check that `expectedRevision` equals the current `designRevision`.
2. Start a candidate compile without changing the active settings.
3. Stop when `signal` is aborted.
4. Reject the candidate when compilation fails.
5. Check the revision again before commit.
6. Commit the candidate settings and compiler result together.
7. Create the BuildPlan from the committed compiler result.
8. Increment `designRevision` once.
9. Update the renderer from the same committed result.
10. Return the new revision, plan ID, checksum, and compile timing.

Do not change active settings before candidate compilation succeeds.
Do not use rollback as the normal safety method.
A stale, invalid, failed, or cancelled request must leave the active design unchanged.

The standalone demo contains a tested reference implementation of this seam in `scripts/build-standalone.mjs`.
Use that method as a guide. Do not import the standalone page into MAIN_DEMO.

## Create the package once

Create one package instance during MAIN_DEMO startup:

```js
import { createBridgeDesignPackage } from './bridge-design/create-bridge-design-package.js';

const lifecycle = [];
const bridgeDesign = createBridgeDesignPackage({
  host,
  modelContext: document.modelContext,
  onLifecycle(event) {
    lifecycle.push(event);
  }
});
```

Keep this instance for the life of the active MAIN_DEMO runtime.
Do not create a new service for each tool call.

## Join the current WebMCP registration loop

The current repository registers strict tools through one bounded registration loop.
Add the bridge tools to that same loop when practical:

```js
const bridgeTools = bridgeDesign.tools;
const tools = [
  ...getLogoRoboToolDefinitions(existingHandlers, workspace),
  ...bridgeTools
];
```

Use the current shared `AbortController` and lifecycle handling.
Do not register duplicate tool names.
Do not add one tool for each slider.

The existing bounded JSON helper should also treat `placements` and `definitions` as bounded arrays, or it should use the `boundedJson` helper from `webmcp-bridge-tools.js` for these five tools.
Keep the maximum result near 12–16 kB.

## Tools to expose

Expose exactly these bridge-design tools unless a later review approves a change:

- `get_bridge_design`
- `get_bridge_capabilities`
- `update_bridge_design`
- `get_bridge_build_plan`
- `reset_bridge_design`

Do not expose the internal IDs such as `aqTopCount` in the public schema.
Do not add a hidden command that completes, wins, or scripts a complete build.

## Public-to-internal mapping

Keep the mapping in `bridge-spec.js`.
Examples:

| Public name | V4.6 internal name |
|---|---|
| `aqueduct.topArchCount` | `aqTopCount` |
| `aqueduct.middleArchCount` | `aqMiddleCount` |
| `aqueduct.bottomArchCount` | `aqBottomCount` |
| `viaduct.archCount` | `viArchCount` |
| `viaduct.openingWidthRatio` | `viOpeningWidthRatio` |
| `common.entryExitGap` | `anchorGapX` |
| `common.bridgeBaseElevation` | `anchorBaseY` |
| `common.voxelSize` | `voxelSize` |

Do not rename the V4.6 compiler internals.

## UI integration

The UI can continue to show sliders and selectors.
Change the UI only through the same state authority used by the adapter.

Recommended UI sequence:

1. Read the current state and revision.
2. Create a public partial patch.
3. Call `BridgeDesignService.patchBridgeSpec` or the shared internal commit function.
4. Render the committed result.

Do not let the UI write internal settings during an active agent candidate compile.
Disable or queue UI edits during this short operation.

## BuildPlan use

Use `service.getBuildPlan()` only for bounded agent reads.
Use the authoritative full V4.6 BuildPlan from the runtime for:

- hologram and preview;
- MAIN_DEMO construction;
- later robot execution;
- export and persistence.

Do not reconstruct the full plan from a bounded WebMCP response.
Do not create a second preview plan.

## Revision and execution rules

- A read does not increment `designRevision`.
- A successful design commit increments `designRevision` once.
- A design commit creates a new execution engine at `executionRevision = 0` as V4.6 does now.
- A stale mutation returns `STALE_DESIGN_REVISION`.
- A concurrent mutation returns `OPERATION_IN_PROGRESS`.
- A cancelled mutation returns `CANCELLED` and does not commit.
- The caller must use the latest returned `designRevision` for the next mutation.

## Error rules

Keep these stable design error codes:

- `INVALID_PARAMETER`
- `OUT_OF_RANGE`
- `UNKNOWN_FAMILY`
- `STALE_DESIGN_REVISION`
- `COMPILE_FAILED`
- `BUILDPLAN_UNAVAILABLE`
- `RUNTIME_UNAVAILABLE`
- `OPERATION_IN_PROGRESS`
- `CANCELLED`
- `INTERNAL_ERROR`

Return a concise message and machine-readable details.
Do not expose internal exception stacks through WebMCP.

## Required merge tests

After integration, run these tests against MAIN_DEMO:

1. Aqueduct 10 / 6 / 3.
2. Change only top to 8 and bottom to 4. Confirm middle stays 6.
3. Switch to the viaduct preset.
4. Set 5 viaduct arches and `openingWidthRatio = 0.9`.
5. Send a stale revision. Confirm no state change.
6. Send an out-of-range count. Confirm no state change.
7. Abort a candidate compile. Confirm no state change.
8. Start two mutations. Confirm the second returns `OPERATION_IN_PROGRESS`.
9. Read BuildPlan summary and one bounded placement page.
10. Compare the service plan ID and checksum with the runtime BuildPlan.
11. Confirm the track definition and track renderer draw remain present.
12. Confirm there are no browser console errors.

## Native WebMCP acceptance

Use a browser that has a real `document.modelContext.registerTool` implementation in a secure context.
The VM used for this package did not have native WebMCP.
The registration code and a contract harness passed, but this is not native proof.
Record native acceptance separately during MAIN_DEMO integration.
