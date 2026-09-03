# Launch acceptance audit — remaining proof, not a release certificate

Updated 2026-09-03 during the user's demo recording. Source reviewed at
`bf75ef5f11cc893588d3b3a3014debb554290566` on
`codex/p0-downstream-integration-prep`, normal TRUNK checkout.

## Latest user override

**Post-audit Level1 closure:** fresh Chrome148 full report
`output/playwright/launch-level1-current-full-r3/acceptance.json` passes all12
required gates/30checks, with no skips,31tools and console0/0/0. Root opened
all8images. It uses the unchanged merged runtime with14/14 starter supply and
smooth timing, actual35blue wall, two measured button contacts, and actual
canvas blue Human+11redrobot tower. This closes the current-Level1 native gaps
in the pre-run matrix below; Level2/3 and final release gaps remain. Failed
pagination/camera harness attempts remain preserved. See handoff for timings.

The user then explicitly requested merging the published checkpoint. PR7 was
normally merged at expected headbf75ef5; GitHub and fetchedorigin/main verify
`2abb01012ee6a2af18c3fd8fe27cc11626c3120b`, with exactly the bf75ef5 tree. Local
uncommitted harness/audit changes were excluded. This authorized merge
supersedes the original no-main-merge constraint for PR7 only; no deployment or
further main changes are authorized. The pre-merge matrix remains an audit trail.

The user subsequently released the isolated-browser hold, reported Level1
tested, and deferred collision/clash work to prioritize shipping. No more
collision hardening is required for the immediate working checkpoint. Keep
unproven Level3 physical outcomes explicitly unproven; do not disable checks or
fabricate success. Messages to the other task remain paused. The matrix below
records the original full-goal evidence gaps, not permission to delay the user's
immediate checkpoint request with another broad audit.

## Recording hold history (browser hold now released)

The user asked for no messages to the other task while recording. Leave that
task and its browser untouched. No browser runs, heavy tests, runtime edits or
publication during this hold. Automatic goal continuation does not mean the
recording has ended. Documentation and isolated acceptance-script review can
continue. Resume interactive verification after the user says recording is over.

## Evidence boundaries

The governing objective is `Downloads/OVERALL_PLAN_LAUNCH_READY.md`, sections
0–37. All three levels and the final release gates remain required. The user's
later Terrain 9 request replaces the plan's literal Terrain 7 asset requirement,
not its transform, authority or physical-validity requirements. The user's
recording defaults do not remove the explicit 35-blue-wall and 12-target-tower
acceptance cases.

Status labels below:

- **Historical PASS:** accepted on an earlier checkpoint; not automatically
  acceptance of all subsequent runtime/asset changes.
- **Current partial:** current-source or current-browser evidence exists, but
  does not cover the whole requirement.
- **Incomplete:** an explicit required outcome is absent or contradicted.
- **Preserved boundary:** continue observing the constraint; it is not a claim
  that the final release audit has run.

### Evidence index

All paths below are repository-relative. Generated evidence remains local and
must not be published indiscriminately.

| ID | Artifact / checkpoint | What it proves and does not prove |
| --- | --- | --- |
| E1 | `output/playwright/launch-level1-after-level2/acceptance.json` | Chrome 148, 14 recorded checks, 8 screenshots, clean console. Historical full Level 1 journey: single, 35-blue wall/refill, actual canvas Human adoption in a 12-target tower, settings. Predates smooth timing and 14/14 starter pool. Assertion weaknesses identified below need stronger current evidence. |
| E2 | `output/playwright/launch-level2-final/acceptance.json` | Historical Chrome 148 full Level 2, 15 checks/15 screenshots, 276 accepted targets with separate Human/robot/accelerated counts. **Uses the old 31,378,000-byte Terrain 7**, not Terrain 9. App errors/warnings zero; two exact intentional cancellation-probe exceptions retained. |
| E3 | `output/playwright/level1-balanced-fast/acceptance.json` | Current balanced-pool 12-blue-wall timing: 12/12, `simple-smooth`, 1000 ms target, 12,658.5 ms elapsed, 5 overruns, 31 tools, console zero, 3 screenshots. No refill needed; not the 35-wall/full-Human gate. |
| E4 | `output/playwright/terrain9-smoke-final/acceptance.json` | Current asset boot/design/anchors/no-Level-2-Train, 31 native tools, console zero, 2 screenshots. Not a complete current-terrain bridge build. |
| E5 | `output/playwright/level3-terrain9-current/diagnostic.json` | Current TCP/contact diagnostic, 6 robot moves/118 samples, same Mission returns BUILD, idle cleanup, console zero, 3 screenshots. Explicitly marks full push/fall/repair/crossing **NOT_TESTED_BY_THIS_DIAGNOSTIC**. `diagnosticCompleted: true` is not Level 3 success. |
| E6 | `docs/LAUNCH_READY_PROGRESS.md`, `docs/TERRAIN9_CHECKPOINT.md`, checkpoint `ec23aed196e7b324afce95b74df26fe5526d5ead` | Recorded frozen-runtime verification: 642/642 JS, 20/20 reliability, 174 JS + 4 Python syntax and repository checks. `git diff ec23aed HEAD -- apps/web tests scripts` was empty at audit start. This audit does not rerun those commands. |
| E7 | `docs/LEVEL3_TCP_TRAIN_PROGRESS.md` and current Train/Mission/results tests | Implemented exact TCP authority, fail-closed contact, lifecycle/revision guards and derived stats. Source/tests do not establish the missing physical failure-repair-success journey. |
| E8 | Static preflight recorded in `handoff_progress.md` and independent Sol review | 188 served files, 28,947,210 bytes; 454 literal + 3 configured references resolved; 4 hydrated self-contained GLBs; tracked-only private-file-safe release selection. Preflight only, not post-Level-3 final static/browser/deployment acceptance. |

