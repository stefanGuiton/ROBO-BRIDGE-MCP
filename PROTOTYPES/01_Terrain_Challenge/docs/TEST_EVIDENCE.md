# V2 Terrain Deterministic Test Evidence

## Automated result

Command:

```powershell
npm run check
npm test
```

Result on 2026-08-30:

- syntax: PASS — 14 source/test JavaScript files;
- tests: PASS — 14/14 test groups;
- rejected-setting transaction: PASS — invalid settings retain the previous terrain and dispose only the rejected candidate;
- secondary XYZ post-process: PASS — transformed field samples, bounds, platforms, corridor, export, topology, determinism, and watertightness agree;
- browser-control preset precision regression: PASS — all preset values align with the HTML range steps;
- mountain envelope: PASS — non-flat presets reach their exact ground shelf on all outer bank edges while the flat fixture remains unchanged;
- topology ownership: PASS — analytic mountain/ravine classification remains exactly two banks across corruption and 1,000 bounded seeds;
- property sweep: PASS — 1,000 bounded cases across all six presets;
- deterministic golden checksums: PASS — height, support, mesh, and challenge;
- exact shared platform plane: PASS;
- platform displacement mask zero: PASS;
- ENTRY/EXIT support and corridor crossing: PASS;
- height/support query agreement: PASS;
- every sampled exported support region supportable: PASS;
- exactly two high-ground components: PASS;
- watertight positive-volume mesh: PASS for all presets;
- river ribbon follows generated centreline: PASS.

The default test command performs no evidence writes. `npm run evidence` is the explicit write command.

## Acceptance mapping

| # | Condition | Result | Evidence |
|---:|---|---|---|
| 1 | Same seed/settings, identical checksums | PASS | Node golden checksums pass; live Mountain and Alpine height hashes matched their frozen goldens |
| 2 | Exactly one left and one right bank | PASS | Two-component test and 1,000-case sweep |
| 3 | Obstacle separates the banks | PASS | Two-component topology and centreline crossing assertions |
| 4 | Platforms exactly coplanar | PASS | Dense platform queries for all presets |
| 5 | Platform interiors flat/supportable | PASS | Height, slope, normal, displacement, and support assertions |
| 6 | One flat plane contacts both datums | PASS | Identical `sharedTopY` and dense platform samples |
| 7 | ENTRY/EXIT inside protected platforms | PASS | Anchor/platform assertions |
| 8 | Route crosses obstacle near crossing axis | PASS | Negative-X ENTRY, positive-X EXIT, straight X corridor |
| 9 | Exported support regions contain only supportable terrain | PASS | Dense sampling of every exported rectangle |
| 10 | Corruption never modifies platforms | PASS | Exact zero displacement mask in protected cores |
| 11 | Water follows river centreline | PASS | Strip midpoint/centreline comparison |
| 12 | One closed watertight volume | PASS | Edge degree, connectivity, degeneracy, and signed-volume validation |
| 13 | Height queries match top vertices | PASS | Grid sample/query agreement test |
| 14 | Regeneration has no renderer-resource growth | PARTIAL | Three live preset replacements held 11 geometries for non-river terrain and 12 with the expected river mesh; 100-cycle browser proof remains open |
| 15 | Generation/mesh/render meet budgets | PARTIAL | Mesh p50 remains below 35 ms and live inspection held 120 FPS; refreshed pure p50 was 23.311–27.252 ms, above the aspirational 20 ms target |
| 16 | Invalid settings do not blank the viewport | PASS | Reproduced the Alpine depth/drop conflict; the last valid Alpine mesh remained visible with `INVALID_MOUND` status |
| 17 | XYZ stretch remains contract-authoritative | PASS | Non-uniform 1.5 × 1.75 × 0.65 automated transform test plus live 1.5 × 1.5 × 0.75 browser inspection |

Raw deterministic data: `DETERMINISM_EVIDENCE.json`.

## Live visual inspection

The in-app browser displayed repeated parameter iterations of `V2_MOUNTAIN_PASS` and `V2_ALPINE_RAVINE`, followed by final checks of Ravine and River, on a white background with no fog. Screenshots were inspected after each major shape change. The accepted presets descend to a visible ground shelf, have narrower clipped caps and ridged mountain bodies, retain closed cutaway walls, and keep both protected platforms visibly level.

Live hashes were `fnv1a32:409b7ba5` for Mountain and `fnv1a32:e5d48fef` for Alpine, exactly matching the refreshed Node goldens. The reported Alpine combination (`obstacle depth 21`, `fall to ground 42`) was reproduced as the expected `INVALID_MOUND`; the previous Alpine terrain stayed visible. A non-uniform 1.5 X, 1.5 Y, 0.75 Z Alpine model rendered with both level pads, ENTRY/EXIT, corridor, closed side walls, and automatic camera reframing intact. The earlier range-step coercion defect remains covered by the automated browser-control precision regression.
