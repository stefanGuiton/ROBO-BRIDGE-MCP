# Codex handoff

## Current state

ROBO-SIM-MCP is a working local integration checkpoint. It is not yet the final challenge submission.

Verified on the target PC:

- browser app and physics service boot locally at ports 8769 and 8001;
- SCARA, workcell, cubes, bins, obstacle, gripper, PBR materials, and shadows render;
- orbit, pan, fit, manual XY drag, manual Z drag, and gripper controls work;
- the shared controller rejects invalid movement without changing the last valid pose;
- dense trajectory validation rejects unsafe sparse chords;
- radial transfers avoid the SCARA inner workspace;
- nine WebMCP tools are discovered and call the same controller as the human UI;
- actual WebMCP red and blue pick-and-place workflows pass with the deterministic backend;
- Newton 1.5.0 and Warp 1.16.0 import in the project VENV;
- the official Newton `basic_shapes` example passes headlessly on CPU;
- three Newton-only cases pass: safe grasp/place, offset-grasp failure, and obstacle collision;
- the HTTP service provides health, scene sync/reset, trajectory simulation, and result retrieval;
- no physical SCARA or Duet hardware was contacted.

Current automated checkpoint:

- 15 JavaScript tests pass;
- 6 standard Python physics/API tests pass;
- 3 Newton runtime tests pass when explicitly enabled;
- 11 browser JavaScript files pass syntax checks;
- 14 Python files compile;
- `scripts/verify.py` passes and links the browser/Newton evidence records.

## Safety and runtime choices

- The deterministic backend remains the default.
- Newton must be selected explicitly with `--physics-backend newton`.
- Newton qualification currently defaults to CPU.
- Warp's cache is project-local under `.cache/warp` and ignored by Git.
- CUDA execution has not been accepted because the GTX 1070 previously reached 90 C under unrelated graphics load.
- GPU temperature was 56 C at the publication preflight.

## Remaining bounded work

1. Run a fresh browser session with `--physics-backend newton`.
2. Verify browser to HTTP to Newton to browser state transfer for one complete pick-and-place.
3. Measure repeated CPU result variability and record exact final poses.
4. Capture fresh post-Newton browser and console evidence.
5. Complete `evidence/setup/final-verification.md` and the final acceptance report.
6. Continue premium SCARA visual adaptation only where provenance is clear.

## Commands

```powershell
.venv\Scripts\python.exe scripts\verify.py
.venv\Scripts\python.exe scripts\run_foundation.py
```

After checking temperature, start the Newton-backed service explicitly:

```powershell
.venv\Scripts\python.exe scripts\run_foundation.py --physics-backend newton
```

Run real Newton acceptance explicitly:

```powershell
$env:ROBO_SIM_RUN_NEWTON_TESTS = '1'
$env:ROBO_SIM_NEWTON_DEVICE = 'cpu'
.venv\Scripts\python.exe -m pytest physics\newton-service\tests\test_newton.py -v
```
