# LOGO ROBO SIM V2 — Master Plan

## Product goal

LOGO ROBO SIM V2 is the post-audit, simulation-only browser robotics challenge demo. A human and a WebMCP agent use the same six-axis UR10-class Cartesian controller to build a small coloured 2×4-brick logo from a compiler-generated Blueprint.

The product must prove live state changes. It must not depend on prerecorded robot playback, a second hidden robot, or a separate game-state simulation.

## Current architecture

One live authority chain is mandatory:

`RevisionClock -> BuildBoard + RobotController -> Runtime -> Perception/WebMCP + Renderer`

### State authority

`RobotController` owns:

- accepted TCP;
- accepted six joint values;
- moving/planning/idle state;
- held brick;
- motion limits;
- cancellation epoch;
- robot revision.

`BuildBoard` owns:

- target geometry;
- target colour;
- occupancy;
- claims;
- correctness;
- human/agent contribution.

Both share one `RevisionClock`. Every accepted world mutation changes this clock once or more as an explicit transaction sequence. Read-only operations do not change it.

### Compiler

The compiler creates an immutable local Blueprint. `workcell-adapter.js` then maps that Blueprint into the live challenge board frame and validates reachability. Inventory is generated directly inside the live tray.

Local compiler coordinates are never treated as live robot coordinates without this transform.

### Perception

Perception is simulator-native structured projection, not computer vision. It returns bounded pixel boxes, approximate visibility, world-centre coordinates, recommended TCP coordinates, and the atomic snapshot revision.

The visibility model is an approximate five-ray AABB model.

### WebMCP

The active API is primitive and Cartesian-only. Mutations require `expectedWorldRevision`.

There are no joint-control, build-logo, execute-plan, or hidden playback tools.

### Physics decision

NVIDIA Newton and the old separate physics service are removed. The challenge demo uses deterministic kinematic state, conservative collision checks, rigid held-brick attachment, and board snap rules.

This product does not claim rigid-body dynamics, slip, throw physics, or contact-force fidelity.

## Safety model

The browser controller fails closed on:

- non-finite input;
- workspace violation;
- speed violation;
- IK failure;
- singularity margin failure;
- branch continuity violation;
- tool/workcell collision;
- free or placed brick collision;
- held-brick collision;
- conservative link/raised-workcell collision;
- self-collision;
- stale world revision;
- cancellation;
- reset epoch change.

The controller rechecks live collision before each accepted motion sample.

The current project-owned visual robot does not have a calibrated mesh-to-DH table collision model. Therefore the release must not claim exact moving-link/table collision fidelity. Tool/table collision remains enforced.

## Motion model

Cartesian segments use a bounded triangular/trapezoidal time profile. The configured request is a peak speed cap, not an average speed label.

The controller also bounds estimated joint speed and joint acceleration by scaling the segment time when needed.

## Human interaction

The default page provides:

- direct Cartesian move form;
- current compiled build progress;
- next-brick execution;
- full compiled round;
- reset;
- camera presets;
- mouse camera adjustment;
- wheel zoom;
- live TCP/joint/revision/tool diagnostics.

Human interference can also be represented by moving loose bricks in the shared world state. Agent motion must recheck that state.

## Game model

Co-Build uses the same live `BuildBoard`. Contributions come from accepted physical placement actor identity.

Race can use two explicit physical board instances, one per competitor, but those boards must never be mistaken for the single shared Co-Build workcell.

## Browser dependency policy

The main LOGO ROBO page must run without a runtime CDN dependency. WebMCP is progressive enhancement: if `document.modelContext` is absent, manual simulation still works and the UI reports WebMCP unavailable.

## Test policy

Tests are read-only.

The release suite must prove:

- FK/IK;
- singularity handling;
- speed/acceleration bounds;
- reset and queued-operation cancellation;
- latch/release concurrency protection;
- live human interference;
- wrong-colour and occupied-target behavior;
- one shared world revision;
- perception snapshot/read-only behavior;
- WebMCP schemas, stable errors, cancellation propagation, and registration failure;
- explicit compiler-to-machine mapping;
- live red/blue primitive build round;
- 20 persistent reliability rounds with at least 19 successes.

## Evidence policy

Old generated Oracle and Newton evidence is not release proof.

`python scripts/verify.py` performs read-only checks. `--write-evidence` is an explicit optional action.

`python scripts/build_release.py` runs verification and creates a ZIP with a SHA-256 file manifest.

## Public-release gate

Before publication:

- verify the final source ZIP hash;
- verify no local/private paths or credentials are present;
- confirm the licence/provenance basis for project-authored/adapted source;
- run a clean-browser smoke test;
- run native WebMCP enumeration/call/cancel acceptance if a supported browser exposes it;
- record any external acceptance gate that could not be run rather than claiming it passed.

See `FULL_REMEDIATION_PLAN_5_6_PRO.md` for the detailed GPT-5.6 Pro acceptance plan.
