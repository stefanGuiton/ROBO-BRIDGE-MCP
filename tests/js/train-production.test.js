'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TRAIN_FIXED_DT_SECONDS,
  TRAIN_STATES,
  createAcceptedBuildBoardSnapshot,
  createBuildBoardSupportMap,
  createBuildBoardSupportMapAdapter,
  createBridgeCollisionSnapshot,
  createCollisionSnapshotManager,
  createMainDemoTrainSubsystem,
  createPushProfile,
  createPusherAdapter,
  createRouteFrame,
  createTrainPhysics,
  createTrainRuntime,
  createTrainTestPreconditionAdapter,
  createTrainTestService,
  createTrainThreeRenderer,
  eulerDegreesToQuaternion,
  machinePointToRouteLocal,
  routeLocalPointToMachine
} from '../../apps/web/src/train/index.js';
import {
  createFixtureBoardSnapshot,
  createFixtureBuildPlan,
  createFixtureSurfaceProvider,
  createFixtureWorldTransform
} from '../helpers/train-fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function makeSystem({ columns = 16, yawDeg = 0, includeTrack = false, pusherAdapter = null, preconditions = null } = {}) {
  const plan = createFixtureBuildPlan();
  let board = createFixtureBoardSnapshot(plan, { supportedColumns: columns, includeTrack, worldRevision: 1 });
  let transform = createFixtureWorldTransform(yawDeg);
  const providers = {
    getFrozenBuildPlan: () => plan,
    getAcceptedBuildBoardSnapshot: () => board,
    getWorldTransform: () => transform
  };
  const supportMapAdapter = createBuildBoardSupportMapAdapter(providers);
  const collisionSnapshotManager = createCollisionSnapshotManager(providers);
  const service = createTrainTestService({
    ...providers,
    supportMapAdapter,
    collisionSnapshotManager,
    surfaceProvider: createFixtureSurfaceProvider(),
    pusherAdapter: pusherAdapter || undefined,
    preconditions: preconditions || undefined
  });
  return {
    plan,
    get board() { return board; },
    setBoard(next) { board = next; },
    setTransform(next) { transform = next; },
    providers,
    supportMapAdapter,
    collisionSnapshotManager,
    service
  };
}

test('complete BuildBoard creates full structural rail support', () => {
  const plan = createFixtureBuildPlan();
  const map = createBuildBoardSupportMap({
    frozenBuildPlan: plan,
    acceptedBuildBoardSnapshot: createFixtureBoardSnapshot(plan, { supportedColumns: 16 }),
    worldTransform: createFixtureWorldTransform(0)
  });
  assert.equal(map.segmentCount, 8);
  assert.equal(map.supportedCount, 8);
  assert.equal(map.allSupported, true);
  assert.equal(map.firstUnsupportedSegment, null);
  assert.equal(map.route.startMm, 0);
  assert.equal(map.route.endMm, map.routeFrame.lengthMm);
  assert.equal(map.route.coordinateFrame, 'route-local-mm');
  assert.ok(map.segments.every((segment) => segment.evidence.every((sample) => sample.supportingPlacementIds.length >= 2)));
});

test('partial BuildBoard exposes the first unsupported route segment', () => {
  const plan = createFixtureBuildPlan();
  const map = createBuildBoardSupportMap({
    frozenBuildPlan: plan,
    acceptedBuildBoardSnapshot: createFixtureBoardSnapshot(plan, { supportedColumns: 8 }),
    worldTransform: createFixtureWorldTransform(0)
  });
  assert.equal(map.supportedCount, 4);
  assert.equal(map.allSupported, false);
  assert.equal(map.firstUnsupportedSegment, 4);
  assert.equal(map.firstUnsupportedProgress, 0.5);
  assert.equal(map.segments[4].evidence[0].reason, 'INSUFFICIENT_ACCEPTED_SLICES');
});

