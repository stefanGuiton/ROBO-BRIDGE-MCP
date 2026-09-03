'use strict';

import {
  cloneValue,
  eulerDegreesToQuaternion,
  identityQuaternion,
  normaliseQuaternion,
  quaternionAngularError
} from './math.js';

function canonicalPose(source = {}) {
  const positionMm = source.positionMm || source.position || {};
  const rotationDeg = source.rotationDeg || source.rotationEulerDeg || {};
  const canonicalRotationDeg = {
    xDeg: Number(rotationDeg.xDeg ?? rotationDeg.x) || 0,
    yDeg: Number(rotationDeg.yDeg ?? rotationDeg.y) || 0,
    zDeg: Number(rotationDeg.zDeg ?? rotationDeg.z) || 0
  };
  return {
    frame: source.frame || 'main-demo-machine-mm',
    positionMm: {
      xMm: Number(positionMm.xMm ?? positionMm.x) || 0,
      yMm: Number(positionMm.yMm ?? positionMm.y) || 0,
      zMm: Number(positionMm.zMm ?? positionMm.z) || 0
    },
    rotationQuaternion: source.rotationQuaternion
      ? normaliseQuaternion(source.rotationQuaternion)
      : eulerDegreesToQuaternion(canonicalRotationDeg),
    rotationDeg: canonicalRotationDeg,
    routeTangent: cloneValue(source.routeTangent || { x: 1, y: 0, z: 0 }),
    rearContactOffsetMm: Number(source.rearContactOffsetMm) || 0,
    clearanceMm: Number(source.clearanceMm) || 0
  };
}

export function createPusherAdapter(options = {}) {
  const mode = options.mode === 'external' ? 'external' : 'placeholder';
  const getExternalPose = typeof options.getPose === 'function' ? options.getPose : null;
  const setExternalTarget = typeof options.setTargetPose === 'function' ? options.setTargetPose : null;
  const onPushStartCallback = typeof options.onPushStart === 'function' ? options.onPushStart : null;
  const onPushEndCallback = typeof options.onPushEnd === 'function' ? options.onPushEnd : null;
  const onResetCallback = typeof options.onReset === 'function' ? options.onReset : null;
  let pose = canonicalPose(options.initialPose);
  let targetPose = canonicalPose(options.initialPose);
  let visible = options.visible !== false;
  let forcedReady = mode === 'placeholder';
  let pushing = false;

  function getPose() {
    if (mode === 'external' && getExternalPose) {
      const external = getExternalPose();
      if (external) pose = canonicalPose(external);
    }
    return cloneValue(pose);
  }

  function setTargetPose(nextPose) {
    targetPose = canonicalPose(nextPose);
    forcedReady = false;
    if (setExternalTarget) setExternalTarget(cloneValue(targetPose));
    if (mode === 'placeholder') {
      pose = canonicalPose(targetPose);
      forcedReady = true;
    }
    return cloneValue(targetPose);
  }

  function isAtTarget(expected = targetPose, tolerances = {}) {
    if (forcedReady) return true;
    const current = getPose();
    const target = canonicalPose(expected);
    const positionToleranceMm = Number.isFinite(tolerances.positionToleranceMm)
      ? Math.max(0, tolerances.positionToleranceMm) : 0.5;
    const rotationToleranceRad = Number.isFinite(tolerances.rotationToleranceRad)
      ? Math.max(0, tolerances.rotationToleranceRad) : 0.25 * Math.PI / 180;
    const distanceMm = Math.hypot(
      current.positionMm.xMm - target.positionMm.xMm,
      current.positionMm.yMm - target.positionMm.yMm,
      current.positionMm.zMm - target.positionMm.zMm
    );
    return distanceMm <= positionToleranceMm
      && quaternionAngularError(current.rotationQuaternion, target.rotationQuaternion) <= rotationToleranceRad;
  }

  return Object.freeze({
    mode,
    getPose,
    getTargetPose() { return cloneValue(targetPose); },
    setPose(nextPose) { pose = canonicalPose(nextPose); return getPose(); },
    setTargetPose,
    notifyReady(nextPose) {
      if (nextPose) pose = canonicalPose(nextPose);
      forcedReady = true;
      return true;
    },
    isAtTarget,
    onPushStart(profile) { pushing = true; onPushStartCallback?.(cloneValue(profile)); },
    onPushEnd(detail) { pushing = false; onPushEndCallback?.(cloneValue(detail)); },
    reset(nextPose) {
      pose = canonicalPose(nextPose);
      targetPose = canonicalPose(nextPose);
      forcedReady = mode === 'placeholder';
      pushing = false;
      onResetCallback?.(cloneValue(pose));
      return getPose();
    },
    setVisible(value) { visible = Boolean(value); return visible; },
    getSnapshot() {
      return {
        mode,
        pose: getPose(),
        targetPose: cloneValue(targetPose),
        visible,
        pushing,
        atTarget: isAtTarget(targetPose)
      };
    }
  });
}

export { canonicalPose as canonicalPusherPose, eulerDegreesToQuaternion, identityQuaternion };
