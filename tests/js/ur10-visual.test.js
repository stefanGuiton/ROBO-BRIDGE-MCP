import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { forwardKinematics } from '../../apps/web/src/robot/kinematics.js';
import { UR10_DEFINITION } from '../../apps/web/src/robot/ur10-definition.js';
import { parseGlb } from '../../apps/web/src/render/real-gripper-visual.js';
import { UR10_VISUAL, UR10_VISUAL_NODES, ur10VisualTransforms } from '../../apps/web/src/render/ur10-visual.js';

const assetUrl = new URL('../../apps/web/assets/models/UR10-v2-complete.glb', import.meta.url);

function translation(matrix) {
  return [matrix[3], matrix[7], matrix[11]];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test('canonical V2 UR10 GLB is byte-locked and structurally complete', async () => {
  const bytes = await readFile(fileURLToPath(assetUrl));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), UR10_VISUAL.sourceGlbSha256);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const { json } = parseGlb(buffer);
  assert.equal(json.nodes.length, UR10_VISUAL.nodeCount);
  assert.equal(json.meshes.length, UR10_VISUAL.meshCount);
  assert.equal(json.scenes[json.scene ?? 0].nodes.length, UR10_VISUAL.nodeCount);
  const triangles = json.meshes.reduce((total, mesh) => total + mesh.primitives.reduce(
    (meshTotal, primitive) => meshTotal + json.accessors[primitive.indices].count / 3, 0
  ), 0);
  assert.equal(triangles, UR10_VISUAL.triangleCount);
});

test('all 27 V2 mesh regions map once to the seven articulated links', () => {
  assert.equal(UR10_VISUAL_NODES.length, UR10_VISUAL.nodeCount);
  assert.equal(new Set(UR10_VISUAL_NODES.map(([, node]) => node)).size, UR10_VISUAL.nodeCount);
  assert.deepEqual(
    [...new Set(UR10_VISUAL_NODES.map(([link]) => link))].sort(),
    ['base', 'forearm', 'shoulder', 'upper arm', 'wrist 1', 'wrist 2', 'wrist 3']
  );
});

test('demo-derived visual rig preserves the authoritative DH flange position', () => {
  const poses = [
    UR10_DEFINITION.homeJointsRad,
    [0, -Math.PI / 2, Math.PI / 2, -Math.PI / 2, -Math.PI / 2, 0],
    [0.3, -2.2, 1.4, 0.2, -1.57, 1.8]
  ];
  for (const joints of poses) {
    const fk = forwardKinematics(joints);
    const visual = ur10VisualTransforms(joints);
    assert.equal(fk.ok, true);
    assert.ok(distance(translation(fk.frames[6]), translation(visual.flange)) < 1e-9);
  }
});

test('V2 upper-arm vertices do not receive the obsolete duplicate visual offset', () => {
  const visual = ur10VisualTransforms([0, 0, 0, 0, 0, 0]);
  const shoulderLiftFrame = visual.frames[1];
  const upperArm = visual.links.get('upper arm');
  assert.ok(distance(translation(upperArm), translation(shoulderLiftFrame)) < 1e-12);
});

test('visual transform rejects malformed joint state', () => {
  assert.throws(() => ur10VisualTransforms([0, 0]), /invalid_ur10_visual_joint_state/);
});
