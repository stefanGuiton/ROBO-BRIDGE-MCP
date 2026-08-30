# Terrain realism research and iteration roadmap

Date: 2026-08-30

## Visual diagnosis

The reference images combine six effects that should remain separate operators:

1. a strong macro silhouette: two rounded masses with a valley between them;
2. a coherent carved channel rather than unrelated vertex noise;
3. steep faces broken by low-frequency ridges and concavities;
4. a thin grass cap and exposed soil or rock selected by slope and height;
5. layered cutaway side walls;
6. sparse rocks placed with spacing and terrain constraints.

The previous prototype only faded procedural noise at the outer perimeter. Its macro bank height remained constant, so both sides still looked like rectangular slabs. V2.2 replaces that model with an analytic mountain envelope that reaches a real ground shelf, adds bounded ridged/domain-warped relief, clamps generated peaks to the shared build datum, and then evaluates the exact platform mask.

## Mountain-specific findings

The most useful mountain result came from comparing three primary implementations:

- `terrain-erosion-3-ways` demonstrates that ordinary fBm looks homogeneous, while coordinate domain warping produces tectonic-looking deformation and inverted absolute noise produces mountain ridges: https://github.com/dandrino/terrain-erosion-3-ways
- `nlmrs` documents ridged multifractals, heterogeneous multifractals, anisotropic noise, domain warp, fault uplift and thermal talus diffusion as distinct operators rather than one noise slider: https://github.com/tom-draper/nlmrs
- FastNoiseLite exposes ridged fractals and progressive/independent domain warp in a portable deterministic implementation: https://github.com/Auburn/FastNoiseLite

The practical lesson for this constrained bridge challenge is to use a small analytic mountain body first, then let ridged/warped noise sculpt that body. Noise must not own topology. Full hydraulic or thermal erosion remains deferred because the V3 master plan explicitly excludes hydraulic terrain erosion and the current visual problem can be solved without an iterative simulation.

## Primary repositories reviewed

### 1. THREE.Terrain — most directly applicable

Repository: https://github.com/IceCreamYou/THREE.Terrain

Useful ideas: composable terrain influences, several smoothing filters, canyon/cliff/plateau helpers, deterministic mesh scattering through a supplied random function, and material blending by elevation or slope. We should study and selectively port the small mathematical ideas rather than replace our authoritative field with its mesh-first pipeline.

### 2. FastNoiseLite — best future noise vocabulary

Repository: https://github.com/Auburn/FastNoiseLite

Documentation: https://github.com/Auburn/FastNoiseLite/wiki/Documentation

Useful ideas: OpenSimplex2/OpenSimplex2S, ridged fractals, cellular noise, ping-pong fractals, and progressive or independent domain warp. It supports JavaScript and TypeScript. A separate deterministic noise instance for domain warp is the documented pattern. Any adoption must freeze new golden checksums and keep all runtime code local to the prototype.

### 3. OpenSimplex2 — lower directional bias

Repository: https://github.com/KdotJPG/OpenSimplex2

Useful idea: updated gradient noise variants, including OpenSimplex2S for smoother, less axis-aligned terrain detail. This is an alternative to importing the larger FastNoiseLite surface.

### 4. Three.js official terrain example — keep height data authoritative

Example: https://github.com/mrdoob/three.js/blob/dev/examples/webgl_geometry_terrain.html

Useful idea: generate a height array first, then transfer it into render geometry. The example also derives shading from nearby height samples. Our design is stricter—the field remains the query authority and the mesh is only a consumer—but the data flow is aligned.

### 5. psrdnoise and webgl-noise — visual micro-detail later

Repositories: https://github.com/stegu/psrdnoise and https://github.com/ashima/webgl-noise

Useful idea: shader noise with analytic derivatives for detail normals and surface breakup. Use this only for visual material detail; do not let a GPU-only displacement disagree with `getHeightAt`.

### 6. Poisson disk sampling — sparse deterministic rocks

Repository: https://github.com/kchapelier/poisson-disk-sampling

Useful ideas: custom random functions and density functions. A small local deterministic sampler can place rocks with minimum spacing, then reject points on pads, in the corridor, near the chunk edge, or above a slope limit.

### 7. Martini RTIN — defer until resolution requires LOD

