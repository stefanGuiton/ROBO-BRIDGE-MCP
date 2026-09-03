# Terrain7 Viaduct hero — 2026-09-03

Branch: `codex/p0-downstream-integration-prep`.
Published Viaduct HEAD: **`0a23db03a7a350a726f4be41e826d9bd66e8af8d`**, local/remote SHA verified on the branch above. Parent Scene Layout checkpoint: `9998ef3966ca34262b54e5227fd692a06cbbe651`. PR #6 stays draft on its existing base; no merge or retarget.

Latest user direction: defer collision fixes. The subsequent unfinished collision/release experiment was removed; production source is back at the pushed checkpoint, with existing collision checks intact. Focused regression after restoration: **20/20 PASS**. Physical progress remains the previously verified **183/276**, not a completed bridge. Train CROSSED, Mission COMPLETE and hero:1/3 have not been established. The conditional final merge gate remains unsatisfied.

Scope: `Downloads/CODEX_SWITCH_FINAL_HERO_TO_VIADUCT.md`. Single agent; no Oracle-loop workflow, screenshots or visual claims. Stop at the next real execution blocker. User owns visual inspection.

## Implemented

- Terrain7 default is the existing V4.6 Type 2 **Viaduct**, using BridgeHost's tested family preset. Aqueduct compiler, schema and regression coverage remain intact.
- Default **four arches**. Existing production voxel size 8, brick-height ratio 0.6 and world scale 2 are unchanged. One-layer deck 4.8 compiler units, cap 0, penetration 0 adapt the preset to the established track/water support seam. No compiler redesign.
- Terrain7 asset, 370 mm authored span, ENTRY/EXIT, water datum -132.718 mm, challenge identity, transforms, route, PartRegistry/BuildBoard, Mission and 27-tool registrar remain authoritative and unchanged. The legacy challenge ID `terrain7-easy-aqueduct` is retained as an identity, not a family selector; its family hint now says VIADUCT.
- The existing `update_bridge_design` description and submission browser acceptance now feature **NUMBER OF ARCHES** through `patch.viaduct.archCount`. No tool added.
- Scene Layout controls and MORE BRICKS remain available.

### Why four rather than six

Six at the fixed grid fails the existing minimum four-cell arch pitch: 3.854 cells available; minimum physical span would be 384 mm. Neither grid nor span nor validation was weakened.

Five with the tested 0.79 opening ratio compiles 303 parts and A=0, but has three unsupported arch targets (D=3). Narrowing five to 0.65 gives A=0/D=0 but increases the build to 327 parts. Four retains the tested 0.79 proportions with A=0/D=0 and 276 parts (12 physical arches). A three-arch variant also passes A=0/D=0 with 240 parts; it is the tested single-parameter co-design example, not the executed default. User may choose the preferred silhouette. These counts are measured diagnostics, never hardcoded runtime inventory.

## Exact current identity and audits

- Family: VIADUCT; archCount: 4.
- Plan: `bp_9453b510`; checksum: `9453b510`; total: **276**.
- Registry: `pr_5491033f` (generated dynamically from this plan).
- BOM: 138 `1x1x1`, 123 `1x2x1`, 12 `ARCH_B`, 3 `TRACK_SEGMENT`; no ARCH_A or long bricks in this plan.
- A: **0 exact internal intersections; 0 track proxy risks**.
- D: **0 missing dependencies / above-datum targets without declared support**. This is not a structural solver certificate.
- B: 77 targets intersect solid terrain triangles under conservative part-AABB diagnostics. Not an exact mesh-volume certificate; no terrain collision geometry changed here.
- C: 276 targets have at least one occluded synthetic viewpoint; 77 have all five tested viewpoints occluded. Human accessibility is therefore not globally proven. User-camera inspection remains pending.
- Physical part bounds in machine mm: X 458.1..841.9, Y -135.2..-87.2, Z 4..144.44800023. All 276 required capture TCPs pass existing Cartesian bounds; target/table proxy invalid count 0. No safety-limit changes or exact moving-link mesh collision claim.
- Frozen terrain travel plane remains Z 391.33491556 mm from solid max Z 349.83491403 mm plus tool/payload clearance.