Historical completion commits: Level 1
`9c73e80b53e25c18741b22059ec098721f21c20a`; Level 2
`c24c7f135359a8c80aa859724b640afb2c6e7fd5`. Both were pushed and independently
reviewed. Current runtime checkpoint is `ec23aed`; `bf75ef5` adds handoff docs.
No live GitHub refresh is performed during recording. Last verified main is
`3077883c7d2d29134b7856033fa7814f212f0ac8`; PR #7 remains a draft according to
the last publication check. Revalidate remote state before the next publication.

## Requirement-by-requirement matrix

| Plan section | Status at audit | Proof / exact remaining work |
| --- | --- | --- |
| 0 Remote truth / branch / publication | Historical PASS; refresh pending | Safe synchronization and milestone SHAs recorded in progress. Current local branch/HEAD checked. Fetch and compare remote again before publication; no force push, branch deletion or main merge. |
| 1 Single authorities / simulation / safety | Preserved boundary + current tests | Existing controller, BuildBoard, RevisionClock, placement and inventory chain remain. E6/E7 cover invariants; review exact final diff as well. Do not change safety or fabricate completion to pass Level 3. |
| 2 Independent agents | Historical PASS; ongoing | Sol independent implementation/diff/visual reviews recorded. Current Sol harness source audit is independent of root evidence audit. Final changed candidate needs independent review too. |
| 3 Per-level implementation/visual/commit loop | Historical PASS for 1/2; incomplete for 3 | E1/E2 and historical milestone SHAs; Level 3 has no completion commit. Later asset/preset changes require current visual regression, not copied old results. |
| 4 Generic Level 1 demonstration | Historical PASS; current partial | Generic single/wall/tower tools retained. E3 covers only 12-brick wall. Run the full current Level 1 journey. |
| 5 Generic planning, dimensions/colour/dependencies | Historical PASS + source tests | Existing planner and primitive stream, no per-wall/per-tower tool. Verify accepted current positions/yaws/colours, not only target counts. |
| 6 Strict-blue 5×7×1 wall | Historical PASS; current full rerun pending | E1 has 35 unique accepted sources. E3 is only 12. Current run must prove 35 blue, planned poses, zero duplicates, zero blocked/waiting. |
| 7 Physical double-press refill | Historical PASS; current full rerun pending | E1 and prior fast/refill run. Require two real contact records, unique new inventory, reduced blue deficit and unchanged accepted board during refill. A near-button screenshot alone is insufficient. |
| 8 Real Human adoption and continuation | Historical PASS; current full rerun pending | E1 actual canvas pickup/release; old-preset smooth-Human regression also passed. Current run must preserve actual blue brick ID/colour, same board and subsequent robot dependencies. |
| 9 Six-layer, two-brick/12-target tower | Historical PASS; current full rerun pending | Exact explicit case, one blue Human + eleven red robot bricks, alternating intended yaws. Generic five-layer defaults are not a substitute. Keep 10-level capability covered. |
| 10 Brightness/table settings | Historical PASS + source tests | Read-only/mutation/revision/cancellation coverage exists. Strengthen native renderer/settings readback and preserve camera/player pose, then inspect images. |
| 11 Native catalogue / one registrar | Current partial | E3/E4/E5 each report 31 native tools. Full current run must also confirm unchanged name set/no duplicates after resets and Human interaction. Not external MCP-client transport proof. |
| 12 2000/1333/1000 ms cadence | Current partial | E3 measures 1000 ms requested cadence with reported overruns. Need actual completed runner evidence for the full current run and 1333 ms setting; an acknowledgement is not measured execution speed. |
| 13 Level 1 browser/visual evidence | Historical PASS; current partial | E1 eight images and later focused images reviewed previously. Fresh complete current-source set must be captured and opened after recording. |
| 14 Level 1 checkpoint/gate | Historical PASS | Published 9c73e80; recorded exact-checkpoint 27/27 regression. Current asset/preset/timing follow-up still needs full native regression, without relabelling historical evidence. |
| 15 Level 2 with no Train | Current partial | E4 current Terrain 9 boot has no Train. Prove no service/physics/root/subscription throughout full current build, not just startup. |
| 16 Semantic Viaduct changes / exact hologram | Historical PASS; current partial | E2 four/five arches, wider openings, restore and regenerated plan/hologram. E4 current read/boot only. Repeat mutations and frozen identity on Terrain 9. |
| 17 Human/Codex spatial split | Historical PASS | E2 advisory 91/185 target split, shared board/inventory; never actor permissions. Repeat actual contributions on current asset. |
| 18 Readable sides/progress/hologram | Historical PASS; current visual pending | E2 plus fresh-label historical images. Exact geometry/depth-prepass and custom arch fix remain; current full-build images must be inspected. |
| 19 Reliable robot path / labelled fallback | Historical PASS | E2 120 real robot, 58 test-Human, 98 explicitly accelerated; collision preserved. Section 19 permits bounded fallback, not fabricated robot success. Repeat current run; report 300 ms as requested unless measured. |
| 20 Full Level 2 browser journey | Incomplete on Terrain 9 | E2 is old Terrain 7. E4 cannot replace full mutation/freeze/shared build/custom arch/complete-board evidence. |
| 21 Level 2 checkpoint/gate | Historical PASS | Published c24c7f1; exact-checkpoint Level1+2 regression 66/66 recorded. Current full native Terrain 9 regression remains. |
| 22 Level 3 isolation / physical Train | Current partial | E4 no Train; E5 real Level 3 Train exists. Full progressive mode/lifecycle matrix still needed. |
| 23 TCP-bound pusher, one authority | Current partial with focused proof | E5 zero declared frame mismatch; E7 tests frame/cancellation/lease/revision behavior. Keep collision shape origin/orientation tied to actual TCP. |
| 24 TCP/contact browser acceptance | Current partial | E5 real moves, aligned renderer/collider, 8 contacts/14 impulses, tiny residual pusher penetration. It then rejects solid terrain contact; not a successful full push onto the route. |
| 25 Same-Mission failure → repair → crossing | Incomplete | No current physical end-to-end journey. Existing analytic fixture/old hero results do not satisfy the TCP path. |
| 26 Deterministic physical start/push/retract | Current partial | Actual controller six-move diagnostic and idle cleanup verified. Must work with compatible real launch/receiving geometry and successful stable train motion. |
| 27 Real unsupported fall and successful crossing | Incomplete | E5 outcome is `TRAIN_CONTACT_FAILED`, **not** proven support-loss fall. No current whole-consist CROSSED. Never replace with lead-only crossing or synthetic support. |
| 28 SUCCESS stats | Current partial | Derived results/source tests and visible REPAIR/RETEST panel exist. Need actual COMPLETE+CROSSED screen with truthful Human/robot/accelerated, failures/retries/duration/revision readbacks. |
| 29 Visible settings/debug overrides | Current partial | Debug visibility retains revision in E5. Final normal success path must not depend on hidden overrides; inspect enabled indicators. |
| 30 Level 3 completion gate/commit | Incomplete | No complete Level 3 milestone. Do not commit/push a foundation as the completed gate. |
| 31 Exact final verify/smoke/gate/audit | Incomplete | E6 is checkpoint verification before Level 3 completion. All four named commands required again on final accepted candidate. |
| 32 Final three-level browser matrix | Incomplete | Current full L1/L2 refresh and entire L3 journey missing. Open the final images; screenshot creation alone is not visual acceptance. |
| 33 Static apps/web readiness | Current preflight only | E8 and Terrain9 exact hash/hydration verified. Repeat on final candidate, including case-sensitive/relative resources and absence of required localhost/server APIs. No Cloudflare changes. |
| 34 Final end state | Incomplete | Level 3 and final exact-head gates absent; cannot call launch complete or deployment ready. |
| 35 Preserve earlier levels | Current tests + partial native | E6 passes; E3/E4 narrower current native checks. Full current earlier-level browser regressions must precede resumed Level 3 work. |
| 36 Scope cuts | Preserved boundary | Terrain9 explicitly user-requested. No new families/engine/physical hardware/Cloudflare refactor. No independent construction transform. |
| 37 Final report | Not yet due | Final report must include all level SHAs, exact-head command results, current screenshots/console, static/GLB evidence and honest remaining P0s. This audit is not that completion report. |

