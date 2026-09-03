'use strict';

import * as THREE from '../../vendor/three.module.min.js';
import { normalizeMachineMount } from '../challenge/challenge-transforms.js';
import { deepFreezePlain } from './internal.js';

const EPSILON = 1e-7;
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const NON_SOLID_NAMES = new Set(['plane', 'water', 'void']);

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function vector(value, label) {
  return new THREE.Vector3(finite(value?.x, `${label}.x`), finite(value?.y, `${label}.y`), finite(value?.z, `${label}.z`));
}

function quaternion(value = { x: 0, y: 0, z: 0, w: 1 }) {
  const result = new THREE.Quaternion(finite(value.x, 'rotation.x'), finite(value.y, 'rotation.y'),
    finite(value.z, 'rotation.z'), finite(value.w, 'rotation.w'));
  if (result.lengthSq() < EPSILON) throw new TypeError('Body rotation must be nonzero.');
  return result.normalize();
}

const plain = value => ({ x: value.x, y: value.y, z: value.z });
const bodyKind = normal => normal.y >= 0.5 ? 'terrain-ground' : normal.y <= -0.5 ? 'terrain-ceiling' : 'terrain-wall';

function explicitlyNonSolid(mesh) {
  for (let object = mesh; object; object = object.parent) {
    const data = object.userData || {};
    if (NON_SOLID_NAMES.has(String(object.name).toLowerCase()) || data.solid === false || data.nonSolid === true
      || ['water', 'void'].includes(data.contactKind ?? data.surfaceKind ?? data.kind)) return true;
  }
  return false;
}

function sourceName(mesh) {
  return mesh.name || mesh.parent?.name || `solid-${mesh.id}`;
}

function bodyGeometry(body) {
  const position = vector(body?.position, 'body.position');
  const half = vector(body?.size, 'body.size').multiplyScalar(0.5);
  if (Math.min(half.x, half.y, half.z) <= 0) throw new RangeError('Body size must be positive.');
  const rotation = quaternion(body.rotation);
  return { position, half, rotation, inverse: rotation.clone().invert(), radius: half.length() };
}

function bodyBounds(body, margin = 0) {
  const extent = new THREE.Vector3();
  for (let index = 0; index < 3; index += 1) {
    const axis = AXES[index].clone().applyQuaternion(body.rotation).multiplyScalar(body.half.getComponent(index));
    extent.x += Math.abs(axis.x); extent.y += Math.abs(axis.y); extent.z += Math.abs(axis.z);
  }
  extent.addScalar(margin);
  return new THREE.Box3(body.position.clone().sub(extent), body.position.clone().add(extent));
}

function localTriangle(record, position, inverse) {
  return new THREE.Triangle(...[record.triangle.a, record.triangle.b, record.triangle.c]
    .map(point => point.clone().sub(position).applyQuaternion(inverse)));
}

// Clipping gives a point on the actual triangle inside the queried OBB, rather
// than an AABB centre or a synthetic full-width support point.
function clippedPoint(triangle, half) {
  let polygon = [triangle.a.clone(), triangle.b.clone(), triangle.c.clone()];
  for (let axis = 0; axis < 3; axis += 1) for (const sign of [-1, 1]) {
    const output = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index], b = polygon[(index + 1) % polygon.length];
      const da = sign * a.getComponent(axis) - half.getComponent(axis);
      const db = sign * b.getComponent(axis) - half.getComponent(axis);
      if (da <= EPSILON) output.push(a);
      if ((da < -EPSILON && db > EPSILON) || (da > EPSILON && db < -EPSILON)) {
        output.push(a.clone().lerp(b, da / (da - db)));
      }
    }
    polygon = output;
    if (!polygon.length) return null;
  }
  return polygon.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / polygon.length);
}

