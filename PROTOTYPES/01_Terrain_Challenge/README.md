# ROBO BRIDGE MCP V3 — Terrain Challenge Prototype

Standalone greenfield prototype for deterministic terrain and `ChallengeState.json` generation. It has no bridge bricks, robot placement, structural simulation, train physics, or integration with the main ROBO BRIDGE application.

## Run

```powershell
npm run dev
```

Open `http://127.0.0.1:4173`. Drag to orbit, use the mouse wheel to zoom, and right-drag to pan. Three.js `0.179.1` and OrbitControls are pinned under `vendor/`, so the demo has no install step and no runtime network dependency.

## Verify

```powershell
npm test
npm run check
```

The five fixed presets are `FLAT_GAP_SMALL`, `FLAT_GAP_LARGE`, `RAVINE_SIMPLE`, `RIVER_SIMPLE`, and `NOISY_TEST`.

## Architecture

`src/terrain.js` owns deterministic generation and the terrain query API. `src/app.js` is a disposable Three.js rendering/debug layer. Regeneration removes the previous generated group and disposes every geometry, material, and texture before adding one replacement.

The V3 master plan defines top-level `ChallengeState.mode` as `rail | road`; this prototype exports `mode: "rail"`. The selected terrain mode is stored in both `challengeMode` and `terrain.obstacle.type`.

See [API.md](./API.md), [ChallengeState.json](./ChallengeState.json), and [docs/TEST_EVIDENCE.md](./docs/TEST_EVIDENCE.md).
