# Prototype architecture

## Modules

- `src/normalize.js` validates and normalizes generator-independent graph fields.
- `src/catalogue.js` owns the legal part definitions and configurable long-beam set.
- `src/compiler.js` owns extrusion, occupancy, masking, packing, mapping, dependencies and the candidate plan.
- `src/fixtures.js` supplies deterministic beam, trestle, Warren, Pratt and arch graphs.
- `src/renderer.js` visualizes compiler output with Three.js instancing.
- `src/app.js` owns only prototype UI state, imports and downloads.

## Authority boundary

Inside this prototype, `compileBridgeGraph()` is a pure compilation entry point. Its result object is replaced on each compile. There is no mutable robot state and no construction-state authority.

The future integration boundary is the candidate BuildPlan adapter. Local grid positions must pass through the existing explicit live-machine transform before any execution. This prototype cannot execute placements.

## Dependency phases

```text
foundation
→ pier
→ lower
→ deck
→ web
→ upper
→ rail
→ cable
```

Dependencies are attached by direct lower-footprint support where available, then by a deterministic nearest earlier phase fallback. Multiple foundation placements have no dependencies, so future human and robot schedulers can expose parallel work.

## Known prototype limits

- Occupancy uses unit stud/layer cells and intentionally approximates diagonal member thickness.
- Packing operates on local axis-aligned runs; it does not create arbitrary rotated diagonal bricks.
- Structural scores are represented by deterministic packing preferences, not an engineering optimiser.
- Visual studs are illustrative and do not claim exact commercial brick geometry.
- No exact moving-link/table collision fidelity or native WebMCP acceptance is claimed.
