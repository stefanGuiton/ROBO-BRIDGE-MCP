import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { createTerrainMeshContact } from '../../apps/web/src/train-integration/terrain-mesh-contact.js';
import { createChallengeTerrainSurfaceAdapter } from '../../apps/web/src/train-integration/challenge-terrain-surface-adapter.js';
import { createRouteFrame } from '../../apps/web/src/train/route-frame.js';
import { createTrainPhysics } from '../../apps/web/src/train/train-physics.js';
import { constructionHarness } from '../helpers/construction-harness.js';

const frame = Object.freeze({ originMm: { xMm: 100, yMm: -20, zMm: 50 },
  forward: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: -1, z: 0 }, trackTopMachineZMm: 50 });
const identity = () => ({ x: 0, y: 0, z: 0, w: 1 });
const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function box(name, size, position = { x: 0, y: 0, z: 0 }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.position.copy(position);
  mesh.updateWorldMatrix(true, false);
  return mesh;
}

function provider(meshes) {
  return createTerrainMeshContact({ routeFrame: frame, solidMeshes: meshes, meshCoordinateFrame: 'route' });
}

function tunnel() {
  return [box('floor', { x: 100, y: 4, z: 100 }, { x: 0, y: -2, z: 0 }),
    box('roof', { x: 100, y: 4, z: 100 }, { x: 0, y: 12, z: 0 }),
    box('left-wall', { x: 100, y: 20, z: 2 }, { x: 0, y: 6, z: -12 }),
    box('right-wall', { x: 100, y: 20, z: 2 }, { x: 0, y: 6, z: 12 })];
}

const body = (position = { x: 0, y: 4, z: 0 }, size = { x: 4, y: 8, z: 4 }, rotation = identity()) => ({ id: 'test-body', position, size, rotation });

function physicalContactEvidence(result) {
  const { ground, ceiling, diagnostics, ...evidence } = result;
  const { columnClearanceMm, columnDiagnosticsAvailable, ...contactDiagnostics } = diagnostics;
  return { ...evidence, diagnostics: contactDiagnostics };
}

function assertOptionalColumns(contact, query) {
  const sweep = { body: query.body, previousPosition: query.previousPosition
    ?? { ...query.body.position, x: query.body.position.x - 0.5 }, contactMarginMm: query.contactMarginMm ?? 0 };
  const sweptBefore = contact.sweepBody(sweep);
  const originalQuery = structuredClone(query), before = contact.getDiagnostics();
  const full = contact.queryBodyContacts(query), afterFull = contact.getDiagnostics();
  const contactsOnly = contact.queryBodyContacts({ ...query, includeColumnDiagnostics: false });
  const afterContactsOnly = contact.getDiagnostics();
  assert.deepEqual(physicalContactEvidence(contactsOnly), physicalContactEvidence(full));
  assert.deepEqual(structuredClone(query), originalQuery, 'the diagnostic option cannot mutate the body or prior pose');
  assert.equal(full.diagnostics.columnDiagnosticsAvailable, true, 'existing callers retain column diagnostics by default');
  assert.equal(contactsOnly.diagnostics.columnDiagnosticsAvailable, false);
  assert.equal(contactsOnly.ground, null);
  assert.equal(contactsOnly.ceiling, null);
  assert.equal(contactsOnly.diagnostics.columnClearanceMm, null, 'an omitted clearance must not become zero or Infinity');
  assert.equal(afterFull.columnRaycasts - before.columnRaycasts, 2);
  assert.equal(afterContactsOnly.columnRaycasts - afterFull.columnRaycasts, 0);
  assert.equal(afterContactsOnly.bodyQueries - afterFull.bodyQueries, 1, 'the actual body query still executes');
  assert.deepEqual(contact.queryBodyContacts({ ...query, includeColumnDiagnostics: true }), full);
  assert.deepEqual(contact.sweepBody(sweep), sweptBefore, 'the diagnostic option cannot change exact or conservative sweep evidence');
  return full;
}

