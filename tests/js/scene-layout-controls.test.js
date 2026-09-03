import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { PlayerSettingsStore, PLAYER_FALLBACK_SETTINGS, loadPlayerSettings } from '../../apps/web/src/player/player-settings.js';
import { basePoseMatrix } from '../../apps/web/src/workcell/scene-layout-settings.js';
import { createV8WorkcellProfile } from '../../apps/web/src/workcell/v8-workcell-profile.js';
import { V8Workbench } from '../../apps/web/src/render/v8-workbench.js';
import { RobotRenderer } from '../../apps/web/src/render/robot-renderer.js';
import { forwardKinematics, inverseKinematicsPose } from '../../apps/web/src/robot/kinematics.js';
import { toolOrientationForYaw } from '../../apps/web/src/robot/gripper-definition.js';
import { calibratedUr10LinkMatrices } from '../../apps/web/src/render/ur10-visual.js';
import { UR10_DEFINITION } from '../../apps/web/src/robot/ur10-definition.js';
import { validateCollision } from '../../apps/web/src/robot/collision.js';
import { constructionHarness } from '../helpers/construction-harness.js';
import { partBounds, boundsOverlap } from '../../apps/web/src/bricks/part-spec.js';

test('table yaw and bounded base offsets persist through the existing store', async () => {
  const oldStorage = globalThis.localStorage, oldFetch = globalThis.fetch;
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ tableYawDeg: 0 }) });
  try {
    const store = new PlayerSettingsStore({ tableYawDeg: 0 });
    assert.equal(store.set('tableYawDeg', 90), true);
    assert.equal(store.set('robotBaseXmm', 25), true);
    assert.equal(store.set('robotBaseXmm', 1e8), false);
    store.addGuard((next) => next.tableYawDeg !== 30);
    assert.equal(store.set('tableYawDeg', 30), false);
    const loaded = await loadPlayerSettings();
    assert.equal(loaded.tableYawDeg, 90); assert.equal(loaded.robotBaseXmm, 25);
    assert.equal(loaded.robotMountXmm, PLAYER_FALLBACK_SETTINGS.robotMountXmm);
  } finally { globalThis.localStorage = oldStorage; globalThis.fetch = oldFetch; }
});

test('rotated table proxy corners and table profile follow the same root, not the build frame', async () => {
  const settings = { ...PLAYER_FALLBACK_SETTINGS, ...JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url))), tableYawDeg: 90 };
  const root = new THREE.Group(); root.position.set(settings.tableXmm, settings.tableYmm, 0); root.rotation.z = Math.PI / 2;
  const table = { settings, root, worldPoint: V8Workbench.prototype.worldPoint };
  const boxes = V8Workbench.prototype.collisionBoxes.call(table);
  assert.ok(Math.abs(boxes[0].maxX - boxes[0].minX - settings.tableDepthMm) < 1e-6);
  assert.ok(Math.abs(boxes[0].maxY - boxes[0].minY - settings.tableWidthMm) < 1e-6);
  const profile = createV8WorkcellProfile(settings);
  assert.ok(Math.abs(profile.tableBounds.maxX - profile.tableBounds.minX - settings.tableDepthMm) < 1e-6);
  assert.deepEqual(createV8WorkcellProfile({ ...settings, robotBaseXmm: 100 }).tableBounds, profile.tableBounds);
});