## Verification

- Focused Viaduct + Terrain7 + preserved Aqueduct tests: **11/11 PASS**.
- Full `npm run verify`: **368/368 JavaScript + 20/20 reliability PASS**, 156 JS / 4 Python syntax files, required-files and removed-legacy checks PASS. The new browser/audit scripts also pass `node --check`. Historical Aqueduct release-collision test now explicitly supplies its original Aqueduct parameters; it is preserved, not disabled.
- Real headless Chrome 148 native registrar: **27 unique tools**, `navigator.modelContext`, no production shim, normal-mode submission facade absent. **0 errors / 0 warnings**.
- Real MAIN_DEMO browser: guarded production `update_bridge_design` callback changes 4 to 3 arches, increments revision exactly once, replaces the single exact hologram group and changes plan/checksum. Spatial authority unchanged. Stale/invalid edits reject unchanged; reset restores four; BUILD blocks design changes.
- Example successful tool input (read the current revision first):

```json
{"expectedDesignRevision": 1, "patch": {"viaduct": {"archCount": 3}}}
```

- Early TEST produces **TRAIN_FELL**, same Mission returns to BUILD; Human adapter then places one target and Mission/UR10 executes three. One board/inventory, source theft reassignment and target takeover/adoption pass. Player stays enabled. This is service-adapter Human input in a real browser, **not** mouse-driven Player acceptance or external-agent native tool invocation.
- CROSSED / Mission COMPLETE / hero:1 / hero:3: **not established**. The plan's conditional later gates stop at the physical blocker below; neither hero command was rerun for this local Viaduct checkpoint.
- VISUAL: **USER-VERIFY PENDING**. No screenshots.

## Deterministic construction: next real blocker

Current four-arch run accepted **183/276** (Human 1, Agent 182): 178 standard bricks + 5 ARCH_B, no tracks yet. Real RobotController trajectories, limits, collisions, latch/unlatch, PlacementAuthority and BuildBoard remained active. Cadence sleeping was disabled only in the command-line diagnostic; this is not real-time or hardware cycle evidence.

The next cycle accepts target `bp_9453b510.s.54.0`, then fails `target_retreat` with `collision` against `bridge-src.12ab1a6f.135`, already accepted as required support arch `bp_9453b510.c.0.0`. The brick stays correctly accepted; the cycle is **not** reported as successful. Robot is idle, gripper empty. Intended TCP `(482,-127.2,122.1)` overlaps that arch in the existing empty-tool collision model at release and +6 mm; +12 mm clears. Raising only the final Z-hop destination cannot clear that starting segment.

Do not bypass/shrink collision or pretend the bridge is complete. Jaw/release-clearance work was deferred by the user; this task does not implement it. No Train physics or mission completion shortcuts were introduced.

## Evidence and resume

- `artifacts/terrain7/geometry-audit.json` — A/B/C/D, exact identity/BOM (explicit diagnostic command output; ignored).
- `artifacts/terrain7/construction-progression.json` — 183/276, exact blocker/stages, physical bounds and contributions (ignored).
- `output/playwright/viaduct/native/acceptance.json` — supported-browser native registration.
- `output/playwright/viaduct/acceptance.json` — actual hologram mutation, same-mission early failure/recovery and shared Human/UR10 evidence.
- Commands: `node scripts/audit-terrain7.mjs --write-evidence`, `node scripts/verify-terrain7-construction.mjs --write-evidence`, `node scripts/viaduct-browser.mjs --write-evidence` (browser/module paths supplied locally), `npm run verify`.

Next work is the real release/tool-clearance blocker or a user-approved alternate arch configuration, then full physical construction, Train CROSSED and Mission COMPLETE. The existing `runFlagshipJourney` acceptance facade still executes only one five-part batch; after physical construction is unblocked, extend that explicit diagnostic to bounded repeated Mission calls and the required early-failure/human sequence before claiming hero:1/3. Never fake completion or use a completed-board fixture as physical proof.

Preserve user Blender files, Downloads, other assets and generated evidence. Only the Scene Layout parent has been pushed in this turn.
