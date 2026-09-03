import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { createMainDemoTrainSubsystem } from '../../apps/web/src/train/main-demo-train-factory.js';
import { createTrainRuntime } from '../../apps/web/src/train/train-runtime.js';
import { createRouteFrame, routeLocalPointToMachine, routeLocalQuaternionToMachine } from '../../apps/web/src/train/route-frame.js';
import { identityQuaternion } from '../../apps/web/src/train/math.js';
import { createTerrainMeshContact } from '../../apps/web/src/train-integration/terrain-mesh-contact.js';
import { createFixtureBoardSnapshot, createFixtureBuildPlan, createFixtureWorldTransform } from '../helpers/train-fixture.js';

const dt = 1 / 120;
const clone = value => structuredClone(value);
const smallTestProfile = () => ({
  bodySizesMm: Array.from({ length: 3 }, () => ({ xMm: 30, yMm: 12, zMm: 40 })),
  gapMm: 8, leadStartForwardMm: 70, pusherSizeMm: { xMm: 6, yMm: 12, zMm: 40 }
});

function measuredTestPusher(frame) {
  let actual = { frame: 'main-demo-machine-mm', positionMm: routeLocalPointToMachine(frame, { x: -80, y: 50, z: 30 }),
    rotationQuaternion: routeLocalQuaternionToMachine(frame, identityQuaternion()) };
  let target = null, time = 10, sampleTime = 10, sequence = 0, moving = false, pushing = false, visible = true, notifyCount = 0;
  const listeners = new Set();
  const publish = () => { sampleTime = time; sequence += 1; for (const listener of listeners) listener(adapter.getSample()); };
  const adapter = {
    mode: 'tcp_contact',
    getPose: () => clone(actual),
    getSample: () => ({ ...clone(actual), sampleTimeSeconds: sampleTime, observedTimeSeconds: time, moving,
      sequence, worldRevision: sequence, robotRevision: sequence }),
    subscribe(listener) { listeners.add(listener); listener(adapter.getSample()); return () => listeners.delete(listener); },
    setTargetPose(pose) { target = clone(pose); },
    getTargetPose: () => clone(target),
    // Deliberately untrustworthy readiness shortcuts: the service must ignore both.
    isAtTarget: () => true,
    notifyReady() { notifyCount += 1; },
    onPushStart() { pushing = true; },
    onPushEnd() { pushing = false; },
    reset(pose) { target = clone(pose); pushing = false; },
    setVisible(value) { visible = Boolean(value); },
    getSnapshot: () => ({ pose: clone(actual), sample: adapter.getSample(), pushing, visible }),
    setActual(pose, seconds = dt) { actual = clone(pose); time += seconds; moving = false; publish(); },
    moveForward(distanceMm, seconds = dt) {
      actual = { ...clone(target), positionMm: {
        xMm: target.positionMm.xMm + frame.forward.x * distanceMm,
        yMm: target.positionMm.yMm + frame.forward.y * distanceMm,
        zMm: target.positionMm.zMm + frame.forward.z * distanceMm
      } };
      time += seconds; moving = true; publish();
    },
    elapse(seconds) { time += seconds; moving = false; },
    corruptSample() { time -= 1; sampleTime -= 1; sequence -= 1; },
    get notifyCount() { return notifyCount; }
  };
  return adapter;
}

