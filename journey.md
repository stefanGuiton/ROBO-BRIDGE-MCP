# P0 EASY Terrain Integration Journey

## Scope

This checkpoint follows `Downloads/PLAN_Integrate Curated EASY Terrain into the Production Bridge MAIN_DEMO.md` and uses the accepted Oracle package at `Downloads/ORACLE_TERRAIN_CHALLENGE_V1(1).zip`.

- Base branch: `codex/p0-bridge-mvp`
- Base commit: `69b970bb3b341c44959fade7135d6cd07b6bd83e`
- Working branch: `codex/p0-final-integration`
- Integrated preset: `EASY` only
- Explicitly deferred: CHALLENGING runtime selection, train, mission, PartRegistry, physical bridge construction, terrain polish, and deployment

## What changed

- Imported the accepted curated terrain loader, material, transforms, collision proxy, ChallengeService, and exact GLB into `apps/web`.
- Added one MAIN_DEMO EASY adapter that owns the shared terrain/ENTRY/EXIT/route/bridge placement relationship.
- Mounted the terrain into the existing Three.js scene without adding a renderer or animation loop.
- Passed conservative terrain bank proxies into the existing player collision solver.
- Replaced the temporary bridge transform with the authoritative EASY challenge transform.
- Kept the existing BridgeHost, BuildBoard, RobotController, RevisionClock, placement stream, player, and single WebMCP registrar.
- Calibrated the Aqueduct to `4/3/2` arches so the accepted EASY span remains compatible with MAIN_DEMO brick scale.
- Made `reset_bridge_design` return to that calibrated MAIN_DEMO preset.
- Rotated the complete EASY challenge `-90 degrees` around the bridge/corridor centre so terrain, bridge, ENTRY, EXIT, train route, bounds, and collision proxies continue to share one transform authority.
- Removed the renderer-only TCP point/ring while preserving authoritative TCP, gripper, robot, and WebMCP state.
- Disabled Space/Ctrl vertical movement and locked normal player motion to the configurable `playerEyeHeightMm` height.

## Authoritative transforms

- Challenge display offset: `(-170, 0, +4) mm`
- Terrain display transform:
  - position: `(-198.8, -13.2, 1194.9370560646057)`
  - quaternion: approximately `(0.70710678, 0, 0, 0.70710678)`
  - scale: `(360, 144, 360)`
  - challenge yaw: `-90 degrees`
- Bridge world transform:
  - translation: `(650, -111.2, 0) mm`
  - yaw: `0 degrees`
  - scale: `2`
- ENTRY: `(513.2, -111.2, 56) mm`
- EXIT: `(786.8, -111.2, 56) mm`
- Physical span: `273.6 mm`, running along MAIN_DEMO X
- Standard `1x2x1` hologram brick: `32 x 16 x 9.6 mm`

The X offset moves the accepted bridge centre from X=820 mm to X=650 mm. The +4 mm Z offset moves the whole challenge coherently above the existing mat/stud envelope; it is not a per-subsystem correction.

## Verification record

- Exact terrain GLB SHA-256: `66bd021d4d8f226a563a219b718776ad8be5f9cdb0110d2d2808c1d4288daaf6`
- JavaScript: `153/153`
- WebMCP: `15/15`
- Robot: `30/30`
- Player: `26/26`
- Compiler: `26/26`
- Reliability: `20/20`
- `npm run verify`: PASS
- Native browser tools: `19` total (`14` existing + `5` bridge)
- Browser console warnings/errors: `0`
- Native WebMCP visual mutation:
  - initial `4/3/2`, revision 1, `bp_6a45b6bc`, 131 parts
  - changed `3/3/2`, revision 2, `bp_1b886868`, 137 parts
  - reset `4/3/2`, revision 3, `bp_6a45b6bc`, 131 parts

Browser evidence is under `output/playwright/p0-final-integration/`. The most useful views are:

- `08-easy-unobscured-hologram.png`
- `10-easy-unobscured-changed.png`
- `11-easy-unobscured-restored.png`

