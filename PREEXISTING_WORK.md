# Pre-existing work and provenance

LOGO ROBO was informed by earlier private robotics-simulator work and by Oracle implementation packages produced for this project during the challenge period.

The repaired release keeps only source required by the current LOGO ROBO architecture. The old separate SCARA runtime and NVIDIA Newton integration are not part of the current source state.

## Current source categories

| Area | Current role | Provenance status |
| --- | --- | --- |
| `apps/web/src/robot/` | UR10-class kinematics, controller, collision | project-authored/adapted implementation using published UR kinematic dimensions |
| `apps/web/src/bricks/` | generic unbranded 2×4 brick, inventory, authoritative board | project-authored/adapted |
| `apps/web/src/logo/` | compiler, machine-frame adapter, runtime | project-authored/adapted |
| `apps/web/src/perception/` | simulator-native projection and approximate visibility | project-authored/adapted |
| `apps/web/src/webmcp/` | primitive WebMCP bridge and tools | project-authored/adapted; no WebMCP implementation source vendored |
| `apps/web/src/render/` | project-owned procedural Canvas renderer | project-authored/adapted |
| `tests/` and `scripts/` | current verification/release tooling | project-authored/adapted |

No RepRapFirmware source, manufacturer robot mesh, LEGO-branded asset, ROS control path, Duet control path, or physical-robot command path is included.

Before a public challenge release, the repository owner must confirm that all project-authored/adapted Oracle contribution material is cleared for redistribution. This file records the technical provenance boundary; it is not a legal opinion.
