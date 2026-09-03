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

- Full frozen-runtime verification at `ec23aed196e7b324afce95b74df26fe5526d5ead`:642/642 JavaScript, reliability gate,174JS+4Python syntax and repository checks PASS. This includes the balanced starter pool and its corrected refill/preferred-colour regression expectations.

- Focused terrain/challenge/Viaduct regression: **25/25 passed**.
- Fresh native Chrome 148 smoke: actual Terrain 9 HTTP 200, no Terrain 7 request, **31 unique tools**, successful native `get_bridge_design`, one shared RevisionClock, unchanged initial plan **bp_9453b510 / 9453b510 / 276 parts**.
- Loaded mesh anchors agree with ChallengeService positions; Level 2 creates no Train subsystem or Train scene root. Water normal map remains bound.
- Console: **0 errors / 0 warnings / 0 exceptions**.
- Both screenshots opened and reviewed: terrain, upright Viaduct, tracks, water and robot are visible. No independent terrain/bridge rotation or camera-default edit.
- Local evidence: `output/playwright/terrain9-smoke-final/acceptance.json`, `00-current-player-view.png`, `01-terrain9-bridge.png`. Explicit repeat command: `node scripts/terrain-asset-browser.mjs --write-evidence`; optional `ROBO_TERRAIN_URL` / `ROBO_TERRAIN_OUTPUT` select the owned test server and fresh evidence folder.
- The first `terrain9-smoke` attempt failed in the harness on `r.bridge.host`; corrected to the existing `r.bridgeHost`. Failed evidence is retained, not reported as a runtime failure or overwritten by the passing run.

## Limits

Read-only static/release preflight at runtime checkpoint `ec23aed196e7b324afce95b74df26fe5526d5ead`:188 served files /28,947,210 bytes;454 literal references plus3 configured URLs resolve with correct case and no external/escaping/missing paths. All four GLBs are hydrated/self-contained. Terrain9's committed LFS pointer matches the actual hash/size. Release selection545 tracked files excludes old Terrain7, the private local handoff, untracked files and denied private artifacts. Counts include then-current documentation edits, not a generated ZIP manifest. No release ZIP or deployment was created.

This asset smoke is not a repeated full Level 2 construction run, a frame-rate benchmark, or Level 3 crossing acceptance. Current-mesh contact tests still detect the original low tunnel and closed end wall; the smaller file does not fix Train clearance. A separate real native Terrain9 diagnostic confirms6 robot moves/118 samples, current aligned TCP contact, and the existing Entry_Structure obstruction (4.90448656mm residual), same Mission BUILD, clean cleanup/console. Its three screenshots are inspected: `output/playwright/level3-terrain9-current/`. Full Level 3 failure/repair/all-car crossing remains outstanding. Main and Cloudflare are unchanged.
