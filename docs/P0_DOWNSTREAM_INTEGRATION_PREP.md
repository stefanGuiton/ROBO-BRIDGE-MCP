# P0 downstream integration preparation

Working branch: `codex/p0-downstream-integration-prep`

Authoritative parent: construction WIP `d6154a58d97f52b3058d04c50eeb3ab5066de70c`

This branch follows `Downloads/SOL_HIGH_P0_DOWNSTREAM_INTEGRATION_PREP.md` and remains downstream of the unmerged Construction checkpoint. It does not repair or bypass the 21 known V4.6 compiler geometry intersections.

## Checkpoint A — Train MAIN_DEMO integration

Status: **PASS**

- Imported the reviewed Train V2.2 production runtime and MAIN_DEMO adapters from `ORACLE_TRAIN_MAIN_DEMO_ADAPTERS_V1(1)(1).zip` (SHA-256 `88B1D8D7AD0B4BD3A6F46551AA505BC91731EC5F36D536B38338166E5CFF06D7`).
- One Train instance attaches to the existing `machineRoot` and existing renderer frame loop. It creates no canvas, renderer, controller, board, or requestAnimationFrame authority.
- Train preparation consumes the exact current `ConstructionService.preparedBuild`, the existing BuildBoard, current PartRegistry, current ChallengeService, and current frozen plan identity.
- The challenge route adapter derives the exact 6.048 mm road-plane-to-track-top elevation from the live BuildPlan and current world scale. No terrain, ENTRY/EXIT, bridge transform, controller limit, or validation tolerance was hardcoded or moved.
- Live current plan: `bp_0d7627b1`, checksum `0d7627b1`, 131 targets.
- Real current partial board: `TRAIN_FELL`, cause `SUPPORT_LOSS`.
- Authoritative test-completed current board: `CROSSED`.
- Refresh/reset disposal tests show the previous Train subsystem is disposed and only one scene root remains.

Verification:

- Train tests: **49/49 PASS**.
- Full `npm run verify`: **212/212 JavaScript PASS**, **20/20 reliability PASS**, 135 JavaScript syntax files, 4 Python syntax files, overall PASS.
- Real Chrome MAIN_DEMO: one Train scene root; `READY -> TRAIN_FELL/SUPPORT_LOSS -> READY`; zero console errors and zero warnings.
- Evidence: `output/playwright/train/01-train-ready.png`, `02-train-fell.png`, `03-train-reset-ready.png`, and `acceptance.json` (generated locally and intentionally not part of normal read-only verification).

## Remaining checkpoints

- B: Mission overlay and eight Mission WebMCP tools through the existing registrar.
- C: current-runtime Submission Gate and native WebMCP hardening.
- D: non-geometry Construction acceptance hardening.
