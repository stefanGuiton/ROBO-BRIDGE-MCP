# P0 Downstream Integration — Progress Handoff

## Latest resume point — 2026-09-03: Viaduct hero (supersedes below)

Scene Layout checkpoint pushed and SHA verified: `9998ef3966ca34262b54e5227fd692a06cbbe651`, same branch/draft PR #6, no merge/retarget. Then implemented `Downloads/CODEX_SWITCH_FINAL_HERO_TO_VIADUCT.md` locally. **Read `docs/VIADUCT_HERO_PROGRESS.md` first.** Terrain7 default now four-arch Viaduct, plan `bp_9453b510` / checksum `9453b510`, 276 parts. Six does not fit the unchanged grid/span; default five has unsupported feet; four preserves tested proportions and passes A=0/D=0. Aqueduct remains available with its safety regressions intact. WebMCP 4→3 arch update, exact scene hologram replacement, early TRAIN_FELL→same BUILD and shared Human/UR10 source/target adaptation pass in real headless Chrome; native 27-tool registration passes; 0 errors/warnings, no screenshots. Deterministic execution reached **183/276 (Human1/Agent182)**, then the real empty-tool retreat collision at `s.54.0` beside supporting `c.0.0`; do not bypass. Full JS regression 368/368 PASS. CROSSED/COMPLETE/hero:1/3 not established; VISUAL USER-VERIFY PENDING. User-directed stop at the next real blocker. Viaduct changes are not yet pushed. Keep user binaries/imports/evidence untouched.

Final Viaduct verification completed: `npm run verify` PASS — 368/368 JS, 20/20 reliability, 156 JS / 4 Python syntax files, all repository checks. Dynamic registry `pr_5491033f`. New explicit browser/audit scripts pass syntax checks. All final evidence/limitations are in the Viaduct progress document.

## Latest task switch — 2026-09-03: scene-layout controls

The user explicitly postponed collision and jaw-opening changes and requested `Downloads/CODEX_FINAL_SCENE_LAYOUT_CONTROLS_ADDENDUM.md` instead. The unfinished release/collision experiment was removed. This checkpoint adds settings sliders for table yaw and controller-backed robot base XYZ/yaw, plus shared frozen-plan **MORE BRICKS** refill. See `docs/SCENE_LAYOUT_CONTROLS.md` for controls, authority, restrictions and test evidence. Four targeted tests and isolated headless MAIN_DEMO interaction passed; full verification PASS: 365/365 JS + 20/20 reliability, 156 JS / 4 Python syntax files. Pre-publication focused checks: 37/37 PASS. No screenshots. User requested publication on `codex/p0-downstream-integration-prep` through existing draft PR #6, without merge/retarget; parent `ea7616574e99371db8cbccff6346bbc847d533f5`. Next user-directed task is `Downloads/CODEX_SWITCH_FINAL_HERO_TO_VIADUCT.md`; the old Aqueduct 46/303 blocker is not a Viaduct result.

## Current resume point — 2026-09-03 (supersedes the historical section below)

Continue **only** `codex/p0-downstream-integration-prep`; do not merge/retarget PR5 or PR6. Single agent. No Oracle-loop workflow. User owns visual QA; no screenshots.

See **docs/TERRAIN7_PROGRESS.md** for the final Terrain7 task, current code/evidence and exact blockers. Terrain7, constant water datum, shared transform, view-only terrain occlusion, arch/deck-track geometry repairs, shared feeder, reset/error/paging hardening are implemented. Current plan `bp_818c1694` / checksum `818c1694`,303 parts, registry `pr_55ecaf7f`; internal geometry audit clear. Latest combined verification after Z-hop: **361/361 JS +20/20 reliability PASS**,155 JS/four Python syntax files, overall PASS. Release packaging excludes unrelated user exports/imports/evidence, including the newly created `Downloads.zip` (untouched).

Published Terrain7 checkpoint: `23f254bca37fdef2a283d09d5e2bfe9b77211d74`. Its release ZIP built successfully (details in the progress document); it is not a final hero release.

The subsequent `CODEX_SIMPLE_TERRAIN_MAX_Z_HOP_ADDENDUM.md` is now implemented: loaded solid Terrain7 max machine Z349.834914 mm; one frozen safe TCP plane391.334916 mm including the actual tool/payload clearance and0.1 mm margin. Initial/source lifts and post-unlatch retreat preserve XY/yaw; transfers occur at the plane. Workspace, collisions, IK and shared authorities are unchanged.

