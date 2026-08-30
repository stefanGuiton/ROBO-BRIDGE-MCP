# Validation report

## Automated acceptance

**COMPLETED — 11/11 tests pass.**

- all nine families use `BridgeGraph2D`;
- beam spans the flat-gap fixture;
- trestle foundations terminate on supportable terrain;
- Warren, Pratt and Howe patterns are distinct;
- arch rise and circular/parabolic shape alter deterministic geometry;
- vehicle clearance is explicit and valid for every fixture graph;
- invalid inputs return machine-readable codes;
- repeated generation produces byte-identical canonical JSON;
- suspension output includes towers, anchors, a main cable and hanger targets;
- generation does not mutate its inputs or depend on an animation loop.

`npm run build` also completes successfully and produces the ignored local `dist/` directory.

## Visual acceptance

**PARTIAL — six of nine families inspected with Windows Computer Use.**

Beam, trestle, Warren, Pratt, Howe and arch were recognisable, clean, valid and responsive in Microsoft Edge. The user stopped Computer Use with Escape before the aqueduct, box and suspension visual pass. Their generated graphs are covered by the automated suite and exported fixtures, but no completed Windows visual claim is made for those three families.

## Evidence

The authoritative machine-readable family/checksum report is `fixtures/exports/validation-report.json`.
