# Three-level launch readiness — active work

Started 2026-09-03. Governing task: `Downloads/OVERALL_PLAN_LAUNCH_READY.md`; user explicitly authorized autonomous work, subagents, visual browser QA, milestone commits and branch pushes. These instructions supersede the previous single-agent/no-screenshot/stop-testing constraints for this task only. No main merge or Cloudflare/public deployment is authorized.

## Current state

- Checkout: `D:\ROBO-BRIDGE-MCP-TRUNK`.
- Branch: `codex/p0-downstream-integration-prep`; starting candidate `29953f01d994b9b877a7871e6c2aeda2dee3d77e`, draft PR #7.
- Fetched remote truth; main `3077883c7d2d29134b7856033fa7814f212f0ac8`, MASTER_PLAN N. Safely merged main into this branch at `14441e3` (plans and smoke page only). No merge into main.
- Pre-implementation baseline: focused colour/pickup/Simple suites **14/14 PASS**.
- Existing user assets, unrelated dirty JS files, Downloads and evidence are preserved. Existing consolidated handoff remains historical.

## Sequential gates

| Level | Status | Required checkpoint |
| --- | --- | --- |
| 1 Simple | PASS — publishing checkpoint | Blue single;35-blue wall;12-target tower; actual Human ADOPTED+continuation; physical double-press/shared refill; settings/cadence;31 tools; state/images/console independently reviewed |
| 2 Viaduct, no Train | NOT STARTED | Semantic design/hologram changes; advisory spatial actor split; shared board completion; explicit no-Train level; Level1 regression; visual/state review |
| 3 Train physics | NOT STARTED | TCP-bound pusher contact; physical Train failure and crossing; Mission recovery/completion/stats; earlier-level regression; visual/state review |
| Final release audit | NOT STARTED | Exact-head verify/smoke/gate/WebMCP and all-level browser checks; static apps/web and real GLB audit; no deployment |

## Level 1 implementation ownership

### Accepted gate (supersedes in-progress notes below)

Post-merge full verification:425/425 JavaScript,20/20 reliability,163JS+4Python syntax, required-files and removed-legacy checks PASS. Fresh Chrome148 full browser14/14 and legacy Simple8/8 PASS, console0errors/0warnings/0exceptions. Native31-tool surface, strict-blue35/35 unique wall with two legitimate2/2 button-press requests,6-layer12-target tower with actual canvas blue Human adoption +11 robot, settings/camera invariance and cadence all pass. Concurrent test-only Human Simulator5/5; guide4/4. Independent code review and main+Sol screenshot inspection PASS.

The button screenshot defect was repeated overwriting of stored same-frame images by later CDP screenshots; corrected capture saves each phase once. The fresh contact image visibly touches the red button at measuredTCPZ26.517mm, versus approach/retreat~250mm, with new blue supply visible afterward. Use only the eight paths listed in `output/playwright/launch-level1/acceptance.json`; do not use stale unlisted `03-more-bricks-press.png`. Generated evidence is not staged. Publication uses the Push skill, explicit intended files and existing draftPR7; no force push/main merge. Exact SHA and checkpoint regression follow below after publication. All future subagents explicitly select GPT-5.6 Sol per the user.

- Main: integration, shared refill/runtime/visual guidance, final verification/publication.
- Refill reviewer: existing button/robot contact inspection and bounded shared-anchor/service design.
- API agent: new generic scene-settings module and focused tests only.
- Planner agent: generic wall depth/parameter validation and new tests only.
- Browser agent: isolated Level1 acceptance harness, actual pointer interaction and explicit screenshots.

Every level requires independent exact-diff review before its completion commit. A baseline or partial implementation commit is never labelled a completed level. New tests/screenshots are evidence for their actual runtime only; no physical hardware claims, no collision bypasses, no duplicate authorities.

## Level 1 verification in progress

Partial implementation milestone committed locally: `a3a438e` — `Add test-only concurrent Human Simulator and pending-slot guidance` (four pure helper/test files;5 Simulator +3 guide tests PASS). This is not the Level1 completion commit and has not been pushed yet. Remaining integration is still uncommitted.

