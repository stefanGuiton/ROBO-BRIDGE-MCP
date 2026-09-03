'use strict';

import {
  add, bodyAxes, clamp, conjugateQuaternion, cross, dot, length, multiply,
  multiplyQuaternions, normaliseQuaternion, orientedBoxOverlap, quaternionAngularError,
  rotateVector, subtract, vector
} from './math.js';
import { machinePointToRouteLocal } from './route-frame.js';

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
  const sign = dot(first.rotation, second.rotation) + first.rotation.w * second.rotation.w < 0 ? -1 : 1;
  return {
    ...second,
    size: { ...second.size },
    position: add(first.position, multiply(subtract(second.position, first.position), alpha)),
    rotation: normaliseQuaternion(Object.fromEntries(['x', 'y', 'z', 'w'].map((axis) => [
      axis, first.rotation[axis] * (1 - alpha) + sign * second.rotation[axis] * alpha
    ])))
  };
}

export function measuredKinematicCollider(previous, current, dt, options = {}) {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('A positive measured TCP interval is required.');
  const before = previous || current;
  const linearVelocity = multiply(subtract(current.position, before.position), 1 / dt);
  const angle = quaternionAngularError(before.rotation, current.rotation);
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
  const angularDistance = quaternionAngularError(before.rotation, collider.rotation) * length(collider.size) * 0.5;
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
