'use strict';

import {
  add, bodyAxes, clamp, conjugateQuaternion, cross, dot, length, multiply,
  multiplyQuaternions, normaliseQuaternion, orientedBoxOverlap,
  rotateVector, subtract, vector
} from './math.js';
import { machinePointToRouteLocal } from './route-frame.js';

// Numerical limits, not hidden train/terrain geometry overrides. A caller must
// subdivide recorded motion in time before invoking the existing island solver.
export const TCP_CONTACT_LIMITS = Object.freeze({
  maximumStepSeconds: 1 / 120,
  maximumTravelMm: 1,
  maximumResidualPenetrationMm: 0.25,
  maximumBacklogSeconds: 1,
  maximumQueuedIntervals: 512,
  maximumQueuedSubsteps: 2048,
  maximumSubstepsPerTick: 32,
  timeEpsilonSeconds: 1e-9,
  travelEpsilonMm: 1e-7
});

export function contactError(code, message, details = null) {
  return Object.assign(new Error(message), { code, details });
}

function rotationAngle(first, second) {
  const delta = multiplyQuaternions(normaliseQuaternion(second), conjugateQuaternion(normaliseQuaternion(first)));
  // atan2 avoids acos(dot(q,q)) reporting a spurious ~1e-8 rad rotation
  // between identical frames because of quaternion roundoff.
  return 2 * Math.atan2(Math.hypot(delta.x, delta.y, delta.z), Math.abs(delta.w));
}

export function kinematicTravelMm(first, second) {
  return length(subtract(second.position, first.position))
    + rotationAngle(first.rotation, second.rotation) * length(second.size) * 0.5;
}

export function kinematicStepTravelLimitMm(bodies, collider) {
  return Math.min(TCP_CONTACT_LIMITS.maximumTravelMm,
    ...[collider, ...bodies].flatMap(body => Object.values(body.size).map(value => value * 0.25)));
}

function validVector(value) {
  return value && ['x', 'y', 'z'].every((axis) => Number.isFinite(value[axis]));
}

export function tcpPoseToRouteCollider(frame, sample, size) {
  const position = sample?.positionMm;
  const rotation = sample?.rotationQuaternion;
  if ((sample?.frame !== undefined && sample.frame !== 'main-demo-machine-mm')
    || !position || !['xMm', 'yMm', 'zMm'].every((axis) => Number.isFinite(position[axis]))
    || !rotation || !['x', 'y', 'z', 'w'].every((axis) => Number.isFinite(rotation[axis]))
    || Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w) < 1e-9
    || !validVector(size) || Object.values(size).some((value) => value <= 0)) {
    throw new TypeError('A finite authoritative TCP pose and positive collider size are required.');
  }
  return {
    id: 'robot-tcp-pusher',
    position: machinePointToRouteLocal(frame, position),
    rotation: multiplyQuaternions(conjugateQuaternion(frame.routeQuaternion), rotation),
    size: { ...size },
    worldRevision: sample.worldRevision ?? null,
    robotRevision: sample.robotRevision ?? null,
    sampleTimeSeconds: sample.sampleTimeSeconds ?? null,
    sequence: sample.sequence ?? null
  };
}

export function interpolateCollider(first, second, fraction) {
  const alpha = clamp(fraction, 0, 1);
  const cosine = dot(first.rotation, second.rotation) + first.rotation.w * second.rotation.w;
  const sign = cosine < 0 ? -1 : 1;
  const angle = Math.acos(clamp(Math.abs(cosine), 0, 1));
  const sine = Math.sin(angle);
  const firstWeight = sine > 1e-7 ? Math.sin((1 - alpha) * angle) / sine : 1 - alpha;
  const secondWeight = sine > 1e-7 ? Math.sin(alpha * angle) / sine : alpha;
  return {
    ...second,
    size: { ...second.size },
    position: add(first.position, multiply(subtract(second.position, first.position), alpha)),
    rotation: normaliseQuaternion(Object.fromEntries(['x', 'y', 'z', 'w'].map((axis) => [
      axis, first.rotation[axis] * firstWeight + sign * second.rotation[axis] * secondWeight
    ])))
  };
}

export function measuredKinematicCollider(previous, current, dt, options = {}) {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('A positive measured TCP interval is required.');
  const before = previous || current;
  const linearVelocity = multiply(subtract(current.position, before.position), 1 / dt);
  const angle = rotationAngle(before.rotation, current.rotation);
  if (length(linearVelocity) > (options.maximumLinearSpeedMmPerSecond ?? 2000) + 1e-6
    || angle / dt > (options.maximumAngularSpeedRadPerSecond ?? 8) + 1e-6) {
    throw new RangeError('TCP sample discontinuity exceeds the bounded contact sweep.');
  }
  let delta = multiplyQuaternions(current.rotation, conjugateQuaternion(before.rotation));
  if (delta.w < 0) delta = Object.fromEntries(Object.entries(delta).map(([key, value]) => [key, -value]));
  const sine = Math.hypot(delta.x, delta.y, delta.z);
  const angularVelocity = sine > 1e-9 ? multiply(delta, angle / (sine * dt)) : vector();
  return {
    ...current,
    previousPosition: { ...before.position },
    previousRotation: { ...before.rotation },
    linearVelocity,
    angularVelocity,
    intervalSeconds: dt
  };
}