## Acceptance observations

- EASY terrain loads and the bridge deck/track crosses the ravine along the ENTRY/EXIT direction.
- The rotated terrain now uses more of the table width while all challenge-derived transforms and collision banks remain aligned.
- The bridge remains Z-up and uses the production MAIN_DEMO brick dimensions.
- The bridge centre and both endpoints remain inside the production Cartesian tool limits exposed by WebMCP. This is a positioning observation, not proof that every future physical BuildPlan placement is robot-reachable.
- Player UI and the existing robot/build controls remain present; the player and robot suites pass unchanged.
- Space and Control no longer change player Z; the fixed height is intentionally adjustable through `Player Eye Height mm`.
- The yellow TCP point and cyan ring are gone; the real gripper visual and authoritative TCP telemetry remain.
- The accepted EASY deck is low relative to the full three-tier Aqueduct at MAIN_DEMO brick scale, so lower tiers extend below the existing solid tabletop. The exact hologram is therefore rendered as an unobscured translucent overlay for this visual-design MVP. Physical bridge construction remains intentionally unimplemented and must validate support/elevation in the next task.

## Publication boundary

Only production integration files, tests, the exact GLB, and this journey are intended for the commit. Existing Blender/terrain experiments and the supplied `Downloads/` artifacts are user-owned and must remain unstaged.

## 2026-09-02 — P0 construction integration (in progress)

- Base: `main` / `ec3c9237c224210112acd0ba71ddc06ea95f9f91`.
- Working branch: `codex/p0-construction-integration`; one agent, no subagents.
- Input: `ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_V1(3).zip`, SHA-256 `BF179F9887097141393BF71E94F78D13175181E0A43813EFBB423C76FABAD631`; the D:/Downloads and repository Downloads copies are identical.
- Read latest `MASTER_PLAN.md` and package README, integration guide, acceptance, provenance, and reachability documents. Task-specific current-plan/shared-actor requirements override stale package actor restrictions and the master plan's older geometry coordinates.
- Imported only the ten production `bridge-construction` modules. Did not import the stale 476-part fixture/BOM, old transform, standalone shell, test authority doubles, or duplicate bridge-core.
- Baseline: JavaScript **155/155**, reliability **20/20**, repository verification **PASS**, at the exact base SHA.
- Current live hero before physical correction: `bp_0d7627b1` / checksum `0d7627b1`, **131 parts** (87 `1x1x1`, 15 `1x2x1`, 27 custom arches, 2 tracks). All counts are derived, not production constants.
- Important correction: normal MAIN_DEMO already uses `V8_WORKSPACE` (X 250..1050, Y -450..450, Z 10..600 mm). The old 470..710 / -275..275 / 40..470 limits apply to the evidence-workcell default, not normal MAIN_DEMO. Construction must consume the supplied live controller workspace and must not widen it.
- Concrete physical blocker: current exact geometry reaches Z about -96 mm (custom proxy bottom about -96.2 mm), below the tabletop. A coherent challenge-owned elevation correction is required before physical BUILD; no hologram-only offset or collision bypass will count as acceptance.
- Next: adapt per-part capture/collision/render metadata through existing authorities, freeze/load the one BuildBoard, shared source feeder, bounded existing-cycle execution, then production tests and browser acceptance.

### Construction checkpoint — acceptance blocked by exact V4.6 part intersections

