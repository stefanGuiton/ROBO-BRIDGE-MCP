'use strict';

import { BridgeCoreError } from './errors.js';
import { createCustomPartRegistry } from './custom-part-geometry.js';

function requireThree(THREE, depthPrepass) {
  const required = ['Group', 'BoxGeometry', 'BufferGeometry', 'BufferAttribute', 'MeshStandardMaterial', 'InstancedMesh', 'Matrix4', 'Quaternion', 'Vector3'];
  if (depthPrepass) required.push('MeshBasicMaterial');
  const missing = required.filter((name) => typeof THREE?.[name] !== 'function');
  if (missing.length) throw new BridgeCoreError('INVALID_SETTINGS', 'A compatible Three.js namespace is required.', { missing });
}

function defaultPosition(THREE, point) {
  return new THREE.Vector3(point.xMm, point.zMm, point.yMm);
}

function material(THREE, colour, opacity, depthPrepass) {
  return new THREE.MeshStandardMaterial({
    color: colour || '#888888',
    transparent: depthPrepass || opacity < 1,
    opacity,
    depthTest: true,
    depthWrite: !depthPrepass && opacity >= 1,
    depthFunc: THREE.LessEqualDepth,
    roughness: 0.72,
    metalness: 0.02
  });
}

function geometryGroups(geometry, materials) {
  if (!geometry.materials?.length) return;
  let start = 0;
  let current = geometry.materials[0];
  for (let vertex = 1; vertex <= geometry.materials.length; vertex += 1) {
    const value = vertex < geometry.materials.length ? geometry.materials[vertex] : -1;
    if (value === current) continue;
    geometry.addGroup(start, vertex - start, current < materials.length ? current : 0);
    start = vertex;
    current = value;
  }
}