// A bounded history of observations, not a second pusher authority. Only the
// caller's physics loop consumes it. Reads and producer callbacks never step a
// body. An in-flight move must wait for its next measured endpoint: inserting a
// stationary UI observation there would shorten the next velocity interval.
export function createKinematicContactTimeline({ bodies, initial, observedTimeSeconds }) {
  const epsilon = TCP_CONTACT_LIMITS.timeEpsilonSeconds;
  if (!(Number.isFinite(observedTimeSeconds) && observedTimeSeconds + epsilon >= initial.sampleTimeSeconds)) {
    throw contactError('INVALID_TCP_SAMPLE', 'A measured clock observation is required to arm TCP contact.');
  }
  const startTimeSeconds = Math.max(observedTimeSeconds, initial.sampleTimeSeconds);
  let integratedTimeSeconds = startTimeSeconds;
  let latestObservationTimeSeconds = startTimeSeconds;
  let latestSource = initial;
  let tail = { collider: initial, timeSeconds: startTimeSeconds };
  let receivedSampleCount = 0, consumedSampleCount = 0;
  const intervals = [];

  function samePose(first, second) {
    return length(subtract(first.position, second.position)) <= 1e-8
      && rotationAngle(first.rotation, second.rotation) <= 1e-8;
  }

  function checkLag(timeSeconds) {
    if (timeSeconds - integratedTimeSeconds > TCP_CONTACT_LIMITS.maximumBacklogSeconds + epsilon) {
      throw contactError('TCP_SAMPLE_BACKLOG', 'Unconsumed TCP time exceeds the bounded contact backlog.', {
        lagSeconds: timeSeconds - integratedTimeSeconds,
        maximumBacklogSeconds: TCP_CONTACT_LIMITS.maximumBacklogSeconds
      });
    }
  }

  function estimatedSubsteps(interval, fromTime = interval.startTimeSeconds) {
    const remaining = Math.max(0, interval.endTimeSeconds - fromTime);
    return Math.ceil(Math.max(remaining / TCP_CONTACT_LIMITS.maximumStepSeconds,
      interval.travelMm * remaining / interval.durationSeconds / interval.travelLimitMm) - 1e-8);
  }

  function append(collider, timeSeconds, kind) {
    if (!Number.isFinite(timeSeconds) || timeSeconds < tail.timeSeconds - epsilon) {
      throw contactError('INVALID_TCP_SAMPLE', 'A TCP endpoint predates an already observed interval.');
    }
    const durationSeconds = timeSeconds - tail.timeSeconds;
    if (durationSeconds <= epsilon) {
      if (!samePose(tail.collider, collider)) throw contactError('INVALID_TCP_SAMPLE', 'TCP movement has no resolvable measured duration.');
      if (kind === 'motion') {
        if (intervals.length) intervals.at(-1).sourceCount += 1;
        else consumedSampleCount += 1;
      }
      return;
    }
    checkLag(timeSeconds);
    // Validate the entire recorded interval before accepting any of its time.
    measuredKinematicCollider(tail.collider, collider, durationSeconds);
    const interval = {
      first: tail.collider, second: collider,
      startTimeSeconds: tail.timeSeconds, endTimeSeconds: timeSeconds, durationSeconds,
      travelMm: kinematicTravelMm(tail.collider, collider),
      travelLimitMm: kinematicStepTravelLimitMm(bodies, collider), kind,
      sourceCount: kind === 'motion' ? 1 : 0
    };
    const prior = intervals.at(-1);
    const mergeHold = kind === 'hold' && prior?.kind === 'hold' && samePose(prior.second, collider);
    const work = intervals.reduce((sum, item, index) => sum
      + estimatedSubsteps(item, index === 0 ? integratedTimeSeconds : item.startTimeSeconds), 0)
      + estimatedSubsteps(interval);
    if ((!mergeHold && intervals.length >= TCP_CONTACT_LIMITS.maximumQueuedIntervals)
      || work > TCP_CONTACT_LIMITS.maximumQueuedSubsteps) {
      throw contactError('TCP_SAMPLE_BACKLOG', 'TCP sample history exceeds its bounded contact work budget.', {
        queuedIntervals: intervals.length, estimatedSubsteps: work
      });
    }
    if (mergeHold) {
      prior.second = collider;
      prior.endTimeSeconds = timeSeconds;
      prior.durationSeconds = prior.endTimeSeconds - prior.startTimeSeconds;
    } else intervals.push(interval);
    tail = { collider, timeSeconds };
  }

  function recordSource(collider) {
    if (!Number.isSafeInteger(collider.sequence) || collider.sequence < 0
      || !Number.isFinite(collider.sampleTimeSeconds) || collider.sampleTimeSeconds < 0) {
      throw contactError('INVALID_TCP_SAMPLE', 'TCP source sequence and time must be finite and monotonic.');
    }
    if (collider.sequence === latestSource.sequence) {
      if (collider.sampleTimeSeconds !== latestSource.sampleTimeSeconds || !samePose(collider, latestSource)) {
        throw contactError('INVALID_TCP_SAMPLE', 'A TCP pose changed without a new timestamped source sample.');
      }
      return false;
    }
    if (collider.sequence !== latestSource.sequence + 1 || collider.sampleTimeSeconds <= latestSource.sampleTimeSeconds) {
      throw contactError('INVALID_TCP_SAMPLE', 'TCP source samples were lost, replayed, or reordered.');
    }
    append(collider, collider.sampleTimeSeconds, 'motion');
    latestSource = collider;
    latestObservationTimeSeconds = Math.max(latestObservationTimeSeconds, collider.sampleTimeSeconds);
    receivedSampleCount += 1;
    return true;
  }

  function observe({ collider, observedTimeSeconds: observed, moving }) {
    if (!Number.isFinite(observed) || observed < latestObservationTimeSeconds - epsilon
      || observed + epsilon < collider.sampleTimeSeconds || typeof moving !== 'boolean') {
      throw contactError('INVALID_TCP_SAMPLE', 'A monotonic TCP observation time and actual moving state are required.');
    }
    recordSource(collider);
    checkLag(observed);
    if (!moving) append(collider, Math.max(observed, collider.sampleTimeSeconds), 'hold');
    latestObservationTimeSeconds = Math.max(observed, latestObservationTimeSeconds);
  }

  function nextSlice(maximumSeconds) {
    const interval = intervals[0];
    if (!interval || !(maximumSeconds > 0)) return null;
    const first = interpolateCollider(interval.first, interval.second,
      (integratedTimeSeconds - interval.startTimeSeconds) / interval.durationSeconds);
    const remainingSeconds = interval.endTimeSeconds - integratedTimeSeconds;
    const maximumMotionSeconds = interval.travelMm > 0
      ? interval.travelLimitMm * interval.durationSeconds / interval.travelMm : Infinity;
    let durationSeconds = Math.min(maximumSeconds, TCP_CONTACT_LIMITS.maximumStepSeconds,
      maximumMotionSeconds, remainingSeconds);
    // Avoid a near-zero PBD remainder without relaxing the island's motion
    // bounds. If the endpoint exceeds a hard bound, solve two shorter slices.
    if (remainingSeconds - durationSeconds <= epsilon) {
      const endpointWithinBounds = remainingSeconds <= TCP_CONTACT_LIMITS.maximumStepSeconds + epsilon
        && kinematicTravelMm(first, interval.second) <= interval.travelLimitMm + TCP_CONTACT_LIMITS.travelEpsilonMm;
      durationSeconds = endpointWithinBounds ? remainingSeconds : Math.min(durationSeconds, remainingSeconds / 2);
    }
    const endTimeSeconds = integratedTimeSeconds + durationSeconds;
    const second = interpolateCollider(interval.first, interval.second,
      (endTimeSeconds - interval.startTimeSeconds) / interval.durationSeconds);
    const collider = measuredKinematicCollider(first, second, durationSeconds);
    return {
      startTimeSeconds: integratedTimeSeconds, endTimeSeconds, durationSeconds,
      collider: { ...collider, integrationTimeSeconds: endTimeSeconds,
        sourceIntervalStartTimeSeconds: interval.startTimeSeconds,
        sourceIntervalEndTimeSeconds: interval.endTimeSeconds,
        interpolated: endTimeSeconds < interval.endTimeSeconds - epsilon }
    };
  }

  function commit(slice) {
    if (!intervals.length || slice.startTimeSeconds !== integratedTimeSeconds) {
      throw contactError('TCP_CONTACT_TIME_MISMATCH', 'A TCP interval cannot be consumed twice.');
    }
    integratedTimeSeconds = slice.endTimeSeconds;
    if (intervals[0].endTimeSeconds - integratedTimeSeconds <= epsilon) {
      integratedTimeSeconds = intervals[0].endTimeSeconds;
      consumedSampleCount += intervals.shift().sourceCount;
    }
  }

  function getSnapshot() {
    return {
      clock: 'authoritative-tcp-monotonic', startTimeSeconds, integratedTimeSeconds,
      integratedSeconds: integratedTimeSeconds - startTimeSeconds,
      latestSampleTimeSeconds: latestSource.sampleTimeSeconds,
      latestObservationTimeSeconds,
      availableSeconds: Math.max(0, tail.timeSeconds - integratedTimeSeconds),
      lagSeconds: Math.max(0, latestObservationTimeSeconds - integratedTimeSeconds),
      waitingForEndpointSeconds: Math.max(0, latestObservationTimeSeconds - tail.timeSeconds),
      queuedIntervals: intervals.length, receivedSampleCount, consumedSampleCount,
      maximumBacklogSeconds: TCP_CONTACT_LIMITS.maximumBacklogSeconds,
      maximumQueuedIntervals: TCP_CONTACT_LIMITS.maximumQueuedIntervals,
      maximumQueuedSubsteps: TCP_CONTACT_LIMITS.maximumQueuedSubsteps,
      droppedSeconds: 0
    };
  }

  return Object.freeze({ recordSource, observe, nextSlice, commit, getSnapshot });
}

