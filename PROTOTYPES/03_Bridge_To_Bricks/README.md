# ROBO BRIDGE MCP V3 — Bridge Graph to Bricks

Standalone, light-mode-only prototype for converting a generic `BridgeGraph2D` into a deterministic 3D toy-brick structure and adapter-friendly candidate `BuildPlan`.

This folder is intentionally isolated. It does not import or modify the existing robot controller, BuildBoard, player environment, hologram, integrated application, bridge generator, WebMCP registrar, or UR10 code.

## Run

Requirements: Node.js 22 or later. Three.js and OrbitControls are vendored locally, so no package download is required.

```powershell
npm run dev
```

Open `http://127.0.0.1:4179`.

Run the deterministic acceptance suite:

```powershell
npm test
```

Regenerate checked example exports or compiler benchmarks explicitly:

```powershell
npm run generate:examples
npm run benchmark
```

The normal test command is read-only. Only the two explicit generation commands write evidence files.

## Pipeline

```text
BridgeGraph2D
→ normalize generator-independent fields
→ duplicate structural elevation onto left/right sides
→ add support columns, deck, cross-members and rail supports
→ apply integer-grid vehicle clearance mask
→ rasterise to stud/layer occupancy
→ longest-first greedy packing with local residue repair
→ stable placement IDs and structural-member mapping
→ acyclic dependency graph
→ candidate BuildPlan.json
```

No mesh Boolean CSG is used. Clearance is a deterministic integer-cell predicate.

## Determinism

Compilation order is defined by phase, structural group and integer grid coordinate. Catalogue candidates use a stable area/length/type order. IDs are sequential only after stable packing order is fixed. The candidate plan includes an FNV-1a checksum over canonical key-sorted JSON.

The same normalized graph, compiler version and settings therefore produce the same:

- placements and IDs;
- part selections and orientations;
- local transforms;
- dependencies;
- checksum.

Compilation time is diagnostic telemetry and is deliberately excluded from the checksummed core plan.

## Packing model

The catalogue starts with `2×4`, `2×2`, `1×4`, `1×2`, optional `1×1`, and configurable 2-wide beams. Beam lengths are limited to 6–80 studs and sorted longest-first.

The local greedy score starts at one placement, rewards covered cells (`−0.02` per cell), adds `0.25` for an aligned adjacent-layer seam, adds `0.15` when no occupied support cell exists below, and adds a small `0.05` robot-access caution for parts longer than 64 studs. Before committing, the packer checks whether the remaining local run can still be represented. If not, it rolls back that one candidate and tries the next legal part. Rotated narrow parts are considered for odd local residue. Adjacent deck layers track seam endpoints and prefer an alternate legal split where practical.

This is deliberately not a global optimiser.

## Candidate BuildPlan boundary

The output uses bridge-local stud/layer coordinates and sets `machineTransformRequired: true`. Each placement contains:

- stable integer `placementId`;
- legal `partType`;
- `gridPosition`, dimensions and 0°/90° orientation;
- colour and material;
- construction phase and dependency IDs;
- mandatory `structuralMemberId`;
- original `sourceMemberId` when the placement comes from the imported graph.

Synthetic deck, support, foundation, cross-member and rail groups receive stable string member IDs. `member-to-placement-map.json` provides the reverse lookup required by future TEST failure handling.

The prototype does not change or claim direct compatibility with the existing BuildPlan implementation. Integration must happen later through an adapter and the explicit live-machine transform.

## Views

The Three.js interface provides switchable views for:

1. original 2D graph;
2. extruded structure;
3. clearance volume;
4. occupancy/stud grid;
5. final brick structure;
6. structural-member grouping;
7. dependency/build phase order.

Final bricks and studs use `InstancedMesh`, keeping repeated geometry to a small number of draw calls. The UI displays live compilation time, placements, occupancy cells, draw calls and FPS.

## Inputs and exports

Built-in fixtures: beam, trestle, Warren, Pratt and arch. Example input graphs live in `examples/graphs/`.

The importer accepts the master-plan shape (`node.position`, `member.a`, `member.b`) and the earlier prototype aliases (`node.x`, `node.y`, `member.nodeA`, `member.nodeB`). It does not inspect or depend on how the graph was generated.

The interface exports:

- candidate `BuildPlan.json`;
- member-to-placement map;
- dependency graph;
- compiler diagnostics.

Contracts are in `schemas/`. Checked example outputs are in `examples/build-plans/`.

## Verification boundary

The automated suite verifies deterministic output, clearance exclusion, legal parts, acyclic dependencies, mandatory member mapping, all requested fixture families, preservation of source-member endpoints, legacy field import, local repair without `1×1`, and the placement-count reduction from long beams.

See [docs/PERFORMANCE_RESULTS.md](docs/PERFORMANCE_RESULTS.md) for generated compiler measurements. Browser FPS and draw calls are live runtime observations, not Node benchmark estimates.

This is simulation-only. It has no physical hardware connection, robot motion, WebMCP tools, TEST physics or UR10 integration.
