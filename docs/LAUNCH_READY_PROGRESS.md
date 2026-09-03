# Three-level launch readiness — active work

Started 2026-09-03. Governing task: `Downloads/OVERALL_PLAN_LAUNCH_READY.md`; user explicitly authorized autonomous work, subagents, visual browser QA, milestone commits and branch pushes. These instructions supersede the previous single-agent/no-screenshot/stop-testing constraints for this task only. No main merge or Cloudflare/public deployment is authorized.

## Current state

**Latest checkpoint verification:** frozen runtime/test head ec23aed196e7b324afce95b74df26fe5526d5ead passes642/642 JavaScript,20/20 reliability,174JS+4Python syntax and repository checks. Follow-up changes are documentation only. Read-only static audit:188 served files /28,947,210 bytes,454 literal+3 configured references resolved,4 hydrated/self-contained GLBs, no selected private/untracked files. Final Level3 crossing and release gates are still pending; no main merge/deployment.

**Latest asset follow-up:** Terrain9 replaces the production GLB, 3.49MB versus31.38MB, with unchanged shared placement/datum, ENTRY/EXIT and initial Viaduct identity. Terrain25/25 and native31-tool smoke pass with console0/0/0 and both screenshots inspected; no Level2 Train. See `docs/TERRAIN9_CHECKPOINT.md`. The old served copy is retired recoverably and original source assets are untouched. Terrain f573d86, contact74b0477 and packaging aa90ae6 are pushed and remote-SHA verified; two remote attribution-only updates through0da5479 are preserved. Balanced14red/14blue starter pool ec23aed is committed for final publication. Native12-blue wall completes12.6585s at1000ms target, five overruns,console0/0/0; three images inspected. Two stale starter-count test expectations reproduced/fixed; focused Simple30/30 and full rerun642/642 pass. Older full-suite counts below predate these edits.

Current Terrain9 native Level3 diagnostic still fails actual Entry_Structure clearance (4.90448656mm solid residual), with8contacts/14impulses, aligned actual TCP, six robot moves/118samples, same Mission BUILD, idle cleanup and clean console; all three images inspected. This is not physical crossing acceptance. Geometry approval remains pending.

Published Level 3 foundation: `9a0a9e922059df47ab6cc66c4f94b1903bfd2f91`. The measured contact/pacing repair is now checkpointed and pushed below, but the full Level 3 journey remains unaccepted. Reported unrelated JS differences were confirmed line-ending-only by matching normalized Git blob hashes; original Blender/assets remain untouched.

Current follow-up is independently reviewed, verified and pushed. The branch safely fast-forwarded the three remote attribution-only commits through `ac004577559a3185e030261c947e44b48a9bb35a`; no main merge or unrelated asset edits:

Simple timing milestone: `188acafb3691c769127ffd5e1c9df3d75a20f10f`. Measured contact/pacing checkpoint: `3dc9ca95e517840985fefbb9de0168c3c45277ed`; local/remote SHA equality verified. Exact-head focused regression passed 153/153. A subsequent documentation-only checkpoint records this status and the user's recording defaults; production code is unchanged. This is not the completed Level 3 milestone.

- **User-requested Simple fast mode:** existing runner opts in only for the Simple board, uses profile-informed bounded playback, preserves 2000 ms normal / 1333 ms faster / 1000 ms minimum, reports failed-attempt overruns separately and restores prior playback without overwriting external changes. No new build tool. Focused 22/22 plus 33 existing placement/Bridge checks passed. The strengthened native Chrome 148 `level1-fast-timing-hardened` proves one 3x4 blue wall plan, 2/2 physical refill presses and one continuous start: 12/12 unique blue sources in 12,748.7 ms, six overruns (maximum 308.1 ms), 238 moving frames, prior playback restored, console 0/0/0. Separate native `level1-smooth-human-regression` passed 7/7 checks: actual blue Human pickup/release and adoption plus 11 robot placements complete the 12-target tower; colour and camera/settings checks pass, console zero. Screenshots inspected; no guaranteed frame-rate/smoothness claim.
- **Level3 contact repair:** measured intervals consume once through bounded physics substeps; excessive residuals fail closed. Browser revealed absolute controller deadlines bunching overdue samples; Train-only optional realtime pacing now preserves each existing physical profile interval without changing global playback or Simple/Bridge scheduling.185 focused Train checks and14 controller checks pass. Fresh native `level3-train-realtime-current` verifies6 real moves/118samples, exact TCP/render/collider alignment,10contacts/15impulses and residual pusher penetration0.000005mm. It then fails on actual Entry_Structure solid penetration4.91974mm, same Mission BUILD, console0/0/0. Main opened all3 screenshots. This is not a full successful push/fall/repair/crossing journey.