function rig({ columns = 16, includeTrack = true, missingOneStructuralPart = false, yawDeg = 0,
  trainProfile = smallTestProfile(), flatEverywhere = false, meshes = null } = {}) {
  const plan = createFixtureBuildPlan(), worldTransform = createFixtureWorldTransform(yawDeg);
  const frame = createRouteFrame({ frozenBuildPlan: plan, worldTransform });
  let board = createFixtureBoardSnapshot(plan, { supportedColumns: columns, includeTrack });
  if (missingOneStructuralPart) board.acceptedPlacementIds = board.acceptedPlacementIds.filter(id => id !== `${plan.planId}.s.0.0`);
  const pusher = measuredTestPusher(frame);
  // Authored unit-test banks only. Production receives the actual terrain mesh.
  const surfaceProvider = { sample: ({ forwardMm }) => (flatEverywhere || forwardMm < 0 || forwardMm > frame.lengthMm)
    ? { heightMm: 0, kind: 'authored-test-bank', normal: { x: 0, y: 1, z: 0 } } : null };
  const solidContactProvider = meshes ? createTerrainMeshContact({ routeFrame: frame, solidMeshes: meshes, meshCoordinateFrame: 'route' }) : null;
  const subsystem = createMainDemoTrainSubsystem({
    getFrozenBuildPlan: () => plan, getAcceptedBuildBoardSnapshot: () => board, getWorldTransform: () => worldTransform,
    pusher: { adapter: pusher }, motionMode: 'tcp_contact', trainProfile,
    surfaceProvider, solidContactProvider,
    settings: { motion: { trainSpeedMmPerSecond: 450, pushDistanceMm: 64 } }
  });
  return { ...subsystem, plan, frame, pusher,
    repair() { board = createFixtureBoardSnapshot(plan, { includeTrack: true, worldRevision: board.worldRevision + 1 }); },
    arm() {
      const prepared = subsystem.service.prepareTest();
      assert.equal(prepared.ok, true, JSON.stringify(prepared));
      pusher.setActual(subsystem.service.getPushStartPose());
      const armed = subsystem.service.armPhysicalPush();
      assert.equal(armed.ok, true, JSON.stringify(armed));
      return armed;
    },
    push() {
      for (let distance = 1; distance <= 64; distance += 1) {
        pusher.moveForward(distance, dt);
        subsystem.service.step(dt);
      }
      return subsystem.service.getSnapshot();
    }
  };
}

function assertChain(snapshot) {
  assert.equal(snapshot.counts.dynamicBodies, 3);
  assert.equal(snapshot.counts.couplerJoints, 2);
  assert.equal(snapshot.couplers.length, 2);
  assert.ok(snapshot.couplers.every(coupler => coupler.constraintType !== 'analytic-spacing'));
}

function observedStep(system, seconds = dt) {
  system.pusher.elapse(seconds);
  return system.service.step(seconds);
}

function runObservedToTerminal(system, maximumSeconds = 20) {
  for (let index = 0; index < Math.ceil(maximumSeconds / dt); index++) {
    if (['FAILED', 'CROSSED', 'STOPPED'].includes(system.service.getState())) break;
    observedStep(system);
  }
  return system.service.getSnapshot();
}

test('factory forwards explicit contact/profile settings and idle render follows actual TCP without physics', () => {
  const system = rig();
  const before = system.service.getSnapshot();
  assert.equal(before.motion.mode, 'tcp_contact');
  assert.equal(before.poses[0].sizeMm.yMm, 12);
  assertChain(before);
  assert.notDeepEqual(before.pusher.pose.positionMm, before.pusher.targetPose.positionMm);
  const renders = [];
  const runtime = createTrainRuntime({ service: system.service, renderer: { update: snapshot => renders.push(snapshot), dispose() {} } });
  const actual = system.pusher.getPose();
  actual.positionMm.xMm += 7;
  actual.rotationQuaternion = { x: 0.5, y: 0.5, z: 0.5, w: 0.5 };
  system.pusher.setActual(actual);
  const frame = runtime.updateFrame(1 / 60);
  assert.equal(frame.fixedSteps, 0);
  assert.equal(frame.active, false);
  assert.equal(frame.snapshot.counts.physicsSteps, 0);
  assert.deepEqual(frame.snapshot.poses, before.poses);
  assert.deepEqual(renders.at(-1).pusher.pose, actual);
  const renderCount = renders.length;
  runtime.updateFrame(1 / 60);
  assert.equal(renders.length, renderCount, 'an unchanged idle TCP does not demand another render');
  runtime.dispose();
});

