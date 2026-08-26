import { inverseKinematics } from './scara.js';

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpWaypoint(a, b, t) {
  return {
    xMm: lerp(a.xMm, b.xMm, t),
    yMm: lerp(a.yMm, b.yMm, t),
    zMm: lerp(a.zMm, b.zMm, t),
    gripperOpenFraction: b.gripperOpenFraction ?? a.gripperOpenFraction,
    objectId: b.objectId ?? a.objectId ?? null,
    phase: b.phase ?? a.phase ?? 'move'
  };
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
  return [
    { ...start, phase: 'start', gripperOpenFraction: 1 },
    { xMm: object.position.xMm, yMm: object.position.yMm, zMm: safeZ, phase: 'approach_above', gripperOpenFraction: 1, objectId: object.id },
    { xMm: object.position.xMm, yMm: object.position.yMm, zMm: graspZ, phase: 'approach_grasp', gripperOpenFraction: 1, objectId: object.id },
    { xMm: object.position.xMm, yMm: object.position.yMm, zMm: graspZ, phase: 'close_gripper', gripperOpenFraction: 0, objectId: object.id },
    { xMm: object.position.xMm, yMm: object.position.yMm, zMm: safeZ, phase: 'lift', gripperOpenFraction: 0, objectId: object.id },
    { xMm: destination.position.xMm, yMm: destination.position.yMm, zMm: safeZ, phase: 'transfer', gripperOpenFraction: 0, objectId: object.id },
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
  const sampled = [];
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const start = waypoints[index];
    const end = waypoints[index + 1];
    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment;
      sampled.push(lerpWaypoint(start, end, t));
    }
  }
  sampled.push({ ...waypoints[waypoints.length - 1] });
  return sampled;
}
