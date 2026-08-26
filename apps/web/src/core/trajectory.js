import { inverseKinematics } from './scara.js';

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpWaypoint(a, b, t) {
  const openA = a.gripperOpenFraction ?? 1;
  const openB = b.gripperOpenFraction ?? openA;
  return {
    xMm: lerp(a.xMm, b.xMm, t),
    yMm: lerp(a.yMm, b.yMm, t),
    zMm: lerp(a.zMm, b.zMm, t),
    gripperOpenFraction: lerp(openA, openB, t),
    objectId: b.objectId ?? a.objectId ?? null,
    phase: t >= 1 ? (b.phase ?? 'move') : (a.phase ?? 'move')
  };
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function makeRadialTransferWaypoints({
  from,
  to,
  zMm,
  objectId = null,
  gripperOpenFraction = 0,
  minTransferRadiusMm = 360,
  maxAngleStepDeg = 22.5
}) {
  const fromAngle = Math.atan2(from.yMm, from.xMm);
  const toAngle = Math.atan2(to.yMm, to.xMm);
  const transferRadiusMm = Math.max(
    minTransferRadiusMm,
    Math.hypot(from.xMm, from.yMm),
    Math.hypot(to.xMm, to.yMm)
  );
  const delta = shortestAngleDelta(fromAngle, toAngle);
  const angleStep = Math.max(1, Number(maxAngleStepDeg)) * Math.PI / 180;
  const arcSegments = Math.max(1, Math.ceil(Math.abs(delta) / angleStep));
  const common = { zMm, gripperOpenFraction, objectId };
  const points = [
    {
      xMm: transferRadiusMm * Math.cos(fromAngle),
      yMm: transferRadiusMm * Math.sin(fromAngle),
      ...common,
      phase: 'transfer_depart'
    }
  ];

  for (let index = 1; index < arcSegments; index += 1) {
    const angle = fromAngle + delta * index / arcSegments;
    points.push({
      xMm: transferRadiusMm * Math.cos(angle),
      yMm: transferRadiusMm * Math.sin(angle),
      ...common,
      phase: 'transfer_via'
    });
  }

  points.push({ xMm: to.xMm, yMm: to.yMm, ...common, phase: 'transfer' });
  return points;
}

export function makePickAndPlaceWaypoints({
  start,
  object,
  destination,
  clearanceMm = 120,
  graspZOffsetMm = 24,
  placeZOffsetMm = 34
}) {
  const safeZ = Math.max(start.zMm, object.position.zMm + clearanceMm, destination.position.zMm + clearanceMm);
  const graspZ = object.position.zMm + graspZOffsetMm;
  const placeZ = destination.position.zMm + placeZOffsetMm;
  const transfer = makeRadialTransferWaypoints({
    from: object.position,
    to: destination.position,
    zMm: safeZ,
    objectId: object.id,
    gripperOpenFraction: 0
  });
  return [
    { ...start, phase: 'start', gripperOpenFraction: 1 },
    { xMm: object.position.xMm, yMm: object.position.yMm, zMm: safeZ, phase: 'approach_above', gripperOpenFraction: 1, objectId: object.id },
    { xMm: object.position.xMm, yMm: object.position.yMm, zMm: graspZ, phase: 'approach_grasp', gripperOpenFraction: 1, objectId: object.id },
    { xMm: object.position.xMm, yMm: object.position.yMm, zMm: graspZ, phase: 'close_gripper', gripperOpenFraction: 0, objectId: object.id },
    { xMm: object.position.xMm, yMm: object.position.yMm, zMm: safeZ, phase: 'lift', gripperOpenFraction: 0, objectId: object.id },
    ...transfer,
    { xMm: destination.position.xMm, yMm: destination.position.yMm, zMm: placeZ, phase: 'lower', gripperOpenFraction: 0, objectId: object.id },
    { xMm: destination.position.xMm, yMm: destination.position.yMm, zMm: placeZ, phase: 'release', gripperOpenFraction: 1, objectId: object.id },
    { xMm: destination.position.xMm, yMm: destination.position.yMm, zMm: safeZ, phase: 'retreat', gripperOpenFraction: 1 }
  ];
}

export function validateCartesianWaypoints(waypoints, initialJoints, config) {
  let previous = initialJoints;
  const results = [];
  for (let index = 0; index < waypoints.length; index += 1) {
    const waypoint = waypoints[index];
    const result = inverseKinematics(waypoint, previous, config);
    if (!result.ok) {
      results.push({ ok: false, index, waypoint: { ...waypoint }, reason: result.reason, diagnostics: result.diagnostics ?? {} });
      return { ok: false, results, rejectedIndex: index, reason: result.reason };
    }
    previous = result.joints;
    results.push({ ok: true, index, waypoint: { ...waypoint }, joints: { ...result.joints }, diagnostics: result.diagnostics });
  }
  return { ok: true, results };
}

export function sampleWaypoints(waypoints, samplesPerSegment = 24) {
  if (waypoints.length < 2) return waypoints.map((point) => ({ ...point }));
  const sampled = [{ ...waypoints[0] }];
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const start = waypoints[index];
    const end = waypoints[index + 1];
    for (let sample = 1; sample <= samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment;
      sampled.push(lerpWaypoint(start, end, t));
    }
  }
  return sampled;
}
