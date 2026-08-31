import * as THREE from '../../vendor/three.module.min.js';
import { BRICK_SPEC } from '../bricks/brick-spec.js';

const finiteArray = (values, length) => Array.isArray(values) && values.length === length && values.every(Number.isFinite);
const WORLD_UP = new THREE.Vector3(0, 0, 1);

export class LooseBrickPhysics {
  constructor(controller, settings) {
    this.controller = controller;
    this.settings = settings;
    this.active = new Map();
    this.commitAccumulator = 0;
    this.commitStepS = 1 / 60;
    this.axesA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.axesB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.satAxes = Array.from({ length: 15 }, () => new THREE.Vector3());
    this.delta = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.relativeVelocity = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.impulse = new THREE.Vector3();
    this.contactOffset = new THREE.Vector3();
    this.torqueImpulse = new THREE.Vector3();
    this.impulseForTorque = new THREE.Vector3();
    this.deltaQuaternion = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    this.contactPenetrationMm = 0;
  }

  clear() {
    this.active.clear();
    this.commitAccumulator = 0;
  }

  launch(brickId, {
    position,
    quaternion = null,
    velocityMmS = [0, 0, 0],
    angularVelocityRadS = [0, 0, 0],
    yawRad = 0
  } = {}) {
    if (typeof brickId !== 'string' || !position
      || ![position.xMm, position.yMm, position.zMm].every(Number.isFinite)
      || !finiteArray(velocityMmS, 3) || !finiteArray(angularVelocityRadS, 3)
      || (quaternion !== null && !finiteArray(quaternion, 4))) return false;
    const orientation = quaternion
      ? new THREE.Quaternion().fromArray(quaternion).normalize()
      : new THREE.Quaternion().setFromAxisAngle(WORLD_UP, yawRad);
    this.active.set(brickId, {
      position: new THREE.Vector3(position.xMm, position.yMm, position.zMm),
      quaternion: orientation,
      velocityMps: new THREE.Vector3(...velocityMmS).multiplyScalar(0.001),
      angularVelocity: new THREE.Vector3(...angularVelocityRadS),
      sleepTimerS: 0,
      dirty: true
    });
    return true;
  }

  axes(quaternion, output) {
    output[0].set(1, 0, 0).applyQuaternion(quaternion);
    output[1].set(0, 1, 0).applyQuaternion(quaternion);
    output[2].set(0, 0, 1).applyQuaternion(quaternion);
    return output;
  }

  projectionRadius(axes, axis) {
    const halfLength = BRICK_SPEC.lengthMm / 2;
    const halfWidth = BRICK_SPEC.widthMm / 2;
    const halfHeight = BRICK_SPEC.bodyHeightMm / 2;
    return halfLength * Math.abs(axes[0].dot(axis))
      + halfWidth * Math.abs(axes[1].dot(axis))
      + halfHeight * Math.abs(axes[2].dot(axis));
  }

  supportHeightMm(state) {
    return this.projectionRadius(this.axes(state.quaternion, this.axesA), WORLD_UP);
  }

  proxyFor(brick) {
    const active = this.active.get(brick.id);
    if (active) return active;
    const quaternion = finiteArray(brick.freeQuaternion, 4)
      ? new THREE.Quaternion().fromArray(brick.freeQuaternion).normalize()
      : new THREE.Quaternion().setFromAxisAngle(WORLD_UP, brick.yawRad ?? 0);
    return {
      position: new THREE.Vector3(brick.position.xMm, brick.position.yMm, brick.position.zMm),
      quaternion,
      velocityMps: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      sleepTimerS: 0,
      dirty: false
    };
  }

  obbContact(a, b) {
    const axesA = this.axes(a.quaternion, this.axesA);
    const axesB = this.axes(b.quaternion, this.axesB);
    const candidates = this.satAxes;
    candidates[0].copy(axesA[0]); candidates[1].copy(axesA[1]); candidates[2].copy(axesA[2]);
    candidates[3].copy(axesB[0]); candidates[4].copy(axesB[1]); candidates[5].copy(axesB[2]);
    let index = 6;
    for (let aIndex = 0; aIndex < 3; aIndex += 1) {
      for (let bIndex = 0; bIndex < 3; bIndex += 1) candidates[index++].copy(axesA[aIndex]).cross(axesB[bIndex]);
    }
    this.delta.copy(b.position).sub(a.position);
    let minimumOverlap = Infinity;
    let best = null;
    let bestSign = 1;
    for (const candidate of candidates) {
      const lengthSquared = candidate.lengthSq();
      if (lengthSquared < 1e-12) continue;
      if (Math.abs(lengthSquared - 1) > 1e-7) candidate.multiplyScalar(1 / Math.sqrt(lengthSquared));
      const signedDistance = this.delta.dot(candidate);
      const overlap = this.projectionRadius(axesA, candidate) + this.projectionRadius(axesB, candidate) - Math.abs(signedDistance);
      if (overlap <= 0) return false;
      if (overlap < minimumOverlap) {
        minimumOverlap = overlap;
        best = candidate;
        bestSign = signedDistance >= 0 ? 1 : -1;
      }
    }
    this.contactPenetrationMm = minimumOverlap;
    this.normal.copy(best).multiplyScalar(bestSign);
    return true;
  }

