import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardKinematics, inverseKinematics, poseErrorForJoints, validateJointState } from '../../apps/web/src/robot/kinematics.js';
import { CHALLENGE_LAYOUT, UR10_DEFINITION } from '../../apps/web/src/robot/ur10-definition.js';
import { distance3 } from '../../apps/web/src/robot/math.js';

const near = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) <= tolerance, label + ': ' + a + ' vs ' + b);

test('FK known zero-joint point matches locked UR10 DH chain', () => {
  const fk = forwardKinematics([0,0,0,0,0,0]);
  assert.equal(fk.ok, true);
  near(fk.tcp.xMm, -1184.4948133626892, 1e-6, 'x');
  near(fk.tcp.yMm, -420.18523236678766, 1e-6, 'y');
  near(fk.tcp.zMm, 11.6, 1e-6, 'z');
});

test('configured home pose is fixed-down and matches its TCP', () => {
  const fk = forwardKinematics(UR10_DEFINITION.homeJointsRad);
  assert.equal(fk.ok, true);
  assert.ok(distance3(fk.tcp, UR10_DEFINITION.homeTcp) < 0.01);
  const error = poseErrorForJoints(UR10_DEFINITION.homeJointsRad, UR10_DEFINITION.homeTcp);
  assert.ok(error.orientationErrorRad < 0.00005);
});

test('configured home uses the reference-derived elbow-up branch', () => {
  const degrees = UR10_DEFINITION.homeJointsRad.map((value) => value * 180 / Math.PI);
  assert.ok(degrees[0] > 150 && degrees[0] < 180, `shoulder pan ${degrees[0]}`);
  assert.ok(degrees[1] > -90 && degrees[1] < -75, `shoulder lift ${degrees[1]}`);
  assert.ok(degrees[2] > 110 && degrees[2] < 130, `elbow ${degrees[2]}`);
  assert.ok(degrees[3] > -135 && degrees[3] < -115, `wrist 1 ${degrees[3]}`);
});

test('IK/FK round trip solves representative challenge points', () => {
  let prior = Array.from(UR10_DEFINITION.homeJointsRad);
  for (const target of [
    CHALLENGE_LAYOUT.pickupAboveTcp,
    CHALLENGE_LAYOUT.pickupTcp,
    { xMm: 590, yMm: -50, zMm: 320 },
    CHALLENGE_LAYOUT.targetAboveTcp,
    CHALLENGE_LAYOUT.targetTcp
  ]) {
    const ik = inverseKinematics(target, prior, UR10_DEFINITION, { maxBranchJumpRad: 1.7 });
    assert.equal(ik.ok, true, JSON.stringify({ target, ik }));
    const fk = forwardKinematics(ik.jointsRad);
    assert.ok(distance3(fk.tcp, target) < 0.1);
    assert.ok(ik.orientationErrorRad < 0.0015);
    prior = ik.jointsRad;
  }
});

test('unreachable and non-finite requests fail exactly', () => {
  assert.equal(inverseKinematics({ xMm: 1800, yMm: 0, zMm: 200 }).reason, 'outside_workspace');
  assert.equal(inverseKinematics({ xMm: Number.NaN, yMm: 0, zMm: 200 }).reason, 'invalid_input');
});

test('joint limits reject out-of-range joints', () => {
  const invalid = Array.from(UR10_DEFINITION.homeJointsRad);
  invalid[2] = 7;
  assert.equal(validateJointState(invalid).reason, 'joint_limit');
});

test('adjacent Cartesian points select a continuous branch', () => {
  const start = { xMm: 520, yMm: -230, zMm: 255 };
  const initial = inverseKinematics(start, UR10_DEFINITION.homeJointsRad, UR10_DEFINITION, { maxBranchJumpRad: 0.55 });
  assert.equal(initial.ok, true);
  let prior = initial.jointsRad;
  let maxJump = 0;
  for (let i = 1; i <= 80; i += 1) {
    const t = i / 80;
    const target = { xMm: 520 + 135 * t, yMm: -230 + 450 * t, zMm: 255 };
    const ik = inverseKinematics(target, prior, UR10_DEFINITION, { maxBranchJumpRad: 0.55 });
    assert.equal(ik.ok, true, JSON.stringify({ i, target, ik }));
    maxJump = Math.max(maxJump, ik.maxJointDeltaRad);
    prior = ik.jointsRad;
  }
  assert.ok(maxJump < 0.12, 'max jump ' + maxJump);
});
