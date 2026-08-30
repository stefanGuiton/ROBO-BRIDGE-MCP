# Schema notes

The design boundary remains:

```text
ChallengeState + BridgeSpec -> validation -> deterministic generator -> BridgeGraph2D
```

The JSON Schemas in `schemas/` are the serialization contracts. Runtime validation also checks relationships such as ENTRY-to-EXIT span, corridor elevation, vehicle envelope, allowed foundations, member connectivity and brick-grid alignment.

## BridgeSpec

`BridgeSpec` is parameter-only and contains no raw node, member, cable or brick coordinates.

Common fields describe span, deck, corridor clearance, symmetry, density and load class. Family-specific fields are accepted only when the catalogue declares them. For example, an arch accepts `archShape` and `archRise`; a Pratt truss accepts `panelCount`, `trussHeight` and `crossBracing`. Irrelevant properties are errors rather than ignored controls.

The required `brick` object declares the downstream compiler boundary:

```text
allowed[]
maxBeamStuds
sideThicknessStuds
deckThicknessLayers
bondPattern
studSize
layerHeight
```

It still does not select or position bricks.

## BridgeGraph2D

Every family retains the same four top-level fields:

- `nodes`: stable integer ID, snapped x/y coordinate, role and support type;
- `members`: stable integer ID, endpoint IDs, role, class, capacity and brick raster intent;
- `cables`: analytic samples and deterministic hanger targets, without cable physics;
- `metadata`: family, revision, construction declaration, masonry zones and checksum.

Every member adds:

- `buildClass`: brick course, brick stack, masonry arch, brick beam or Technic frame;
- `rasterMode`: how a downstream compiler should convert its centreline;
- `sectionStuds`: minimum conceptual member section.
- `connectionIntent`: overlapping stud bond, masonry bond, Technic pin or hinge pin.

Every cable adds `connectionIntent` for an anchored eyelet or hanger clamp. Bascule nodes and members add explicit articulation and leaf-side fields. The two centre leaf tips are separate coincident nodes joined only by a named `coincidentGroup`; they are not falsely merged into one structural joint.

`metadata.resolvedGeometry` records the exact snapped stations accepted by the generator. It makes grid resolution observable instead of silently replacing requested pier, hanger or articulation positions.

`metadata.brickZones` contains course-fill polygons. A zone has a stable `Znnn` ID, outer polygon, zero or more opening holes, bond pattern and minimum thickness. These polygons describe filled masonry bodies such as abutments, spandrels, piers, towers, decks and culvert walls.

## Construction classification

`metadata.construction.compatibility` is one of:

- `brick-native`: standard-brick geometry; Technic frame members are invalid;
- `hybrid`: valid LEGO intent requiring Technic, cable, chain or hinge elements.

Hybrid is a valid result with a machine-readable warning. It is never silently presented as standard-brick-only.

## Error codes

Required baseline codes remain supported:

`SPAN_INVALID`, `DECK_OUTSIDE_CORRIDOR`, `VEHICLE_CLEARANCE`, `PIER_NO_FOUNDATION`, `UNSUPPORTED_MEMBER`, `INVALID_PARAMETER_RANGE`, `INVALID_CABLE_ANCHOR`.

Brick-readiness adds:

`FOUNDATION_NOT_FOUND`, `BRICK_GRID_MISMATCH`, `BRICK_INTENT_MISSING`, `CONSTRUCTION_SYSTEM_MISMATCH`, `DEGENERATE_GEOMETRY`, `INVALID_BRICK_ZONE`, `HYBRID_PARTS_REQUIRED`.

Human-readable messages supplement, but never replace, these codes.

## Executable schema gate

The Draft 2020-12 schemas are compiled with pinned Ajv 8.20.0 during `npm test`. Every committed challenge, specification and graph fixture must validate. Negative fixtures prove that wrong-family parameters, malformed terrain and missing graph intent are rejected. `npm run fixtures:check` independently regenerates every expected JSON document in memory and byte-compares it with the committed export without modifying the checkout.
