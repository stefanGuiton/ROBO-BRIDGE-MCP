# Robot-arm structure showcase

Open `http://127.0.0.1:8769/?showcase=robot-basics` to load a deterministic supply of twelve reachable blue bricks and twelve reachable red bricks. Normal demo inventory is unchanged when the query parameter is absent.

## Supported requests

The page-side deterministic planner accepts these bounded structures:

| Natural-language example | Planner specification | Placements |
| --- | --- | ---: |
| Pick up and place the red brick | `{ structure: "single", colour: "red" }` | 1 |
| Build a blue wall three bricks wide and four blocks tall | `{ structure: "wall", colour: "blue", width: 3, height: 4 }` | 12 |
| Build a red tower five blocks/layers tall | `{ structure: "cross_laminated_tower", colour: "red", width: 2, height: 5 }` | 10 |

The tower uses two parallel bricks per layer. Each new layer rotates ninety degrees, producing five alternating cross-laminated layers. Wall rows and tower layers include explicit dependency barriers so an upper layer cannot enter the active execution window early.

Plans are deterministic for the same specification and workcell profile. They include stable placement IDs, a design checksum, exact colour requirements, inventory shortfall reporting, build-zone/workspace validation, support relationships, and Cartesian placement records ready for `plan_placement_queue`.

## Codex and WebMCP flow

The planner does not add an instant-build WebMCP tool. Codex converts the requested structure into explicit Cartesian placements and submits them through the existing read-only `plan_placement_queue`. The plan may include `cycleTimeMs` from 250 to 60,000 ms; the showcase default is 1,000 ms.

For agent-stepped operation, Codex calls the mutating `execute_next_placement` once per brick. Each successful result now includes `nextProposal` and the exact next `worldRevision`, so callers do not need a status-read round trip between bricks.

For a continuous demonstration, open **Settings → Shared UR10 Controls** and press **RUN PLANNED CYCLE** after the WebMCP plan is ready. This page-local, human-started runner consumes only the already validated Cartesian stream and can be stopped at any time. It uses the same controller, board, cancellation, collision, dependency, and occupancy authorities. It is intentionally not registered as a WebMCP build/playback shortcut.

Use `get_placement_stream_status` when inspection is needed to inspect `PLANNED`, `WAITING_DEPENDENCY`, `COMPLETED`, or blocked records. It is no longer required between successful agent-stepped placements. Use `reset_workcell` only when the current build can be discarded.

The planner supports one to twelve wall bricks across, one to twenty layers, and at most fifty placements per generated showcase plan. The cross-laminated tower is intentionally fixed at two bricks per layer. Available colours are `white`, `black`, `red`, `blue`, `yellow`, `green`, `orange`, `purple`, and `teal`; the showcase inventory guarantees only red and blue counts.
