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

- D: non-geometry Construction acceptance hardening.

## Checkpoint B — Mission overlay and semantic WebMCP

Status: **PASS**

- Imported the accepted Mission production overlay from `ORACLE_MISSION_INTEGRATION_ADAPTERS_V1(1)(1).zip` (SHA-256 `C77DE5F6D8CE43F34E8673F4BD67DB3EE0AAA970EF1B85F4BA5EA5A0A23EC5BD`).
- MissionService is orchestration only. It injects the existing BridgeHost, bridge-design package, current ConstructionService/BuildBoard, current ChallengeService, RobotController/runtime, and the semantic `createMissionTrainAdapter(trainIntegration)` seam.
- The MAIN_DEMO UI and WebMCP share one Mission instance. Bridge mutations are guarded after BUILD freeze.
- The one existing registrar receives exactly 13 additional tools: five guarded bridge tools plus eight Mission tools, yielding 27 unique names with the existing 14 primitives.
- Current-authority test: `DESIGN -> BUILD -> TEST -> BUILD` on real `TRAIN_FELL`; authoritative completion of the same current board then `TEST -> COMPLETE` only on real `CROSSED`; reset creates a new DESIGN mission ID and clears the board.

Verification:

- Supplied Mission suite against repository paths: **114/114 PASS**.
- Current MAIN_DEMO Mission/Construction/Train integration: **1/1 PASS**.
- Real Chrome: exact 27-name composition, current 131-part frozen identity shared across Mission/Construction/Train, BUILD mutation guard, `TRAIN_FELL -> BUILD`, clean new DESIGN reset, zero console errors/warnings.
- Evidence: `output/playwright/mission/01-mission-build.png`, `02-mission-train-fell.png`, `03-mission-reset.png`, and `acceptance.json`.

## Checkpoint C — Current Submission Gate and native WebMCP

Status: **PASS for integration; final hero remains blocked by the documented geometry**

- Imported only the production files marked for repository use by `ORACLE_SUBMISSION_GATE_CURRENT_RUNTIME_V1(1)(1).zip` (SHA-256 `5190F4F2277A15C9170911019295F8432971689AF0E66C0A4B5B1486576C58EC`). Historical package evidence was not copied.
- Safely merged all eight requested npm commands without deleting existing scripts.
- Corrected `plan_placement_queue` to `readOnlyHint: false`; its behavior is unchanged and still requires the exact current `worldRevision`.
- The one existing registrar now resolves the real `document.modelContext` or `navigator.modelContext` surface without installing a shim or creating a second registrar.
- Added an explicit `?submissionGate=1` read-and-drive facade. It owns no state: every probe drives and reads the existing BridgeHost, BuildBoard, RevisionClock, RobotController, placement stream, Construction, Train, and Mission authorities.
- Facade Construction proof uses the current `bp_0d7627b1` / `0d7627b1` / 131-part freeze and current PartRegistry `pr_767a6c8c`. One Human and one Codex placement are accepted by the same BuildBoard; source theft reassigns and the Human target is adopted without reset.
- Train-failure proof reads the real partial BuildBoard and returns `TRAIN_FELL` at unsupported segment `0`. Integrated repeated reset/leak acceptance passes.
- The gate keeps final Train success, Mission COMPLETE, and flagship success red because the current full bridge is not constructible through the known 21 V4.6 part intersections. No direct completion flag, collision bypass, geometry edit, or fake accepted board was introduced.

Verification:

- Submission unit suite: **11/11 PASS**.
- WebMCP regression: **16/16 PASS**.
- Smoke gate: **65 PASS / 4 FAIL / 0 NOT_AVAILABLE / 1 SKIPPED_WITH_REASON**. Three failures are the expected geometry-dependent completion checks. The fourth is `source.no_tracked_worktree_changes`, caused by the user's pre-existing modified terrain `.blend` files, which remain untouched and unstaged.
- All nine adversarial facade cases: **PASS**.
- Supported Chrome 148 with experimental Web Platform features exposes real `navigator.modelContext.registerTool`; `document.modelContext` is absent. The production HUD and lifecycle elements prove **27 unique native tools**, exact to the Mission composition, with zero console errors/warnings.
- Native evidence: `output/playwright/native-webmcp/01-native-27-tools.png` and `acceptance.json`.
- Gate evidence: `artifacts/submission-evidence/submission-gate-report.json`, `.md`, screenshots, runtime metadata, WebMCP audit, and console log.
