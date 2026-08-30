# ROBO BRIDGE MCP V3 — Brick-ready 2D Bridge Generator

Standalone prototype for the deterministic V3 design stage:

```text
ChallengeState + BridgeSpec -> BridgeGraph2D
```

The generator does **not** place individual bricks. It emits the grid-aligned structural graph, construction-system declaration, member raster intent and bonded masonry zones required by the next brick compiler. It does not control a robot, run rigid-body physics or modify the integrated application.

## Run

Requires Node.js 20 or newer.

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:4178/`.

The light-mode interface includes ravine and flat-gap fixtures, `ChallengeState.json` import, graph debugging, brick/hybrid filtering and exports for `BridgeSpec.json`, `BridgeGraph2D.json` and the validation report.

## Verify

```powershell
npm test
npm run fixtures:check
npm run fixtures
npm run build
```

Normal tests and `npm run fixtures:check` are read-only. Schema tests use the pinned Ajv Draft 2020-12 validator. `npm run fixtures` explicitly replaces the generated family exports. `npm run build` explicitly replaces the ignored local `dist/` folder.

## Family catalogue

Brick-native families:

- clear-span brick beam;
- pier and beam;
- closed-spandrel masonry arch, segmental or semi-elliptical;
- repeated multi-arch viaduct;
- corbelled/stepped bridge;
- brick box culvert.

Technic/hybrid reference families, hidden in the interface by default:

- braced trestle;
- Warren, Pratt and Howe trusses;
- tied through-arch;
- suspension;
- static tower bascule intent.

The former steel-style `box` generator has been removed. `boxCulvert` is a different masonry family. The former `aqueduct` name is now the more structurally accurate `viaduct`.

## What “brick ready” means

Every valid graph now declares:

- integer or configured half-grid stud/layer coordinates;
- `construction.system` and `construction.compatibility`;
- an explicit allowed-part palette;
- deck and side thickness;
- maximum structural beam length;
- running or stack bond;
- `buildClass`, `rasterMode` and `sectionStuds` on every member;
- explicit member/cable `connectionIntent` for bonds, pins, hinges and cable clamps;
- `metadata.resolvedGeometry`, recording the exact snapped deck, pier, tower, anchor, hanger, hinge and leaf-tip stations;
- course-fill polygons and openings in `metadata.brickZones` for brick-native masonry;
- connected paths from every structural member to fixed or terrain support.

Brick-native graphs reject Technic frame members. Hybrid graphs remain valid but return the machine-readable `HYBRID_PARTS_REQUIRED` warning.

All required foundations are resolved before generation. A missing abutment, pier, tower or cable anchor returns a coded validation error and `graph: null`; a missing value can never be numerically coerced into a false `y=0` support. Graph validation also rejects duplicate or zero-length member paths, unintended coincident nodes, invalid cable anchors, zero-area/self-intersecting masonry polygons and openings outside their masonry body.

## Architecture

- `src/engine/catalogue.js` — family ownership, labels and construction-system classification;
- `src/engine/fixtures.js` — built-in challenges and family-specific strict specifications;
- `src/engine/validation.js` — relational, support-path and brick-readiness validation;
- `src/engine/generator.js` — deterministic family geometry, brick intent and stable IDs;
- `src/engine/stable-json.js` — canonical JSON and checksums;
- `src/app.js` — event-driven SVG workbench with cached generation; no animation loop;
- `schemas/` and `SCHEMA.md` — strict serialization contracts;
- `fixtures/exports/` — reproducible example inputs and outputs;
- `tests/` — deterministic acceptance suite.

See `CRITIQUE.md` for the original brick-readiness audit and the Oracle HOLD remediation that produced generator version 3.

## Determinism

IDs are assigned from deterministic family-specific construction order. Coordinates are snapped to the declared brick grid before entering the graph. Metadata contains an input-derived design revision and canonical checksum. Runtime timing remains outside the graph, so it cannot change JSON equality.

## Boundary

This prototype proves a brick-ready **handoff**, not a BuildPlan. Individual part selection, 3D side extrusion, clearance-cell rejection, seam staggering, dependency ordering and robot placement remain downstream compiler responsibilities.
