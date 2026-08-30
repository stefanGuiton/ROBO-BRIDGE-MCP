# Test evidence

Date: 2026-08-30.

## Automated

`npm test` passed 14/14 checks:

1. minimal rail-support contract remains bridge-generator independent;
2. straight centreline sampling/projection;
3. curved/dipping centreline supplies normalized pitch/yaw frames;
4. indexed support mutation is exact, reversible and read-only on queries;
5. fixture A crosses with zero Rapier steps while supported;
6. legacy dynamic guide comparison remains available;
7. the maximum six-carriage configuration crosses analytically;
8. the default three-link train reports exactly two coupling DOFs;
9. fixtures B/C promote into Rapier and fall;
10. fixture D first derails carriage body 1;
11. only the guide in an unsupported segment releases;
12. train-load output remains narrow;
13. bit-identical reset and 20-cycle body/joint stability;
14. inactive TEST performs no steps.

`npm run acceptance` exercised fixtures A-E in hybrid and legacy dynamic modes, plus three- and seven-body scaling probes. Hybrid A crossed with zero Rapier calls. Hybrid B/C/E fell, and D produced carriage-first derailment.

## Browser visual inspection

Observed in the Codex in-app browser at `http://127.0.0.1:4182/`:

- three clearly coloured cuboids and two visible couplers;
- the supported chain pitches into the dip and yaws around the tight S-curve;
- fixture A remains analytic at 120 displayed FPS;
- fixture B changes the metrics path from ANALYTIC to RAPIER, then falls with coupled articulation;
- normal draw calls dropped from 28-30 to 10-12;
- Settings contains the legacy dynamic comparison and all complex tuning;
- no console warnings or errors.

## Boundary

This proves the isolated browser prototype on this machine. It is not integrated-application, structural-solver, native WebMCP, packaged-app or physical-machine evidence. Frame timing is local browser evidence, not a universal 120 FPS guarantee.
