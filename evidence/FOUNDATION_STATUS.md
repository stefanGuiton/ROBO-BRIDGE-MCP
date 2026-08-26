# Foundation status

Date: 2026-08-26

Status: **FOUNDATION BUILT — NOT CHALLENGE READY**

## Observed in this ZIP

- JavaScript kinematics/controller/WebMCP tests: 12/12 pass.
- Python physics/API tests: 5/5 pass.
- Python source compiles.
- WebMCP tool source is present.
- Browser source is present.
- Physics service and deterministic backend are present.
- Newton detection and integration boundary are present.

## Not observed in the build VM

- Browser rendering, because the VM container had no direct network access to load Three.js from the CDN.
- WebMCP tool discovery or execution in Chrome/ChatGPT.
- Newton/Warp import or simulation.
- SCARA-SIM private repository clone inside the container.
- Hosted deployment.

## Required target-PC checks

1. Run `SETUP_WINDOWS.bat`.
2. Run `START_WINDOWS.bat`.
3. Check the 3D scene and manual XY/Z drag.
4. Check plan → physics → execute.
5. Use a WebMCP-enabled browser to inspect nine tools.
6. Clone/open private SCARA-SIM and compare V8 visuals and controls.
7. Start the bounded Newton task in `docs/NEWTON_NEXT_TASK.md`.
