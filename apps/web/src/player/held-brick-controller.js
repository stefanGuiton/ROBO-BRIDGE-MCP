import * as THREE from '../../vendor/three.module.min.js';
import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { angleWrap, clamp } from './math.js';

export const HELD_STATES = Object.freeze({
  IDLE: 'IDLE',
  PICKUP_TRANSITION: 'PICKUP_TRANSITION',
  HELD_PHYSICS: 'HELD_PHYSICS',
  HELD_PLACEMENT: 'HELD_PLACEMENT',
  BLOCKED: 'BLOCKED'
});

export class HeldBrickController {
  constructor(settings) {
    this.settings = settings;
    this.state = HELD_STATES.IDLE;
    this.brickId = null;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.angularVelocity = 0;
    this.target = new THREE.Vector3();
    this.targetYawRad = 0;
    this.elapsed = 0;
    this.candidate = null;
    this.pivotAcceleration = new THREE.Vector3();
    this.rawPivotAcceleration = new THREE.Vector3();
    this.previousPivot = new THREE.Vector3();
    this.previousPivotVelocity = new THREE.Vector3();
    this.pivotVelocity = new THREE.Vector3();
    this.initializedPivot = false;
  }

  pickup(brick) {
    this.brickId = brick.id;
    this.position.set(brick.position.xMm, brick.position.yMm, brick.position.zMm);
    this.target.copy(this.position);
    this.targetYawRad = brick.yawRad ?? 0;
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.targetYawRad);
    this.velocity.set(0, 0, 0);
    this.angularVelocity = 0;
    this.elapsed = 0;
    this.candidate = null;
    this.initializedPivot = false;
    this.state = HELD_STATES.PICKUP_TRANSITION;
  }

  setCandidate(candidate) {
    this.candidate = candidate ? structuredClone(candidate) : null;
  }

  clear() {
    this.state = HELD_STATES.IDLE;
    this.brickId = null;
    this.candidate = null;
    this.velocity.set(0, 0, 0);
    this.angularVelocity = 0;
  }

  updatePivotDynamics(pivot, dt) {
    if (!this.initializedPivot) {
      this.previousPivot.copy(pivot);
      this.previousPivotVelocity.set(0, 0, 0);
      this.initializedPivot = true;
      return;
    }
    this.pivotVelocity.copy(pivot).sub(this.previousPivot).multiplyScalar(1 / Math.max(dt, 1e-6) / 1000);
    const rawAcceleration = this.rawPivotAcceleration.copy(this.pivotVelocity)
      .sub(this.previousPivotVelocity)
      .multiplyScalar(1 / Math.max(dt, 1e-6));
    const limit = Math.max(1, this.settings.pivotAccelerationClampMS2 ?? 28);
    if (rawAcceleration.length() > limit) rawAcceleration.setLength(limit);
    const smoothing = Math.max(0.001, this.settings.pivotAccelerationSmoothingS ?? 0.045);
    const alpha = 1 - Math.exp(-dt / smoothing);
    this.pivotAcceleration.lerp(rawAcceleration, alpha);
    this.previousPivot.copy(pivot);
    this.previousPivotVelocity.copy(this.pivotVelocity);
  }

  step(dt, player) {
    if (!this.brickId) return;
    const pivot = player.getHoldPivot(this.target);
    this.updatePivotDynamics(pivot, dt);
    this.elapsed += dt;
    let frequency = 4.6;
    let damping = 0.8;
    let yawTarget = this.targetYawRad;
    if (this.candidate) {
      this.target.set(
        this.candidate.position.xMm,
        this.candidate.position.yMm,
        this.candidate.position.zMm
      );
      yawTarget = this.candidate.yawRad;
      frequency = this.candidate.valid ? 5.5 : 3.2;
      damping = this.candidate.valid ? 0.9 : 1.1;
      this.state = this.candidate.valid ? HELD_STATES.HELD_PLACEMENT : HELD_STATES.BLOCKED;
    } else if (this.elapsed >= (this.settings.pickupTransitionTimeS ?? 0.28)) {
      this.state = HELD_STATES.HELD_PHYSICS;
    }
    if (this.state === HELD_STATES.PICKUP_TRANSITION) {
      frequency = Math.max(4, Math.sqrt(Math.max(0.1, this.settings.pickupStiffnessNPerM ?? 2)) * 7);
      damping = 1;
    }
    const omega = Math.PI * 2 * frequency;
    const acceleration = this.target.clone().sub(this.position)
      .multiplyScalar(omega * omega)
      .addScaledVector(this.velocity, -2 * damping * omega);
    if (!this.candidate) {
      acceleration.x -= this.pivotAcceleration.x * 18;
      acceleration.y -= this.pivotAcceleration.y * 18;
    }
    this.velocity.addScaledVector(acceleration, dt);
    const speedLimit = this.settings.pickupMaxSpeedMmS ?? 4500;
    if (this.velocity.length() > speedLimit) this.velocity.setLength(speedLimit);
    this.position.addScaledVector(this.velocity, dt);
    this.position.z = Math.max(BRICK_SPEC.bodyHeightMm / 2, this.position.z);

    const currentYaw = Math.atan2(
      2 * (this.quaternion.w * this.quaternion.z + this.quaternion.x * this.quaternion.y),
      1 - 2 * (this.quaternion.y ** 2 + this.quaternion.z ** 2)
    );
    const error = angleWrap(yawTarget - currentYaw);
    const angularFrequency = this.candidate ? 10 : 4;
    const angularOmega = Math.PI * 2 * angularFrequency;
    this.angularVelocity += (error * angularOmega ** 2 - 2 * 0.9 * angularOmega * this.angularVelocity) * dt;
    this.angularVelocity = clamp(this.angularVelocity, -18, 18);
    const yaw = currentYaw + this.angularVelocity * dt;
    const tiltX = this.candidate ? 0 : clamp(-this.pivotAcceleration.y * 0.012, -0.28, 0.28);
    const tiltY = this.candidate ? 0 : clamp(this.pivotAcceleration.x * 0.012, -0.28, 0.28);
    this.quaternion.setFromEuler(new THREE.Euler(tiltX, tiltY, yaw, 'XYZ'));
    this.targetYawRad = yawTarget;
  }

  getVisualPose() {
    if (!this.brickId) return null;
    return {
      brickId: this.brickId,
      state: this.state,
      position: { xMm: this.position.x, yMm: this.position.y, zMm: this.position.z },
      quaternion: this.quaternion.toArray(),
      yawRad: this.targetYawRad,
      velocityMmS: this.velocity.toArray(),
      pivotAccelerationMS2: this.pivotAcceleration.toArray(),
      candidate: this.candidate ? structuredClone(this.candidate) : null
    };
  }
}