test('actual position and orientation gate physical readiness; notification and isAtTarget cannot bypass it', () => {
  const system = rig();
  assert.equal(system.service.prepareTest().snapshot.state, 'POSITIONING_PUSHER');
  const target = system.service.getPushStartPose();
  assert.equal(system.service.notifyPusherReady(target).state, 'POSITIONING_PUSHER');
  assert.equal(system.pusher.notifyCount, 0);
  assert.equal(system.service.armPhysicalPush().ok, false);
  system.pusher.setActual({ ...target, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } });
  assert.equal(system.service.armPhysicalPush().ok, false);
  system.pusher.setActual(target);
  assert.equal(system.service.step(0), false);
  assert.equal(system.service.getState(), 'POSITIONING_PUSHER');
  assert.equal(system.service.getSnapshot().physicalContact.startReady, true);
  assert.equal(system.service.getSnapshot().elapsedMs, 0);
  assert.equal(system.service.getSnapshot().counts.physicsSteps, 0);
  assert.equal(system.service.armPhysicalPush().ok, true);
  assertChain(system.service.getSnapshot());
  system.dispose();
});

test('TCP already at the start pose never auto-arms contact physics before the owned stroke callback', () => {
  const system = rig();
  system.pusher.setActual(system.service.getPushStartPose());
  const reasons = [];
  const unsubscribe = system.service.subscribe((snapshot, reason) => reasons.push(reason));
  const started = system.service.startTest();
  assert.equal(started.ok, true);
  assert.equal(started.waitingForPusher, true);
  assert.equal(started.snapshot.state, 'POSITIONING_PUSHER');
  assert.equal(started.snapshot.physicalContact.startReady, true);
  const initial = system.service.getPoses();
  for (let index = 0; index < 12; index += 1) system.service.step(dt);
  assert.equal(system.service.notifyPusherReady(system.service.getPushStartPose()).state, 'POSITIONING_PUSHER');
  assert.equal(system.service.pushEvent().ok, false);
  // The real robot may leave an already-aligned pose to perform its safe
  // approach. Those measured poses must not run Train physics before onAtStart.
  system.pusher.moveForward(-20, 0.25);
  system.service.step(dt);
  system.pusher.setActual(system.service.getPushStartPose(), 0.25);
  system.service.step(dt);
  assert.equal(system.service.getState(), 'POSITIONING_PUSHER');
  assert.equal(system.service.getSnapshot().counts.physicsSteps, 0);
  assert.equal(system.service.getSnapshot().pusher.engaged, false);
  assert.deepEqual(system.service.getPoses(), initial);
  assert.equal(reasons.includes('PUSH_START'), false);
  assert.equal(system.service.armPhysicalPush().ok, true);
  assert.equal(system.service.getState(), 'PUSHING');
  assert.equal(system.service.getSnapshot().counts.physicsSteps, 0);
  observedStep(system);
  assert.equal(system.service.getSnapshot().counts.physicsSteps, 1);
  unsubscribe();
  system.dispose();
});

test('stationary TCP leaves the linked train stationary even when a nonzero target speed was configured', () => {
  const system = rig();
  system.arm();
  const before = system.service.getPoses();
  for (let index = 0; index < 240; index += 1) observedStep(system);
  const snapshot = system.service.getSnapshot();
  assert.equal(snapshot.state, 'PUSHING');
  snapshot.poses.forEach((pose, index) => {
    assert.ok(Math.abs(pose.routeLocal.positionMm.forwardMm - before[index].position.x) < 1e-6);
    assert.ok(Math.abs(pose.routeLocal.linearVelocityMmPerSecond.forwardMmPerSecond) < 1e-6);
  });
  assert.equal(snapshot.physicalContact.diagnostics.impulseCount, 0);
  assert.equal(snapshot.motion.pushDistanceTravelledMm, 0);
  assertChain(snapshot);
  system.dispose();
});

test('measured sample time supplies contact speed and its interval is consumed once across catch-up steps', () => {
  const system = rig();
  system.arm();
  system.pusher.moveForward(1, 1 / 60);
  system.service.step(dt);
  let snapshot = system.service.getSnapshot();
  assert.ok(Math.abs(snapshot.physicalContact.lastStepCollider.linearVelocity.x - 60) < 1e-6);
  assert.equal(snapshot.physicalContact.sampleCount, 0, 'only the first half of this source interval has been integrated');
  system.service.step(dt);
  snapshot = system.service.getSnapshot();
  assert.ok(Math.abs(snapshot.physicalContact.lastStepCollider.linearVelocity.x - 60) < 1e-6);
  assert.equal(snapshot.physicalContact.sampleCount, 1);
  observedStep(system);
  snapshot = system.service.getSnapshot();
  assert.equal(snapshot.physicalContact.lastStepCollider.linearVelocity.x, 0);
  assert.equal(snapshot.physicalContact.sampleCount, 1, 'the completed interval is not replayed');
  system.dispose();
});

