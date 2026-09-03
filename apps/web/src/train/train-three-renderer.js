'use strict';

import { mergedCollisionFaceBox } from './bridge-collision-snapshot.js';
import { cloneValue, quaternionFromXDirection } from './math.js';
import { routeLocalPointToMachine, routeLocalQuaternionToMachine } from './route-frame.js';

function requireThree(THREE) {
  const required = ['Group', 'Mesh', 'BoxGeometry', 'MeshStandardMaterial', 'Vector3', 'Quaternion'];
  for (const name of required) if (typeof THREE?.[name] !== 'function') throw new TypeError(`THREE.${name} is required.`);
}

function applyMachinePose(object, positionMm, quaternion) {
  object.position.set(positionMm.xMm, positionMm.yMm, positionMm.zMm);
  object.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
}

function removeObject(object) {
  object?.removeFromParent?.();
}


export function createTrainThreeRenderer({
  THREE,
  machineRoot,
  requestRender = () => {},
  vehicleMeshFactory = null,
  materialFactory = null
} = {}) {
  requireThree(THREE);
  if (!machineRoot?.add) throw new TypeError('MAIN_DEMO machineRoot is required.');
  const root = new THREE.Group();
  root.name = 'ROBO_BRIDGE_TRAIN_V22';
  const trainGroup = new THREE.Group();
  trainGroup.name = 'TRAIN_PLACEHOLDERS';
  const couplerGroup = new THREE.Group();
  couplerGroup.name = 'TRAIN_COUPLERS';
  const pusherGroup = new THREE.Group();
  pusherGroup.name = 'PUSH_POSITION_BLOCK';
  const supportDebugGroup = new THREE.Group();
  supportDebugGroup.name = 'TRAIN_SUPPORT_DEBUG';
  const collisionDebugGroup = new THREE.Group();
  collisionDebugGroup.name = 'TRAIN_COLLISION_DEBUG';
  root.add(trainGroup, couplerGroup, pusherGroup, supportDebugGroup, collisionDebugGroup);
  machineRoot.add(root);

  const materialCache = new Map();
  const makeMaterial = (kind, id = '') => {
    const key = `${kind}:${id}`;
    if (materialCache.has(key)) return materialCache.get(key);
    if (materialFactory) {
      const material = materialFactory({ THREE, kind, id });
      materialCache.set(key, material);
      return material;
    }
    const values = {
      A: 0x9f2d24,
      B: 0x166b74,
      C: 0xd18a22,
      coupler: 0x303438,
      pusher: 0x70458d,
      support: 0x3fa468,
      unsupported: 0xbec3c8,
      collision: 0x3a9fd4
    };
    const material = new THREE.MeshStandardMaterial({
      color: values[id] ?? values[kind] ?? 0x777777,
      roughness: 0.68,
      metalness: kind === 'coupler' ? 0.22 : 0.02,
      transparent: kind === 'support' || kind === 'unsupported' || kind === 'collision',
      opacity: kind === 'collision' ? 0.14 : kind === 'support' || kind === 'unsupported' ? 0.28 : 1,
      depthWrite: !(kind === 'support' || kind === 'unsupported' || kind === 'collision')
    });
    materialCache.set(key, material);
    return material;
  };

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const vehicleRoots = new Map();
  const couplerMeshes = [];
  let pusherMesh = null;
  let supportVisible = false;
  let collisionVisible = false;
  let lastSupportChecksum = null;
  let lastCollisionChecksum = null;
  let disposed = false;
  const stats = {
    updates: 0,
    vehicleObjects: 0,
    couplerObjects: 0,
    pusherObjects: 0,
    supportDebugObjects: 0,
    collisionDebugObjects: 0,
    createdCanvases: 0,
    ownsWebGLRenderer: false
  };

  function createVehicleRoot(pose) {
    const holder = new THREE.Group();
    holder.name = `TRAIN_BODY_${pose.id}`;
    let visual = vehicleMeshFactory?.({ THREE, id: pose.id, role: pose.role, pose: cloneValue(pose) });
    if (!visual) visual = new THREE.Mesh(unitBox, makeMaterial('vehicle', pose.id));
    visual.name ||= `TRAIN_BODY_${pose.id}_VISUAL`;
    holder.add(visual);
    trainGroup.add(holder);
    vehicleRoots.set(pose.id, { holder, visual });
    return { holder, visual };
  }

  function ensureCoupler(index) {
    while (couplerMeshes.length <= index) {
      const mesh = new THREE.Mesh(unitBox, makeMaterial('coupler'));
      mesh.name = `TRAIN_COUPLER_${couplerMeshes.length}`;
      couplerGroup.add(mesh);
      couplerMeshes.push(mesh);
    }
    return couplerMeshes[index];
  }

  function ensurePusher() {
    if (!pusherMesh) {
      pusherMesh = new THREE.Mesh(unitBox, makeMaterial('pusher'));
      pusherMesh.name = 'PUSH_POSITION_BLOCK_PLACEHOLDER';
      pusherGroup.add(pusherMesh);
    }
    return pusherMesh;
  }

  function clearGroup(group) {
    const children = [...group.children];
    for (const child of children) removeObject(child);
  }

  function rebuildSupportDebug(supportMap) {
    clearGroup(supportDebugGroup);
    if (!supportVisible || !supportMap?.routeFrame) return;
    const frame = supportMap.routeFrame;
    const heightMm = 3;
    for (const segment of supportMap.segments || []) {
      const mesh = new THREE.Mesh(unitBox, makeMaterial(segment.supported ? 'support' : 'unsupported'));
      mesh.name = `TRAIN_SUPPORT_SEGMENT_${segment.id}`;
      const position = routeLocalPointToMachine(frame, {
        x: (segment.startMm + segment.endMm) * 0.5,
        y: heightMm * 0.5,
        z: 0
      });
      applyMachinePose(mesh, position, frame.routeQuaternion);
      mesh.scale.set(Math.max(0.1, segment.endMm - segment.startMm), heightMm, Math.max(2, frame.bridgeWidthMm * 0.88));
      supportDebugGroup.add(mesh);
    }
    stats.supportDebugObjects = supportDebugGroup.children.length;
  }

  function rebuildCollisionDebug(collisionSnapshot) {
    clearGroup(collisionDebugGroup);
    if (!collisionVisible || !collisionSnapshot?.routeFrame) return;
    const frame = collisionSnapshot.routeFrame;
    for (const face of collisionSnapshot.mergedFaces || []) {
      const localBox = mergedCollisionFaceBox(collisionSnapshot, face);
      const mesh = new THREE.Mesh(unitBox, makeMaterial('collision'));
      mesh.name = `TRAIN_COLLISION_FACE_${face.direction}`;
      applyMachinePose(mesh, routeLocalPointToMachine(frame, localBox.position), frame.routeQuaternion);
      mesh.scale.set(localBox.size.x, localBox.size.y, localBox.size.z);
      collisionDebugGroup.add(mesh);
    }
    stats.collisionDebugObjects = collisionDebugGroup.children.length;
  }

  function update(snapshot, supportMap = null, collisionSnapshot = null) {
    if (disposed || !snapshot) return false;
    const activeIds = new Set();
    for (const pose of snapshot.poses || []) {
      activeIds.add(pose.id);
      const entry = vehicleRoots.get(pose.id) || createVehicleRoot(pose);
      applyMachinePose(entry.holder, pose.machine.positionMm, pose.machine.rotationQuaternion);
      entry.holder.scale.set(pose.sizeMm.xMm, pose.sizeMm.yMm, pose.sizeMm.zMm);
      entry.holder.visible = true;
    }
    for (const [id, entry] of vehicleRoots) entry.holder.visible = activeIds.has(id);

    let couplerCount = 0;
    for (const coupler of snapshot.couplers || []) {
      if (!coupler.visible) continue;
      const mesh = ensureCoupler(couplerCount++);
      const a = coupler.machine.leadAnchorMm;
      const b = coupler.machine.trailingAnchorMm;
      const delta = { x: b.xMm - a.xMm, y: b.yMm - a.yMm, z: b.zMm - a.zMm };
      const distance = Math.hypot(delta.x, delta.y, delta.z);
      if (distance < 1e-6) { mesh.visible = false; continue; }
      const rotation = quaternionFromXDirection(delta);
      applyMachinePose(mesh, {
        xMm: (a.xMm + b.xMm) * 0.5,
        yMm: (a.yMm + b.yMm) * 0.5,
        zMm: (a.zMm + b.zMm) * 0.5
      }, rotation);
      mesh.scale.set(distance, 4, 4);
      mesh.visible = true;
    }
    for (let index = couplerCount; index < couplerMeshes.length; index += 1) couplerMeshes[index].visible = false;

    const pusher = snapshot.pusher;
    if (pusher?.pose) {
      const mesh = ensurePusher();
      applyMachinePose(mesh, pusher.pose.positionMm, pusher.pose.rotationQuaternion);
      mesh.scale.set(pusher.sizeMm.xMm, pusher.sizeMm.yMm, pusher.sizeMm.zMm);
      mesh.visible = Boolean(pusher.visible);
    } else if (pusherMesh) pusherMesh.visible = false;

    if (supportMap?.checksum !== lastSupportChecksum) {
      lastSupportChecksum = supportMap?.checksum ?? null;
      rebuildSupportDebug(supportMap);
    }
    if (collisionSnapshot?.checksum !== lastCollisionChecksum) {
      lastCollisionChecksum = collisionSnapshot?.checksum ?? null;
      rebuildCollisionDebug(collisionSnapshot);
    }
    supportDebugGroup.visible = supportVisible;
    collisionDebugGroup.visible = collisionVisible;
    stats.updates += 1;
    stats.vehicleObjects = [...vehicleRoots.values()].filter((entry) => entry.holder.visible).length;
    stats.couplerObjects = couplerCount;
    stats.pusherObjects = pusherMesh?.visible ? 1 : 0;
    requestRender();
    return true;
  }

  return Object.freeze({
    root,
    update,
    setPusherVisible(value) {
      if (pusherMesh) pusherMesh.visible = Boolean(value);
      requestRender();
      return Boolean(value);
    },
    setDebugSupportVisible(value, supportMap = null) {
      supportVisible = Boolean(value);
      supportDebugGroup.visible = supportVisible;
      if (supportMap) rebuildSupportDebug(supportMap);
      requestRender();
      return supportVisible;
    },
    setCollisionDebugVisible(value, collisionSnapshot = null) {
      collisionVisible = Boolean(value);
      collisionDebugGroup.visible = collisionVisible;
      if (collisionSnapshot) rebuildCollisionDebug(collisionSnapshot);
      requestRender();
      return collisionVisible;
    },
    getStats() { return { ...stats, supportVisible, collisionVisible, disposed }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent?.();
      unitBox.dispose?.();
      for (const material of materialCache.values()) material?.dispose?.();
      materialCache.clear();
      vehicleRoots.clear();
      couplerMeshes.length = 0;
      pusherMesh = null;
    }
  });
}
