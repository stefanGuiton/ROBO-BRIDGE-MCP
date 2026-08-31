# ROBO BRIDGE Base-Mesh Terrain Block Compiler V1.0

## Mandatory Writing Standard

Use **ASD-STE100 Simplified Technical English (STE), Issue 9, January 2025**, for all prose.

This project profile is a practical subset of the 53 official rules.

1. Keep instructions to 20 words or fewer. Keep descriptions to 25 words or fewer.
2. Use common and simple words.
3. Use one meaning for each word.
4. Give one instruction in each sentence.
5. Use active voice and direct commands.
6. Use simple verb tenses.
7. Avoid complex verb groups.
8. Avoid unnecessary `-ing` forms.
9. Include required subjects, verbs, and articles.
10. Keep noun groups short.
11. Use the same technical term each time.
12. Use specific words. Do not use vague qualifiers.
13. Put each condition before its action.
14. Use lists for complex information.
15. Use one topic in each paragraph.
16. Keep each paragraph to six sentences or fewer.
17. State warnings and safety steps directly.
18. Do not use decorative language.

Apply STE to plans, prompts, reports, runlogs, comments, documentation, status updates, and completion messages.

Keep code, identifiers, paths, commands, logs, errors, API names, and quotations exact.

Copy this complete section into every Markdown artifact that this workflow creates.

Put the section near the start. Do not use only a link.

Copy this complete section into every delegated agent prompt.

Before delivery, check sentence length, voice, terms, ambiguity, and repeated text.

## Purpose

This prototype is the new ROBO BRIDGE terrain generator approach.

It starts with one curated base mesh from Blender.

This prototype converts one curated terrain GLB into a fixed block grid.

It keeps the source material colour without Blender Data Transfer.

It does not create full voxel cubes.

It renders top caps and exposed side walls only.

## Included Files

- `index.html`: Three.js compiler interface.
- `app.js`: Three.js loading, chunking, culling, lighting, and export.
- `terrain-core.js`: deterministic terrain compiler.
- `terrain-webmcp.js`: development-only WebMCP tuning tools.
- `assets/Terrain_Optimised_10k.glb`: supplied source terrain.
- `offline_compile.py`: reference compiler for verification.
- `compiled/default/`: verified default terrain package.
- `blender/BAKE_GUIDE.md`: Cycles HDRI and AO bake steps.
- `INTEGRATION_GUIDE.md`: ROBO BRIDGE integration contract.
- `verification/VERIFICATION_REPORT.md`: measured results and limits.

## Quick Start

1. Start a local web server in this folder.
2. Use `python -m http.server 8000`.
3. Open `http://localhost:8000`.
4. Keep the default `0.02` block width for the first test.
5. Keep the default `0.0125` block height.
6. Select **Compile** after each grid change.
7. Use the mouse to inspect the terrain.
8. Select **Export package** when the result is correct.

The prototype imports Three.js r185 from jsDelivr.

Use the repository Three.js dependency during final integration.

## Default Verified Result

- Grid: `91 × 66`.
- Grid cells: `6,006`.
- Occupied top caps: `5,644`.
- Exposed side walls: `7,768`.
- Estimated terrain triangles: `26,824`.
- Chunks at `32 × 32`: `9`.
- Runtime cell package: `36,036 bytes`.

The source mesh has `9,703` triangles.

The compiled terrain uses more triangles than the source mesh.

The compiled terrain gives the required block form and fixed grid.

It avoids hundreds of thousands of full cube triangles.

## Runtime Design

Each occupied grid cell uses one top cap.

Each exposed height difference uses one vertical wall.

The code does not create bottom faces.

The code does not create internal voxel faces.

Top caps use `THREE.InstancedMesh`.

Side walls use one merged buffer per chunk.

Each visible chunk needs at most two terrain draw calls.

Native Three.js frustum culling works on each chunk mesh.

Distance culling is optional.

A hidden quantized heightfield casts dynamic Sun shadows.

The visible block terrain does not cast those shadows.

## Colour Pipeline

The compiler interpolates the source triangle UV at each grid cell.

It samples the source base-colour texture at that UV.

It stores one RGB colour for each occupied cell.

The runtime does not need the source texture after export.

Use the optional Cycles bake inputs for final ambient lighting.

## Production Asset Contract

Use `terrain.meta.json` and `terrain.cells.bin` at runtime.

Each cell uses six bytes.

The record contains one signed height layer, RGB, and flags.

Do not ship the 13 MB source GLB for normal gameplay.

Keep the source GLB in the authoring workflow.

## Development WebMCP Tools

The demo registers three tools when the browser supports WebMCP.

- `terrain_get_tuning` reads settings and measured statistics.
- `terrain_set_tuning` changes bounded preview settings.
- `terrain_reset_view` restores the fitted camera view.

Each change tool requires the latest exact `tuningRevision`.

The tools forward cancellation to terrain compilation.

The tools do not export files or control robot systems.

The normal interface works when WebMCP is not available.

## Verified Checkpoint

The supplied base mesh produces these results:

- Grid cells: `6,006`.
- Occupied blocks: `5,644`.
- Exposed side walls: `7,768`.
- Terrain triangles: `26,824`.
- Terrain draw calls: `18`.
- Browser compile time: `55.5 ms`.
- Observed browser FPS: `120`.
- Near-black source cells: `7`.

The browser binary round-trip test passes.

The `100,337` cell browser stress test passes in `243 ms`.

The browser console reported no errors during the final inspection.

The Cycles lighting bake remains a separate Blender authoring step.