- Local WIP only on `codex/p0-construction-integration`; HEAD remains `ec3c9237c224210112acd0ba71ddc06ea95f9f91`. No commit/push/merge because the requested complete acceptance gate has not passed.
- Implemented dynamic shared parts/inventory, frozen design lock, existing board target loading, typed capture/collision/visuals, existing placement-stream execution, and local MAIN_DEMO construction controls.
- Tabletop blocker corrected coherently through ChallengeService: computed +100 mm elevation, unchanged XY/yaw/scale. Workspace limits unchanged. Exact terrain mesh/support acceptance remains partial.
- Actual controller run: 15 accepted parts, then collision blocked the next tier. Exact triangle audit confirms 21 intersecting part pairs in current plan `bp_0d7627b1` (9 arch/arch, 12 brick/arch), not just conservative-proxy false positives. Compiler repair requires explicit scope decision; no collision bypass used.
- Browser on repository server port 8773: human 1 + robot 3 on the same BuildBoard; planned-source reassignment and target adoption verified through the real service path. Zero console errors/warnings. Mean custom-part cycle start interval 3608.55 ms, not one second. Mouse-only interaction/all-part-class acceptance incomplete.
- `npm run verify`: PASS, JS 160/160, reliability 20/20, syntax 109 JS / 4 Python. Robot 30/30 and compiler 26/26 pass. Native WebMCP not claimed: test Chrome exposes navigator.modelContext but unchanged registrar expects document.modelContext; 19-tool contract remains covered by tests.
- Full handoff and reproduction commands: `docs/P0_CONSTRUCTION_INTEGRATION_WIP.md`. Local explicit evidence: `output/playwright/construction/`.
- Dedicated totals confirmed: WebMCP 15/15, player 26/26. Current PartRegistry `pr_767a6c8c`, frozen identity `freeze_5c084eff`.

### User-requested ENTRY / EXIT settings controls

- Added six XYZ fields under Settings > Bridge ENTRY / EXIT, with Apply (also Enter) and Reset. Coordinates are millimetres in the table frame: X right, Y back, XY zero at table centre, Z above tabletop. Both Z fields are linked because the current Aqueduct is level.
- Endpoint edits compile atomically through the existing BridgeHost and ChallengeService. Terrain, bridge, endpoints and route use the same derived transform; brick scale is unchanged. Frozen BUILD and active movement block edits. Successful values persist in local browser storage.
- Targeted challenge, bridge and construction tests: **16/16 PASS**. Real Chrome browser checks passed for linked height, applied coordinates, reload persistence, invalid endpoint rejection and reset, with **zero console errors/warnings**.
- Explicit browser evidence: `output/playwright/construction/04-endpoint-controls.png`. User test URL: `http://127.0.0.1:8773/?settings=bridge-endpoints`.
- This positioning UI does not fix the compiler's internal part intersections. Construction remains partial and uncommitted/unpushed; no compiler repair or new subagent work was started.

### User-requested WIP publication checkpoint

- The user subsequently requested pushing the current work. This authorizes a WIP checkpoint on `codex/p0-construction-integration`, not acceptance or a merge to main.
- Refreshed pre-push `npm run verify`: **163/163 JavaScript**, **20/20 reliability**, **110 JavaScript / 4 Python syntax files**, required-file and removed-legacy checks all PASS.
- Publication scope is the construction integration, endpoint controls, tests/audit scripts and handoff documentation. Downloads, browser evidence, Blender files and other unrelated scene assets are excluded.
- The handoff remains explicitly blocked on the documented compiler geometry and remaining physical/native-browser acceptance gates. Draft PR only; main remains untouched.

## 2026-09-02 — P0 downstream integration preparation