test('base calibration preserves world targets and uses the same FK for renderer, IK and collision', async () => {
  const h = await constructionHarness({ terrain7: true });
  const before = { plan: JSON.stringify(h.host.buildPlan), transform: JSON.stringify(h.host.worldTransform), challenge: JSON.stringify(h.challenge.getState()), board: JSON.stringify(h.board.getTargets()), workspace: structuredClone(h.controller.workspace) };
  const joints = [...h.controller.jointsRad];
  const result = h.controller.setBasePose({ xMm: 15, yMm: -10, zMm: 5, yawRad: 0.03, expectedWorldRevision: h.controller.worldRevision });
  assert.equal(result.ok, true, JSON.stringify(result));
  const fk = forwardKinematics(joints, h.controller.definition);
  assert.deepEqual(fk.tcp, h.controller.tcp);
  const local = forwardKinematics(joints, UR10_DEFINITION), base = new THREE.Matrix4().set(...h.controller.getState().baseTransform);
  const expected = new THREE.Vector3(local.tcp.xMm, local.tcp.yMm, local.tcp.zMm).applyMatrix4(base);
  assert.ok(expected.distanceTo(new THREE.Vector3(fk.tcp.xMm, fk.tcp.yMm, fk.tcp.zMm)) < 1e-6);
  let renderedFrames, renderedFlange;
  RobotRenderer.prototype.updateRobot.call({ controller: h.controller, ur10: { update: (j, frames) => { renderedFrames = frames; } }, gripper: { update: flange => { renderedFlange = flange; } } });
  assert.deepEqual(renderedFrames, fk.frames); assert.deepEqual(renderedFlange, fk.frames[6]);
  const visual = calibratedUr10LinkMatrices(joints, renderedFrames);
  const originalVisual = calibratedUr10LinkMatrices(joints, local.frames);
  for (const [name, matrix] of visual) {
    const expectedMatrix = base.clone().multiply(originalVisual.get(name));
    assert.ok(matrix.elements.every((v, i) => Math.abs(v - expectedMatrix.elements[i]) < 1e-6));
  }
  const target = { xMm: 680, yMm: 0, zMm: 260, rotation: toolOrientationForYaw(0, h.controller.definition.fixedToolOrientation) };
  const ik = inverseKinematicsPose(target, joints, h.controller.definition);
  assert.equal(ik.ok, true, JSON.stringify(ik));
  assert.ok(Math.hypot(ik.tcp.xMm - target.xMm, ik.tcp.yMm - target.yMm, ik.tcp.zMm - target.zMm) < 0.1);
  const obstacle = { id: 'test-obstacle', position: { ...fk.tcp, zMm: fk.tcp.zMm + 16 }, bounds: { xMm: 8, yMm: 8, zMm: 8 } };
  assert.equal(validateCollision({ tcp: fk.tcp, jointPositions: [...fk.jointPositions, fk.tcp] }, { ...h.controller.layout, obstacles: [obstacle] }).ok, false);
  assert.deepEqual(before, { plan: JSON.stringify(h.host.buildPlan), transform: JSON.stringify(h.host.worldTransform), challenge: JSON.stringify(h.challenge.getState()), board: JSON.stringify(h.board.getTargets()), workspace: h.controller.workspace });
  const revision = h.controller.worldRevision;
  assert.equal(h.controller.setBasePose({ xMm: 0, yMm: 0, zMm: 0, expectedWorldRevision: revision - 1 }).reason, 'stale_state');
  assert.equal(h.controller.worldRevision, revision);
  assert.deepEqual(basePoseMatrix(), [1, -0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const placement = await h.service.buildNextParts(1, { expectedWorldRevision: h.controller.worldRevision });
  assert.equal(placement.ok, true, JSON.stringify(placement));
  assert.equal(h.service.getBuildProgress().completed, 1);
  assert.deepEqual(h.controller.workspace, before.workspace);
  await h.service.reset({ expectedWorldRevision: h.controller.worldRevision });
  assert.ok(Math.abs(h.controller.toolYawRad - 0.03) < 1e-9);
});

test('More Bricks activates only shared current-plan sources, with stable identities and bounded safe slots', async () => {
  const h = await constructionHarness({ terrain7: true });
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const frozen = h.service.preparedBuild;
  const identity = () => {
    const { worldRevision, ...progress } = h.service.getBuildProgress();
    return { plan: structuredClone(h.host.buildPlan), board: h.board.getTargets(), progress, registry: frozen.registry.hash };
  };
  const before = identity();
  const initialCount = h.controller.getBricks().length;
  const result = h.service.refillSources({ count: 6, expectedWorldRevision: h.controller.worldRevision });
  assert.equal(result.ok, true); assert.ok(result.count > 0 && result.count <= 6, JSON.stringify(result));
  assert.equal(h.controller.getBricks().length, initialCount + result.count);
  for (const id of result.added) {
    assert.ok(frozen.inventory.get(id));
    const brick = h.controller.getBricks().find(b => b.id === id);
    assert.equal(brick.heldBy, null); assert.equal(brick.snapped, false);
    assert.deepEqual(brick.bridgePart.allowedActors, ['human', 'agent']);
    for (const placement of frozen.normalisedBuild.placements) assert.equal(boundsOverlap(partBounds(brick), partBounds(placement)), false);
  }
  for (let i = 0; i < 5; i++) h.service.refillSources({ expectedWorldRevision: h.controller.worldRevision });
  const bricks = h.controller.getBricks();
  assert.equal(new Set(bricks.map(b => b.id)).size, bricks.length);
  assert.deepEqual(identity(), before);
  assert.throws(() => h.service.refillSources({ expectedWorldRevision: h.controller.worldRevision - 1 }), /stale_world_revision/);
});
