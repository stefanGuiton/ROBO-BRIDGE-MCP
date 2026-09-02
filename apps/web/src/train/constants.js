'use strict';

export const TRAIN_FIXED_DT_SECONDS = 1 / 120;
export const TRAIN_TARGET_PHYSICS_HZ = 120;

export const TRAIN_STATES = Object.freeze({
  READY: 'READY',
  PREPARING_TEST: 'PREPARING_TEST',
  POSITIONING_PUSHER: 'POSITIONING_PUSHER',
  PUSH_READY: 'PUSH_READY',
  PUSHING: 'PUSHING',
  RUNNING_SUPPORTED: 'RUNNING_SUPPORTED',
  FALLING: 'FALLING',
  FAILED: 'FAILED',
  CROSSED: 'CROSSED',
  RESETTING: 'RESETTING',
  STOPPED: 'STOPPED'
});

export const TRAIN_ACTIVE_STEP_STATES = new Set([
  TRAIN_STATES.POSITIONING_PUSHER,
  TRAIN_STATES.PUSHING,
  TRAIN_STATES.RUNNING_SUPPORTED,
  TRAIN_STATES.FALLING,
  TRAIN_STATES.RESETTING
]);

export const TRAIN_TERMINAL_STATES = new Set([
  TRAIN_STATES.FAILED,
  TRAIN_STATES.CROSSED,
  TRAIN_STATES.STOPPED
]);

export const TRAIN_RESET_TIMES_SECONDS = Object.freeze({ C: 0, B: 0.5, A: 1.0 });

export const DEFAULT_TRAIN_MOTION_SETTINGS = Object.freeze({
  trainSpeedMmPerSecond: 120,
  pushDistanceMm: 64,
  pusherOffsetMm: Object.freeze({ xMm: 0, yMm: 0, zMm: 0 }),
  pusherRotationDeg: Object.freeze({ xDeg: 0, yDeg: 0, zDeg: 0 }),
  pusherClearanceMm: 2,
  pusherVisible: true,
  maximumCatchUpSteps: 16,
  maximumFrameDeltaSeconds: 0.12
});

export const DEFAULT_SUPPORT_SETTINGS = Object.freeze({
  sampleCount: 7,
  minimumAcceptedSlices: 2,
  minimumSupportedSampleRatio: 0.68
});

export const DEFAULT_TRAIN_PHYSICS_SETTINGS = Object.freeze({
  gravityMmPerSecondSquared: 420,
  airDampingPerSecond: 0.32,
  lateralAirDampingPerSecond: 1.1,
  angularDampingPerSecond: 1.4,
  groundFrictionPerSecond: 2.0,
  groundAngularDampingPerSecond: 5.0,
  groundRestitution: 0.08,
  bridgeRestitution: 0.05,
  maximumLinearSpeedMmPerSecond: 1800,
  maximumAngularSpeedRadPerSecond: 8,
  couplerIterations: 8,
  couplerStiffness: 0.42,
  couplerMaximumCorrectionMm: 2.5,
  couplerVelocityDamping: 0.84,
  bodyContactIterations: 3,
  bodyContactSlopMm: 0.02,
  bodyContactMaximumCorrectionMm: 3,
  nonNeighbourRestitution: 0.04,
  settleLinearSpeedMmPerSecond: 22,
  settleAngularSpeedRadPerSecond: 0.55,
  settleRequiredSeconds: 0.65,
  settleTimeoutSeconds: 12,
  restClearanceMm: 2.5,
  pbdVelocityDamping: 0.96
});
