# LOGO ROBO — GPT-5.6 Pro Full Remediation Plan

## Mission

Finish LOGO ROBO as one coherent browser robotics demo. Treat all existing code and evidence as untrusted until source and tests prove the behavior.

Use the repository as simulation-only software. Do not connect to a physical robot, ROS, Duet, or other hardware.

NVIDIA Newton is not part of the target architecture. Do not restore it, replace it with another physics service, or add a second robot state.

## Required final architecture

There must be exactly one live authority chain:

`RevisionClock -> BuildBoard + RobotController -> LOGO runtime -> Perception/WebMCP + Renderer`

The following rules are mandatory:

1. `RobotController` owns accepted TCP, joints, held brick, motion state, and robot revision.
2. `BuildBoard` owns target occupancy, claims, correctness, and actor contribution.
3. Both use the same monotonic `RevisionClock`.
4. The renderer reads accepted state only. It must never create accepted state.
5. Perception reads one atomic runtime snapshot.
6. Every WebMCP mutation requires the exact latest `worldRevision`.
7. Manual and WebMCP actions call the same controller and board.
8. Compiler output is transformed explicitly into the live UR10 machine frame before use.
9. There is no duplicate SCARA controller, duplicate board adapter, duplicate WebMCP registrar, or physics authority.
10. Tests are read-only by default. Evidence generation is an explicit separate action.

## Phase 1 — Remove obsolete architecture

Delete the Newton service, browser physics client, Newton tests, Newton setup, and Newton evidence.

Delete the inactive SCARA controller/scene/runtime path if it is not a current product entry point. Delete duplicate WebMCP registrars and the duplicate board adapter.

Acceptance:

- no `physics/` runtime directory;
- no `apps/web/src/physics/`;
- no `apps/web/src/core/` duplicate controller;
- one active WebMCP registration module;
- one live board implementation;
- `scripts/verify.py` fails if any removed path returns.

## Phase 2 — Make state mutations atomic

Put all robot operations behind one serial operation model.

Required behavior:

- move requests are queued;
- each request captures the operation epoch when queued;
- reset increments the epoch and aborts all active and already-queued pre-reset moves;
- latch and release reject while a move is queued, planning, or moving;
- a stale operation can never commit after reset;
- a world change increments one shared world revision;
- repeated idempotent reads or repeated same-owner claims do not create fake physical revisions.

Acceptance tests:

- reset during motion;
- reset with two queued moves;
- latch during planning;
- release during movement;
- stale queued expected revision;
- human interference during movement.

## Phase 3 — Repair motion safety

Keep the public agent API Cartesian-only.

Enforce:

- finite input;
- exact workspace limits;
- fixed-down orientation;
- IK branch continuity;
- singularity margin;
- actual peak TCP speed limit;
- TCP acceleration limit;
- joint-speed limit;
- joint-acceleration limit;
- live collision recheck before every accepted motion sample.

Collision checks must include:

- tool/table;
- tool/board/tray;
- tool/free bricks;
- held brick/free and placed bricks;
- occupied target descent;
- conservative moving-link capsules against raised workcell structures;
- robot self-collision.

Do not claim a table/link mesh collision guarantee unless the project-owned visual link geometry and DH-to-visual transform are explicitly calibrated. The current bounded guarantee is tool/table plus link/raised-workcell and self-collision.

Acceptance:

- unsafe motion preserves the last accepted sample;
- a moved loose brick can stop an in-progress transfer;
- an occupied target blocks descent before release;
- measured peak rates never exceed configured limits.

## Phase 4 — Repair WebMCP as an adversarial API

Expose only these primitive tools:

- `get_build_state`
- `get_robot_state`
- `get_workspace`
- `observe_camera`
- `move_tool`
- `latch`
- `unlatch`
- `claim_target`
- `reset_workcell`

Requirements:

- `additionalProperties: false` on every schema;
- exact controller bounds in `move_tool`;
- `expectedWorldRevision` on every mutation;
- cancellation signal forwarded from native tool execution to the controller;
- no joint command or high-level build playback tool;
- registration failure handled without an unhandled promise rejection;
- stable machine error vocabulary;
- internal exceptions return `internal_error`, not `runtime_unavailable`;
- bounded output preserves `ok:true` for valid truncated reads.

Acceptance:

- malformed input matrix;
- runtime unavailable;
- registration rejection;
- native/mocked abort during a live move;
- stale revision for every mutation;
- no read-only tool changes world revision.

