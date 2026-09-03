# P0 Downstream Integration — Progress Handoff

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
