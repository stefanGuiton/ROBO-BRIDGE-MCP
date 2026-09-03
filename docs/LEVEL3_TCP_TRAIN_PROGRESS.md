# Level 3 TCP Train — integration progress, not acceptance

## Current asset/performance follow-up

The user-supplied Terrain9 is now the active asset; legacy Terrain7 names retain the same coordinate contract. Current-mesh tests preserve the original low-tunnel/end-wall assertions, so replacement is not a clearance fix. The earlier native diagnostic below ran on Terrain7; current Terrain9 evidence is recorded here separately.

Fresh Chrome148 `output/playwright/level3-terrain9-current/diagnostic.json`:31 native tools, current276-part plan,6 real robot moves/118 samples and249 observed frames, exact TCP/render/collider alignment,8 contacts/14 impulses, residual pusher penetration0.000005mm. Actual Entry_Structure still leaves4.90448656mm solid-contact residual, correctly returning TRAIN_CONTACT_FAILED/TERRAIN_CONTACT_RESIDUAL and the same Mission BUILD. Robot idle, no pending moves/lease; console0/0/0. All three screenshots inspected. This is truthful current-asset obstruction/cleanup evidence, not physical crossing or a frame-rate claim.

An independently reviewed opt-out removes only unused ground/ceiling diagnostic columns from the two physics contact-query call sites. Exact body contacts, embedded-solid containment, sweeps and residual checks are unchanged; ordinary callers retain columns by default. Omitted values are explicitly null with `columnDiagnosticsAvailable:false`. New parity tests cover synthetic solids/water/void and the current Terrain9 mesh. Focused Train/contact suite77/77 passes. CPU-only microbenchmark:0.0295294 to0.0199515ms/query (32.4% lower), identical contact checksum; not browser FPS or physical acceptance. No geometry, Train dimensions, controller limits or success criteria changed.

## Boundary

Normal TRUNK checkout; `codex/p0-downstream-integration-prep`, based on accepted/pushed Level2 `c24c7f135359a8c80aa859724b640afb2c6e7fd5`. Keep draft PR7, PlanN and unrelated user assets. No main merge, deployment, second controller/board/clock, or collision-limit changes.

Foundation published at **9a0a9e922059df47ab6cc66c4f94b1903bfd2f91**, with remote SHA verified. Subsequent contact-timeline repair remains separate from that checkpoint. The two unrelated JS paths reported dirty are normalized-blob-identical to HEAD; no functional user code was omitted. User Blender changes remain outside this work.

The contact-timeline and realtime pacing follow-up is now committed and pushed at **3dc9ca95e517840985fefbb9de0168c3c45277ed**, local/remote SHA verified, exact-head focused regression 153/153. It also contains the earlier Simple timing milestone 188acaf. This documentation-only follow-up changes no runtime. Full Level 3 physical acceptance remains pending below.

## Implemented

- Lazy Level3-only `tcp_contact` production mode. Levels1/2 do not initialize Train physics or its frame subscription.
- `robot-tcp-pusher.js`: exact machine TCP position/quaternion, one existing controller lease, bounded fresh-revision Cartesian approach/align/push/retract/retreat, cancellation cleanup and a private motion witness. No direct Train pose/velocity command.
- `terrain-mesh-contact.js`: actual classified solid GLB triangles, physical contact/sweep/column queries, one canonical machine/display transform. Water and void never become synthetic support.
- Existing Train solver extended to measured kinematic contact, three dynamic bodies/two couplers, momentum/coast/fall, exact accepted rail footprint plus accepted structural evidence. Legacy analytical fixture mode is explicitly distinct. Every carriage's trailing extent, real rail-contact history, whole accepted route and current support/upright state are required for CROSSED.
- Mission accepts world clock advancement only through a private test-bound motion witness AND the exact final returned revision. Foreign changes, stale/missing identity, cancellation and duplicate instance races fail closed.
- Results panel derives authoritative COMPLETE/CROSSED and separates Human, actual robot, explicit fast-forward, unavailable rejection history, build time excluding tests, test/failure/retry counts and final PASS-time revision. No second completion authority.
- Read-only BuildBoard event cursor derives from its existing ledger; it is not another counter. Derived fingerprint caching never reuses an empty/reset cursor and always reserializes all live source records.

## Verified so far

Focused suites include 24 TCP-adapter, 14 actual-terrain, 6 low-level contact, 15 service-contact, 32 Mission witness, 10 lifecycle, 10 results and 3 fingerprint tests. Stable-source `npm run verify` passed: **582/582 JavaScript, 20/20 reliability, 173 JavaScript and 4 Python syntax files**, required-file and removed-legacy checks. This verifies the shared working source, including untouched user changes; it is not the final clean-candidate or Level 3 browser acceptance gate.

Real native Chrome148 diagnostic (`npm run level3:diagnostic -- --write-evidence`, configurable `ROBO_LEVEL3_URL`/`ROBO_LEVEL3_OUTPUT`):

