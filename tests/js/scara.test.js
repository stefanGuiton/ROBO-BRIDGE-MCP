import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCARA_CONFIG,
  createInitialState,
  forwardKinematics,
  inverseKinematics,
  workspace
} from '../../apps/web/src/core/scara.js';

const close = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('locked link lengths produce the expected maximum reach', () => {
  const ws = workspace();
  close(ws.maxRadiusMm, 590.273, 1e-9);
  close(ws.minRadiusMm, 90.353, 1e-9);
});

test('forward and inverse kinematics round trip', () => {
  const joints = { thetaDeg: 25, psiDeg: 70, zMm: 180 };
  const point = forwardKinematics(joints);
  const result = inverseKinematics(point, joints);
  assert.equal(result.ok, true);
  close(result.joints.thetaDeg, joints.thetaDeg, 1e-6);
  close(result.joints.psiDeg, joints.psiDeg, 1e-6);
  close(result.joints.zMm, joints.zMm, 1e-9);
});

test('inverse kinematics selects the branch nearest the accepted state', () => {
  const target = { xMm: 300, yMm: 120, zMm: 200 };
  const positive = inverseKinematics(target, { thetaDeg: 0, psiDeg: 90, zMm: 200 });
  const negative = inverseKinematics(target, { thetaDeg: 90, psiDeg: -90, zMm: 200 });
  assert.equal(positive.ok, true);
  assert.equal(negative.ok, true);
  assert.ok(positive.joints.psiDeg > 0);
  assert.ok(negative.joints.psiDeg < 0);
});

test('unreachable requests fail without fabricating a solution', () => {
  const result = inverseKinematics({ xMm: 900, yMm: 0, zMm: 200 }, DEFAULT_SCARA_CONFIG.initial);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'outside_workspace');
});

test('initial state is finite and valid', () => {
  const state = createInitialState();
  for (const value of Object.values(state.joints)) assert.equal(Number.isFinite(value), true);
  for (const value of Object.values(state.cartesian)) assert.equal(Number.isFinite(value), true);
});