export function boxRadiusAlong(body, axis) {
  const axes = bodyAxes(body);
  return Math.abs(dot(axes[0], axis)) * body.size.x * 0.5
    + Math.abs(dot(axes[1], axis)) * body.size.y * 0.5
    + Math.abs(dot(axes[2], axis)) * body.size.z * 0.5;
}

// This is a contact query only. The caller's existing physics instance owns all
// Train corrections; the measured, infinite-mass TCP is never moved by contact.
export function queryKinematicContact(body, collider, { maximumSweepSamples = 32, marginMm = 0.025 } = {}) {
  if (!collider) return null;
  const before = { ...collider, position: collider.previousPosition, rotation: collider.previousRotation };
  const distance = length(subtract(collider.position, before.position));
  const angularDistance = rotationAngle(before.rotation, collider.rotation) * length(collider.size) * 0.5;
  const stride = Math.max(0.25, Math.min(...Object.values(collider.size), ...Object.values(body.size)) * 0.25);
  const count = Math.max(1, Math.ceil((distance + angularDistance) / stride));
  if (count > maximumSweepSamples) throw new RangeError('TCP sweep exceeds its bounded contact sample budget.');
  let hit = null;
  for (let index = 0; index <= count; index += 1) {
    const proxy = interpolateCollider(before, collider, index / count);
    const expanded = { ...proxy, size: Object.fromEntries(Object.entries(proxy.size).map(([axis, value]) => [axis, value + marginMm * 2])) };
    const overlap = orientedBoxOverlap(expanded, body);
    if (overlap.overlap) { hit = { normal: overlap.axis, sweepFraction: index / count }; break; }
  }
  if (!hit) return null;
  const normal = hit.normal;
  const pusherRadius = boxRadiusAlong(collider, normal);
  const bodyRadius = boxRadiusAlong(body, normal);
  const separationMm = dot(subtract(body.position, collider.position), normal) - pusherRadius - bodyRadius;
  if (separationMm > marginMm) return null;
  const point = subtract(body.position, multiply(normal, bodyRadius));
  return {
    bodyId: body.id,
    point,
    normal,
    penetrationMm: Math.max(0, -separationMm),
    surfaceVelocity: add(collider.linearVelocity, cross(collider.angularVelocity, subtract(point, collider.position))),
    sweepFraction: hit.sweepFraction,
    kind: 'tcp-pusher-contact',
    sourceId: collider.id
  };
}

