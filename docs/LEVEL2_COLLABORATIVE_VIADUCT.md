# Level 2 — collaborative Viaduct, no Train

Select **2 · VIADUCT (NO TRAIN)**, or open `/?demo=bridge&level=2`.
Level 1 remains Simple Bricks. Level 3 is an explicit experimental opt-in until its separate acceptance gate passes.

## One authoritative build

The existing BridgeHost compiles the live BridgeSpec. DESIGN changes use the existing five bridge tools; BUILD freezes that exact current plan. Both actors draw from the existing shared inventory and satisfy the same BuildBoard through PlacementAuthority. No actor-specific part permissions or second board/controller/registrar exists.

The collaboration layer classifies the exact rendered part centre in the bridge's local lateral axis, using the inverse of the authoritative world transform:

- Negative side: Human suggestion.
- Positive side and centreline: Codex suggestion.
- `actorHint` prefers a side among eligible targets; it never overrides dependencies or forbids the other actor. If no preferred target is eligible, a compatible opposite-side target may be selected with explicit fallback metadata.

Current four-arch Viaduct has 276 parts (261 standard, 12 ARCH_B, 3 track segments); its suggestions are 91 Human and 185 Codex. These counts are derived, not configuration constants. All non-zero part classes remain usable by either actor.

## WebMCP and timing

The single native registrar exposes 31 unique tools across the demo. Existing `build_next_parts` accepts bounded `count: 1..5`, optional `actorHint: "human" | "agent"`, and optional `cycleTimeMs: 250..60000`. It forwards revisions and cancellation through Mission, ConstructionService, the existing logical stream and cycle runner. Level 1 keeps its separate 1000ms minimum.

The full bridge test requests 300ms cycles. This is a start-to-start target, not permission to shorten safe motion. Record actual intervals/overruns; do not describe a requested target as measured performance.

Default execution remains real simulator robot motion. The existing explicit `executionMode: "simulated_fast_forward"` can finish bounded remaining deterministic targets after a recorded fail-closed robot collision. It is not robot-motion or collision acceptance. Read progress separately as `human`, `robot`, and `simulated_fast_forward`; total agent contributions include the last two and must not be relabelled “robot placements”.

## Exact visual and level boundaries

The hologram still comes from the current exact BuildPlan. Its shared-geometry depth prepass hides internal surfaces while retaining arch openings, track materials and placement identity. Accepted current-plan targets are removed from the pending hologram and drawn by the normal solid-part renderer. Target picking uses a camera-excluded raycast layer, preventing a duplicate ghost bridge. Side labels derive from the same bridge/world transform.

Depth prepass adds draw work: the initial measured scene went from 110 to116 calls and448741 to453265 triangles, with approximately8.33ms frame intervals in both samples. This is a clarity improvement, not a measured performance improvement.

Level 2 does not construct the Train service, physics, renderer root or frame subscription. `test_bridge` rejects before Mission mutation. Train test suggestions are removed from Level2 state/error advice. Switching between bridge levels preserves the frozen plan and board; opting out disposes the existing Train subsystem.

## Repeatable evidence

Run `npm run level2:browser -- --write-evidence` against the local demo server. Without the flag the harness does not write evidence. Optional `ROBO_LEVEL2_OUTPUT` selects a separate run directory; `--no-fast-forward-fallback` requires a robot-only completion.

The harness uses a supported browser's native WebMCP testing API, not a production shim. Test-Human placements are explicitly simulated and use normal HumanBuildAdapter pickup/preview/release. They are not claimed as real pointer input. Level1 has separate actual pointer acceptance.

The journey changes four/five arches and opening width, restores/freeze the current four-arch plan, records real robot and custom-arch motion, completes the shared board, and asserts no Train. It retains raw console evidence, with exact intentional abort-probe exceptions distinguished from unanticipated runtime exceptions. Main and independent reviewers must open the generated images before visual acceptance. Current checkpoint status and exact evidence paths are maintained in `LAUNCH_READY_PROGRESS.md`.