Current entrance/tunnel/receiving geometry still cannot fit the unchanged train; the clearance-approval question remains pending and original assets untouched. New full `npm run verify` passed **637/637 JavaScript, 20/20 reliability, 173 JS + 4 Python syntax**, required-file and removed-legacy checks. It ran against the final production source on base `ac004577` with then-uncommitted follow-up files; exact-checkpoint focused regression subsequently passed 153/153. See `docs/LEVEL3_TCP_TRAIN_PROGRESS.md`. Level 2 was already pushed at c24c7f1 with exact 66/66 regression; historical notes below are superseded.

- Checkout: `D:\ROBO-BRIDGE-MCP-TRUNK`.
- Branch: `codex/p0-downstream-integration-prep`; starting candidate `29953f01d994b9b877a7871e6c2aeda2dee3d77e`, draft PR #7.
- Fetched remote truth; main `3077883c7d2d29134b7856033fa7814f212f0ac8`, MASTER_PLAN N. Safely merged main into this branch at `14441e3` (plans and smoke page only). No merge into main.
- Pre-implementation baseline: focused colour/pickup/Simple suites **14/14 PASS**.
- Existing user assets, unrelated dirty JS files, Downloads and evidence are preserved. Existing consolidated handoff remains historical.

## Sequential gates

Latest Level2 gate PASS (publication follows):468/468JS,20/20reliability,167JS+4Python syntax and repository checks; fresh full native Chrome14815/15, followed by Level1 native14/14 regression. Shared completion276/276 unique targets/sources:58 test-Human normal adapter,120 real robot,98 explicitly accelerated. Collision at154/276 is preserved. Exact ARCH_B drawing bug is fixed; main and Sol opened fresh carried/accepted arch, completed bridge and current-file side-label/selector images. No Train initialized. Application errors0/warnings0/unexpected exceptions0; two intentional native pre-aborted probe exceptions remain in raw evidence.300ms target is not achieved;119 full-cycle samples mean1201.26ms,p951978ms. No performance-improvement claim. Independent exact candidate review PASS.

Use accepted evidence `output/playwright/launch-level2-final/acceptance.json` and its listed images; `launch-level2-ui-current/14-current-level2-labels.png` proves the final group draw-order fix from a fresh boot (not a hotpatch); Level1 regression is `launch-level1-after-level2/acceptance.json`. Earlier `launch-level2` run is retained as failed visual evidence and must not be described as accepted. Source/harness/docs are committed; generated artifacts are excluded. Level3 implementation remains gated on Level2 push and exact-checkpoint regression.

| Level | Status | Required checkpoint |
| --- | --- | --- |
| 1 Simple | PASS — committed and pushed | `9c73e80b53e25c18741b22059ec098721f21c20a`; exact-checkpoint27/27 regression PASS; local/remote SHA verified; draftPR7 updated |
| 2 Viaduct, no Train | PASS — committed/pushed | `c24c7f135359a8c80aa859724b640afb2c6e7fd5`; local/remote SHA verified; draftPR7 updated; exact-checkpoint Level1+2 regression66/66 PASS |
| 3 Train physics | IN PROGRESS — NOT ACCEPTED | TCP/terrain/contact + service/Mission/results wired; real native obstruction diagnosed; physical geometry/contact/crossing acceptance remains |
| Final release audit | NOT STARTED | Exact-head verify/smoke/gate/WebMCP and all-level browser checks; static apps/web and real GLB audit; no deployment |