- Authoritative plan: repository `MASTER_PLAN.md` version `2026-09-02-G` at `149f72bff680e484449da37d0a5348850caa2abf`, plus `Downloads/SOL_HIGH_P0_DOWNSTREAM_INTEGRATION_PREP.md`.
- Working branch: `codex/p0-downstream-integration-prep`, created from the unmerged Construction WIP `d6154a58d97f52b3058d04c50eeb3ab5066de70c`. The intended PR base remains `codex/p0-construction-integration`, never `main`.
- Checkpoint A imported the current Train V2.2 production modules and adapters. One Train instance is attached to the existing MAIN_DEMO scene and existing renderer frame loop.
- The current ChallengeService route is specified at the bridge road plane while the live V4.6 track is exactly 6.048 mm higher after scale. The adapter now derives that offset from the current BuildPlan anchors and track placement; no challenge transform or tolerance was changed.
- Real production-authority outcomes: current partial BuildBoard gives `TRAIN_FELL / SUPPORT_LOSS`; the same current 131-target BuildBoard completed through accepted board events gives `CROSSED` in integration tests.
- Train-focused tests: **49/49 PASS**. Full repository verification: **212/212 JavaScript**, **20/20 reliability**, overall PASS.
- Real Chrome acceptance: one Train scene root, existing frame-loop listener, `READY -> TRAIN_FELL -> READY` reset, zero console errors/warnings. Local evidence is under `output/playwright/train/`.
- Checkpoint B imported the accepted Mission overlay and added only compatibility seams: the current ConstructionService is presented without a second progress ledger, while `createMissionTrainAdapter(trainIntegration)` refreshes the real BuildBoard-derived Train evidence before TEST.
- The MAIN_DEMO now composes exactly **27 unique tools** through the existing registrar: 14 primitives + 5 guarded bridge tools + 8 Mission tools. Mission owns phase/freeze/event orchestration, not brick, support, occupancy, or train truth.
- Repository Mission tests: package **114/114 PASS** plus a current-authority integration test proving `DESIGN -> BUILD -> TEST -> BUILD` on `TRAIN_FELL`, `COMPLETE` only on `CROSSED`, and reset to a new mission ID.
- Real Chrome Mission acceptance passed the same partial-board failure path and mutation guard with zero console errors/warnings. Local evidence is under `output/playwright/mission/`.
- Checkpoint C installed the current-runtime Submission Gate, merged its eight npm commands, corrected the mutating queue tool annotation, and hardened the single registrar to use the real `navigator.modelContext` location exposed by Chrome 148.
- Non-injected native browser evidence proves exactly **27 unique tools** registered on `navigator.modelContext.registerTool`, with no production shim, no submission facade in normal mode, and zero console errors/warnings. Evidence is under `output/playwright/native-webmcp/`.
- The explicit `?submissionGate=1` facade reads/drives only existing authorities. Its smoke run is **65 PASS / 4 FAIL / 0 NOT_AVAILABLE / 1 SKIPPED_WITH_REASON**: Construction authority, shared-source reassignment, real Train failure, integrated resets and nine adversarial cases pass. Train CROSSED, Mission COMPLETE and flagship remain red on the known geometry; the other failure is the gate correctly seeing the user's pre-existing modified Blender files.
- Checkpoint D hardens Construction without changing geometry. A new current-BuildPlan suite proves Human and Codex can each use all five live hero classes (`1x1x1`, `1x2x1`, `ARCH_A`, `ARCH_B`, `TRACK_SEGMENT`) through the same dynamic inventory, existing controller/cycle runner, and one BuildBoard.
- Real Player testing exposed and fixed nested custom-part picking: the renderer now raycasts exact part groups recursively and propagates the authoritative brick ID to their child meshes. This is an interaction repair only; it does not alter exact geometry or collision acceptance.
- Real Chrome canvas clicks picked shared source `bridge-src.b222fb9e.027`, produced a valid preview for frozen target `bp_0d7627b1.s.2.0`, and released it as an authoritative human BuildBoard snap. Console errors/warnings: **0/0**. Evidence is under `output/playwright/construction-hardening/`.
- Final repository verification after D: **345/345 JavaScript**, **20/20 reliability**, **152 JavaScript / 4 Python syntax files**, overall PASS.
- Full Submission Gate: **70 PASS / 4 FAIL / 1 documented skip**. Native WebMCP audit: **63 PASS / 3 FAIL / 1 documented skip**. Non-geometry authorities, reassignment, real Train failure, reset/leak, and adversarial cases pass. Remaining red checks are the intentionally dirty user worktree and geometry-dependent Train success, Mission COMPLETE, and flagship hero.
- The optional duplicate `hero:1` run was stopped to prioritize publication after the full gate had already recorded the same incomplete-bridge failure. No green hero claim is made.