function contactForTriangle(record, body, previousPosition, margin) {
  const triangle = localTriangle(record, body.position, body.inverse);
  const expandedHalf = body.half.clone().addScalar(margin);
  const box = new THREE.Box3(expandedHalf.clone().negate(), expandedHalf);
  if (!box.intersectsTriangle(triangle)) return null;
  const point = clippedPoint(triangle, expandedHalf);
  if (!point) return null;
  const normal = record.normal.clone();
  const previousSide = previousPosition ? normal.dot(previousPosition.clone().sub(record.triangle.a)) : 0;
  // A known prior pose chooses the approach side of a two-sided surface.
  // Without it, preserve the mesh's outward normal: a box already penetrating
  // a roof must not turn the underside into an upward support face.
  if (previousPosition && previousSide < -EPSILON) normal.negate();
  const localNormal = normal.clone().applyQuaternion(body.inverse);
  const radius = Math.abs(localNormal.x) * body.half.x + Math.abs(localNormal.y) * body.half.y + Math.abs(localNormal.z) * body.half.z;
  const distance = normal.dot(body.position.clone().sub(record.triangle.a));
  return {
    point: plain(point.applyQuaternion(body.rotation).add(body.position)), normal: plain(normal),
    penetrationMm: Math.max(0, radius - distance), separationMm: distance - radius,
    kind: bodyKind(normal), sourceId: record.sourceId, triangleIndex: record.triangleIndex,
    instanceId: record.instanceId
  };
}

function satAxes(triangle) {
  const edges = [triangle.b.clone().sub(triangle.a), triangle.c.clone().sub(triangle.b), triangle.a.clone().sub(triangle.c)];
  return [...AXES, new THREE.Vector3().crossVectors(edges[0], edges[1]),
    ...edges.flatMap(edge => AXES.map(axis => new THREE.Vector3().crossVectors(edge, axis)))];
}

// Exact continuous SAT for a translating, non-rotating box and a triangle.
// Terrain triangles have zero thickness; checking only the final pose would
// allow a fast body to pass completely through a wall or a floor.
function translationHit(record, start, half, rotation, endPosition, margin) {
  const inverse = rotation.clone().invert();
  const triangle = localTriangle(record, start, inverse);
  const delta = endPosition.clone().sub(start).applyQuaternion(inverse);
  const extent = half.clone().addScalar(margin);
  let enter = -Infinity, leave = Infinity, enterNormal = null;
  for (const rawAxis of satAxes(triangle)) {
    if (rawAxis.lengthSq() < EPSILON * EPSILON) continue;
    const axis = rawAxis.clone().normalize();
    const projections = [triangle.a.dot(axis), triangle.b.dot(axis), triangle.c.dot(axis)];
    const minimum = Math.min(...projections), maximum = Math.max(...projections);
    const radius = Math.abs(axis.x) * extent.x + Math.abs(axis.y) * extent.y + Math.abs(axis.z) * extent.z;
    const speed = delta.dot(axis);
    if (Math.abs(speed) <= EPSILON) {
      if (minimum > radius + EPSILON || maximum < -radius - EPSILON) return null;
      continue;
    }
    const times = [(minimum - radius) / speed, (maximum + radius) / speed].sort((a, b) => a - b);
    if (times[0] > enter) { enter = times[0]; enterNormal = axis.clone().multiplyScalar(speed > 0 ? -1 : 1); }
    leave = Math.min(leave, times[1]);
    if (enter > leave + EPSILON) return null;
  }
  if (leave < -EPSILON || enter > 1 + EPSILON) return null;
  const initialOverlap = enter <= 0;
  const timeOfImpact = Math.min(1, Math.max(0, enter));
  const position = start.clone().lerp(endPosition, timeOfImpact);
  const body = { position, half, rotation, inverse };
  const contact = contactForTriangle(record, body, start, margin + EPSILON * 4);
  if (!contact) return null;
  if (!initialOverlap && enterNormal) contact.normal = plain(enterNormal.applyQuaternion(rotation));
  contact.kind = bodyKind(contact.normal);
  // Existing resting contact must not stop a tangential/away sweep at t=0.
  // Its penetration is still available through queryBodyContacts().
  const movement = endPosition.clone().sub(start);
  if (initialOverlap && movement.dot(vector(contact.normal, 'normal')) >= -EPSILON) return null;
  return { timeOfImpact, initialOverlap, contact };
}

