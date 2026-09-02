'use strict';

import {
  createRouteFrame,
  normalizeTrainWorldTransform
} from '../train/route-frame.js';
import {
  callFirst,
  cloneValue,
  deepFreezePlain,
  distance3,
  distanceHorizontal,
  finite,
  invariant,
  normalizeMachinePoint,
  unwrapFrozenPlan
} from './internal.js';

const RAD_TO_DEG = 180 / Math.PI;

function trackTopLocalY(plan) {
  const tracks = (plan.geometry?.masterSlice?.customPlacements || [])
    .filter((placement) => placement.partClass === 'TRACK_SEGMENT')
    .sort((left, right) => finite(left.trackIndex) - finite(right.trackIndex));
  invariant(tracks.length > 0, 'INVALID_CHALLENGE_ROUTE', 'The BuildPlan has no track route.');
  const definitionId = plan.geometry?.track?.definitionId;
  const definition = plan.catalogue?.customDefinitions?.find((item) => item.definitionId === definitionId)
    || plan.catalogue?.customDefinitions?.find((item) => item.partClass === 'TRACK_SEGMENT')
    || null;
  const parameters = definition?.parameters || {};
  const top = Math.max(finite(parameters.sleeperHeight), finite(parameters.railBase) + finite(parameters.railHeight));
  return finite(tracks[0].baseY) + top;
}

function planRouteSource(plan) {
  const startLocalX = Number(plan.anchors?.entry?.innerFaceX);
  const endLocalX = Number(plan.anchors?.exit?.innerFaceX);
  const centreLocalZ = Number(plan.anchors?.bridgeCentreZ ?? plan.anchors?.group?.z);
  invariant([startLocalX, endLocalX, centreLocalZ].every(Number.isFinite) && endLocalX > startLocalX,
    'INVALID_CHALLENGE_ROUTE', 'The BuildPlan route anchors are invalid.');
  return {
    startLocalX,
    endLocalX,
    centreLocalZ,
    trackTopLocalY: trackTopLocalY(plan),
    lengthLocal: endLocalX - startLocalX
  };
}

function normalizeBridgeTransform(value) {
  const source = value?.worldTransform ?? value ?? {};
  const translationSource = source.translationMm ?? source.translation ?? source.position ?? {};
  const yawRad = Number.isFinite(Number(source.yawRad))
    ? Number(source.yawRad)
    : Number.isFinite(Number(source.yawDeg)) ? Number(source.yawDeg) / RAD_TO_DEG
      : Number.isFinite(Number(source.rotation?.z)) ? Number(source.rotation.z) : 0;
  const candidate = {
    id: source.id || 'challenge-bridge-transform',
    translationMm: {
      xMm: Number(translationSource.xMm ?? translationSource.x ?? 0),
      yMm: Number(translationSource.yMm ?? translationSource.y ?? 0),
      zMm: Number(translationSource.zMm ?? translationSource.z ?? 0)
    },
    yawRad,
    scale: Number(source.scale ?? 1)
  };
  return normalizeTrainWorldTransform(candidate);
}

function inferBridgeTransform(plan, route) {
  const source = planRouteSource(plan);
  const dx = route.endMachineMm.xMm - route.startMachineMm.xMm;
  const dy = route.endMachineMm.yMm - route.startMachineMm.yMm;
  const lengthMm = Math.hypot(dx, dy);
  const scale = lengthMm / source.lengthLocal;
  invariant(Number.isFinite(scale) && scale > 0, 'INVALID_CHALLENGE_ROUTE', 'The Challenge route cannot produce a valid bridge scale.');
  const yawRad = Math.atan2(dy, dx);
  const cosine = Math.cos(yawRad);
  const sine = Math.sin(yawRad);
  const x = source.startLocalX;
  const z = source.centreLocalZ;
  return normalizeTrainWorldTransform({
    id: `challenge-derived.${route.challengeId || 'active'}`,
    translationMm: {
      xMm: route.startMachineMm.xMm - scale * (cosine * x - sine * z),
      yMm: route.startMachineMm.yMm - scale * (sine * x + cosine * z),
      zMm: route.startMachineMm.zMm - scale * source.trackTopLocalY
    },
    yawRad,
    scale
  });
}

