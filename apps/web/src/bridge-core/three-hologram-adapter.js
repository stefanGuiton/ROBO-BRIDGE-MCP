'use strict';

import { BridgeCoreError } from './errors.js';
import { createCustomPartRegistry } from './custom-part-geometry.js';

function requireThree(THREE) {
  const required = ['Group', 'BoxGeometry', 'BufferGeometry', 'BufferAttribute', 'MeshStandardMaterial', 'InstancedMesh', 'Matrix4', 'Quaternion', 'Vector3'];
  const missing = required.filter((name) => typeof THREE?.[name] !== 'function');
  if (missing.length) throw new BridgeCoreError('INVALID_SETTINGS', 'A compatible Three.js namespace is required.', { missing });
}

function defaultPosition(THREE, point) {
  return new THREE.Vector3(point.xMm, point.zMm, point.yMm);
}

function material(THREE, colour, opacity) {
  return new THREE.MeshStandardMaterial({
    color: colour || '#888888',
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
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
  machinePositionToThree = null,
  machineYawToThree = (yawRad) => -yawRad,
  name = 'ROBO_BRIDGE_HOLOGRAM'
} = {}) {
  requireThree(THREE);
  if (!snapshot?.placements || !Array.isArray(snapshot.placements)) {
    throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'A hologram snapshot is required.');
  }
  const toPosition = machinePositionToThree ?? ((point) => defaultPosition(THREE, point));
  const group = new THREE.Group();
  group.name = name;
  group.userData = {
    planId: snapshot.source.planId,
    designChecksum: snapshot.source.designChecksum,
    designRevision: snapshot.source.designRevision,
    family: snapshot.source.family,
    hologram: true
  };

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
    const mesh = new THREE.InstancedMesh(geometry, material(THREE, first.colourHex, opacity), placements.length);
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
    group.add(mesh);
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
      ? [material(THREE, '#888888', opacity), material(THREE, first.trackMaterials?.sleepers, opacity), material(THREE, first.trackMaterials?.rails, opacity)]
      : [material(THREE, first.colourHex, opacity)];
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
    group.add(mesh);
  }
  return group;
}

export function disposeThreeBridgeHologram(group) {
  group?.traverse?.((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((item) => item?.dispose?.());
    else object.material?.dispose?.();
  });
  group?.removeFromParent?.();
}