## Current blockers and evidence gaps

1. **Recording hold:** no browser/testing/task interference until released.
2. **Current full regressions:** E1/E2 precede relevant preset/timing/asset changes.
   Retain them as historical, then produce fresh evidence after the hold.
3. **Physical Level 3 geometry:** current E5 ends with actual Entry_Structure
   solid residual 4.90448656 mm; same Mission BUILD, not COMPLETE. The recorded
   launch step, tunnel clearance and 37.2 mm receiving pocket do not fit the
   existing 254.4 mm consist. The bounded production-geometry decision remains
   pending; preserve original source assets and the shared spatial authority.
4. **Missing true full journey:** support-loss/fall, repair in the same Mission,
   stable whole-consist crossing, authoritative CROSSED/COMPLETE and SUCCESS UI.
5. **Final exact-head gates:** not yet run after a completed Level 3 candidate.

The currently saved `artifacts/submission-evidence/submission-gate-report.json`
is especially easy to misread: it belongs to **0a23db03a7a350a726f4be41e826d9bd66e8af8d**,
timestamp **2026-09-03T06:13:44.768Z**, smoke mode, **64 PASS / 5 FAIL / 2 skips**.
Failures are dirty worktree, train success, mission state machine, flagship and
missing current evidence package. It is not a current bf75ef5 gate result. Do not
copy another historical 70/4 or 73/1 total into the final candidate report.

