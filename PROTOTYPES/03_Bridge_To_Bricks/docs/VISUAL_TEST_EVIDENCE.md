# Live visual inspection evidence

Date: 2026-08-30

Surface: Codex in-app browser, `http://127.0.0.1:4179/`

Theme: light only

## Observed views

| View | Result | Browser telemetry observed during inspection |
|---|---|---|
| Original 2D graph | Warren nodes and alternating truss members were visible and preserved the source elevation | 4 draw calls, about 95 FPS |
| Extruded structure | Left/right structures, deck, rail supports and cross-members rendered | visually checked through the clearance composite |
| Vehicle clearance | Translucent dashed central volume remained visibly free above the deck/rail floor | 5 draw calls, about 91 FPS |
| Occupancy / stud grid | Integer cells rendered as one instanced coloured structure | 3 draw calls, about 112–120 FPS |
| Final bricks | Brick bodies and studs rendered with phase colours and visible part boundaries | 4 draw calls, about 120 FPS |
| Structural-member groups | Stable member groups rendered with deterministic per-member colours | 4 draw calls, about 113 FPS |
| Build dependency / order | Phase colours matched the foundation → rail legend after visual iteration | 4 draw calls, about 119–120 FPS |

The browser FPS values are short live observations, not a controlled benchmark and not a minimum-performance claim. The Node compiler measurements are in `PERFORMANCE_RESULTS.md`.

## Fixture interaction

- Warren compiled live to 294 placements / 1,561 occupied cells with checksum `301446f2`.
- Arch fixture switching recompiled live to 264 placements / 1,491 cells with checksum `c3e796e8`.
- Both displayed all five validation checks as passed.
- Browser console inspection returned no warnings or errors after the vendored Three.js dependency set was completed.

## Iterations prompted by visual inspection

1. The first page load exposed a missing `three.core.js` sibling; the exact local vendored file was added without weakening npm TLS.
2. Instanced bricks initially rendered black; the renderer now uploads instance colours explicitly and avoids the incompatible vertex-colour material flag.
3. The first dependency palette compressed phases into similar greens; it now uses explicit colours matching the visible phase legend.
