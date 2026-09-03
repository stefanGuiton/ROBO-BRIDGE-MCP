# Terrain 9 production asset checkpoint — 2026-09-03

User-requested replacement of the active terrain asset only. The existing shared challenge transform, bridge dimensions, water datum and ENTRY/EXIT placement are preserved. Legacy `terrain7` module/flag names describe that coordinate contract, not an instruction to load the old GLB.

## Asset identity

- Original, unchanged source: `Scene_and_3D_Files/Terrain_9_Main.glb`.
- Hydrated production copy: `apps/web/assets/terrain/Terrain_9_Main.glb`.
- One loader/metadata identity: `apps/web/src/challenge/terrain-asset.js`.
- SHA256: `1e0292fd5fb33fe22dc54e1772283a89232273be2ad793a7d896d21bb4a5b76c`.
- 3,486,576 bytes versus 31,378,000 bytes for the previous asset (88.9% smaller).
- 8,003 total triangles versus 39,503 previously; 7,969 current solid triangles.
- Both images are embedded. Existing loader supports the required `KHR_texture_transform`; no external image/buffer dependency or new decoder.
- Authored anchors remain ENTRY `(0,0,0)` and EXIT `(370.0000047683716,0,0)` in Z-up millimetres. Water normal binding, UV repeat/offset and opacity are verified unchanged.
- The obsolete production Terrain 7 copy was moved outside the served tree to local `output/retired-assets/Terrain_7_Main.glb`. Original `Scene_and_3D_Files/Terrain_7_Main.glb` is unchanged and hash-identical; the old production file is also recoverable from Git. No Blender/source asset was removed.

## Acceptance

- Focused terrain/challenge/Viaduct regression: **25/25 passed**.
- Fresh native Chrome 148 smoke: actual Terrain 9 HTTP 200, no Terrain 7 request, **31 unique tools**, successful native `get_bridge_design`, one shared RevisionClock, unchanged initial plan **bp_9453b510 / 9453b510 / 276 parts**.
- Loaded mesh anchors agree with ChallengeService positions; Level 2 creates no Train subsystem or Train scene root. Water normal map remains bound.
- Console: **0 errors / 0 warnings / 0 exceptions**.
- Both screenshots opened and reviewed: terrain, upright Viaduct, tracks, water and robot are visible. No independent terrain/bridge rotation or camera-default edit.
- Local evidence: `output/playwright/terrain9-smoke-final/acceptance.json`, `00-current-player-view.png`, `01-terrain9-bridge.png`. Explicit repeat command: `node scripts/terrain-asset-browser.mjs --write-evidence`; optional `ROBO_TERRAIN_URL` / `ROBO_TERRAIN_OUTPUT` select the owned test server and fresh evidence folder.
- The first `terrain9-smoke` attempt failed in the harness on `r.bridge.host`; corrected to the existing `r.bridgeHost`. Failed evidence is retained, not reported as a runtime failure or overwritten by the passing run.

## Limits

This asset smoke is not a repeated full Level 2 construction run, a frame-rate benchmark, or Level 3 crossing acceptance. Current-mesh contact tests still detect the original low tunnel and closed end wall; the smaller file does not fix Train clearance. Full Level 3 failure/repair/all-car crossing remains outstanding. Main and Cloudflare are unchanged.