test('omitting column diagnostics preserves exact floor, tunnel, embedded-solid, water and void contacts', () => {
  const tunnelContact = provider(tunnel());
  const solid = provider([box('thick-solid', { x: 100, y: 100, z: 100 }, { x: 0, y: -50, z: 0 })]);
  const water = box('Plane', { x: 100, y: 2, z: 100 });
  const voidMesh = box('decoration', { x: 100, y: 2, z: 100 });
  voidMesh.userData.contactKind = 'void';
  const excluded = provider([water, voidMesh]);
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const cases = [
    { contact: tunnelContact, shape: body({ x: 0, y: 3.5, z: 0 }), previousPosition: { x: 0, y: 4, z: 0 }, kind: 'terrain-ground' },
    { contact: tunnelContact, shape: body({ x: 0, y: 7, z: 0 }), kind: 'terrain-ceiling' },
    { contact: tunnelContact, shape: body({ x: 0, y: 5, z: 10 }, { x: 4, y: 4, z: 4 }), kind: 'terrain-wall' },
    { contact: tunnelContact, shape: body({ x: 0, y: 5, z: 8 }, { x: 8, y: 2, z: 2 }, rotation), kind: 'terrain-wall' },
    { contact: tunnelContact, shape: body({ x: 0, y: 5, z: 0 }, { x: 4, y: 4, z: 4 }), empty: true },
    { contact: solid, shape: body({ x: 0, y: -20, z: 0 }, { x: 4, y: 4, z: 4 }), kind: 'terrain-ground', embedded: true },
    { contact: excluded, shape: body(), empty: true },
    { contact: tunnelContact, shape: body({ x: 10000, y: -1000, z: 10000 }), empty: true }
  ];
  for (const item of cases) for (const margin of [0, 0.025]) {
    const full = assertOptionalColumns(item.contact, { body: item.shape,
      previousPosition: item.previousPosition ?? null, contactMarginMm: margin });
    if (item.kind) assert.ok(full.contacts.some(contact => contact.kind === item.kind));
    if (item.empty) assert.deepEqual(full.contacts, []);
    if (item.embedded) {
      assert.equal(full.diagnostics.embeddedInSolid, true, 'required containment rays must not be removed');
      close(full.contacts[0].penetrationMm, 22);
    }
  }
});

test('Train physics omits only column diagnostics while retaining all contact, sweep and residual queries', () => {
  const contact = provider([box('floor', { x: 200, y: 2, z: 100 }, { x: 0, y: -1, z: 0 })]);
  const physics = createTrainPhysics();
  const shapes = [40, 0, -40].map((x, index) => ({ ...body({ x, y: 2, z: 0 }, { x: 20, y: 4, z: 6 }), id: String(index) }));
  physics.promote(shapes, 0, { angularVelocities: shapes.map(() => ({ x: 0, y: 0, z: 0 })),
    lateralSpeedsMmPerSecond: [0, 0, 0], verticalSpeedsMmPerSecond: [0, 0, 0] });
  const queries = [];
  const solidContactProvider = {
    queryBodyContacts(query) { queries.push(structuredClone(query)); return contact.queryBodyContacts(query); },
    sweepBody: query => contact.sweepBody(query)
  };
  const result = physics.step(1 / 120, { motionMode: 'tcp_contact', solidContactProvider });
  const diagnostics = contact.getDiagnostics();
  assert.equal(queries.length, 12, 'three contact passes plus the final residual query for each of three bodies');
  assert.ok(queries.every(query => query.includeColumnDiagnostics === false));
  assert.equal(diagnostics.bodyQueries, 12);
  assert.equal(diagnostics.sweeps, 3);
  assert.equal(diagnostics.columnRaycasts, 0);
  assert.ok(diagnostics.triangleTests > 0);
  assert.ok(result.every(pose => pose.groundContact), 'real triangle contacts still support every body');
  assert.equal(physics.getCounts().couplerJoints, 2);
  assert.equal(physics.getCounts().physicsSteps, 1);
});

