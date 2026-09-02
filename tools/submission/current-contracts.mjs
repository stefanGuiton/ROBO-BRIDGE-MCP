'use strict';

const EPSILON = 1e-6;

function object(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function point(value) {
  return object(value) && finite(value.x) && finite(value.y) && finite(value.z);
}

function almostEqual(a, b, tolerance = EPSILON) {
  if (!finite(a) || !finite(b)) return false;
  const left = Number(a);
  const right = Number(b);
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= tolerance * scale;
}

function pointEqual(a, b, tolerance = EPSILON) {
  return point(a) && point(b)
    && almostEqual(a.x, b.x, tolerance)
    && almostEqual(a.y, b.y, tolerance)
    && almostEqual(a.z, b.z, tolerance);
}

function scaledPointEqual(local, scale, source, tolerance = EPSILON) {
  return point(local) && point(source) && finite(scale)
    && pointEqual({ x: Number(local.x) * Number(scale), y: Number(local.y) * Number(scale), z: Number(local.z) * Number(scale) }, source, tolerance);
}

function distance(a, b) {
  if (!point(a) || !point(b)) return Number.NaN;
  return Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y), Number(b.z) - Number(a.z));
}

function routeDirection(start, end) {
  const length = distance(start, end);
  if (!Number.isFinite(length) || length <= 0) return null;
  return {
    x: (Number(end.x) - Number(start.x)) / length,
    y: (Number(end.y) - Number(start.y)) / length,
    z: (Number(end.z) - Number(start.z)) / length
  };
}

function transformEqual(a, b, tolerance = EPSILON) {
  if (!object(a) || !object(b)) return false;
  const translationA = a.translationMm ?? a.position ?? null;
  const translationB = b.translationMm ?? b.position ?? null;
  const translationOk = translationA === null && translationB === null
    ? true
    : pointEqual(
      translationA && { x: translationA.x ?? translationA.xMm, y: translationA.y ?? translationA.yMm, z: translationA.z ?? translationA.zMm },
      translationB && { x: translationB.x ?? translationB.xMm, y: translationB.y ?? translationB.yMm, z: translationB.z ?? translationB.zMm },
      tolerance
    );
  const yawA = a.yawRad ?? (finite(a.yawDeg) ? Number(a.yawDeg) * Math.PI / 180 : null);
  const yawB = b.yawRad ?? (finite(b.yawDeg) ? Number(b.yawDeg) * Math.PI / 180 : null);
  const yawOk = yawA === null && yawB === null ? true : almostEqual(yawA, yawB, tolerance);
  const scaleOk = a.scale === undefined && b.scale === undefined ? true : almostEqual(a.scale, b.scale, tolerance);
  const sourceOk = !a.sourceFrame || !b.sourceFrame || a.sourceFrame === b.sourceFrame;
  const targetOk = !a.targetFrame || !b.targetFrame || a.targetFrame === b.targetFrame;
  return translationOk && yawOk && scaleOk && sourceOk && targetOk;
}

function apiComplete(api) {
  const required = ['getActiveChallenge', 'getBridgeTransform', 'getEntry', 'getExit', 'getTrainRoute', 'getCollisionProxy'];
  return object(api) && required.every((name) => api[name] === true);
}