function deduplicateContacts(contacts) {
  const unique = new Map();
  for (const contact of contacts) {
    // Adjacent coplanar triangles share one response plane, but distinct
    // corners/walls retain their own normals. No physical support is widened.
    const normal = contact.normal, point = contact.point;
    const plane = normal.x * point.x + normal.y * point.y + normal.z * point.z;
    const key = [contact.sourceId, normal.x, normal.y, normal.z, plane].map(value => typeof value === 'number' ? value.toFixed(5) : value).join('|');
    const previous = unique.get(key);
    if (!previous || contact.penetrationMm > previous.penetrationMm) unique.set(key, contact);
  }
  return [...unique.values()];
}

/**
 * Read-only contact geometry for the existing Train physics service. Inputs
 * are explicitly classified solid meshes from getTerrainOccluders(), not a
 * scene traversal, render alpha, Challenge's water datum, or a proxy AABB.
 * Snapshot vertices use the actual mesh matrix, then the canonical display ->
 * machine -> route transform. refresh() only rebuilds this derived geometry.
 */
export function createTerrainMeshContact({
  routeFrame, solidMeshes = [], getSolidMeshes = null, machineMount,
  meshCoordinateFrame = 'display', cellSizeMm = 32, minimumGroundNormalY = 0.5,
  rotationStepRad = Math.PI / 90, maximumRotationSegments = 90
} = {}) {
  if (!routeFrame?.originMm) throw new TypeError('A Train route frame is required.');
  if (!['display', 'machine', 'route'].includes(meshCoordinateFrame)) throw new TypeError('Unknown mesh coordinate frame.');
  if (!(cellSizeMm > 0) || !Number.isFinite(cellSizeMm)) throw new RangeError('cellSizeMm must be positive.');
  if (!(minimumGroundNormalY > 0 && minimumGroundNormalY <= 1)) throw new RangeError('minimumGroundNormalY must be in (0, 1].');
  if (!(rotationStepRad > 0) || !Number.isFinite(rotationStepRad)
    || !Number.isSafeInteger(maximumRotationSegments) || maximumRotationSegments < 1) throw new RangeError('Invalid rotation sweep bounds.');
  const forward = vector(routeFrame.forward, 'route.forward'), up = vector(routeFrame.up, 'route.up'), right = vector(routeFrame.right, 'route.right');
  for (const axis of [forward, up, right]) if (Math.abs(axis.length() - 1) > 1e-6) throw new TypeError('Route axes must be unit length.');
  if (Math.max(Math.abs(forward.dot(up)), Math.abs(forward.dot(right)), Math.abs(up.dot(right))) > 1e-6
    || new THREE.Vector3().crossVectors(forward, up).dot(right) < 1 - 1e-6) throw new TypeError('Route axes must be right-handed and orthogonal.');
  const origin = vector({ x: routeFrame.originMm.xMm, y: routeFrame.originMm.yMm, z: routeFrame.originMm.zMm }, 'route.originMm');
  const machineToRoute = new THREE.Matrix4().makeBasis(forward, up, right).setPosition(origin).invert();
  let sourceToRoute = machineToRoute;
  if (meshCoordinateFrame === 'display') {
    if (!machineMount) throw new TypeError('The canonical machineMount is required for display terrain meshes.');
    const mount = normalizeMachineMount(machineMount);
    const machineToDisplay = new THREE.Matrix4().makeRotationZ(mount.yawRad).setPosition(mount.position.x, mount.position.y, mount.position.z);
    sourceToRoute = machineToRoute.clone().multiply(machineToDisplay.invert());
  } else if (meshCoordinateFrame === 'route') sourceToRoute = new THREE.Matrix4();

  let records = [], cells = new Map(), wideTriangles = [], meshCount = 0, excludedMeshCount = 0, generation = 0;
  let bounds = new THREE.Box3();
  const counters = { samples: 0, unsupportedSamples: 0, invalidHeightSamples: 0, bodyQueries: 0, sweeps: 0,
    triangleTests: 0, contactCount: 0, rotationalSweeps: 0 };
  const key = (x, z) => `${x},${z}`;

  function refresh() {
    const input = getSolidMeshes ? getSolidMeshes() : solidMeshes;
    if (!Array.isArray(input)) throw new TypeError('getSolidMeshes() must return an explicit solid mesh array.');
    const nextRecords = [], nextBounds = new THREE.Box3();
    let nextMeshCount = 0, nextExcluded = 0;
    for (const mesh of new Set(input)) {
      if (explicitlyNonSolid(mesh)) { nextExcluded += 1; continue; }
      if (!mesh?.isMesh || !mesh.geometry?.getAttribute('position')) throw new TypeError('Solid contact sources must be triangle meshes.');
      if (mesh.isSkinnedMesh || mesh.morphTargetInfluences?.some(value => value !== 0)) throw new TypeError('Deformed terrain must be baked before contact queries.');
      mesh.updateWorldMatrix(true, false);
      const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
      const count = indices?.count ?? positions.count;
      if (count % 3 !== 0) throw new TypeError('Solid contact geometry must contain complete triangles.');
      for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance += 1) {
        const matrix = sourceToRoute.clone().multiply(mesh.matrixWorld);
        if (mesh.isInstancedMesh) { const instanceMatrix = new THREE.Matrix4(); mesh.getMatrixAt(instance, instanceMatrix); matrix.multiply(instanceMatrix); }
        const determinant = matrix.determinant();
        if (!Number.isFinite(determinant) || Math.abs(determinant) < EPSILON) throw new TypeError('Solid terrain transforms must be invertible.');
        for (let index = 0; index < count; index += 3) {
          const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(index + offset) : index + offset).applyMatrix4(matrix));
          if (!vertices.every(point => [point.x, point.y, point.z].every(Number.isFinite))) throw new TypeError('Solid contact vertices must be finite.');
          const triangle = new THREE.Triangle(...vertices), normal = triangle.getNormal(new THREE.Vector3());
          if (normal.lengthSq() < EPSILON) continue;
          // Reflected object matrices reverse winding but not the physical
          // outward normal; mirror the renderer's front-face correction.
          if (determinant < 0) normal.negate();
          const triangleBounds = new THREE.Box3().setFromPoints(vertices);
          nextBounds.union(triangleBounds);
          nextRecords.push({ triangle, normal, bounds: triangleBounds, sourceId: sourceName(mesh), triangleIndex: index / 3,
            instanceId: mesh.isInstancedMesh ? instance : null });
        }
      }
      nextMeshCount += 1;
    }
    const nextCells = new Map(), nextWide = [];
    for (const record of nextRecords) {
      const minX = Math.floor(record.bounds.min.x / cellSizeMm), maxX = Math.floor(record.bounds.max.x / cellSizeMm);
      const minZ = Math.floor(record.bounds.min.z / cellSizeMm), maxZ = Math.floor(record.bounds.max.z / cellSizeMm);
      if (![minX, maxX, minZ, maxZ].every(Number.isSafeInteger)
        || (maxX - minX + 1) * (maxZ - minZ + 1) > 4096) { nextWide.push(record); continue; }
      for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) {
        const id = key(x, z);
        if (!nextCells.has(id)) nextCells.set(id, []);
        nextCells.get(id).push(record);
      }
    }
    records = nextRecords; cells = nextCells; wideTriangles = nextWide; bounds = nextBounds;
    meshCount = nextMeshCount; excludedMeshCount = nextExcluded; generation += 1;
    return getDiagnostics();
  }

  function candidates(box) {
    const minX = Math.floor(box.min.x / cellSizeMm), maxX = Math.floor(box.max.x / cellSizeMm);
    const minZ = Math.floor(box.min.z / cellSizeMm), maxZ = Math.floor(box.max.z / cellSizeMm);
    if (![minX, maxX, minZ, maxZ].every(Number.isSafeInteger)
      || (maxX - minX + 1) * (maxZ - minZ + 1) > 4096) return records.filter(record => box.intersectsBox(record.bounds));
    const found = new Set(wideTriangles);
    for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) {
      for (const record of cells.get(key(x, z)) || []) found.add(record);
    }
    return [...found].filter(record => box.intersectsBox(record.bounds));
  }

  function verticalHit(forwardMm, rightMm, heightMm, direction) {
    const ray = new THREE.Ray(new THREE.Vector3(forwardMm, heightMm, rightMm), new THREE.Vector3(0, direction, 0));
    const column = new THREE.Box3(new THREE.Vector3(forwardMm - EPSILON, -Infinity, rightMm - EPSILON),
      new THREE.Vector3(forwardMm + EPSILON, Infinity, rightMm + EPSILON));
    let result = null, distance = Infinity;
    for (const record of candidates(column)) {
      if (-direction * record.normal.y < minimumGroundNormalY) continue;
      counters.triangleTests += 1;
      const hit = ray.intersectTriangle(record.triangle.a, record.triangle.b, record.triangle.c, false, new THREE.Vector3());
      if (!hit) continue;
      const nextDistance = Math.abs(hit.y - heightMm);
      if (nextDistance >= distance) continue;
      distance = nextDistance;
      result = { heightMm: hit.y, normal: plain(record.normal), kind: direction < 0 ? 'terrain-ground' : 'terrain-ceiling',
        sourceId: record.sourceId, triangleIndex: record.triangleIndex, instanceId: record.instanceId,
        point: plain(hit), distanceMm: distance, actualSolid: true };
    }
    return result;
  }

  function sample({ forwardMm = 0, rightMm = 0, probeHeightMm, previousHeightMm } = {}) {
    finite(forwardMm, 'forwardMm'); finite(rightMm, 'rightMm');
    counters.samples += 1;
    if (!Number.isFinite(probeHeightMm)) { counters.invalidHeightSamples += 1; counters.unsupportedSamples += 1; return null; }
    // A previous lower-body probe can catch a crossed floor, but an unrelated
    // roof above both poses cannot become the support surface.
    const heightMm = Number.isFinite(previousHeightMm) ? Math.max(probeHeightMm, previousHeightMm) : probeHeightMm;
    const hit = verticalHit(forwardMm, rightMm, heightMm + EPSILON, -1);
    if (!hit) counters.unsupportedSamples += 1;
    return hit;
  }

  function queryColumn({ forwardMm = 0, rightMm = 0, probeHeightMm } = {}) {
    finite(forwardMm, 'forwardMm'); finite(rightMm, 'rightMm'); finite(probeHeightMm, 'probeHeightMm');
    const ground = verticalHit(forwardMm, rightMm, probeHeightMm + EPSILON, -1);
    const ceiling = verticalHit(forwardMm, rightMm, probeHeightMm - EPSILON, 1);
    return { ground, ceiling, clearanceMm: ground && ceiling ? ceiling.heightMm - ground.heightMm : null, actualSolidOnly: true };
  }

  function embeddedContacts(shape, existingContacts) {
    // Surface SAT alone misses a small body wholly inside a thick solid. A
    // signed vertical crossing count detects that case, including hollow
    // tunnels: inward cavity faces cancel their outward shell faces. Material
    // primitives with the same solid source ID must participate together.
    const column = new THREE.Box3(new THREE.Vector3(shape.position.x - EPSILON, shape.position.y + EPSILON, shape.position.z - EPSILON),
      new THREE.Vector3(shape.position.x + EPSILON, Infinity, shape.position.z + EPSILON));
    const ray = new THREE.Ray(shape.position.clone(), new THREE.Vector3(0, 1, 0));
    const covered = new Set(existingContacts.map(contact => contact.sourceId));
    const groups = new Map(), seen = new Set();
    for (const record of candidates(column)) {
      if (covered.has(record.sourceId) || Math.abs(record.normal.y) < EPSILON) continue;
      counters.triangleTests += 1;
      const hit = ray.intersectTriangle(record.triangle.a, record.triangle.b, record.triangle.c, false, new THREE.Vector3());
      if (!hit || hit.y - shape.position.y < EPSILON) continue;
      const sign = Math.sign(record.normal.y), id = `${record.sourceId}|${hit.y.toFixed(6)}|${sign}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const group = groups.get(record.sourceId) || { winding: 0, distance: Infinity };
      group.winding += sign;
      group.distance = Math.min(group.distance, hit.y - shape.position.y);
      groups.set(record.sourceId, group);
    }
    const contacts = [];
    for (const [sourceId, group] of groups) {
      if (!group.winding) continue;
      const extent = new THREE.Vector3().setScalar(group.distance + EPSILON);
      const nearby = new THREE.Box3(shape.position.clone().sub(extent), shape.position.clone().add(extent));
      let nearest = null;
      for (const record of candidates(nearby)) {
        if (record.sourceId !== sourceId) continue;
        counters.triangleTests += 1;
        const point = record.triangle.closestPointToPoint(shape.position, new THREE.Vector3());
        const distance = point.distanceTo(shape.position);
        if (!nearest || distance < nearest.distance) nearest = { record, point, distance };
      }
      if (!nearest || nearest.distance < EPSILON) continue;
      const normal = nearest.point.clone().sub(shape.position).normalize();
      const localNormal = normal.clone().applyQuaternion(shape.inverse);
      const radius = Math.abs(localNormal.x) * shape.half.x + Math.abs(localNormal.y) * shape.half.y + Math.abs(localNormal.z) * shape.half.z;
      contacts.push({ point: plain(nearest.point), normal: plain(normal), penetrationMm: nearest.distance + radius,
        separationMm: -nearest.distance - radius, kind: bodyKind(normal), sourceId,
        triangleIndex: nearest.record.triangleIndex, instanceId: nearest.record.instanceId, embedded: true });
    }
    return contacts;
  }

  function queryBodyContacts({ body, previousPosition = null, contactMarginMm = 0 } = {}) {
    if (!(contactMarginMm >= 0) || !Number.isFinite(contactMarginMm)) throw new RangeError('contactMarginMm must be nonnegative.');
    const shape = bodyGeometry(body), previous = previousPosition ? vector(previousPosition, 'previousPosition') : null;
    counters.bodyQueries += 1;
    const contacts = [];
    for (const record of candidates(bodyBounds(shape, contactMarginMm + EPSILON))) {
      counters.triangleTests += 1;
      const contact = contactForTriangle(record, shape, previous, contactMarginMm);
      if (contact) contacts.push(contact);
    }
    contacts.push(...embeddedContacts(shape, contacts));
    const unique = deduplicateContacts(contacts);
    counters.contactCount += unique.length;
    const column = queryColumn({ forwardMm: shape.position.x, rightMm: shape.position.z, probeHeightMm: shape.position.y });
    return { contacts: unique, ground: column.ground, ceiling: column.ceiling, walls: unique.filter(contact => contact.kind === 'terrain-wall'),
      supported: unique.some(contact => contact.kind === 'terrain-ground'),
      diagnostics: { actualSolidOnly: true, contactCount: unique.length, columnClearanceMm: column.clearanceMm,
        belowGround: unique.some(contact => contact.kind === 'terrain-ground' && contact.penetrationMm > EPSILON),
        embeddedInSolid: unique.some(contact => contact.embedded),
        ceilingCollision: unique.some(contact => contact.kind === 'terrain-ceiling'), bodyWallCollision: unique.some(contact => contact.kind === 'terrain-wall') } };
  }

  function sweepBody({ body, previousPosition, previousRotation = body?.rotation, contactMarginMm = 0 } = {}) {
    if (!(contactMarginMm >= 0) || !Number.isFinite(contactMarginMm)) throw new RangeError('contactMarginMm must be nonnegative.');
    const shape = bodyGeometry(body), start = vector(previousPosition, 'previousPosition'), rotation = quaternion(previousRotation);
    const angle = rotation.angleTo(shape.rotation);
    const segmentCount = Math.max(1, Math.min(maximumRotationSegments, Math.ceil(angle / rotationStepRad)));
    const rotationalConservative = angle > EPSILON;
    const angularPaddingMm = rotationalConservative ? 2 * shape.radius * Math.sin(angle / segmentCount / 2) : 0;
    counters.sweeps += 1;
    if (rotationalConservative) counters.rotationalSweeps += 1;
    let earliest = null;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const t0 = segment / segmentCount, t1 = (segment + 1) / segmentCount;
      const p0 = start.clone().lerp(shape.position, t0), p1 = start.clone().lerp(shape.position, t1);
      const q0 = rotation.clone().slerp(shape.rotation, t0);
      const segmentShape = { ...shape, position: p0, rotation: q0 };
      const margin = contactMarginMm + angularPaddingMm;
      const box = bodyBounds(segmentShape, margin).union(bodyBounds({ ...segmentShape, position: p1 }, margin));
      for (const record of candidates(box)) {
        counters.triangleTests += 1;
        let hit = translationHit(record, p0, shape.half, q0, p1, margin);
        // A rotating body may contact with no centre translation. Its swept
        // envelope is conservative and is explicitly reported as such.
        if (!hit && rotationalConservative) {
          const contact = contactForTriangle(record, { ...segmentShape, inverse: q0.clone().invert() }, p0, margin);
          if (contact) hit = { timeOfImpact: 0, initialOverlap: true, contact };
        }
        if (!hit) continue;
        const timeOfImpact = t0 + hit.timeOfImpact / segmentCount;
        if (!earliest || timeOfImpact < earliest.timeOfImpact - EPSILON) {
          earliest = { timeOfImpact, initialOverlap: hit.initialOverlap && segment === 0, contacts: [hit.contact] };
        } else if (Math.abs(timeOfImpact - earliest.timeOfImpact) <= EPSILON) earliest.contacts.push(hit.contact);
      }
      if (earliest) break;
    }
    if (!earliest) return null;
    earliest.contacts = deduplicateContacts(earliest.contacts);
    earliest.diagnostics = { actualSolidOnly: true, translationExact: !rotationalConservative, rotationalConservative,
      rotationSegments: segmentCount, angularPaddingMm, geometryGeneration: generation };
    return earliest;
  }

  function getDiagnostics() {
    return deepFreezePlain({ schemaVersion: 'robo-bridge.terrain-mesh-contact.v1', coordinateFrame: 'train-route-local-mm',
      source: 'explicit-solid-terrain-meshes', meshCoordinateFrame, meshCount, excludedMeshCount, triangleCount: records.length,
      cellCount: cells.size, geometryGeneration: generation, solidNames: [...new Set(records.map(record => record.sourceId))],
      bounds: bounds.isEmpty() ? null : { min: plain(bounds.min), max: plain(bounds.max) }, ...counters,
      waterIsSupport: false, fallbackFloor: false, proxySupport: false, proceduralTerrainUsed: false,
      ownsPhysics: false, mutatesBodies: false, ownsFrameLoop: false });
  }

  refresh();
  return Object.freeze({ schemaVersion: 'robo-bridge.terrain-mesh-contact.v1', sample, queryColumn, queryBodyContacts, sweepBody,
    heightAt: (forwardMm, rightMm, probeHeightMm) => typeof forwardMm === 'object' ? sample(forwardMm) : sample({ forwardMm, rightMm, probeHeightMm }),
    refresh, getDiagnostics });
}