test('finite floor probes find the tunnel floor, not the roof top, and report the real ceiling', () => {
  const contact = provider(tunnel());
  close(contact.sample({ forwardMm: 0, rightMm: 0, probeHeightMm: 5 }).heightMm, 0);
  const column = contact.queryColumn({ forwardMm: 0, rightMm: 0, probeHeightMm: 5 });
  close(column.ground.heightMm, 0);
  close(column.ceiling.heightMm, 10);
  close(column.clearanceMm, 10);
  assert.equal(column.ceiling.normal.y, -1);
  assert.equal(column.ground.normal.y, 1);
  close(contact.sample({ forwardMm: 0, rightMm: 0, probeHeightMm: 20 }).heightMm, 14, 1e-5);
  assert.equal(contact.sample({ forwardMm: 0, rightMm: 0, probeHeightMm: -1 }), null);
  close(contact.sample({ forwardMm: 0, rightMm: 0, probeHeightMm: -1, previousHeightMm: 1 }).heightMm, 0);
});

test('water, void and missing finite probe heights never produce fallback contact', () => {
  const water = box('Plane', { x: 100, y: 2, z: 100 });
  const voidMesh = box('ignored-decoration', { x: 100, y: 2, z: 100 });
  voidMesh.userData.contactKind = 'void';
  const contact = provider([water, voidMesh]);
  assert.equal(contact.sample({ forwardMm: 0, rightMm: 0, probeHeightMm: 100 }), null);
  assert.equal(contact.sample({ forwardMm: 0, rightMm: 0 }), null);
  assert.equal(contact.sample({ forwardMm: 0, rightMm: 0, probeHeightMm: null }), null);
  assert.equal(contact.sample({ forwardMm: 0, rightMm: 0, probeHeightMm: -1000 }), null);
  assert.deepEqual(contact.queryBodyContacts({ body: body() }).contacts, []);
  assert.equal(contact.sweepBody({ body: body({ x: 0, y: -500, z: 0 }), previousPosition: { x: 0, y: 100, z: 0 } }), null);
  const diagnostics = contact.getDiagnostics();
  assert.equal(diagnostics.excludedMeshCount, 2);
  assert.equal(diagnostics.triangleCount, 0);
  assert.equal(diagnostics.fallbackFloor, false);
  assert.equal(diagnostics.waterIsSupport, false);
  assert.equal(diagnostics.proxySupport, false);
  assert.equal(diagnostics.invalidHeightSamples, 2);
  assert.ok(Object.isFrozen(diagnostics));
  assert.equal(contact.sample({ forwardMm: 1e100, rightMm: 0, probeHeightMm: 0 }), null, 'large finite coordinates cannot stall the spatial-grid loop');
});

test('exact body queries distinguish ground penetration, ceiling and side walls', () => {
  const contact = provider(tunnel());
  const resting = contact.queryBodyContacts({ body: body() });
  assert.equal(resting.supported, true);
  assert.equal(resting.diagnostics.ceilingCollision, false);
  assert.equal(resting.diagnostics.bodyWallCollision, false);
  const ground = contact.queryBodyContacts({ body: body({ x: 0, y: 3.5, z: 0 }), previousPosition: { x: 0, y: 4, z: 0 } });
  assert.equal(ground.diagnostics.belowGround, true);
  close(ground.contacts.find(hit => hit.kind === 'terrain-ground').penetrationMm, 0.5);
  const roof = contact.queryBodyContacts({ body: body({ x: 0, y: 7, z: 0 }) });
  assert.equal(roof.diagnostics.ceilingCollision, true);
  assert.equal(roof.supported, false);
  const ceiling = roof.contacts.find(hit => hit.kind === 'terrain-ceiling');
  close(ceiling.normal.y, -1);
  close(ceiling.penetrationMm, 1);
  const embeddedRoof = contact.queryBodyContacts({ body: body({ x: 0, y: 11, z: 0 }, { x: 4, y: 4, z: 4 }) });
  assert.equal(embeddedRoof.diagnostics.ceilingCollision, true, 'penetrating the underside does not make it an upward floor');
  const wall = contact.queryBodyContacts({ body: body({ x: 0, y: 5, z: 10 }, { x: 4, y: 4, z: 4 }) });
  assert.equal(wall.diagnostics.bodyWallCollision, true);
  assert.ok(wall.walls.some(hit => hit.normal.z === -1 && hit.penetrationMm === 1));
  assert.ok(wall.walls.every(hit => hit.point.z >= 11 - 1e-6 && hit.point.z <= 12 + 1e-6));
});

