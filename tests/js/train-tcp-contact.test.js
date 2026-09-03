import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainPhysics } from '../../apps/web/src/train/train-physics.js';
import { measuredKinematicCollider, tcpPoseToRouteCollider } from '../../apps/web/src/train/train-kinematic-contact.js';
import { createAcceptedRailContactProvider } from '../../apps/web/src/train/train-contact-support.js';
import { createBuildBoardSupportMap } from '../../apps/web/src/train/buildboard-support-map.js';
import { createRouteFrame, routeLocalPointToMachine, routeLocalQuaternionToMachine } from '../../apps/web/src/train/route-frame.js';
import { identityQuaternion } from '../../apps/web/src/train/math.js';
import { createFixtureBuildPlan, createFixtureBoardSnapshot, createFixtureWorldTransform } from '../helpers/train-fixture.js';

const dt = 1 / 120;
const zero = () => ({ x: 0, y: 0, z: 0 });
const flat = { sample: () => ({ heightMm: 0, kind: 'authored-test-solid', normal: { x: 0, y: 1, z: 0 } }) };

function rig() {
  const physics = createTrainPhysics();
  const initial = [70, 32, -6].map((x, index) => ({
    id: ['A', 'B', 'C'][index], size: { x: 30, y: 12, z: 40 },
    position: { x, y: 6, z: 0 }, rotation: identityQuaternion()
  }));
  physics.promote(initial, 0, {
    angularVelocities: initial.map(zero), lateralSpeedsMmPerSecond: [0, 0, 0], verticalSpeedsMmPerSecond: [0, 0, 0]
  });
  let previous = { id: 'robot-tcp-pusher', position: { x: -25, y: 6, z: 0 }, size: { x: 6, y: 12, z: 40 }, rotation: identityQuaternion() };
  return {
    physics, initial,
    step(distanceMm = 0, rightMm = 0, surfaceProvider = flat) {
      const current = { ...previous, position: { x: -25 + distanceMm, y: 6, z: rightMm } };
      const collider = measuredKinematicCollider(previous, current, dt);
      previous = current;
      return physics.step(dt, { motionMode: 'tcp_contact', kinematicCollider: collider, surfaceProvider });
    }
  };
}

test('stationary actual pusher does not start the train or manufacture forward speed', () => {
  const system = rig();
  for (let index = 0; index < 240; index += 1) system.step();
  for (const [index, body] of system.physics.snapshot().entries()) {
    assert.ok(Math.abs(body.position.x - system.initial[index].position.x) < 1e-7);
    assert.ok(Math.abs(body.linearVelocity.x) < 1e-7);
  }
  assert.equal(system.physics.getDiagnostics().physicalContact.impulseCount, 0);
  assert.equal(system.physics.getCounts().dynamicBodies, 3);
  assert.equal(system.physics.getCounts().couplerJoints, 2);
});

test('measured OBB contact starts all three linked bodies and real momentum coasts after release', () => {
  const system = rig();
  for (let index = 1; index <= 64; index += 1) system.step(index);
  const released = system.physics.snapshot();
  const evidence = system.physics.getDiagnostics().physicalContact;
  assert.ok(evidence.contactCount > 0);
  assert.ok(evidence.impulseCount > 0);
  assert.equal(evidence.measuredPusherSpeedMmPerSecond, 120);
  assert.ok(released.every((body) => body.linearVelocity.x > 90), JSON.stringify(released));
  for (let index = 0; index < 240; index += 1) system.step(64);
  const coast = system.physics.snapshot();
  assert.ok(coast.every((body, index) => body.position.x > released[index].position.x + 100));
  assert.ok(coast.every((body) => body.linearVelocity.x > 60));
  assert.equal(system.physics.getCounts().dynamicBodies, 3);
  assert.equal(system.physics.getCounts().couplerJoints, 2);
});

test('no terrain support means gravity, not an invented water or fallback floor', () => {
  const system = rig();
  for (let index = 0; index < 240; index += 1) system.step(0, 0, { sample: () => null });
  assert.ok(system.physics.snapshot().every((body) => body.position.y < -300));
  assert.ok(system.physics.snapshot().every((body) => !body.groundContact));
});

test('invalid or discontinuous TCP samples fail closed before providing a contact velocity', () => {
  const collider = { position: zero(), size: { x: 10, y: 10, z: 10 }, rotation: identityQuaternion() };
  assert.throws(() => measuredKinematicCollider(collider, { ...collider, position: { x: 1000, y: 0, z: 0 } }, dt), /discontinuity/);
  const plan = createFixtureBuildPlan();
  const frame = createRouteFrame({ frozenBuildPlan: plan, worldTransform: createFixtureWorldTransform(90) });
  assert.throws(() => tcpPoseToRouteCollider(frame, {}, collider.size), /authoritative TCP/);
});

test('TCP collision frame round-trips exact machine position and orientation at route yaw90', () => {
  const plan = createFixtureBuildPlan();
  const frame = createRouteFrame({ frozenBuildPlan: plan, worldTransform: createFixtureWorldTransform(90) });
  const position = { x: 32, y: 7, z: -4 };
  const sample = {
    positionMm: routeLocalPointToMachine(frame, position),
    rotationQuaternion: routeLocalQuaternionToMachine(frame, identityQuaternion()), worldRevision: 37
  };
  const collider = tcpPoseToRouteCollider(frame, sample, { x: 6, y: 12, z: 40 });
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(collider.position[axis] - position[axis]) < 1e-8);
  assert.ok(Math.abs(collider.rotation.w - 1) < 1e-8);
  assert.equal(collider.worldRevision, 37);
});

test('rail contact requires accepted rail, structural support, and a footprint that actually reaches both rails', () => {
  const plan = createFixtureBuildPlan();
  const worldTransform = createFixtureWorldTransform();
  const routeFrame = createRouteFrame({ frozenBuildPlan: plan, worldTransform });
  const structuralBoard = createFixtureBoardSnapshot(plan);
  const completeBoard = createFixtureBoardSnapshot(plan, { includeTrack: true });
  const supportMap = createBuildBoardSupportMap({ frozenBuildPlan: plan, acceptedBuildBoardSnapshot: completeBoard, worldTransform });
  const body = { size: { x: 30, y: 12, z: 40 }, position: { x: 60, y: 6, z: 0 }, rotation: identityQuaternion() };
  const withoutTracks = createAcceptedRailContactProvider({ plan, boardSnapshot: structuralBoard, supportMap, routeFrame });
  assert.equal(withoutTracks.queryBodySupport(body).supported, false);
  assert.equal(withoutTracks.queryBodySupport(body).missing[0].reason, 'MISSING_ACCEPTED_TRACK');
  const complete = createAcceptedRailContactProvider({ plan, boardSnapshot: completeBoard, supportMap, routeFrame });
  assert.equal(complete.queryBodySupport(body).supported, true);
  assert.equal(complete.queryBodySupport({ ...body, size: { ...body.size, z: 20 } }).supported, false);
  const unsupportedMap = { ...supportMap, segments: supportMap.segments.map((segment) => ({ ...segment, supported: false })) };
  const noStructure = createAcceptedRailContactProvider({ plan, boardSnapshot: completeBoard, supportMap: unsupportedMap, routeFrame });
  assert.equal(noStructure.queryBodySupport(body).supported, false);
  assert.equal(noStructure.queryBodySupport(body).missing[0].reason, 'MISSING_STRUCTURE');
});
