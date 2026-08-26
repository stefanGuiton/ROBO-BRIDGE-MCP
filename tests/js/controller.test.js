import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotController } from '../../apps/web/src/core/robot-controller.js';
import { SceneState } from '../../apps/web/src/core/scene-state.js';
import {
  makePickAndPlaceWaypoints,
  sampleWaypoints,
  validateCartesianWaypoints
} from '../../apps/web/src/core/trajectory.js';

test('invalid Cartesian move is fail-closed', () => {
  const controller = new RobotController();
  const before = controller.getState();
  const result = controller.moveEndEffector({ xMm: 1000, yMm: 0, zMm: 200 });
  const after = controller.getState();
  assert.equal(result.ok, false);
  assert.equal(result.stateUnchanged, true);
  assert.deepEqual(after, before);
});

test('valid Cartesian move commits one accepted state', () => {
  const controller = new RobotController();
  const before = controller.getState();
  const result = controller.moveEndEffector({ xMm: 360, yMm: 100, zMm: 180 });
  assert.equal(result.ok, true);
  assert.equal(result.accepted.revision, before.revision + 1);
});

test('trajectory preview never mutates accepted robot state', () => {
  const controller = new RobotController();
  const before = controller.getState();
  const waypoints = [
    before.cartesian,
    { xMm: 300, yMm: 100, zMm: 200 },
    { xMm: 250, yMm: -100, zMm: 180 }
  ];
  const result = controller.previewTrajectory(waypoints);
  assert.equal(result.ok, true);
  assert.deepEqual(controller.getState(), before);
});

test('scene updates are revisioned and resettable', () => {
  const scene = new SceneState();
  const before = scene.getState();
  const result = scene.updateObject('red-cube-1', { position: { xMm: 10 } });
  assert.equal(result.ok, true);
  assert.equal(scene.getObject('red-cube-1').position.xMm, 10);
  assert.ok(scene.getState().revision > before.revision);
  scene.reset();
  assert.equal(scene.getObject('red-cube-1').position.xMm, 220);
});

test('pick-and-place waypoint generator includes grasp and release phases', () => {
  const waypoints = makePickAndPlaceWaypoints({
    start: { xMm: 300, yMm: 0, zMm: 180 },
    object: { id: 'object', position: { xMm: 200, yMm: -100, zMm: 10 } },
    destination: { id: 'bin', position: { xMm: -200, yMm: 100, zMm: 50 } }
  });
  assert.ok(waypoints.some((point) => point.phase === 'close_gripper'));
  assert.ok(waypoints.some((point) => point.phase === 'release'));
});

test('dense preview rejects a sparse chord through the SCARA inner workspace', () => {
  const controller = new RobotController();
  const directTransfer = sampleWaypoints([
    { xMm: 220, yMm: -150, zMm: 232 },
    { xMm: -190, yMm: 210, zMm: 232 }
  ], 24);
  const validation = validateCartesianWaypoints(
    directTransfer,
    controller.getState().joints,
    controller.getConfig()
  );
  assert.equal(validation.ok, false);
  assert.ok(validation.rejectedIndex > 0);
  assert.ok(['outside_workspace', 'joint_limits_exclude_ik'].includes(validation.reason));
});

test('pick-and-place planner routes around the inner workspace and previews densely', () => {
  const controller = new RobotController();
  const waypoints = makePickAndPlaceWaypoints({
    start: controller.getState().cartesian,
    object: { id: 'red-cube-1', position: { xMm: 220, yMm: -150, zMm: 5 } },
    destination: { id: 'red-bin', position: { xMm: -190, yMm: 210, zMm: 62 } },
    clearanceMm: 170,
    graspZOffsetMm: 0,
    placeZOffsetMm: 0
  });
  const preview = controller.previewTrajectory(waypoints);
  assert.ok(waypoints.some((point) => point.phase === 'transfer_via'));
  assert.equal(preview.ok, true);
  assert.ok(preview.sampledPointCount > waypoints.length);
});

test('dense sampling preserves exact semantic phase endpoints and interpolates gripper motion', async () => {
  const { sampleWaypoints } = await import('../../apps/web/src/core/trajectory.js');
  const sampled = sampleWaypoints([
    { xMm: 0, yMm: 0, zMm: 10, phase: 'approach_grasp', gripperOpenFraction: 1 },
    { xMm: 0, yMm: 0, zMm: 10, phase: 'close_gripper', gripperOpenFraction: 0 }
  ], 4);
  assert.equal(sampled.length, 5);
  assert.equal(sampled.filter((point) => point.phase === 'close_gripper').length, 1);
  assert.deepEqual(sampled.map((point) => point.gripperOpenFraction), [1, 0.75, 0.5, 0.25, 0]);
});