export function inspectEasyRuntime(snapshot) {
  const challenge = snapshot?.challenge ?? {};
  const active = challenge.active ?? null;
  const entry = challenge.entry ?? null;
  const exit = challenge.exit ?? null;
  const route = challenge.trainRoute ?? null;
  const sourceTransform = active?.bridgeTransform ?? null;
  const facadeTransform = challenge.bridgeTransform ?? null;
  const bridgeChallenge = challenge.bridgeChallenge ?? null;
  const scale = bridgeChallenge?.worldTransform?.scale;
  const start = route?.start;
  const end = route?.end;
  const expectedDirection = routeDirection(start, end);
  const metrics = active?.terrainMetrics ?? null;
  const routeSegments = Array.isArray(route?.segments) ? route.segments : [];

  const checks = {
    servicePresent: challenge.present === true && apiComplete(challenge.api),
    easyActive: active?.presetId === 'EASY',
    terrainLoaded: active?.loaded === true
      && challenge.terrain?.present === true
      && challenge.terrain?.attachedToScene === true
      && challenge.terrain?.visible !== false
      && Number(challenge.terrain?.childCount ?? 0) > 0
      && object(metrics)
      && Number(metrics.meshCount ?? 0) > 0
      && Number(metrics.triangleCount ?? 0) > 0
      && Number(metrics.bytes ?? 0) > 0,
    entryExitPresent: point(entry?.position) && point(exit?.position) && distance(entry.position, exit.position) > 0,
    trainRoutePresent: point(start) && point(end) && Number(route?.lengthMm ?? 0) > 0 && routeSegments.length > 0,
    routeInternallyConsistent: point(start) && point(end)
      && pointEqual(start, entry?.position)
      && pointEqual(end, exit?.position)
      && pointEqual(active?.entry?.position, entry?.position)
      && pointEqual(active?.exit?.position, exit?.position)
      && pointEqual(active?.trackRoute?.start, start)
      && pointEqual(active?.trackRoute?.end, end)
      && almostEqual(route?.lengthMm, distance(start, end))
      && point(expectedDirection)
      && pointEqual(route?.direction, expectedDirection),
    bridgeTransformDerived: object(sourceTransform)
      && object(facadeTransform)
      && object(bridgeChallenge)
      && finite(scale)
      && Number(scale) > 0
      && transformEqual(facadeTransform, bridgeChallenge.worldTransform)
      && transformEqual(snapshot?.host?.worldTransform, facadeTransform)
      && snapshot?.host?.challenge?.id === bridgeChallenge.id
      && scaledPointEqual(bridgeChallenge.entry, scale, sourceTransform.localEntry)
      && scaledPointEqual(bridgeChallenge.exit, scale, sourceTransform.localExit)
      && almostEqual(Number(bridgeChallenge.span) * Number(scale), sourceTransform.spanMm)
      && almostEqual(Number(bridgeChallenge.roadY) * Number(scale), sourceTransform.roadYmm)
  };
  return { checks, challenge };
}

export function inspectExactHologramIdentity(snapshot) {
  const host = snapshot?.host ?? {};
  const source = snapshot?.hologramSource ?? {};
  const summary = snapshot?.hologramSummary ?? {};
  const page = snapshot?.hologramPage ?? {};
  const buildPlan = host.buildPlan ?? {};
  const compile = snapshot?.hostCompileState ?? {};
  const expectedCount = Number(summary.totalPhysicalCount);
  const checks = {
    hostReady: snapshot?.hostReady === true && compile.ready === true,
    identityPresent: Boolean(snapshot?.planId && snapshot?.designChecksum),
    hostIdentityMatches: compile.planId === snapshot?.planId
      && compile.designChecksum === snapshot?.designChecksum
      && buildPlan.planId === snapshot?.planId
      && buildPlan.designChecksum === snapshot?.designChecksum,
    hologramIdentityMatches: source.planId === snapshot?.planId
      && source.designChecksum === snapshot?.designChecksum
      && source.designRevision === snapshot?.designRevision,
    exactPlacementSet: Number.isFinite(expectedCount)
      && expectedCount > 0
      && page.truncated === false
      && Number(page.totalAvailable) === expectedCount
      && Number(snapshot?.hologramPlacementCount) === expectedCount
      && Number(buildPlan.totalPhysicalParts) === expectedCount,
    worldTransformMatches: transformEqual(snapshot?.hologramWorldTransform, host.worldTransform)
      && transformEqual(host.worldTransform, snapshot?.challenge?.bridgeTransform),
    visibleGroupPresent: snapshot?.hologramVisible === true
      && Number(snapshot?.hologramChildCount ?? 0) > 0
      && Boolean(snapshot?.hologramGroupUuid)
  };
  return { checks, host, source, summary, page };
}

function roundNumber(value) {
  return finite(value) ? Math.round(Number(value) * 1e9) / 1e9 : value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return typeof value === 'number' ? roundNumber(value) : value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function challengeCalibrationFingerprint(snapshot) {
  const challenge = snapshot?.challenge ?? {};
  const active = challenge.active ?? {};
  return canonical({
    presetId: active.presetId ?? null,
    terrainAsset: active.terrainAsset ? {
      repoPath: active.terrainAsset.repoPath ?? null,
      packagePath: active.terrainAsset.packagePath ?? null,
      sha256: active.terrainAsset.sha256 ?? null
    } : null,
    terrainTransform: active.terrainTransform ?? null,
    entry: challenge.entry ?? null,
    exit: challenge.exit ?? null,
    trainRoute: challenge.trainRoute ?? null,
    bridgeTransform: challenge.bridgeTransform ?? null,
    bridgeChallenge: challenge.bridgeChallenge ?? null,
    collisionProxy: challenge.collisionProxy ?? null
  });
}

export function sameChallengeCalibration(left, right) {
  return JSON.stringify(challengeCalibrationFingerprint(left)) === JSON.stringify(challengeCalibrationFingerprint(right));
}
