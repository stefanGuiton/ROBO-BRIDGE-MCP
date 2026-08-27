# Oracle 2 import audit

Date: 2026-08-27
Source: `D:\ROBO-SIM-MCP\downloads from oracle\LOGO_ROBO_ORACLE_2_COMPILER_GAME\LOGO_ROBO_ORACLE_2`
Source base SHA: `09e323b5fa44b80dcbac38c97440962bed13811a`
Integration checkpoint: LOGO ROBO compiler and compiler-game foundation

## Verdict

**Integrated with adaptation.** Oracle 2 supplies the P4 compiler and P7/P8 compiler-game foundation described by `MASTER_PLAN.md`. Its report says the subsystem is PASS but delivery compliance is PARTIAL: the package is a runnable snapshot plus an apply-ready patch, not a normal repository clone or a trusted Git diff. The source, tests, and scripts were therefore inspected and re-run from the supplied snapshot before integration.

The integration is deliberately additive. The Oracle 1 UR10 controller remains the only accepted robot-state authority. The compiler produces immutable target data; it does not move the robot, own renderer state, or create a second kinematics implementation.

## Imported and adapted components

| Oracle 2 capability | Current project path | Decision | Adaptation/provenance |
| --- | --- | --- | --- |
| Project-owned six-colour OKLab palette | `apps/web/src/logo/palette.js` | Reusable now | Added as dependency-free ES module. Colours are project data; no branded palette or asset was copied. |
| Stable Blueprint IDs, target mapping, and invariants | `apps/web/src/logo/blueprint.js` | Reusable now | Added unchanged in behaviour. World poses are generated data and remain separate from accepted robot state. |
| Integral-image compiler, contain/cover fit, alpha handling, mixed-edge voting, candidate scoring | `apps/web/src/logo/compiler.js` | Reusable now | Added as the deterministic compiler boundary. It validates dimensions and budgets without silently accepting an empty or invalid image. |
| Browser image decode boundary | `apps/web/src/logo/image-loader.js` | Reusable now | Added with PNG/JPEG/WebP and pre-decode dimension/pixel limits. Full browser decode qualification remains a separate gate. |
| Synthetic compiler patterns and browser debug lab | `apps/web/src/logo/patterns.js`, `apps/web/src/logo/compiler-debug.js`, `apps/web/compiler.html`, `apps/web/compiler.css` | Reusable now | Added as a standalone local lab at `/compiler.html`; it does not replace the default UR10 manipulation page. |
| Generic 2x4 specification | `apps/web/src/bricks/brick-spec.js` | Adapted now | Preserved Oracle 1's capture, height, and radians fields. Added Oracle 2's type, logical-cell, height alias, degrees, and board-limit fields as a compatible superset. |
| Deterministic inventory and no-overlap spawning | `apps/web/src/bricks/inventory.js` | Reusable now | Added with seeded Mulberry32 jitter and exact per-colour counts. |
| Immutable target/occupancy/claim board state | `apps/web/src/bricks/build-board.js` | Reusable now | Added as compiler-game state. Its `trySnapBrick` contract is separate from Oracle 1's controller-facing `BoardAdapter`; no existing controller API was overwritten. |
| Co-Build claims, conflicts, progress, corrections, and replans | `apps/web/src/game/co-build.js` | Reusable now | Added as a shared-board game model; claims are metadata and do not physically lock a target. |
| Race mode and deterministic winner/tie rules | `apps/web/src/game/race.js` | Reusable now | Added with separate occupancy boards sharing one immutable Blueprint. |
| Deterministic scoring | `apps/web/src/game/scoring.js` | Reusable now | Added as pure score calculation over game state. |
| Compiler, inventory, board, and game tests | `tests/js/logo-*.test.js` | Reusable now | Added and re-run directly in the current checkout. |
| Randomized invariants, benchmark, and manual-flow scripts | `scripts/run_randomized_invariants.mjs`, `scripts/run_logo_benchmarks.mjs`, `scripts/run_logo_manual_flow.mjs` | Reusable now | Added root-relative scripts; optional output paths preserve machine-readable evidence. |
| Oracle 2 verification wrapper | `scripts/verify_oracle2.mjs` | Adapted now | Added to run focused modules in one process and write evidence under `evidence/oracle2/`. |

## Deliberately not copied

- The Oracle 2 standalone `apps/web/src/core/` compatibility reconstruction was not merged over the retained foundation.
- The duplicate old `apps/web/src/webmcp/register-tools.js` and duplicate server helper were not copied; the current project already has its own retained SCARA path and Oracle 1 LOGO ROBO WebMCP path.
- The Oracle 2 package manifest was not used to downgrade the current package or replace existing scripts. The root manifest was extended with compiler/game commands.
- Oracle 2 screenshots, upload fixtures, raw logs, patch metadata, and the supplied snapshot were not copied into the application. The original package remains under `downloads from oracle` as review evidence and is intentionally untracked.
- No compiler output was wired directly into the Oracle 1 physical board yet. Oracle 2 uses a centred 480 x 320 mm logical board, while the current Oracle 1 fixture board has a different challenge layout and controller-facing snap contract. A bridge must explicitly reconcile those coordinate and state contracts.
- No WebMCP compiler/game tools were added in this import. The existing seven-tool Oracle 1 surface remains authoritative until the browser state bridge is implemented.
- No Newton code was added. Newton remains the separate physics boundary and must not duplicate the compiler or browser kinematics.
- No source under `D:\SCARA-Simulator` was changed, and no RepRapFirmware, Duet, ROS, physical-robot, manufacturer mesh, or branded brick source was copied.

## Verification of the supplied package

The supplied Oracle 2 snapshot was executed before integration:

- 27 focused JavaScript tests: pass;
- randomized compiler/invariant run: 1,000/1,000 pass;
- manual compiler/game flow: pass, including six placements and deterministic reset;
- compiler benchmark script: pass, compiler-only, decode excluded;
- supplied package contained no normal Git clone, so its reported Git/base relationship is provenance metadata rather than an independently verified diff.

The same focused modules pass after integration. The current repository's full verification is the authoritative acceptance record and is written to `evidence/foundation-verification.json`; compiler/game-specific results are written to `evidence/oracle2/`.

## Licence and provenance

The imported compiler/game code has no runtime dependency installation and the package contains no third-party source or licence notice that would grant additional redistribution rights. It is treated as project-owned implementation material supplied for this private repository, not as a third-party library. The project remains generic and simulation-only. Any future use of external image assets, palettes, robot meshes, or branded construction data requires a separate provenance review.

## Remaining boundary

This checkpoint proves the deterministic compiler and board/game logic, not the complete image-to-physical pick-and-place loop. The next bounded task is to define and test an explicit bridge from `Blueprint` targets and `createInventory()` items to the authoritative Oracle 1 controller/`BoardAdapter`, then expose read-only build state and compiler actions through the same browser state used by the human UI. That bridge must preserve fail-closed motion, preview non-mutation, measured physics, and the current WebMCP contract.
