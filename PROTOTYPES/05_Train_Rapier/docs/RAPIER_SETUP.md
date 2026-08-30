# Rapier setup notes

## Package choice

The prototype uses the official Apache-2.0 `@dimforge/rapier3d-compat` package, version 0.20.0. The compatibility build embeds WASM in the JavaScript module, which avoids separate WASM serving/bundler paths and keeps the static prototype portable.

The official npm tarball is vendored at `vendor/rapier/`. It was downloaded from the npm registry and verified on 2026-08-30:

```text
integrity: sha512-X4W9pJBdGRX5CO3c/gUNjBFEFG2fn4nYxp9k8STdBDaLa0/w5XTW2ArpayS+9jGFojTi3uFSOWAElCd4rkpekA==
verified: true
```

Three.js r179 and OrbitControls are vendored in `vendor/` under the included MIT licence.

No global packages are installed. No Python is used.

## Initialisation

`initialiseRapier()` memoises the asynchronous compatibility-module initialiser. Every reset then creates a fresh local `RAPIER.World` with configured gravity.

Default world configuration:

- fixed timestep: `1 / 60` second;
- solver iterations: 8;
- gravity: `9.81 m/s²`;
- sleeping allowed;
- CCD enabled only on train bodies;
- static segment cuboids for supported deck collision;
- one bottom collider so fallen cars settle visibly.

## Bodies and joints

The default train has three dynamic bodies and two `JointData.spring` impulse joints. Locomotive/carriage colliders use explicit masses. Spring couplers permit visible translation and angular articulation without creating an exact railway-hardware model.

Guidance forces are cleared and recomputed each fixed step. This is important because Rapier force accumulators persist until reset. Per-guide force is bounded before being summed on the body, and the difference between front/rear lateral guide error supplies a limited yaw moment.

## Support loss

Each guide queries only `RailSupportMap.isSupportedAt(s)`. When support is false, the guide multiplier moves toward zero instantly or over the configured fade. Once fully released it remains latched off until reset, preventing an unsupported falling car from snapping back to the route.

The same support state enables/disables the segment's simple static deck collider. No mesh triangles or bridge-generation state are queried.