test('support map is deterministic and track state does not create support', () => {
  const plan = createFixtureBuildPlan();
  const base = createBuildBoardSupportMap({
    frozenBuildPlan: plan,
    acceptedBuildBoardSnapshot: createFixtureBoardSnapshot(plan, { supportedColumns: 8, includeTrack: false }),
    worldTransform: createFixtureWorldTransform(0)
  });
  const tracksAccepted = createBuildBoardSupportMap({
    frozenBuildPlan: plan,
    acceptedBuildBoardSnapshot: createFixtureBoardSnapshot(plan, { supportedColumns: 8, includeTrack: true }),
    worldTransform: createFixtureWorldTransform(0)
  });
  const again = createBuildBoardSupportMap({
    frozenBuildPlan: plan,
    acceptedBuildBoardSnapshot: createFixtureBoardSnapshot(plan, { supportedColumns: 8, includeTrack: false }),
    worldTransform: createFixtureWorldTransform(0)
  });
  assert.equal(base.checksum, again.checksum);
  assert.deepEqual(base.segments.map((item) => item.supported), again.segments.map((item) => item.supported));
  assert.deepEqual(base.segments.map((item) => item.supported), tracksAccepted.segments.map((item) => item.supported));
  assert.ok(tracksAccepted.segments.every((segment) => segment.trackVisualStateIgnored));
});

test('BuildBoard target records normalize to accepted placement IDs', () => {
  const plan = createFixtureBuildPlan();
  const fromTargets = createAcceptedBuildBoardSnapshot(createFixtureBoardSnapshot(plan, {
    supportedColumns: 3,
    useTargets: true
  }));
  assert.equal(fromTargets.blueprintId, plan.planId);
  assert.equal(fromTargets.acceptedPlacementIds.length, 3 * 3 * 3);
  assert.match(fromTargets.acceptedChecksum, /^[0-9a-f]{8}$/);
});

test('collision snapshot is deterministic and cache invalidates on board revision', () => {
  const system = makeSystem({ columns: 8 });
  const first = system.collisionSnapshotManager.prepare();
  const reused = system.collisionSnapshotManager.prepare();
  assert.equal(reused.report.reused, true);
  assert.equal(first.snapshot.checksum, reused.snapshot.checksum);
  assert.ok(first.snapshot.occupiedCellCount > 0);
  system.setBoard(createFixtureBoardSnapshot(system.plan, { supportedColumns: 10, worldRevision: 2 }));
  const changed = system.collisionSnapshotManager.prepare();
  assert.equal(changed.report.reused, false);
  assert.notEqual(changed.snapshot.checksum, first.snapshot.checksum);
  const direct = createBridgeCollisionSnapshot({
    frozenBuildPlan: system.plan,
    acceptedBuildBoardSnapshot: system.board,
    worldTransform: createFixtureWorldTransform(0)
  });
  assert.equal(direct.checksum, changed.snapshot.checksum);
});

test('route frame supports yaw 0 and yaw 90 without world-X assumptions', () => {
  const plan = createFixtureBuildPlan();
  const yaw0 = createRouteFrame({ frozenBuildPlan: plan, worldTransform: createFixtureWorldTransform(0) });
  const yaw90 = createRouteFrame({ frozenBuildPlan: plan, worldTransform: createFixtureWorldTransform(90) });
  assert.ok(Math.abs(yaw0.forward.x - 1) < 1e-9);
  assert.ok(Math.abs(yaw0.forward.y) < 1e-9);
  assert.ok(Math.abs(yaw90.forward.x) < 1e-9);
  assert.ok(Math.abs(yaw90.forward.y - 1) < 1e-9);
  const local = { x: 123, y: 17, z: -8 };
  const world = routeLocalPointToMachine(yaw90, local);
  const roundTrip = machinePointToRouteLocal(yaw90, world);
  assert.ok(Math.abs(roundTrip.x - local.x) < 1e-9);
  assert.ok(Math.abs(roundTrip.y - local.y) < 1e-9);
  assert.ok(Math.abs(roundTrip.z - local.z) < 1e-9);
});

test('push profile uses millimetres and reaches exact speed and distance', () => {
  const profile = createPushProfile({ pushDistanceMm: 64, trainSpeedMmPerSecond: 120 });
  assert.equal(profile.durationSeconds, 128 / 120);
  const middle = profile.sample(profile.durationSeconds / 2);
  assert.ok(middle.distanceMm > 0 && middle.distanceMm < 64);
  assert.ok(middle.speedMmPerSecond > 0 && middle.speedMmPerSecond < 120);
  const final = profile.sample(profile.durationSeconds * 2);
  assert.equal(final.distanceMm, 64);
  assert.equal(final.speedMmPerSecond, 120);
  assert.equal(final.complete, true);
});

