'use strict';

import { DEFAULT_TRAIN_PHYSICS_SETTINGS } from './constants.js';
import {
  add,
  clamp,
  cloneValue,
  dot,
  identityQuaternion,
  integrateQuaternion,
  length,
  multiply,
  normalise,
  orientedBoxOverlap,
  quaternionAngularError,
  rotateVector,
  subtract,
  vector,
  bodyAxes
} from './math.js';
import { createGridCollisionSystem } from './train-grid-collision.js';
import { createPerformanceRecorder } from './performance-recorder.js';
import {
  applyContactVelocity,
  boxRadiusAlong,
  contactError,
  kinematicStepTravelLimitMm,
  kinematicTravelMm,
  queryKinematicContact,
  TCP_CONTACT_LIMITS
} from './train-kinematic-contact.js';

const now = () => performance.now();

function dynamicBody(source, velocity, angularVelocity, mass) {
  return {
    id: source.id,
    label: source.label,
    role: source.role,
    colourIndex: source.colourIndex,
    size: { ...source.size },
    position: { ...source.position },
    rotation: { ...(source.rotation || identityQuaternion()) },
    linearVelocity: { ...velocity },
    angularVelocity: { ...angularVelocity },
    mass,
    inverseMass: mass > 0 ? 1 / mass : 0,
    contacts: 0,
    resting: false,
    collisionKind: 'none',
    contactNormal: { x: 0, y: 1, z: 0 },
    previousPosition: { ...source.position },
    previousRotation: { ...(source.rotation || identityQuaternion()) },
    railContact: false,
    groundContact: false,
    railSupport: null,
    velocityContacts: [],
    kinematicCorrection: vector()
  };
}

function worldAnchor(body, localAnchor) {
  return add(body.position, rotateVector(body.rotation, localAnchor));
}

function projectedRadius(body, axis) {
  const axes = bodyAxes(body);
  return Math.abs(dot(axes[0], axis)) * body.size.x * 0.5
    + Math.abs(dot(axes[1], axis)) * body.size.y * 0.5
    + Math.abs(dot(axes[2], axis)) * body.size.z * 0.5;
}

