# P0 construction integration — WIP checkpoint, blocked acceptance

Base main: `ec3c9237c224210112acd0ba71ddc06ea95f9f91`.
Working branch: `codex/p0-construction-integration`.
The user explicitly requested publishing the current WIP on 2026-09-02. This is a backup/review checkpoint, not construction acceptance. Complete acceptance has **not** passed; keep the PR draft and do not merge to main.

## ENTRY / EXIT settings

- Settings > Bridge ENTRY / EXIT now provides six XYZ fields, Apply/Enter and Reset.
- Values use millimetres in the table frame: X right, Y back, XY zero at table centre, Z above tabletop. Heights are linked to keep the Aqueduct level.
- Successful changes compile through the authoritative BridgeHost and commit the shared challenge transform for terrain, bridge, endpoints and route. Brick scale stays unchanged. Values persist in local browser storage; active/frozen construction blocks edits.
- Targeted tests passed 16/16. Real Chrome verified applied coordinates, linked height, reload persistence, invalid endpoints rejected without scene changes, and reset; zero console errors/warnings.
- Screenshot: `output/playwright/construction/04-endpoint-controls.png` (local ignored evidence). Browser runner supports `--endpoints-only`.
- Positioning does not repair the internal compiler geometry intersections described below.

## Implemented and verified so far

- Imported ten production modules from `Downloads/ORACLE_BRIDGE_CONSTRUCTION_RUNTIME_V1(3).zip`; SHA-256 `bf179f9887097141393bf71e94f78d13175181e0a43813efbb423c76fabad631`.
- No stale 476-part fixture, old bridge core, standalone renderer, or actor-exclusive pool imported.
- Current BridgeHost -> immutable freeze -> dynamic PartRegistry/inventory -> existing BuildBoard -> existing lookahead/cycle runner/RobotController/PlacementAuthority.
- Registry permits both `human` and `agent` for every current class. Actor preference is only a scheduling hint. Standard bodies retain logical versus physical dimensions.
- Added typed capture offsets, conservative exact-profile collision boxes, exact custom-part visual adapter, board target loading, dependency checks, and frozen-design mutation lock.
- ConstructionService exposes revision-checked start, progress, planNext, bounded buildNextParts(1..5), cancellation and reset. MAIN_DEMO has local construction controls. No Mission tools or second registrar.
- Real controller integration run accepted 15 parts (6 ARCH_B, 9 ARCH_A), then correctly stopped on collision before the next tier. Not a complete bridge build.
- Real MAIN_DEMO Chrome run accepted one human ARCH_B via HumanBuildAdapter and three robot ARCH_B via the existing cycle runner on the same BuildBoard. The human took the planned source; lookahead reassigned it, then adopted the human-completed target. Browser evidence uses the player service path, not a complete mouse-driven pickup/release acceptance.
- Browser cycle start interval: mean 3608.55 ms, max 3889 ms; three overruns at requested 1000 ms. Do **not** claim one-second bridge cycles. The earlier simple-brick regression still passes.

## Confirmed compiler/geometry blocker

Current plan `bp_0d7627b1`, design checksum `0d7627b1`, 131 physical parts:
87 x 1x1x1, 15 x 1x2x1, 21 ARCH_A, 6 ARCH_B, 2 TRACK_SEGMENT. Catalogue 1x20x1 has zero current demand.

PartRegistry revision `bridge-part-registry.p0.v1`, hash `pr_767a6c8c`; freeze checksum `freeze_5c084eff`. Custom definitions: `arch_e367f5e4` x12, `arch_58ffd801` x9, `arch_5d2ace59` x6, `track_aef9c3df` x2.

The conservative proxy audit reported 69 overlapping pairs. A separate exact front-face triangle clipping audit confirms **21 actual intersecting part pairs**, excluding track from that audit: 9 arch/arch pairs and 12 standard-brick/arch pairs. This is not merely an AABB false positive.

First blocking pair:

- Upper `bp_0d7627b1.c.3.0`, definition `arch_e367f5e4`.
- Lower/support `bp_0d7627b1.c.6.0`, definition `arch_58ffd801`.
- Exact cross-section overlap 17.173001 mm² through 16 mm depth (274.768020 mm³).
- Example intersecting X/Z triangle: `(730,119.2)`, `(733.577708594,128.8)`, `(731.777777719,128.8)` mm.

The upper arch opening overlaps the raised crown of its lower support. Standard infill also intersects exact curved arch geometry. A common world transform cannot resolve intersections between parts. No collision checks were disabled, no target was force-accepted, and V4.6 geometry/compiler logic has **not** been changed to conceal this defect.