test('placeholder pusher becomes ready and external pusher requires notification', () => {
  const placeholder = createPusherAdapter({ mode: 'placeholder' });
  const pose = { positionMm: { xMm: 10, yMm: 20, zMm: 30 }, rotationDeg: { zDeg: 15 } };
  placeholder.setTargetPose(pose);
  assert.equal(placeholder.isAtTarget(pose), true);
  let target = null;
  const external = createPusherAdapter({
    mode: 'external',
    getPose: () => ({ positionMm: { xMm: 0, yMm: 0, zMm: 0 } }),
    setTargetPose: (next) => { target = next; }
  });
  external.setTargetPose(pose);
  assert.equal(target.positionMm.xMm, 10);
  assert.equal(external.isAtTarget(pose), false);
  external.notifyReady(pose);
  assert.equal(external.isAtTarget(pose), true);
});

test('pusher target transform follows the route yaw and keeps XYZ settings in mm', () => {
  const system = makeSystem({ columns: 16, yawDeg: 90 });
  system.service.setPusherOffset({ xMm: 12, yMm: 7, zMm: -5 });
  system.service.setPusherRotation({ xDeg: 10, yDeg: 20, zDeg: 30 });
  const snapshot = system.service.getSnapshot();
  assert.deepEqual(snapshot.pusher.offsetMm, { xMm: 12, yMm: 7, zMm: -5 });
  assert.deepEqual(snapshot.pusher.rotationDeg, { xDeg: 10, yDeg: 20, zDeg: 30 });
  assert.ok(Math.abs(snapshot.routeFrame.forward.y - 1) < 1e-9);
  assert.ok(Number.isFinite(snapshot.pusher.targetPose.positionMm.xMm));
});

test('runtime executes fixed 120 Hz steps with catch-up protection and no idle loop', () => {
  const system = makeSystem({ columns: 16 });
  let rendererUpdates = 0;
  const runtime = createTrainRuntime({
    service: system.service,
    maximumCatchUpSteps: 4,
    renderer: { update() { rendererUpdates += 1; }, dispose() {} }
  });
  assert.equal(rendererUpdates, 1);
  system.service.startTest();
  const frame = runtime.updateFrame(1 / 30);
  assert.equal(frame.fixedSteps, 4);
  assert.equal(system.service.getPerformance().fixedDtSeconds, TRAIN_FIXED_DT_SECONDS);
  system.service.runToTerminal(10);
  const updatesBeforeIdle = rendererUpdates;
  const idle = runtime.updateFrame(1);
  runtime.updateFrame(1);
  assert.equal(idle.fixedSteps, 0);
  assert.equal(idle.active, false);
  assert.equal(rendererUpdates, updatesBeforeIdle);
  assert.equal(runtime.getStats().idleLoopOwned, false);
  runtime.dispose();
});

test('complete construction causes CROSSED at yaw 0 and yaw 90', () => {
  for (const yawDeg of [0, 90]) {
    const system = makeSystem({ columns: 16, yawDeg });
    assert.equal(system.service.startTest().ok, true);
    const final = system.service.runToTerminal(10);
    assert.equal(final.state, TRAIN_STATES.CROSSED);
    assert.equal(final.result.outcome, 'CROSSED');
    assert.equal(final.result.success, true);
    assert.equal(final.failureDynamics.fallingElapsedSeconds, 0);
  }
});

test('incomplete construction causes linked derail and TRAIN_FELL from support loss', () => {
  const system = makeSystem({ columns: 8 });
  assert.equal(system.service.startTest().ok, true);
  const final = system.service.runToTerminal(12);
  assert.equal(final.state, TRAIN_STATES.FAILED);
  assert.equal(final.result.outcome, 'TRAIN_FELL');
  assert.equal(final.result.cause, 'SUPPORT_LOSS');
  assert.equal(final.result.firstUnsupportedSegment, 4);
  assert.equal(final.result.settleTimedOut, false);
  assert.equal(final.couplers.length, 2);
  assert.ok(final.couplers.every((coupler) => coupler.visible));
  assert.equal(final.failureDynamics.diagnostics.currentMaximumBodyOverlapDepthMm, 0);
  assert.ok(final.failureDynamics.diagnostics.currentMaximumCouplerAnchorErrorMm < 1);
});

