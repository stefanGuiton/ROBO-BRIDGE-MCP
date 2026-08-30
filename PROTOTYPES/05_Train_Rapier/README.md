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

- The default train is three instanced cuboids: locomotive + two carriages.
- Each coupler exposes two bounded visible freedoms: curve yaw and dip pitch.
- The logical centreline contains a smooth tight S-curve and vertical dip.
- Supported travel is analytic and performs zero Rapier world steps.
- Rapier bodies and spring joints remain ready but dormant until support is lost.
- Legacy fully dynamic spring/damper guidance remains available in Settings for comparison.
- Unsupported guides release instantly or with a short fade, preserve velocity, and latch off for the current TEST.
- Rail support controls only logical guidance and matching deck collision proxies.
- Gravity and collision remain active after release.
- Hybrid mode promotes the connected train island to dynamic bodies with route velocity at first support loss.
- A fixed 60 Hz logical/dynamic step is interpolated independently from rendering; Rapier does not step while fully supported or while TEST is inactive.
- Track, sleepers, support overlays, train bodies and couplers use instanced/shared geometry.
- Reset reconstructs one isolated world, restoring identical transforms and counts without stale bodies or joints.

## UI

The main surface is intentionally small: fixture, TEST, RESET, status, side view, and follow camera. Physics mode, masses, carriage count, speed, acceleration, guide/coupler tuning, gravity, release mode, support controls, and debug overlays are hidden in **Settings**.

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
- `src/core/track.js` — straight/curved dipping centrelines and indexed `RailSupportMap`.
- `src/core/fixtures.js` — deterministic A–E support schedules.
- `src/renderer.js` — Three.js railway, primitive train, cameras, support/guide/physics debug.
- `src/main.js` — simple UI and public browser API.
- `tests/train.test.js` — deterministic contract and acceptance checks.

See [docs/CONTRACTS.md](docs/CONTRACTS.md), [docs/RAPIER_SETUP.md](docs/RAPIER_SETUP.md), [docs/PERFORMANCE_RESULTS.md](docs/PERFORMANCE_RESULTS.md), and [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md).

## Verification boundary

This is gameplay physics, not a railway engineering model. It deliberately does not simulate flanged wheels, calibrated moving-link/table collision, flexible rails, exact coupler hardware, or bridge structural failure. The two coupling freedoms are functional pitch/yaw in this Y-up world: pitch around world Z follows dips and yaw around world Y follows corners. Roll around the train's forward X axis is reserved for derail/banking presentation rather than becoming another supported-travel joint degree of freedom.

No native WebMCP acceptance is claimed.
