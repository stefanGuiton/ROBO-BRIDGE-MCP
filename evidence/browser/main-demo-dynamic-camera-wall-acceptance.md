# MAIN_DEMO dynamic-camera wall acceptance

- Project: ROBO BRIDGE MCP MAIN_DEMO Player V8
- Date: 2026-08-31
- Branch: `codex/main-demo-v8-scene`
- Source base before checkpoint: `cb8346b31907ee4d8a498fa41b512d7f801ce7ba`
- Verification source fingerprint: `769159b8ef0368fc6682cc4a77b4ce511549720865ff2e4e66838a5fefc90038`
- Final verification timestamp (UTC): `2026-08-31T15:37:42.125635+00:00`
- Browser URL: `http://127.0.0.1:8769/?cameraAcceptance=1`
- Physical hardware contacted: no; local simulation only

## Automated verification

- Full JavaScript suite: 109/109 passed.
- Persistent production reliability: 20/20 passed.
- JavaScript syntax checks: 56 passed.
- Python syntax checks: 4 passed.
- Required-file and removed-runtime checks: passed.
- `git diff --check`: passed; Git reported only expected LF-to-CRLF checkout warnings.

## Native WebMCP wall build

The in-app browser exposed 11 native tools through `document.modelContext`. The wall was built exclusively through the primitive Cartesian tool surface: state reads, placement previews, `move_tool`, `latch`, and `unlatch`. No scripted build shortcut or joint command was used.

1. Reset the deterministic local workcell at world revision 0; reset completed at revision 1.
2. Selected three reachable loose bricks from the structured scene: `v8-brick-0` (red), `v8-brick-1` (blue), and `v8-brick-10` (red).
3. Placed the two base bricks on adjacent mat cells at `(700, -216, 8.6)` and `(732, -216, 8.6)` mm.
4. Previewed the top brick with the exact anchor `supportBrickId=v8-brick-0`, `supportSide=R`, `carriedSide=L`.
5. The preview returned two support groups and five matching studs, including support from both base bricks.
6. The robot picked, transported, and released the top brick at `(708, -208, 18.2)` mm as a `brick-connection` placement.
7. Final build state recorded three agent contributions, no held brick, and the robot idle. The arm then returned to `(670, 0, 145)` mm to clear the inspection view.

The completed build reached world revision 1240; the clear-arm verification view reached revision 1296.

## Camera acceptance

The placed-brick bounds produced a common camera target of approximately `(720, -216, 13.4)` mm for canvas, top, left, and right inspection cameras.

- Top camera detected all three placed bricks, with none clipped.
- Canvas camera detected all three placed bricks, with none clipped.
- Left and right cameras centred the wall silhouette; expected view-dependent occlusion remained.
- Browser-visible TOP, LEFT, and RIGHT snapshot controls rendered the wall around the centre of their preview frames.
- The first top snapshot was intentionally taken while the TCP was directly above the wall and showed the physical arm occluding it. Returning the arm home exposed the wall, confirming the rendered snapshot is the real shared scene rather than a synthetic image.

## UI acceptance

- The placement angle/status pills occupy the bottom-centre HUD area.
- The crosshair remains at the viewport centre.
- The MORE BRICKS label uses the Impact/Haettenschweiler fallback stack and is rotated 90 degrees anticlockwise on the physical button.
- Observed browser frame timing varied with tooling and open debug/settings overlays. This is not a certified 120 FPS result.

## Verdict

PASS for locally testable dynamic-camera centring, exact multi-support bridge placement, native primitive WebMCP wall construction, and browser-visible inspection. Native WebMCP proof applies to this supported in-app browser session only.
