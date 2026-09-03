# Pre-existing work and provenance

ROBO BRIDGE was informed by earlier private robotics-simulator work and by project-specific AI-assisted implementation packages produced during the challenge period.

The repaired release keeps only source required by the current ROBO BRIDGE architecture. The old separate SCARA runtime and NVIDIA Newton integration are not part of the current source state.

## Current source categories

| Area | Current role | Provenance status |
| --- | --- | --- |
| `apps/web/src/robot/` | UR10-class kinematics, controller, collision | project-authored/adapted implementation using published UR kinematic dimensions |
| `apps/web/src/bricks/` | generic unbranded 2×4 brick, inventory, authoritative board | project-authored/adapted |
| `apps/web/src/logo/` | compiler, machine-frame adapter, runtime | project-authored/adapted |
| `apps/web/src/perception/` | simulator-native projection and approximate visibility | project-authored/adapted |
| `apps/web/src/webmcp/` | primitive WebMCP bridge and tools | project-authored/adapted; no WebMCP implementation source vendored |
| `apps/web/src/render/` | project-owned Three.js workcell, attributed modified Sketchfab gripper, and articulated high-detail UR10 visual | project-authored/adapted renderer; Three.js r185 is MIT; gripper source is CC BY 4.0; UR10 visual geometry is derived from the attributed Universal Robots ROS 2 description mesh set |
| `tests/` and `scripts/` | current verification/release tooling | project-authored/adapted |

No RepRapFirmware source, LEGO-branded asset, ROS control path, Duet control path, or physical-robot command path is included. The repository includes a modified high-detail UR10-derived visual mesh locked to SHA-256 `f7a74be4b84726c2b073b7c1dd0a6b5549372ac6c30a6c1226c7cfe9d98a59f8`; original logos/branding were removed. The gripper is derived from **Articulated Robot** by Abdullah (`@abd_3d`) on Sketchfab under CC BY 4.0 and is modified for simulator use. See `ATTRIBUTIONS.md` and `THIRD_PARTY_NOTICES.md` for source links, licence information and modification statements.

Parts of the implementation were developed with OpenAI/ChatGPT assistance and project-specific AI-generated implementation packages, then reviewed, modified and integrated by the repository owner. This records development provenance and does not override any third-party licence obligations.

This file records the technical provenance boundary; it is not a legal opinion.
