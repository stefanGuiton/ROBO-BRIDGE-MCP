import * as THREE from '../../vendor/three.module.min.js';
import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { clamp, mToMm, mmToM, quaternionErrorVector, smootherstep, supportHeightMm } from './math.js';

export const HELD_STATES = Object.freeze({
  IDLE: 'IDLE', PICKUP_TRANSITION: 'PICKUP_TRANSITION', HELD_PHYSICS: 'HELD_PHYSICS',
  HELD_ALIGNING: 'HELD_ALIGNING', HELD_PLACEMENT: 'HELD_PLACEMENT', BLOCKED: 'BLOCKED'
});

export class HeldBrickController {
  constructor(settings) {
    this.settings = settings;
    this.state = HELD_STATES.IDLE;
    this.brickId = null;
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.angularVelocity = new THREE.Vector3();
    this.transitionVelocityMps = new THREE.Vector3();
    this.estimatedComVelocityMps = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.targetYawRad = 0;
    this.elapsed = 0;
    this.candidate = null;
    this.pivot = new THREE.Vector3();
    this.previousPivot = new THREE.Vector3();
    this.pivotVelocityMps = new THREE.Vector3();
    this.previousPivotVelocityMps = new THREE.Vector3();
    this.pivotAcceleration = new THREE.Vector3();
    this.rawPivotAcceleration = new THREE.Vector3();
    this.previousCom = new THREE.Vector3();
    this.initializedPivot = false;
    this.guideOffset = new THREE.Vector3();
    this.guideVelocityMmS = new THREE.Vector3();
    this.guideTargetOffset = new THREE.Vector3();
    this.guideAcceleration = new THREE.Vector3();
    this.constraint = new THREE.Vector3();
    this.constraintOffsetMm = new THREE.Vector3();
    this.gravity = new THREE.Vector3();
    this.force = new THREE.Vector3();
    this.torque = new THREE.Vector3();
    this.temporary = new THREE.Vector3();
    this.temporary2 = new THREE.Vector3();
    this.temporary3 = new THREE.Vector3();
    this.error = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.temporaryQuaternion = new THREE.Quaternion();
    this.deltaQuaternion = new THREE.Quaternion();
    this.rotation4 = new THREE.Matrix4();
    this.rotation = new THREE.Matrix3();
    this.rotationTranspose = new THREE.Matrix3();
    this.bodyInertia = new THREE.Matrix3();
    this.worldInertia = new THREE.Matrix3();
    this.parallelAxisInertia = new THREE.Matrix3();
    this.totalInertia = new THREE.Matrix3();
    this.inverseInertia = new THREE.Matrix3();
    this.inertialAngularMomentum = new THREE.Vector3();
    this.gyroscopicTorque = new THREE.Vector3();
    this.zAxis = new THREE.Vector3(0, 0, 1);
  }

  pickup(brick) {
    this.brickId = brick.id;
    this.position.set(brick.position.xMm, brick.position.yMm, brick.position.zMm);
    this.target.copy(this.position);
    this.targetYawRad = brick.yawRad ?? 0;
    this.quaternion.setFromAxisAngle(this.zAxis, this.targetYawRad);
    this.angularVelocity.set(0, 0, 0);
    this.transitionVelocityMps.set(0, 0, 0);
    this.estimatedComVelocityMps.set(0, 0, 0);
    this.guideOffset.set(0, 0, 0);
    this.guideVelocityMmS.set(0, 0, 0);
    this.pivotAcceleration.set(0, 0, 0);
    this.elapsed = 0;
    this.candidate = null;
    this.initializedPivot = false;
    this.previousCom.copy(this.position);
    this.state = HELD_STATES.PICKUP_TRANSITION;
  }

  setCandidate(candidate) {
    this.candidate = candidate ? structuredClone(candidate) : null;
    if (candidate?.position) {
      this.target.set(candidate.position.xMm, candidate.position.yMm, candidate.position.zMm);
      this.targetYawRad = candidate.yawRad ?? this.targetYawRad;
    }
  }

  clear() {
    this.state = HELD_STATES.IDLE;
    this.brickId = null;
    this.candidate = null;
    this.angularVelocity.set(0, 0, 0);
    this.transitionVelocityMps.set(0, 0, 0);
    this.estimatedComVelocityMps.set(0, 0, 0);
  }