## Phase 5 — Make perception revision-safe and actionable

Perception must read `{worldRevision, objects}` atomically from the live runtime.

Each brick detection must return:

- object ID;
- centre XYZ;
- pixel box;
- approximate visible fraction;
- state;
- `recommendedTcp` for a valid grasp approach;
- snapshot revision.

Each target detection must return the target centre and recommended TCP.

The system must state that visibility is simulator-native five-ray AABB approximation. Do not present it as image-recognition or exact occlusion truth.

Acceptance:

- runtime unavailable fails closed;
- read-only observation does not bump the revision;
- stale brick and stale target mutations fail;
- held objects are not forced to 100% visible;
- larger scenes stay within the output limit.

## Phase 6 — Join compiler, inventory, board, and robot

Compile local PNG/JPEG/WebP into an immutable Blueprint.

Then explicitly remap the Blueprint into the live challenge board frame. Never use the compiler's local centred coordinates directly as machine coordinates.

Spawn the exact required colour inventory inside the live tray with enough gripper clearance.

Use the same `BuildBoard` for:

- robot release/snap;
- WebMCP build state;
- claims;
- correctness;
- human/agent contributions;
- Co-Build scoring.

Wrong-colour placement must fail without occupying a target.

Acceptance:

- a generated red/blue Blueprint is reachable;
- generated inventory is visible to production perception;
- a complete red/blue round uses only primitive tool-returned data;
- final board progress is 100%;
- physical actor contributions are exact.

## Phase 7 — Bound the compiler

Reject oversized inputs before expensive processing.

Target limits:

- maximum decoded dimension: 1024 px;
- maximum source pixels: 1,048,576;
- maximum uploaded file size: 8 MiB.

Do not allocate 4096×4096 Float64 integral buffers.

Acceptance:

- oversized dimensions fail before integral allocation;
- oversized file bytes fail before bitmap decoding;
- normal images compile deterministically.

## Phase 8 — Browser/runtime quality

The default page must work with WebMCP unavailable. It must show a clear degraded status rather than fail.

Keep the page dependency-free at runtime. Do not add a CDN dependency for the main demo.

Required human functions:

- Cartesian tool controls;
- full compiled-round button;
- next-brick button;
- reset;
- camera presets;
- mouse drag camera adjustment;
- wheel zoom;
- visible robot/build/revision/tool diagnostics.

Acceptance:

- clean HTTP boot;
- no console error in normal use;
- no unhandled promise rejection when WebMCP registration fails;
- reload creates a documented new simulation session;
- responsive layout remains usable at common desktop sizes.

## Phase 9 — Replace false-green testing

The release suite must include production code, not only fixtures.

Mandatory tests:

- FK/IK and singularity cases;
- controller race/cancellation tests;
- collision and live interference tests;
- one-revision authority tests;
- wrong-colour and occupied target tests;
- perception atomicity/read-only tests;
- WebMCP schema/cancellation/error tests;
- compiler-frame/inventory tests;
- complete production primitive red/blue round;
- persistent 20-round reliability run with deterministic small human brick-position changes.

Release threshold:

- all unit/integration tests pass;
- reliability >= 19/20;
- no skipped release-critical test.

## Phase 10 — Evidence and provenance

`verify.py` must be read-only unless `--write-evidence` is supplied.

A release build must run verification first and create a manifest with file sizes and SHA-256 hashes.

Do not reuse old Oracle/Newton screenshots or JSON as current evidence.

Before public submission, confirm the redistribution basis for project-authored/adapted Oracle contributions and keep a current provenance record.

## GPT-5.6 Pro final review instructions

When reviewing the repaired source:

1. Do not reintroduce Newton or the deleted duplicate stacks.
2. Run `python scripts/verify.py` first.
3. Read every current production source and test.
4. Add a failing regression test before changing a confirmed defect.
5. Re-run the focused test, then the complete suite.
6. Inspect the browser from a clean local server if a browser is available.
7. If native WebMCP is available, perform real tool enumeration, one full primitive round, and live cancellation. If it is not available, state that this external acceptance gate remains unverified; do not fake it with page-side registration.
8. Do not create release evidence from a dirty checkout.
9. Do not claim exact robot-link/table collision fidelity until visual-link calibration exists.
10. Stop only when the release suite is green and the final ZIP is reproducible.

## Final release commands

```powershell
python scripts\verify.py
python scripts\build_release.py
```

Expected release artifact:

`LOGO_ROBO_MCP_FIXED.zip`