function readChallengeRoute(challengeService) {
  invariant(challengeService && typeof challengeService === 'object', 'CHALLENGE_SERVICE_REQUIRED', 'ChallengeService is required.');
  const activeRead = callFirst(challengeService, ['getActiveChallenge', 'getState']);
  const active = activeRead.value || {};
  const routeRead = callFirst(challengeService, ['getTrainRoute', 'getTrackRoute']);
  const rawRoute = routeRead.value || active.trainRoute || active.trackRoute || null;
  const entryRead = callFirst(challengeService, ['getEntry']);
  const exitRead = callFirst(challengeService, ['getExit']);
  const rawEntry = entryRead.value || active.entry || rawRoute?.entry || rawRoute?.start;
  const rawExit = exitRead.value || active.exit || rawRoute?.exit || rawRoute?.end;
  invariant(rawEntry && rawExit, 'INVALID_CHALLENGE_ROUTE', 'ChallengeService must expose ENTRY and EXIT or a train route.');
  const startMachineMm = normalizeMachinePoint(rawRoute?.start ?? rawEntry, 'Challenge route start');
  const endMachineMm = normalizeMachinePoint(rawRoute?.end ?? rawExit, 'Challenge route end');
  const entryMachineMm = normalizeMachinePoint(rawEntry, 'Challenge ENTRY');
  const exitMachineMm = normalizeMachinePoint(rawExit, 'Challenge EXIT');
  const dx = endMachineMm.xMm - startMachineMm.xMm;
  const dy = endMachineMm.yMm - startMachineMm.yMm;
  const dz = endMachineMm.zMm - startMachineMm.zMm;
  const lengthMm = Math.hypot(dx, dy);
  invariant(lengthMm > 1e-6, 'INVALID_CHALLENGE_ROUTE', 'Challenge ENTRY and EXIT must not overlap.');
  const forward = Object.freeze({ x: dx / lengthMm, y: dy / lengthMm, z: 0 });
  const up = Object.freeze({ x: 0, y: 0, z: 1 });
  const right = Object.freeze({ x: forward.y, y: -forward.x, z: 0 });
  const transformRead = callFirst(challengeService, ['getBridgeTransform']);
  const rawTransform = transformRead.value || active.bridgeTransform || rawRoute?.bridgeTransform || null;
  const challengeId = String(active.presetId ?? active.challengeId ?? active.id ?? rawRoute?.id ?? 'active');
  return {
    schemaVersion: 'robo-bridge.challenge-train-route.v1',
    challengeId,
    coordinateFrame: rawRoute?.coordinateFrame ?? active.coordinateFrame?.id ?? active.coordinateFrame ?? 'main-demo-machine-mm',
    startMachineMm,
    endMachineMm,
    entryMachineMm,
    exitMachineMm,
    forward,
    up,
    right,
    lengthMm,
    elevationDeltaMm: dz,
    declaredLengthMm: Number.isFinite(Number(rawRoute?.lengthMm)) ? Number(rawRoute.lengthMm) : null,
    rawBridgeTransform: rawTransform,
    sources: {
      challenge: activeRead.name,
      route: routeRead.name || (active.trainRoute ? 'active.trainRoute' : active.trackRoute ? 'active.trackRoute' : null),
      entry: entryRead.name || 'route/active',
      exit: exitRead.name || 'route/active',
      bridgeTransform: transformRead.name || (rawTransform ? 'active/route.bridgeTransform' : null)
    }
  };
}

function validationReport(route, frame, options = {}, { roadToTrackOffsetMm = null } = {}) {
  const startErrorMm = distance3(route.startMachineMm, frame.startMachineMm);
  const endErrorMm = distance3(route.endMachineMm, frame.endMachineMm);
  const startHorizontalErrorMm = distanceHorizontal(route.startMachineMm, frame.startMachineMm);
  const endHorizontalErrorMm = distanceHorizontal(route.endMachineMm, frame.endMachineMm);
  const startElevationDeltaMm = frame.startMachineMm.zMm - route.startMachineMm.zMm;
  const endElevationDeltaMm = frame.endMachineMm.zMm - route.endMachineMm.zMm;
  // Challenge ENTRY/EXIT may describe either the rail top (Oracle fixtures) or
  // the bridge road plane (current MAIN_DEMO). The latter is valid only when
  // its offset exactly matches the live BuildPlan's road-to-track geometry.
  const elevationResidual = (delta) => roadToTrackOffsetMm === null
    ? Math.abs(delta)
    : Math.min(Math.abs(delta), Math.abs(delta - roadToTrackOffsetMm));
  const startElevationErrorMm = elevationResidual(startElevationDeltaMm);
  const endElevationErrorMm = elevationResidual(endElevationDeltaMm);
  const dot = Math.max(-1, Math.min(1, route.forward.x * frame.forward.x + route.forward.y * frame.forward.y));
  const directionErrorDeg = Math.acos(dot) * RAD_TO_DEG;
  const lengthErrorMm = Math.abs(route.lengthMm - frame.lengthMm);
  const positionToleranceMm = Number(options.positionToleranceMm ?? 2);
  const elevationToleranceMm = Number(options.elevationToleranceMm ?? 2);
  const directionToleranceDeg = Number(options.directionToleranceDeg ?? 0.25);
  const lengthToleranceMm = Number(options.lengthToleranceMm ?? 2);
  const ok = startHorizontalErrorMm <= positionToleranceMm
    && endHorizontalErrorMm <= positionToleranceMm
    && startElevationErrorMm <= elevationToleranceMm
    && endElevationErrorMm <= elevationToleranceMm
    && directionErrorDeg <= directionToleranceDeg
    && lengthErrorMm <= lengthToleranceMm;
  return {
    ok,
    startErrorMm,
    endErrorMm,
    startHorizontalErrorMm,
    endHorizontalErrorMm,
    startElevationErrorMm,
    endElevationErrorMm,
    startElevationDeltaMm,
    endElevationDeltaMm,
    roadToTrackOffsetMm,
    elevationReference: roadToTrackOffsetMm !== null
      && Math.abs(startElevationDeltaMm - roadToTrackOffsetMm) < Math.abs(startElevationDeltaMm)
      ? 'bridge_road' : 'track_top',
    directionErrorDeg,
    lengthErrorMm,
    tolerances: { positionToleranceMm, elevationToleranceMm, directionToleranceDeg, lengthToleranceMm }
  };
}

