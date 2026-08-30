# ROBO BRIDGE MCP V3 — 2D Bridge Generator

Standalone, dependency-free prototype for the deterministic V3 design stage:

```text
ChallengeState + BridgeSpec -> BridgeGraph2D
```

It generates 2D nodes, members and analytic cables. It does not place bricks, control a robot, run rigid-body physics or integrate with the main application.

## Run

Requires Node.js 20 or newer.

```powershell
npm run dev
```

Open `http://127.0.0.1:4178/`.

The app includes ravine and flat-gap fixtures, imports `ChallengeState.json`, and exports `BridgeSpec.json`, `BridgeGraph2D.json` and `validation-report.json`.

## Verify

```powershell
npm test
npm run fixtures
npm run build
```

`npm test` covers the common graph contract, all nine families, span/support behavior, truss differences, arch response, vehicle clearance, error codes, byte-identical determinism and suspension cables.

`npm run fixtures` regenerates the checked deterministic artifacts in `fixtures/exports/`. `npm run build` creates a static `dist/` folder without bundling or external dependencies.

## Architecture

- `src/engine/fixtures.js` — built-in ChallengeState inputs and default parameter specification;
- `src/engine/validation.js` — relational validation and machine-readable error codes;
- `src/engine/generator.js` — deterministic family generators and stable numeric IDs;
- `src/engine/stable-json.js` — canonical JSON and checksums;
- `src/app.js` — light, event-driven SVG workbench; no animation loop;
- `schemas/` and `SCHEMA.md` — strict serialisation contracts;
- `fixtures/exports/` — reproducible example inputs and outputs;
- `tests/` — deterministic acceptance suite.

## Bridge families

Beam, trestle/pier, Warren, Pratt, Howe, arch (circular/parabolic), aqueduct, box and suspension all use the same `BridgeGraph2D` contract. Howe reuses the Pratt helper with reversed diagonal direction. Suspension cables are analytic polylines with deterministic vertical hanger targets; no rope physics is present.

## Determinism

IDs are assigned from deterministic family-specific construction order. Graph metadata contains an input-derived design revision and a canonical graph checksum. Runtime generation timing is reported outside the graph so it cannot alter JSON equality.

## Known boundary

This is design-layer evidence only. It does not prove brick compilation, structural analysis, native WebMCP, robot execution, or calibrated collision fidelity.
