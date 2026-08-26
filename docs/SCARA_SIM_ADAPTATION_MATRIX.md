# SCARA-SIM adaptation matrix

Use this file on the target PC when the private `stefanGuiton/SCARA-SIM` checkout is available.

## Source baseline to recheck

- Branch: `codex/phase1-benchy-lab`
- PR #1 head observed during foundation work: `e3ed10db526afa697cdd06cb8145a2d05a7a7a3d`
- Earlier checkpoint recorded in PR text: `596f32c4a4ac2e69a0136de126f21d900e0fc27f`

Do not trust these values after the branch changes. Pin the exact new review SHA before copying anything.

## Adaptation table

| Private source | Observed capability | ROBO-SIM-MCP target | Action | Risk |
|---|---|---|---|---|
| `Main_Simulator/index.html` | Procedural SCARA geometry | `apps/web/src/render/robot.js` | Compare proportions, bevels, fasteners, materials, and camera | Medium: large single file |
| `Main_Simulator/index.html` | XY/Z pointer manipulation | `apps/web/src/render/scene.js` | Compare hit volume, drag-plane mapping, thresholds, and cursor feedback | Low |
| `Main_Simulator/index.html` | PBR material controls | `apps/web/src/render/robot.js` | Port only measured visual improvements | Low |
| `Main_Simulator/index.html` | HDR/PMREM and lights | `apps/web/src/render/scene.js` | Compare light layout; keep procedural RoomEnvironment unless HDRI licence is proven | Medium: asset rights |
| `Main_Simulator/kinematics/rrf-scara-v8-adapter.js` | Fail-closed state pattern | `apps/web/src/core/robot-controller.js` | Preserve semantics, not RRF source | Medium: do not copy prohibited source |
| `Kinematics/src/scara-core/**` | Tested SCARA behaviour | `apps/web/src/core/scara.js` | Compare edge cases and add clean tests | Medium: licence/provenance boundary |
| `apps/benchy-render-lab/demo/js/photo-booth.js` | RectArea photo-booth lights | `apps/web/src/render/scene.js` | Port public-safe light arrangement and neutral tone choices | Low |
| `apps/benchy-render-lab/src/scene-manager.ts` | External scene-object seam | `apps/web/src/render/workcell.js` | Keep the same separation between external objects and robot | Low |
| `apps/benchy-render-lab/src/rendering/renderer-backend.ts` | Renderer capability seam | future renderer module | Defer unless required for browser compatibility | Low |
| `evidence/main-simulator/**` | Accepted screenshots and tests | `evidence/private-comparison/` | Use as comparison evidence only; do not publish private evidence by default | Medium |
| `Duet_ReprapFirmware/**` and `Kinematics/reference/**` | RRF reference source | none | Exclude from public repository | Critical |

## Required comparison outputs

Create:

- `evidence/private-comparison/visual-diff.md`;
- `evidence/private-comparison/control-diff.md`;
- `evidence/private-comparison/provenance.csv`;
- fixed screenshots for both apps;
- a decision for each candidate change: `COPY`, `REIMPLEMENT`, `DEFER`, or `EXCLUDE`.

## Rules

- Keep one authoritative controller.
- Do not copy a second IK solver into the renderer.
- Do not copy RepRapFirmware source.
- Do not copy private paths or machine configuration.
- Do not claim visual parity without fixed-camera evidence.