- Native31 unique tools; freeze current plan `bp_9453b510` / checksum `9453b510`,276 targets.
- Real RobotController6 moves,118 motion samples, revision4→122; pusher/TCP position error0; cleanup leaves idle/zero pending.
- Empty board remains incomplete. Actual terrain contact returns `TRAIN_COLLIDED / TERRAIN_OBSTRUCTION`, same Mission ID returns BUILD. Main opened the visible REPAIR/RETEST panel screenshot.
- Console errors0, warnings0, exceptions0. Latest evidence `output/playwright/level3-train-fingerprint-current/diagnostic.json` and3 PNGs; generated evidence is not committed.
- Diagnostic read-cost means (5 reads each, not an FPS benchmark): pusher46.12ms before,0.26ms after derived fingerprint optimization; Train snapshot49.26→0.78ms. Result screenshot still showed14FPS averaged over the run; no120FPS performance claim.
- Latest run recorded contact impulses but maximum proxy penetration 44.55mm. This does not establish a clean physical push. Independent review found a roughly 46.55mm measured TCP advance consumed in one physics update; contact sampling/constraint handling needs correction independently of the geometry blocker.

Earlier diagnostic folders remain historical; do not combine separate runs as a successful full journey. The automated command is deliberately named diagnostic, not Level3 acceptance.

## Concrete geometry blockers

### New contact/pacing evidence (verified follow-up to 9a0a9e9)

Full verification after these repairs and the separate Simple timing follow-up passed **637/637 JavaScript tests, 20/20 reliability, 173 JS + 4 Python syntax and repository checks**. Remote attribution-only changes through `ac004577` are preserved. This is checkpoint verification, not the uncompleted Level 3 physical acceptance gate.

Measured TCP history now consumes each interval once in bounded full-island substeps (at most1/120s and1mm or smaller part-based limit). Queue/lag is bounded and explicit; no time is discarded to manufacture success. Residual pusher/solid overlap beyond0.25mm fails closed. Independent review reproduced and fixed subscription cleanup and endpoint-rounding edge cases. Focused Train/adapter/Mission group185/185 passes; new controller pacing5/5 and existing controller9/9 pass separately.

The first native rerun correctly rejected a second defect: existing absolute motion deadlines emitted overdue ~5.72mm TCP samples only0.30ms apart (~19,056mm/s observed), despite a120mm/s validated profile. An opt-in `timingMode: 'realtime'` in the existing controller now waits each physical profile interval after the preceding sample's observers. The TCP adapter alone requests it; normal Simple/Bridge scheduling and global playback are unchanged. Unsupported zero-duration moving profiles reject rather than receive fabricated timestamps.

Fresh Chrome148 evidence `output/playwright/level3-train-realtime-current/diagnostic.json`:31 native tools,6 actual controller moves/118 samples,230 observed renderer frames, position/orientation mismatch0 (render position roundoff~1.3e-13mm), debug visibility/revisions and cleanup pass. Physics records10 pusher contacts/15 impulses; maximum pusher penetration0.08035mm and residual0.000005mm. It then truthfully fails `TRAIN_CONTACT_FAILED / TERRAIN_CONTACT_RESIDUAL`: actual `Entry_Structure` leaves4.91974mm solid penetration. Same Mission returns BUILD, no pending move/lease, console0errors/0warnings/0exceptions. Main opened all3 screenshots. The screenshot FPS remained single-digit/low-teens; no performance or full physical push/fall/crossing acceptance is claimed.

Earlier sampling/clock-probe folders remain failed diagnostic evidence. This repair does not remove the launch/tunnel/receiving geometry blocker below or establish the required failure-repair-success journey.

Current route ENTRY(465,-111.2,144.448), EXIT(835,-111.2,144.448), span370mm. Current Train dimensions are unchanged.

- Entry_Structure floor136.174mm:8.274mm step to rail top; actual rear-car wall overlap reproduced.
- Tunnel floor132.934mm and ceiling158.148mm: only13.7mm headroom above rail, incompatible with current34mm-high lead body.
- Tunnel width about25.23mm; current rail-spanning footprint crosses its positive wall by at least0.552mm.
- Solid tunnel end wall near machineX872.3 leaves37.2mm beyond EXIT: insufficient for the existing whole consist.

The recorded current consist is A 88×34×34mm, B/C 70.4×30×32mm with 12.8mm gaps: total length 254.4mm. Whole-consist receiving clearance is therefore materially larger than the 37.2mm pocket. This is a geometry decision, not something solved by changing the success threshold.

User approval requested for bounded production entrance/tunnel/rail-transition corrections while keeping the current shared bridge/terrain placement and original source assets. No correction has been made yet. Do not compensate by shrinking acceptance to the lead car, hiding walls, changing robot limits, or treating water/metadata as physical support.

## Next required work

1. Resolve the clearance decision and actual compatible launch/receiving geometry through one authority.
2. Verify physical TCP contact/sampling and stable three-body motion, including excessive penetration protection.
3. Real native incomplete-bridge fall/derail → same Mission BUILD → repair → full physical crossing → CROSSED/COMPLETE; open screenshots and inspect all stats.
4. Stable exact-source full verify, Level1+2 regressions, independent final diff review; then Level3 completion commit/push.
5. Exact-head verify/submission smoke/gate/WebMCP audit, all-level browser and static apps/web/real-GLB readiness audit. No deployment or main merge.
