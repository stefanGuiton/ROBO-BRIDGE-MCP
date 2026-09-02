import * as THREE from '../../vendor/three.module.min.js';
import { clamp } from './math.js';

const MOVEMENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight'
]);
const DISABLED_VERTICAL_CODES = new Set(['Space', 'ControlLeft', 'ControlRight']);

const FALLBACK_EDGE_YAW_PX_PER_SECOND = 1900;
const FALLBACK_EDGE_PITCH_PX_PER_SECOND = 1150;
const FALLBACK_EDGE_BAND_PX = 100;
const FALLBACK_RATE_EXPONENT = 3;
const FALLBACK_FLICK_MIN_SPEED_PX_PER_SECOND = 850;
const FALLBACK_FLICK_MAX_SPEED_PX_PER_SECOND = 5000;
const FALLBACK_FLICK_YAW_BOOST_PX = 150;
const FALLBACK_FLICK_PITCH_BOOST_PX = 95;

function exponentialEdgeRate(distancePx) {
  const normalized = clamp((FALLBACK_EDGE_BAND_PX - distancePx) / FALLBACK_EDGE_BAND_PX, 0, 1);
  const curved = Math.expm1(FALLBACK_RATE_EXPONENT * normalized) / Math.expm1(FALLBACK_RATE_EXPONENT);
  return curved;
}