- Planner/depth regression: 13/13 PASS. Player current-settings fixtures: 26/26 PASS (original Oracle settings hash retained separately from current approved defaults).
- Shared dispenser/controller integration: 3/3 PASS, including 35 unique blue wall placements with refill and no target reset. Guided 12-target tower: 2/2 PASS, including one normal Human-adapter placement and 11 robot placements.
- Physical button service initial: 7/7 PASS; Human Simulator: 5/5 PASS, including legal interleaving while the runner is active (one blue Human +11 robot,12 unique targets). Scene-settings tests: 8/8 PASS.
- Isolated Chrome native browser partial: 31 unique tools, blue single1/1, physical double press2/2 with24 new sources. First wall run exhausted28 reachable blue sources at28/35; bounded native refill/resume is being verified, not bypassed. Console at that checkpoint0errors/0warnings.
- Initial full verification during concurrent edits: 407/413 JS PASS, six failures; reliability20/20 PASS, syntax/required-files/no-legacy checks PASS. Several failures were stale Player fixtures now corrected; the remaining full rerun and workcell fixture diagnosis are pending. This is not a completed regression gate.
- Main personally opened initial scene and post-refill screenshots: scene readable, but the latter did not show actual robot contact. A proper in-motion contact capture is required before visual PASS.
- No Level1 completion commit or push yet. Do not begin Level2 implementation until the gate passes.

Latest complete `npm run verify`: **423/423 JavaScript,20/20 reliability, syntax/required-files/removed-legacy checks PASS**. The stale primitive-wall coordinate now derives from the active buildZone. The guide requires actual accepted support identity. Independent review added queued-motion and active Human-carry guards; no authority blocker remains.

Browser fixes: the circular button now preserves the measured tool yaw instead of forcing an unnecessary90-degree reorientation (real double-press repeat/refill passes). Presentation-only settings batches no longer reset camera/player height or rebuild unrelated geometry; actual pointer tower12/12 and camera-invariant brightness/table changes pass with console0/0. Main inspected the corrected dark-table image. Full wall completion is being rerun after correcting a test fingerprint that compared resolved preview metadata rather than immutable plan requests.

Remote publication preflight found parallel feature-branch work at `d9d7e216abcfbc4087efe0d9c881f4b1e27e7765` (Simple Human panel, final12-target fixtures, native browser audit fixes and branch CI). Main remains unchanged at3077883/PlanN. Preserve and integrate those commits before pushing; no force-push. A fresh post-integration regression/browser run is required.

Pre-merge full Level1 Chrome148 run PASS:14 checks,31 unique tools, blue single1/1,35/35 strict-blue wall (35 unique sources; physical refill resumed the same immutable plan), two requests each completing2/2 button presses, six-layer tower12/12 with actual canvas Human blue adoption1 plus11 robot,1333ms cadence and889→1000 floor, brightness/table changes with unchanged camera, console0errors/0warnings. Main opened all required categories of screenshots; contact and clearance poses are visible, wall and tower geometry readable, dark-table update correct. Some filename/HUD captures precede the final display refresh; authoritative completion is separately asserted. Evidence is local under `output/playwright/launch-level1/`, never staged. Preserve this result as pre-merge evidence; repeat after remote integration.

## User addendum — Level 2 full bridge observation

Post-integration resume point: parallel remote work was safely merged at `6edffc4c3d8c07e93635944f52f5e00a566d35f6`; no force push or main merge. The amber marker and imported Human panel share the same suggested target, preferentially the second ready slot; actor permissions remain shared. Guide + Human Simulator9/9 and remote Simple hero9/9 pass. Independent exact merge review PASS. Full post-merge verification is running. The first post-merge browser attempt passed the native31-tool boot, blue single and physical2/2 refill but missed transient approach/retreat screenshot timing; the harness is being corrected and rerun. That attempt is not a full Level1 PASS. `5905386` is the earlier local implementation milestone, not the completed-level checkpoint.

Watch a complete end-to-end bridge build driven by Codex through WebMCP, not only a partial/shared-board fixture. Include real robot pickup/placement of custom arch pieces. User permits a300ms start-to-start cycle target for this many-part Level2 test; keep existing motion/IK/collision safety, record overruns, and label any explicitly allowed accelerated fallback separately. This does not change Level1's normal2000ms / minimum1000ms cadence contract. Level2 implementation still waits for the Level1 checkpoint.

## User addendum — clean exterior Bridge hologram

Level2 hologram must stop showing confusing internal bricks through the shell. Evaluate opacity/depth handling and/or outward-exposed face rendering derived from the exact BuildPlan, including exact custom arches/openings and tracks. No separate artistic mesh or changed construction truth. Visually compare and measure render cost; preserve Human/Codex side/progress readability.

## User addendum — explicit Human_Simulator for tests

User permits a test-only simulated Human actor that contributes blue bricks while Codex builds, including Level1 tower adaptation. It must use the real HumanBuildAdapter/PlacementAuthority/BuildBoard acceptance chain and shared inventory, with explicit simulated-actor evidence; never directly set ADOPTED or impersonate a real user. Keep actual pointer acceptance distinct. No second robot/board/occupancy authority or ordinary production autorun.
