# Brick-ready validation report

## Automated acceptance

**COMPLETED — 21/21 tests pass.**

Coverage includes:

- common `BridgeGraph2D` contract for all 13 families;
- construction metadata and per-member raster intent;
- brick-native exclusion of Technic frame members;
- explicit hybrid warnings;
- beam, masonry pier and trestle support behaviour;
- distinct Warren, Pratt and Howe patterns;
- segmental and semi-elliptical arch response;
- founded masonry abutments and closed-spandrel zones;
- repeated viaduct bays and shared piers;
- orthogonal corbel steps;
- masonry box culvert replacement;
- tied-arch, suspension and bascule-specific output;
- vehicle-clearance metadata;
- brick-aware error codes and support-path rejection;
- byte-identical determinism for every family;
- JSON parse verification for all schemas;
- input immutability and on-demand generation.

All 13 families also generate valid graphs against the flat-gap fixture.

## Downstream compiler handoff

**COMPLETED — 13/13 graphs compile with valid diagnostics** through the existing isolated `03_Bridge_To_Bricks` compiler in a read-only compatibility run.

| Family | Candidate placements | Compiler valid |
|---|---:|---|
| beam | 340 | yes |
| pier | 836 | yes |
| arch | 694 | yes |
| viaduct | 958 | yes |
| corbelled | 666 | yes |
| boxCulvert | 517 | yes |
| trestle | 1,808 | yes |
| Warren | 880 | yes |
| Pratt | 978 | yes |
| Howe | 978 | yes |
| tiedArch | 648 | yes |
| suspension | 1,629 | yes |
| bascule | 654 | yes |

This proves contract compatibility and deterministic candidate packing. It does not claim robot reachability or physical load capacity.

## Visual acceptance

**COMPLETED — 13/13 families inspected in the Codex in-app browser.**

- all six brick-native families are recognisable and display bonded masonry masks;
- the viaduct bay masks were corrected after the first pass so openings no longer overlap lower foundation regions;
- all seven hybrid families are recognisable and visibly separated from the brick-native catalogue;
- hybrid selection returns `HYBRID_PARTS_REQUIRED` without invalidating the graph;
- disabling the hybrid catalogue while viewing a hybrid bridge safely returns to the masonry arch;
- numeric controls regenerate after one 140 ms debounce;
- debug labels do not regenerate geometry;
- no browser console errors were observed.

## Build and exports

`npm run fixtures` and `npm run build` complete successfully. Generated exports use manifest version 2 and generator version 2. Obsolete `aqueduct` and steel-style `box` fixture files are removed by the explicit fixture-generation command and replaced with `viaduct` and `boxCulvert` outputs.

The authoritative family checksums and compatibility declarations are in `fixtures/exports/validation-report.json`.

## Boundary

Status is **COMPLETED for the 2D brick-ready handoff**.

Native robot execution, final BuildPlan adaptation, physical LEGO stability, structural TEST physics and calibrated collision fidelity remain outside this prototype and are not claimed here.