function closestSegmentPoints(p1, q1, p2, q2) {
  const d1 = subtract(q1, p1);
  const d2 = subtract(q2, p2);
  const r = subtract(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) return { first: p1, second: p2 };
  if (a <= 1e-12) {
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denominator = a * e - b * b;
      if (Math.abs(denominator) > 1e-12) s = clamp((b * f - c * e) / denominator, 0, 1);
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return { first: add(p1, multiply(d1, s)), second: add(p2, multiply(d2, t)) };
}

function capsuleForBody(body) {
  const axis = normalise(rotateVector(body.rotation, { x: 1, y: 0, z: 0 }));
  const radius = Math.max(body.size.y, body.size.z) * 0.5;
  const halfSegment = Math.max(0, body.size.x * 0.5 - radius);
  return {
    axis,
    radius,
    start: add(body.position, multiply(axis, -halfSegment)),
    end: add(body.position, multiply(axis, halfSegment))
  };
}

function neighbourCapsuleOverlap(bodyA, bodyB) {
  const first = capsuleForBody(bodyA);
  const second = capsuleForBody(bodyB);
  const closest = closestSegmentPoints(first.start, first.end, second.start, second.end);
  const delta = subtract(closest.second, closest.first);
  const distanceMm = length(delta);
  const requiredMm = first.radius + second.radius;
  const fallback = normalise(subtract(bodyB.position, bodyA.position), { x: -1, y: 0, z: 0 });
  return {
    overlap: distanceMm < requiredMm,
    depthMm: Math.max(0, requiredMm - distanceMm),
    axis: distanceMm > 1e-8 ? multiply(delta, 1 / distanceMm) : fallback,
    separationMm: distanceMm - requiredMm,
    closestDistanceMm: distanceMm
  };
}

function pairDiagnostic(bodyA, bodyB, neighbour, exactBoxes = false) {
  const delta = subtract(bodyB.position, bodyA.position);
  const centreDistanceMm = length(delta);
  const overlap = neighbour && !exactBoxes ? neighbourCapsuleOverlap(bodyA, bodyB) : orientedBoxOverlap(bodyA, bodyB);
  const axis = normalise(delta, { x: -1, y: 0, z: 0 });
  const projectedSeparationMm = neighbour && !exactBoxes
    ? overlap.separationMm
    : centreDistanceMm - projectedRadius(bodyA, axis) - projectedRadius(bodyB, axis);
  return {
    id: `${bodyA.id}-${bodyB.id}`,
    bodyA: bodyA.id,
    bodyB: bodyB.id,
    neighbour,
    collisionMode: exactBoxes ? 'contact-mode-obb-non-penetration' : neighbour ? 'coupler-owned-capsule-non-penetration' : 'inelastic-non-neighbour',
    centreDistanceMm,
    projectedSeparationMm,
    overlap: overlap.overlap,
    overlapDepthMm: overlap.overlap ? overlap.depthMm : 0
  };
}

function surfaceSample(provider, forwardMm, rightMm, query = {}) {
  if (typeof provider === 'function') {
    const value = provider({ forwardMm, rightMm, ...query });
    if (query.noFallback && (value === null || value === undefined || value?.supported === false)) {
      return { heightMm: -Infinity, normal: { x: 0, y: 1, z: 0 }, kind: 'none' };
    }
    if (Number.isFinite(value)) return { heightMm: value, normal: { x: 0, y: 1, z: 0 }, kind: 'terrain' };
    if (value && Number.isFinite(value.heightMm)) return {
      heightMm: value.heightMm,
      normal: normalise(value.normal || { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }),
      kind: value.kind || 'terrain'
    };
  }
  if (provider?.sample) return surfaceSample(provider.sample.bind(provider), forwardMm, rightMm, query);
  if (provider?.heightAt) return surfaceSample(provider.heightAt.bind(provider), forwardMm, rightMm, query);
  if (query.noFallback) return { heightMm: -Infinity, normal: { x: 0, y: 1, z: 0 }, kind: 'none' };
  return { heightMm: -300, normal: { x: 0, y: 1, z: 0 }, kind: 'fallback-floor' };
}

export function createTrainPhysics(options = {}) {
  const configuration = { ...DEFAULT_TRAIN_PHYSICS_SETTINGS, ...options };
  const contactConfiguration = {
    rollingDampingPerSecond: 0.025,
    settleLinearSpeedMmPerSecond: 0.1,
    contactMarginMm: 0.025,
    maximumRailGuideCorrectionMm: 0.2,
    ...options.contactSettings
  };
  let bodies = [];
  let joints = [];
  let collisionSnapshot = null;
  let gridCollider = null;
  let steps = 0;
  let maximumAnchorErrorMm = 0;
  let currentMaximumAnchorErrorMm = 0;
  let maximumBodyOverlapDepthMm = 0;
  let currentMaximumBodyOverlapDepthMm = 0;
  let minimumPairSeparationMm = Infinity;
  let bodyContactCorrectionCount = 0;
  let neighbourImpactFilterCount = 0;
  let maximumSingleBodyCorrectionMm = 0;
  let lastPairDiagnostics = [];
  let contactModeActive = false;
  let contactTelemetry;
  function resetContactTelemetry() {
    contactTelemetry = {
      contactCount: 0, impulseCount: 0, impulseMagnitudeTotal: 0,
      maximumPenetrationMm: 0, measuredPusherSpeedMmPerSecond: 0,
      maximumResidualPusherPenetrationMm: 0, maximumResidualSolidPenetrationMm: 0,
      lastContact: null, solidCollisionCount: 0, lastSolidContact: null
    };
  }
  resetContactTelemetry();
  const recorder = createPerformanceRecorder({
    channels: [
      'stepTotalMs', 'integrateMs', 'bridgeCollisionMs', 'terrainCollisionMs',
      'couplerAndBodyMs', 'postCollisionMs', 'velocityConstraintMs', 'settleCheckMs',
      'couplerAnchorErrorMm', 'bodyOverlapDepthMm', 'bodyContactCorrectionMm'
    ]
  });

  function setCollisionSnapshot(nextSnapshot) {
    collisionSnapshot = nextSnapshot || null;
    gridCollider = collisionSnapshot ? createGridCollisionSystem(collisionSnapshot, {
      restitution: configuration.bridgeRestitution,
      frictionPerSecond: configuration.groundFrictionPerSecond
    }) : null;
    return Boolean(gridCollider);
  }

  function makeJoint(leadIndex, trailingIndex) {
    const lead = bodies[leadIndex];
    const trailing = bodies[trailingIndex];
    const leadLocalAnchor = { x: -lead.size.x * 0.5, y: 0, z: 0 };
    const trailingLocalAnchor = { x: trailing.size.x * 0.5, y: 0, z: 0 };
    const leadAnchor = worldAnchor(lead, leadLocalAnchor);
    const trailingAnchor = worldAnchor(trailing, trailingLocalAnchor);
    return {
      id: `${lead.id}-${trailing.id}`,
      leadIndex,
      trailingIndex,
      leadLocalAnchor,
      trailingLocalAnchor,
      restLengthMm: length(subtract(trailingAnchor, leadAnchor)),
      anchorDistanceMm: 0,
      anchorErrorMm: 0,
      correctionMm: 0
    };
  }

  function solveJointPosition(joint, stiffness = configuration.couplerStiffness) {
    const lead = bodies[joint.leadIndex];
    const trailing = bodies[joint.trailingIndex];
    const leadAnchor = worldAnchor(lead, joint.leadLocalAnchor);
    const trailingAnchor = worldAnchor(trailing, joint.trailingLocalAnchor);
    const delta = subtract(trailingAnchor, leadAnchor);
    const distanceMm = length(delta);
    if (distanceMm < 1e-9) return 0;
    const direction = multiply(delta, 1 / distanceMm);
    const errorMm = distanceMm - joint.restLengthMm;
    const inverseMass = lead.inverseMass + trailing.inverseMass;
    if (inverseMass <= 0) return 0;
    const correctionMm = clamp(
      errorMm * stiffness,
      -configuration.couplerMaximumCorrectionMm,
      configuration.couplerMaximumCorrectionMm
    );
    const leadCorrection = multiply(direction, correctionMm * lead.inverseMass / inverseMass);
    const trailingCorrection = multiply(direction, -correctionMm * trailing.inverseMass / inverseMass);
    lead.position = add(lead.position, leadCorrection);
    trailing.position = add(trailing.position, trailingCorrection);
    joint.correctionMm += Math.abs(correctionMm);
    maximumSingleBodyCorrectionMm = Math.max(maximumSingleBodyCorrectionMm, Math.abs(correctionMm));
    return Math.abs(correctionMm);
  }

  function dampJointVelocity(joint) {
    const lead = bodies[joint.leadIndex];
    const trailing = bodies[joint.trailingIndex];
    const direction = normalise(subtract(
      worldAnchor(trailing, joint.trailingLocalAnchor),
      worldAnchor(lead, joint.leadLocalAnchor)
    ), { x: -1, y: 0, z: 0 });
    const relative = dot(subtract(trailing.linearVelocity, lead.linearVelocity), direction);
    const inverseMass = lead.inverseMass + trailing.inverseMass;
    if (inverseMass <= 0) return;
    const impulse = relative * configuration.couplerVelocityDamping / inverseMass;
    lead.linearVelocity = add(lead.linearVelocity, multiply(direction, impulse * lead.inverseMass));
    trailing.linearVelocity = add(trailing.linearVelocity, multiply(direction, -impulse * trailing.inverseMass));
  }

  function solveBodyPair(bodyA, bodyB, neighbour) {
    const overlap = neighbour && !contactModeActive ? neighbourCapsuleOverlap(bodyA, bodyB) : orientedBoxOverlap(bodyA, bodyB);
    currentMaximumBodyOverlapDepthMm = Math.max(currentMaximumBodyOverlapDepthMm, overlap.overlap ? overlap.depthMm : 0);
    maximumBodyOverlapDepthMm = Math.max(maximumBodyOverlapDepthMm, overlap.overlap ? overlap.depthMm : 0);
    if (!overlap.overlap || overlap.depthMm <= configuration.bodyContactSlopMm) return 0;
    const inverseMass = bodyA.inverseMass + bodyB.inverseMass;
    if (inverseMass <= 0) return 0;
    const correctionMm = Math.min(
      configuration.bodyContactMaximumCorrectionMm,
      overlap.depthMm + configuration.bodyContactSlopMm
    );
    const correction = multiply(overlap.axis, correctionMm);
    bodyA.position = add(bodyA.position, multiply(correction, -bodyA.inverseMass / inverseMass));
    bodyB.position = add(bodyB.position, multiply(correction, bodyB.inverseMass / inverseMass));
    bodyContactCorrectionCount += 1;
    recorder.record('bodyContactCorrectionMm', correctionMm);
    maximumSingleBodyCorrectionMm = Math.max(maximumSingleBodyCorrectionMm, correctionMm);

    const relativeVelocity = dot(subtract(bodyB.linearVelocity, bodyA.linearVelocity), overlap.axis);
    if (relativeVelocity < 0) {
      const restitution = neighbour ? 0 : configuration.nonNeighbourRestitution;
      const impulseMagnitude = -(1 + restitution) * relativeVelocity / inverseMass;
      const impulse = multiply(overlap.axis, impulseMagnitude);
      bodyA.linearVelocity = add(bodyA.linearVelocity, multiply(impulse, -bodyA.inverseMass));
      bodyB.linearVelocity = add(bodyB.linearVelocity, multiply(impulse, bodyB.inverseMass));
    }
    if (neighbour) neighbourImpactFilterCount += 1;
    return correctionMm;
  }

  function solveBodyContacts() {
    if (bodies.length < 2) return;
    solveBodyPair(bodies[0], bodies[1], true);
    if (bodies.length > 2) {
      solveBodyPair(bodies[1], bodies[2], true);
      solveBodyPair(bodies[0], bodies[2], false);
    }
  }

  function verticalHalfExtent(body) {
    const axes = bodyAxes(body);
    const vertical = { x: 0, y: 1, z: 0 };
    return Math.abs(dot(axes[0], vertical)) * body.size.x * 0.5
      + Math.abs(dot(axes[1], vertical)) * body.size.y * 0.5
      + Math.abs(dot(axes[2], vertical)) * body.size.z * 0.5;
  }

  function resolveSurface(body, surfaceProvider, dt, updateVelocity = true) {
    const halfX = body.size.x * 0.32;
    const halfZ = body.size.z * 0.32;
    const probes = [[0, 0], [halfX, 0], [-halfX, 0], [0, halfZ], [0, -halfZ]];
    let surface = { heightMm: -Infinity, normal: { x: 0, y: 1, z: 0 }, kind: 'none' };
    for (const [offsetX, offsetZ] of probes) {
      const sample = surfaceSample(surfaceProvider, body.position.x + offsetX, body.position.z + offsetZ);
      if (sample.heightMm > surface.heightMm) surface = sample;
    }
    const halfHeight = verticalHalfExtent(body);
    const bottom = body.position.y - halfHeight;
    const clearance = bottom - surface.heightMm;
    if (clearance > configuration.restClearanceMm) return false;
    if (bottom < surface.heightMm || body.linearVelocity.y <= 0) {
      body.position.y = surface.heightMm + halfHeight;
    }
    body.contacts += 1;
    body.collisionKind = surface.kind;
    body.contactNormal = { ...surface.normal };
    if (updateVelocity) {
      const normalSpeed = dot(body.linearVelocity, surface.normal);
      if (normalSpeed < 0) {
        const tangent = subtract(body.linearVelocity, multiply(surface.normal, normalSpeed));
        const friction = Math.exp(-configuration.groundFrictionPerSecond * dt);
        body.linearVelocity = add(multiply(tangent, friction), multiply(surface.normal, -normalSpeed * configuration.groundRestitution));
      }
      const angularScale = Math.exp(-configuration.groundAngularDampingPerSecond * dt);
      body.angularVelocity = multiply(body.angularVelocity, angularScale);
    }
    return true;
  }

  function rememberContact(body, contact) {
    if (!contact?.point || !contact?.normal
      || !['x', 'y', 'z'].every((axis) => Number.isFinite(contact.point[axis]) && Number.isFinite(contact.normal[axis]))) return;
    const canonical = { ...contact, normal: normalise(contact.normal, { x: 0, y: 1, z: 0 }) };
    const duplicate = body.velocityContacts.findIndex((item) => item.sourceId === canonical.sourceId
      && dot(item.normal, canonical.normal) > 0.999);
    if (duplicate >= 0) body.velocityContacts[duplicate] = canonical;
    else if (body.velocityContacts.length < 16) body.velocityContacts.push(canonical);
    body.contacts += 1;
    body.collisionKind = canonical.kind;
    body.contactNormal = { ...canonical.normal };
    if (canonical.normal.y > 0.7 && canonical.kind !== 'tcp-pusher-contact') body.groundContact = true;
  }

  function solidBodyQuery(body) {
    return {
      id: body.id, size: { ...body.size }, position: { ...body.position }, rotation: { ...body.rotation }
    };
  }

  function solidContactDepth(contact) {
    if (!contact?.point || !contact?.normal
      || !['x', 'y', 'z'].every(axis => Number.isFinite(contact.point[axis]) && Number.isFinite(contact.normal[axis]))
      || length(contact.normal) < 1e-8 || typeof contact.penetrationMm !== 'number'
      || !Number.isFinite(contact.penetrationMm) || contact.penetrationMm < 0) {
      throw contactError('INVALID_TERRAIN_CONTACT', 'Terrain contacts require a finite point, normal and nonnegative penetration.');
    }
    return contact.penetrationMm;
  }

  function resolveSolidContacts(body, provider, sweep = false) {
    if (!provider?.queryBodyContacts) return;
    if (sweep && provider.sweepBody) {
      const hit = provider.sweepBody({
        body: solidBodyQuery(body), previousPosition: { ...body.previousPosition },
        previousRotation: { ...body.previousRotation }, contactMarginMm: 0
      });
      if (hit && Number.isFinite(hit.timeOfImpact)) {
        const remainder = 1 - clamp(hit.timeOfImpact, 0, 1);
        for (const contact of (hit.contacts || []).slice(0, 32)) {
          solidContactDepth(contact);
          const motion = subtract(body.position, body.previousPosition);
          const inward = dot(motion, contact.normal);
          if (inward < 0) body.position = subtract(body.position, multiply(contact.normal, inward * remainder));
          rememberContact(body, contact);
        }
      }
    }
    const queried = provider.queryBodyContacts({
      body: solidBodyQuery(body), previousPosition: { ...body.previousPosition },
      previousRotation: { ...body.previousRotation }, contactMarginMm: contactConfiguration.contactMarginMm,
      includeColumnDiagnostics: false
    });
    for (const contact of (queried?.contacts || []).slice(0, 32)) {
      const penetration = solidContactDepth(contact);
      if (penetration > 0) {
        const correction = Math.min(configuration.bodyContactMaximumCorrectionMm, penetration);
        body.position = add(body.position, multiply(contact.normal, correction));
      }
      rememberContact(body, contact);
      if (contact.kind === 'terrain-wall' || contact.kind === 'terrain-ceiling') {
        contactTelemetry.solidCollisionCount += 1;
        contactTelemetry.lastSolidContact = { bodyId: body.id, ...cloneValue(contact) };
      }
    }
  }

  function resolveContactSurface(body, provider) {
    const halfHeight = verticalHalfExtent(body);
    const bottom = body.position.y - halfHeight;
    const previousBottom = body.previousPosition.y - boxRadiusAlong({ ...body, rotation: body.previousRotation }, { x: 0, y: 1, z: 0 });
    const probes = [[0, 0], [body.size.x * 0.32, 0], [-body.size.x * 0.32, 0], [0, body.size.z * 0.32], [0, -body.size.z * 0.32]];
    let highest = null;
    for (const [x, z] of probes) {
      const offset = rotateVector(body.rotation, { x, y: -body.size.y * 0.5, z });
      const sample = surfaceSample(provider, body.position.x + offset.x, body.position.z + offset.z, {
        probeHeightMm: bottom + contactConfiguration.contactMarginMm,
        previousHeightMm: previousBottom + contactConfiguration.contactMarginMm,
        noFallback: true
      });
      if (Number.isFinite(sample.heightMm) && sample.heightMm <= previousBottom + contactConfiguration.contactMarginMm
        && (!highest || sample.heightMm > highest.heightMm)) highest = sample;
    }
    if (!highest || bottom > highest.heightMm + contactConfiguration.contactMarginMm) return;
    body.position.y = Math.max(body.position.y, highest.heightMm + halfHeight);
    rememberContact(body, {
      point: { x: body.position.x, y: highest.heightMm, z: body.position.z },
      normal: highest.normal, kind: highest.kind, sourceId: highest.sourceId || 'solid-surface', penetrationMm: Math.max(0, highest.heightMm - bottom)
    });
  }

  function resolveRailContact(body, provider) {
    body.railSupport = provider?.queryBodySupport?.(solidBodyQuery(body)) || null;
    const support = body.railSupport;
    if (!support?.supported) return;
    const halfHeight = verticalHalfExtent(body);
    const bottom = body.position.y - halfHeight;
    const previousBottom = body.previousPosition.y - boxRadiusAlong({ ...body, rotation: body.previousRotation }, { x: 0, y: 1, z: 0 });
    // A rail can catch a descending footprint, never lift a body out of a gap
    // or manufacture an approach ramp from a lower bank.
    if (bottom > support.heightMm + contactConfiguration.contactMarginMm
      || previousBottom < support.heightMm - contactConfiguration.contactMarginMm) return;
    body.position.y = Math.max(body.position.y, support.heightMm + halfHeight);
    body.railContact = true;
    for (const contact of support.contacts) rememberContact(body, contact);
    if (support.fullyOnRoute) {
      // Ideal wheel/rail lateral guide. It exists only at actual accepted rail
      // contacts, is bounded, and never changes longitudinal position/speed.
      body.position.z += clamp(-body.position.z, -contactConfiguration.maximumRailGuideCorrectionMm, contactConfiguration.maximumRailGuideCorrectionMm);
      body.linearVelocity.z = 0;
    }
  }

  function resolveMeasuredPusher(body, collider) {
    const contact = queryKinematicContact(body, collider, { marginMm: contactConfiguration.contactMarginMm });
    if (!contact) return;
    const correction = multiply(contact.normal, Math.min(configuration.bodyContactMaximumCorrectionMm, contact.penetrationMm));
    body.position = add(body.position, correction);
    body.kinematicCorrection = add(body.kinematicCorrection, correction);
    rememberContact(body, contact);
    const firstInStep = !body.pusherContactSeen;
    body.pusherContactSeen = true;
    if (firstInStep) contactTelemetry.contactCount += 1;
    contactTelemetry.maximumPenetrationMm = Math.max(contactTelemetry.maximumPenetrationMm, contact.penetrationMm);
    contactTelemetry.lastContact = {
      ...cloneValue(contact), worldRevision: collider.worldRevision, robotRevision: collider.robotRevision,
      sampleTimeSeconds: collider.sampleTimeSeconds, sequence: collider.sequence,
      colliderPosition: { ...collider.position }, colliderRotation: { ...collider.rotation }
    };
  }

  function resolveContactEnvironment(body, environment, sweep = false) {
    if (environment.solidContactProvider?.queryBodyContacts) resolveSolidContacts(body, environment.solidContactProvider, sweep);
    else resolveContactSurface(body, environment.surfaceProvider);
    resolveRailContact(body, environment.railContactProvider);
    if (environment.kinematicCollider) resolveMeasuredPusher(body, environment.kinematicCollider);
  }

  function clampVelocities(body) {
    const linearSpeed = length(body.linearVelocity);
    if (linearSpeed > configuration.maximumLinearSpeedMmPerSecond) {
      body.linearVelocity = multiply(body.linearVelocity, configuration.maximumLinearSpeedMmPerSecond / linearSpeed);
    }
    const angularSpeed = length(body.angularVelocity);
    if (angularSpeed > configuration.maximumAngularSpeedRadPerSecond) {
      body.angularVelocity = multiply(body.angularVelocity, configuration.maximumAngularSpeedRadPerSecond / angularSpeed);
    }
  }

  function updateTelemetry() {
    currentMaximumAnchorErrorMm = 0;
    for (const joint of joints) {
      const lead = bodies[joint.leadIndex];
      const trailing = bodies[joint.trailingIndex];
      const leadAnchor = worldAnchor(lead, joint.leadLocalAnchor);
      const trailingAnchor = worldAnchor(trailing, joint.trailingLocalAnchor);
      joint.anchorDistanceMm = length(subtract(trailingAnchor, leadAnchor));
      joint.anchorErrorMm = Math.abs(joint.anchorDistanceMm - joint.restLengthMm);
      currentMaximumAnchorErrorMm = Math.max(currentMaximumAnchorErrorMm, joint.anchorErrorMm);
      maximumAnchorErrorMm = Math.max(maximumAnchorErrorMm, joint.anchorErrorMm);
    }
    lastPairDiagnostics = [];
    minimumPairSeparationMm = Infinity;
    for (let left = 0; left < bodies.length; left += 1) {
      for (let right = left + 1; right < bodies.length; right += 1) {
        const diagnostic = pairDiagnostic(bodies[left], bodies[right], right - left === 1, contactModeActive);
        lastPairDiagnostics.push(diagnostic);
        minimumPairSeparationMm = Math.min(minimumPairSeparationMm, diagnostic.projectedSeparationMm);
        currentMaximumBodyOverlapDepthMm = Math.max(currentMaximumBodyOverlapDepthMm, diagnostic.overlapDepthMm);
        maximumBodyOverlapDepthMm = Math.max(maximumBodyOverlapDepthMm, diagnostic.overlapDepthMm);
      }
    }
    recorder.record('couplerAnchorErrorMm', currentMaximumAnchorErrorMm);
    recorder.record('bodyOverlapDepthMm', currentMaximumBodyOverlapDepthMm);
  }

  function promote(kinematicBodies, forwardSpeedMmPerSecond, promotionOptions = {}) {
    const angular = promotionOptions.angularVelocities || [
      { x: 0.10, y: 0.03, z: -0.46 },
      { x: -0.08, y: -0.02, z: -0.24 },
      { x: 0.06, y: 0.02, z: -0.12 }
    ];
    const lateral = promotionOptions.lateralSpeedsMmPerSecond || [16, 10, 6];
    const vertical = promotionOptions.verticalSpeedsMmPerSecond || [-24, -12, -6];
    const masses = promotionOptions.masses || [8, 5, 5];
    bodies = kinematicBodies.map((body, index) => dynamicBody(
      body,
      {
        x: Number(forwardSpeedMmPerSecond) || 0,
        y: vertical[index] || 0,
        z: lateral[index] || 0
      },
      angular[index] || vector(),
      masses[index] || 5
    ));
    joints = bodies.length >= 3 ? [makeJoint(0, 1), makeJoint(1, 2)] : [];
    steps = 0;
    maximumAnchorErrorMm = 0;
    currentMaximumAnchorErrorMm = 0;
    maximumBodyOverlapDepthMm = 0;
    currentMaximumBodyOverlapDepthMm = 0;
    minimumPairSeparationMm = Infinity;
    bodyContactCorrectionCount = 0;
    neighbourImpactFilterCount = 0;
    maximumSingleBodyCorrectionMm = 0;
    resetContactTelemetry();
    updateTelemetry();
    return snapshot();
  }

  function step(dt, environment = {}) {
    const contactMode = environment.motionMode === 'tcp_contact';
    const suppliedDt = Number(dt);
    if (contactMode) {
      if (!(Number.isFinite(suppliedDt) && suppliedDt > 0
        && suppliedDt <= TCP_CONTACT_LIMITS.maximumStepSeconds + TCP_CONTACT_LIMITS.timeEpsilonSeconds)) {
        throw contactError('TCP_CONTACT_STEP_UNBOUNDED', 'A positive bounded measured-contact step is required.');
      }
      const collider = environment.kinematicCollider;
      if (collider) {
        const travelMm = kinematicTravelMm(
          { ...collider, position: collider.previousPosition, rotation: collider.previousRotation }, collider);
        const travelLimitMm = kinematicStepTravelLimitMm(bodies, collider);
        if (travelMm > travelLimitMm + TCP_CONTACT_LIMITS.travelEpsilonMm) {
          throw contactError('TCP_CONTACT_STEP_UNBOUNDED', 'Measured TCP motion must be subdivided before physics contact.', {
            travelMm, travelLimitMm
          });
        }
        const displacementErrorMm = length(subtract(
          subtract(collider.position, collider.previousPosition), multiply(collider.linearVelocity, suppliedDt)));
        const angularErrorRad = Math.abs(quaternionAngularError(collider.previousRotation, collider.rotation)
          - length(collider.angularVelocity) * suppliedDt);
        if (displacementErrorMm > 1e-5 || angularErrorRad > 1e-5) {
          throw contactError('TCP_CONTACT_TIME_MISMATCH', 'TCP collider motion does not match its measured integration interval.', {
            displacementErrorMm, angularErrorRad
          });
        }
      }
    }
    const stepStart = now();
    const fixed = contactMode ? suppliedDt : clamp(suppliedDt || 1 / 120, 0.001, 0.05);
    contactModeActive = contactMode;
    const linearDamping = Math.exp(-configuration.airDampingPerSecond * fixed);
    const lateralDamping = Math.exp(-configuration.lateralAirDampingPerSecond * fixed);
    const angularDamping = Math.exp(-configuration.angularDampingPerSecond * fixed);
    if (gridCollider) gridCollider.resetStepCounters();
    currentMaximumBodyOverlapDepthMm = 0;
    if (contactMode) contactTelemetry.measuredPusherSpeedMmPerSecond = environment.kinematicCollider
      ? length(environment.kinematicCollider.linearVelocity) : 0;
    for (const joint of joints) joint.correctionMm = 0;

    let stage = now();
    for (const body of bodies) {
      const rolling = contactMode && (body.railContact || body.groundContact);
      body.contacts = 0;
      body.collisionKind = 'none';
      body.contactNormal = { x: 0, y: 1, z: 0 };
      body.resting = false;
      body.railContact = false;
      body.groundContact = false;
      body.velocityContacts = [];
      body.kinematicCorrection = vector();
      body.pusherContactSeen = false;
      body.previousPosition = { ...body.position };
      body.previousRotation = { ...body.rotation };
      body.linearVelocity.y -= configuration.gravityMmPerSecondSquared * fixed;
      body.linearVelocity.x *= rolling ? Math.exp(-contactConfiguration.rollingDampingPerSecond * fixed) : linearDamping;
      body.linearVelocity.y *= linearDamping;
      body.linearVelocity.z *= lateralDamping;
      body.angularVelocity.x *= angularDamping;
      body.angularVelocity.y *= angularDamping;
      body.angularVelocity.z *= angularDamping;
      body.position.x += body.linearVelocity.x * fixed;
      body.position.y += body.linearVelocity.y * fixed;
      body.position.z += body.linearVelocity.z * fixed;
      integrateQuaternion(body.rotation, body.angularVelocity, fixed);
    }
    const integrateMs = now() - stage;

    stage = now();
    if (gridCollider) {
      for (const body of bodies) gridCollider.resolveBodySweep(body, body.previousPosition, body.previousRotation, fixed);
    }
    const bridgeCollisionMs = now() - stage;

    stage = now();
    for (const body of bodies) {
      if (contactMode) resolveContactEnvironment(body, environment, true);
      else resolveSurface(body, environment.surfaceProvider, fixed, true);
    }
    const terrainCollisionMs = now() - stage;

    stage = now();
    for (let iteration = 0; iteration < configuration.couplerIterations; iteration += 1) {
      for (const joint of joints) solveJointPosition(joint);
      solveBodyContacts();
    }
    const couplerAndBodyMs = now() - stage;

    stage = now();
    for (const body of bodies) {
      if (gridCollider) gridCollider.resolveBodyPenetration(body, fixed, 3);
      if (contactMode) resolveContactEnvironment(body, environment);
      else resolveSurface(body, environment.surfaceProvider, fixed, false);
    }
    for (let iteration = 0; iteration < configuration.bodyContactIterations; iteration += 1) {
      for (const joint of joints) solveJointPosition(joint, configuration.couplerStiffness * 0.35);
      solveBodyContacts();
    }
    // The last operation is non-penetration. It prevents the visual self-intersection defect.
    for (let iteration = 0; iteration < 3; iteration += 1) solveBodyContacts();
    if (contactMode) for (const body of bodies) resolveContactEnvironment(body, environment);
    if (contactMode && environment.kinematicCollider) {
      let worst = null;
      for (const body of bodies) {
        const overlap = orientedBoxOverlap(environment.kinematicCollider, body);
        if (overlap.overlap && (!worst || overlap.depthMm > worst.depthMm)) worst = { bodyId: body.id, ...overlap };
      }
      const depthMm = worst?.depthMm ?? 0;
      contactTelemetry.maximumResidualPusherPenetrationMm = Math.max(
        contactTelemetry.maximumResidualPusherPenetrationMm, depthMm);
      if (depthMm > TCP_CONTACT_LIMITS.maximumResidualPenetrationMm) {
        throw contactError('TCP_CONTACT_RESIDUAL', 'The pusher contact solver left excessive Train penetration.', worst);
      }
    }
    if (contactMode && environment.solidContactProvider?.queryBodyContacts) {
      let worst = null;
      for (const body of bodies) {
        const queried = environment.solidContactProvider.queryBodyContacts({
          body: solidBodyQuery(body), previousPosition: { ...body.position },
          previousRotation: { ...body.rotation }, contactMarginMm: 0, includeColumnDiagnostics: false
        });
        for (const contact of queried?.contacts || []) {
          const depthMm = solidContactDepth(contact);
          if (!worst || depthMm > worst.depthMm) worst = { bodyId: body.id, depthMm, contact };
        }
      }
      const depthMm = worst?.depthMm ?? 0;
      contactTelemetry.maximumResidualSolidPenetrationMm = Math.max(
        contactTelemetry.maximumResidualSolidPenetrationMm, depthMm);
      if (depthMm > TCP_CONTACT_LIMITS.maximumResidualPenetrationMm) {
        throw contactError('TERRAIN_CONTACT_RESIDUAL', 'The terrain contact solver left excessive Train penetration.', worst);
      }
    }
    const postCollisionMs = now() - stage;

    // Reconstruct velocity after position-based contact and coupler correction.
    // This prevents the hard couplers from storing unbounded hidden velocity.
    for (const body of bodies) {
      const displacement = subtract(subtract(body.position, body.previousPosition), contactMode ? body.kinematicCorrection : vector());
      body.linearVelocity = multiply(displacement, (contactMode ? 1 : configuration.pbdVelocityDamping) / fixed);
    }

    stage = now();
    for (const joint of joints) dampJointVelocity(joint);
    if (contactMode) {
      for (let iteration = 0; iteration < 4; iteration += 1) {
        for (const body of bodies) {
          for (const contact of body.velocityContacts) {
            const impulse = applyContactVelocity(body, contact);
            if (contact.kind === 'tcp-pusher-contact' && impulse > 1e-8) {
              contactTelemetry.impulseCount += 1;
              contactTelemetry.impulseMagnitudeTotal += impulse;
            }
          }
        }
        for (const joint of joints) dampJointVelocity(joint);
      }
    }
    const velocityConstraintMs = now() - stage;

    stage = now();
    for (const body of bodies) {
      clampVelocities(body);
      const speed = length(body.linearVelocity);
      const spin = length(body.angularVelocity);
      const surface = surfaceSample(environment.surfaceProvider, body.position.x, body.position.z, contactMode ? {
        probeHeightMm: body.position.y - verticalHalfExtent(body) + contactConfiguration.contactMarginMm,
        previousHeightMm: body.previousPosition.y - verticalHalfExtent(body) + contactConfiguration.contactMarginMm,
        noFallback: true
      } : {});
      const clearance = body.position.y - verticalHalfExtent(body) - surface.heightMm;
      const nearSurface = clearance <= configuration.restClearanceMm;
      body.resting = (contactMode ? body.groundContact : body.contacts > 0 || nearSurface)
        && speed <= (contactMode ? contactConfiguration.settleLinearSpeedMmPerSecond : configuration.settleLinearSpeedMmPerSecond)
        && spin <= configuration.settleAngularSpeedRadPerSecond;
      if (body.resting) {
        body.linearVelocity = vector();
        body.angularVelocity = vector();
      }
    }
    const settleCheckMs = now() - stage;

    currentMaximumBodyOverlapDepthMm = 0;
    updateTelemetry();
    steps += 1;
    const stepTotalMs = now() - stepStart;
    recorder.record('stepTotalMs', stepTotalMs);
    recorder.record('integrateMs', integrateMs);
    recorder.record('bridgeCollisionMs', bridgeCollisionMs);
    recorder.record('terrainCollisionMs', terrainCollisionMs);
    recorder.record('couplerAndBodyMs', couplerAndBodyMs);
    recorder.record('postCollisionMs', postCollisionMs);
    recorder.record('velocityConstraintMs', velocityConstraintMs);
    recorder.record('settleCheckMs', settleCheckMs);
    if (gridCollider) {
      const counters = gridCollider.getCounters().step;
      for (const [name, value] of Object.entries(counters)) recorder.increment(`grid.${name}`, value);
    }
    return snapshot();
  }

  function freeze() {
    for (const body of bodies) {
      body.linearVelocity = vector();
      body.angularVelocity = vector();
      body.resting = true;
    }
    updateTelemetry();
    return snapshot();
  }

  function reset() {
    bodies = [];
    joints = [];
    steps = 0;
    maximumAnchorErrorMm = 0;
    currentMaximumAnchorErrorMm = 0;
    maximumBodyOverlapDepthMm = 0;
    currentMaximumBodyOverlapDepthMm = 0;
    minimumPairSeparationMm = Infinity;
    bodyContactCorrectionCount = 0;
    neighbourImpactFilterCount = 0;
    maximumSingleBodyCorrectionMm = 0;
    lastPairDiagnostics = [];
    resetContactTelemetry();
  }

  function snapshot() {
    return bodies.map((body) => ({
      id: body.id,
      label: body.label,
      role: body.role,
      colourIndex: body.colourIndex,
      size: { ...body.size },
      position: { ...body.position },
      rotation: { ...body.rotation },
      linearVelocity: { ...body.linearVelocity },
      angularVelocity: { ...body.angularVelocity },
      contacts: body.contacts,
      resting: body.resting,
      collisionKind: body.collisionKind,
      contactNormal: { ...body.contactNormal },
      railContact: body.railContact,
      groundContact: body.groundContact,
      railSupport: cloneValue(body.railSupport)
    }));
  }

  function couplerSnapshot() {
    return joints.map((joint) => {
      const lead = bodies[joint.leadIndex];
      const trailing = bodies[joint.trailingIndex];
      const leadAnchor = worldAnchor(lead, joint.leadLocalAnchor);
      const trailingAnchor = worldAnchor(trailing, joint.trailingLocalAnchor);
      return {
        id: joint.id,
        leadId: lead.id,
        trailingId: trailing.id,
        leadAnchor,
        trailingAnchor,
        restLengthMm: joint.restLengthMm,
        anchorDistanceMm: length(subtract(trailingAnchor, leadAnchor)),
        anchorErrorMm: joint.anchorErrorMm,
        correctionMm: joint.correctionMm,
        visible: true,
        constraintType: 'hard-distance-with-damping-and-neighbour-filter'
      };
    });
  }

  function getDiagnostics() {
    const gridCounters = gridCollider?.getCounters?.() || null;
    return {
      rootCauseClass: 'MISSING_BODY_TO_BODY_CONTACT_WITH_HARD_COUPLERS',
      fix: 'COUPLER_NEIGHBOUR_IMPACT_FILTER_PLUS_CAPSULE_NON_PENETRATION',
      pairDiagnostics: cloneValue(lastPairDiagnostics),
      bodyKinematics: bodies.map((body) => ({
        id: body.id,
        positionMm: cloneValue(body.position),
        linearVelocityMmPerSecond: cloneValue(body.linearVelocity),
        angularVelocityRadPerSecond: cloneValue(body.angularVelocity),
        contacts: body.contacts,
        resting: body.resting,
        collisionKind: body.collisionKind
      })),
      couplerDiagnostics: couplerSnapshot().map((joint) => ({
        id: joint.id,
        anchorDistanceMm: joint.anchorDistanceMm,
        restLengthMm: joint.restLengthMm,
        anchorErrorMm: joint.anchorErrorMm,
        correctionMm: joint.correctionMm
      })),
      currentMaximumBodyOverlapDepthMm,
      lifetimeMaximumBodyOverlapDepthMm: maximumBodyOverlapDepthMm,
      minimumProjectedPairSeparationMm: Number.isFinite(minimumPairSeparationMm) ? minimumPairSeparationMm : null,
      bodyContactCorrectionCount,
      bridgePenetrationCorrectionCount: gridCounters?.total?.penetrationResolves || 0,
      neighbourImpactFilterCount,
      maximumSingleCorrectionMm: maximumSingleBodyCorrectionMm,
      currentMaximumCouplerAnchorErrorMm: currentMaximumAnchorErrorMm,
      lifetimeMaximumCouplerAnchorErrorMm: maximumAnchorErrorMm,
      physicalContact: cloneValue(contactTelemetry)
    };
  }

  return Object.freeze({
    promote,
    step,
    freeze,
    reset,
    snapshot,
    setCollisionSnapshot,
    getCollisionSnapshot() { return collisionSnapshot; },
    getCouplers: couplerSnapshot,
    getDiagnostics,
    getCounts() {
      return {
        dynamicBodies: bodies.length,
        activeBodies: bodies.filter((body) => !body.resting).length,
        contacts: bodies.reduce((sum, body) => sum + body.contacts, 0),
        physicsSteps: steps,
        couplerJoints: joints.length,
        currentMaximumCouplerAnchorErrorMm: currentMaximumAnchorErrorMm,
        lifetimeMaximumCouplerAnchorErrorMm: maximumAnchorErrorMm,
        currentMaximumBodyOverlapDepthMm,
        lifetimeMaximumBodyOverlapDepthMm: maximumBodyOverlapDepthMm,
        bodyContactCorrectionCount
      };
    },
    getPerformanceReport() {
      return {
        recorder: recorder.report(),
        gridCollision: gridCollider ? gridCollider.getCounters() : null,
        collisionSnapshot: collisionSnapshot ? {
          checksum: collisionSnapshot.checksum,
          estimatedBytes: collisionSnapshot.estimatedBytes,
          occupiedCells: collisionSnapshot.occupiedCellCount,
          exposedFaces: collisionSnapshot.exposedFaceCount,
          mergedFaces: collisionSnapshot.mergedFaces.length
        } : null,
        settings: cloneValue(configuration)
      };
    },
    resetPerformanceReport() { recorder.reset(); }
  });
}