  updatePivotDynamics(pivot, dt) {
    if (!this.initializedPivot) {
      this.previousPivot.copy(pivot);
      this.previousPivotVelocityMps.set(0, 0, 0);
      this.initializedPivot = true;
      return;
    }
    this.pivotVelocityMps.copy(pivot).sub(this.previousPivot).multiplyScalar(1 / (1000 * Math.max(dt, 1e-6)));
    this.rawPivotAcceleration.copy(this.pivotVelocityMps).sub(this.previousPivotVelocityMps)
      .multiplyScalar(1 / Math.max(dt, 1e-6));
    const limit = Math.max(1, this.settings.pivotAccelerationClampMS2 ?? 28);
    if (this.rawPivotAcceleration.length() > limit) this.rawPivotAcceleration.setLength(limit);
    const smoothing = Math.max(0.001, this.settings.pivotAccelerationSmoothingS ?? 0.045);
    this.pivotAcceleration.lerp(this.rawPivotAcceleration, 1 - Math.exp(-dt / smoothing));
    this.previousPivot.copy(pivot);
    this.previousPivotVelocityMps.copy(this.pivotVelocityMps);
  }

  step(dt, player) {
    if (!this.brickId) return;
    player.getHoldPivot(this.pivot);
    this.updatePivotDynamics(this.pivot, dt);
    this.elapsed += dt;
    if (this.state === HELD_STATES.PICKUP_TRANSITION) this.stepPickup(dt);
    else this.stepPendulum(dt);
    this.enforceSurface();
    this.estimatedComVelocityMps.copy(this.position).sub(this.previousCom)
      .multiplyScalar(1 / (1000 * Math.max(dt, 1e-6)));
    this.previousCom.copy(this.position);
    if (![...this.position.toArray(), ...this.quaternion.toArray(), ...this.angularVelocity.toArray()].every(Number.isFinite)) {
      this.state = HELD_STATES.BLOCKED;
      throw new Error(`Non-finite held brick state: ${this.brickId}`);
    }
  }

  computeConstraintPosition(output, pivot = this.pivot) {
    this.constraintOffsetMm.set(0, 0, -(this.settings.pendulumLengthMm ?? 20)).applyQuaternion(this.quaternion);
    return output.copy(pivot).add(this.constraintOffsetMm);
  }

  stepPickup(dt) {
    const s = this.settings;
    const target = this.computeConstraintPosition(this.temporary, this.pivot);
    const positionM = this.temporary2.copy(this.position).multiplyScalar(0.001);
    const targetM = this.temporary3.copy(target).multiplyScalar(0.001);
    const mass = Math.max(1e-6, s.brickMassKg ?? 0.0115);
    const stiffness = s.pickupStiffnessNPerM ?? 2;
    const damping = s.pickupDampingNsPerM ?? 0.12;
    this.force.copy(targetM).sub(positionM).multiplyScalar(stiffness)
      .addScaledVector(this.transitionVelocityMps, -damping)
      .addScaledVector(this.pivotVelocityMps, damping);
    this.force.z -= mass * (s.gravityMS2 ?? 9.81) * (s.pickupGravityScale ?? 0.15);
    this.transitionVelocityMps.addScaledVector(this.force, dt / mass);
    const speedLimit = (s.pickupMaxSpeedMmS ?? 4500) / 1000;
    if (this.transitionVelocityMps.length() > speedLimit) this.transitionVelocityMps.setLength(speedLimit);
    this.position.addScaledVector(this.transitionVelocityMps, mToMm(dt));
    this.angularStep(dt, 0);
    const centreTarget = this.computeConstraintPosition(this.temporary, this.pivot);
    const remaining = this.position.distanceTo(centreTarget);
    const relativeSpeedMmS = this.temporary3.copy(this.transitionVelocityMps).sub(this.pivotVelocityMps).length() * 1000;
    if (this.elapsed >= (s.pickupTransitionTimeS ?? 0.28)
      && remaining <= (s.pickupCaptureRadiusMm ?? 8)
      && relativeSpeedMmS <= (s.pickupCaptureSpeedMmS ?? 1200)) {
      this.position.copy(centreTarget);
      this.state = HELD_STATES.HELD_PHYSICS;
    }
  }

