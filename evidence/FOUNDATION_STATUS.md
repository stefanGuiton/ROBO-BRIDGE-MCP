# Foundation status

Date: 2026-08-27

Status: **LOGO ROBO ORACLE 1 INTEGRATED — FULL CHALLENGE ACCEPTANCE PENDING**

## Oracle 1 integration status

- The default page is now the LOGO ROBO UR10-class Cartesian manipulation vertical slice.
- The adapted controller owns accepted TCP/joint state; manual controls and the seven primitive WebMCP tools use that same controller.
- Oracle 1 focused tests pass: 6 kinematics, 5 controller, 6 latch/collision, 1 reliability, and 2 WebMCP contract tests.
- Workspace qualification passes 1,000/1,000 samples; reliability qualification passes 50/50 trials.
- The retained SCARA/WebGL/Newton foundation remains available and was not deleted or silently replaced.
- See `docs/ORACLE_1_IMPORT_AUDIT.md` and `evidence/oracle1/` for import decisions and current evidence.

## Verified on this PC

- JavaScript kinematics/controller/WebMCP tests: 15/15 pass.
- Standard Python physics/API tests: 6/6 pass; 3 Newton tests are skipped unless explicitly enabled.
- Explicit Newton CPU physics tests: 3/3 pass in 57.82 seconds.
- Browser JavaScript syntax: 11 files pass.
- Python source compilation: 14 files pass.
- Browser app and physics service boot at `127.0.0.1:8769` and `127.0.0.1:8001`.
- SCARA, workcell, cubes, bins, obstacle, gripper, PBR materials, and shadows render.
- Manual XY/Z movement, orbit, pan, fit, and gripper controls pass.
- Invalid motion fails closed and preserves the last valid pose.
- Actual WebMCP discovery and execution pass for nine tools.
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
- `evidence/foundation-verification.json`
- `evidence/setup/baseline-verification.md`

## Remaining acceptance gates

- fresh browser-to-Newton end-to-end pick-and-place;
- repeated final-pose variability measurement;
- post-Newton browser/console screenshots;
- 19/20 complete reliability trials;
- hosted deployment, demo video, and submission evidence;
- final provenance/licence review before any public release.

The deterministic physics backend remains the default. Newton is an explicit CPU-qualified option. CUDA is detected but not accepted because the GTX 1070 previously reached 90 C under unrelated graphics load.
