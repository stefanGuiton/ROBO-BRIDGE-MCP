# MAIN_DEMO V8 Scene — Design QA

final result: passed

Date: 2026-08-31  
Reference: `LOGO_ROBO_PLAYER_CONTROLS_PHYSICS_120FPS_V8.html`  
Reference SHA-256: `1a9e333dde43a9b223bca47c586e32b5a276f3faf90c6140f2c764a36b947bb9`  
Comparison viewport: 1468 × 930

## Visual match

- Full-screen light-mode V8 player canvas: passed.
- FPS pill, top-left HUD, centred click-to-lock/Escape-release help, reticle, and bottom toolbar: passed.
- White 1750 × 690 × 1200 mm workbench and four-leg proportions: passed.
- 640 × 480 mm build mat with 80 × 60 instanced studs: passed.
- Red circular MORE BRICKS control and compact authoritative brick supply: passed.
- Source floor, table/mat materials, ACES exposure, hemisphere/key/fill/rim lighting, and shadows: passed.
- Complete UR10 V2 mesh and real GLB gripper mounted on the tabletop and kept in frame: passed.
- Fog absent: passed.

## Settings and interaction

- Slide-out panel contains all robot actions: passed.
- 231 source/runtime setting controls rendered: passed.
- Robot mount X/Y/Z/yaw controls rendered and changed the shared machine-frame transform live: passed.
- Table/material/lighting/player/physics/placement/mobile/debug/LUT groups present: passed.
- One browser pick/place advanced build progress from `0/8` to `1/8`: passed.
- Reset restored progress to `0/8`: passed.
- Carried brick body/studs use an opaque material; placement targets alone remain translucent: passed.
- V8 held and released brick solvers run in the 240 Hz fixed-step loop and commit through the shared controller: passed.
- Browser console errors/warnings on the fresh final tab: 0/0.

## Authority and WebMCP

- One `RobotController`, one `BuildBoard`, one `RevisionClock`, and one WebMCP registrar retained: passed.
- Native browser enumeration found nine WebMCP tools: passed.
- Native `get_build_state` and `get_robot_state` calls both returned world revision `0`: passed.
- Display transform is exposed separately from controller-space machine coordinates: passed.

## Evidence

- `evidence/setup/main-demo-v8-scene.png`
- `evidence/setup/main-demo-v8-settings.png`

The display collision boxes remain conservative axis-aligned player exclusions. This checkpoint does not claim calibrated moving-link/table collision fidelity.
