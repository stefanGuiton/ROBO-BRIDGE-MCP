# Foundation status

Date: 2026-08-27

Status: **LOGO ROBO ORACLE 3 PERCEPTION/WEBMCP INTEGRATED — FULL CHALLENGE ACCEPTANCE PENDING**

## Oracle 1 integration status

- The default page is now the LOGO ROBO UR10-class Cartesian manipulation vertical slice.
- The adapted controller owns accepted TCP/joint state; manual controls and the active Oracle 3 primitive WebMCP tools use that same controller.
- Oracle 1 focused tests pass: 6 kinematics, 5 controller, 6 latch/collision, 1 reliability, and 2 WebMCP contract tests.
- Workspace qualification passes 1,000/1,000 samples; reliability qualification passes 50/50 trials.
- The retained SCARA/WebGL/Newton foundation remains available and was not deleted or silently replaced.
- See `docs/ORACLE_1_IMPORT_AUDIT.md` and `evidence/oracle1/` for import decisions and current evidence.

## Oracle 2 integration status

- The deterministic compiler converts bounded local image data into an immutable Blueprint with stable target IDs, palette colours, world-space target poses, and invariant validation.
- Seeded inventory spawning, immutable BuildBoard state, Co-Build, Race, and scoring are integrated as browser-independent modules.
- The compiler lab is available at `/compiler.html`; it is a separate page and does not replace the authoritative Oracle 1 UR10 manipulation page.
- The compiler/game bridge to the Oracle 1 controller and WebMCP surface is intentionally not claimed yet because the board coordinate and snap contracts still need an explicit adapter.
- See `docs/ORACLE_2_IMPORT_AUDIT.md` and `evidence/oracle2/` for import decisions and generated evidence.

## Oracle 3 integration status

- Simulator-native camera projection, bounded observations, approximate occlusion, immutable snapshots, active-object association, and stale-state recovery are integrated.
- The active default WebMCP surface is six primitive tools: `get_build_state`, `observe_camera`, `move_tool`, `latch`, `unlatch`, and `claim_target`.
- `apps/web/src/logo/runtime.js` maps that surface to the existing Oracle 1 UR10 controller and board. There is no hidden robot, duplicate kinematics, or renderer-owned accepted state.
- The default browser page completes the shared manual pick-and-place at `target-white-001`; invalid XYZ fails closed and preserves the accepted TCP.
- The fixture perception page is available at `/oracle3.html` and renders the camera detections, exact snapshots, claimed target, and agent activity.
- Oracle 3 focused assertions pass: 23/23. Fixture reliability passes: 50/50. Fresh browser checks show six page-side tools discovered and no console warnings/errors.
- Native WebMCP tool enumeration/call through the automation backend remains unverified because the selected browser model does not expose `webmcp_list_tools`; page-side registration is visible through the lifecycle diagnostics.
- See `docs/ORACLE_3_IMPORT_AUDIT.md` and `evidence/oracle3/` for import decisions and generated evidence.

## Verified on this PC

- Combined JavaScript suites: 86/86 test cases pass through the managed-Windows direct-module fallback after Node worker creation reports `spawn EPERM`.
- Oracle 2 compiler/inventory/board/game suites: 27/27 test cases pass.
- Standard Python physics/API tests: 6/6 pass; 3 Newton tests are skipped unless explicitly enabled.
- Explicit Newton CPU physics tests: 3/3 pass in 57.82 seconds.
- Browser JavaScript syntax: 34 files pass.
- Python source compilation: 14 files pass.
- Root verification was run with the project-local `D:\ROBO-SIM-MCP\.venv\Scripts\python.exe`; machine-wide Python is not treated as project evidence.
- Browser app and physics service boot at `127.0.0.1:8769` and `127.0.0.1:8001`.
- SCARA, workcell, cubes, bins, obstacle, gripper, PBR materials, and shadows render.
- Manual XY/Z movement, orbit, pan, fit, and gripper controls pass.
- Invalid motion fails closed and preserves the last valid pose.
- Browser page-side WebMCP registration/discovery passes for six active tools; the retained nine-tool foundation contract also passes its isolated tests.
- Main-page browser pick/place completes at `target-white-001`; Oracle 3 perception page shows 7 tray objects and 4 canvas objects in the placed scenario.
- Red and blue pick-and-place pass through the deterministic browser workflow.
- Newton 1.5.0 and Warp 1.16.0 import from the project VENV.
- Official Newton `basic_shapes` passes for 20 headless CPU frames.
- Newton safe grasp/place, offset-grasp failure, and obstacle collision pass.
- No physical robot or Duet hardware was contacted.

## Evidence

- `evidence/setup/browser/runtime-results.json`
- `evidence/setup/browser/*.png`
- `evidence/setup/newton-installation.md`
- `evidence/setup/newton-runtime-results.json`
- `evidence/oracle2/verification.json`
- `evidence/oracle2/randomized-invariants.json`
- `evidence/oracle2/compiler-benchmarks.json`
- `evidence/oracle2/manual-flow.json`
- `evidence/oracle3/verification.json`
- `evidence/oracle3/performance.json`
- `evidence/oracle3/reliability-results.json`
- `evidence/oracle3/visual-scenarios.json`
- `evidence/oracle3/browser-acceptance.json`
- `evidence/oracle3/browser-main-pick-place.png`
- `evidence/oracle3/browser-perception-placed.png`
- `evidence/foundation-verification.json`
- `evidence/setup/baseline-verification.md`

## Remaining acceptance gates

- fresh browser-to-Newton end-to-end pick-and-place;
- native WebMCP tool-selection/call acceptance in a supported browser backend;
- compiler-generated multi-brick adapter and red/blue scenario;
- repeated final-pose variability measurement;
- post-Newton browser/console screenshots;
- 19/20 complete reliability trials;
- hosted deployment, demo video, and submission evidence;
- final provenance/licence review before any public release.

The deterministic physics backend remains the default. Newton is an explicit CPU-qualified option. CUDA is detected but not accepted because the GTX 1070 previously reached 90 C under unrelated graphics load.