## Harness-only hardening during recording

Independent Sol review found the current Level 1 script can make some weak
claims: fallback single colour, count-only tower geometry, initial runner ack
instead of completed timing, missing post-reset registrar identity, and a
near-contact screenshot labelled contact. The assigned change is limited to
`scripts/level1-launch-browser.mjs`; no served runtime edits. New assertions
must be executed after recording before being treated as evidence. Partial
`--tower-only` runs must explicitly report skipped gates, never full Level 1.

## Resume commands — deliberately not executed during recording

First recheck branch/dirty files and review the harness patch. Use the existing
isolated root HTTP server on 8782 only after confirming it is still live and
serving this checkout; otherwise start an owned server. Never reuse/reset the
user's 8774 page or the other task's 8781 browser. Pick fresh evidence directories
if these names already exist; preserve failed evidence.

```powershell
node --check scripts/level1-launch-browser.mjs
$env:ROBO_LEVEL1_URL = 'http://127.0.0.1:8782/?demo=simple&level=1'
$env:ROBO_LEVEL1_OUTPUT = 'output/playwright/launch-level1-current-full'
npm run level1:browser -- --write-evidence

$env:ROBO_LEVEL2_URL = 'http://127.0.0.1:8782/?demo=bridge&level=2'
$env:ROBO_LEVEL2_OUTPUT = 'output/playwright/launch-level2-terrain9-full'
npm run level2:browser -- --write-evidence
```

Inspect authoritative records and open every required image; fix/repeat if
either gate fails. These scripts run through native WebMCP in a supported local
browser. Explicitly report test-Human versus real mouse Human and any bounded
accelerated bridge fallback. Do not describe configured cycle time as achieved.

Resolve actual Level 3 clearance and add/execute a full physical journey,
not another diagnostic-only substitute. After that journey, independent review,
all earlier-level regression and the Level 3 completion commit, run:

```powershell
npm run verify
npm run submission:smoke
npm run submission:gate
npm run webmcp:audit
```

Bind reports to the exact candidate and explain preserved user dirt without
weakening the gate or staging unrelated assets. Finish the all-level visual and
static-output audits. Push accepted milestones only, no merge/main/Cloudflare
modification/site publication.