  updateGuide(dt, constraint, placementIntent) {
    const s = this.settings;
    if (placementIntent && s.placementGuideEnabled !== false) {
      const safeHover = (s.placementGuideHoverHeightMm ?? 8) + Math.max(0, s.heldCollisionLiftClearanceMm ?? 0);
      this.guideTargetOffset.copy(this.target).addScaledVector(this.zAxis, safeHover).sub(constraint);
    } else this.guideTargetOffset.set(0, 0, 0);
    const omega = 2 * Math.PI * Math.max(0.1, s.placementGuideFrequencyHz ?? 5.5);
    const damping = 2 * (s.placementGuideDampingRatio ?? 0.9) * omega;
    this.guideAcceleration.copy(this.guideTargetOffset).sub(this.guideOffset)
      .multiplyScalar(omega * omega).addScaledVector(this.guideVelocityMmS, -damping);
    this.guideVelocityMmS.addScaledVector(this.guideAcceleration, dt);
    if (placementIntent) this.guideVelocityMmS.multiplyScalar(Math.exp(-Math.max(0, s.placementLinearDampingPerS ?? 5.5) * dt));
    const speedLimit = s.placementGuideMaxSpeedMmS ?? 5000;
    if (this.guideVelocityMmS.length() > speedLimit) this.guideVelocityMmS.setLength(speedLimit);
    this.guideOffset.addScaledVector(this.guideVelocityMmS, dt);
  }

  stepPendulum(dt) {
    const s = this.settings;
    const supportHeight = supportHeightMm(this.quaternion, BRICK_SPEC.lengthMm / 2, BRICK_SPEC.widthMm / 2, BRICK_SPEC.bodyHeightMm / 2);
    const clearance = this.position.z - supportHeight;
    const lockHeight = Math.max(0, s.placementLockHeightMm ?? BRICK_SPEC.bodyHeightMm);
    const snapHeight = Math.max(lockHeight, s.snapRegionHeightMm ?? 45);
    const physicsHeight = Math.max(snapHeight, s.fullPhysicsHeightMm ?? 28.8);
    const placementIntent = Boolean(this.candidate?.valid);
    let assist = 0;
    if (placementIntent) {
      this.state = HELD_STATES.HELD_PLACEMENT;
      assist = Math.max(0.15, 1 - smootherstep(clamp((clearance - lockHeight) / Math.max(1e-6, snapHeight - lockHeight), 0, 1)));
    } else if (clearance >= physicsHeight) this.state = this.candidate ? HELD_STATES.BLOCKED : HELD_STATES.HELD_PHYSICS;
    else {
      this.state = this.candidate ? HELD_STATES.BLOCKED : HELD_STATES.HELD_ALIGNING;
      assist = 1 - smootherstep(clamp((clearance - lockHeight) / Math.max(1e-6, snapHeight - lockHeight), 0, 1));
    }
    this.angularStep(dt, assist);
    if (placementIntent) {
      this.targetQuaternion.setFromAxisAngle(this.zAxis, this.targetYawRad);
      this.angularVelocity.multiplyScalar(Math.exp(-Math.max(0, s.placementAngularDampingPerS ?? 7.5) * dt));
      const settle = Math.max(0.1, s.placementOrientationSettleS ?? 1);
      this.quaternion.slerp(this.targetQuaternion, 1 - Math.exp(-4.605170186 * dt / settle)).normalize();
    }
    this.computeConstraintPosition(this.constraint);
    this.updateGuide(dt, this.constraint, placementIntent);
    this.position.copy(this.constraint).add(this.guideOffset);
  }