export function inverseBoxInertia(body, worldVector) {
  const local = rotateVector(conjugateQuaternion(body.rotation), worldVector);
  const size = body.size;
  const factor = 12 * body.inverseMass;
  return rotateVector(body.rotation, {
    x: local.x * factor / (size.y ** 2 + size.z ** 2),
    y: local.y * factor / (size.x ** 2 + size.z ** 2),
    z: local.z * factor / (size.x ** 2 + size.y ** 2)
  });
}

export function applyContactVelocity(body, contact) {
  const arm = subtract(contact.point, body.position);
  const relative = subtract(add(body.linearVelocity, cross(body.angularVelocity, arm)), contact.surfaceVelocity || vector());
  const closing = dot(relative, contact.normal);
  if (closing >= -1e-8) return 0;
  const angularTerm = inverseBoxInertia(body, cross(arm, contact.normal));
  const effectiveInverseMass = body.inverseMass + dot(contact.normal, cross(angularTerm, arm));
  if (!(effectiveInverseMass > 0)) return 0;
  const impulseMagnitude = -closing / effectiveInverseMass;
  const impulse = multiply(contact.normal, impulseMagnitude);
  body.linearVelocity = add(body.linearVelocity, multiply(impulse, body.inverseMass));
  body.angularVelocity = add(body.angularVelocity, inverseBoxInertia(body, cross(arm, impulse)));
  return impulseMagnitude;
}