export function createTrainRouteFrameFromChallenge(challengeService, options = {}) {
  const route = readChallengeRoute(challengeService);
  const maximumRouteSlopeMm = Number(options.maximumRouteSlopeMm ?? 0.5);
  invariant(Math.abs(route.elevationDeltaMm) <= maximumRouteSlopeMm,
    'UNSUPPORTED_ROUTE_SLOPE', 'Train V2.2 requires a level ENTRY-to-EXIT route.', {
      elevationDeltaMm: route.elevationDeltaMm,
      maximumRouteSlopeMm
    });
  if (route.declaredLengthMm !== null) {
    invariant(Math.abs(route.declaredLengthMm - route.lengthMm) <= Number(options.lengthToleranceMm ?? 2),
      'INVALID_CHALLENGE_ROUTE', 'Challenge route length does not match ENTRY and EXIT.', {
        declaredLengthMm: route.declaredLengthMm,
        calculatedLengthMm: route.lengthMm
      });
  }
  const endpointToleranceMm = Number(options.endpointToleranceMm ?? options.positionToleranceMm ?? 2);
  const entryRouteStartErrorMm = distance3(route.entryMachineMm, route.startMachineMm);
  const exitRouteEndErrorMm = distance3(route.exitMachineMm, route.endMachineMm);
  invariant(entryRouteStartErrorMm <= endpointToleranceMm && exitRouteEndErrorMm <= endpointToleranceMm,
    'INVALID_CHALLENGE_ROUTE', 'Challenge ENTRY and EXIT do not match the train route endpoints.', {
      entryRouteStartErrorMm,
      exitRouteEndErrorMm,
      endpointToleranceMm
    });

  const frozenValue = options.frozenPlan ?? options.frozenBuildPlan ?? null;
  if (!frozenValue) return deepFreezePlain({
    ...route,
    worldTransform: null,
    trainRouteFrame: null,
    transformSource: null,
    validation: { ok: true, entryRouteStartErrorMm, exitRouteEndErrorMm, endpointToleranceMm }
  });
  const { buildPlan } = unwrapFrozenPlan(frozenValue);
  const worldTransform = route.rawBridgeTransform
    ? normalizeBridgeTransform(route.rawBridgeTransform)
    : inferBridgeTransform(buildPlan, route);
  const trainRouteFrame = createRouteFrame({ frozenBuildPlan: buildPlan, worldTransform });
  const routeSource = planRouteSource(buildPlan);
  const roadY = Number(buildPlan.anchors?.roadY);
  const roadToTrackOffsetMm = Number.isFinite(roadY)
    ? worldTransform.scale * (routeSource.trackTopLocalY - roadY)
    : null;
  const validation = {
    ...validationReport(route, trainRouteFrame, options, { roadToTrackOffsetMm }),
    entryRouteStartErrorMm,
    exitRouteEndErrorMm,
    endpointToleranceMm
  };
  invariant(validation.ok, 'TRAIN_ROUTE_TRANSFORM_MISMATCH', 'ChallengeService route and bridge transform do not describe the same train route.', validation);

  return deepFreezePlain({
    ...route,
    rawBridgeTransform: undefined,
    worldTransform: cloneValue(worldTransform),
    trainRouteFrame: cloneValue(trainRouteFrame),
    transformSource: route.rawBridgeTransform ? route.sources.bridgeTransform : 'derived-from-challenge-route',
    validation
  });
}

export function getChallengeTrainRoute(challengeService) {
  const route = readChallengeRoute(challengeService);
  return deepFreezePlain({ ...route, rawBridgeTransform: cloneValue(route.rawBridgeTransform) });
}