test('self-collision regression separates coupled neighbours without impact bounce', () => {
  const physics = createTrainPhysics({ gravityMmPerSecondSquared: 0, airDampingPerSecond: 5, angularDampingPerSecond: 5 });
  const bodies = [
    { id: 'A', label: 'A', role: 'locomotive', colourIndex: 0, size: { x: 110, y: 34, z: 40 }, position: { x: 100, y: 80, z: 0 }, rotation: eulerDegreesToQuaternion({ zDeg: 45 }) },
    { id: 'B', label: 'B', role: 'middle-carriage', colourIndex: 1, size: { x: 88, y: 30, z: 38 }, position: { x: 40, y: 80, z: 0 }, rotation: eulerDegreesToQuaternion({ zDeg: -45 }) },
    { id: 'C', label: 'C', role: 'rear-carriage', colourIndex: 2, size: { x: 88, y: 30, z: 38 }, position: { x: -60, y: 80, z: 0 }, rotation: eulerDegreesToQuaternion({}) }
  ];
  physics.promote(bodies, 0, {
    angularVelocities: [eulerDegreesToQuaternion({}), eulerDegreesToQuaternion({}), eulerDegreesToQuaternion({})].map(() => ({ x: 0, y: 0, z: 0 })),
    lateralSpeedsMmPerSecond: [0, 0, 0],
    verticalSpeedsMmPerSecond: [0, 0, 0]
  });
  assert.ok(physics.getDiagnostics().pairDiagnostics[0].overlapDepthMm > 10);
  for (let index = 0; index < 240; index += 1) physics.step(1 / 120, { surfaceProvider: { heightAt: () => 0 } });
  const diagnostics = physics.getDiagnostics();
  assert.equal(diagnostics.currentMaximumBodyOverlapDepthMm, 0);
  assert.ok(diagnostics.bodyContactCorrectionCount > 0);
  assert.ok(diagnostics.neighbourImpactFilterCount > 0);
  assert.ok(diagnostics.currentMaximumCouplerAnchorErrorMm < 0.1);
  assert.equal(diagnostics.pairDiagnostics[0].collisionMode, 'coupler-owned-capsule-non-penetration');
});

test('preconditions reject active robot, held part, stale plan and non-ready service', () => {
  const plan = createFixtureBuildPlan();
  let robotExecuting = true;
  let holding = false;
  const adapter = createTrainTestPreconditionAdapter({
    isRobotExecuting: () => robotExecuting,
    isRobotIdle: () => !robotExecuting,
    isGripperHoldingPart: () => holding
  });
  let result = adapter.evaluate({
    frozenBuildPlan: plan,
    acceptedBuildBoardSnapshot: createAcceptedBuildBoardSnapshot(createFixtureBoardSnapshot(plan)),
    trainState: TRAIN_STATES.READY
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((item) => item.code === 'ROBOT_EXECUTING'));
  robotExecuting = false;
  holding = true;
  result = adapter.evaluate({
    frozenBuildPlan: plan,
    acceptedBuildBoardSnapshot: { blueprintId: 'wrong', designChecksum: 'wrong' },
    trainState: TRAIN_STATES.PUSHING
  });
  assert.ok(result.failures.some((item) => item.code === 'GRIPPER_HOLDING_PART'));
  assert.ok(result.failures.some((item) => item.code === 'STALE_PLAN'));
  assert.ok(result.failures.some((item) => item.code === 'TRAIN_NOT_READY'));
});

test('staged C to B to A reset is deterministic for 50 cycles and leaks no listeners or bodies', () => {
  const system = makeSystem({ columns: 16 });
  const listenerCount = system.service.getCounts().listenerCount;
  for (let cycle = 0; cycle < 50; cycle += 1) {
    assert.equal(system.service.startTest().ok, true);
    system.service.step(TRAIN_FIXED_DT_SECONDS);
    system.service.stopTest();
    let reset = system.service.resetTrain();
    assert.equal(reset.state, TRAIN_STATES.RESETTING);
    assert.deepEqual(reset.reset.respawned, { A: false, B: false, C: true });
    reset = system.service.runResetToReady(2);
    assert.equal(reset.state, TRAIN_STATES.READY);
    assert.deepEqual(reset.reset.respawned, { A: true, B: true, C: true });
    assert.equal(reset.counts.allocatedBodies, 3);
    assert.equal(reset.counts.dynamicBodies, 0);
    assert.equal(reset.counts.couplerJoints, 0);
    assert.equal(reset.counts.listenerCount, listenerCount);
  }
});

class FakeVector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class FakeQuaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.set(x, y, z, w); }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
}
class FakeObject3D {
  constructor() {
    this.children = [];
    this.parent = null;
    this.position = new FakeVector3();
    this.scale = new FakeVector3(1, 1, 1);
    this.quaternion = new FakeQuaternion();
    this.visible = true;
    this.name = '';
  }
  add(...children) { for (const child of children) { child.parent = this; this.children.push(child); } return this; }
  removeFromParent() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  traverse(callback) { callback(this); for (const child of this.children) child.traverse(callback); }
}
class FakeGroup extends FakeObject3D {}
class FakeGeometry { constructor() { this.disposed = false; } dispose() { this.disposed = true; } }
class FakeMaterial { constructor(parameters) { this.parameters = parameters; this.disposed = false; } dispose() { this.disposed = true; } }
class FakeMesh extends FakeObject3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
const FAKE_THREE = {
  Group: FakeGroup,
  Mesh: FakeMesh,
  BoxGeometry: FakeGeometry,
  MeshStandardMaterial: FakeMaterial,
  Vector3: FakeVector3,
  Quaternion: FakeQuaternion
};

