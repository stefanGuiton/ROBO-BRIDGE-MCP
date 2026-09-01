# Placement stream contract and acceptance

## Contract

`PlacementLookaheadCoordinator` remains the single placement coordinator. It owns one logical stream, not a second controller or board authority. The shared `RobotController`, `BuildBoard`, and `RevisionClock` remain authoritative.

- A logical stream contains at most 5,000 placements.
- `plan_placement_queue` accepts at most 50 placements per `replace` or `append` chunk.
- Every streamed placement has a stable `placementId`.
- Exact append retries are idempotent; the same ID with different content is rejected.
- After `finalChunk: true`, exact retries remain idempotent but new placement IDs are rejected.
- At most five proposals and visible ghosts are active at once.
- `get_placement_stream_status` returns at most 50 entries per page and is read-only.
- `execute_next_placement` executes one proposal through the shared controller and requires the latest exact `worldRevision`. Its optional `maxExecutionWallMs` (50-120,000 ms) applies an in-page abort deadline through the same cancellation path.
- A streamed plan may carry a simulator `cycleTimeMs` from 250 to 60,000 ms. Successful single-placement results include the next proposal and exact revision for polling-free primitive chaining.
- The page UI may continuously consume an already planned stream with **RUN PLANNED CYCLE**. This bounded, cancellable simulator runner is not a WebMCP tool and does not change the primitive fourteen-tool surface.
- Mutating tools forward the WebMCP abort signal. Reset invalidates the current stream.

Lifecycle states are `PENDING`, `PLANNED`, `EXECUTING`, `COMPLETED`, `ADOPTED`, `BLOCKED`, `WAITING_SOURCE`, `WAITING_DEPENDENCY`, and `CANCELLED`.

Human reconciliation adopts compatible occupancy, blocks incompatible footprint/colour/yaw/connector occupancy without moving the human brick, reopens a satisfied placement when its brick is removed, and refills the active window. Reserved source movement triggers deterministic nearest-compatible reassignment. Source exhaustion waits and resumes when compatible bricks become available.

## Automated verification

The 2026-09-01 checkpoint passed:

- 137/137 JavaScript tests;
- 20/20 persistent reliability rounds;
- 59 JavaScript syntax checks;
- 4 Python syntax checks;
- required-file and legacy/Newton-absence checks.

The stream suite plans 2,000 placements while asserting an active bound of five. It also covers paging, idempotency, duplicate conflicts, source reassignment and recovery, human adoption and conflict, dependency reopening, stale target/source rejection before motion, abort cleanup with no late samples, reset invalidation, overlapping execution rejection, and five deterministic mixed runs.

## Native in-app browser acceptance

The native browser enumerated all fourteen tools from `http://127.0.0.1:8769`, including the three stream tools. It planned ten placements in two chunks, completed all ten through ten separate `execute_next_placement` calls, and ended with `counts: { COMPLETED: 10 }`, no remaining placements, and an empty active queue.

Planning reported 3.1 ms and 4.7 ms internally for the two chunks. Browser-host round trips were 4,280.1 ms and 3,169.8 ms.

For ten placements at 650 mm/s and 40x playback:

| Category | Median | p95 | Total |
| --- | ---: | ---: | ---: |
| WebMCP execution call round trip | 3,255.5 ms | 4,998.4 ms | 34,154.0 ms |
| Final status-read round trip | 2,352.9 ms | 2,826.7 ms | 24,851.9 ms |
| Accepted call to final verified status | 5,626.8 ms | 7,793.9 ms | 59,005.9 ms |
| In-page execution wall time | 278.8 ms | 315.6 ms | 2,840.4 ms |
| Physical-equivalent trajectory duration | 7,648.4 ms | 10,052.3 ms | 83,738.5 ms |
| Accelerated playback duration | 191.2 ms | 251.3 ms | 2,093.5 ms |

These categories are intentionally separate. Browser transport and post-action verification dominate the end-to-end observed time; accelerated simulation playback is not physical-time proof.

The native UI also placed a red brick as a human. Planning its exact occupied pose reconciled it as `ADOPTED` with `actor: human` and the actual brick ID. Planning blue at the same pose returned `BLOCKED` with `mismatch: ["colour"]`; the red human brick remained untouched. Moving a reserved source caused the active proposal to reassign to another compatible source.

After explicit approval, native `reset_workcell` advanced the world revision from 8 to 10, restored all twelve bricks to free state, left zero placed bricks, and made the prior stream return `stream_not_found`.

The native production-origin `execute_next_placement` tool was also called with `maxExecutionWallMs: 250`. It returned `reason: "cancelled"`; stream status reported `counts: { CANCELLED: 1 }`, zero active and remaining placements, and the robot was idle with no held brick. TCP and `worldRevision: 2` remained identical across two reads separated by 1.5 seconds, providing native no-late-sample evidence for the in-page deadline path.

## Remaining native limitation

- Browser-host cancellation propagation is not accepted. Both a WebMCP client timeout and interruption of the outer browser-control session allowed an active placement call to continue. The production in-page `maxExecutionWallMs` path is the accepted operational fallback; it does not prove that the host forwards its own abort signal.
- The simulator does not claim exact calibrated moving-link/table collision fidelity.
