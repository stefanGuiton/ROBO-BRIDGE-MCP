# Pre-existing work and challenge provenance

## Purpose

This file separates work that existed before the 2026 OpenAI WebMCP Challenge from new ROBO-SIM-MCP work. Update it before public release and pin every source to exact commits.

## Private source reviewed

Private repository: `stefanGuiton/SCARA-SIM`

Reviewed branches:

- `main`
- `codex/phase1-benchy-lab`

Challenge-relevant review point visible through private GitHub access:

- PR #1 head observed during foundation work: `e3ed10db526afa697cdd06cb8145a2d05a7a7a3d`
- earlier documented checkpoint: `596f32c4a4ac2e69a0136de126f21d900e0fc27f`
- `main` baseline shown by PR #1: `43b2d309dc4523b3cc3b12bc49a8e431915c90c6`

These values must be rechecked before submission.

## Observed pre-existing capabilities

Before ROBO-SIM-MCP foundation work, SCARA-SIM already contained or documented:

- browser SCARA geometry and scene layout;
- Three.js r185 reference runtime;
- PBR metallic materials;
- HDR/PMREM environment lighting;
- PBR Neutral tone mapping;
- shadows, SSAO, FXAA, MSAA, and quality controls;
- orbit, pan, fit, play, and path controls;
- end-effector XY dragging and Z dragging;
- exact SCARA link lengths `340.313 mm` and `249.960 mm`;
- fail-closed RRF-style SCARA state integration;
- structured Cartesian and joint request functions;
- isolated path preview;
- deterministic kinematics tests and parity evidence;
- a scene-generic rendering seam;
- photo-booth lighting research and implementation work.

## New work in this foundation ZIP

The following was created as ROBO-SIM-MCP foundation work:

- standalone public-safe project structure;
- clean analytic SCARA core written without RepRapFirmware source;
- shared `RobotController` for manual and agent actions;
- structured workcell scene model;
- two-finger gripper model and state;
- pick-and-place waypoint generator;
- nine WebMCP tool definitions using `document.modelContext`;
- browser/physics protocol;
- FastAPI service;
- deterministic physics fallback;
- Newton integration boundary;
- challenge master plan;
- test suites and verification script.

## Oracle 1 integration work — 2026-08-27

The local Oracle 1 package was supplied after the foundation ZIP and was reviewed as an external implementation package, not as trusted Git history. Its adapted contributions are recorded in `docs/ORACLE_1_IMPORT_AUDIT.md` and include:

- UR10-class published DH definition and browser FK/IK;
- bounded Cartesian controller with fail-closed state and revisions;
- generic 2x4 brick, latch, carry, release, and board snap seam;
- dependency-free vertical-slice renderer and manual controls;
- primitive WebMCP schemas and lifecycle diagnostics;
- focused kinematics, controller, latch/collision, reliability, and qualification tests.

The Oracle package did not include a normal repository clone, so its patch was not applied blindly. No source from `D:\SCARA-Simulator` was copied, and no RepRapFirmware source or physical-robot control was added.

## Oracle 2 integration work — 2026-08-27

The local Oracle 2 package was supplied under `downloads from oracle` and reviewed as an external compiler/game implementation package. Its source base metadata is `09e323b5fa44b80dcbac38c97440962bed13811a`. The adapted contributions are recorded in `docs/ORACLE_2_IMPORT_AUDIT.md` and include:

- deterministic OKLab palette matching and alpha-aware image-to-Blueprint compilation;
- stable target IDs, logical 2x4 brick geometry, board mapping, and Blueprint invariants;
- seeded inventory spawning with exact colour counts and no-overlap checks;
- immutable BuildBoard occupancy/correction state;
- Co-Build and Race game state plus deterministic scoring;
- a standalone local compiler lab and focused tests/evidence scripts.

The Oracle 2 package was a partial runnable snapshot rather than a normal clone. Its compatibility reconstruction, duplicate old WebMCP path, raw screenshots/logs, and package metadata were not copied over existing project code. The compiler/game state remains a separate deterministic foundation pending the generated multi-brick adapter. No third-party source, branded asset, RepRapFirmware source, or physical-robot control was added.

## Oracle 3 integration work — 2026-08-27

The local Oracle 3 package was supplied under `downloads from oracle` and reviewed as an external perception/WebMCP implementation package. Its source base metadata is `09e323b5fa44b80dcbac38c97440962bed13811a`. The adapted contributions are recorded in `docs/ORACLE_3_IMPORT_AUDIT.md` and include:

- simulator-native vector/matrix projection, camera rigs, bounded 3D-to-pixel observations, and approximate occlusion;
- immutable observation snapshots, stable world revisions, active-object association, and stale-observation recovery;
- six primitive WebMCP tools using `document.modelContext.registerTool(...)` with JSON schemas and lifecycle diagnostics;
- bounded agent activity phases for observe, target, move, latch, verify, place, and recover;
- an explicit adapter from the Oracle 3 runtime contract to the existing Oracle 1 UR10 `RobotController` and `BoardAdapter`;
- deterministic fixture, recovery/performance scripts, browser-served debug page, and focused tests/evidence.

The Oracle 3 package was a sparse runnable snapshot rather than a normal clone. Its duplicate compatibility `core/*` and physics paths were not copied, and the retained SCARA WebMCP module was not overwritten. No third-party source, computer-vision dependency, branded asset, RepRapFirmware source, or physical-robot control was added. The generated multi-brick compiler-to-controller bridge and native WebMCP tool-selection acceptance remain future gates.

## Private repository extraction limitation

The build VM could inspect the private repository through the connected GitHub tool, but it could not clone the private repository into the container. Direct network access from the container was unavailable. Therefore, this ZIP contains a clean standalone foundation and does not contain the full SCARA-SIM repository.

On the target PC, clone or open the private SCARA-SIM checkout and perform a file-by-file extraction review before public release.

## Public repository rule

Do not publish:

- the full private SCARA-SIM repository;
- RepRapFirmware source or archives;
- private paths, logs, credentials, or machine configuration;
- assets without verified redistribution rights;
- claims that unfinished SCARA-SIM work was completed before the challenge.

## Required pre-submission evidence

Create a table with:

- public file path;
- originating private path, if any;
- original commit SHA;
- original creation date;
- challenge modification date;
- licence basis;
- reviewer decision.
