# MAIN_DEMO V8 Scene Verification

Date: 2026-08-31  
Project: ROBO BRIDGE MCP MAIN_DEMO Player V8  
Baseline HEAD: `8dfa08ff696bfcbfabac22b9f0b663af392dbe02`

## Automated verification

Command: `python scripts/verify.py`

- JavaScript tests: 91 passed, 0 failed, 0 skipped.
- Persistent production reliability: 20/20 passed.
- JavaScript syntax: 50 files passed.
- Python syntax: 4 files passed.
- Required files: passed.
- Removed legacy/Newton paths: passed.

## Browser verification

URL: `http://127.0.0.1:8772/`

- Fresh page boot: passed.
- UR10 V2 mesh: ready.
- Real gripper GLB: ready.
- Visible build state: `0/8` after reset.
- V8 setting controls: 231.
- Robot mount controls: 4; live X transform exercised and restored.
- Mouse look contract: click requests unadjusted Pointer Lock with the standard Pointer Lock fallback; movement is free-look only while captured and `Esc` releases capture. Automated test passed. Native capture still requires a real user gesture in the embedded browser.
- Brick physics: 240 Hz held pendulum and released gravity/angular/restitution/friction/OBB behavior passed deterministic tests while committing through `RobotController`.
- Carried brick opacity: opaque body/stud material passed source-level regression coverage; only placement targets remain translucent.
- Place-next-brick control: `0/8 -> 1/8`.
- Reset control: `1/8 -> 0/8`.
- Console on fresh final tab: 0 errors, 0 warnings.
- Observed frame display at comparison state: 120 FPS / about 8.33 ms; this is an observation, not 120 FPS certification.

## Native WebMCP read-only acceptance

- Tools enumerated: 9.
- `get_build_state`: succeeded; world revision 0.
- `get_robot_state`: succeeded; world revision 0.
- Read-only calls preserved revision: passed.
- Native mutating cancellation: not repeated in this visual pass; automated cancellation forwarding remains green.

## Visual evidence

- `main-demo-v8-scene.png`: final source-matched workbench/robot composition at 1468 × 930.
- `main-demo-v8-settings.png`: complete slide-out controls/settings panel at 1468 × 930.

No physical hardware was contacted. NVIDIA Newton remains absent.