  integrate(state, dt) {
    const settings = this.settings;
    state.velocityMps.z -= (settings.gravityMS2 ?? 9.81) * dt;
    state.velocityMps.multiplyScalar(Math.exp(-(settings.linearDampingPerS ?? 0.25) * dt));
    state.position.addScaledVector(state.velocityMps, 1000 * dt);
    const averageInertia = this.averageInertia();
    state.angularVelocity.multiplyScalar(Math.exp(-Math.max(0, settings.angularDampingNms ?? 0.00012) * dt / averageInertia));
    const angularSpeed = state.angularVelocity.length();
    if (angularSpeed > 1e-10) {
      this.axis.copy(state.angularVelocity).multiplyScalar(1 / angularSpeed);
      this.deltaQuaternion.setFromAxisAngle(this.axis, angularSpeed * dt);
      state.quaternion.premultiply(this.deltaQuaternion).normalize();
    }
  }

  averageInertia() {
    const mass = Math.max(1e-6, this.settings.brickMassKg ?? 0.0115);
    const lengthM = BRICK_SPEC.lengthMm / 1000;
    const widthM = BRICK_SPEC.widthMm / 1000;
    const heightM = BRICK_SPEC.bodyHeightMm / 1000;
    return Math.max(1e-9, mass * (
      widthM * widthM + heightM * heightM
      + lengthM * lengthM + heightM * heightM
      + lengthM * lengthM + widthM * widthM
    ) / 36);
  }

  applyAngularImpulse(state, normal, impulseNs, sign) {
    const axes = this.axes(state.quaternion, this.axesA);
    const radiusM = this.projectionRadius(axes, normal) / 1000;
    this.contactOffset.copy(normal).multiplyScalar(sign * radiusM);
    this.impulseForTorque.copy(impulseNs).multiplyScalar(-sign);
    this.torqueImpulse.copy(this.contactOffset).cross(this.impulseForTorque);
    state.angularVelocity.addScaledVector(this.torqueImpulse, 1 / this.averageInertia());
    const maximum = this.settings.maximumAngularVelocityRadS ?? 18;
    if (state.angularVelocity.length() > maximum) state.angularVelocity.setLength(maximum);
  }

  resolveTable(state, dt) {
    const bottom = state.position.z - this.supportHeightMm(state);
    if (bottom >= 0) {
      if (dt > 0) state.sleepTimerS = 0;
      return;
    }
    state.position.z -= bottom;
    if (state.velocityMps.z < 0) state.velocityMps.z *= -(this.settings.restitution ?? 0.17);
    const friction = Math.max(0, 1 - (this.settings.friction ?? 0.62) * 0.36);
    state.velocityMps.x *= friction;
    state.velocityMps.y *= friction;
    state.angularVelocity.multiplyScalar(Math.max(0.35, 1 - (this.settings.friction ?? 0.62) * 0.18));
    if (state.velocityMps.length() < 0.025 && state.angularVelocity.length() < 0.7) {
      state.velocityMps.set(0, 0, 0);
      state.angularVelocity.set(0, 0, 0);
      state.sleepTimerS += dt;
    } else state.sleepTimerS = 0;
  }