test('OBB contacts use actual rotated body geometry instead of only its centre or an axis-aligned footprint', () => {
  const contact = provider(tunnel());
  const centre = { x: 0, y: 5, z: 8 };
  const size = { x: 8, y: 2, z: 2 };
  assert.equal(contact.queryBodyContacts({ body: body(centre, size) }).diagnostics.bodyWallCollision, false);
  const rotated = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  assert.equal(contact.queryBodyContacts({ body: body(centre, size, rotated) }).diagnostics.bodyWallCollision, true);
});

test('a body fully inside a thick solid is not mistaken for empty space, while a hollow tunnel stays clear', () => {
  const contact = provider([box('thick-solid', { x: 100, y: 100, z: 100 }, { x: 0, y: -50, z: 0 })]);
  const buried = contact.queryBodyContacts({ body: body({ x: 0, y: -20, z: 0 }, { x: 4, y: 4, z: 4 }) });
  assert.equal(buried.diagnostics.embeddedInSolid, true);
  assert.equal(buried.diagnostics.belowGround, true);
  assert.ok(buried.contacts.some(hit => hit.embedded && hit.normal.y > 0.99 && hit.penetrationMm === 22));
  assert.equal(contact.queryBodyContacts({ body: body({ x: 0, y: 20, z: 0 }) }).diagnostics.embeddedInSolid, false);
  const outer = box('hollow-solid', { x: 100, y: 20, z: 30 }, { x: 0, y: 5, z: 0 });
  const inner = box('hollow-solid', { x: 90, y: 10, z: 20 }, { x: 0, y: 5, z: 0 });
  const indices = inner.geometry.index;
  for (let index = 0; index < indices.count; index += 3) {
    const old = indices.getX(index + 1); indices.setX(index + 1, indices.getX(index + 2)); indices.setX(index + 2, old);
  }
  const hollow = provider([outer, inner]);
  const insideCavity = hollow.queryBodyContacts({ body: body({ x: 0, y: 5, z: 0 }, { x: 4, y: 4, z: 4 }) });
  assert.equal(insideCavity.diagnostics.embeddedInSolid, false);
  assert.deepEqual(insideCavity.contacts, []);
  assertOptionalColumns(hollow, { body: body({ x: 0, y: 5, z: 0 }, { x: 4, y: 4, z: 4 }) });
});

test('the actual rail footprint cannot support a narrow box suspended between rails', () => {
  const rails = [-13.2, 13.2].map(z => box(`rail-${z}`, { x: 100, y: 1, z: 2 }, { x: 0, y: -0.5, z }));
  const contact = provider(rails);
  const narrow = contact.queryBodyContacts({ body: body({ x: 0, y: 6, z: 0 }, { x: 30, y: 12, z: 20 }) });
  assert.equal(narrow.supported, false);
  assert.deepEqual(narrow.contacts, []);
  const wide = contact.queryBodyContacts({ body: body({ x: 0, y: 6, z: 0 }, { x: 30, y: 12, z: 28 }) });
  assert.equal(wide.supported, true);
  assert.ok(wide.contacts.every(hit => Math.abs(hit.point.z) >= 12.2 - 1e-6));
});

