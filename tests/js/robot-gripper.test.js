import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveHarness } from '../helpers/live-harness.js';
import {
  captureBrickInTcp,
  heldBrickWorldPose,
  jawAnimationFrame,
  selectAutomaticYaw,
  shortestHalfTurnDelta,
  toolOrientationForYaw,
  UR10_GRIPPER
} from '../../apps/web/src/robot/gripper-definition.js';
import { forwardKinematics, inverseKinematicsPose } from '../../apps/web/src/robot/kinematics.js';
import { distance3 } from '../../apps/web/src/robot/math.js';
import { UR10_DEFINITION } from '../../apps/web/src/robot/ur10-definition.js';

test('verified real-gripper calibration is locked to the delivered GLB', () => {
  assert.equal(UR10_GRIPPER.sourceGlbSha256, 'e866760a7bd5ee91f4944d073b1d96db315786e51c540a0f97463f79ae62126e');
  assert.equal(UR10_GRIPPER.uniformScale, 0.4);
  assert.equal(jawAnimationFrame(UR10_GRIPPER.openGapMm), UR10_GRIPPER.animation.openFrame);
  assert.equal(jawAnimationFrame(UR10_GRIPPER.contactGapMm), UR10_GRIPPER.animation.contactFrame);
});

test('full-pose IK solves fixed-down yaw without exposing a public joint command', () => {
  const yawRad = 0.4;
  const result = inverseKinematicsPose({
    ...UR10_DEFINITION.homeTcp,
    rotation: toolOrientationForYaw(yawRad, UR10_DEFINITION.fixedToolOrientation)
  }, UR10_DEFINITION.homeJointsRad, UR10_DEFINITION, { maxBranchJumpRad: 1.7 });
  assert.equal(result.ok, true, JSON.stringify(result));
  const fk = forwardKinematics(result.jointsRad);
  assert.ok(distance3(fk.tcp, UR10_DEFINITION.homeTcp) < 0.1);
  assert.ok(result.orientationErrorRad < 0.0015);
});

test('automatic yaw uses the nearest brick and the shortest equivalent half turn', () => {
  const selected = selectAutomaticYaw({
    currentYawRad: 0,
    target: { xMm: 520, yMm: -230, zMm: 40 },
    bricks: [{ position: { xMm: 520, yMm: -230, zMm: 35 }, yawRad: Math.PI * 0.75 }]
  });
  assert.ok(Math.abs(selected + Math.PI * 0.25) < 1e-12);
  assert.ok(Math.abs(shortestHalfTurnDelta(0, Math.PI * 0.75) + Math.PI * 0.25) < 1e-12);
});

test('captured brick transform remains authoritative under TCP translation and yaw', () => {
  const inTcp = captureBrickInTcp(
    { xMm: 100, yMm: 20, zMm: 50 },
    Math.PI / 2,
    { xMm: 98, yMm: 23, zMm: 43.4 }
  );
  const world = heldBrickWorldPose({ xMm: 200, yMm: -10, zMm: 90 }, Math.PI, inTcp, 0.2);
  assert.deepEqual(inTcp, { xMm: 3, yMm: 2, zMm: -6.600000000000001 });
  assert.ok(Math.abs(world.position.xMm - 197) < 1e-12);
  assert.ok(Math.abs(world.position.yMm + 12) < 1e-12);
  assert.ok(Math.abs(world.position.zMm - 83.4) < 1e-12);
});

test('controller owns real jaw state through latch, motion, release, and reset', async () => {
  const { controller, makeBricks } = createLiveHarness();
  const brick = controller.getBricks()[0];
  const pickup = {
    xMm: brick.position.xMm,
    yMm: brick.position.yMm,
    zMm: brick.position.zMm + 6.6
  };
  assert.equal(controller.getState().gripper.jawState, 'open');
  await controller.moveTool({ ...pickup, zMm: 400, speedMmS: 400 });
  await controller.moveTool({ ...pickup, speedMmS: 180 });
  const latch = await controller.latch({ actor: 'agent' });
  assert.equal(latch.ok, true);
  assert.equal(controller.getState().gripper.jawState, 'holding');
  assert.equal(controller.getState().gripper.jawGapMm, 16);
  assert.ok(controller.getState().gripper.brickInTcp);
  await controller.moveTool({ ...pickup, zMm: 255, speedMmS: 250 });
  const held = controller.getBricks().find((candidate) => candidate.id === brick.id);
  assert.ok(Math.abs(held.position.zMm - (controller.getState().tcp.zMm - 6.6)) < 0.1);
  await controller.reset({ bricks: makeBricks() });
  assert.equal(controller.getState().gripper.jawState, 'open');
  assert.equal(controller.getState().gripper.jawGapMm, 46);
  assert.equal(controller.getState().gripper.brickInTcp, null);
});
