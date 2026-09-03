# Third-party notices

This file records third-party software and asset licence obligations for the current ROBO BRIDGE MCP runtime and release. The project `LICENSE` does not replace or relicense the third-party materials listed here.

For a shorter human-readable credit list and asset provenance record, see `ATTRIBUTIONS.md`.

## Three.js r185

The browser renderer includes `apps/web/vendor/three.module.min.js` and `apps/web/vendor/three.core.min.js` from Three.js revision 185. Prototype folders also contain vendored Three.js copies with their local `THREE-LICENSE.txt` files.

Copyright 2010-2026 Three.js Authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Gripper.glb — Sketchfab Articulated Robot

`apps/web/assets/models/Gripper.glb` is derived from the gripper in **Articulated Robot** by **Abdullah (`@abd_3d`)** on Sketchfab:

- Source: https://sketchfab.com/3d-models/articulated-robot-8e963bc34dab4a8f97be06b85cbc525e
- Licence: Creative Commons Attribution (CC BY 4.0 International): https://creativecommons.org/licenses/by/4.0/
- Project modification: the gripper was extracted/adapted from the source robot and modified for simulator integration, animation, materials and calibration.
- Current project GLB SHA-256: `e866760a7bd5ee91f4944d073b1d96db315786e51c540a0f97463f79ae62126e`.

Attribution is provided to Abdullah as required by CC BY. No endorsement by the original creator or Sketchfab is implied.

## Universal Robots kinematic reference and UR10 visual mesh

The UR10-class kinematic definition uses published Universal Robots DH dimensions as numeric reference data. `apps/web/assets/models/UR10-v2-complete.glb` is a high-detail visual mesh derived from the UR10 mesh set in `UniversalRobots/Universal_Robots_ROS2_Description`, with source reference commit `89bbe795f38a7ab00fb66fe8831dfff79dc99edf`:

https://github.com/UniversalRobots/Universal_Robots_ROS2_Description/tree/89bbe795f38a7ab00fb66fe8831dfff79dc99edf

The project version was modified for this simulator, including removal of original logos/branding and adaptation for project articulation/material handling. The imported V2 GLB is preserved at SHA-256 `f7a74be4b84726c2b073b7c1dd0a6b5549372ac6c30a6c1226c7cfe9d98a59f8`. Universal Robots does not endorse this project.

That repository state licenses the UR10 content under BSD 3-Clause terms:

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Terrain creation provenance

The base terrain concept image was generated with OpenAI ChatGPT image generation. It was then converted into a 3D model using Vizcom and subsequently edited and integrated into ROBO BRIDGE MCP by the repository owner.

This is a provenance record rather than a separate third-party asset licence notice. OpenAI's applicable terms state that, as between the user and OpenAI and to the extent permitted by law, the user owns Output. Vizcom states that users retain ownership and rights over their data and designs. These statements do not override any rights that may exist in third-party material.

- OpenAI Europe Terms of Use: https://openai.com/policies/eu-terms-of-use/
- Vizcom ownership/provenance information: https://www.vizcom.ai/contact

## Rapier prototype dependency

`PROTOTYPES/05_Train_Rapier/vendor/rapier/` contains `@dimforge/rapier3d-compat` version 0.20.0. Its package metadata identifies the licence as Apache-2.0 and the corresponding licence text is preserved at `PROTOTYPES/05_Train_Rapier/vendor/rapier/LICENSE`.

## WebMCP

The project calls the experimental browser `document.modelContext` API when it is available. No WebMCP browser implementation source is copied into this repository.

## Removed runtime dependencies

NVIDIA Newton, NVIDIA Warp, MuJoCo Warp, and the old Three.js SCARA runtime are not part of this release.

## AI-assisted project contribution provenance

Parts of the implementation were developed with OpenAI/ChatGPT assistance and project-specific AI-generated implementation packages, then reviewed, modified and integrated into this repository by the repository owner. This is development provenance, not a separately vendored software dependency.

OpenAI's applicable terms state that, as between the user and OpenAI and to the extent permitted by applicable law, the user owns Output. This does not grant rights in any third-party material that may independently require attribution or another licence.