## 2026-09-03 — Final Terrain7 partial functional checkpoint

- Continued the existing downstream branch from `eae3ba1`; read authoritative master planI from `origin/main@491f971`, without merging main or changing PR5/PR6. Followed the user-visual addendum: no screenshots or visual PASS claims.
- Imported Terrain7 through the existing loader/ChallengeService. Preserved named anchors, transforms, textures and water normal UV transform. Water authoredZ=-132.718 mm maps to machineZ4; ENTRY/EXIT465/835,-111.2,136.718 mm,span370,+X. One shared bridge/terrain/route authority remains.
- Final height-compatible4/3/3 Aqueduct,303parts. Repaired sampled arch cell-edge reservation/crown overflow and packed-deck track seating. Current plan`bp_818c1694`,registry`pr_55ecaf7f`; exact masonry/arch0 overlaps and enclosing track proxies0 overlaps.
- Added two-sided terrain-first Human click/preview gating; water and markers excluded. No view gate affects Robot/BuildBoard legality. Conservative terrain audit reports100 overlap risks,59 centres blocked from all five sampled views,0 missing declared supports; visual acceptance remains USER-VERIFY PENDING.
- Shared feeder checks dynamic physical dimensions (including1x20x1); distinct source admission and low-top scheduling preserve reassignment. Current real-controller diagnostic accepts46parts (Human1,Agent45), proves source reassignment/adoption, then truthfully fails on empty gripper retreat next to an arch. Never bypassed collision or changed safety limits.
- Async reset cancels/waits controller state including unrelated motion/latched parts, startup rollback is closure-safe; known errors/recovery fields preserved; active missions reject primitive reset; scene inventory reads have revision-bound paging.
- Final combined verification356/356 JS,20/20 reliability PASS. No-screenshot gate changes17/17 focused tests PASS. Release/fingerprint boundaries exclude user Downloads, Blender sources, temporary extraction and artifacts (469 selected source files, production Terrain7 included). Browser launch denied by approval service; console/native27-tool/hero evidence not refreshed. Local demo/assetHTTP200. Detailed resume/evidence in`docs/TERRAIN7_PROGRESS.md`; no final readiness claim.

## 2026-09-03 — Terrain-max Z-hop and browser retry

- User authorized a headless retry, then supplied the simple terrain-max Z-hop addendum. Terrain7 checkpoint23f254b was already pushed; PR6 remains draft with Construction base, unmerged.
- Loaded solid vertices give max machineZ349.834914 mm. Existing collision proxies give2 mm empty-tool/41.400002 mm maximum payload clearance; one frozen travelZ391.334916 mm includes0.1 mm margin. Added same-XY/yaw lifts before source travel, after pick, and after unlatch, using the existing controller. Workspace/IK/collision authority unchanged.
- Full deterministic progression still stops46/303 (Human1/Agent45; reassignment/adoption pass). The post-release gripper already overlaps required archc.7.0 at seats.12.0 and remains obstructed for the first6 mm vertical lift. The safe plane itself is clear; raising it cannot cure the release-pose interference. Five regression tests cover the policy and this exact limitation.
- Headless Chrome148 native27-tool registration and Mission freeze/failure recovery/reset pass with0 errors/0 warnings; JSON-only evidence under`output/playwright/terrain7-z-hop/`. Actual Player test remains blocked at old camera/source highlighting; no mouse-placement pass claimed.
- Pre-Z-hop broader audit62 PASS/4 FAIL/2 skips: incomplete Train/Mission, preserved dirty user Blender files, and missing forbidden screenshots account for failures. Handoff now records publication/release ZIP provenance, new browser acceptance, measured travel plane and exact remaining blocker. No screenshots, no merge, no hero/readiness claim.
- Final verification361/361 JS and20/20 reliability,155 JS/four Python syntax files, overall PASS. Excluded the user's newly created locked`Downloads.zip` from fingerprint/release inputs (archive untouched); release boundary471 files PASS. No new release ZIP or final hero acceptance claimed.
