# Performance results

Measured on 2026-08-30 with Node.js 22.19.0, Rapier 0.20.0, three train bodies, two joints and a fixed 60 Hz logical step.

## Headless physics/logic

`npm run acceptance` executes simulation steps as fast as possible without rendering:

| Mode | Fixture | Outcome | Observed average | Observed p95 | Rapier usage |
|---|---:|---|---:|---:|---:|
| Hybrid | A | CROSSED | 0.0717-0.1481 ms | 0.1901-0.3468 ms | 0% |
| Hybrid | B | TRAIN_FELL | 0.2845-0.4997 ms | 0.3091-0.6077 ms | 20% |
| Hybrid | C | TRAIN_FELL | 0.0955-0.1338 ms | 0.3906-0.4133 ms | 20% |
| Hybrid | D | DERAILED | 0.1339-0.2399 ms | 0.3353-0.7378 ms | 66% |
| Hybrid | E | TRAIN_FELL | 0.0436-0.0820 ms | 0.1281-0.2499 ms | 23% |
| Dynamic | A | CROSSED | 0.1432-0.2427 ms | 0.2833-0.5598 ms | 100% |

The warmed scaling probe measured:

| Train | Outcome | Average step | p95 step | Rapier steps |
|---|---|---:|---:|---:|
| 3 cuboids | CROSSED | 0.0187-0.0259 ms | 0.0310-0.0421 ms | 0 / 739 |
| 7 cuboids | CROSSED | 0.0394-0.0555 ms | 0.0699-0.1284 ms | 0 / 739 |

## Browser render

The Codex in-app browser was inspected at 1280 x 720:

- supported curved crossing: 120 displayed FPS, 8.50-8.75 ms five-second frame p95, 0% Rapier usage;
- dynamic gap failure: 119-120 displayed FPS, about 9.00 ms frame p95, 20% Rapier usage;
- simplified normal path: 10-12 draw calls;
- no browser warnings or errors.

The callback interval can be slightly above the theoretical 8.33 ms 120 Hz period because of browser/display scheduling. The observed 120 FPS is local interactive evidence, not a cross-machine guarantee.

## Implemented hot-path reductions

- no `world.step()` while fully supported;
- 60 Hz transforms interpolated at render rate;
- three instanced body cuboids and an instanced coupler set;
- instanced track, rails, sleepers and support overlay;
- device pixel ratio fixed at 1 in performance mode;
- shadows and MSAA disabled;
- metrics update at 10 Hz and use an allocation-free frame histogram;
- physics debug updates at most 15 Hz;
- centreline support lookup uses indexed flags and binary search;
- CCD disabled unless explicitly requested for failure bodies;
- four solver iterations;
- shared geometry/materials and reset-time visual reuse.

Twenty reset cycles retained exactly three bodies and two joints.
