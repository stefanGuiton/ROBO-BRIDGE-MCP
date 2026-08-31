# MAIN_DEMO V8 native WebMCP wall acceptance

- Project: ROBO BRIDGE MCP MAIN_DEMO Player V8
- Date: 2026-08-31 (Europe/London)
- Branch: `codex/main-demo-v8-scene`
- Base Git HEAD: `e192aec4333b50c8d601ebb972be755476778d36`
- Source state: uncommitted implementation checkpoint based on the SHA above
- Browser: Codex in-app browser
- URL: `http://127.0.0.1:8769/`
- Hardware boundary: local simulation only; no robot, ROS, Duet, or machine controller contacted

## Native discovery

The browser-native WebMCP capability enumerated all 11 production tools. This was not page-side registration emulation.

The wall workflow used only:

- `get_scene_state`
- `get_robot_state`
- `get_workspace`
- `preview_placement`
- `move_tool`
- `latch`
- `unlatch`

No joint command, hidden build command, scripted playback tool, or renderer-owned state was used.

## Result

Codex selected three bricks from returned authoritative scene data. Each brick had a validated pickup TCP, safe approach TCP, and lift TCP. The live UR10 performed approach, pickup, latch, vertical lift, transfer, validated descent, unlatch, and retreat for every brick.

Final accepted placements:

| Brick | Colour | Machine position (mm) | Placement |
|---|---|---:|---|
| `v8-brick-0` | red | `700, -216, 8.6` | mat root |
| `v8-brick-1` | blue | `732, -216, 8.6` | mat root |
| `v8-brick-10` | red | `708, -208, 18.2` | brick connection |

The top brick was previewed with five stud matches and committed across two support connections. The final robot state was empty-handed at TCP approximately `707.97, -207.98, 400.00` mm. The shared world revision ended at `1239`.

## Browser evidence

- Native tool calls: PASS
- Visible robot motion: PASS
- Shared placement state: PASS
- Structured final scene read: PASS
- Console warnings/errors: 0
- HUD timing after completion: 120 FPS / 8.33 ms mean frame
- Screenshot: `evidence/browser/main-demo-v8-native-webmcp-wall.png`

The frame-rate reading is observed browser timing, not a certified 120 FPS guarantee across all hardware.

## Automated corroboration

- `npm run test:js`: 107 passed, 0 failed, 0 skipped
- `npm run test:reliability`: 20/20 passed
- `npm run verify`: PASS, including 56 JavaScript syntax checks, 4 Python syntax checks, required-file checks, and removed legacy/Newton-path checks

Native cancellation was not repeated during this visible wall build. Abort forwarding and cancellation remain covered by the automated WebMCP/controller tests and should be repeated in the final submission browser session.
