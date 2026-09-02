'use strict';

import {
  add,
  cloneValue,
  finite,
  identityQuaternion,
  multiply,
  multiplyQuaternions,
  quaternionFromRotationMatrix,
  round6,
  subtract,
  dot
} from './math.js';

function requireBuildPlan(plan) {
  if (!plan || plan.schemaVersion !== '4.6' || !plan.anchors?.entry || !plan.anchors?.exit || !plan.geometry?.track) {
    throw new TypeError('A frozen V4.6 BuildPlan with ENTRY, EXIT and track geometry is required.');
  }
}

export function normalizeTrainWorldTransform(input = {}) {
  const translation = input.translationMm || {};
  const yawRad = input.yawRad !== undefined
    ? finite(input.yawRad)
    : finite(input.yawDeg) * Math.PI / 180;
  const scale = finite(input.scale, 1);
  if (!(scale > 0)) throw new RangeError('worldTransform.scale must be greater than zero.');
  return Object.freeze({
    id: typeof input.id === 'string' && input.id ? input.id : 'bridge-local-to-main-demo',
    translationMm: Object.freeze({
      xMm: finite(translation.xMm),
      yMm: finite(translation.yMm),
      zMm: finite(translation.zMm)
    }),
    yawRad,
    yawDeg: yawRad * 180 / Math.PI,
    scale,
    sourceFrame: 'v46-bridge-local-x-span-y-up-z-width',
    targetFrame: 'main-demo-machine-x-y-horizontal-z-up'
  });
}

export function transformBridgePointToMachine(point, worldTransform = {}) {
  const transform = normalizeTrainWorldTransform(worldTransform);
  const x = finite(point.x ?? point.xMm);
  const y = finite(point.y ?? point.yMm);
  const z = finite(point.z ?? point.zMm);
  const cosine = Math.cos(transform.yawRad);
  const sine = Math.sin(transform.yawRad);
  return {
    xMm: transform.translationMm.xMm + transform.scale * (cosine * x - sine * z),
    yMm: transform.translationMm.yMm + transform.scale * (sine * x + cosine * z),
    zMm: transform.translationMm.zMm + transform.scale * y
  };
}

function trackDefinition(plan) {
  const id = plan.geometry.track.definitionId;
  return plan.catalogue?.customDefinitions?.find((definition) => definition.definitionId === id)
    || plan.catalogue?.customDefinitions?.find((definition) => definition.partClass === 'TRACK_SEGMENT')
    || null;
}

function trackTopLocalY(plan) {
  const tracks = (plan.geometry.masterSlice?.customPlacements || [])
    .filter((placement) => placement.partClass === 'TRACK_SEGMENT')
    .sort((left, right) => finite(left.trackIndex) - finite(right.trackIndex));
  const first = tracks[0];
  if (!first) throw new TypeError('The BuildPlan does not contain a track route.');
  const parameters = trackDefinition(plan)?.parameters || {};
  const top = Math.max(
    finite(parameters.sleeperHeight),
    finite(parameters.railBase) + finite(parameters.railHeight)
  );
  return finite(first.baseY) + top;
}

