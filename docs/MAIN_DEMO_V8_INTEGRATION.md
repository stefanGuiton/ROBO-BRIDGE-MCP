# ROBO BRIDGE MCP — MAIN_DEMO Player V8 Integration

## Status

`MAIN_DEMO` is the canonical root player runtime for ROBO BRIDGE MCP. The Player V8 reference was adapted into the existing browser application; it is not embedded as an iframe and does not own a second robot, board, brick list, revision, renderer, or WebMCP registrar.

## Authority model

Accepted state follows one path:

`RevisionClock -> BuildBoard + RobotController -> Runtime -> Renderer / Perception / WebMCP`

Human player mutations go through `HumanBuildAdapter`, then `RobotController` and `BuildBoard`. Robot UI and WebMCP operations keep using the same `RobotController`. Player previews, camera movement, held-brick presentation, LUT changes, and derived connection-graph updates do not mutate accepted world state.

`TEST` mode cancels an active human carry and rejects new player construction edits. Production `structuralCollapseEnabled` is forcibly false even though the supplied reference settings recorded it as true.

## Integrated Player V8 behavior

- desktop WASD, sprint, vertical movement, pointer-lock look, wheel zoom, pick/place, and 90-degree rotation;
- coarse-pointer mobile look, directional controls, rotate, and pick/place;
- capsule collision against the worktable and robot-base exclusion volume;
- fixed 240 Hz player and held-brick updates with bounded catch-up, independent of render cadence;
- held-brick spring/pendulum visual response and collision-aware lift presentation;
- 8 mm mat snapping, blueprint-target snapping, L/M/R four-stud connector masks, connector occupancy, hysteresis, collision-blocked candidates, and derived `ConnectionGraph` diagnostics;
- BUILD/TEST editing modes;
- instanced placed-brick batches with ray-pick identity;
- ACES tone mapping and optional local 17/33/65 `.cube` LUT grading;
- all supplied primitive settings retained, with local persisted overrides restricted to known setting keys;
- exact existing UR10 V2 visual and calibrated real-gripper GLB preserved.

## Deliberate adaptations

The reference demo's behavior is mapped into the repository's canonical millimetre machine frame and existing challenge workcell. Its table/world and standalone brick truth were not copied because that would violate the shared-state architecture.

The held-brick physics is presentation and placement-intent simulation. Accepted construction state remains deterministic; this project does not claim general rigid-body contact physics. BUILD mode never structurally collapses.

## Source provenance

- Player V8 HTML SHA-256: `1a9e333dde43a9b223bca47c586e32b5a276f3faf90c6140f2c764a36b947bb9`
- Oracle default settings SHA-256: `10ed9e86601f5daab465d0eb7a966907b4841a1618fb31a207d3a7945a6deccb`
- supplied settings SHA-256: `3e9a58a4b23b96d4ce98a1cd77b8c123ebf14270c1806016da49620713cbc9b9`
- source test report SHA-256: `0f78b4d37a17c67a449165a370231b6289f4af778f37eba8306e90885229e632`

The large self-contained Oracle HTML and local download/archive folders are reference inputs and are intentionally excluded from Git and release archives.

## WebMCP boundary

The existing nine primitive tools remain the only production WebMCP surface. No player-only high-level snap/build tool was added. Page-side schema and registration behavior are covered by the repository tests. Native agent enumeration, execution, and cancellation remain an external acceptance gate when a browser exposing `document.modelContext` is available.

## Verification commands

```powershell
npm run test:player
python scripts\verify.py
python scripts\build_release.py
```

The five V3 parallel prototypes retain their own package-level tests and builds. They are verified repository work, but they do not become authoritative `MAIN_DEMO` runtime state until a bounded adapter integration is completed.
