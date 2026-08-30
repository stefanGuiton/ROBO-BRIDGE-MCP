# Performance results

Generated: 2026-08-30T11:50:03.639Z

Node-side deterministic compiler benchmark: 10 warm-up runs, then 30 measured runs per fixture. Browser FPS and draw calls are live UI measurements and are intentionally not fabricated here.

| Fixture | Median compile | p95 compile | Placements | Occupancy cells | Checksum |
|---|---:|---:|---:|---:|---|
| beam | 53.02 ms | 92.54 ms | 122 | 1115 | `cfc32777` |
| trestle | 71.04 ms | 101.23 ms | 261 | 1402 | `c497c231` |
| warren | 74.18 ms | 89.19 ms | 294 | 1561 | `301446f2` |
| pratt | 94.50 ms | 239.34 ms | 300 | 1605 | `231bd61c` |
| arch | 87.00 ms | 161.37 ms | 264 | 1491 | `c3e796e8` |

## Long-beam impact

The beam fixture uses 122 placements with configured long beams versus 200 with standard short parts only: a 39.0% placement-count reduction.
