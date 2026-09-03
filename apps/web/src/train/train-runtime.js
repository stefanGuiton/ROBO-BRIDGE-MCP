'use strict';

import {
  DEFAULT_TRAIN_MOTION_SETTINGS,
  TRAIN_ACTIVE_STEP_STATES,
  TRAIN_FIXED_DT_SECONDS
} from './constants.js';
import { clamp } from './math.js';

export function createTrainRuntime({
  service,
  renderer = null,
  maximumCatchUpSteps = DEFAULT_TRAIN_MOTION_SETTINGS.maximumCatchUpSteps,
  maximumFrameDeltaSeconds = DEFAULT_TRAIN_MOTION_SETTINGS.maximumFrameDeltaSeconds,
  onFrame = null
} = {}) {
  if (!service?.step || !service?.getState) throw new TypeError('Train runtime requires TrainTestService.');
  let accumulatorSeconds = 0;
  let totalFixedSteps = 0;
  let droppedCatchUpSeconds = 0;
  let disposed = false;
  let rendererUpdates = 0;
  let lastPusherPoseKey = null;

  function updateRenderer(snapshot) {
    if (!renderer?.update || !snapshot) return false;
    renderer.update(snapshot, service.getSupportMap?.(), service.getCollisionSnapshot?.());
    lastPusherPoseKey = snapshot.motion?.mode === 'tcp_contact' ? JSON.stringify(snapshot.pusher?.pose) : null;
    rendererUpdates += 1;
    return true;
  }

  const unsubscribe = typeof service.subscribe === 'function'
    ? service.subscribe((snapshot) => { if (snapshot && !disposed) updateRenderer(snapshot); })
    : () => {};
  updateRenderer(service.getSnapshot());

  function updateFrame(deltaSeconds) {
    if (disposed) return { fixedSteps: 0, active: false, disposed: true, snapshot: service.getSnapshot() };
    const active = TRAIN_ACTIVE_STEP_STATES.has(service.getState());
    if (!active) {
      accumulatorSeconds = 0;
      const snapshot = service.getSnapshot();
      if (snapshot.motion?.mode === 'tcp_contact' && JSON.stringify(snapshot.pusher?.pose) !== lastPusherPoseKey) updateRenderer(snapshot);
      onFrame?.(snapshot, { fixedSteps: 0, active: false });
      return { fixedSteps: 0, active: false, accumulatorSeconds, snapshot };
    }
    const acceptedDelta = clamp(Number(deltaSeconds) || 0, 0, maximumFrameDeltaSeconds);
    accumulatorSeconds += acceptedDelta;
    let fixedSteps = 0;
    while (accumulatorSeconds + 1e-12 >= TRAIN_FIXED_DT_SECONDS && fixedSteps < maximumCatchUpSteps) {
      service.step(TRAIN_FIXED_DT_SECONDS);
      accumulatorSeconds -= TRAIN_FIXED_DT_SECONDS;
      fixedSteps += 1;
      totalFixedSteps += 1;
      if (!TRAIN_ACTIVE_STEP_STATES.has(service.getState())) break;
    }
    if (fixedSteps >= maximumCatchUpSteps && accumulatorSeconds >= TRAIN_FIXED_DT_SECONDS) {
      droppedCatchUpSeconds += accumulatorSeconds;
      accumulatorSeconds = 0;
    }
    const snapshot = service.getSnapshot();
    if (fixedSteps > 0 || (snapshot.motion?.mode === 'tcp_contact' && JSON.stringify(snapshot.pusher?.pose) !== lastPusherPoseKey)) updateRenderer(snapshot);
    onFrame?.(snapshot, { fixedSteps, active: TRAIN_ACTIVE_STEP_STATES.has(service.getState()) });
    return {
      fixedSteps,
      active: TRAIN_ACTIVE_STEP_STATES.has(service.getState()),
      accumulatorSeconds,
      interpolationAlpha: accumulatorSeconds / TRAIN_FIXED_DT_SECONDS,
      snapshot
    };
  }

  return Object.freeze({
    updateFrame,
    resetAccumulator() { accumulatorSeconds = 0; },
    getStats() {
      return {
        fixedDtSeconds: TRAIN_FIXED_DT_SECONDS,
        targetPhysicsHz: 120,
        totalFixedSteps,
        accumulatorSeconds,
        droppedCatchUpSeconds,
        maximumCatchUpSteps,
        maximumFrameDeltaSeconds,
        rendererUpdates,
        idleLoopOwned: false
      };
    },
    dispose() {
      disposed = true;
      accumulatorSeconds = 0;
      unsubscribe();
      renderer?.dispose?.();
      service.dispose?.();
    }
  });
}
