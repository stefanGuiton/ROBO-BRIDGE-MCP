# LOGO ROBO — Real Animated Gripper Grid Demo

## What this proves

This version replaces the primitive gripper with the supplied animated `Gripper.glb` while keeping the proven TCP, grasp, held-transform, collision, and LEGO-grid architecture.

The GitHub entry point is `index.html`. It reconstructs the compressed self-contained demo in the browser. Run `python BUILD_STANDALONE.py` to reconstruct `LOGO_ROBO_REAL_GRIPPER_GRID_DEMO.html` as a single standalone file.

The runtime contains Three.js r185, OrbitControls, the real animated gripper payload, CSS, and application code. It does not need a CDN or npm.

## Real-gripper calibration

The Blender export uses frame `0` as closed and frame `60` as fully open.

Measured from the actual GLB geometry:

- Frame `0`: mechanical closed endpoint.
- Frame `11.8000`: 15.8 mm LEGO-width contact.
- About frame `11.87`: 16.0 mm automatic latch contact, including the 0.2 mm margin.
- Frame `23.0255`: 46.0 mm **Work Open** pose used by automatic pick/place.
- Frame `60`: 118.6818 mm full-open pose for manual/calibration use.

The automatic controller does not use frame 60 for normal travel. The full-open claws are much wider and reduce collision clearance near placed bricks.

## Base and TCP

The exported GLB contains wrapper transforms and does not contain a node literally named `000`. The demo treats the Blender export origin/base plane identified as `000` as the physical `GRIPPER_ROOT` and applies a measured correction matrix.

The resulting TCP relative to the corrected gripper root is:

- X: `-0.4870 mm`
- Y: `0.0000 mm`
- Z: `-410.1106 mm`

Axis conversion:

- glTF +Y → LOGO ROBO tool -Z
- glTF +Z → LOGO ROBO jaw +X
- glTF +X → LOGO ROBO tool -Y

This keeps the LOGO ROBO world Z-up and the tool pointing down local -Z.

## LEGO grid

- Pitch: 8.0 mm.
- Grid: 56 × 40 cells.
- A 2×4 brick occupies 4×2 or 2×4 cells.
- Grid placement yaw is only 0° or 90°.
- Loose bricks can start at any yaw.
- Automatic target centres use 128 mm spacing, derived from the real gripper/claw envelope.

## Architecture seam

The real visual is implemented as `RealGripperRig`. The TCP controller, grasp controller, placement transform, held-brick matrix, grid manager, and build executor remain independent of the gripper hierarchy.

The important state remains:

`brick world pose = TCP world pose × stored brick-in-TCP transform`

## GitHub prototype packaging

`index.html` is the directly runnable repository entry point. The standalone page is stored as 17 gzip/base64 JavaScript chunks so it can be committed through the GitHub API without changing the runtime architecture.

Run:

```text
python BUILD_STANDALONE.py
```

to reconstruct `LOGO_ROBO_REAL_GRIPPER_GRID_DEMO.html`.

Reconstructed compact HTML SHA-256:

`2c30192a0bf714aea31fd35c192f08fdfa105d8bf5b60e5fb9111cbdae1bcb83`

The repository payload uses a geometry-optimized embedded gripper representation to reduce transfer size. It preserves the measured node animation and calibration geometry used by the controller.

## Known limitations

- This is still a free-moving TCP proof. The UR10 is not connected yet.
- No physics engine.
- No camera perception; brick poses are simulator-native.
- The source blue material metallic/roughness texture is represented by calibrated material factors in the embedded loader.

See `TEST_REPORT.md` and `GRIPPER_CALIBRATION.json` for measured evidence.
