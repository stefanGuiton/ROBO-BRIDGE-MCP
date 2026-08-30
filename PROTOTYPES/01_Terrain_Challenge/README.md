# ROBO BRIDGE MCP — V2 Terrain Generator

Standalone browser prototype for deterministic bridge-challenge terrain. It generates exactly one left bank, one right bank, one separating obstacle, two protected coplanar build platforms, ENTRY/EXIT, a transport corridor, support data, and an exportable V3 `ChallengeState.json`.

V2.3 uses a deterministic mountain-first envelope. `moundFalloffWidth` controls the mountain spread, `moundEdgeDrop` places the outer ground shelf, `mountainPeakScale` controls how much of the generated mountain clips against the shared build datum, and ridged/domain-warped noise sculpts the established bank bodies. Platform flattening is applied afterward, so ENTRY and EXIT remain on the exact shared plane while the banks descend fully to ground.

The secondary `Stretch X`, `Stretch Y`, and `Stretch Z` controls apply a deterministic post-generation transform to the complete challenge. This is baked into the authoritative height field and all dependent contracts—not applied as a visual-only Three.js scale. Invalid control combinations leave the last valid terrain visible and report the rejected setting instead of blanking the viewport.

This folder is isolated from the integrated ROBO BRIDGE application. It contains no bridge bricks, robot placement, structural solver, train physics, or hardware connection.

## Run

```powershell
npm run dev
```

Open `http://127.0.0.1:4173/`. There is no install step: Three.js r179 and OrbitControls are pinned under `vendor/`, and the simplex-noise implementation is local.

## Verify

```powershell
npm run check
npm test
```

The default test command is read-only. It covers frozen checksums, settings validation, transactional regeneration, authoritative XYZ stretch, exact platform planes, ENTRY/EXIT, query agreement, support-region truth, two-bank topology, watertight meshes, river alignment, and 1,000 bounded seed cases.

Evidence generation is explicit because it writes files:

```powershell
npm run evidence
```

This refreshes `ChallengeState.json`, `docs/PERFORMANCE_RESULTS.json`, and `docs/DETERMINISM_EVIDENCE.json`.

## Presets

- `V2_FLAT_GAP_SMALL` — minimal deterministic integration fixture.
- `V2_RAVINE_SIMPLE` — restrained natural ravine.
- `V2_RIVER_SIMPLE` — centreline-following water ribbon without fluid simulation.
- `V2_MOUNTAIN_PASS` — tall broad paired banks; default visual target.
- `V2_ALPINE_RAVINE` — deeper, narrower expert terrain.
- `V2_CORRUPTION_STRESS` — maximum allowed procedural breakup for invariant testing.

## Core guarantees

- Left and right protected platforms use the exact same `sharedTopY`.
- Platform height, slope, normal, and displacement are exact inside the protected cores.
- One final `Float32Array` drives rendering, queries, supportability, anchors, and export.
- XYZ stretch is baked into final dimensions, heights, normals, platforms, corridor clearances, support data, mesh, and export.
- A rejected regeneration never disposes the previously accepted terrain.
- Support polygons are conservative products of the support mask, not assumed bank rectangles.
- The render mesh is one closed indexed volume: top surface, four skirts, and bottom cap.
- Every seed/settings pair has stable height, support, mesh, and challenge checksums.
- Terrain is generated only on initial load, preset selection, or Regenerate—not in the animation loop.

See [API.md](./API.md), [V2_TERRAIN_GENERATOR_PLAN.md](./V2_TERRAIN_GENERATOR_PLAN.md), [docs/TERRAIN_REALISM_RESEARCH.md](./docs/TERRAIN_REALISM_RESEARCH.md), [docs/TEST_EVIDENCE.md](./docs/TEST_EVIDENCE.md), and [docs/PERFORMANCE_RESULTS.md](./docs/PERFORMANCE_RESULTS.md).
