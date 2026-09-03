# Terrain 7 resume checkpoint — 2026-09-03

Branch: `codex/p0-downstream-integration-prep`, base `eae3ba1415f6e4edeb8fa6be92526c8e92036787`. No merge or PR retarget authorized. Single agent; no Oracle-loop workflow. User owns all visual inspection; **VISUAL: USER-VERIFY PENDING**. No screenshots taken.

Published Terrain7/geometry/hardening checkpoint: `23f254bca37fdef2a283d09d5e2bfe9b77211d74` (local/remote SHA verified). The later Z-hop checkpoint is identified by `git log -1 --format=%H -- apps/web/src/robot/terrain-travel-policy.js`. Neither is a final hero freeze. User Blender files, Downloads and temporary Oracle extraction are untouched; explicitly requested diagnostic evidence is local under `artifacts/terrain7/` and is not committed.

Authoritative task: `Downloads/CODEX_SOL_HIGH_FINAL_TERRAIN7_WATER_DATUM_INTEGRATION (1).md` plus the user-visual-inspection addendum. Read current `origin/main:MASTER_PLAN.md` version **2026-09-03-I**, commit `491f971bc96e94c2f448ec7bcd1a83ade47138d1`. The local branch's older root plan was not merged/overwritten.

## Implemented, verification in progress

- Production Terrain 7 copy (source `Scene_and_3D_Files/Terrain_7_Main.glb`, SHA256 `419adc72b8fb408eea5060142890682fbcd03709b4cd4d292742286ba1518217`). Loader preserves named node hierarchy, authored transforms, materials and water normal/UV transforms.
- One ChallengeService preset supplies authored anchors, bridge/route transform and constant water datum -132.718 mm. Compiler-local support Y=0 maps to machine Z=4 mm; ENTRY/EXIT machine Z=136.718 mm, centre (650,-111.2), span370 mm, +X direction. No safety workspace widening.
- Human-only explicit solid-terrain ray occlusion, including back-facing tunnel surfaces and fresh click-time checks; water/markers excluded. Unit tests pass; browser state acceptance is pending.
- Final height-compatible Aqueduct tuning 4/3/3, offset .4, support bands2.4, deck4.8. Standard brick scale remains2. Exact arch underside cell-edge reservation/crown-height repair removes demonstrated masonry/arch overlaps.
- Current compile **bp_818c1694**, checksum **818c1694**, **303 parts**, PartRegistry **pr_55ecaf7f**. Exact co-oriented masonry/arch audit has **0 intersections**; track enclosing proxies have **0 overlaps**. Track bases now derive from the packed deck height so the non-grid-aligned datum cannot bury sleepers in the deck. The existing Train route seam derives the changed rail-top offset.
- Shared feeder now dynamically spaces physical part bounds, including newly present 1x20x1 beam. Distinct source admission and low-surface-first scheduling avoid source duplication and premature arch installation.
- Async Construction reset fences runner and controller idle/held state; startup rollback no longer relies on `this.reset()`.
- Runtime errors preserve known codes and recovery fields; low-level workcell reset rejects active missions with `mission_reset_required`. Scene reads have bounded, revision-checked cursor paging. Runtime availability includes the placement methods.
- Submission scripts default to no screenshots. Browser checks assert hologram state/identity and label visual inspection `USER-VERIFY PENDING`. Opt-in images require `ROBO_BRIDGE_CAPTURE_SCREENSHOTS=1`; Player browser script requires `--screenshots` alongside `--write-evidence`. Do not enable either without the user's request.

## Evidence / remaining

- Physical target bounds: X458.1..841.9,Y-135.2..-87.2,Z4..144.448 mm;303 capture centres inside unchanged actual V8 workspace X250..1050,Y+-450,Z10..600. Bounds check is not swept-motion acceptance.
- Current deterministic Construction run: **46/303 accepted, Human1 / Agent45**, shared source reassignment and Human target adoption both PASS. This is service/controller evidence, **not browser mouse/native evidence or a cycle-time benchmark**. Cadence sleeps are omitted only by the diagnostic script; real controller trajectories, collision/IK checks and board commits remain enabled.
- **Blocking motion:** `bp_818c1694.s.12.0` is accepted on unlatch, then empty-tool retreat collides with arch source `bridge-src.eecff488.009`. No collision bypass or safety-limit widening. A final-volume-clear design is not yet a proven robot-executable construction sequence.
- A/B/C/D: A0 prohibited internal overlaps; B100 potential terrain overlaps (terrain triangles versus part AABB, conservative diagnostics); C303 centres blocked from at least one of five synthetic views, **59 blocked from all five**; D0 missing declared dependencies/above-datum targets lacking declared support. B/C are not exact buried-volume or visual acceptance; D is not a structural solver.
- Verification: final combined `npm run verify` **356/356 JS +20/20 reliability PASS**, all154 production JS/four Python syntax and required-file checks PASS. Screenshot-free gate hardening focused17/17 PASS.
- Packaging/source fingerprint excludes user Downloads, source Blender/model exports, temporary Oracle extraction and generated artifacts. Read-only release-boundary check PASS:469 selected files, production Terrain7 included. These large unrelated inputs previously affected verification time and could be accidentally bundled. Release build is a local packaging gate, not deployment/readiness acceptance.
- Terrain7 Train failure path PASS in deterministic integration (`TRAIN_FELL / SUPPORT_LOSS`); existing completed-board fixture CROSSED remains a unit test, **not completed physical bridge evidence**.
- The earlier headless launch denial is resolved: the user explicitly authorized a retry and the approval service accepted it. Updated browser results are below. Local demo and Terrain7 asset HTTP HEAD both200 at port8774.
- Remaining: collision-free release/grasp at the narrow masonry seat; investigate low/buried target accessibility with user feedback; replace the incomplete flagship driver only once physical construction is executable; final smoke/gate/hero1 thenhero3. No PR merges or retargeting.
- No final Train CROSSED, Mission COMPLETE, hero3, or submission readiness claim.

