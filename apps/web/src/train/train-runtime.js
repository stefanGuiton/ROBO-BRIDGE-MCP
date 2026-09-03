'use strict';

import {
  DEFAULT_TRAIN_MOTION_SETTINGS,
  TRAIN_ACTIVE_STEP_STATES,
  TRAIN_FIXED_DT_SECONDS
} from './constants.js';
import { clamp } from './math.js';
import { TCP_CONTACT_LIMITS } from './train-kinematic-contact.js';

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
  let lastFrameUsesContactClock = false;
  let totalContactSubsteps = 0;

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
      lastFrameUsesContactClock = false;
      const snapshot = service.getSnapshot();
      if (snapshot.motion?.mode === 'tcp_contact' && JSON.stringify(snapshot.pusher?.pose) !== lastPusherPoseKey) updateRenderer(snapshot);
      onFrame?.(snapshot, { fixedSteps: 0, active: false });
      return { fixedSteps: 0, active: false, accumulatorSeconds, snapshot };
    }
    const measuredClock = service.getMotionMode?.() === 'tcp_contact' && service.getContactTiming?.()?.tracking === true;
    if (measuredClock !== lastFrameUsesContactClock) accumulatorSeconds = 0;
    lastFrameUsesContactClock = measuredClock;
    if (measuredClock) {
      // Capture one observation horizon per frame. Physics cost must not add
      // more clock time inside this same frame, or be counted again as RAF dt.
      service.samplePhysicalContact();
      accumulatorSeconds = service.getContactTiming()?.availableSeconds ?? 0;
    } else accumulatorSeconds += clamp(Number(deltaSeconds) || 0, 0, maximumFrameDeltaSeconds);
    let fixedSteps = 0;
    let contactSubsteps = 0;
    while ((measuredClock ? accumulatorSeconds > TCP_CONTACT_LIMITS.timeEpsilonSeconds
      : accumulatorSeconds + 1e-12 >= TRAIN_FIXED_DT_SECONDS)
      && fixedSteps < maximumCatchUpSteps && TRAIN_ACTIVE_STEP_STATES.has(service.getState())) {
      const advanced = service.step(measuredClock ? Math.min(TRAIN_FIXED_DT_SECONDS, accumulatorSeconds) : TRAIN_FIXED_DT_SECONDS,
        measuredClock ? { sampleContact: false } : {});
      if (measuredClock) {
        const timing = service.getContactTiming();
        accumulatorSeconds = timing?.availableSeconds ?? 0;
        contactSubsteps += timing?.lastAdvanceSubsteps ?? 0;
        if (!advanced) break;
      } else accumulatorSeconds -= TRAIN_FIXED_DT_SECONDS;
      fixedSteps += 1;
      totalFixedSteps += 1;
      if (!TRAIN_ACTIVE_STEP_STATES.has(service.getState())) break;
    }
    if (!measuredClock && fixedSteps >= maximumCatchUpSteps && accumulatorSeconds >= TRAIN_FIXED_DT_SECONDS) {
      droppedCatchUpSeconds += accumulatorSeconds;
      accumulatorSeconds = 0;
    }
    totalContactSubsteps += contactSubsteps;
    const snapshot = service.getSnapshot();
    if (fixedSteps > 0 || (snapshot.motion?.mode === 'tcp_contact' && JSON.stringify(snapshot.pusher?.pose) !== lastPusherPoseKey)) updateRenderer(snapshot);
    const integrationLagSeconds = measuredClock ? service.getContactTiming()?.lagSeconds ?? 0 : 0;
    onFrame?.(snapshot, { fixedSteps, contactSubsteps, integrationLagSeconds, active: TRAIN_ACTIVE_STEP_STATES.has(service.getState()) });
    return {
      fixedSteps,
      contactSubsteps,
      active: TRAIN_ACTIVE_STEP_STATES.has(service.getState()),
      accumulatorSeconds,
      interpolationAlpha: measuredClock ? 0 : accumulatorSeconds / TRAIN_FIXED_DT_SECONDS,
      integrationLagSeconds,
      clock: measuredClock ? 'authoritative-tcp-monotonic' : 'frame-delta',
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
        totalContactSubsteps,
        clock: lastFrameUsesContactClock ? 'authoritative-tcp-monotonic' : 'frame-delta',
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
