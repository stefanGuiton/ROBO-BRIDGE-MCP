# LOGO ROBO SIM V2 agent rules

- Simulation only. Never connect this repository to physical robotics hardware.
- `apps/web/src/robot/controller.js` is the only live robot state authority.
- `apps/web/src/bricks/build-board.js` is the only live board/claim/occupancy authority.
- Both must use the same `RevisionClock`.
- Do not add a second SCARA controller, board adapter, physics service, or duplicate WebMCP registrar.
- NVIDIA Newton is intentionally removed. Do not restore it.
- Keep WebMCP primitive and Cartesian-only. Do not expose joints or a high-level build/playback shortcut.
- Every mutating tool must require the latest exact `worldRevision` and must forward cancellation.
- Read-only tools must not change world state or revisions.
- Compiler targets must pass through the explicit live-machine transform before execution.
- Tests must be read-only by default. Generated evidence requires an explicit command.
- Do not claim native WebMCP acceptance unless it was executed in a supported browser.
- Do not claim exact moving-link/table collision fidelity without a calibrated visual-link collision model.
