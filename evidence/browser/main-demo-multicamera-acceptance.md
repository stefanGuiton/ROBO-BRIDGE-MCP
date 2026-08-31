# MAIN_DEMO multi-camera acceptance

- Project: ROBO BRIDGE MCP MAIN_DEMO
- Version: 3.1.0
- Date: 2026-08-31
- Git base HEAD: `e192aec4333b50c8d601ebb972be755476778d36`
- Working-source fingerprint: `6d1db035b71828a92440b4b7e93e35ef85708f425ad70cf7e20966dbcf9faaca`
- URL: `http://127.0.0.1:8769/?cameraAcceptance=1`
- Browser: Codex in-app browser

## Automated verification

`python scripts/verify.py --write-evidence` exited 0:

- JavaScript tests: 108 passed, 0 failed, 0 skipped;
- persistent production reliability: 20/20 passed;
- JavaScript syntax: 56 files passed;
- Python syntax: 4 files passed;
- required files: passed;
- removed legacy/Newton paths: passed.

## Page-local raster inspection

The Debug panel's read-only camera controls rendered 640 x 360 off-screen snapshots without moving the visible human camera:

- `top_camera`: success at world revision 0;
- `left_camera`: success at world revision 0;
- `right_camera`: success at world revision 0;
- `user_camera`: success at world revision 0.

The previews showed the live UR10, table, build mat, MORE BRICKS control, and/or reachable loose-brick supply according to each view. The visible page remained interactive. After capture, the displayed frame timing settled to 120 FPS / 8.33 ms. This is an observed development-browser result, not certified 120 FPS performance.

## Native WebMCP inspection

The browser natively enumerated the one production surface with 11 tools. `observe_camera` exposed these bounded camera IDs:

- `tray_camera`;
- `canvas_camera`;
- `top_camera`;
- `left_camera`;
- `right_camera`;
- `user_camera`.

Codex called all six with `limit: 12`. Each returned `ok: true`, machine-frame camera metadata, projection metadata, and structured detections. Detection counts were 12, 3, 12, 12, 12, and 12 respectively; the user camera used perspective projection and the deterministic inspection cameras used orthographic projection.

The authoritative robot world revision was 0 before the six reads and 0 afterward. The robot remained idle. This proves the camera tools were read-only in this run. Structured visibility uses the documented five-ray AABB approximation; raster previews are a separate page-local QA aid and are not exposed as a large WebMCP payload.

## Console

Codex browser log inspection returned no warnings and no errors after reload, snapshot capture, tool enumeration, and all six native camera calls.