export function createRouteFrame({ frozenBuildPlan, worldTransform = {} } = {}) {
  requireBuildPlan(frozenBuildPlan);
  const plan = frozenBuildPlan;
  const transform = normalizeTrainWorldTransform(worldTransform);
  const startLocalX = finite(plan.anchors.entry.innerFaceX);
  const endLocalX = finite(plan.anchors.exit.innerFaceX);
  if (!(endLocalX > startLocalX)) throw new RangeError('EXIT must be after ENTRY in the BuildPlan route.');
  const centreLocalZ = finite(plan.anchors.bridgeCentreZ ?? plan.anchors.group?.z);
  const topLocalY = trackTopLocalY(plan);
  const originMm = transformBridgePointToMachine({ x: startLocalX, y: topLocalY, z: centreLocalZ }, transform);
  const cosine = Math.cos(transform.yawRad);
  const sine = Math.sin(transform.yawRad);

  // Route-local axes are right-handed: X forward, Y up, Z right.
  const forward = Object.freeze({ x: cosine, y: sine, z: 0 });
  const up = Object.freeze({ x: 0, y: 0, z: 1 });
  const right = Object.freeze({ x: sine, y: -cosine, z: 0 });
  const sourceWidthDirection = Object.freeze({ x: -sine, y: cosine, z: 0 });
  const routeQuaternion = quaternionFromRotationMatrix([forward, up, right]);
  const lengthMm = (endLocalX - startLocalX) * transform.scale;
  const entryLengthMm = finite(plan.anchors.entry.size?.x) * transform.scale;
  const exitLengthMm = finite(plan.anchors.exit.size?.x) * transform.scale;
  const bridgeWidthMm = finite(plan.anchors.bridgeWidth ?? plan.geometry.sliceArray?.width) * transform.scale;
  const endMm = routeLocalPointToMachineRaw(originMm, forward, up, right, { x: lengthMm, y: 0, z: 0 });

  return Object.freeze({
    schemaVersion: 'robo-bridge.train-route-frame.v1',
    id: `train-route.${plan.planId}.${transform.id}`,
    planId: plan.planId,
    designChecksum: plan.designChecksum,
    designRevision: plan.designRevision,
    worldTransform: cloneValue(transform),
    originMm: Object.freeze({ ...originMm }),
    forward,
    up,
    right,
    sourceWidthDirection,
    routeQuaternion: Object.freeze(routeQuaternion),
    startMachineMm: Object.freeze({ ...originMm }),
    endMachineMm: Object.freeze({ ...endMm }),
    lengthMm: round6(lengthMm),
    bridgeWidthMm: round6(bridgeWidthMm),
    entryLengthMm: round6(entryLengthMm),
    exitLengthMm: round6(exitLengthMm),
    trackTopMachineZMm: round6(originMm.zMm),
    source: Object.freeze({
      startLocalX: round6(startLocalX),
      endLocalX: round6(endLocalX),
      centreLocalZ: round6(centreLocalZ),
      trackTopLocalY: round6(topLocalY)
    })
  });
}

function routeLocalPointToMachineRaw(originMm, forward, up, right, point) {
  return {
    xMm: originMm.xMm + forward.x * point.x + up.x * point.y + right.x * point.z,
    yMm: originMm.yMm + forward.y * point.x + up.y * point.y + right.y * point.z,
    zMm: originMm.zMm + forward.z * point.x + up.z * point.y + right.z * point.z
  };
}

export function routeLocalPointToMachine(frame, point = {}) {
  const local = {
    x: finite(point.x ?? point.forwardMm),
    y: finite(point.y ?? point.upMm),
    z: finite(point.z ?? point.rightMm ?? point.lateralMm)
  };
  return routeLocalPointToMachineRaw(frame.originMm, frame.forward, frame.up, frame.right, local);
}

export function machinePointToRouteLocal(frame, point = {}) {
  const delta = {
    x: finite(point.xMm) - frame.originMm.xMm,
    y: finite(point.yMm) - frame.originMm.yMm,
    z: finite(point.zMm) - frame.originMm.zMm
  };
  return {
    x: dot(delta, frame.forward),
    y: dot(delta, frame.up),
    z: dot(delta, frame.right)
  };
}

export function routeLocalVectorToMachine(frame, value = {}) {
  const point = routeLocalPointToMachineRaw(
    { xMm: 0, yMm: 0, zMm: 0 },
    frame.forward,
    frame.up,
    frame.right,
    { x: finite(value.x), y: finite(value.y), z: finite(value.z) }
  );
  return { x: point.xMm, y: point.yMm, z: point.zMm };
}

export function routeLocalQuaternionToMachine(frame, localQuaternion = identityQuaternion()) {
  return multiplyQuaternions(frame.routeQuaternion, localQuaternion);
}

export function routeProgress(frame, forwardMm) {
  return Math.max(0, Math.min(1, finite(forwardMm) / Math.max(1e-9, frame.lengthMm)));
}

export function routeFrameIdentity(frame) {
  return [
    frame.planId,
    frame.designChecksum,
    frame.designRevision,
    frame.worldTransform.id,
    frame.worldTransform.yawRad,
    frame.worldTransform.scale,
    frame.originMm.xMm,
    frame.originMm.yMm,
    frame.originMm.zMm,
    frame.lengthMm
  ].join('|');
}