Current physical progression is still **46/303**, Human1/Agent45, with source reassignment and target adoption passing. This is **not a lateral-transfer collision**: immediately after `bp_818c1694.s.12.0` unlatches, the empty tool already overlaps required support arch `bp_818c1694.c.7.0` (source `bridge-src.eecff488.009`). The first6 mm of vertical lift are obstructed;12 mm higher is clear. Raising the destination cannot make that initial segment safe. Do not bypass it or shrink the collision proxy. Next decision is a valid grasp/tool-clearance or bounded geometry correction, not a larger travel height.

The user explicitly authorized the browser retry. Headless Chrome148 now passes real native27-tool registration, current303-part freeze, frozen-edit guard, TRAIN_FELL→BUILD recovery and reset/new mission ID, with0 errors/0 warnings. No screenshots. JSON: `output/playwright/terrain7-z-hop/{native,mission}/acceptance.json`. Actual Player mouse acceptance remains blocked at source highlighting from the old fixed test camera; do not claim it passed. The broader pre-Z-hop audit is62 PASS/4 FAIL/2 documented skips; see detailed progress for the incomplete-bridge, dirty-user-worktree and omitted-image gates. HTTP demo is on8774. Hero1/3 remain unproven. User Blender/imported assets and generated evidence must not be staged.

## Historical downstream-preparation handoff

Updated: 2026-09-02 (Europe/London)

## Resume point

- Repository: `D:\ROBO-BRIDGE-MCP-TRUNK`
- Working branch: `codex/p0-downstream-integration-prep`
- Parent/source branch: `codex/p0-construction-integration`
- Parent commit: `d6154a58d97f52b3058d04c50eeb3ab5066de70c`
- Authoritative plan: `Downloads/SOL_HIGH_P0_DOWNSTREAM_INTEGRATION_PREP.md`
- Authoritative master plan: root `MASTER_PLAN.md`, Plan `2026-09-02-G`, source commit `149f72bff680e484449da37d0a5348850caa2abf`
- Work is intentionally single-agent. Do not use subagents.
- Do not merge to `main`. Finish by pushing this branch and opening a **draft PR** whose base is `codex/p0-construction-integration`.

## Completed and committed checkpoints

### A — Train integration

- Commit: `50ec8711e62f90840785a6c61edb268d5e320f54`
- Message: `Integrate Train MAIN_DEMO runtime`
- Train tests: 49/49 passed.
- Browser: real incomplete BuildBoard correctly produced `TRAIN_FELL / SUPPORT_LOSS`; an authoritative completed-board fixture produced `CROSSED`.
- One Train root and zero browser console errors/warnings were verified.

### B — Mission integration

- Commit: `d0d722fd2dda18712825d3213df26b95b9dd4e7d`
- Message: `Integrate Mission orchestration and semantic tools`
- Exactly 27 WebMCP tools: 14 existing low-level + 5 bridge design + 8 Mission.
- Mission tests: 114/114 plus 1 current-authority integration test passed.
- Browser proved DESIGN -> BUILD, current 131-part freeze, phase guards, TEST -> `TRAIN_FELL` -> BUILD, and reset with a new mission ID.
- Zero browser console errors/warnings.

### C — Submission Gate and WebMCP hardening

- Commit: `a3865e980d8c5a2a8b2c85f55ff99018cae109d2`
- Message: `Install submission gate and harden WebMCP`
- Added the supplied Submission Gate scripts/tests without historical evidence.
- Fixed `plan_placement_queue` mutation annotations.
- Native WebMCP uses the real browser provider; no production shim.
- Supported Chrome 148 evidence: native `navigator.modelContext`, exactly 27 registered tools, HUD `27 TOOLS READY`, facade absent in normal mode, zero console errors/warnings.
- Submission tests: 11/11; WebMCP: 16/16.
- Full verification at this checkpoint: 339/339 JavaScript and 20/20 reliability.

## Checkpoint D — Construction hardening (implemented, not committed yet)

Current intended files:

- `apps/web/src/render/robot-renderer.js`
  - Custom bridge parts are nested exact-geometry groups.
  - Centre-ray picking is now recursive.
  - `brickId` is propagated to every nested render object.
  - This fixes the real Player inability to select arches/tracks/other nested bridge parts.
