# Generator critique and brick-readiness response

## Outcome

Version 1 was a sound deterministic **bridge sketcher**, but it was not a sufficient contract for deterministic brick compilation. Version 2 keeps its useful common graph while adding the missing construction intent.

## Findings

### 1. Coordinates were not brick-grid authoritative

The generator emitted continuous coordinates, including fractional arch samples and panel stations. The downstream prototype rounds those values to integer stud/layer cells. That could change geometry after validation, merge distinct nodes or alter arch clearance.

**Response:** BridgeSpec declares stud and layer size. Every generated node and masonry-zone point is snapped before validation and checksumming. `BRICK_GRID_MISMATCH` rejects incompatible inputs or outputs.

### 2. Family names mixed structural form with visual analogy

`box` generated two diagonally braced side trusses. It was neither a masonry box bridge nor a box culvert. `aqueduct` described a repeated arch structure without modelling water transport.

**Response:** `box` was replaced by `boxCulvert`; `aqueduct` became `viaduct`. Tied-arch and bascule are now explicit hybrid forms rather than being forced into arch or suspension.

### 3. Brick and Technic construction were indistinguishable

Masonry arches, timber trestles, steel trusses and cable bridges shared member fields but did not declare their required part systems. A later compiler could accidentally treat a Pratt diagonal as ordinary stacked brickwork.

**Response:** The catalogue divides six brick-native families from seven Technic/hybrid families. Every graph and member declares its construction and raster mode. Brick-native validation forbids Technic frame members; hybrid families produce `HYBRID_PARTS_REQUIRED`.

### 4. Masonry existed only as thin lines

Arch and aqueduct output contained arch polylines, vertical ties and narrow piers. It did not describe the closed spandrel, arch opening, pier width, abutment mass, deck courses or bond pattern visible in brick bridge references.

**Response:** Brick-native generators emit deterministic `brickZones`: course-fill polygons with optional opening holes, minimum thickness and bond pattern. These are design masks, not brick placements.

### 5. Arch supports were physically misrepresented

Arch endpoints were marked as terrain-supported at their springing elevation even when the actual terrain was much lower. That concealed the required abutments.

**Response:** Single arches now generate two explicit masonry abutment members down to fixed foundations. Viaduct arches transfer into founded full-height shared piers.

### 6. Validation proved references, not load-path support

Version 1 verified that member endpoint IDs existed, but a disconnected floating member could still pass.

**Response:** Graph validation now walks member connectivity from fixed and terrain nodes. Any member outside the supported set returns `UNSUPPORTED_MEMBER`.

### 7. BridgeSpec required irrelevant parameters

Every family carried truss, pier, arch, tower and cable parameters. Codex could change a parameter that had no effect, and unknown/family-inappropriate intent was hard to detect.

**Response:** Specs now contain common fields plus only the selected family’s parameters. Family-inappropriate properties return `INVALID_PARAMETER_RANGE`. The JSON Schema documents family-specific required fields.

### 8. UI-only changes regenerated geometry

The original render path regenerated the graph whenever IDs were shown or hidden.

**Response:** Generation is cached by canonical ChallengeState and BridgeSpec. Debug and family-filter changes reuse the graph. Geometry is still regenerated immediately when a state or parameter changes.

## Remaining boundary

This version does not claim that every brick has been selected or that a physical LEGO model has been load-tested. The next compiler still owns:

- polygon and member rasterisation into occupancy cells;
- 2D-to-3D side duplication;
- part packing and seam staggering;
- clearance-cell rejection;
- placement dependencies;
- BuildPlan adaptation and robot reachability.

That separation preserves the master-plan boundary: Codex edits BridgeSpec, deterministic geometry creates the graph, and deterministic compiler code chooses exact parts.