  angularStep(dt, assist) {
    const s = this.settings;
    const mass = Math.max(1e-6, s.brickMassKg ?? 0.0115);
    const length = mmToM(s.pendulumLengthMm ?? 20);
    const a = mmToM(BRICK_SPEC.lengthMm), b = mmToM(BRICK_SPEC.widthMm), c = mmToM(BRICK_SPEC.bodyHeightMm);
    const ixx = mass * (b * b + c * c) / 12, iyy = mass * (a * a + c * c) / 12, izz = mass * (a * a + b * b) / 12;
    this.bodyInertia.set(ixx, 0, 0, 0, iyy, 0, 0, 0, izz);
    this.rotation4.makeRotationFromQuaternion(this.quaternion);
    this.rotation.setFromMatrix4(this.rotation4);
    this.rotationTranspose.copy(this.rotation).transpose();
    this.worldInertia.copy(this.rotation).multiply(this.bodyInertia).multiply(this.rotationTranspose);
    const r = this.temporary.set(0, 0, -length).applyQuaternion(this.quaternion), r2 = r.lengthSq();
    this.parallelAxisInertia.set(
      mass * (r2 - r.x * r.x), -mass * r.x * r.y, -mass * r.x * r.z,
      -mass * r.y * r.x, mass * (r2 - r.y * r.y), -mass * r.y * r.z,
      -mass * r.z * r.x, -mass * r.z * r.y, mass * (r2 - r.z * r.z)
    );
    const worldElements = this.worldInertia.elements, parallelElements = this.parallelAxisInertia.elements;
    for (let index = 0; index < 9; index += 1) this.totalInertia.elements[index] = worldElements[index] + parallelElements[index];
    this.inverseInertia.copy(this.totalInertia).invert();
    const inertialScale = this.candidate?.valid ? clamp(s.placementInertialResponseScale ?? 0.22, 0, 1) : 1;
    this.gravity.set(0, 0, -(s.gravityMS2 ?? 9.81)).addScaledVector(this.pivotAcceleration, -inertialScale);
    this.force.copy(this.gravity).multiplyScalar(mass);
    this.torque.copy(r).cross(this.force).addScaledVector(this.angularVelocity, -(s.angularDampingNms ?? 0.00012));
    if (assist > 0) {
      this.targetQuaternion.setFromAxisAngle(this.zAxis, this.targetYawRad);
      quaternionErrorVector(this.quaternion, this.targetQuaternion, this.error, this.temporaryQuaternion);
      const stiffness = (s.alignmentStiffnessNmRad ?? 0.018) * (this.candidate?.valid ? 0.7 : 1);
      const damping = this.candidate?.valid ? (s.placementDampingNmsRad ?? 0.0042) : (s.alignmentDampingNmsRad ?? 0.0026);
      this.torque.addScaledVector(this.error, assist * stiffness).addScaledVector(this.angularVelocity, -assist * damping);
    }
    this.inertialAngularMomentum.copy(this.angularVelocity).applyMatrix3(this.totalInertia);
    this.gyroscopicTorque.copy(this.angularVelocity).cross(this.inertialAngularMomentum);
    this.temporary2.copy(this.torque).sub(this.gyroscopicTorque).applyMatrix3(this.inverseInertia);
    this.angularVelocity.addScaledVector(this.temporary2, dt);
    const maximum = s.maximumAngularVelocityRadS ?? 18;
    if (this.angularVelocity.length() > maximum) this.angularVelocity.setLength(maximum);
    const speed = this.angularVelocity.length();
    if (speed > 1e-9) {
      this.temporary2.copy(this.angularVelocity).multiplyScalar(1 / speed);
      this.deltaQuaternion.setFromAxisAngle(this.temporary2, speed * dt);
      this.quaternion.premultiply(this.deltaQuaternion).normalize();
    }
  }

  enforceSurface() {
    const supportHeight = supportHeightMm(this.quaternion, BRICK_SPEC.lengthMm / 2, BRICK_SPEC.widthMm / 2, BRICK_SPEC.bodyHeightMm / 2);
    const minimumZ = supportHeight + Math.max(0, this.settings.heldSurfaceClearanceMm ?? 0.15);
    if (this.position.z >= minimumZ) return;
    this.position.z = minimumZ;
    if (this.transitionVelocityMps.z < 0) this.transitionVelocityMps.z = 0;
    if (this.guideVelocityMmS.z < 0) this.guideVelocityMmS.z = 0;
  }

  getVisualPose() {
    if (!this.brickId) return null;
    const yawRad = Math.atan2(
      2 * (this.quaternion.w * this.quaternion.z + this.quaternion.x * this.quaternion.y),
      1 - 2 * (this.quaternion.y * this.quaternion.y + this.quaternion.z * this.quaternion.z)
    );
    return {
      brickId: this.brickId, state: this.state,
      position: { xMm: this.position.x, yMm: this.position.y, zMm: this.position.z },
      quaternion: this.quaternion.toArray(), yawRad,
      velocityMmS: this.estimatedComVelocityMps.clone().multiplyScalar(1000).toArray(),
      angularVelocityRadS: this.angularVelocity.toArray(),
      pivotAccelerationMS2: this.pivotAcceleration.toArray(),
      candidate: this.candidate ? structuredClone(this.candidate) : null
    };
  }
}
