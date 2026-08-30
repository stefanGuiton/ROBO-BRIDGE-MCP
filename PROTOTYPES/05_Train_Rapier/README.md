# ROBO BRIDGE MCP V3 — Rapier Train + Railway

Standalone, light-mode-only browser prototype proving that a primitive articulated train can cross supported railway and naturally derail or fall when logical rail support disappears.

Everything is isolated inside this folder. It does not import, modify, or register with the structural solver, bridge generator, terrain generator, brick system, UR10, player controls, WebMCP, or integrated application.

## Run

Requirements: Node.js 22 or later.

```powershell
npm run dev
```

Open `http://127.0.0.1:4181`.

Three.js r179 and the official `@dimforge/rapier3d-compat` 0.20.0 source are vendored, so no package install or global tooling is required. This prototype uses no Python; the VENV-only boundary is therefore preserved.

Other commands:

```powershell
npm test
npm run acceptance
npm run build
npm run preview
```

`npm test` and `npm run acceptance` are read-only. `npm run build` is the explicit command that regenerates ignored `dist/` output.

## What it proves

- A locomotive and configurable carriages remain Rapier bodies in dynamic mode.
- Rapier spring joints form `locomotive → carriage → carriage` couplers.
- Each body has front/rear guide points against a straight logical centreline.
- Supported guides apply bounded spring/damper gameplay forces and traction.
- Unsupported guides release instantly or with a short fade, preserve velocity, and latch off for the current TEST.
- Rail support controls only logical guidance and matching deck collision proxies.
- Gravity and collision remain active after release.
- Kinematic-until-failure mode converts all cars to dynamic bodies with route velocity at the first support loss.
- A fixed 60 Hz physics step is independent of rendering and does not run while TEST is inactive.
- Reset reconstructs one isolated world, restoring identical transforms and counts without stale bodies or joints.

## UI

The main surface is intentionally small: fixture, physics mode, TEST, RESET, status, side view, and follow camera. Masses, carriage count, speed, acceleration, guide/coupler tuning, gravity, release mode, support controls, and debug overlays are hidden in **Settings**.

Fixtures:

| Fixture | Deterministic setup | Expected result |
|---|---|---|
| A | All 17 approach/bridge/exit segments supported | `CROSSED` |
| B | Centre segments 6–7 absent at reset | `TRAIN_FELL` |
| C | Centre segments 6–7 removed as the locomotive approaches | `TRAIN_FELL` |
| D | Segments 4–6 removed under carriage 1 | Carriage-first derail, then fall |
| E | Segments 5, 6, 7 fail progressively | Progressive derail/fall |

## Source map

- `src/core/train-simulation.js` — isolated Rapier world, bodies, couplers, guidance, fallback mode, reset, events, loads.
- `src/core/track.js` — straight centreline and `RailSupportMap`.
- `src/core/fixtures.js` — deterministic A–E support schedules.
- `src/renderer.js` — Three.js railway, primitive train, cameras, support/guide/physics debug.
- `src/main.js` — simple UI and public browser API.
- `tests/train.test.js` — deterministic contract and acceptance checks.

See [docs/CONTRACTS.md](docs/CONTRACTS.md), [docs/RAPIER_SETUP.md](docs/RAPIER_SETUP.md), [docs/PERFORMANCE_RESULTS.md](docs/PERFORMANCE_RESULTS.md), and [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md).

## Verification boundary

This is gameplay physics, not a railway engineering model. It deliberately does not simulate flanged wheels, calibrated moving-link/table collision, flexible rails, exact coupler hardware, or bridge structural failure. The centreline is straight but exposes `sample(s)` and `project(point)` so a future piecewise/curved implementation can preserve the train contract.

No native WebMCP acceptance is claimed.
