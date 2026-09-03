import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { createMainDemoTrainSubsystem } from '../../apps/web/src/train/main-demo-train-factory.js';
import { createTrainPhysics } from '../../apps/web/src/train/train-physics.js';
import { createKinematicContactTimeline, kinematicTravelMm, measuredKinematicCollider, TCP_CONTACT_LIMITS } from '../../apps/web/src/train/train-kinematic-contact.js';
import { createRouteFrame, routeLocalPointToMachine, routeLocalQuaternionToMachine } from '../../apps/web/src/train/route-frame.js';
import { createTerrainMeshContact } from '../../apps/web/src/train-integration/terrain-mesh-contact.js';
import { createFixtureBoardSnapshot, createFixtureBuildPlan, createFixtureWorldTransform } from '../helpers/train-fixture.js';

const dt = 1 / 120;
const distance = 46.545449694691854;
const duration = 0.387879;
const clone = value => structuredClone(value);
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} != ${expected} (tolerance ${tolerance})`);
const zero = () => ({ x: 0, y: 0, z: 0 });
const routeRotation = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };

function clockedPusher(frame) {
  let pose = { frame: 'main-demo-machine-mm', positionMm: routeLocalPointToMachine(frame, { x: -300, y: 50, z: 0 }),
    rotationQuaternion: routeLocalQuaternionToMachine(frame, routeRotation) };
  let target = null, time = 100, sampleTime = time, sequence = 0, moving = false, pushing = false;
  const listeners = new Set();
  const adapter = {
    mode: 'tcp_contact', getPose: () => clone(pose),
    getSample() {
      if (!Number.isFinite(time)) throw Object.assign(new Error('Invalid observation clock.'), { code: 'INVALID_CLOCK' });
      return { ...clone(pose), sampleTimeSeconds: sampleTime, observedTimeSeconds: time,
        moving, sequence, worldRevision: sequence, robotRevision: sequence };
    },
    subscribe(listener) { listeners.add(listener); listener(adapter.getSample()); return () => listeners.delete(listener); },
    getSnapshot: () => ({ pose: clone(pose), sample: adapter.getSample(), moving, pushing, running: moving, visible: true }),
    setTargetPose(next) { target = clone(next); }, reset(next) { target = clone(next); pushing = false; },
    setVisible() {}, onPushStart() { pushing = true; }, onPushEnd() { pushing = false; },
    publish(next, seconds, inMotion = true) {
      pose = clone(next); time += seconds; sampleTime = time; sequence += 1; moving = inMotion;
      for (const listener of listeners) listener(adapter.getSample());
    },
    forward(mm, seconds, inMotion = true) {
      adapter.publish({ ...clone(target), positionMm: Object.fromEntries(['xMm', 'yMm', 'zMm'].map((axis, index) => [
        axis, target.positionMm[axis] + frame.forward[['x', 'y', 'z'][index]] * mm
      ])) }, seconds, inMotion);
    },
    elapse(seconds, inMotion = false) { time += seconds; moving = inMotion; },
    invalidateClock() { time = NaN; },
    get listenerCount() { return listeners.size; }
  };
  return adapter;
}

function rig({ yawDeg = 0, runtime = {}, motion = {}, solidContactProvider = null, wall = false } = {}) {
  const plan = createFixtureBuildPlan(), transform = createFixtureWorldTransform(yawDeg);
  const frame = createRouteFrame({ frozenBuildPlan: plan, worldTransform: transform });
  const board = createFixtureBoardSnapshot(plan, { supportedColumns: 0, includeTrack: false });
  const pusher = clockedPusher(frame);
  if (wall) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1200, 2, 300), new THREE.MeshBasicMaterial());
    floor.name = 'test-floor'; floor.position.set(250, -1, 0);
    const obstacle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 120, 150), new THREE.MeshBasicMaterial());
    obstacle.name = 'test-obstruction'; obstacle.position.set(110, 60, 0);
    solidContactProvider = createTerrainMeshContact({ routeFrame: frame, solidMeshes: [floor, obstacle], meshCoordinateFrame: 'route' });
  }
  const subsystem = createMainDemoTrainSubsystem({
    getFrozenBuildPlan: () => plan, getAcceptedBuildBoardSnapshot: () => board, getWorldTransform: () => transform,
    motionMode: 'tcp_contact', pusher: { adapter: pusher }, solidContactProvider,
    // Explicit deterministic fixture floor; never a production terrain substitute.
    surfaceProvider: { sample: () => ({ heightMm: 0, kind: 'test-floor', normal: { x: 0, y: 1, z: 0 } }) },
    trainProfile: {
      bodySizesMm: [{ xMm: 88, yMm: 34, zMm: 34 }, { xMm: 70.4, yMm: 30, zMm: 32 }, { xMm: 70.4, yMm: 30, zMm: 32 }],
      leadStartForwardMm: 54.56, gapMm: 12.8, pusherSizeMm: { xMm: 28, yMm: 38, zMm: 34 },
      pusherRotationQuaternion: routeLocalQuaternionToMachine(frame, routeRotation)
    },
    settings: { runtime, motion }
  });
  return { ...subsystem, pusher, frame,
    arm() {
      assert.equal(subsystem.service.startTest().ok, true);
      pusher.publish(subsystem.service.getPushStartPose(), dt, false);
      const armed = subsystem.service.armPhysicalPush();
      assert.equal(armed.ok, true, JSON.stringify(armed));
      return subsystem.service.getSnapshot();
    }
  };
}

function drain(system) {
  for (let frame = 0; frame < 100; frame += 1) {
    system.updateFrame(0);
    const snapshot = system.service.getSnapshot();
    if (snapshot.state === 'FAILED' || snapshot.physicalContact.sampling.availableSeconds <= 1e-9) return snapshot;
  }
  assert.fail('The bounded timestamp backlog did not drain.');
}

function assertSameIsland(snapshot) {
  assert.equal(snapshot.counts.dynamicBodies, 3);
  assert.equal(snapshot.counts.couplerJoints, 2);
  assert.ok(snapshot.couplers.every(coupler => coupler.constraintType !== 'analytic-spacing'));
}

function assertBodiesNear(first, second, tolerance = 1e-5) {
  first.poses.forEach((body, index) => {
    for (const axis of ['forwardMm', 'upMm', 'rightMm']) {
      near(body.routeLocal.positionMm[axis], second.poses[index].routeLocal.positionMm[axis], tolerance);
    }
    for (const axis of ['forwardMmPerSecond', 'upMmPerSecond', 'rightMmPerSecond']) {
      near(body.routeLocal.linearVelocityMmPerSecond[axis], second.poses[index].routeLocal.linearVelocityMmPerSecond[axis], tolerance);
    }
  });
}

for (const yawDeg of [0, 90]) test(`production-size 46.545 mm coarse interval matches fine measured integration at yaw ${yawDeg}`, t => {
  const coarse = rig({ yawDeg }), fine = rig({ yawDeg });
  t.after(() => { coarse.dispose(); fine.dispose(); });
  coarse.arm(); fine.arm();
  coarse.pusher.forward(distance, duration);
  const coarseSnapshot = drain(coarse);
  let elapsed = 0;
  while (elapsed < duration - 1e-10) {
    const next = Math.min(duration, elapsed + dt);
    fine.pusher.forward(distance * next / duration, next - elapsed);
    fine.updateFrame(next - elapsed);
    elapsed = next;
  }
  const fineSnapshot = drain(fine);
  assert.notEqual(coarseSnapshot.state, 'FAILED', JSON.stringify(coarseSnapshot.result));
  assert.notEqual(fineSnapshot.state, 'FAILED', JSON.stringify(fineSnapshot.result));
  assertBodiesNear(coarseSnapshot, fineSnapshot);
  for (const snapshot of [coarseSnapshot, fineSnapshot]) {
    assertSameIsland(snapshot);
    near(snapshot.physicalContact.sampling.integratedSeconds, duration);
    near(snapshot.physicalContact.sampling.availableSeconds, 0);
    assert.ok(snapshot.physicalContact.diagnostics.maximumPenetrationMm < 1);
    assert.ok(snapshot.physicalContact.diagnostics.maximumResidualPusherPenetrationMm <= 0.25);
    near(snapshot.poses[2].routeLocal.positionMm.upMm, 15, 0.02);
    assert.notEqual(snapshot.state, 'CROSSED', 'this fixture is not a supported production crossing');
  }
  assert.equal(coarseSnapshot.physicalContact.sampleCount, 1);
  assert.equal(fineSnapshot.physicalContact.sampleCount, 47);
  t.diagnostic(JSON.stringify({ yawDeg, coarsePeakPenetrationMm: coarseSnapshot.physicalContact.diagnostics.maximumPenetrationMm,
    finePeakPenetrationMm: fineSnapshot.physicalContact.diagnostics.maximumPenetrationMm,
    coarseResidualPenetrationMm: coarseSnapshot.physicalContact.diagnostics.maximumResidualPusherPenetrationMm,
    integratedSeconds: coarseSnapshot.physicalContact.sampling.integratedSeconds,
    physicsSteps: coarseSnapshot.counts.physicsSteps }));
});

for (const [speed, seconds] of [[120, dt + 0.95e-9], [1000, 0.0010000005]]) {
  test(`near-boundary ${speed} mm/s endpoint is fully integrated without exceeding the spatial step limit`, t => {
    const system = rig(); t.after(() => system.dispose()); const armed = system.arm();
    const initialBodies = system.service.getInitialPoses();
    const physics = createTrainPhysics();
    physics.promote(initialBodies, 0, { angularVelocities: initialBodies.map(zero),
      lateralSpeedsMmPerSecond: [0, 0, 0], verticalSpeedsMmPerSecond: [0, 0, 0] });
    const first = { ...armed.physicalContact.lastStepCollider,
      position: { x: -1000, y: 100, z: 0 }, sampleTimeSeconds: 10, sequence: 0 };
    const second = { ...first, position: { ...first.position, x: first.position.x + speed * seconds },
      sampleTimeSeconds: first.sampleTimeSeconds + seconds, sequence: 1 };
    const timeline = createKinematicContactTimeline({ bodies: initialBodies, initial: first, observedTimeSeconds: 10 });
    timeline.recordSource(second);
    let integratedSeconds = 0, count = 0;
    while (timeline.getSnapshot().availableSeconds > 0) {
      const slice = timeline.nextSlice(dt);
      const before = { ...slice.collider, position: slice.collider.previousPosition, rotation: slice.collider.previousRotation };
      assert.ok(kinematicTravelMm(before, slice.collider) <= TCP_CONTACT_LIMITS.maximumTravelMm + TCP_CONTACT_LIMITS.travelEpsilonMm);
      assert.ok(slice.durationSeconds <= dt + TCP_CONTACT_LIMITS.timeEpsilonSeconds);
      assert.ok(slice.durationSeconds > 1e-6, 'the boundary must not create a nanosecond PBD step');
      assert.doesNotThrow(() => physics.step(slice.durationSeconds, { motionMode: 'tcp_contact', kinematicCollider: slice.collider }));
      timeline.commit(slice);
      integratedSeconds += slice.durationSeconds;
      assert.ok(++count <= 2, 'the one-step boundary needs at most two bounded slices');
    }
    assert.equal(count, 2);
    assert.equal(timeline.getSnapshot().consumedSampleCount, 1);
    assert.equal(timeline.getSnapshot().integratedTimeSeconds, second.sampleTimeSeconds);
    near(integratedSeconds, seconds, 1e-12);
    assert.equal(timeline.getSnapshot().droppedSeconds, 0);
    system.pusher.forward(speed * seconds, seconds);
    const throughRuntime = drain(system);
    assert.notEqual(throughRuntime.state, 'FAILED', JSON.stringify(throughRuntime.result));
    assert.equal(throughRuntime.counts.physicsSteps, 2);
    assert.equal(throughRuntime.physicalContact.sampling.availableSeconds, 0);
    near(throughRuntime.physicalContact.sampling.integratedSeconds, seconds, 1e-12);
  });
}

test('an unchanged sample after the coarse interval cannot eject the rear carriage vertically', t => {
  const system = rig(); t.after(() => system.dispose()); system.arm();
  system.pusher.forward(distance, duration);
  const before = drain(system);
  system.pusher.forward(distance, dt);
  const after = drain(system);
  assert.notEqual(after.state, 'FAILED', JSON.stringify(after.result));
  near(after.poses[2].routeLocal.positionMm.upMm, before.poses[2].routeLocal.positionMm.upMm, 0.02);
  near(after.physicalContact.lastStepCollider.linearVelocity.x, 0);
  near(after.physicalContact.sampling.integratedSeconds, duration + dt);
  assert.equal(after.physicalContact.sampleCount, 2);
  assert.ok(after.physicalContact.diagnostics.maximumResidualPusherPenetrationMm <= 0.25);
});

test('subscription retains every batched endpoint, including reversals, and consumes each interval once', t => {
  const batched = rig(), streamed = rig(); t.after(() => { batched.dispose(); streamed.dispose(); });
  batched.arm(); streamed.arm();
  const path = [1, 2, 3, 4, 3, 2, 3, 4, 5, 6];
  for (const mm of path) {
    batched.pusher.forward(mm, dt);
    streamed.pusher.forward(mm, dt); streamed.updateFrame(dt);
  }
  const batch = drain(batched), live = drain(streamed);
  assertBodiesNear(batch, live);
  assert.equal(batch.physicalContact.sampleCount, path.length);
  assert.equal(batch.physicalContact.sampling.receivedSampleCount, path.length);
  near(batch.physicalContact.sampling.integratedSeconds, path.length * dt);
  const count = batch.counts.physicsSteps;
  batched.updateFrame(100);
  assert.equal(batched.service.getCounts().physicsSteps, count, 'frame dt cannot replay measured time');
});

test('frame budget retains explicit lag, does not clamp away sample time, and keeps displayed TCP current', t => {
  const system = rig({ runtime: { maximumCatchUpSteps: 4, maximumFrameDeltaSeconds: 0.001 } });
  t.after(() => system.dispose()); system.arm();
  system.pusher.forward(distance, duration);
  const first = system.updateFrame(0.75);
  assert.equal(first.fixedSteps, 4);
  assert.equal(first.clock, 'authoritative-tcp-monotonic');
  assert.ok(first.integrationLagSeconds > 0.3);
  assert.deepEqual(first.snapshot.pusher.pose, system.pusher.getPose());
  assert.ok(first.snapshot.pusher.collider.position.x > first.snapshot.physicalContact.lastStepCollider.position.x + 30);
  assertSameIsland(first.snapshot);
  const final = drain(system);
  near(final.physicalContact.sampling.integratedSeconds, duration);
  near(final.physicalContact.sampling.lagSeconds, 0);
  assert.equal(system.runtime.getStats().droppedCatchUpSeconds, 0);
  const before = final.counts.physicsSteps;
  system.updateFrame(999);
  assert.equal(system.service.getCounts().physicsSteps, before);
});

test('in-flight reads wait for the measured endpoint; confirmed idle observations advance only stationary time', t => {
  const system = rig(); t.after(() => system.dispose()); system.arm();
  system.pusher.elapse(0.02, true);
  const waiting = system.updateFrame(0.02);
  assert.equal(waiting.fixedSteps, 0);
  near(waiting.snapshot.physicalContact.sampling.waitingForEndpointSeconds, 0.02);
  system.pusher.forward(1, 0.03);
  const moved = drain(system);
  near(moved.physicalContact.sampling.integratedSeconds, 0.05);
  near(moved.physicalContact.lastStepCollider.linearVelocity.x, 20);
  system.pusher.elapse(0.025, false);
  const held = drain(system);
  near(held.physicalContact.sampling.integratedSeconds, 0.075);
  near(held.physicalContact.lastStepCollider.linearVelocity.x, 0);
  assert.equal(held.physicalContact.sampleCount, 1, 'clock reads are not source motion samples');
});

test('an excessive measured backlog fails before any Train integration and never discards it as frame catch-up', t => {
  const system = rig(); t.after(() => system.dispose()); const before = system.arm();
  system.pusher.forward(distance, TCP_CONTACT_LIMITS.maximumBacklogSeconds + 0.1);
  const failed = system.updateFrame(5).snapshot;
  assert.equal(failed.state, 'FAILED');
  assert.equal(failed.result.cause, 'TCP_SAMPLE_BACKLOG');
  assert.equal(failed.result.outcome, 'TRAIN_CONTACT_FAILED');
  assert.equal(failed.counts.physicsSteps, 0);
  assertBodiesNear(failed, before);
  assert.equal(system.pusher.listenerCount, 0);
  assert.equal(system.runtime.getStats().droppedCatchUpSeconds, 0);
});

test('excessive endpoint count fails before queued movement reaches physics', t => {
  const system = rig(); t.after(() => system.dispose()); system.arm();
  for (let index = 0; index <= TCP_CONTACT_LIMITS.maximumQueuedIntervals; index++) system.pusher.forward(0, 0.0001);
  const failed = system.updateFrame(1).snapshot;
  assert.equal(failed.result.cause, 'TCP_SAMPLE_BACKLOG');
  assert.equal(failed.counts.physicsSteps, 0);
  assert.equal(failed.physicalContact.sampling.droppedSeconds, 0);
});

test('physics rejects an unbounded pusher step before gravity, contact, or coupler mutation', t => {
  const system = rig(); t.after(() => system.dispose()); const armed = system.arm();
  const physics = createTrainPhysics(), initial = system.service.getInitialPoses();
  physics.promote(initial, 0, { angularVelocities: initial.map(zero), lateralSpeedsMmPerSecond: [0, 0, 0], verticalSpeedsMmPerSecond: [0, 0, 0] });
  const before = physics.snapshot(), start = armed.physicalContact.lastStepCollider;
  const end = { ...start, position: { ...start.position, x: start.position.x + distance } };
  const collider = measuredKinematicCollider(start, end, duration);
  assert.throws(() => physics.step(dt, { motionMode: 'tcp_contact', kinematicCollider: collider }), { code: 'TCP_CONTACT_STEP_UNBOUNDED' });
  assert.deepEqual(physics.snapshot(), before);
  assert.equal(physics.getCounts().physicsSteps, 0);
});

test('a real thin terrain wall stops the coarse-sample island without tunneling or CROSSED', t => {
  const system = rig({ wall: true }); t.after(() => system.dispose()); system.arm();
  system.pusher.forward(distance, duration);
  const failed = drain(system);
  assert.equal(failed.state, 'FAILED');
  assert.equal(failed.result.cause, 'TERRAIN_OBSTRUCTION', JSON.stringify(failed.result));
  assert.equal(failed.result.outcome, 'TRAIN_COLLIDED');
  assert.equal(failed.physicalContact.diagnostics.lastSolidContact.sourceId, 'test-obstruction');
  assert.ok(failed.poses[0].routeLocal.positionMm.forwardMm + 44 <= 109.75 + 0.25);
  assert.ok(failed.physicalContact.diagnostics.maximumResidualPusherPenetrationMm <= 0.25);
  assert.ok(failed.physicalContact.diagnostics.maximumResidualSolidPenetrationMm <= 0.25);
  assertSameIsland(failed);
});

test('excessive residual pusher overlap is a solver failure, not a fabricated terrain collision', t => {
  const system = rig({ motion: { pusherClearanceMm: -20 } }); t.after(() => system.dispose()); system.arm();
  system.pusher.elapse(dt, false);
  const failed = system.updateFrame(dt).snapshot;
  assert.equal(failed.result.outcome, 'TRAIN_CONTACT_FAILED');
  assert.equal(failed.result.cause, 'TCP_CONTACT_RESIDUAL');
  assert.equal(failed.physicalContact.diagnostics.solidCollisionCount, 0);
  assert.ok(failed.physicalContact.diagnostics.maximumResidualPusherPenetrationMm > 0.25);
});

for (const penetrationMm of [NaN, Infinity, undefined, '0', null]) test(`non-finite or nonnumeric final terrain penetration fails closed (${String(penetrationMm)})`, t => {
  const provider = { queryBodyContacts: ({ body, contactMarginMm }) => ({ contacts: contactMarginMm === 0 ? [{
    point: clone(body.position), normal: { x: 0, y: 1, z: 0 }, penetrationMm,
    kind: 'terrain-ground', sourceId: 'invalid-test-provider'
  }] : [] }) };
  const system = rig({ solidContactProvider: provider }); t.after(() => system.dispose()); system.arm();
  system.pusher.elapse(dt);
  const failed = system.updateFrame(dt).snapshot;
  assert.equal(failed.result.outcome, 'TRAIN_CONTACT_FAILED');
  assert.equal(failed.result.cause, 'INVALID_TERRAIN_CONTACT');
});

test('a finite but unresolved terrain residual fails with its distinct solver cause', t => {
  const provider = { queryBodyContacts: ({ body }) => ({ contacts: [{ point: clone(body.position), normal: { x: 0, y: 1, z: 0 },
    penetrationMm: 5, kind: 'terrain-ground', sourceId: 'unsatisfiable-test-provider' }] }) };
  const system = rig({ solidContactProvider: provider }); t.after(() => system.dispose()); system.arm();
  system.pusher.elapse(dt);
  const failed = system.updateFrame(dt).snapshot;
  assert.equal(failed.result.cause, 'TERRAIN_CONTACT_RESIDUAL');
  assert.equal(failed.result.outcome, 'TRAIN_CONTACT_FAILED');
  assert.equal(failed.physicalContact.diagnostics.maximumResidualSolidPenetrationMm, 5);
});

test('stop, reset and dispose detach sample subscriptions and cannot replay old queued motion', t => {
  const system = rig(); t.after(() => system.dispose());
  assert.equal(system.pusher.listenerCount, 0);
  system.arm(); assert.equal(system.pusher.listenerCount, 1);
  system.pusher.forward(distance, duration);
  const stopped = system.service.stopTest();
  assert.equal(system.pusher.listenerCount, 0);
  system.pusher.forward(distance + 1, dt);
  assert.deepEqual(system.updateFrame(1).snapshot.poses, stopped.poses);
  system.service.resetTrain({ instant: true });
  assert.equal(system.service.getSnapshot().physicalContact.sampling, null);
  assert.equal(system.pusher.listenerCount, 0);
  system.arm(); assert.equal(system.pusher.listenerCount, 1);
  system.service.resetTrain({ instant: true });
  assert.equal(system.pusher.listenerCount, 0);
  system.arm(); assert.equal(system.service.getSnapshot().physicalContact.sampleCount, 0);
  system.dispose(); assert.equal(system.pusher.listenerCount, 0);
});

test('an invalid observation clock reports failure without hiding the exact live TCP pose', t => {
  const system = rig(); t.after(() => system.dispose()); system.arm();
  const pose = system.pusher.getPose();
  system.pusher.invalidateClock();
  const failed = system.updateFrame(dt).snapshot;
  assert.equal(failed.result.outcome, 'TRAIN_CONTACT_FAILED');
  assert.equal(failed.result.cause, 'INVALID_TCP_SAMPLE');
  assert.equal(failed.counts.physicsSteps, 0);
  assert.deepEqual(failed.pusher.pose, pose);
  assert.match(failed.pusher.observationError, /clock/);
  assert.equal(system.pusher.listenerCount, 0);
});