test('Three renderer attaches to machineRoot and does not create a second canvas or renderer', () => {
  const system = makeSystem({ columns: 8 });
  system.service.startTest();
  system.service.runToTerminal(12);
  const machineRoot = new FakeGroup();
  let renders = 0;
  const renderer = createTrainThreeRenderer({ THREE: FAKE_THREE, machineRoot, requestRender: () => { renders += 1; } });
  renderer.update(system.service.getSnapshot(), system.service.getSupportMap(), system.service.getCollisionSnapshot());
  renderer.setDebugSupportVisible(true, system.service.getSupportMap());
  renderer.setCollisionDebugVisible(true, system.service.getCollisionSnapshot());
  const stats = renderer.getStats();
  assert.equal(machineRoot.children.length, 1);
  assert.equal(stats.vehicleObjects, 3);
  assert.equal(stats.couplerObjects, 2);
  assert.equal(stats.createdCanvases, 0);
  assert.equal(stats.ownsWebGLRenderer, false);
  assert.ok(renders >= 3);
  renderer.dispose();
  assert.equal(machineRoot.children.length, 0);
});

test('Three renderer keeps a constant object set through 50 staged reset cycles', () => {
  const system = makeSystem({ columns: 16 });
  const machineRoot = new FakeGroup();
  const renderer = createTrainThreeRenderer({ THREE: FAKE_THREE, machineRoot });
  renderer.update(system.service.getSnapshot(), system.service.getSupportMap(), system.service.getCollisionSnapshot());
  for (let cycle = 0; cycle < 50; cycle += 1) {
    assert.equal(system.service.startTest().ok, true);
    system.service.step(TRAIN_FIXED_DT_SECONDS);
    system.service.stopTest();
    system.service.resetTrain();
    const reset = system.service.runResetToReady(2);
    renderer.update(reset, system.service.getSupportMap(), system.service.getCollisionSnapshot());
    const stats = renderer.getStats();
    assert.equal(machineRoot.children.length, 1);
    assert.equal(stats.vehicleObjects, 3);
    assert.equal(stats.couplerObjects, 2);
    assert.equal(stats.pusherObjects, 1);
  }
  renderer.dispose();
  assert.equal(machineRoot.children.length, 0);
});

test('main factory exposes drag-and-drop runtime with no required mission dependency', () => {
  const plan = createFixtureBuildPlan();
  let board = createFixtureBoardSnapshot(plan, { supportedColumns: 16 });
  const machineRoot = new FakeGroup();
  const subsystem = createMainDemoTrainSubsystem({
    THREE: FAKE_THREE,
    machineRoot,
    getFrozenBuildPlan: () => plan,
    getAcceptedBuildBoardSnapshot: () => board,
    getWorldTransform: () => createFixtureWorldTransform(0),
    surfaceProvider: createFixtureSurfaceProvider()
  });
  assert.equal(typeof subsystem.updateFrame, 'function');
  assert.equal(subsystem.service.getCounts().listenerCount, 1);
  assert.equal(subsystem.startTest().ok, true);
  subsystem.service.runToTerminal(10);
  assert.equal(subsystem.service.getResult().outcome, 'CROSSED');
  subsystem.dispose();
  assert.equal(subsystem.service.getCounts().listenerCount, 0);
  assert.equal(machineRoot.children.length, 0);
});

test('production source has no standalone V4.6 authority or hardcoded failure trigger', () => {
  const trainDirectory = path.join(root, 'apps/web/src/train');
  const source = fs.readdirSync(trainDirectory)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(trainDirectory, name), 'utf8'))
    .join('\n');
  for (const forbidden of ['BuildExecutionEngine', 'filledCells', 'ROBO_BRIDGE_DEBUG', 'bridgeComplete Boolean', 'hardcoded unsupported position']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /acceptedBuildBoardSnapshot/);
  assert.match(source, /SUPPORT_LOSS/);
});
