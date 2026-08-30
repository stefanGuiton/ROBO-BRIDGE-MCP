# V2 Terrain Performance Results

Measured on 2026-08-30 with Node v22.19.0 on Windows x64. Each row uses five warm-ups and 25 measured runs at a 129 × 97 authoritative top grid.

| Preset | Pure p50 | Mesh p50 | Total p50 | Total p95 | Vertices | Triangles |
|---|---:|---:|---:|---:|---:|---:|
| V2_FLAT_GAP_SMALL | 27.252 ms | 5.668 ms | 35.689 ms | 44.786 ms | 12,962 | 25,920 |
| V2_RAVINE_SIMPLE | 24.711 ms | 4.727 ms | 30.824 ms | 35.225 ms | 12,962 | 25,920 |
| V2_RIVER_SIMPLE | 23.372 ms | 4.228 ms | 29.751 ms | 32.877 ms | 12,962 | 25,920 |
| V2_MOUNTAIN_PASS | 23.583 ms | 4.390 ms | 30.100 ms | 31.504 ms | 12,962 | 25,920 |
| V2_ALPINE_RAVINE | 23.925 ms | 4.202 ms | 30.653 ms | 35.235 ms | 12,962 | 25,920 |
| V2_CORRUPTION_STRESS | 23.311 ms | 4.234 ms | 30.379 ms | 33.263 ms | 12,962 | 25,920 |

Result: all presets remain well below the 35 ms mesh-data target, but this refreshed run did not meet the earlier aspirational 20 ms pure-generation median target (23.311–27.252 ms). Terrain regeneration is event-driven rather than per-frame, and clean live Mountain, Alpine, invalid-setting retention, and stretched-Alpine inspections remained at 120 FPS after settling. Full topology validation is measured separately in tests and is not run during ordinary regeneration.

The evidence harness now repeats each exact frozen preset seed for all measured samples. Earlier versions varied the seed during timing and then reported the final sample's support-region count under the preset name; that reporting ambiguity has been removed.

Browser GPU upload, first-frame time, steady FPS, and repeated-regeneration renderer memory are separate browser acceptance measurements and must not be inferred from these Node results.

Raw measurements: `PERFORMANCE_RESULTS.json`.
