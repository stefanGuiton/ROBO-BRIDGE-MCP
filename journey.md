# P0 EASY Terrain Integration Journey

## Scope

This checkpoint follows `Downloads/PLAN_Integrate Curated EASY Terrain into the Production Bridge MAIN_DEMO.md` and uses the accepted Oracle package at `Downloads/ORACLE_TERRAIN_CHALLENGE_V1(1).zip`.

- Base branch: `codex/p0-bridge-mvp`
- Base commit: `69b970bb3b341c44959fade7135d6cd07b6bd83e`
- Working branch: `codex/p0-final-integration`
- Integrated preset: `EASY` only
- Explicitly deferred: CHALLENGING runtime selection, train, mission, PartRegistry, physical bridge construction, terrain polish, and deployment

## What changed

- Imported the accepted curated terrain loader, material, transforms, collision proxy, ChallengeService, and exact GLB into `apps/web`.
- Added one MAIN_DEMO EASY adapter that owns the shared terrain/ENTRY/EXIT/route/bridge placement relationship.
- Mounted the terrain into the existing Three.js scene without adding a renderer or animation loop.
- Passed conservative terrain bank proxies into the existing player collision solver.
- Replaced the temporary bridge transform with the authoritative EASY challenge transform.
- Kept the existing BridgeHost, BuildBoard, RobotController, RevisionClock, placement stream, player, and single WebMCP registrar.
- Calibrated the Aqueduct to `4/3/2` arches so the accepted EASY span remains compatible with MAIN_DEMO brick scale.
- Made `reset_bridge_design` return to that calibrated MAIN_DEMO preset.
- Rotated the complete EASY challenge `-90 degrees` around the bridge/corridor centre so terrain, bridge, ENTRY, EXIT, train route, bounds, and collision proxies continue to share one transform authority.
- Removed the renderer-only TCP point/ring while preserving authoritative TCP, gripper, robot, and WebMCP state.
- Disabled Space/Ctrl vertical movement and locked normal player motion to the configurable `playerEyeHeightMm` height.

## Authoritative transforms

- Challenge display offset: `(-170, 0, +4) mm`
- Terrain display transform:
  - position: `(-198.8, -13.2, 1194.9370560646057)`
  - quaternion: approximately `(0.70710678, 0, 0, 0.70710678)`
  - scale: `(360, 144, 360)`
  - challenge yaw: `-90 degrees`
- Bridge world transform:
  - translation: `(650, -111.2, 0) mm`
  - yaw: `0 degrees`
  - scale: `2`
- ENTRY: `(513.2, -111.2, 56) mm`
- EXIT: `(786.8, -111.2, 56) mm`
- Physical span: `273.6 mm`, running along MAIN_DEMO X
- Standard `1x2x1` hologram brick: `32 x 16 x 9.6 mm`

The X offset moves the accepted bridge centre from X=820 mm to X=650 mm. The +4 mm Z offset moves the whole challenge coherently above the existing mat/stud envelope; it is not a per-subsystem correction.

## Verification record

- Exact terrain GLB SHA-256: `66bd021d4d8f226a563a219b718776ad8be5f9cdb0110d2d2808c1d4288daaf6`
- JavaScript: `153/153`
- WebMCP: `15/15`
- Robot: `30/30`
- Player: `26/26`
- Compiler: `26/26`
- Reliability: `20/20`
- `npm run verify`: PASS
- Native browser tools: `19` total (`14` existing + `5` bridge)
- Browser console warnings/errors: `0`
- Native WebMCP visual mutation:
  - initial `4/3/2`, revision 1, `bp_6a45b6bc`, 131 parts
  - changed `3/3/2`, revision 2, `bp_1b886868`, 137 parts
  - reset `4/3/2`, revision 3, `bp_6a45b6bc`, 131 parts

Browser evidence is under `output/playwright/p0-final-integration/`. The most useful views are:

- `08-easy-unobscured-hologram.png`
- `10-easy-unobscured-changed.png`
- `11-easy-unobscured-restored.png`

## Acceptance observations

- EASY terrain loads and the bridge deck/track crosses the ravine along the ENTRY/EXIT direction.
- The rotated terrain now uses more of the table width while all challenge-derived transforms and collision banks remain aligned.
- The bridge remains Z-up and uses the production MAIN_DEMO brick dimensions.
- The bridge centre and both endpoints remain inside the production Cartesian tool limits exposed by WebMCP. This is a positioning observation, not proof that every future physical BuildPlan placement is robot-reachable.
- Player UI and the existing robot/build controls remain present; the player and robot suites pass unchanged.
- Space and Control no longer change player Z; the fixed height is intentionally adjustable through `Player Eye Height mm`.
- The yellow TCP point and cyan ring are gone; the real gripper visual and authoritative TCP telemetry remain.
- The accepted EASY deck is low relative to the full three-tier Aqueduct at MAIN_DEMO brick scale, so lower tiers extend below the existing solid tabletop. The exact hologram is therefore rendered as an unobscured translucent overlay for this visual-design MVP. Physical bridge construction remains intentionally unimplemented and must validate support/elevation in the next task.

## Publication boundary

Only production integration files, tests, the exact GLB, and this journey are intended for the commit. Existing Blender/terrain experiments and the supplied `Downloads/` artifacts are user-owned and must remain unstaged.