export function createThreeBridgeHologram({
  THREE,
  snapshot,
  buildPlan,
  opacity = 0.34,
  colour = null,
  depthPrepass = false,
  renderOrder = 0,
  machinePositionToThree = null,
  machineYawToThree = (yawRad) => -yawRad,
  name = 'ROBO_BRIDGE_HOLOGRAM'
} = {}) {
  // A fully hidden hologram must not become an invisible scene occluder.
  const useDepthPrepass = Boolean(depthPrepass) && opacity > 0;
  requireThree(THREE, useDepthPrepass);
  if (!snapshot?.placements || !Array.isArray(snapshot.placements)) {
    throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'A hologram snapshot is required.');
  }
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'Hologram opacity must be between zero and one.', { opacity });
  }
  if (colour !== null && !/^#[0-9a-f]{6}$/i.test(colour)) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'Hologram colour must be a six-digit hex colour.', { colour });
  }
  const toPosition = machinePositionToThree ?? ((point) => defaultPosition(THREE, point));
  const group = new THREE.Group();
  group.name = name;
  group.renderOrder = renderOrder;
  group.userData = {
    planId: snapshot.source.planId,
    designChecksum: snapshot.source.designChecksum,
    designRevision: snapshot.source.designRevision,
    family: snapshot.source.family,
    hologram: true
  };
  const stats = {
    mode: useDepthPrepass ? 'exact-depth-prepass' : 'transparent',
    opacity,
    colour,
    placementCount: snapshot.placements.length,
    colourMeshCount: 0,
    depthMeshCount: 0,
    uniqueGeometryCount: 0,
    colourDrawCalls: 0,
    depthDrawCalls: 0,
    colourTriangles: 0,
    depthTriangles: 0,
    instanceMatrixBytes: 0
  };
  let depthMaterial = null;
  function addMesh(mesh) {
    const triangles = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * mesh.count;
    mesh.userData.renderPass = 'colour';
    mesh.userData.hologramMeshIndex = stats.colourMeshCount;
    mesh.renderOrder = renderOrder + 1;
    stats.colourMeshCount += 1;
    stats.uniqueGeometryCount += 1;
    stats.colourDrawCalls += Array.isArray(mesh.material) ? mesh.geometry.groups.length : 1;
    stats.colourTriangles += triangles;
    stats.instanceMatrixBytes += mesh.instanceMatrix.array.byteLength;
    if (useDepthPrepass) {
      depthMaterial ??= new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: true,
        depthTest: true,
        depthFunc: THREE.LessEqualDepth,
        transparent: false,
        blending: THREE.NoBlending
      });
      // The opaque depth queue finishes before ANY transparent colour pass.
      // Sharing the exact geometry and instance buffer preserves real arches,
      // openings and track; there is no approximate exterior/artistic mesh.
      const depthMesh = new THREE.InstancedMesh(mesh.geometry, depthMaterial, mesh.count);
      depthMesh.instanceMatrix = mesh.instanceMatrix;
      depthMesh.userData = { ...mesh.userData, renderPass: 'depth' };
      depthMesh.renderOrder = renderOrder;
      group.add(depthMesh);
      stats.depthMeshCount += 1;
      stats.depthDrawCalls += 1;
      stats.depthTriangles += triangles;
    }
    group.add(mesh);
  }

  const standardGroups = new Map();
  for (const placement of snapshot.placements.filter((item) => item.geometryKind === 'box')) {
    const size = placement.localSizeMm;
    const key = `${size.xMm}:${size.yMm}:${size.zMm}:${placement.colourHex}`;
    if (!standardGroups.has(key)) standardGroups.set(key, []);
    standardGroups.get(key).push(placement);
  }
  for (const placements of standardGroups.values()) {
    const first = placements[0];
    const size = first.localSizeMm;
    const geometry = new THREE.BoxGeometry(size.xMm, size.yMm, size.zMm);
    const mesh = new THREE.InstancedMesh(geometry, material(THREE, colour ?? first.colourHex, opacity, useDepthPrepass), placements.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    placements.forEach((placement, index) => {
      const position = toPosition(placement.targetTransform.position);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), machineYawToThree(placement.targetTransform.yawRad));
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.placementIds = placements.map((placement) => placement.placementId);
    mesh.userData.geometryKind = 'box';
    mesh.userData.partClass = first.partClass;
    addMesh(mesh);
  }

  const registry = createCustomPartRegistry(buildPlan);
  const customGroups = new Map();
  for (const placement of snapshot.placements.filter((item) => item.geometryKind === 'custom-definition')) {
    if (!customGroups.has(placement.definitionId)) customGroups.set(placement.definitionId, []);
    customGroups.get(placement.definitionId).push(placement);
  }
  for (const [definitionId, placements] of customGroups) {
    const definition = registry.getDefinition(definitionId);
    const source = registry.getGeometry(definitionId);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(source.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(source.normals, 3));
    const first = placements[0];
    const materials = definition.partClass === 'TRACK_SEGMENT'
      ? [material(THREE, colour ?? '#888888', opacity, useDepthPrepass), material(THREE, colour ?? first.trackMaterials?.sleepers, opacity, useDepthPrepass), material(THREE, colour ?? first.trackMaterials?.rails, opacity, useDepthPrepass)]
      : [material(THREE, colour ?? first.colourHex, opacity, useDepthPrepass)];
    geometryGroups({ ...source, addGroup: geometry.addGroup.bind(geometry) }, materials);
    const mesh = new THREE.InstancedMesh(geometry, materials, placements.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    placements.forEach((placement, index) => {
      const position = toPosition(placement.targetTransform.position);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), machineYawToThree(placement.targetTransform.yawRad));
      scale.setScalar(placement.targetTransform.uniformScale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.definitionId = definitionId;
    mesh.userData.partClass = definition.partClass;
    mesh.userData.placementIds = placements.map((placement) => placement.placementId);
    mesh.userData.geometryKind = 'custom-definition';
    addMesh(mesh);
  }
  // Geometry workload, not a measured FPS claim. The second pass shares its
  // geometry and instance buffers; actual GPU cost still needs browser QA.
  group.userData.renderStats = Object.freeze({ ...stats,
    totalDrawCalls: stats.colourDrawCalls + stats.depthDrawCalls,
    totalTriangles: stats.colourTriangles + stats.depthTriangles
  });
  return group;
}

const disposedGroups = new WeakSet();

export function disposeThreeBridgeHologram(group) {
  if (!group || disposedGroups.has(group)) return;
  disposedGroups.add(group);
  const geometries = new Set();
  const materials = new Set();
  group?.traverse?.((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const item of Array.isArray(object.material) ? object.material : [object.material]) {
      if (item) materials.add(item);
    }
    // InstancedMesh owns GPU instance attributes separately from geometry.
    if (object.isInstancedMesh) object.dispose?.();
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const item of materials) item.dispose?.();
  group?.removeFromParent?.();
}