## Reproduce (explicit evidence only)

```text
node scripts/audit-terrain7.mjs --write-evidence
node scripts/verify-terrain7-construction.mjs --write-evidence
npm run verify
```

Local evidence: `artifacts/terrain7/geometry-audit.json`, `artifacts/terrain7/construction-progression.json`. The progression command correctly exits1 on the current blocker.

Current BOM: 108×1x1x1,159×1x2x1,3×1x20x1,21×ARCH_A,9×ARCH_B,3×TRACK_SEGMENT. All six non-zero classes allow both Human and Agent. The six-class final production placement acceptance is not yet complete.

## Z-hop addendum and authorized browser retry — 2026-09-03

- Implemented `Downloads/CODEX_SIMPLE_TERRAIN_MAX_Z_HOP_ADDENDUM.md` through the existing ChallengeService, ConstructionService and placement executor. No general path planner or geometry change.
- ChallengeService measures39,764 transformed vertices from `Terrain`, `Tunnel`, `Entry_Structure`; all water/markers/helpers are excluded. Maximum solid machine Z = **349.83491403388985 mm**. Endpoint/elevation changes are reflected through the same transform.
- Existing empty-tool collision proxy extends2 mm below TCP. The deepest current payload extends41.400001525878906 mm below TCP. One frozen TCP travel Z = **391.3349155597688 mm**, including0.1 mm numerical margin. This clears the tool and all current payloads at transfer height; it does not assert a collision-free approach through terrain or calibrated moving-link clearance.
- Initial vertical move, source lift and post-release lift explicitly preserve current XY and tool yaw. Horizontal source/target transfers use that same plane. Out-of-workspace travel rejects BUILD before changing any authority. Reset restores the prior coordinator policy. Diagnostic failures expose stage/start/requested TCP.
- Clean deterministic rerun still accepts **46/303 (Human1/Agent45)** with reassignment/adoption PASS, then rejects `target_retreat` after `bp_818c1694.s.12.0`. Start TCP(561.964190,-127.179958,45.313509); requested TCP keeps exactly the sameXY and rises to391.334916.
- Exact remaining obstruction: empty tool bounds X549.964190..573.964190,Z43.313509..79.313509 intersect support arch `bp_818c1694.c.7.0` at X548.666666..554,Z13.6..52.000002 (overlappingY). The arch is a required dependency, not a source that can simply be moved away. Overlap exists at release and after6 mm lift;12 mm lift is clear. Therefore this is a **release-pose/tool-envelope interference**, not a lateral move at the travel plane. Do not jump over the first segment, ignore the arch, shrink the proxy or force acceptance. A separate legitimate grasp/geometry decision is needed.
- Added five tests for transformed solid-only maximum, real proxy-derived clearance, outside-workspace rejection without mutation, actual controller vertical/plane moves and reset, and the release-interference regression.
- Final `npm run verify`: **361/361 JS +20/20 reliability PASS**,155 JS/four Python syntax files, overall PASS. An earlier wrapper run failed only while fingerprinting the user's newly created locked `Downloads.zip`; excluded that non-production archive from both fingerprint/release selection and reran successfully. Archive untouched. Release-boundary check:471 selected source files, Terrain7 included, user archive excluded. Changed browser-script syntax and scoped whitespace checks PASS.
- Supported headless Chrome148, no injection/production shim in the native probe:27 unique tools, HUD `27 TOOLS READY`, submission facade absent in normal mode,0 console errors/0 warnings. Native/Mission scripts now support JSON evidence without implicit screenshots.
- Post-Z-hop browser Mission acceptance: current303-part freeze and shared plan identity, invalid-phase edit guard, real `TRAIN_FELL` returning BUILD, reset to DESIGN/new mission ID;0 errors/0 warnings. Local JSON: `output/playwright/terrain7-z-hop/native/acceptance.json` and `output/playwright/terrain7-z-hop/mission/acceptance.json`.
- Actual Player browser retry: fixed stale1x1-foundation fixture selection to use the live eligible standard class. Source `bridge-src.c96cc31d.000` now resolves, but the old fixed camera cannot highlight it under Terrain7 ray gating; timed out with0 console errors/0 warnings. This test remains FAIL; no actual browser Human snap claimed for Terrain7.
- Completed broader audit before Z-hop: **62 PASS /4 FAIL /0 NOT_AVAILABLE /2 SKIPPED_WITH_REASON**,68 total. Failures: user modified tracked Blender files; Train success; full Mission COMPLETE; required screenshot package absent because screenshots are forbidden by the user addendum. Skips: user visual inspection and annotation manual review. Source reassignment, construction probe, Train failure, reset, nine adversarial cases pass. Report: `artifacts/submission-evidence/webmcp-audit/submission-gate-report.json`. This instrumented audit is distinct from the separate native registration probe. No green final gate/hero claim.
- Prior release ZIP successfully built: `dist/ROBO_BRIDGE_MCP_MAIN_DEMO.zip`,54,096,300 bytes,SHA256 `b62157c8b032ad88e566f05db6b4bbf5f4e3b8b67223554a8c906d9518b681e9`. Built before the Terrain7 commit; manifest still names base `eae3ba1`. It does **not** contain the subsequent Z-hop changes and is not a final-SHA-bound release.
- **VISUAL: USER-VERIFY PENDING.** No screenshots taken, no PR merge/retarget, no physical-hardware or full construction/performance claim.