Oracle/owner decision needed: authorize a bounded V4.6 compiler/custom-geometry repair, or provide a corrected current production BuildPlan/compiler package. Keep BuildPlan reservations, dependency/support maps, exact visible custom geometry and physical targets consistent.

## Spatial correction (provisional, not full visual acceptance)

Original current bridge bottom was -96 mm below the tabletop. The challenge-owned correction derives a +100 mm elevation from physical bounds. XY position, -90° challenge rotation, bridge yaw 0 and scale 2 are unchanged. Terrain height scales about its tabletop minimum, while bridge translation, ENTRY/EXIT and route elevation agree. No separate Construction transform or workspace widening.

- Bridge translation `(650, -111.2, 100)` mm; yaw 0; scale 2.
- Physical target AABB: X 506.1..793.9; Y -135.2..-87.2; Z 4..162.0480002 mm.
- ENTRY `(513.2,-111.2,156)`; EXIT `(786.8,-111.2,156)` mm.
- Actual normal MAIN_DEMO workspace remains X 250..1050, Y -450..450, Z 10..600; clearance 400 mm. The narrower 470..710 box belongs to the old/evidence workcell.
- All 131 capture TCPs are inside that unchanged Cartesian box. This is **not** proof of complete IK/path reachability for all 131 parts.
- Table and accepted terrain bank proxies report no target intersection. Exact terrain-mesh/part clearance and support have not been proven; the current front view obscures some lower physical geometry. Visual acceptance remains partial.

## Tests and browser evidence

- Pre-push full JavaScript: 163/163 (155 existing + 5 construction + 3 endpoint tests).
- Robot: 30/30; compiler: 26/26.
- WebMCP: 15/15; player: 26/26.
- Reliability: 20/20.
- Pre-push repository verify: PASS; JS syntax 110 files, Python syntax 4 files; no legacy/Newton regression.
- Final successful Chrome page run: zero console errors and zero warnings.
- Native WebMCP remains **NOT VERIFIED in this browser**. Installed Chrome exposes `navigator.modelContext`, while the unchanged existing registrar expects `document.modelContext`. No API shim/fake registrar used. Existing 19-tool registration contract tests pass; no new WebMCP tools added.
- An earlier attempt on the pre-existing port 8772 server failed with ERR_CONNECTION_RESET. The final successful run used the repository server on 8773.

Explicit evidence directory (ignored local artifacts): `output/playwright/construction/`:

- `01-initial.png`, `02-shared-inventory.png`, `03-human-and-robot.png`.
- `acceptance.json`, `console.json`, `exact-geometry-audit.json`.
- `failure.png` is a last-failure diagnostic that can be overwritten by later attempts; it is not final acceptance evidence.

Reproduce geometry audit (read-only): `node scripts/audit-construction-geometry.mjs`.
Write its evidence explicitly: append `--write-evidence`.
Browser runner: `scripts/construction-browser.mjs`, with `--playwright-module`, `--browser`, `--url`, and explicit `--write-evidence` options.

## Source map / resume

- `apps/web/src/bridge-construction/`: imported/adapted package, new ConstructionService and exact physical visuals.
- `apps/web/src/bricks/{build-board,placement-authority,latch,part-spec}.js`: same authorities, typed dimensions and capture.
- `apps/web/src/robot/{controller,collision,fast-placement,placement-lookahead}.js`: existing real execution path, typed collision and adoption.
- `apps/web/src/bridge-core/bridge-host.js`: immutable BUILD lock and atomic challenge update only; compiler geometry unchanged.
- `apps/web/src/challenge/`: coherent elevation option preserving current XY/yaw.
- `apps/web/src/{bridge,logo,player,render}/` and `apps/web/index.html`: integration/physical rendering/UI seams.
- `tests/helpers/construction-harness.js`, `tests/js/bridge-construction.test.js`: real-authority tests, no execution doubles.
- `scripts/{construction-browser,audit-construction-geometry}.mjs`: explicit acceptance/audit.

Remaining acceptance gates: repair the exact geometry overlap; refine conservative proxies where they still falsely block; prove every part class through both actors including track; finish mouse/player and unobscured physical visual acceptance; native WebMCP acceptance in the supported app browser; custom-part cycle performance; final full regressions before approval to merge. Publishing this WIP does not close these gates. No Train, Mission, deployment or physical hardware work was attempted.