for (const yawDeg of [0, 90]) test(`physical contact/coast crosses only after all trailing extents clear EXIT at yaw ${yawDeg}`, () => {
  const system = rig({ yawDeg });
  system.arm();
  const pushed = system.push();
  assert.equal(pushed.state, 'RUNNING_SUPPORTED', JSON.stringify(pushed.result));
  assert.ok(pushed.physicalContact.diagnostics.impulseCount > 0);
  assert.ok(pushed.motion.currentSpeedMmPerSecond > 30 && pushed.motion.currentSpeedMmPerSecond < 160);
  assertChain(pushed);
  let observedLeadOnly = false;
  for (let index = 0; index < 2400; index += 1) {
    const snapshot = system.service.getSnapshot();
    if (snapshot.poses[0].routeLocal.positionMm.forwardMm > system.frame.lengthMm && !snapshot.physicalContact.crossing.allBodiesClearExit) {
      observedLeadOnly = true;
      assert.notEqual(snapshot.state, 'CROSSED');
    }
    if (['CROSSED', 'FAILED', 'STOPPED'].includes(snapshot.state)) break;
    observedStep(system);
  }
  const crossed = system.service.getSnapshot();
  assert.equal(crossed.state, 'CROSSED', JSON.stringify(crossed.result));
  assert.equal(observedLeadOnly, true);
  assert.equal(crossed.physicalContact.crossing.continuousAcceptedRoute, true);
  assert.ok(crossed.result.crossing.trailingExtents.every(extent => extent.forwardMm >= system.frame.lengthMm));
  assertChain(crossed);
  system.dispose();
});

test('partial support causes a physical drop/derail with the same bodies/couplers; repaired measured retest can cross', () => {
  const system = rig({ columns: 8 });
  system.arm();
  system.push();
  let falling = null;
  for (let index = 0; index < 2400 && !['FAILED', 'CROSSED'].includes(system.service.getState()); index += 1) {
    observedStep(system);
    if (system.service.getState() === 'FALLING') falling ??= system.service.getSnapshot();
  }
  const failed = system.service.getSnapshot();
  assert.ok(falling, JSON.stringify(failed.result));
  assertChain(falling);
  assert.ok(falling.counts.physicsSteps > 64, 'support loss does not re-promote/reset the active physics island');
  assert.equal(failed.state, 'FAILED');
  assert.equal(failed.result.outcome, 'TRAIN_FELL');
  assert.equal(failed.result.cause, 'SUPPORT_LOSS');
  assert.ok(falling.poses.some(pose => pose.routeLocal.linearVelocityMmPerSecond.upMmPerSecond < -1),
    'support loss must include measured downward motion, not only a result flag');
  assert.ok(failed.poses.some(pose => Math.abs(pose.routeLocal.rotationQuaternion.x) > 0.1
    || Math.abs(pose.routeLocal.rotationQuaternion.z) > 0.1), 'the remaining bridge may catch the linked, derailed consist');
  assertChain(failed);
  const actual = system.pusher.getPose();
  system.repair();
  system.service.resetTrain({ instant: true });
  assert.deepEqual(system.pusher.getPose(), actual, 'train reset does not teleport the authoritative TCP');
  assertChain(system.service.getSnapshot());
  system.arm();
  system.push();
  assert.equal(runObservedToTerminal(system, 20).state, 'CROSSED');
  system.dispose();
});

test('a wholly unsupported consist physically falls below the former fallback floor, which is not support', () => {
  const profile = smallTestProfile();
  profile.leadStartForwardMm = 120;
  const system = rig({ columns: 0, includeTrack: false, trainProfile: profile });
  system.arm();
  const snapshot = runObservedToTerminal(system, 20);
  assert.equal(snapshot.state, 'FAILED');
  assert.equal(snapshot.result.outcome, 'TRAIN_FELL');
  assert.equal(snapshot.result.settleTimedOut, true, 'empty space cannot report resting on a fallback floor');
  assert.ok(snapshot.poses.every(pose => pose.routeLocal.positionMm.upMm < -300));
  assert.equal(snapshot.physicalContact.diagnostics.impulseCount, 0, 'this failure comes from gravity, not a launch kick');
  assertChain(snapshot);
  system.dispose();
});

