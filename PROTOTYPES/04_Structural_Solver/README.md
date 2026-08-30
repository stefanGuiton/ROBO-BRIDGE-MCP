# ROBO BRIDGE MCP V3 — Lightweight Structural Solver

An isolated, deterministic structural **game solver**. It decides structural gameplay failure; it does not simulate visible rigid-body collapse and it is not an engineering certification tool.

The prototype stays entirely inside `PROTOTYPES/04_Structural_Solver/`. It has no Three.js, WebGPU, WASM, Worker, Rapier, robot, terrain, generator, compiler, train-physics, or integrated-application dependency.

## Run

Requirements: Node.js 22 or newer. No package install is required.

```powershell
cd D:\ROBO-BRIDGE-MCP\PROTOTYPES\04_Structural_Solver
npm run dev
```

Open `http://127.0.0.1:4177/`.

The source is plain TypeScript. The build uses Node 22's built-in type transform, so there is no global install and no `node_modules` folder. Python is not used. Therefore no VENV is opened or modified; any future Python tooling must use a prototype-local VENV only.

## Verify

```powershell
npm test
npm run fixtures
npm run benchmark
```

- `npm test`: deterministic acceptance and edge-case coverage.
- `npm run fixtures`: exports all eleven graph fixtures and a future-facing `examples/TestResult.json`.
- `npm run benchmark`: measures all fixtures and writes `docs/performance-results.json`.

## Gameplay model

Each solve works on a generic `StructuralGraph` with stable numeric node/member IDs. One member maps to many brick IDs. There are no scene-object references.

1. Active members form a deterministic weighted graph.
2. Dijkstra support-path analysis records reachable supports, components, paths, and distance.
3. Loads are shared across reachable supports using inverse path length.
4. Bending-style demand grows with load and lever distance along each support path.
5. Capacity is reduced by completion, gameplay difficulty, and unsupported distance.
6. TEST selects one overloaded member using utilisation, remaining margin, then stable member ID.
7. The member is removed from the structural contribution and the entire load path is recalculated.
8. The loop stops when stable or at the strict iteration cap.

BUILD uses the same warnings but never applies a failure. Starting TEST creates a fresh working copy from the current BUILD edits.

Moving train loads use two point loads. The render loop may move the train every frame, but `StructuralSolverSession` only calls the solver when an axle enters another discrete load region or a material input changes.

## UI

The light-mode debug workbench includes:

- all eleven requested fixtures;
- BUILD/TEST mode and explicit start/reset;
- automatic or manual moving load;
- load mass, speed, threshold, and difficulty controls;
- game heuristic or optional 2D truss-stiffness mode;
- member/support removal in BUILD only;
- IDs, utilisation, support-path, state, failure-order, and exact-number overlays;
- node/member count, solve time, load-region updates, and cascade iterations;
- `TestResult.json` download.

## Public source map

- `src/model/types.ts` — StructuralGraph, solver, and TestResult contracts.
- `src/fixtures/index.ts` — eleven deterministic fixtures.
- `src/solver/connectivity.ts` — adjacency, components, support paths, and route continuity.
- `src/solver/loads.ts` — point-load placement and load-region signatures.
- `src/solver/solver.ts` — demand, capacity, tie-break, and progressive failure.
- `src/solver/truss.ts` — small optional 2D direct-stiffness mode.
- `src/solver/session.ts` — BUILD/TEST isolation and load-region caching.
- `src/app.ts` — standalone 2D debug workbench.
- `schemas/` — StructuralGraph and TestResult JSON Schemas.

See [tuning.md](docs/tuning.md), [architecture.md](docs/architecture.md), and [performance.md](docs/performance.md).

## Explicit limitations

- Gameplay forces and capacities are unitless tuning quantities even when the UI labels the train mass in tonnes.
- The optional truss stiffness calculation is small-strain 2D axial analysis with a regularised mechanism fallback. It does not make the prototype an engineering solver.
- There is no calibrated moving-link, table, material, connection, buckling, fatigue, soil, or 3D collision model.
- This prototype emits failed member/brick IDs only. Rapier destruction remains intentionally unintegrated.
