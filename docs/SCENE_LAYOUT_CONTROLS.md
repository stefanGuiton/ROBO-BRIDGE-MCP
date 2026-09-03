# Final scene layout controls — 2026-09-03

Publication target: `codex/p0-downstream-integration-prep`; parent HEAD `ea7616574e99371db8cbccff6346bbc847d533f5`. User requested this checkpoint be pushed to existing draft PR #6. No merge or PR retarget.

Scope: `Downloads/CODEX_FINAL_SCENE_LAYOUT_CONTROLS_ADDENDUM.md`. The user deferred jaw/release-clearance work. Unfinished changes from that interrupted experiment were removed; existing collision behaviour and the 391.334916 mm travel plane are unchanged.

## Controls

Refresh MAIN_DEMO at `http://127.0.0.1:8774/`, open **Settings → Scene Layout**.

- Table yaw: −180..180°, default unchanged at 0°. Rotates the existing workbench root and its table/leg proxy bounds. Reset BUILD before rotating, so frozen physical support cannot change mid-build.
- Robot base X/Y/Z: offsets in the fixed machine/world millimetre frame, defaults 0/0/0. Limits: X ±300, Y ±350, Z −100..200 mm. These are calibration offsets from the existing base, not a new coordinate system.
- Robot base yaw: −180..180°, default 0°. Existing workspace/collision checks can reject a setting at the current robot posture. Finish/cancel motion and release any held part before calibration.
- All values use the existing settings persistence. The old whole-world `robotMount*` controls are hidden and protected at runtime; they are not the new base sliders.
- **MORE BRICKS**: available in the construction toolbar and settings. Start BUILD first. Each click activates up to six unused matching sources from the frozen plan's shared inventory, using the existing feeder allocator. A full feeder/exhausted warehouse returns a truthful zero-add result. No target, accepted-placement, Mission-completion or Train-support mutation.

## Authority and checks

RobotController owns the base matrix in its existing robot definition. FK starts at that matrix; IK uses unchanged world targets and base-local reach limits. Renderer link matrices, gripper transform, robot diagnostic envelopes and collision FK use this same definition. Calibration is an idle simulation edit, not a robot motion command. No workspace widening, additional controller, board or registrar. The existing conservative link model is retained: this is not an exact moving-link/table mesh fidelity claim.

The bridge, Terrain7, ENTRY/EXIT, world display root, frozen BuildPlan and BuildBoard coordinates remain unchanged. New source allocation reserves bridge/track retreat columns, route bounds, terrain proxies and current table bounds; existing source IDs are not duplicated.

## Acceptance

- Targeted tests: 4/4 PASS. Includes persistent controls, rotated table bounds, FK/render/IK/collision alignment, fixed target identity, a real first Terrain7 placement after translated/yawed base calibration, reset yaw consistency, bounded shared refill and stale-revision rejection.
- Browser: PASS, separate headless Chrome 148 on real MAIN_DEMO. Five sliders found; table 90° and base X +15 mm changes persisted through reload; bridge/world identities unchanged. Defaults restored in the isolated browser, BUILD started, refill added six sources (8 → 14), accepted count stayed 0/303, 27 tools remained registered. Zero console errors and zero warnings. No screenshots or changes to the user's open tab.
- Full verification: `npm run verify` PASS — 365/365 JavaScript tests, 20/20 reliability trials, 156 JavaScript and 4 Python syntax files; required-file and removed-legacy checks PASS. One old UI assertion was updated to expect protected legacy world-mount fields and the replacement Scene Layout controls.
- VISUAL: USER-VERIFY PENDING. No visual optimization performed; user will supply preferred defaults.

Known end-to-end limitation remains the previously recorded 46/303 release collision. This UI checkpoint does not establish Train CROSSED, Mission COMPLETE, hero:1 or hero:3.
