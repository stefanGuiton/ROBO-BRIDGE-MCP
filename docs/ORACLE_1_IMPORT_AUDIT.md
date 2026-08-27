# Oracle 1 import audit

Date: 2026-08-27
Source: `D:\ROBO-SIM-MCP\downloads from oracle\LOGO_ROBO_ORACLE_1_UR10_MANIPULATION\LOGO_ROBO_ORACLE_1`
Source base SHA: `09e323b5fa44b80dcbac38c97440962bed13811a`
Integration checkpoint: LOGO ROBO Oracle 1 UR10 manipulation slice

## Verdict

**Integrated with adaptation.** Oracle 1 is a compatible implementation of the P2 Cartesian UR10 manipulation milestone in `MASTER_PLAN.md`. The source package itself reports `PARTIAL`: it was produced without a normal GitHub clone in the Oracle VM, so `ORACLE_1.patch` is an additive fallback package rather than a trusted repository diff. Its source, tests, and evidence were therefore treated as review material and re-run from the current checkout.

The existing SCARA/WebGL/Newton foundation remains in the repository. The default browser entry now presents the LOGO ROBO Oracle 1 vertical slice, while the previous SCARA entry point remains available through `apps/web/src/main.js` and its existing modules. No source under `D:\SCARA-Simulator` was changed.

## Imported and adapted components

| Oracle 1 capability | Current project path | Decision | Adaptation/provenance |
| --- | --- | --- | --- |
| Matrix, DH, finite-value, distance, and rotation helpers | `apps/web/src/robot/math.js` | Reusable now | Adapted as dependency-free ES modules. |
| UR10 DH definition, fixed-down tool, limits, home pose, challenge layout | `apps/web/src/robot/ur10-definition.js` | Reusable now | Uses published Universal Robots dimensions; no manufacturer mesh or logo is included. |
| Workspace validation | `apps/web/src/robot/workspace.js` | Reusable now | Preserves fail-closed bounds and explicit failure reasons. |
| DLS FK/IK with multi-seed search, limits, and branch continuity | `apps/web/src/robot/kinematics.js` | Reusable now | Kept as the browser kinematics authority; Newton does not duplicate it. |
| Cartesian controller, interpolation, cancellation, revisions | `apps/web/src/robot/controller.js` | Reusable now | Adapted to the project layout, brick state, board adapter, and shared API. Rejected moves do not mutate accepted TCP/joints. |
| Table/tray/board/brick collision checks | `apps/web/src/robot/collision.js` | Reusable now | Preserves the bounded Oracle 1 collision model. Full robot-link self-collision is still a later task. |
| Generic unbranded 2x4 specification | `apps/web/src/bricks/brick-spec.js` | Reusable now | Challenge-safe generic geometry; no LEGO marks or assets. |
| Deterministic latch and rigid attachment | `apps/web/src/bricks/latch.js` and `apps/web/src/robot/controller.js` | Reusable now | Capture tolerances are explicit and tested. |
| Board snap adapter | `apps/web/src/bricks/board-adapter.js` | Reusable now | Deliberately remains a fixture seam until the compiler/board work from later Oracle packages lands. |
| Procedural workcell renderer | `apps/web/src/render/robot-renderer.js` | Reusable now, bounded | Adapted from the Oracle Canvas renderer and fixed its ghost-colour conversion path. It is a reliable vertical-slice renderer, not a replacement claim for the retained premium Three.js renderer. |
| Oracle 1 browser shell and controls | `apps/web/index.html`, `apps/web/logo.css`, `apps/web/src/logo/main.js` | Adapted now | The shell was rewritten around the current project API, with manual Cartesian controls, latch/release, views, diagnostics, and the shared controller. The standalone Oracle page was not copied wholesale. |
| Primitive WebMCP surface | `apps/web/src/webmcp/register-logo-tools.js` | Adapted now | Uses `document.modelContext.registerTool`, structured objects, JSON Schemas, read-only annotations, and discovered/executing/succeeded/rejected diagnostics. |
| Kinematics/controller/latch/reliability tests | `tests/js/robot-*.test.js`, `tests/js/latch-collision.test.js`, `tests/js/reliability.test.js` | Adapted now | Re-run directly in the current checkout because this managed Windows environment blocks Node test workers with `spawn EPERM`. |
| Workspace/reliability/performance scripts | `scripts/qualify_workspace.mjs`, `scripts/reliability.mjs`, `scripts/performance_check.mjs`, `scripts/verify_oracle1.mjs` | Adapted now | Root-relative scripts generate current evidence under `evidence/oracle1/`. |

## Deliberately not copied

- The Oracle standalone repository snapshot, patch metadata, and its duplicate package manifests were not merged over the current repository.
- The Oracle standalone page did not replace the retained SCARA foundation modules or physics service.
- No RepRapFirmware source, Duet integration, ROS control, physical-robot command path, manufacturer robot mesh, or branded brick asset was copied.
- Oracle 1’s fixture board adapter was not presented as the final image compiler or perception system.

## Verification performed

The adapted source passed the direct-module focused suite:

- 6 UR10 kinematics tests;
- 5 controller tests;
- 6 latch/collision tests;
- 1 complete pick/place reliability test;
- 2 primitive WebMCP contract tests.

The generated qualification evidence reports:

- workspace: 1,000/1,000 samples passed;
- mean position error: 0.0194 mm;
- p95 position error: 0.0680 mm;
- maximum position error: 0.0798 mm;
- reliability: 50/50 complete trials passed;
- local planning benchmark: maximum segment planning time about 186 ms.

See `evidence/oracle1/workspace-qualification.json` and `evidence/oracle1/reliability-results.json` after the integration verification run. These results do not certify 120 FPS or prove a hosted/live WebMCP browser session.

## Licence and provenance

The Oracle package contains no third-party dependency installation and no copied RepRapFirmware source. The UR10 DH values are attributed in source to the public [Universal Robots DH parameters documentation](https://www.universal-robots.com/articles/ur/programming/forward-and-inverse-kinematics/). The visual is procedural and generic. The retained project licence/provenance boundary remains documented in `PREEXISTING_WORK.md` and `THIRD_PARTY_NOTICES.md`.

## Remaining limitations and next boundary

This checkpoint proves the robot manipulation foundation, not the full LOGO ROBO challenge product. The remaining bounded work includes compiler-generated boards, simulator-native perception/overlays, red/blue multi-brick scenarios, Co-Build/Race state, richer obstacle/self-collision validation, and fresh real-browser WebMCP acceptance. Newton remains an optional physics validator and must not replace the browser’s authoritative UR10 kinematics.