test('translation sweeps catch a thin wall and crossed floor even when both final OBBs are clear', () => {
  const wall = provider([box('thin-wall', { x: 0.2, y: 100, z: 100 })]);
  const end = body({ x: 10, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
  assert.deepEqual(wall.queryBodyContacts({ body: end }).contacts, []);
  const hit = wall.sweepBody({ body: end, previousPosition: { x: -10, y: 0, z: 0 } });
  assert.ok(hit);
  close(hit.timeOfImpact, 0.445);
  assert.ok(hit.contacts.some(value => value.normal.x < -0.999));
  assert.equal(hit.diagnostics.translationExact, true);
  assert.equal(hit.diagnostics.rotationalConservative, false);
  const floor = provider([box('floor', { x: 100, y: 2, z: 100 }, { x: 0, y: -1, z: 0 })]);
  const fallen = body({ x: 0, y: -10, z: 0 }, { x: 2, y: 2, z: 2 });
  const floorHit = floor.sweepBody({ body: fallen, previousPosition: { x: 0, y: 10, z: 0 } });
  close(floorHit.timeOfImpact, 0.45);
  assert.ok(floorHit.contacts.some(value => value.normal.y > 0.999));
});

test('resting/tangential contacts do not falsely stop a translational sweep', () => {
  const contact = provider([box('floor', { x: 100, y: 2, z: 100 }, { x: 0, y: -1, z: 0 })]);
  assert.equal(contact.sweepBody({ body: body({ x: 10, y: 4, z: 0 }), previousPosition: { x: 0, y: 4, z: 0 } }), null);
  assert.equal(contact.sweepBody({ body: body({ x: 10, y: 5, z: 0 }), previousPosition: { x: 0, y: 4, z: 0 } }), null);
});

test('pure rotation into a wall is bounded and explicitly conservative rather than claimed exact', () => {
  const contact = provider(tunnel());
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const end = body({ x: 0, y: 5, z: 4 }, { x: 16, y: 1, z: 1 }, rotation);
  const hit = contact.sweepBody({ body: end, previousPosition: end.position, previousRotation: identity() });
  assert.ok(hit);
  assert.ok(hit.timeOfImpact >= 0 && hit.timeOfImpact < 1);
  assert.equal(hit.diagnostics.translationExact, false);
  assert.equal(hit.diagnostics.rotationalConservative, true);
  assert.ok(hit.diagnostics.angularPaddingMm > 0);
  assert.ok(hit.diagnostics.rotationSegments <= 90);
});

test('display/machine/route transforms, nested meshes and reflected winding preserve physical contacts', () => {
  const yaw = 0.73, mountYaw = -0.41;
  const rotatedFrame = { ...frame, forward: { x: Math.cos(yaw), y: Math.sin(yaw), z: 0 },
    right: { x: Math.sin(yaw), y: -Math.cos(yaw), z: 0 } };
  const mount = { position: { x: -820, y: 170, z: 1200 }, yawRad: mountYaw };
  const routeToMachine = new THREE.Matrix4().makeBasis(new THREE.Vector3().copy(rotatedFrame.forward),
    new THREE.Vector3().copy(rotatedFrame.up), new THREE.Vector3().copy(rotatedFrame.right))
    .setPosition(frame.originMm.xMm, frame.originMm.yMm, frame.originMm.zMm);
  const machineToDisplay = new THREE.Matrix4().makeRotationZ(mountYaw).setPosition(mount.position.x, mount.position.y, mount.position.z);
  const root = new THREE.Group();
  root.matrix.copy(machineToDisplay.multiply(routeToMachine)); root.matrixAutoUpdate = false; root.matrixWorldNeedsUpdate = true;
  const floor = box('solid-floor', { x: 50, y: 4, z: 50 }, { x: 0, y: -2, z: 0 });
  floor.scale.x = -1;
  floor.material.side = THREE.BackSide; floor.material.opacity = 0; floor.material.transparent = true;
  floor.visible = false;
  root.add(floor); root.updateWorldMatrix(true, true);
  const positions = Array.from(floor.geometry.attributes.position.array), matrix = floor.matrixWorld.toArray();
  const contact = createTerrainMeshContact({ routeFrame: rotatedFrame, solidMeshes: [floor, floor], machineMount: mount });
  const hit = contact.sample({ forwardMm: 0, rightMm: 0, probeHeightMm: 3 });
  close(hit.heightMm, 0);
  close(hit.normal.y, 1);
  assert.equal(contact.getDiagnostics().meshCount, 1);
  assert.deepEqual(floor.matrixWorld.toArray(), matrix);
  assert.deepEqual(Array.from(floor.geometry.attributes.position.array), positions);
  assert.equal(floor.material.side, THREE.BackSide);
  assert.equal(floor.material.opacity, 0);
  assert.equal(floor.visible, false);
});

test('queries cannot mutate body poses and refresh snapshots geometry without disposing shared meshes', () => {
  const floor = box('floor', { x: 100, y: 2, z: 100 }, { x: 0, y: -1, z: 0 });
  const contact = provider([floor]);
  const pose = body();
  const before = structuredClone(pose);
  Object.freeze(pose); Object.freeze(pose.position); Object.freeze(pose.size); Object.freeze(pose.rotation);
  contact.queryBodyContacts({ body: pose });
  contact.sweepBody({ body: pose, previousPosition: { x: -2, y: 4, z: 0 } });
  assert.deepEqual(pose, before);
  close(contact.sample({ probeHeightMm: 10 }).heightMm, 0);
  let disposals = 0;
  floor.geometry.addEventListener('dispose', () => { disposals += 1; });
  floor.position.y += 2;
  contact.refresh();
  close(contact.sample({ probeHeightMm: 10 }).heightMm, 2);
  assert.equal(contact.getDiagnostics().geometryGeneration, 2);
  assert.equal(disposals, 0);
  assert.equal(contact.getDiagnostics().ownsPhysics, false);
  assert.equal(contact.getDiagnostics().ownsFrameLoop, false);
});

test('exact adapter opt-in never consults legacy AABBs, water datum or fallback floor', () => {
  const exact = provider(tunnel());
  let proxyReads = 0;
  const adapter = createChallengeTerrainSurfaceAdapter({ routeFrame: frame, solidContactProvider: exact,
    challengeService: { getCollisionProxy() { proxyReads += 1; throw new Error('water datum must not be read'); } },
    includeFloor: true, fallbackHeightMm: 999, sampleMachineSurface: () => ({ zMm: 2000 }) });
  close(adapter.sample({ probeHeightMm: 5 }).heightMm, 0);
  assert.equal(adapter.sample({ forwardMm: 500, probeHeightMm: 5 }), null);
  assert.equal(adapter.heightAt(500, 0, 5), null);
  assert.equal(proxyReads, 0);
  assert.equal(adapter.getDiagnostics().fallbackFloor, false);
  assert.equal(adapter.queryBodyContacts({ body: body() }).supported, true);
  assertOptionalColumns(adapter, { body: body() });
});

test('invalid geometry frames fail closed instead of fabricating support', () => {
  assert.throws(() => createTerrainMeshContact({ routeFrame: frame }), /machineMount/);
  assert.throws(() => createTerrainMeshContact({ routeFrame: { ...frame, right: { x: 0, y: 1, z: 0 } }, meshCoordinateFrame: 'route' }), /right-handed/);
  assert.throws(() => provider([{}]), /triangle meshes/);
  const contact = provider([]);
  assert.throws(() => contact.queryBodyContacts({ body: body({ x: 0, y: 4, z: NaN }) }), /finite/);
  assert.throws(() => contact.queryBodyContacts({ body: body(), contactMarginMm: -1 }), /nonnegative/);
  for (const value of [null, 0, 1, 'false', {}]) {
    assert.throws(() => contact.queryBodyContacts({ body: body(), includeColumnDiagnostics: value }), /must be boolean/);
  }
});

test('current production terrain mesh query excludes water and preserves the exact route and authority revisions', async () => {
  // The historical flag selects the shared route contract; the harness loads the active production terrain asset.
  const h = await constructionHarness({ terrain7: true });
  const plan = h.host.buildPlan;
  const worldRevision = h.controller.worldRevision, boardRevision = h.board.worldRevision;
  const boardTargets = h.board.getTargets(), boardCursor = h.board.eventCursor;
  const transform = h.challenge.getBridgeTransform();
  const routeFrame = createRouteFrame({ frozenBuildPlan: plan, worldTransform: transform });
  const state = h.challenge.getState();
  const contact = createTerrainMeshContact({ routeFrame, getSolidMeshes: () => h.challenge.getTerrainOccluders(), machineMount: state.machineMount });
  const diagnostics = contact.getDiagnostics();
  assert.ok(diagnostics.triangleCount > 100);
  assert.ok(diagnostics.solidNames.includes('Terrain'));
  assert.ok(diagnostics.solidNames.includes('Tunnel'));
  assert.ok(!diagnostics.solidNames.includes('Plane'));
  assert.equal(diagnostics.waterIsSupport, false);
  const tunnelColumn = contact.queryColumn({ forwardMm: 380, rightMm: 0, probeHeightMm: 5 });
  close(tunnelColumn.ground.heightMm + routeFrame.trackTopMachineZMm, 132.933877, 1e-3);
  close(tunnelColumn.ceiling.heightMm + routeFrame.trackTopMachineZMm, 158.147971, 1e-3);
  const clearPocket = contact.queryBodyContacts({ body: body({ x: 385, y: 6, z: 0 }, { x: 30, y: 12, z: 20 }) });
  assert.deepEqual(clearPocket.contacts, []);
  const endWall = contact.queryBodyContacts({ body: body({ x: 400, y: 6, z: 0 }, { x: 30, y: 12, z: 20 }),
    previousPosition: { x: 385, y: 6, z: 0 } });
  assert.equal(endWall.diagnostics.bodyWallCollision, true, 'the authored tunnel end wall cannot be ignored for all-train crossing');
  assert.ok(endWall.walls.some(hit => hit.sourceId === 'Tunnel' && hit.normal.x < -0.99));
  for (const query of [
    { body: body({ x: 385, y: 6, z: 0 }, { x: 30, y: 12, z: 20 }) },
    { body: body({ x: 400, y: 6, z: 0 }, { x: 30, y: 12, z: 20 }), previousPosition: { x: 385, y: 6, z: 0 } },
    { body: body({ x: 385, y: 17, z: 0 }, { x: 88, y: 34, z: 34 }) }
  ]) for (const contactMarginMm of [0, 0.025]) assertOptionalColumns(contact, { ...query, contactMarginMm });
  // Far from every transformed solid remains void even below the water datum.
  assert.equal(contact.sample({ forwardMm: 10000, rightMm: 10000, probeHeightMm: -1000 }), null);
  close(routeFrame.lengthMm, 370, 1e-4);
  assert.deepEqual(h.host.buildPlan, plan, 'BridgeHost returns clones; geometry queries must preserve their exact contents');
  assert.equal(h.controller.worldRevision, worldRevision);
  assert.equal(h.board.worldRevision, boardRevision);
  assert.deepEqual(h.board.getTargets(), boardTargets);
  assert.deepEqual(h.board.eventCursor, boardCursor);
  assert.deepEqual(h.challenge.getBridgeTransform(), transform);
});
