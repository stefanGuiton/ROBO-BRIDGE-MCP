# ROBO BRIDGE Terrain Cycles Bake Guide

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

## Goal

Bake expensive ambient lighting once in Blender.

Keep the directional Sun dynamic in Three.js.

## Required Source

Use the original optimized terrain mesh.

Do not use the Blender Block Remesh result.

Keep the original material, UVs, textures, and normal map.

Use a copy of the Blender scene before the bake.

## Ambient and GI Bake

1. Set the render engine to **Cycles**.
2. Open the **World** shader nodes.
3. Add an **Environment Texture** node.
4. Load the selected HDRI.
5. Connect the HDRI to the World **Background** node.
6. Set a neutral HDRI strength first.
7. Disable each Sun and directional scene light.
8. Keep only the HDRI for directional ambient light.
9. Check the terrain UVs for overlaps.
10. Create `Terrain_BakedAmbient_2048.png`.
11. Use 4096 pixels only when 2048 pixels loses visible detail.
12. Add an **Image Texture** node to the terrain material.
13. Select `Terrain_BakedAmbient_2048.png` in that node.
14. Keep the image node selected before the bake.
15. Open **Render Properties > Bake**.
16. Select **Diffuse** as the bake type.
17. Enable **Color**.
18. Enable **Direct** for the HDRI illumination.
19. Enable **Indirect** for bounced light.
20. Use a bake margin of at least eight pixels.
21. Run the bake.
22. Save the baked image from the Image Editor.

Do not add the gameplay Sun before this bake.

A baked Sun causes a fixed second shadow at runtime.

## AO Bake

1. Create `Terrain_BakedAO_2048.png`.
2. Select that image in the active Image Texture node.
3. Set the bake type to **Ambient Occlusion**.
4. Keep a bake margin of at least eight pixels.
5. Run the bake.
6. Save the AO image.

## Compiler Use

1. Open the terrain compiler.
2. Load `Terrain_BakedAmbient_2048.png` under **Ambient / GI**.
3. Load `Terrain_BakedAO_2048.png` under **AO bake**.
4. Set **Baked strength** to `1.0`.
5. Start **AO strength** at `0.5`.
6. Set **Preview AO** to `0`.
7. Compile the terrain.
8. Set the runtime Sun intensity to `0`.
9. Confirm that ambient form remains visible.
10. Restore the runtime Sun.
11. Rotate the Sun through four directions.
12. Confirm that no fixed Sun shadow remains.

## Quality Notes

The original normal map can affect the Cycles lighting bake.

This can preserve small rock detail without runtime normal-map cost.

The compiler samples one final colour for each block cell.

Use a smaller block width when important colour detail disappears.

Do not reduce the block size until profiling proves it is necessary.
