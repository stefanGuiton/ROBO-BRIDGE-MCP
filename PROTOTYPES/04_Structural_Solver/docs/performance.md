# Performance measurement

Measured on 2026-08-30 with Node.js `v22.19.0`, Windows x64.

The benchmark ran 100 deterministic BUILD solves for each of all 11 fixtures: 1,100 samples total.

| Measurement | Result |
| --- | ---: |
| Mean solve | 1.097 ms |
| Median solve | 0.275 ms |
| p95 solve | 3.362 ms |
| p99 solve | 32.103 ms |
| Maximum observed | 58.669 ms |
| Cached same-region calls | 2,000 / 2,000 skipped |
| Cached call mean | 9.790 µs |

The p99/maximum include JavaScript JIT, garbage collection, and Windows scheduling outliers. Median and p95 describe ordinary fixture solves more usefully. The region cache proves that animation-frame calls in one load region do not re-run connectivity or demand analysis.

Raw machine-readable evidence is in `performance-results.json`. Re-run `npm run benchmark` after solver changes.

These are isolated prototype timings, not integrated application frame timings and not structural-accuracy evidence. No Worker, WASM, or WebGPU path is justified by the current measurements.