Repository: https://github.com/mapbox/martini

Useful idea: fast JavaScript terrain triangulation from square height grids. The current 129 by 97 field is already smooth on desktop, so adding an LOD representation now would add complexity without solving the visible problem.

### 8. Mapgen4 — drainage and river-shape reference

Repository: https://github.com/redblobgames/mapgen4

Useful ideas: drainage, rivers, elevations and worker-based generation. Its world-map topology is much broader than this deliberately constrained two-bank challenge, but its separation of elevation and drainage is useful for a later river-width pass.

### 9. Hydraulic erosion references — research only

Repositories: https://github.com/SebLague/Hydraulic-Erosion and https://github.com/ctkrug/erosion

These demonstrate believable channels and deposition, but runtime erosion remains explicitly out of scope. It is iterative, expensive, harder to bound, and unnecessary for this prototype. We can learn visual signatures—concave channels, talus accumulation and material transitions—without adding erosion simulation.

## Ranked implementation roadmap

### R1 — mountain-first macro silhouette (implemented)

- Generate independent side and longitudinal mountain envelopes from a real ground shelf.
- Multiply the envelopes for rounded corners rather than rectangular distance contours.
- Raise the mountain above the target datum and clamp it to `sharedTopY` for local flat caps.
- Carve the valley independently with the signed-distance profile.
- Reapply protected platform and approach flattening after the mountain.
- Retain the existing top surface, four skirts and bottom cap, so the chunk stays a closed volume.

Expected value: very high. This changes the read from two tables to two land masses without adding dependencies or another geometry authority.

### R2 — cliff character, not more white noise (base implementation complete)

- A three-octave ridged multifractal now supplies low-frequency ridge structure.
- A separate deterministic noise stream warps the ridge coordinates.
- Ridge uplift/cuts are restricted to the analytic mountain body.
- The analytic high/low classification is reapplied after corruption, preventing noise from creating or severing banks.
- Platform cores and approach spines remain protected.

Remaining R2 work is visual rather than structural: curvature-aware rock facets and stronger one-sided ridge asymmetry can be added after the material pass.

Acceptance: the obstacle remains one continuous crossing, exactly two high-ground components remain, and the same seed/settings retain frozen hashes.

### R3 — material classification

- Derive material weights from height, slope and local curvature.
- Grass: high, gentle surfaces.
- Soil: moderate slopes and the thin cap transition.
- Rock: steep faces and convex ridges.
- Use soft analytic transitions to avoid hard contour bands.
- Prefer triplanar projection on steep faces to avoid stretched UVs.

This should initially be a render-only consumer of CPU-derived weights. It must not affect supportability or terrain queries.

### R4 — cutaway strata

- Give the closed side-wall vertices depth-relative strata coordinates.
- Render broad soil/stone layers with low-frequency waviness.
- Keep the layer shader on skirts and bottom only; do not paint horizontal strata across the grass top.
- Add a thin darker contact band beneath the grass cap.

Expected value: high for matching the supplied cross-section references, while leaving terrain generation untouched.

### R5 — sparse props

- Use a seeded Poisson-style sampler.
- Reject platform, corridor, obstacle-floor and unsafe-edge candidates.
- Orient rocks to the CPU normal and vary from a small local mesh family.
- Keep props visual-only and disposable with the generated root.

### R6 — performance features only when measured

- Move generation to a worker only if UI traces show blocking.
- Consider Martini or another LOD mesh only when the field resolution rises enough to miss the desktop target.
- Consider shader micro-normal noise only after the macro silhouette and material classification pass visual review.

## Recommended next iteration

Implement R2 and the first half of R3 together as one bounded checkpoint: a ridged, domain-warped shoulder field plus slope/height/curvature material weights. This will make the valley faces substantially more geological while preserving the exact pad and challenge contracts. Cutaway strata should follow as a separate renderer-only checkpoint because it can be reviewed independently.

## Dependency decision

No new dependency is required for R1. For R2, either implement the two required deterministic noise transforms locally or vendor the relevant FastNoiseLite JavaScript/TypeScript source with its license. Avoid a runtime CDN. Do not adopt hydraulic erosion, a second terrain authority, or render-only geometric displacement.
