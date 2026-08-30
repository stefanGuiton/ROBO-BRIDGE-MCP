import * as THREE from '../../vendor/three.module.min.js';

function expandedBox(box, settings) {
  const radius = Math.max(0, settings.playerCollisionDiameterMm * 0.5) + settings.playerCollisionSkinMm;
  const height = Math.max(settings.playerCollisionDiameterMm, settings.playerCollisionHeightMm);
  const eye = Math.max(0, Math.min(height, settings.playerCollisionEyeFromBottomMm));
  return {
    kind: box.kind,
    minX: box.minX - radius,
    maxX: box.maxX + radius,
    minY: box.minY - radius,
    maxY: box.maxY + radius,
    minZ: box.minZ - (height - eye) - settings.playerCollisionSkinMm,
    maxZ: box.maxZ + eye + settings.playerCollisionSkinMm
  };
}

export class PlayerCapsuleSolver {
  constructor(settings, obstacles = []) {
    this.settings = settings;
    this.obstacles = obstacles.map((box) => expandedBox(box, settings));
    this.lastNormal = new THREE.Vector3();
    this.lastContact = new THREE.Vector3();
    this.lastHitKind = 'NONE';
    this.lastCollisionCount = 0;
    this.position = new THREE.Vector3();
    this.remaining = new THREE.Vector3();
    this.normal = new THREE.Vector3();
  }

  setObstacles(obstacles) {
    this.obstacles = obstacles.map((box) => expandedBox(box, this.settings));
  }

  inside(point, box) {
    return point.x > box.minX && point.x < box.maxX
      && point.y > box.minY && point.y < box.maxY
      && point.z > box.minZ && point.z < box.maxZ;
  }

  pushOut(point, box) {
    const distances = [
      point.x - box.minX, box.maxX - point.x,
      point.y - box.minY, box.maxY - point.y,
      point.z - box.minZ, box.maxZ - point.z
    ];
    let best = 0;
    for (let index = 1; index < distances.length; index += 1) {
      if (distances[index] < distances[best]) best = index;
    }
    const epsilon = 0.02;
    const normals = [
      [-1, 0, 0], [1, 0, 0], [0, -1, 0],
      [0, 1, 0], [0, 0, -1], [0, 0, 1]
    ];
    if (best === 0) point.x = box.minX - epsilon;
    if (best === 1) point.x = box.maxX + epsilon;
    if (best === 2) point.y = box.minY - epsilon;
    if (best === 3) point.y = box.maxY + epsilon;
    if (best === 4) point.z = box.minZ - epsilon;
    if (best === 5) point.z = box.maxZ + epsilon;
    return this.normal.set(...normals[best]);
  }

  sweepPointAabb(point, delta, box) {
    let enter = -Infinity;
    let exit = Infinity;
    let hitNormal = null;
    for (const [axis, minimum, maximum] of [
      ['x', 'minX', 'maxX'], ['y', 'minY', 'maxY'], ['z', 'minZ', 'maxZ']
    ]) {
      const position = point[axis];
      const velocity = delta[axis];
      if (Math.abs(velocity) < 1e-12) {
        if (position <= box[minimum] || position >= box[maximum]) return null;
        continue;
      }
      let first = (box[minimum] - position) / velocity;
      let second = (box[maximum] - position) / velocity;
      let sign = -1;
      if (first > second) {
        [first, second] = [second, first];
        sign = 1;
      }
      if (first > enter) {
        enter = first;
        hitNormal = new THREE.Vector3(
          axis === 'x' ? sign : 0,
          axis === 'y' ? sign : 0,
          axis === 'z' ? sign : 0
        );
      }
      exit = Math.min(exit, second);
      if (enter > exit) return null;
    }
    if (exit < 0 || enter < 0 || enter > 1) return null;
    return { time: enter, normal: hitNormal, kind: box.kind };
  }

  move(start, delta, output = start) {
    if (!this.settings.playerCollisionEnabled) {
      this.lastCollisionCount = 0;
      this.lastHitKind = 'NONE';
      return output.copy(start).add(delta);
    }
    this.position.copy(start);
    this.remaining.copy(delta);
    this.lastCollisionCount = 0;
    this.lastHitKind = 'NONE';
    this.lastNormal.set(0, 0, 0);
    for (const box of this.obstacles) {
      if (!this.inside(this.position, box)) continue;
      this.pushOut(this.position, box);
      this.lastCollisionCount += 1;
      this.lastHitKind = box.kind;
      this.lastNormal.copy(this.normal);
    }
    const iterations = Math.max(1, Math.round(this.settings.playerCollisionMaxIterations));
    for (let iteration = 0; iteration < iterations && this.remaining.lengthSq() > 1e-10; iteration += 1) {
      let best = null;
      for (const box of this.obstacles) {
        const hit = this.sweepPointAabb(this.position, this.remaining, box);
        if (hit && (!best || hit.time < best.time)) best = hit;
      }
      if (!best) {
        this.position.add(this.remaining);
        this.remaining.set(0, 0, 0);
        break;
      }
      const travel = Math.max(0, best.time - 1e-5);
      this.position.addScaledVector(this.remaining, travel);
      this.remaining.multiplyScalar(Math.max(0, 1 - travel));
      const inward = this.remaining.dot(best.normal);
      if (inward < 0) this.remaining.addScaledVector(best.normal, -inward);
      this.position.addScaledVector(best.normal, 0.01);
      this.lastNormal.copy(best.normal);
      this.lastContact.copy(this.position);
      this.lastCollisionCount += 1;
      this.lastHitKind = best.kind;
    }
    return output.copy(this.position);
  }

  getDiagnostics() {
    return {
      enabled: Boolean(this.settings.playerCollisionEnabled),
      diameterMm: this.settings.playerCollisionDiameterMm,
      heightMm: this.settings.playerCollisionHeightMm,
      skinMm: this.settings.playerCollisionSkinMm,
      lastCollisionCount: this.lastCollisionCount,
      lastHitKind: this.lastHitKind,
      lastNormal: this.lastNormal.toArray(),
      lastContact: this.lastContact.toArray()
    };
  }
}