export class PlayerController {
  constructor(camera, canvas, settings, collisionSolver) {
    this.camera = camera;
    this.canvas = canvas;
    this.settings = settings;
    this.collisionSolver = collisionSolver;
    this.position = new THREE.Vector3();
    this.fixedHeightMm = null;
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
    this.fallbackLookActive = false;
    this.fallbackPointerX = null;
    this.fallbackPointerY = null;
    this.fallbackPointerTime = null;
    this.fallbackEdgeDx = 0;
    this.fallbackEdgeDy = 0;
    this.fallbackFlickDx = 0;
    this.fallbackFlickDy = 0;
    this.pointerLockAttempt = 0;
    this.pointerLockFallbackTimer = null;
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
      if (document.pointerLockElement !== this.canvas && !this.fallbackLookActive) this.requestLock(event);
      else this.onPrimary?.();
    });
    this.canvas.addEventListener('wheel', (event) => {
      if (!this.enabled || (!this.pointerLocked && !this.fallbackLookActive && !this.mobileMode)) return;
      event.preventDefault();
      this.onWheel?.(event.deltaY);
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (this.pointerLocked) this.deactivateFallbackLook({ notify: false });
      document.body.classList.toggle('player-pointer-locked', this.pointerLocked);
      document.body.classList.toggle('pointer-locked', this.pointerLocked);
      if (!this.pointerLocked) this.keys.clear();
      this.onPointerLock?.(this.pointerLocked);
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.enabled || this.mobileMode || !this.pointerLocked) return;
      this.applyLookDelta(event.movementX, event.movementY, this.settings.mouseSensitivityRadPerPx);
    });
    this.canvas.addEventListener('mousemove', (event) => {
      if (!this.enabled || this.mobileMode || !this.fallbackLookActive) return;
      if (this.fallbackPointerX !== null && this.fallbackPointerY !== null) {
        const rawDx = event.clientX - this.fallbackPointerX;
        const rawDy = event.clientY - this.fallbackPointerY;
        const dx = clamp(rawDx, -80, 80);
        const dy = clamp(rawDy, -80, 80);
        this.applyLookDelta(dx, dy, this.settings.mouseSensitivityRadPerPx);
        this.updateFallbackEdgeTurn(event.clientX, event.clientY);
        const elapsedSeconds = Number.isFinite(event.timeStamp) && Number.isFinite(this.fallbackPointerTime)
          ? clamp((event.timeStamp - this.fallbackPointerTime) / 1000, 1 / 240, 0.1)
          : 1 / 60;
        this.applyFallbackFlickBoost(rawDx, rawDy, elapsedSeconds);
      } else {
        this.updateFallbackEdgeTurn(event.clientX, event.clientY);
      }
      this.fallbackPointerX = event.clientX;
      this.fallbackPointerY = event.clientY;
      this.fallbackPointerTime = Number.isFinite(event.timeStamp) ? event.timeStamp : null;
    });
    this.canvas.addEventListener('mouseleave', () => {
      if (!this.fallbackLookActive) return;
      this.fallbackPointerX = null;
      this.fallbackPointerY = null;
      this.fallbackPointerTime = null;
      this.resetFallbackEdgeTurn();
    });
    document.addEventListener('pointerlockerror', () => this.activateFallbackLook());
    addEventListener('keydown', (event) => {
      if (!this.enabled || event.target?.matches?.('input,select,textarea,button')) return;
      if (DISABLED_VERTICAL_CODES.has(event.code)) {
        event.preventDefault();
        return;
      }
      if (MOVEMENT_CODES.has(event.code)) {
        this.keys.add(event.code);
        event.preventDefault();
      }
      if (event.code === 'KeyR') {
        event.preventDefault();
        this.onRotate?.();
      }
      if (event.code === 'Escape') {
        if (this.fallbackLookActive) this.deactivateFallbackLook();
        this.onEscape?.();
      }
    });
    addEventListener('keyup', (event) => this.keys.delete(event.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mobileKeys.clear();
      this.resetFallbackEdgeTurn();
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
    document.body.classList.toggle('mobile-mode', this.mobileMode);
  }

  requestLock(originEvent = null) {
    if (this.mobileMode || typeof this.canvas.requestPointerLock !== 'function') {
      this.activateFallbackLook(originEvent);
      return;
    }
    const attempt = ++this.pointerLockAttempt;
    clearTimeout(this.pointerLockFallbackTimer);
    this.pointerLockFallbackTimer = setTimeout(() => {
      if (attempt === this.pointerLockAttempt && document.pointerLockElement !== this.canvas) {
        this.activateFallbackLook(originEvent);
      }
    }, 220);
    const fail = () => {
      if (attempt === this.pointerLockAttempt && document.pointerLockElement !== this.canvas) {
        this.activateFallbackLook(originEvent);
      }
    };
    try {
      const request = this.canvas.requestPointerLock({ unadjustedMovement: true });
      request?.catch?.(() => {
        try {
          const fallback = this.canvas.requestPointerLock();
          fallback?.catch?.(fail);
        } catch {
          fail();
        }
      });
    } catch {
      try { this.canvas.requestPointerLock(); }
      catch { fail(); }
    }
  }

  activateFallbackLook(originEvent = null) {
    if (!this.enabled || this.mobileMode || this.pointerLocked) return false;
    clearTimeout(this.pointerLockFallbackTimer);
    this.pointerLockFallbackTimer = null;
    this.fallbackLookActive = true;
    this.fallbackPointerX = Number.isFinite(originEvent?.clientX) ? originEvent.clientX : null;
    this.fallbackPointerY = Number.isFinite(originEvent?.clientY) ? originEvent.clientY : null;
    this.fallbackPointerTime = Number.isFinite(originEvent?.timeStamp) ? originEvent.timeStamp : null;
    this.resetFallbackEdgeTurn();
    document.body.classList.add('player-look-fallback');
    this.onPointerLockError?.();
    this.onPointerLock?.(false, { fallback: true });
    return true;
  }

  deactivateFallbackLook({ notify = true } = {}) {
    clearTimeout(this.pointerLockFallbackTimer);
    this.pointerLockFallbackTimer = null;
    const wasActive = this.fallbackLookActive;
    this.fallbackLookActive = false;
    this.fallbackPointerX = null;
    this.fallbackPointerY = null;
    this.fallbackPointerTime = null;
    this.resetFallbackEdgeTurn();
    document.body.classList.remove('player-look-fallback');
    this.keys.clear();
    if (wasActive && notify) this.onPointerLock?.(false, { fallback: false });
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

  updateFallbackEdgeTurn(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(clientX) || !Number.isFinite(clientY) || rect.width <= 0 || rect.height <= 0) {
      this.resetFallbackEdgeTurn();
      return;
    }
    const left = exponentialEdgeRate(clientX - rect.left);
    const right = exponentialEdgeRate(rect.right - clientX);
    const top = exponentialEdgeRate(clientY - rect.top);
    const bottom = exponentialEdgeRate(rect.bottom - clientY);
    this.fallbackEdgeDx = right - left;
    this.fallbackEdgeDy = bottom - top;
    document.body.classList.toggle('player-look-edge', Math.abs(this.fallbackEdgeDx) > 0.001 || Math.abs(this.fallbackEdgeDy) > 0.001);
  }

  applyFallbackFlickBoost(dx, dy, elapsedSeconds) {
    this.fallbackFlickDx = 0;
    this.fallbackFlickDy = 0;
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;
    const strength = (delta) => clamp(
      (Math.abs(delta) / elapsedSeconds - FALLBACK_FLICK_MIN_SPEED_PX_PER_SECOND)
        / (FALLBACK_FLICK_MAX_SPEED_PX_PER_SECOND - FALLBACK_FLICK_MIN_SPEED_PX_PER_SECOND),
      0,
      1
    );
    const movingTowardXEdge = Math.sign(dx) === Math.sign(this.fallbackEdgeDx);
    const movingTowardYEdge = Math.sign(dy) === Math.sign(this.fallbackEdgeDy);
    const xStrength = strength(dx);
    const yStrength = strength(dy);
    if (movingTowardXEdge && xStrength > 0) {
      this.fallbackFlickDx = Math.sign(dx) * xStrength * Math.sqrt(Math.abs(this.fallbackEdgeDx)) * FALLBACK_FLICK_YAW_BOOST_PX;
    }
    if (movingTowardYEdge && yStrength > 0) {
      this.fallbackFlickDy = Math.sign(dy) * yStrength * Math.sqrt(Math.abs(this.fallbackEdgeDy)) * FALLBACK_FLICK_PITCH_BOOST_PX;
    }
    if (Math.abs(this.fallbackFlickDx) > 0.001 || Math.abs(this.fallbackFlickDy) > 0.001) {
      this.applyLookDelta(this.fallbackFlickDx, this.fallbackFlickDy, this.settings.mouseSensitivityRadPerPx);
    }
  }

  resetFallbackEdgeTurn() {
    this.fallbackEdgeDx = 0;
    this.fallbackEdgeDy = 0;
    this.fallbackFlickDx = 0;
    this.fallbackFlickDy = 0;
    document.body.classList.remove('player-look-edge');
  }

  applyFallbackEdgeTurn(dt) {
    if (!this.fallbackLookActive || !Number.isFinite(dt) || dt <= 0) return;
    if (Math.abs(this.fallbackEdgeDx) <= 0.001 && Math.abs(this.fallbackEdgeDy) <= 0.001) return;
    this.applyLookDelta(
      this.fallbackEdgeDx * FALLBACK_EDGE_YAW_PX_PER_SECOND * dt,
      this.fallbackEdgeDy * FALLBACK_EDGE_PITCH_PX_PER_SECOND * dt,
      this.settings.mouseSensitivityRadPerPx
    );
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.pointerLockAttempt += 1;
      this.deactivateFallbackLook({ notify: false });
      this.keys.clear();
      this.mobileKeys.clear();
      this.velocity.set(0, 0, 0);
      if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    }
    document.body.classList.toggle('player-mode', this.enabled);
  }

  setLookAt(position, target) {
    this.position.copy(position);
    this.fixedHeightMm = position.z;
    const direction = this.delta.copy(target).sub(position).normalize();
    this.yaw = Math.atan2(direction.y, direction.x);
    this.pitch = Math.asin(clamp(direction.z, -1, 1));
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.syncCamera();
  }

  setFixedHeight(heightMm) {
    if (!Number.isFinite(heightMm)) throw new TypeError('fixed player height must be finite');
    this.fixedHeightMm = heightMm;
    this.position.z = heightMm;
    this.velocity.z = 0;
    this.desired.z = 0;
    this.syncCamera();
    return heightMm;
  }

  physicsStep(dt) {
    if (!this.enabled) return;
    this.applyFallbackEdgeTurn(dt);
    const smoothing = Math.max(0.0001, this.settings.mouseSmoothingS);
    const lookAlpha = 1 - Math.exp(-dt / smoothing);
    this.yaw += (this.targetYaw - this.yaw) * lookAlpha;
    this.pitch += (this.targetPitch - this.pitch) * lookAlpha;
    this.syncBasis();
    if (Number.isFinite(this.fixedHeightMm)) this.position.z = this.fixedHeightMm;
    const pressed = (code) => this.keys.has(code) || this.mobileKeys.has(code);
    const ix = Number(pressed('KeyW')) - Number(pressed('KeyS'));
    const iy = Number(pressed('KeyD')) - Number(pressed('KeyA'));
    this.desired.set(0, 0, 0)
      .addScaledVector(this.forward, ix)
      .addScaledVector(this.right, iy);
    this.desired.z = 0;
    if (this.desired.lengthSq()) this.desired.normalize();
    const mobileScale = this.mobileMode ? this.settings.mobileDpadSpeedScale : 1;
    const sprint = pressed('ShiftLeft') || pressed('ShiftRight') ? this.settings.sprintMultiplier : 1;
    this.desired.multiplyScalar(this.settings.moveSpeedMmS * sprint * mobileScale);
    const input = Boolean(ix || iy);
    const acceleration = input ? this.settings.accelerationMmS2 : this.settings.decelerationMmS2;
    this.delta.copy(this.desired).sub(this.velocity);
    const length = this.delta.length();
    if (length > acceleration * dt && length > 0) this.delta.multiplyScalar(acceleration * dt / length);
    this.velocity.add(this.delta);
    if (!input && this.settings.movementDampingPerS > 0) {
      this.velocity.multiplyScalar(Math.exp(-this.settings.movementDampingPerS * dt));
    }
    this.velocity.z = 0;
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
    this.velocity.z = 0;
    if (Number.isFinite(this.fixedHeightMm)) this.position.z = this.fixedHeightMm;
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
      fallbackLookActive: this.fallbackLookActive,
      fallbackEdgeTurn: { dx: this.fallbackEdgeDx, dy: this.fallbackEdgeDy },
      fallbackFlickBoost: { dx: this.fallbackFlickDx, dy: this.fallbackFlickDy },
      lookMode: this.pointerLocked ? 'pointer-lock' : this.fallbackLookActive ? 'in-app-fallback' : 'inactive',
      position: this.position.toArray(),
      fixedHeightMm: this.fixedHeightMm,
      velocity: this.velocity.toArray(),
      yaw: this.yaw,
      pitch: this.pitch,
      collision: this.collisionSolver.getDiagnostics()
    };
  }
}