## Level 1 implementation ownership

### Level 3 resume — after accepted Level 2 publication

Explicit Sol modules landed locally: `robot-tcp-pusher.js` (24newtests/71focused total), narrow Controller queued-validation pending-count cleanup; `terrain-mesh-contact.js` and optional exact terrain-surface path (14newtests/64focused total); existing Train physics extended with measured kinematic contact and shared accepted-track support helpers (6newtests/25focused total). These are not committed or integrated acceptance. Old agent sessions failed/expired during service/browser work; a new explicit Sol agent resumes Train service/runtime/factory. Root owns Mission/integration/main. No second authority, no worldRevision bypass, no synthetic Train speed/pose.

Actual GLB preflight: routeENTRY(465,-111.2,144.448), EXIT(835,-111.2,144.448), span370; solid launch floor136.174 (8.274mm step); tunnel floor132.934, ceiling158.148; rail gauge26.4/width2.88 conflicts with tunnel positive-side wall by≥0.552mm for a flat rail-spanning footprint. A solid end wall at machineX~872.3 leaves37.2mm receiving pocket. Current34x34 train cannot fit. Smaller body alone does not solve rail contact, step or whole-consist clearance. These remain concrete physical blockers; do not shrink acceptance to lead-only crossing, add imaginary track or ignore tunnel/water.

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

Level2 implementation started only after Level1 push and exact-head regression. Explicit Sol agents own: hologram depth-prepass; lateral advisory collaboration/session scheduling; Mission API forwarding; full native browser journey. Root owns lazy Train lifecycle/modes and visual/pick integration. Initial changes: Level2 creates no actual Train/physics/root/frame subscription; Level3 opt-in reuses the existing integration and preserves the same frozen bridge when changing between levels2/3. Bridge targets use raycast-only layer31 (camera0), so they do not duplicate the exact hologram. `test_bridge` is blocked before Mission changes in non-Train levels. Gate/lifecycle+existingTrain tests32/32PASS; exacthologram+Terrain7/Bridge tests14/14PASS. New full Level2 browser acceptance is pending. No Level2 completion or performance claim yet.

Post-integration resume point: parallel remote work was safely merged at `6edffc4c3d8c07e93635944f52f5e00a566d35f6`; no force push or main merge. The amber marker and imported Human panel share the same suggested target, preferentially the second ready slot; actor permissions remain shared. Guide + Human Simulator9/9 and remote Simple hero9/9 pass. Independent exact merge review PASS. Full post-merge verification is running. The first post-merge browser attempt passed the native31-tool boot, blue single and physical2/2 refill but missed transient approach/retreat screenshot timing; the harness is being corrected and rerun. That attempt is not a full Level1 PASS. `5905386` is the earlier local implementation milestone, not the completed-level checkpoint.

Watch a complete end-to-end bridge build driven by Codex through WebMCP, not only a partial/shared-board fixture. Include real robot pickup/placement of custom arch pieces. User permits a300ms start-to-start cycle target for this many-part Level2 test; keep existing motion/IK/collision safety, record overruns, and label any explicitly allowed accelerated fallback separately. This does not change Level1's normal2000ms / minimum1000ms cadence contract. Level2 implementation still waits for the Level1 checkpoint.

## User addendum — clean exterior Bridge hologram

Level2 hologram must stop showing confusing internal bricks through the shell. Evaluate opacity/depth handling and/or outward-exposed face rendering derived from the exact BuildPlan, including exact custom arches/openings and tracks. No separate artistic mesh or changed construction truth. Visually compare and measure render cost; preserve Human/Codex side/progress readability.

## User addendum — explicit Human_Simulator for tests

User permits a test-only simulated Human actor that contributes blue bricks while Codex builds, including Level1 tower adaptation. It must use the real HumanBuildAdapter/PlacementAuthority/BuildBoard acceptance chain and shared inventory, with explicit simulated-actor evidence; never directly set ADOPTED or impersonate a real user. Keep actual pointer acceptance distinct. No second robot/board/occupancy authority or ordinary production autorun.
