# Test evidence

Date: 2026-08-30.

## Automated

`npm test` passed 12/12 checks:

1. minimal rail-support contract has no bridge-generator dependency;
2. straight centreline sampling/projection;
3. exact reversible support mutation and read-only queries;
4. stable dynamic supported crossing;
5. supported crossing in kinematic comparison mode;
6. the maximum six-carriage configuration crosses with seven stable bodies and six joints;
7. missing and live-removed centre support produce `TRAIN_FELL`;
8. fixture D first derails carriage body 1;
9. only the guide inside the removed segment releases;
10. narrow active-body load output;
11. bit-identical reset transforms and stable body/joint counts for 20 TEST/RESET cycles;
12. inactive TEST performs zero physics steps.

`npm run acceptance` then exercised fixtures A–E in both modes. Both supported runs returned `CROSSED`; all eight failure runs returned `TRAIN_FELL`. Fixture D reported body 1 as the first derail in both modes.

## Browser visual inspection

The source server was opened in the Codex in-app browser at `http://127.0.0.1:4181/` and inspected at 1280×720.

Observed:

- Initial side view clearly showed an orange locomotive, two blue carriages, visible couplers, rails, sleepers, deck, banks, water/ravine, and support overlay.
- Fixture A / Dynamic guide stayed aligned and articulated, then displayed `CROSSED · all cars cleared the bridge` at 13.4 simulated seconds.
- Fixture C removed centre support while moving. Two centre sections became transparent red, the locomotive pitched into the opening, the coupled carriages articulated behind it, and the page displayed `TRAIN_FELL · gravity took over` at 7.6 simulated seconds.
- Fixture B / Kinematic release switched to Rapier dynamics at the pre-existing gap and displayed `TRAIN_FELL` at 6.7 simulated seconds.
- Follow camera retained the train after reset/fixture changes, and Side view remained usable.
- The simple top bar stayed uncluttered; all tuning, support actions, and debug toggles appeared only after opening Settings.
- No browser console warnings or errors were present during the inspected flows.

## Boundary

This evidence proves the standalone browser prototype and its local contracts. It is not integrated-application, structural-solver, native WebMCP, packaged-app, or physical-machine evidence.
