# Third-party notices

## Three.js r185

The browser renderer includes `apps/web/vendor/three.module.min.js` and `apps/web/vendor/three.core.min.js` from Three.js revision 185.

Copyright 2010-2026 Three.js Authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Gripper.glb

`apps/web/assets/models/Gripper.glb` is a user-supplied project asset imported from the Oracle delivery package. It is preserved byte-for-byte at SHA-256 `e866760a7bd5ee91f4944d073b1d96db315786e51c540a0f97463f79ae62126e`. The repository owner must confirm redistribution rights before a public release.
## Universal Robots kinematic reference and UR10 visual mesh

The UR10-class kinematic definition uses published Universal Robots DH dimensions as numeric reference data. `apps/web/assets/models/UR10-v2-complete.glb` is an unbranded high-detail visual mesh derived from the UR10 mesh set in `UniversalRobots/Universal_Robots_ROS2_Description`, with prior source reference commit `89bbe795f38a7ab00fb66fe8831dfff79dc99edf`. The imported V2 GLB is preserved at SHA-256 `f7a74be4b84726c2b073b7c1dd0a6b5549372ac6c30a6c1226c7cfe9d98a59f8`. Universal Robots does not endorse this project.

That repository state licenses this content under the BSD 3-Clause terms:

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## WebMCP

The project calls the experimental browser `document.modelContext` API when it is available. No WebMCP browser implementation source is copied into this repository.

## Removed runtime dependencies

NVIDIA Newton, NVIDIA Warp, MuJoCo Warp, and the old Three.js SCARA runtime are not part of this release.

## Project contribution provenance

Parts of the current implementation were adapted from project-specific Oracle implementation packages. Before public redistribution, the repository owner must confirm the contribution-rights basis for those project materials.
