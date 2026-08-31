# ROBO BRIDGE Terrain Compiler Integration Guide

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

## Integration Goal

Integrate the verified compiler contract without changing the existing Three.js application architecture.

Use the repository Three.js dependency.

Do not keep the prototype CDN import map in production.

## Recommended Ownership

1. Put `terrain-core.js` in the terrain authoring subsystem.
2. Put the Three.js renderer adapter near the current scene owner.
3. Keep compiler controls in a development-only tool.
4. Keep the prototype WebMCP tools in development builds only.
5. Keep runtime terrain loading separate from source GLB loading.

## Authoring Flow

Use this flow for each curated map:

`Blender source -> optional Cycles bake -> browser compiler -> terrain package`

Create three approved source maps:

- `Low`.
- `Medium`.
- `High`.

Use one fixed block size contract for each map family.

Use the same grid origin after approval.

## Runtime Flow

Do not load the source GLB during normal gameplay.

Load `terrain.meta.json`.

Load `terrain.cells.bin`.

Create top-cap chunks from occupied cells.

Create exposed side-wall buffers from height differences.

Create the coarse shadow proxy from the same height grid.

Use the height grid for terrain height queries.

## Binary Contract

Each cell uses six bytes.

Byte layout:

- bytes `0..1`: signed little-endian height layer.
- byte `2`: red.
- byte `3`: green.
- byte `4`: blue.
- byte `5`: flags.

The empty-cell flag is bit zero.

The empty height value is `-32768`.

Keep the format version in `terrain.meta.json`.

Reject an unsupported format version.

## Rendering Contract

Use one top `InstancedMesh` for each non-empty chunk.

Use one side-wall mesh for each non-empty chunk.

Use front-side materials.

Enable native frustum culling.

Keep visible terrain `castShadow=false`.

Keep visible terrain `receiveShadow=true`.

Use the coarse proxy as the terrain shadow caster.

## Trees

Keep trees outside the terrain cell format.

Use a small set of curated tree models.

Scatter trees during authoring or from saved placement data.

Render repeated trees with instancing.

Do not merge tree geometry into the terrain grid.

## Water

Keep water separate when water must animate.

Use the current terrain colour only for a static prototype river.

## Bridge Interaction

Use the compiled height grid for ground height checks.

Do not raycast against the visual top-cap instances for every query.

Use direct grid indexing where possible.

Keep bridge bricks on their own construction grid.

## Performance Gates

The verified default map has `6,006` grid cells.

It has `26,824` estimated terrain triangles.

Its cell package is `36,036` bytes.

The verified 100k stress grid has `100,337` cells.

Its cell package is `602,022` bytes.

The JavaScript core compiled that stress grid in about `100 ms` in the VM Node test.

Do not treat this Node result as browser FPS evidence.

Measure runtime FPS on the target application device before release.