  resolvePair(a, b, bIsDynamic) {
    const bound = Math.hypot(BRICK_SPEC.lengthMm, BRICK_SPEC.widthMm, BRICK_SPEC.bodyHeightMm);
    if (a.position.distanceToSquared(b.position) > bound * bound || !this.obbContact(a, b)) return false;
    const inverseMassA = 1 / Math.max(1e-6, this.settings.brickMassKg ?? 0.0115);
    const inverseMassB = bIsDynamic ? inverseMassA : 0;
    const inverseMassSum = inverseMassA + inverseMassB;
    const depth = Math.max(0, this.contactPenetrationMm - (this.settings.collisionSlopMm ?? 0.08));
    if (depth > 0) {
      const correction = depth * (this.settings.collisionPositionCorrection ?? 0.86) / inverseMassSum;
      a.position.addScaledVector(this.normal, -correction * inverseMassA);
      if (bIsDynamic) b.position.addScaledVector(this.normal, correction * inverseMassB);
    }
    this.relativeVelocity.copy(b.velocityMps).sub(a.velocityMps);
    const normalVelocity = this.relativeVelocity.dot(this.normal);
    if (normalVelocity < 0) {
      const impulseMagnitude = -(1 + (this.settings.restitution ?? 0.17)) * normalVelocity / inverseMassSum;
      this.impulse.copy(this.normal).multiplyScalar(impulseMagnitude);
      a.velocityMps.addScaledVector(this.impulse, -inverseMassA);
      if (bIsDynamic) b.velocityMps.addScaledVector(this.impulse, inverseMassB);
      this.tangent.copy(this.relativeVelocity).addScaledVector(this.normal, -normalVelocity);
      const tangentLength = this.tangent.length();
      if (tangentLength > 1e-9) {
        this.tangent.multiplyScalar(1 / tangentLength);
        const maximumFriction = Math.abs(impulseMagnitude) * (this.settings.friction ?? 0.62);
        const frictionMagnitude = Math.max(-maximumFriction, Math.min(maximumFriction, -this.relativeVelocity.dot(this.tangent) / inverseMassSum));
        a.velocityMps.addScaledVector(this.tangent, -frictionMagnitude * inverseMassA);
        if (bIsDynamic) b.velocityMps.addScaledVector(this.tangent, frictionMagnitude * inverseMassB);
        this.impulse.addScaledVector(this.tangent, frictionMagnitude);
      }
      this.applyAngularImpulse(a, this.normal, this.impulse, 1);
      if (bIsDynamic) this.applyAngularImpulse(b, this.normal, this.impulse, -1);
    }
    a.sleepTimerS = 0;
    if (bIsDynamic) b.sleepTimerS = 0;
    return true;
  }

  step(dt) {
    if (!this.active.size) return 0;
    const bricks = this.controller.getBricks();
    const brickById = new Map(bricks.map((brick) => [brick.id, brick]));
    for (const [brickId, state] of this.active) {
      const brick = brickById.get(brickId);
      if (!brick || brick.heldBy || brick.snapped || brick.placementType) {
        this.active.delete(brickId);
        continue;
      }
      this.integrate(state, dt);
      this.resolveTable(state, dt);
      state.dirty = true;
    }

    if (this.settings.brickCollisionEnabled !== false) {
      const iterations = Math.max(1, Math.round(this.settings.brickCollisionIterations ?? 2));
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        for (const [brickId, state] of this.active) {
          for (const otherBrick of bricks) {
            if (otherBrick.id === brickId || otherBrick.heldBy === 'human') continue;
            const otherActive = this.active.get(otherBrick.id);
            if (otherActive && brickId > otherBrick.id) continue;
            this.resolvePair(state, otherActive ?? this.proxyFor(otherBrick), Boolean(otherActive));
          }
          this.resolveTable(state, 0);
        }
      }
    }

    this.commitAccumulator += dt;
    if (this.commitAccumulator + 1e-12 < this.commitStepS) return this.active.size;
    this.commitAccumulator %= this.commitStepS;
    for (const [brickId, state] of this.active) {
      if (!state.dirty) continue;
      const yawRad = Math.atan2(
        2 * (state.quaternion.w * state.quaternion.z + state.quaternion.x * state.quaternion.y),
        1 - 2 * (state.quaternion.y * state.quaternion.y + state.quaternion.z * state.quaternion.z)
      );
      const result = this.controller.moveLooseBrick(brickId, {
        xMm: state.position.x,
        yMm: state.position.y,
        zMm: state.position.z
      }, {
        actor: 'physics',
        yawRad,
        freeQuaternion: state.quaternion.toArray()
      });
      state.dirty = false;
      if (!result.ok || state.sleepTimerS > 0.6) this.active.delete(brickId);
    }
    return this.active.size;
  }

  getState() {
    return [...this.active.entries()].map(([brickId, state]) => ({
      brickId,
      position: { xMm: state.position.x, yMm: state.position.y, zMm: state.position.z },
      quaternion: state.quaternion.toArray(),
      velocityMps: state.velocityMps.toArray(),
      angularVelocityRadS: state.angularVelocity.toArray(),
      sleepTimerS: state.sleepTimerS
    }));
  }
}