- `tests/js/construction-part-class-hardening.test.js`
  - Uses the current live BuildPlan, dynamic PartRegistry, and shared inventory.
  - Proves each current hero class through real authorities: `1x1x1`, `1x2x1`, `ARCH_A`, `ARCH_B`, `TRACK_SEGMENT`.
  - For every class, Human and Codex use the same inventory identity and same BuildBoard; the board records one human and one agent snap.
- `scripts/construction-player-browser.mjs`
  - Explicit real-browser Player acceptance.
  - Uses real canvas clicks to pick a current shared Construction source, aim at a valid frozen target, and release it.
  - Verifies the authoritative BuildBoard records the human `snap`.
- `package.json`
  - Adds `construction:player-browser`.

### D evidence already passed

- New per-class suite: 6/6 passed (parent + five named subtests).
- Focused Construction/Player group: 37/37 passed.
- Existing shared source theft/reassignment passed.
- Existing human takeover of a Codex-intended target passed.
- Existing cancellation/reset and blocked-preview checks passed.
- Browser Player acceptance passed using current source `bridge-src.b222fb9e.027` and target `bp_0d7627b1.s.2.0`.
- Result: target accepted, `completedBy: human`, one authoritative BuildBoard `snap`, Player remained enabled.
- Current identity: plan `bp_0d7627b1`, checksum `0d7627b1`, 131 parts, PartRegistry hash `pr_767a6c8c`.
- Browser console: 0 errors, 0 warnings.
- Evidence directory: `output/playwright/construction-hardening/` (ignored; do not commit generated evidence unless explicitly requested).

## Latest complete Submission Gate result

Command: `npm run submission:gate`

- Summary: 70 PASS / 4 FAIL / 0 NOT_AVAILABLE / 1 SKIPPED_WITH_REASON (75 total).
- PASS: release build, JavaScript, WebMCP, robot, player, compiler, reliability 20/20, Construction authority, source reassignment, actual Train failure, 50-cycle reset/leak, and all nine adversarial cases.
- Expected blocking FAIL:
  1. `source.no_tracked_worktree_changes` — the working tree intentionally contains user Blender changes plus uncommitted D work.
  2. `future.train_success` — the physical 131-part bridge is not complete.
  3. `future.mission_state_machine` — complete mission cannot pass without a complete physical bridge.
  4. `hero.flagship_run_1` — same incomplete-bridge dependency.
- Report: `artifacts/submission-evidence/submission-gate-report.json`
- Markdown: `artifacts/submission-evidence/submission-gate-report.md`

## Final verification added after this handoff

- `npm run webmcp:audit`: **63 PASS / 3 FAIL / 0 NOT_AVAILABLE / 1 SKIPPED_WITH_REASON**. The three expected red checks are the dirty working tree, Train success, and Mission COMPLETE. Construction authority, source reassignment, actual Train failure, reset/leak, and all adversarial checks passed.
- `npm run verify`: **345/345 JavaScript PASS**, **20/20 reliability PASS**, 152 JavaScript syntax files, 4 Python syntax files, overall PASS.
- The optional duplicate `npm run hero:1` was stopped at the user's request to prioritize publication. The full Submission Gate had already recorded the same geometry-dependent flagship failure.

## Exact remaining work

1. Review only the intended D paths; run whitespace/syntax checks.
2. Commit D with message `Harden non-geometry Construction acceptance`.
3. Read and follow `C:\Users\Stefan Guiton\.codex\skills\push\SKILL.md` before publication.
4. Push `codex/p0-downstream-integration-prep`, verify local and remote SHA, and open a draft PR to `codex/p0-construction-integration`. Do not merge.

## Hard scope boundaries

Do not fix or disguise the 21 known compiler geometry intersections, terrain/support-floor geometry, custom arch geometry, workspace/table geometry, or ENTRY/EXIT transforms in this task. Do not widen robot safety limits, hardcode a stale 476-part fixture, bypass collisions, add instant build state, add duplicate robot/board/registrar authority, or expose joints through WebMCP.

## Preserve these user files

Do not stage, revert, delete, or overwrite:

- `Scene_and_3D_Files/Terrain_Optimised_10k.blend`
- `Scene_and_3D_Files/Terrain_Optimised_10k.blend1`
- all other untracked `Scene_and_3D_Files/*` assets
- `Downloads/`
- `apps.zip`
- user/generated `artifacts/`

`.oracle-stage-20260902/` is an owned temporary extraction directory and must never be committed. Delete it only after validating the exact resolved path and only when it is no longer needed.
