# Performance results

Measured on 2026-08-30 with Node.js 22.19.0, Rapier 0.20.0, three default bodies, two joints, and a fixed 60 Hz step. `npm run acceptance` executed physics as fast as possible without rendering.

| Mode | Fixture | Outcome | Simulated time | Average step | p95 step |
|---|---:|---|---:|---:|---:|
| Dynamic | A | CROSSED | 13.433 s | 0.6025 ms | 1.4201 ms |
| Dynamic | B | TRAIN_FELL | 7.567 s | 0.2877 ms | 0.6397 ms |
| Dynamic | C | TRAIN_FELL | 7.567 s | 0.2431 ms | 0.5313 ms |
| Dynamic | D | TRAIN_FELL | 26.633 s | 0.3494 ms | 0.8413 ms |
| Dynamic | E | TRAIN_FELL | 6.367 s | 0.1380 ms | 0.2687 ms |
| Kinematic release | A | CROSSED | 12.317 s | 0.1551 ms | 0.2738 ms |
| Kinematic release | B | TRAIN_FELL | 6.750 s | 0.1493 ms | 0.1964 ms |
| Kinematic release | C | TRAIN_FELL | 6.750 s | 0.1190 ms | 0.2611 ms |
| Kinematic release | D | TRAIN_FELL | 25.817 s | 0.2227 ms | 0.4627 ms |
| Kinematic release | E | TRAIN_FELL | 5.567 s | 0.0882 ms | 0.1714 ms |

The browser visual pass at a 1280×720 viewport showed approximately 110–120 FPS and live Rapier steps generally around 0.3–1.1 ms during the observed crossing/fall. Those are interactive observations, not a controlled benchmark.

Default object counts stayed constant through 20 TEST/RESET cycles:

```text
rigid bodies: 3
joints: 2
train bodies: 3
reset stable: true
```

The headless values include JavaScript/WASM warm-up and host scheduling. They are evidence for this machine/run, not a cross-machine performance guarantee.
