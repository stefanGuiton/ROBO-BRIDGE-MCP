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
  rotateVector,
  subtract,
  vector,
  bodyAxes
} from './math.js';
import { createGridCollisionSystem } from './train-grid-collision.js';
import { createPerformanceRecorder } from './performance-recorder.js';

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
    previousRotation: { ...(source.rotation || identityQuaternion()) }
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

function pairDiagnostic(bodyA, bodyB, neighbour) {
  const delta = subtract(bodyB.position, bodyA.position);
  const centreDistanceMm = length(delta);
  const overlap = neighbour ? neighbourCapsuleOverlap(bodyA, bodyB) : orientedBoxOverlap(bodyA, bodyB);
  const axis = normalise(delta, { x: -1, y: 0, z: 0 });
  const projectedSeparationMm = neighbour
    ? overlap.separationMm
    : centreDistanceMm - projectedRadius(bodyA, axis) - projectedRadius(bodyB, axis);
  return {
    id: `${bodyA.id}-${bodyB.id}`,
    bodyA: bodyA.id,
    bodyB: bodyB.id,
    neighbour,
    collisionMode: neighbour ? 'coupler-owned-capsule-non-penetration' : 'inelastic-non-neighbour',
    centreDistanceMm,
    projectedSeparationMm,
    overlap: overlap.overlap,
    overlapDepthMm: overlap.overlap ? overlap.depthMm : 0
  };
}

function surfaceSample(provider, forwardMm, rightMm) {
  if (typeof provider === 'function') {
    const value = provider({ forwardMm, rightMm });
    if (Number.isFinite(value)) return { heightMm: value, normal: { x: 0, y: 1, z: 0 }, kind: 'terrain' };
    if (value && Number.isFinite(value.heightMm)) return {
      heightMm: value.heightMm,
      normal: normalise(value.normal || { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }),
      kind: value.kind || 'terrain'
    };
  }
  if (provider?.sample) return surfaceSample(provider.sample.bind(provider), forwardMm, rightMm);
  if (provider?.heightAt) return surfaceSample(provider.heightAt.bind(provider), forwardMm, rightMm);
  return { heightMm: -300, normal: { x: 0, y: 1, z: 0 }, kind: 'fallback-floor' };
}

export function createTrainPhysics(options = {}) {
  const configuration = { ...DEFAULT_TRAIN_PHYSICS_SETTINGS, ...options };
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
    const overlap = neighbour ? neighbourCapsuleOverlap(bodyA, bodyB) : orientedBoxOverlap(bodyA, bodyB);
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
        const diagnostic = pairDiagnostic(bodies[left], bodies[right], right - left === 1);
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
    updateTelemetry();
    return snapshot();
  }

  function step(dt, environment = {}) {
    const stepStart = now();
    const fixed = clamp(Number(dt) || 1 / 120, 0.001, 0.05);
    const linearDamping = Math.exp(-configuration.airDampingPerSecond * fixed);
    const lateralDamping = Math.exp(-configuration.lateralAirDampingPerSecond * fixed);
    const angularDamping = Math.exp(-configuration.angularDampingPerSecond * fixed);
    if (gridCollider) gridCollider.resetStepCounters();
    currentMaximumBodyOverlapDepthMm = 0;
    for (const joint of joints) joint.correctionMm = 0;

    let stage = now();
    for (const body of bodies) {
      body.contacts = 0;
      body.collisionKind = 'none';
      body.contactNormal = { x: 0, y: 1, z: 0 };
      body.resting = false;
      body.previousPosition = { ...body.position };
      body.previousRotation = { ...body.rotation };
      body.linearVelocity.y -= configuration.gravityMmPerSecondSquared * fixed;
      body.linearVelocity.x *= linearDamping;
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
    for (const body of bodies) resolveSurface(body, environment.surfaceProvider, fixed, true);
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
      resolveSurface(body, environment.surfaceProvider, fixed, false);
    }
    for (let iteration = 0; iteration < configuration.bodyContactIterations; iteration += 1) {
      for (const joint of joints) solveJointPosition(joint, configuration.couplerStiffness * 0.35);
      solveBodyContacts();
    }
    // The last operation is non-penetration. It prevents the visual self-intersection defect.
    for (let iteration = 0; iteration < 3; iteration += 1) solveBodyContacts();
    const postCollisionMs = now() - stage;

    // Reconstruct velocity after position-based contact and coupler correction.
    // This prevents the hard couplers from storing unbounded hidden velocity.
    for (const body of bodies) {
      body.linearVelocity = multiply(subtract(body.position, body.previousPosition), configuration.pbdVelocityDamping / fixed);
    }

    stage = now();
    for (const joint of joints) dampJointVelocity(joint);
    const velocityConstraintMs = now() - stage;

    stage = now();
    for (const body of bodies) {
      clampVelocities(body);
      const speed = length(body.linearVelocity);
      const spin = length(body.angularVelocity);
      const surface = surfaceSample(environment.surfaceProvider, body.position.x, body.position.z);
      const clearance = body.position.y - verticalHalfExtent(body) - surface.heightMm;
      const nearSurface = clearance <= configuration.restClearanceMm;
      body.resting = (body.contacts > 0 || nearSurface)
        && speed <= configuration.settleLinearSpeedMmPerSecond
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
      contactNormal: { ...body.contactNormal }
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
      lifetimeMaximumCouplerAnchorErrorMm: maximumAnchorErrorMm
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