test('structural support without accepted rails cannot turn a physical traverse into CROSSED', () => {
  const system = rig({ includeTrack: false, flatEverywhere: true });
  system.arm(); system.push();
  const snapshot = runObservedToTerminal(system, 20);
  assert.equal(snapshot.state, 'FAILED');
  assert.equal(snapshot.result.cause, 'UNPROVEN_CONTINUOUS_RAIL_SUPPORT');
  assert.equal(snapshot.physicalContact.rail.acceptedTrackCount, 0);
  assert.equal(snapshot.physicalContact.crossing.continuousAcceptedRoute, false);
  assertChain(snapshot);
  system.dispose();
});

test('a permissive local support ratio cannot substitute for a fully accepted structural BuildPlan', () => {
  const system = rig({ missingOneStructuralPart: true });
  system.arm(); system.push();
  const snapshot = runObservedToTerminal(system, 20);
  assert.equal(snapshot.physicalContact.rail.allSupported, true);
  assert.equal(snapshot.physicalContact.rail.allRequiredPartsAccepted, false);
  assert.equal(snapshot.physicalContact.rail.missingRequiredPlacementCount, 1);
  assert.equal(snapshot.state, 'FAILED');
  assert.equal(snapshot.result.cause, 'UNPROVEN_CONTINUOUS_RAIL_SUPPORT');
  system.dispose();
});

test('a train narrower than the actual rail gauge cannot receive rail support', () => {
  const profile = smallTestProfile();
  profile.bodySizesMm.forEach(size => { size.zMm = 20; });
  const system = rig({ trainProfile: profile });
  system.arm(); system.push();
  const snapshot = runObservedToTerminal(system, 20);
  assert.equal(snapshot.state, 'FAILED');
  assert.equal(snapshot.result.outcome, 'TRAIN_FELL');
  assert.equal(snapshot.physicalContact.crossing.allBodiesHadRailContact, false);
  assertChain(snapshot);
  system.dispose();
});

test('solid-contact provider reaches the same physics path and a real mesh wall prevents crossing', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1200, 2, 100), new THREE.MeshBasicMaterial());
  floor.name = 'authored-test-floor'; floor.position.set(300, -1, 0);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 100, 100), new THREE.MeshBasicMaterial());
  wall.name = 'authored-test-wall'; wall.position.set(150, 50, 0);
  const system = rig({ meshes: [floor, wall] });
  system.arm(); system.push();
  const snapshot = runObservedToTerminal(system, 20);
  assert.equal(snapshot.state, 'FAILED');
  assert.equal(snapshot.result.cause, 'TERRAIN_OBSTRUCTION');
  assert.ok(snapshot.physicalContact.diagnostics.solidCollisionCount > 0);
  assert.equal(snapshot.physicalContact.diagnostics.lastSolidContact.kind, 'terrain-wall');
  assertChain(snapshot);
  system.dispose();
});

test('invalid motion samples fail closed and cannot fabricate a launch impulse', () => {
  const system = rig();
  system.arm();
  system.pusher.corruptSample();
  system.service.step(dt);
  const snapshot = system.service.getSnapshot();
  assert.equal(snapshot.state, 'FAILED');
  assert.equal(snapshot.result.cause, 'INVALID_TCP_SAMPLE');
  assert.equal(snapshot.physicalContact.diagnostics.impulseCount, 0);
  assert.equal(snapshot.counts.physicsSteps, 0);
  system.dispose();
});

test('contact mode does not silently miniaturize the legacy train geometry', () => {
  const system = rig({ trainProfile: {} });
  const snapshot = system.service.getSnapshot();
  assert.equal(snapshot.poses[0].sizeMm.yMm, 34);
  assert.equal(snapshot.poses[0].sizeMm.xMm, 110);
  assert.equal(snapshot.poses[0].sizeMm.zMm, 40);
  system.dispose();
});
