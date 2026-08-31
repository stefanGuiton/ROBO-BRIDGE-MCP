import * as THREE from '../../vendor/three.module.min.js';
import { clamp } from './math.js';

const MOVEMENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight', 'Space', 'ControlLeft', 'ControlRight'
]);

export class PlayerController {
  constructor(camera, canvas, settings, collisionSolver) {
    this.camera = camera;
    this.canvas = canvas;
    this.settings = settings;
    this.collisionSolver = collisionSolver;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 0, 1);
    this.desired = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.moveDelta = new THREE.Vector3();
    this.nextPosition = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.keys = new Set();
    this.mobileKeys = new Set();
    this.yaw = Math.PI / 2;
    this.pitch = -0.18;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.enabled = false;
    this.pointerLocked = false;
    this.mobileMode = false;
    this.touchId = null;
    this.touchX = 0;
    this.touchY = 0;
    this.pinchDistance = 0;
    this.bind();
    this.refreshMobileMode();
  }

  bind() {
    this.canvas.addEventListener('mousedown', (event) => {
      if (!this.enabled || this.mobileMode || event.button !== 0) return;
      if (document.pointerLockElement !== this.canvas) this.requestLock();
      else this.onPrimary?.();
    });
    this.canvas.addEventListener('wheel', (event) => {
      if (!this.enabled || (!this.pointerLocked && !this.mobileMode)) return;
      event.preventDefault();
      this.onWheel?.(event.deltaY);
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      document.body.classList.toggle('player-pointer-locked', this.pointerLocked);
      if (!this.pointerLocked) this.keys.clear();
      this.onPointerLock?.(this.pointerLocked);
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.enabled || this.mobileMode || !this.pointerLocked) return;
      this.applyLookDelta(event.movementX, event.movementY, this.settings.mouseSensitivityRadPerPx);
    });
    document.addEventListener('pointerlockerror', () => this.onPointerLockError?.());
    addEventListener('keydown', (event) => {
      if (!this.enabled || event.target?.matches?.('input,select,textarea,button')) return;
      if (MOVEMENT_CODES.has(event.code)) {
        this.keys.add(event.code);
        event.preventDefault();
      }
      if (event.code === 'KeyR') {
        event.preventDefault();
        this.onRotate?.();
      }
      if (event.code === 'Escape') this.onEscape?.();
    });
    addEventListener('keyup', (event) => this.keys.delete(event.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mobileKeys.clear();
    });
    for (const element of document.querySelectorAll('[data-mobile-move]')) {
      const code = element.dataset.mobileMove;
      const down = (event) => {
        if (!this.enabled || !this.mobileMode) return;
        event.preventDefault();
        event.stopPropagation();
        this.mobileKeys.add(code);
      };
      const up = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.mobileKeys.delete(code);
      };
      element.addEventListener('pointerdown', down, { passive: false });
      element.addEventListener('pointerup', up, { passive: false });
      element.addEventListener('pointercancel', up, { passive: false });
    }
    this.canvas.addEventListener('pointerdown', (event) => this.touchDown(event), { passive: false });
    this.canvas.addEventListener('pointermove', (event) => this.touchMove(event), { passive: false });
    this.canvas.addEventListener('pointerup', (event) => this.touchUp(event), { passive: false });
    this.canvas.addEventListener('pointercancel', (event) => this.touchUp(event), { passive: false });
    globalThis.matchMedia?.('(pointer: coarse)')?.addEventListener?.('change', () => this.refreshMobileMode());
  }

  refreshMobileMode() {
    const configured = this.settings.mobileControlsMode;
    this.mobileMode = configured === 'On'
      || (configured === 'Auto' && Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches));
    document.body.classList.toggle('player-mobile', this.mobileMode);
  }

  requestLock() {
    if (this.mobileMode || typeof this.canvas.requestPointerLock !== 'function') {
      this.onPointerLockError?.();
      return;
    }
    try {
      const request = this.canvas.requestPointerLock({ unadjustedMovement: true });
      request?.catch?.(() => {
        try {
          const fallback = this.canvas.requestPointerLock();
          fallback?.catch?.(() => this.onPointerLockError?.());
        } catch {
          this.onPointerLockError?.();
        }
      });
    } catch {
      try { this.canvas.requestPointerLock(); }
      catch { this.onPointerLockError?.(); }
    }
  }

  touchDown(event) {
    if (!this.enabled || !this.mobileMode || event.pointerType === 'mouse') return;
    if (this.touchId !== null) return;
    this.touchId = event.pointerId;
    this.touchX = event.clientX;
    this.touchY = event.clientY;
    this.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  touchMove(event) {
    if (!this.enabled || !this.mobileMode || event.pointerId !== this.touchId) return;
    const dx = event.clientX - this.touchX;
    const dy = event.clientY - this.touchY;
    this.touchX = event.clientX;
    this.touchY = event.clientY;
    this.applyLookDelta(dx, dy, this.settings.mobileLookSensitivityRadPerPx);
    event.preventDefault();
  }

  touchUp(event) {
    if (event.pointerId !== this.touchId) return;
    this.touchId = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  applyLookDelta(dx, dy, sensitivity) {
    this.targetYaw -= dx * sensitivity;
    const sign = this.settings.invertY ? 1 : -1;
    this.targetPitch += dy * sensitivity * sign;
    const minimum = THREE.MathUtils.degToRad(this.settings.pitchMinDeg);
    const maximum = THREE.MathUtils.degToRad(this.settings.pitchMaxDeg);
    this.targetPitch = clamp(this.targetPitch, minimum, maximum);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.keys.clear();
      this.mobileKeys.clear();
      this.velocity.set(0, 0, 0);
      if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    }
    document.body.classList.toggle('player-mode', this.enabled);
  }

  setLookAt(position, target) {
    this.position.copy(position);
    const direction = this.delta.copy(target).sub(position).normalize();
    this.yaw = Math.atan2(direction.y, direction.x);
    this.pitch = Math.asin(clamp(direction.z, -1, 1));
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.syncCamera();
  }

  physicsStep(dt) {
    if (!this.enabled) return;
    const smoothing = Math.max(0.0001, this.settings.mouseSmoothingS);
    const lookAlpha = 1 - Math.exp(-dt / smoothing);
    this.yaw += (this.targetYaw - this.yaw) * lookAlpha;
    this.pitch += (this.targetPitch - this.pitch) * lookAlpha;
    this.syncBasis();
    const pressed = (code) => this.keys.has(code) || this.mobileKeys.has(code);
    const ix = Number(pressed('KeyW')) - Number(pressed('KeyS'));
    const iy = Number(pressed('KeyD')) - Number(pressed('KeyA'));
    const iz = Number(pressed('Space')) - Number(pressed('ControlLeft') || pressed('ControlRight'));
    this.desired.set(0, 0, 0)
      .addScaledVector(this.forward, ix)
      .addScaledVector(this.right, iy);
    if (!this.settings.movementFollowsPitch) this.desired.z = 0;
    if (this.desired.lengthSq()) this.desired.normalize();
    const mobileScale = this.mobileMode ? this.settings.mobileDpadSpeedScale : 1;
    const sprint = pressed('ShiftLeft') || pressed('ShiftRight') ? this.settings.sprintMultiplier : 1;
    this.desired.multiplyScalar(this.settings.moveSpeedMmS * sprint * mobileScale);
    this.desired.z = iz * this.settings.verticalSpeedMmS * sprint * mobileScale;
    const input = Boolean(ix || iy || iz);
    const acceleration = input ? this.settings.accelerationMmS2 : this.settings.decelerationMmS2;
    this.delta.copy(this.desired).sub(this.velocity);
    const length = this.delta.length();
    if (length > acceleration * dt && length > 0) this.delta.multiplyScalar(acceleration * dt / length);
    this.velocity.add(this.delta);
    if (!input && this.settings.movementDampingPerS > 0) {
      this.velocity.multiplyScalar(Math.exp(-this.settings.movementDampingPerS * dt));
    }
    if (this.velocity.length() > this.settings.maximumSpeedMmS) {
      this.velocity.setLength(this.settings.maximumSpeedMmS);
    }
    this.moveDelta.copy(this.velocity).multiplyScalar(dt);
    this.collisionSolver.move(this.position, this.moveDelta, this.nextPosition);
    this.position.copy(this.nextPosition);
    if (this.collisionSolver.lastCollisionCount) {
      const inward = this.velocity.dot(this.collisionSolver.lastNormal);
      if (inward < 0) this.velocity.addScaledVector(this.collisionSolver.lastNormal, -inward);
    }
    this.syncCamera();
  }

  syncBasis() {
    const cosine = Math.cos(this.pitch);
    this.forward.set(cosine * Math.cos(this.yaw), cosine * Math.sin(this.yaw), Math.sin(this.pitch)).normalize();
    this.right.set(Math.sin(this.yaw), -Math.cos(this.yaw), 0).normalize();
  }

  syncCamera() {
    this.syncBasis();
    this.camera.position.copy(this.position);
    this.camera.up.set(0, 0, 1);
    this.lookTarget.copy(this.position).add(this.forward);
    this.camera.lookAt(this.lookTarget);
  }

  getHoldPivot(output = new THREE.Vector3()) {
    return output.copy(this.position)
      .addScaledVector(this.forward, this.settings.holdForwardDistanceMm)
      .addScaledVector(this.right, this.settings.holdSideOffsetMm)
      .addScaledVector(this.up, this.settings.holdVerticalOffsetMm);
  }

  getState() {
    return {
      enabled: this.enabled,
      mobileMode: this.mobileMode,
      pointerLocked: this.pointerLocked,
      position: this.position.toArray(),
      velocity: this.velocity.toArray(),
      yaw: this.yaw,
      pitch: this.pitch,
      collision: this.collisionSolver.getDiagnostics()
    };
  }
}
