# Level 3 TCP Train — integration progress, not acceptance

## Boundary

Normal TRUNK checkout; `codex/p0-downstream-integration-prep`, based on accepted/pushed Level2 `c24c7f135359a8c80aa859724b640afb2c6e7fd5`. Keep draft PR7, PlanN and unrelated user assets. No main merge, deployment, second controller/board/clock, or collision-limit changes.

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

Current route ENTRY(465,-111.2,144.448), EXIT(835,-111.2,144.448), span370mm. Current Train dimensions are unchanged.

- Entry_Structure floor136.174mm:8.274mm step to rail top; actual rear-car wall overlap reproduced.
- Tunnel floor132.934mm and ceiling158.148mm: only13.7mm headroom above rail, incompatible with current34mm-high lead body.
- Tunnel width about25.23mm; current rail-spanning footprint crosses its positive wall by at least0.552mm.
- Solid tunnel end wall near machineX872.3 leaves37.2mm beyond EXIT: insufficient for the existing whole consist.

User approval requested for bounded production entrance/tunnel/rail-transition corrections while keeping the current shared bridge/terrain placement and original source assets. No correction has been made yet. Do not compensate by shrinking acceptance to the lead car, hiding walls, changing robot limits, or treating water/metadata as physical support.

## Next required work

1. Resolve the clearance decision and actual compatible launch/receiving geometry through one authority.
2. Verify physical TCP contact/sampling and stable three-body motion, including excessive penetration protection.
3. Real native incomplete-bridge fall/derail → same Mission BUILD → repair → full physical crossing → CROSSED/COMPLETE; open screenshots and inspect all stats.
4. Stable exact-source full verify, Level1+2 regressions, independent final diff review; then Level3 completion commit/push.
5. Exact-head verify/submission smoke/gate/WebMCP audit, all-level browser and static apps/web/real-GLB readiness audit. No deployment or main merge.
