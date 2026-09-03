'use strict';

import {
  DEFAULT_TRAIN_MOTION_SETTINGS,
  TRAIN_ACTIVE_STEP_STATES,
  TRAIN_FIXED_DT_SECONDS,
  TRAIN_RESET_TIMES_SECONDS,
  TRAIN_STATES
} from './constants.js';
import { createAcceptedBuildBoardSnapshot, segmentAtRouteDistance } from './buildboard-support-map.js';
import { createPushProfile } from './train-push-profile.js';
import { createPusherAdapter } from './pusher-adapter.js';
import { createTrainPhysics } from './train-physics.js';
import { createAcceptedRailContactProvider } from './train-contact-support.js';
import {
  boxRadiusAlong, contactError, createKinematicContactTimeline, measuredKinematicCollider,
  TCP_CONTACT_LIMITS, tcpPoseToRouteCollider
} from './train-kinematic-contact.js';
import { createPerformanceRecorder } from './performance-recorder.js';
import {
  createRouteFrame,
  routeLocalPointToMachine,
  routeLocalQuaternionToMachine,
  routeLocalVectorToMachine,
  routeProgress
} from './route-frame.js';
import {
  clamp,
  cloneValue,
  bodyAxes,
  conjugateQuaternion,
  dot,
  eulerDegreesToQuaternion,
  identityQuaternion,
  length,
  multiplyQuaternions,
  normaliseQuaternion,
  quaternionAngularError,
  round6,
  vector
} from './math.js';
import { createTrainTestPreconditionAdapter } from './train-test-preconditions.js';

const now = () => performance.now();

function positiveSize(source, label) {
  const size = { x: source?.xMm, y: source?.yMm, z: source?.zMm };
  if (!Object.values(size).every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) {
    throw new TypeError(`${label} requires positive finite xMm, yMm and zMm dimensions.`);
  }
  return size;
}

function finiteProfileNumber(profile, key, fallback, minimum = -Infinity) {
  const value = profile[key] ?? fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`trainProfile.${key} must be finite${Number.isFinite(minimum) ? ` and at least ${minimum}` : ''}.`);
  }
  return value;
}

function makeBodyDefinitions(plan, frame, trainProfile = {}) {
  const scale = frame.worldTransform.scale;
  const cellForwardMm = plan.geometry.grid.dx * scale;
  const cellUpMm = plan.geometry.grid.dy * scale;
  const definitions = [
    {
      id: 'A', label: 'A', role: 'locomotive', colourIndex: 0,
      size: {
        x: Math.max(80, cellForwardMm * 5.5),
        y: Math.max(34, cellUpMm * 2),
        z: Math.max(34, cellForwardMm * 2)
      }
    },
    {
      id: 'B', label: 'B', role: 'middle-carriage', colourIndex: 1,
      size: {
        x: Math.max(68, cellForwardMm * 4.4),
        y: Math.max(30, cellUpMm * 1.75),
        z: Math.max(32, cellForwardMm * 1.9)
      }
    },
    {
      id: 'C', label: 'C', role: 'rear-carriage', colourIndex: 2,
      size: {
        x: Math.max(68, cellForwardMm * 4.4),
        y: Math.max(30, cellUpMm * 1.75),
        z: Math.max(32, cellForwardMm * 1.9)
      }
    }
  ];
  if (trainProfile.bodySizesMm !== undefined) {
    if (!Array.isArray(trainProfile.bodySizesMm) || trainProfile.bodySizesMm.length !== 3) {
      throw new TypeError('trainProfile.bodySizesMm must contain exactly three body sizes.');
    }
    definitions.forEach((definition, index) => {
      definition.size = positiveSize(trainProfile.bodySizesMm[index], `trainProfile.bodySizesMm[${index}]`);
    });
  }
  return definitions;
}

function createInitialPoses(plan, frame, definitions, trainProfile = {}) {
  const cellForwardMm = plan.geometry.grid.dx * frame.worldTransform.scale;
  const gapMm = finiteProfileNumber(trainProfile, 'gapMm', Math.max(8, cellForwardMm * 0.8), 0);
  const poses = [];
  let centreX = finiteProfileNumber(trainProfile, 'leadStartForwardMm', definitions[0].size.x * 0.62);
  for (let index = 0; index < definitions.length; index += 1) {
    if (index > 0) {
      centreX -= definitions[index - 1].size.x * 0.5 + gapMm + definitions[index].size.x * 0.5;
    }
    const definition = definitions[index];
    poses.push({
      ...cloneValue(definition),
      position: { x: centreX, y: definition.size.y * 0.5, z: 0 },
      rotation: identityQuaternion(),
      linearVelocity: vector(),
      angularVelocity: vector(),
      contacts: 0,
      resting: false,
      collisionKind: 'none'
    });
  }
  return poses;
}

function zeroMotion(pose) {
  return {
    ...cloneValue(pose),
    linearVelocity: vector(),
    angularVelocity: vector(),
    contacts: 0,
    resting: false,
    collisionKind: 'none'
  };
}

function localPoseToPublic(frame, pose) {
  const machinePositionMm = routeLocalPointToMachine(frame, pose.position);
  const machineRotation = routeLocalQuaternionToMachine(frame, pose.rotation);
  const machineVelocity = routeLocalVectorToMachine(frame, pose.linearVelocity || vector());
  return {
    id: pose.id,
    label: pose.label,
    role: pose.role,
    colourIndex: pose.colourIndex,
    sizeMm: { xMm: pose.size.x, yMm: pose.size.y, zMm: pose.size.z },
    routeLocal: {
      positionMm: { forwardMm: pose.position.x, upMm: pose.position.y, rightMm: pose.position.z },
      rotationQuaternion: cloneValue(pose.rotation),
      linearVelocityMmPerSecond: {
        forwardMmPerSecond: pose.linearVelocity?.x || 0,
        upMmPerSecond: pose.linearVelocity?.y || 0,
        rightMmPerSecond: pose.linearVelocity?.z || 0
      },
      angularVelocityRadPerSecond: cloneValue(pose.angularVelocity || vector())
    },
    machine: {
      frame: 'main-demo-machine-mm',
      positionMm: machinePositionMm,
      rotationQuaternion: machineRotation,
      linearVelocityMmPerSecond: { x: machineVelocity.x, y: machineVelocity.y, z: machineVelocity.z }
    },
    contacts: pose.contacts || 0,
    resting: Boolean(pose.resting),
    collisionKind: pose.collisionKind || 'none',
    railContact: Boolean(pose.railContact),
    groundContact: Boolean(pose.groundContact),
    railSupport: cloneValue(pose.railSupport ?? null)
  };
}

function localAnchorToMachine(frame, anchor) {
  return routeLocalPointToMachine(frame, anchor);
}

export function createTrainTestService(options = {}) {
  if (typeof options.getFrozenBuildPlan !== 'function') throw new TypeError('getFrozenBuildPlan() is required.');
  if (typeof options.getAcceptedBuildBoardSnapshot !== 'function') throw new TypeError('getAcceptedBuildBoardSnapshot() is required.');
  if (!options.supportMapAdapter?.refresh) throw new TypeError('supportMapAdapter is required.');
  if (!options.collisionSnapshotManager?.prepare) throw new TypeError('collisionSnapshotManager is required.');
  const motionMode = options.motionMode ?? 'fixture_analytic';
  if (!['fixture_analytic', 'tcp_contact'].includes(motionMode)) throw new TypeError('Unknown Train motionMode.');
  const physicalContact = motionMode === 'tcp_contact';
  const trainProfile = cloneValue(options.trainProfile ?? {});
  const getWorldTransform = options.getWorldTransform || (() => ({}));
  const surfaceProvider = options.surfaceProvider || (physicalContact ? { sample: () => null } : { heightAt: () => -300 });
  const solidContactProvider = options.solidContactProvider || (surfaceProvider.queryBodyContacts ? surfaceProvider : null);
  const physics = options.physics || createTrainPhysics(options.physicsSettings || {});
  const pusherAdapter = options.pusherAdapter || createPusherAdapter({ mode: 'placeholder' });
  if (physicalContact && ['getPose', 'getSample', 'subscribe'].some(key => typeof pusherAdapter[key] !== 'function')) {
    throw new TypeError('tcp_contact requires an authoritative TCP adapter with getPose(), getSample() and subscribe().');
  }
  const preconditions = options.preconditions || createTrainTestPreconditionAdapter(options.preconditionDependencies || {});
  const listeners = new Set();
  if (typeof options.onChange === 'function') listeners.add(options.onChange);
  const recorder = createPerformanceRecorder({ channels: ['serviceStepMs', 'prepareTestMs'] });

  let trainSpeedMmPerSecond = Number(options.trainSpeedMmPerSecond ?? DEFAULT_TRAIN_MOTION_SETTINGS.trainSpeedMmPerSecond);
  let pushDistanceMm = Number(options.pushDistanceMm ?? DEFAULT_TRAIN_MOTION_SETTINGS.pushDistanceMm);
  let pusherOffsetMm = {
    xMm: Number(options.pusherOffsetMm?.xMm ?? DEFAULT_TRAIN_MOTION_SETTINGS.pusherOffsetMm.xMm),
    yMm: Number(options.pusherOffsetMm?.yMm ?? DEFAULT_TRAIN_MOTION_SETTINGS.pusherOffsetMm.yMm),
    zMm: Number(options.pusherOffsetMm?.zMm ?? DEFAULT_TRAIN_MOTION_SETTINGS.pusherOffsetMm.zMm)
  };
  let pusherRotationDeg = {
    xDeg: Number(options.pusherRotationDeg?.xDeg ?? DEFAULT_TRAIN_MOTION_SETTINGS.pusherRotationDeg.xDeg),
    yDeg: Number(options.pusherRotationDeg?.yDeg ?? DEFAULT_TRAIN_MOTION_SETTINGS.pusherRotationDeg.yDeg),
    zDeg: Number(options.pusherRotationDeg?.zDeg ?? DEFAULT_TRAIN_MOTION_SETTINGS.pusherRotationDeg.zDeg)
  };
  let pusherClearanceMm = Number(options.pusherClearanceMm ?? DEFAULT_TRAIN_MOTION_SETTINGS.pusherClearanceMm);
  let pusherVisible = options.pusherVisible ?? DEFAULT_TRAIN_MOTION_SETTINGS.pusherVisible;
  const settleRequiredSeconds = Number(options.settleRequiredSeconds ?? options.physicsSettings?.settleRequiredSeconds ?? 0.65);
  const settleTimeoutSeconds = Number(options.settleTimeoutSeconds ?? options.physicsSettings?.settleTimeoutSeconds ?? 12);
  const contactTestTimeoutSeconds = Number(options.contactTestTimeoutSeconds ?? 30);
  if (!(Number.isFinite(contactTestTimeoutSeconds) && contactTestTimeoutSeconds > 0)) {
    throw new TypeError('contactTestTimeoutSeconds must be positive and finite.');
  }

  let state = TRAIN_STATES.READY;
  let result = null;
  let plan = null;
  let boardSnapshot = null;
  let worldTransform = null;
  let supportMap = null;
  let collisionSnapshot = null;
  let collisionPrepareReport = null;
  let routeFrame = null;
  let definitions = [];
  let initialPoses = [];
  let poses = [];
  let profile = null;
  let pushElapsedSeconds = 0;
  let pushDistanceTravelledMm = 0;
  let currentSpeedMmPerSecond = 0;
  let currentAccelerationMmPerSecondSquared = 0;
  let pusherStartLocalPose = null;
  let pusherLocalPose = null;
  let pusherEngaged = false;
  let elapsedSeconds = 0;
  let fallingElapsedSeconds = 0;
  let settledElapsedSeconds = 0;
  let firstUnsupportedSegment = null;
  let failureProgress = null;
  let generation = 0;
  let resetElapsedSeconds = TRAIN_RESET_TIMES_SECONDS.A;
  let resetPhase = 'COMPLETE';
  let resetRespawned = { A: true, B: true, C: true };
  let resetEventTimes = { C: null, B: null, A: null };
  let frozenResetPoses = [];
  let lastPrepareError = null;
  let railContactProvider = null;
  let contactTimeline = null;
  let unsubscribeTcpSamples = null;
  let contactSubscriptionActive = false;
  let contactPendingError = null;
  let contactLastAdvanceSeconds = 0;
  let contactLastAdvanceSubsteps = 0;
  let lastMeasuredCollider = null;
  let contactSampleCount = 0;
  let contactInputError = null;
  let contactStartForwardMm = null;
  let physicalPushFinished = false;
  const bodiesWithRailContact = new Set();
  const performanceStats = {
    fixedSteps: 0,
    positioningSteps: 0,
    pushingSteps: 0,
    supportedSteps: 0,
    physicsSteps: 0,
    resetSteps: 0,
    idleStepCalls: 0,
    maximumStepMs: 0,
    lastStepMs: 0,
    collisionPrepareCount: 0,
    collisionReuseCount: 0
  };

  function emit(reason) {
    const snapshot = reason === 'STEP' ? null : getSnapshot();
    for (const listener of listeners) {
      try { listener(snapshot, reason); } catch {}
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function rebuildInitial(assign = true) {
    definitions = makeBodyDefinitions(plan, routeFrame, trainProfile);
    initialPoses = createInitialPoses(plan, routeFrame, definitions, trainProfile);
    if (assign) poses = cloneValue(initialPoses);
    pusherStartLocalPose = computePusherStartLocalPose();
    pusherLocalPose = physicalContact ? readTcpCollider() : cloneValue(pusherStartLocalPose);
    pusherAdapter.setVisible(pusherVisible);
    pusherAdapter.reset(pusherPublicPose(pusherStartLocalPose));
  }

  function pusherSizeMm() {
    if (trainProfile.pusherSizeMm) return positiveSize(trainProfile.pusherSizeMm, 'trainProfile.pusherSizeMm');
    const cell = plan ? plan.geometry.grid.dx * routeFrame.worldTransform.scale : 20;
    return {
      x: Math.max(28, cell * 1.55),
      y: Math.max(38, cell * 2.25),
      z: Math.max(34, cell * 2.05)
    };
  }

  function computePusherStartLocalPose() {
    if (!initialPoses.length) return null;
    const rear = initialPoses[2];
    const size = pusherSizeMm();
    let rotation = eulerDegreesToQuaternion(pusherRotationDeg);
    if (physicalContact) {
      // A target is a requested TCP frame, never a separately animated proxy.
      // An explicit profile quaternion is in machine coordinates; otherwise
      // retain the live robot's feasible fixed-tool orientation.
      const machineRotation = trainProfile.pusherRotationQuaternion ?? pusherAdapter.getPose()?.rotationQuaternion;
      if (!machineRotation || !['x', 'y', 'z', 'w'].every(axis => Number.isFinite(machineRotation[axis]))
        || Math.hypot(machineRotation.x, machineRotation.y, machineRotation.z, machineRotation.w) < 1e-9) {
        throw new TypeError('A finite authoritative TCP target orientation is required.');
      }
      rotation = multiplyQuaternions(conjugateQuaternion(routeFrame.routeQuaternion), normaliseQuaternion(machineRotation));
    }
    const halfForward = physicalContact ? boxRadiusAlong({ size, rotation }, { x: 1, y: 0, z: 0 }) : size.x * 0.5;
    return {
      position: {
        x: rear.position.x - rear.size.x * 0.5 - halfForward - pusherClearanceMm + pusherOffsetMm.xMm,
        y: (physicalContact ? rear.position.y : size.y * 0.5) + pusherOffsetMm.yMm,
        z: pusherOffsetMm.zMm
      },
      rotation
    };
  }

  function pusherPublicPose(localPose) {
    if (!localPose || !routeFrame) return null;
    return {
      frame: 'main-demo-machine-mm',
      positionMm: routeLocalPointToMachine(routeFrame, localPose.position),
      rotationQuaternion: routeLocalQuaternionToMachine(routeFrame, localPose.rotation),
      rotationDeg: cloneValue(pusherRotationDeg),
      routeTangent: cloneValue(routeFrame.forward),
      rearContactOffsetMm: initialPoses[2]?.size.x * 0.5 || 0,
      clearanceMm: pusherClearanceMm
    };
  }

  function refreshContext({ refreshSupport = true } = {}) {
    plan = options.getFrozenBuildPlan();
    boardSnapshot = createAcceptedBuildBoardSnapshot(options.getAcceptedBuildBoardSnapshot());
    worldTransform = getWorldTransform();
    supportMap = refreshSupport ? options.supportMapAdapter.refresh() : options.supportMapAdapter.getMap();
    if (!supportMap?.ready || !supportMap.routeFrame) throw new Error('Rail support map is not ready.');
    routeFrame = createRouteFrame({ frozenBuildPlan: plan, worldTransform });
    refreshRailContacts();
  }

  function refreshRailContacts() {
    railContactProvider = physicalContact
      ? createAcceptedRailContactProvider({ plan, boardSnapshot, supportMap, routeFrame }) : null;
  }

  function readTcpCollider() {
    return tcpPoseToRouteCollider(routeFrame, pusherAdapter.getPose(), pusherSizeMm());
  }

  function actualPusherAtStart() {
    if (!physicalContact) return pusherAdapter.isAtTarget(pusherPublicPose(pusherStartLocalPose), {
      positionToleranceMm: 0.5, rotationToleranceRad: 0.25 * Math.PI / 180
    });
    try {
      const actual = readTcpCollider();
      return Math.hypot(...['x', 'y', 'z'].map(axis => actual.position[axis] - pusherStartLocalPose.position[axis])) <= 0.25
        && quaternionAngularError(actual.rotation, pusherStartLocalPose.rotation) <= Math.PI / 720;
    } catch { return false; }
  }

  function resetPhysicalContact({ initializeBodies = true } = {}) {
    disconnectTcpSamples();
    contactTimeline = null;
    contactPendingError = null;
    contactLastAdvanceSeconds = 0;
    contactLastAdvanceSubsteps = 0;
    lastMeasuredCollider = null;
    contactSampleCount = 0;
    contactInputError = null;
    contactStartForwardMm = null;
    physicalPushFinished = false;
    bodiesWithRailContact.clear();
    if (physicalContact && initializeBodies) {
      // No launch kick: all motion after this allocation belongs to this same
      // three-body/two-coupler physics island and measured contacts.
      poses = physics.promote(initialPoses, 0, {
        angularVelocities: initialPoses.map(() => vector()),
        lateralSpeedsMmPerSecond: [0, 0, 0], verticalSpeedsMmPerSecond: [0, 0, 0]
      });
    }
  }

  function resetPerformance() {
    for (const key of Object.keys(performanceStats)) performanceStats[key] = 0;
    recorder.reset();
    physics.resetPerformanceReport?.();
  }

  function setReadyState(reason = 'RESET_COMPLETE') {
    poses = cloneValue(initialPoses);
    physics.reset();
    resetPhysicalContact();
    pusherStartLocalPose = computePusherStartLocalPose();
    pusherLocalPose = physicalContact ? readTcpCollider() : cloneValue(pusherStartLocalPose);
    pusherAdapter.setVisible(pusherVisible);
    pusherAdapter.reset(pusherPublicPose(pusherStartLocalPose));
    pusherEngaged = false;
    profile = null;
    pushElapsedSeconds = 0;
    pushDistanceTravelledMm = 0;
    currentSpeedMmPerSecond = 0;
    currentAccelerationMmPerSecondSquared = 0;
    elapsedSeconds = 0;
    fallingElapsedSeconds = 0;
    settledElapsedSeconds = 0;
    firstUnsupportedSegment = null;
    failureProgress = null;
    resetElapsedSeconds = TRAIN_RESET_TIMES_SECONDS.A;
    resetPhase = 'COMPLETE';
    resetRespawned = { A: true, B: true, C: true };
    resetEventTimes = { C: null, B: null, A: null };
    frozenResetPoses = [];
    state = TRAIN_STATES.READY;
    emit(reason);
  }

  function initializeContext() {
    refreshContext();
    rebuildInitial(true);
    generation += 1;
    setReadyState('INITIAL_READY');
  }

  function assertEditable() {
    if (![TRAIN_STATES.READY, TRAIN_STATES.PUSH_READY, TRAIN_STATES.STOPPED].includes(state)) {
      throw new Error(`Train motion settings cannot change in ${state}.`);
    }
  }

  function setTrainSpeed(value) {
    assertEditable();
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new RangeError('trainSpeedMmPerSecond must be positive.');
    trainSpeedMmPerSecond = clamp(number, 1, 2000);
    profile = null;
    emit('TRAIN_SPEED');
    return trainSpeedMmPerSecond;
  }

  function setPushDistance(value) {
    assertEditable();
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new RangeError('pushDistanceMm must be positive.');
    pushDistanceMm = clamp(number, 1, 1000);
    profile = null;
    emit('PUSH_DISTANCE');
    return pushDistanceMm;
  }

  function setPusherOffset(value = {}) {
    assertEditable();
    pusherOffsetMm = {
      xMm: Number.isFinite(Number(value.xMm)) ? Number(value.xMm) : pusherOffsetMm.xMm,
      yMm: Number.isFinite(Number(value.yMm)) ? Number(value.yMm) : pusherOffsetMm.yMm,
      zMm: Number.isFinite(Number(value.zMm)) ? Number(value.zMm) : pusherOffsetMm.zMm
    };
    pusherStartLocalPose = computePusherStartLocalPose();
    pusherLocalPose = physicalContact ? readTcpCollider() : cloneValue(pusherStartLocalPose);
    pusherAdapter.reset(pusherPublicPose(pusherStartLocalPose));
    emit('PUSHER_OFFSET');
    return cloneValue(pusherOffsetMm);
  }

  function setPusherRotation(value = {}) {
    assertEditable();
    if (physicalContact) throw new Error('TCP contact orientation belongs to the robot; use a validated machine-frame trainProfile target.');
    pusherRotationDeg = {
      xDeg: Number.isFinite(Number(value.xDeg)) ? Number(value.xDeg) : pusherRotationDeg.xDeg,
      yDeg: Number.isFinite(Number(value.yDeg)) ? Number(value.yDeg) : pusherRotationDeg.yDeg,
      zDeg: Number.isFinite(Number(value.zDeg)) ? Number(value.zDeg) : pusherRotationDeg.zDeg
    };
    pusherStartLocalPose = computePusherStartLocalPose();
    pusherLocalPose = cloneValue(pusherStartLocalPose);
    pusherAdapter.reset(pusherPublicPose(pusherStartLocalPose));
    emit('PUSHER_ROTATION');
    return cloneValue(pusherRotationDeg);
  }

  function setPusherVisible(value) {
    pusherVisible = Boolean(value);
    pusherAdapter.setVisible(pusherVisible);
    emit('PUSHER_VISIBLE');
    return pusherVisible;
  }

  function getPushTimeSeconds() { return 2 * pushDistanceMm / trainSpeedMmPerSecond; }

  function setAnalyticTrain(leadForwardMm, speedMmPerSecond, accelerationMmPerSecondSquared) {
    const cellForwardMm = plan.geometry.grid.dx * routeFrame.worldTransform.scale;
    const gapMm = Math.max(8, cellForwardMm * 0.8);
    let prior = null;
    for (let index = 0; index < poses.length; index += 1) {
      const pose = poses[index];
      if (index === 0) pose.position.x = leadForwardMm;
      else pose.position.x = prior.position.x - prior.size.x * 0.5 - gapMm - pose.size.x * 0.5;
      pose.position.y = pose.size.y * 0.5;
      pose.position.z = 0;
      pose.rotation = identityQuaternion();
      pose.linearVelocity = { x: speedMmPerSecond, y: 0, z: 0 };
      pose.angularVelocity = vector();
      pose.contacts = 0;
      pose.resting = false;
      pose.collisionKind = 'supported-route';
      prior = pose;
    }
    currentSpeedMmPerSecond = speedMmPerSecond;
    currentAccelerationMmPerSecondSquared = accelerationMmPerSecondSquared;
  }

  function movePusher(distanceMm, speedMmPerSecond, accelerationMmPerSecondSquared) {
    pusherLocalPose = cloneValue(pusherStartLocalPose);
    pusherLocalPose.position.x += distanceMm;
    pusherAdapter.setPose?.(pusherPublicPose(pusherLocalPose));
    pushDistanceTravelledMm = distanceMm;
    currentSpeedMmPerSecond = speedMmPerSecond;
    currentAccelerationMmPerSecondSquared = accelerationMmPerSecondSquared;
  }

  function supportLossAtLead() {
    const lead = poses[0];
    if (!lead) return null;
    const frontForwardMm = lead.position.x + lead.size.x * 0.46;
    const segment = segmentAtRouteDistance(supportMap, frontForwardMm);
    return segment && !segment.supported ? segment : null;
  }

  function beginFall(segment, speedMmPerSecond) {
    firstUnsupportedSegment = segment || supportMap.segments.find((item) => !item.supported) || null;
    const lead = poses[0];
    const front = lead.position.x + lead.size.x * 0.46;
    failureProgress = round6(routeProgress(routeFrame, front));
    if (pusherEngaged) {
      pusherEngaged = false;
      pusherAdapter.onPushEnd({ reason: 'SUPPORT_LOST', speedMmPerSecond });
    }
    if (!physicalContact) {
      physics.setCollisionSnapshot(collisionSnapshot);
      poses = physics.promote(poses, speedMmPerSecond);
    }
    fallingElapsedSeconds = 0;
    settledElapsedSeconds = 0;
    state = TRAIN_STATES.FALLING;
    emit('SUPPORT_LOST');
  }

  function finishCrossed() {
    disconnectTcpSamples();
    state = TRAIN_STATES.CROSSED;
    result = {
      success: true,
      outcome: 'CROSSED',
      progress: 1,
      elapsedMs: Math.round(elapsedSeconds * 1000),
      supportMapChecksum: supportMap.checksum,
      ...(physicalContact ? { motionMode, crossing: crossingEvidence(), physicalContact: physics.getDiagnostics().physicalContact } : {})
    };
    poses = physicalContact ? physics.freeze() : poses.map(zeroMotion);
    currentSpeedMmPerSecond = 0;
    currentAccelerationMmPerSecondSquared = 0;
    emit('CROSSED');
  }

  function finishFailed(settleTimedOut = false) {
    disconnectTcpSamples();
    poses = physics.freeze();
    state = TRAIN_STATES.FAILED;
    result = {
      success: false,
      outcome: 'TRAIN_FELL',
      cause: 'SUPPORT_LOSS',
      progress: Number.isFinite(failureProgress) ? failureProgress : getProgress(),
      firstUnsupportedSegment: firstUnsupportedSegment?.id ?? supportMap.firstUnsupportedSegment,
      firstUnsupportedProgress: firstUnsupportedSegment?.progressStart ?? supportMap.firstUnsupportedProgress,
      elapsedMs: Math.round(elapsedSeconds * 1000),
      settleTimedOut,
      supportMapChecksum: supportMap.checksum,
      collisionChecksum: collisionSnapshot?.checksum ?? null,
      ...(physicalContact ? { motionMode, crossing: crossingEvidence(), physicalContact: physics.getDiagnostics().physicalContact } : {})
    };
    currentSpeedMmPerSecond = 0;
    currentAccelerationMmPerSecondSquared = 0;
    emit('TRAIN_FELL');
  }

  function prepareTest() {
    if (state !== TRAIN_STATES.READY) return { ok: false, reason: 'TRAIN_NOT_READY', snapshot: getSnapshot() };
    const started = now();
    state = TRAIN_STATES.PREPARING_TEST;
    emit('PREPARING_TEST');
    try {
      plan = options.getFrozenBuildPlan();
      boardSnapshot = createAcceptedBuildBoardSnapshot(options.getAcceptedBuildBoardSnapshot());
      worldTransform = getWorldTransform();
      const gate = preconditions.evaluate({
        frozenBuildPlan: plan,
        acceptedBuildBoardSnapshot: boardSnapshot,
        trainState: TRAIN_STATES.READY
      });
      if (!gate.ok) {
        state = TRAIN_STATES.READY;
        lastPrepareError = gate;
        emit('PRECONDITION_REJECTED');
        return { ok: false, reason: gate.primaryCode, preconditions: gate, snapshot: getSnapshot() };
      }
      supportMap = options.supportMapAdapter.refresh();
      if (!supportMap?.ready || !supportMap.routeFrame) throw new Error('Rail support map is not ready.');
      routeFrame = createRouteFrame({ frozenBuildPlan: plan, worldTransform });
      refreshRailContacts();
      const prepared = options.collisionSnapshotManager.prepare({ includeMergedFaces: true });
      collisionSnapshot = prepared.snapshot;
      collisionPrepareReport = prepared.report;
      if (prepared.report?.reused) performanceStats.collisionReuseCount += 1;
      else performanceStats.collisionPrepareCount += 1;
      physics.setCollisionSnapshot(collisionSnapshot);
      rebuildInitial(true);
      resetPhysicalContact();
      result = null;
      profile = null;
      pushElapsedSeconds = 0;
      pushDistanceTravelledMm = 0;
      currentSpeedMmPerSecond = 0;
      currentAccelerationMmPerSecondSquared = 0;
      elapsedSeconds = 0;
      fallingElapsedSeconds = 0;
      settledElapsedSeconds = 0;
      firstUnsupportedSegment = null;
      failureProgress = null;
      pusherStartLocalPose = computePusherStartLocalPose();
      pusherLocalPose = physicalContact ? readTcpCollider() : cloneValue(pusherStartLocalPose);
      pusherAdapter.setTargetPose(pusherPublicPose(pusherStartLocalPose));
      state = TRAIN_STATES.POSITIONING_PUSHER;
      const prepareMs = now() - started;
      recorder.record('prepareTestMs', prepareMs);
      emit('POSITIONING_PUSHER');
      if (!physicalContact && actualPusherAtStart()) {
        state = TRAIN_STATES.PUSH_READY;
        emit('PUSH_READY');
      }
      lastPrepareError = null;
      return { ok: true, prepareMs, collision: cloneValue(collisionPrepareReport), snapshot: getSnapshot() };
    } catch (error) {
      state = TRAIN_STATES.READY;
      lastPrepareError = { ok: false, primaryCode: 'PREPARE_FAILED', failures: [{ code: 'PREPARE_FAILED', message: error.message }] };
      emit('PREPARE_FAILED');
      return { ok: false, reason: 'PREPARE_FAILED', message: error.message, snapshot: getSnapshot() };
    }
  }

  function notifyPusherReady(pose) {
    // Contact readiness is observed in snapshots, but only the owned robot
    // stroke's onAtStart callback may arm its physics through armPhysicalPush.
    if (physicalContact) return getSnapshot();
    pusherAdapter.notifyReady(pose || pusherPublicPose(pusherStartLocalPose));
    if (state === TRAIN_STATES.POSITIONING_PUSHER) {
      state = TRAIN_STATES.PUSH_READY;
      emit('PUSH_READY_EXTERNAL');
    }
    return getSnapshot();
  }

  function pushEvent() {
    if (state !== TRAIN_STATES.PUSH_READY) return { ok: false, reason: 'PUSHER_NOT_READY', snapshot: getSnapshot() };
    if (physicalContact && !actualPusherAtStart()) {
      state = TRAIN_STATES.POSITIONING_PUSHER;
      emit('PUSH_POSE_CHANGED');
      return { ok: false, reason: 'PUSHER_NOT_AT_START', snapshot: getSnapshot() };
    }
    profile = physicalContact ? null : createPushProfile({ pushDistanceMm, trainSpeedMmPerSecond });
    if (physicalContact) {
      try {
        const sample = pusherAdapter.getSample();
        const initial = checkedTcpSample(sample);
        if (sample.moving !== false) throw new Error('The authoritative TCP must be stationary when contact is armed.');
        disconnectTcpSamples();
        contactTimeline = createKinematicContactTimeline({ bodies: poses, initial, observedTimeSeconds: sample.observedTimeSeconds });
        contactPendingError = null;
        contactInputError = null;
        contactSubscriptionActive = true;
        unsubscribeTcpSamples = pusherAdapter.subscribe(raw => {
          if (!contactSubscriptionActive || contactPendingError) return;
          try { contactTimeline.recordSource(checkedTcpSample(raw)); }
          catch (error) { contactPendingError = error; }
        });
        if (typeof unsubscribeTcpSamples !== 'function') throw new TypeError('The TCP subscription must provide cleanup.');
        if (contactPendingError) throw contactPendingError;
        lastMeasuredCollider = measuredKinematicCollider(initial, initial, TRAIN_FIXED_DT_SECONDS);
        contactStartForwardMm = initial.position.x;
        elapsedSeconds = 0;
      } catch (error) {
        disconnectTcpSamples();
        return { ok: false, reason: 'INVALID_TCP_SAMPLE', message: error.message, snapshot: getSnapshot() };
      }
    }
    pushElapsedSeconds = 0;
    pushDistanceTravelledMm = 0;
    currentSpeedMmPerSecond = 0;
    currentAccelerationMmPerSecondSquared = 0;
    pusherEngaged = true;
    pusherAdapter.onPushStart({ pushDistanceMm, trainSpeedMmPerSecond,
      durationSeconds: physicalContact ? null : profile.durationSeconds, motionMode });
    state = TRAIN_STATES.PUSHING;
    emit('PUSH_START');
    return { ok: true, snapshot: getSnapshot() };
  }

  function startTest() {
    const prepared = prepareTest();
    if (!prepared.ok) return prepared;
    if (physicalContact || state !== TRAIN_STATES.PUSH_READY) return { ok: true, waitingForPusher: true, snapshot: getSnapshot() };
    return pushEvent();
  }

  function positioningStep({ armPhysical = false } = {}) {
    if (physicalContact && !armPhysical) return;
    if (actualPusherAtStart()) {
      state = TRAIN_STATES.PUSH_READY;
      emit('PUSH_READY');
    }
  }

  function armPhysicalPush() {
    if (!physicalContact) return { ok: false, reason: 'TCP_CONTACT_MODE_REQUIRED', snapshot: getSnapshot() };
    if (state === TRAIN_STATES.POSITIONING_PUSHER) positioningStep({ armPhysical: true });
    return pushEvent();
  }

  function finishPhysicalPush({ reason = 'TCP_STROKE_COMPLETE' } = {}) {
    if (!physicalContact) return { ok: false, reason: 'TCP_CONTACT_MODE_REQUIRED', snapshot: getSnapshot() };
    if (![TRAIN_STATES.PUSHING, TRAIN_STATES.RUNNING_SUPPORTED, TRAIN_STATES.FALLING].includes(state)) {
      return { ok: false, reason: 'NO_ACTIVE_PHYSICAL_PUSH', snapshot: getSnapshot() };
    }
    physicalPushFinished = true;
    if (pusherEngaged) pusherAdapter.onPushEnd({ reason, speedMmPerSecond: currentSpeedMmPerSecond, motionMode });
    pusherEngaged = false;
    if (state === TRAIN_STATES.PUSHING) state = TRAIN_STATES.RUNNING_SUPPORTED;
    emit('TCP_PUSH_COMPLETE');
    return { ok: true, snapshot: getSnapshot() };
  }

  function checkedTcpSample(sample = pusherAdapter.getSample()) {
    if (!Number.isFinite(sample?.sampleTimeSeconds) || sample.sampleTimeSeconds < 0
      || !Number.isSafeInteger(sample?.sequence) || sample.sequence < 0) {
      throw new TypeError('TCP contact requires a finite monotonic timestamp and sample sequence.');
    }
    const sampled = tcpPoseToRouteCollider(routeFrame, sample, pusherSizeMm());
    const actual = readTcpCollider();
    if (Math.hypot(...['x', 'y', 'z'].map(axis => sampled.position[axis] - actual.position[axis])) > 1e-6
      || quaternionAngularError(sampled.rotation, actual.rotation) > 1e-6) {
      throw new Error('The sampled TCP collider does not match the authoritative robot pose.');
    }
    return sampled;
  }

  function disconnectTcpSamples() {
    contactSubscriptionActive = false;
    const unsubscribe = unsubscribeTcpSamples;
    unsubscribeTcpSamples = null;
    if (typeof unsubscribe === 'function') unsubscribe();
  }

  function getContactTiming() {
    if (!physicalContact || !contactTimeline) return null;
    return { ...contactTimeline.getSnapshot(), tracking: contactSubscriptionActive,
      lastAdvanceSeconds: contactLastAdvanceSeconds, lastAdvanceSubsteps: contactLastAdvanceSubsteps };
  }

  function samplePhysicalContact() {
    if (!physicalContact || !contactSubscriptionActive) return false;
    try {
      if (contactPendingError) throw contactPendingError;
      const sample = pusherAdapter.getSample();
      const collider = checkedTcpSample(sample);
      contactTimeline.observe({ collider, observedTimeSeconds: sample.observedTimeSeconds, moving: sample.moving });
      pusherLocalPose = collider;
      return true;
    } catch (error) {
      contactInputError = error.message;
      contactPendingError = error;
      finishPhysicalFailure(error.code === 'TCP_SAMPLE_BACKLOG' ? error.code : 'INVALID_TCP_SAMPLE', 'TRAIN_CONTACT_FAILED', error.message);
      return false;
    }
  }

  function crossingEvidence() {
    const diagnostics = physics.getDiagnostics();
    const rail = railContactProvider?.getSummary() ?? null;
    const trailingExtents = poses.map(pose => ({
      id: pose.id,
      forwardMm: pose.position.x - boxRadiusAlong(pose, { x: 1, y: 0, z: 0 })
    }));
    return {
      requiredExitForwardMm: routeFrame?.lengthMm ?? null,
      trailingExtents,
      allBodiesClearExit: poses.length === 3 && trailingExtents.every(item => item.forwardMm >= routeFrame.lengthMm),
      continuousAcceptedRoute: rail?.allSupported === true && rail?.allRequiredPartsAccepted === true,
      allBodiesHadRailContact: poses.length === 3 && poses.every(pose => bodiesWithRailContact.has(pose.id)),
      allBodiesCurrentlySupported: poses.length === 3 && poses.every(pose => pose.groundContact || pose.railContact),
      allBodiesUpright: poses.length === 3 && poses.every(pose => {
        const axes = bodyAxes(pose);
        return dot(axes[1], { x: 0, y: 1, z: 0 }) >= Math.cos(Math.PI / 12)
          && dot(axes[0], { x: 1, y: 0, z: 0 }) >= Math.cos(Math.PI / 12);
      }),
      hasMeasuredContactImpulse: diagnostics.physicalContact.impulseCount > 0,
      noBodyIntersection: diagnostics.currentMaximumBodyOverlapDepthMm <= 0.1,
      noSolidObstruction: diagnostics.physicalContact.solidCollisionCount === 0,
      measuredTimelineCaughtUp: Boolean(contactTimeline && !contactPendingError
        && contactTimeline.getSnapshot().lagSeconds <= TCP_CONTACT_LIMITS.timeEpsilonSeconds)
    };
  }

  function finishPhysicalFailure(cause, outcome = 'TRAIN_BLOCKED', message = null) {
    disconnectTcpSamples();
    if (pusherEngaged) pusherAdapter.onPushEnd({ reason: cause, speedMmPerSecond: currentSpeedMmPerSecond, motionMode });
    pusherEngaged = false;
    poses = physics.freeze();
    state = TRAIN_STATES.FAILED;
    result = {
      success: false, outcome, cause, message, motionMode, progress: getProgress(),
      elapsedMs: Math.round(elapsedSeconds * 1000), supportMapChecksum: supportMap.checksum,
      collisionChecksum: collisionSnapshot?.checksum ?? null,
      crossing: crossingEvidence(), physicalContact: physics.getDiagnostics().physicalContact
    };
    currentSpeedMmPerSecond = 0;
    currentAccelerationMmPerSecondSquared = 0;
    emit(outcome);
  }

  function contactStep(budgetSeconds, { sampleContact = true } = {}) {
    contactLastAdvanceSeconds = 0;
    contactLastAdvanceSubsteps = 0;
    if (!(Number.isFinite(budgetSeconds) && budgetSeconds > 0)) {
      throw contactError('TCP_CONTACT_STEP_UNBOUNDED', 'A positive contact integration budget is required.');
    }
    if (sampleContact && !samplePhysicalContact()) return false;
    if (!contactTimeline || !contactSubscriptionActive) return false;
    while (contactLastAdvanceSeconds + TCP_CONTACT_LIMITS.timeEpsilonSeconds < budgetSeconds
      && contactLastAdvanceSubsteps < TCP_CONTACT_LIMITS.maximumSubstepsPerTick && contactSubscriptionActive) {
      const priorSpeed = currentSpeedMmPerSecond;
      let slice;
      try {
        if (contactPendingError) throw contactPendingError;
        slice = contactTimeline.nextSlice(budgetSeconds - contactLastAdvanceSeconds);
        if (!slice) break;
        poses = physics.step(slice.durationSeconds, { motionMode, surfaceProvider, solidContactProvider,
          railContactProvider, kinematicCollider: slice.collider });
        contactTimeline.commit(slice);
      } catch (error) {
        contactInputError = error.message;
        contactPendingError = error;
        finishPhysicalFailure(error.code || 'CONTACT_QUERY_FAILED', 'TRAIN_CONTACT_FAILED', error.message);
        return false;
      }
      lastMeasuredCollider = slice.collider;
      contactSampleCount = contactTimeline.getSnapshot().consumedSampleCount;
      contactLastAdvanceSeconds += slice.durationSeconds;
      contactLastAdvanceSubsteps += 1;
      elapsedSeconds += slice.durationSeconds;
      pushDistanceTravelledMm = Math.max(pushDistanceTravelledMm, slice.collider.position.x - contactStartForwardMm);
      try { evaluateContactStep(slice.durationSeconds, priorSpeed); }
      catch (error) {
        contactInputError = error.message;
        contactPendingError = error;
        finishPhysicalFailure(error.code || 'CONTACT_OBSERVATION_FAILED', 'TRAIN_CONTACT_FAILED', error.message);
        return false;
      }
    }
    return contactLastAdvanceSubsteps > 0;
  }

  function evaluateContactStep(dt, priorSpeed) {
    currentSpeedMmPerSecond = poses.reduce((sum, pose) => sum + pose.linearVelocity.x, 0) / poses.length;
    currentAccelerationMmPerSecondSquared = (currentSpeedMmPerSecond - priorSpeed) / dt;
    for (const pose of poses) {
      if (pose.railContact && pose.railSupport?.fullyOnRoute) bodiesWithRailContact.add(pose.id);
    }
    const diagnostics = physics.getDiagnostics();
    if (diagnostics.physicalContact.solidCollisionCount > 0) {
      finishPhysicalFailure('TERRAIN_OBSTRUCTION', 'TRAIN_COLLIDED');
      return;
    }
    if (state === TRAIN_STATES.FALLING) {
      updateFallingResult(dt);
      return;
    }
    const fallen = poses.find(pose => {
      const bottom = pose.position.y - boxRadiusAlong(pose, { x: 0, y: 1, z: 0 });
      const axes = bodyAxes(pose);
      return bottom < -2 || dot(axes[1], { x: 0, y: 1, z: 0 }) < Math.cos(Math.PI / 12)
        || dot(axes[0], { x: 1, y: 0, z: 0 }) < Math.cos(Math.PI / 12);
    });
    if (fallen) {
      const missingId = fallen.railSupport?.missing?.[0]?.segmentId;
      beginFall(supportMap.segments.find(segment => segment.id === missingId) ?? null, currentSpeedMmPerSecond);
      return;
    }
    if (state === TRAIN_STATES.PUSHING) {
      pushElapsedSeconds += dt;
      const adapter = pusherAdapter.getSnapshot();
      const strokeEnded = ['retract', 'retreat', 'complete'].includes(adapter.motion?.stage)
        || adapter.pushing === false || pushDistanceTravelledMm >= pushDistanceMm - 1e-6;
      if (strokeEnded) finishPhysicalPush();
    }
    const crossing = crossingEvidence();
    if (crossing.allBodiesClearExit) {
      if (Object.values(crossing).filter(value => typeof value === 'boolean').every(Boolean)) finishCrossed();
      else if (!crossing.continuousAcceptedRoute || !crossing.allBodiesHadRailContact) {
        finishPhysicalFailure('UNPROVEN_CONTINUOUS_RAIL_SUPPORT');
      }
    }
    if ([TRAIN_STATES.PUSHING, TRAIN_STATES.RUNNING_SUPPORTED].includes(state) && elapsedSeconds >= contactTestTimeoutSeconds) {
      finishPhysicalFailure('CROSSING_TIMEOUT', 'TRAIN_STALLED');
    }
  }

  function pushingStep(dt) {
    pushElapsedSeconds = Math.min(profile.durationSeconds, pushElapsedSeconds + dt);
    const sample = profile.sample(pushElapsedSeconds);
    movePusher(sample.distanceMm, sample.speedMmPerSecond, sample.accelerationMmPerSecondSquared);
    setAnalyticTrain(
      initialPoses[0].position.x + sample.distanceMm,
      sample.speedMmPerSecond,
      sample.accelerationMmPerSecondSquared
    );
    const unsupported = supportLossAtLead();
    if (unsupported) {
      beginFall(unsupported, sample.speedMmPerSecond);
      return;
    }
    if (sample.complete) {
      movePusher(pushDistanceMm, trainSpeedMmPerSecond, 0);
      setAnalyticTrain(initialPoses[0].position.x + pushDistanceMm, trainSpeedMmPerSecond, 0);
      pusherEngaged = false;
      pusherAdapter.onPushEnd({ reason: 'PUSH_COMPLETE', speedMmPerSecond: trainSpeedMmPerSecond });
      state = TRAIN_STATES.RUNNING_SUPPORTED;
      emit('PUSH_COMPLETE');
    }
  }

  function supportedStep(dt) {
    const leadForwardMm = poses[0].position.x + trainSpeedMmPerSecond * dt;
    setAnalyticTrain(leadForwardMm, trainSpeedMmPerSecond, 0);
    const unsupported = supportLossAtLead();
    if (unsupported) {
      beginFall(unsupported, trainSpeedMmPerSecond);
      return;
    }
    const successForwardMm = routeFrame.lengthMm + routeFrame.exitLengthMm * 0.5;
    if (poses[0].position.x >= successForwardMm) finishCrossed();
  }

  function fallingStep(dt) {
    poses = physics.step(dt, { surfaceProvider });
    updateFallingResult(dt);
  }

  function updateFallingResult(dt) {
    fallingElapsedSeconds += dt;
    const diagnostics = physics.getDiagnostics();
    const motionSettled = poses.length === 3 && poses.every((pose) => (
      length(pose.linearVelocity) <= 22
      && length(pose.angularVelocity) <= 0.55
    ));
    const hasStaticContact = poses.some((pose) => pose.contacts > 0 || pose.resting);
    const noSelfIntersection = diagnostics.currentMaximumBodyOverlapDepthMm <= 0.1;
    const consistSettled = motionSettled && hasStaticContact && noSelfIntersection;
    settledElapsedSeconds = consistSettled ? settledElapsedSeconds + dt : 0;
    if (settledElapsedSeconds + 1e-9 >= settleRequiredSeconds) finishFailed(false);
    else if (fallingElapsedSeconds + 1e-9 >= settleTimeoutSeconds) finishFailed(true);
  }

  function resetStep(dt) {
    resetElapsedSeconds = Math.min(TRAIN_RESET_TIMES_SECONDS.A, resetElapsedSeconds + dt);
    if (!resetRespawned.B && resetElapsedSeconds + 1e-9 >= TRAIN_RESET_TIMES_SECONDS.B) {
      poses[1] = zeroMotion(initialPoses[1]);
      resetRespawned.B = true;
      resetEventTimes.B = resetElapsedSeconds;
      resetPhase = 'B_RESPAWNED_WAITING_A';
      emit('RESET_B');
    }
    if (!resetRespawned.A && resetElapsedSeconds + 1e-9 >= TRAIN_RESET_TIMES_SECONDS.A) {
      poses[0] = zeroMotion(initialPoses[0]);
      resetRespawned.A = true;
      resetEventTimes.A = resetElapsedSeconds;
      resetPhase = 'COMPLETE';
      setReadyState('RESET_A_READY');
    }
  }

  function step(dt = TRAIN_FIXED_DT_SECONDS, stepOptions = {}) {
    if (dt === 0) {
      if (state === TRAIN_STATES.POSITIONING_PUSHER) positioningStep();
      return false;
    }
    if (!TRAIN_ACTIVE_STEP_STATES.has(state)) {
      performanceStats.idleStepCalls += 1;
      return false;
    }
    const started = now();
    const fixed = clamp(Number(dt) || TRAIN_FIXED_DT_SECONDS, 0.001, 0.05);
    const before = state;
    let advanced = true;
    if (state === TRAIN_STATES.POSITIONING_PUSHER) {
      positioningStep();
      performanceStats.positioningSteps += 1;
    } else if (physicalContact && [TRAIN_STATES.PUSHING, TRAIN_STATES.RUNNING_SUPPORTED, TRAIN_STATES.FALLING].includes(state)) {
      const physicsStepsBefore = physics.getCounts().physicsSteps;
      advanced = contactStep(Number(dt), stepOptions);
      performanceStats.physicsSteps += physics.getCounts().physicsSteps - physicsStepsBefore;
      if (before === TRAIN_STATES.PUSHING) performanceStats.pushingSteps += 1;
      if (before === TRAIN_STATES.RUNNING_SUPPORTED) performanceStats.supportedSteps += 1;
    } else if (state === TRAIN_STATES.PUSHING) {
      pushingStep(fixed);
      performanceStats.pushingSteps += 1;
    } else if (state === TRAIN_STATES.RUNNING_SUPPORTED) {
      supportedStep(fixed);
      performanceStats.supportedSteps += 1;
    } else if (state === TRAIN_STATES.FALLING) {
      fallingStep(fixed);
      performanceStats.physicsSteps += 1;
    } else if (state === TRAIN_STATES.RESETTING) {
      resetStep(fixed);
      performanceStats.resetSteps += 1;
    }
    if (!physicalContact && before !== TRAIN_STATES.RESETTING) elapsedSeconds += fixed;
    performanceStats.fixedSteps += 1;
    performanceStats.lastStepMs = now() - started;
    performanceStats.maximumStepMs = Math.max(performanceStats.maximumStepMs, performanceStats.lastStepMs);
    recorder.record('serviceStepMs', performanceStats.lastStepMs);
    emit('STEP');
    return advanced;
  }

  function runForSeconds(seconds, dt = TRAIN_FIXED_DT_SECONDS) {
    const limit = Math.ceil(Math.max(0, Number(seconds) || 0) / dt);
    for (let index = 0; index < limit && TRAIN_ACTIVE_STEP_STATES.has(state); index += 1) step(dt);
    return getSnapshot();
  }

  function runToTerminal(maxSeconds = 20, dt = TRAIN_FIXED_DT_SECONDS) {
    const limit = Math.ceil(maxSeconds / dt);
    for (let index = 0; index < limit; index += 1) {
      if (![TRAIN_STATES.POSITIONING_PUSHER, TRAIN_STATES.PUSHING, TRAIN_STATES.RUNNING_SUPPORTED, TRAIN_STATES.FALLING].includes(state)) break;
      step(dt);
    }
    return getSnapshot();
  }

  function resetTrain(resetOptions = {}) {
    disconnectTcpSamples();
    const instant = resetOptions === true || Boolean(resetOptions.instant);
    try { refreshContext({ refreshSupport: true }); } catch {}
    result = null;
    if (instant || state === TRAIN_STATES.READY || !poses.length) {
      physics.reset();
      rebuildInitial(true);
      resetPerformance();
      generation += 1;
      setReadyState(instant ? 'RESET_IMMEDIATE' : 'RESET_READY');
      return getSnapshot();
    }
    frozenResetPoses = poses.map(zeroMotion);
    physics.reset();
    resetPhysicalContact({ initializeBodies: false });
    rebuildInitial(false);
    pusherAdapter.reset(pusherPublicPose(pusherStartLocalPose));
    pusherLocalPose = physicalContact ? readTcpCollider() : cloneValue(pusherStartLocalPose);
    pusherEngaged = false;
    profile = null;
    currentSpeedMmPerSecond = 0;
    currentAccelerationMmPerSecondSquared = 0;
    pushDistanceTravelledMm = 0;
    pushElapsedSeconds = 0;
    fallingElapsedSeconds = 0;
    settledElapsedSeconds = 0;
    firstUnsupportedSegment = null;
    failureProgress = null;
    elapsedSeconds = 0;
    resetElapsedSeconds = 0;
    resetPhase = 'C_RESPAWNED_WAITING_B';
    resetRespawned = { A: false, B: false, C: true };
    resetEventTimes = { C: 0, B: null, A: null };
    poses = frozenResetPoses.map(zeroMotion);
    poses[2] = zeroMotion(initialPoses[2]);
    resetPerformance();
    generation += 1;
    state = TRAIN_STATES.RESETTING;
    emit('RESET_C');
    return getSnapshot();
  }

  function runResetToReady(maxSeconds = 2, dt = TRAIN_FIXED_DT_SECONDS) {
    const limit = Math.ceil(maxSeconds / dt);
    for (let index = 0; index < limit && state === TRAIN_STATES.RESETTING; index += 1) step(dt);
    return getSnapshot();
  }

  function refreshSupport() {
    if (state !== TRAIN_STATES.READY) throw new Error('Support can refresh only while TrainService is READY.');
    refreshContext({ refreshSupport: true });
    rebuildInitial(true);
    if (physicalContact) {
      physics.reset();
      resetPhysicalContact();
    }
    generation += 1;
    emit('SUPPORT_REFRESH');
    return supportMap;
  }

  function stopTest() {
    if ([TRAIN_STATES.POSITIONING_PUSHER, TRAIN_STATES.PUSH_READY, TRAIN_STATES.PUSHING, TRAIN_STATES.RUNNING_SUPPORTED, TRAIN_STATES.FALLING].includes(state)) {
      disconnectTcpSamples();
      if (pusherEngaged) pusherAdapter.onPushEnd({ reason: 'STOPPED', speedMmPerSecond: currentSpeedMmPerSecond });
      pusherEngaged = false;
      state = TRAIN_STATES.STOPPED;
      result = { success: false, outcome: 'STOPPED', progress: getProgress(), elapsedMs: Math.round(elapsedSeconds * 1000) };
      poses = physicalContact ? physics.freeze() : poses.map(zeroMotion);
      currentSpeedMmPerSecond = 0;
      currentAccelerationMmPerSecondSquared = 0;
      emit('STOPPED');
    }
    return getSnapshot();
  }

  function analyticCouplers() {
    const pairs = [[0, 1], [1, 2]];
    return pairs.map(([leadIndex, trailingIndex]) => {
      const lead = poses[leadIndex];
      const trailing = poses[trailingIndex];
      if (!lead || !trailing) return null;
      const leadAnchor = {
        x: lead.position.x - lead.size.x * 0.5,
        y: lead.position.y,
        z: lead.position.z
      };
      const trailingAnchor = {
        x: trailing.position.x + trailing.size.x * 0.5,
        y: trailing.position.y,
        z: trailing.position.z
      };
      const distanceMm = Math.hypot(
        trailingAnchor.x - leadAnchor.x,
        trailingAnchor.y - leadAnchor.y,
        trailingAnchor.z - leadAnchor.z
      );
      return {
        id: `${lead.id}-${trailing.id}`,
        leadId: lead.id,
        trailingId: trailing.id,
        leadAnchor,
        trailingAnchor,
        restLengthMm: distanceMm,
        anchorDistanceMm: distanceMm,
        anchorErrorMm: 0,
        correctionMm: 0,
        visible: state !== TRAIN_STATES.RESETTING || resetRespawned[lead.id] === resetRespawned[trailing.id],
        constraintType: 'analytic-spacing'
      };
    }).filter(Boolean);
  }

  function localCouplers() {
    if ((physicalContact || state === TRAIN_STATES.FALLING || state === TRAIN_STATES.FAILED) && physics.getCounts().couplerJoints) {
      return physics.getCouplers();
    }
    return analyticCouplers();
  }

  function publicCouplers() {
    return localCouplers().map((coupler) => ({
      ...cloneValue(coupler),
      routeLocal: {
        leadAnchorMm: { forwardMm: coupler.leadAnchor.x, upMm: coupler.leadAnchor.y, rightMm: coupler.leadAnchor.z },
        trailingAnchorMm: { forwardMm: coupler.trailingAnchor.x, upMm: coupler.trailingAnchor.y, rightMm: coupler.trailingAnchor.z }
      },
      machine: {
        leadAnchorMm: localAnchorToMachine(routeFrame, coupler.leadAnchor),
        trailingAnchorMm: localAnchorToMachine(routeFrame, coupler.trailingAnchor)
      }
    }));
  }

  function getProgress() {
    if (!routeFrame || !poses.length) return 0;
    const forwardMm = physicalContact
      ? Math.min(...poses.map(pose => pose.position.x - boxRadiusAlong(pose, { x: 1, y: 0, z: 0 })))
      : poses[0].position.x;
    return round6(routeProgress(routeFrame, forwardMm));
  }

  function getPusherSnapshot() {
    let adapter, localPose, publicPose, observationError = null;
    try {
      adapter = pusherAdapter.getSnapshot();
      localPose = physicalContact ? tcpPoseToRouteCollider(routeFrame, adapter.pose, pusherSizeMm()) : pusherLocalPose;
      publicPose = physicalContact ? cloneValue(adapter.pose) : pusherPublicPose(pusherLocalPose);
    } catch (error) {
      if (!physicalContact) throw error;
      observationError = error.message;
      adapter = { visible: pusherVisible, sample: null };
      // A failed clock must not hide the failure result or display a historical
      // collider as today's TCP. The pose can still be read independently.
      try {
        publicPose = pusherAdapter.getPose();
        localPose = tcpPoseToRouteCollider(routeFrame, publicPose, pusherSizeMm());
      } catch { publicPose = null; localPose = null; }
    }
    return {
      mode: pusherAdapter.mode,
      visible: pusherVisible && adapter.visible !== false && Boolean(publicPose),
      engaged: pusherEngaged,
      sizeMm: { xMm: pusherSizeMm().x, yMm: pusherSizeMm().y, zMm: pusherSizeMm().z },
      routeLocal: localPose ? {
        positionMm: {
          forwardMm: localPose.position.x,
          upMm: localPose.position.y,
          rightMm: localPose.position.z
        },
        rotationQuaternion: cloneValue(localPose.rotation)
      } : null,
      pose: publicPose,
      targetPose: pusherPublicPose(pusherStartLocalPose),
      offsetMm: cloneValue(pusherOffsetMm),
      rotationDeg: cloneValue(pusherRotationDeg),
      clearanceMm: pusherClearanceMm,
      speedMmPerSecond: physicalContact ? length(lastMeasuredCollider?.linearVelocity ?? vector()) : pusherEngaged ? currentSpeedMmPerSecond : 0,
      accelerationMmPerSecondSquared: pusherEngaged ? currentAccelerationMmPerSecondSquared : 0,
      pushDistanceTravelledMm,
      pushDistanceMm,
      pushTimeSeconds: getPushTimeSeconds(),
      pushElapsedSeconds,
      ...(physicalContact ? {
        authority: 'RobotController.TCP',
        observationError,
        sample: cloneValue(adapter.sample ?? null),
        collider: localPose ? { position: cloneValue(localPose.position), rotation: cloneValue(localPose.rotation), size: pusherSizeMm() } : null,
        startReady: actualPusherAtStart()
      } : {})
    };
  }

  function getCounts() {
    const physicsCounts = physics.getCounts();
    return {
      trainBodies: 3,
      allocatedBodies: poses.length,
      dynamicBodies: physicsCounts.dynamicBodies,
      activePhysicsBodies: physicsCounts.activeBodies,
      physicsContacts: physicsCounts.contacts,
      physicsSteps: physicsCounts.physicsSteps,
      couplerJoints: physicsCounts.couplerJoints,
      visibleCouplers: publicCouplers().filter((coupler) => coupler.visible).length,
      currentMaximumCouplerAnchorErrorMm: physicsCounts.currentMaximumCouplerAnchorErrorMm,
      lifetimeMaximumCouplerAnchorErrorMm: physicsCounts.lifetimeMaximumCouplerAnchorErrorMm,
      currentMaximumBodyOverlapDepthMm: physicsCounts.currentMaximumBodyOverlapDepthMm,
      lifetimeMaximumBodyOverlapDepthMm: physicsCounts.lifetimeMaximumBodyOverlapDepthMm,
      bodyContactCorrectionCount: physicsCounts.bodyContactCorrectionCount,
      generation,
      listenerCount: listeners.size
    };
  }

  function getPerformance() {
    return {
      ...performanceStats,
      fixedDtSeconds: TRAIN_FIXED_DT_SECONDS,
      targetPhysicsHz: 120,
      idlePhysicsLoop: false,
      collisionPrepare: cloneValue(collisionPrepareReport)
    };
  }

  function getSnapshot() {
    const pusher = routeFrame && plan ? getPusherSnapshot() : null;
    return {
      schemaVersion: 'robo-bridge.train-test-snapshot.v2',
      state,
      result: cloneValue(result),
      progress: getProgress(),
      elapsedMs: Math.round(elapsedSeconds * 1000),
      units: { distance: 'mm', speed: 'mm/s', acceleration: 'mm/s^2', angle: 'rad' },
      planIdentity: plan ? { planId: plan.planId, designChecksum: plan.designChecksum, designRevision: plan.designRevision } : null,
      buildBoard: boardSnapshot ? {
        blueprintId: boardSnapshot.blueprintId,
        worldRevision: boardSnapshot.worldRevision,
        acceptedChecksum: boardSnapshot.acceptedChecksum
      } : null,
      routeFrame: cloneValue(routeFrame),
      motion: {
        mode: motionMode,
        trainSpeedMmPerSecond,
        currentSpeedMmPerSecond,
        currentAccelerationMmPerSecondSquared,
        pushDistanceMm,
        pushTimeSeconds: getPushTimeSeconds(),
        pushElapsedSeconds,
        pushDistanceTravelledMm,
        profile: cloneValue(trainProfile)
      },
      pusher,
      support: supportMap ? {
        segmentCount: supportMap.segmentCount,
        supportedCount: supportMap.supportedCount,
        allSupported: supportMap.allSupported,
        firstUnsupportedSegment: supportMap.firstUnsupportedSegment,
        firstUnsupportedProgress: supportMap.firstUnsupportedProgress,
        checksum: supportMap.checksum
      } : null,
      physicalContact: physicalContact ? {
        startReady: pusher?.startReady ?? false,
        sampleCount: contactSampleCount,
        inputError: contactInputError,
        pushFinished: physicalPushFinished,
        sampling: getContactTiming(),
        lastStepCollider: cloneValue(lastMeasuredCollider),
        rail: railContactProvider?.getSummary() ?? null,
        crossing: crossingEvidence(),
        diagnostics: physics.getDiagnostics().physicalContact
      } : null,
      poses: routeFrame ? poses.map((pose) => localPoseToPublic(routeFrame, pose)) : [],
      couplers: routeFrame ? publicCouplers() : [],
      reset: {
        elapsedSeconds: resetElapsedSeconds,
        phase: resetPhase,
        respawned: cloneValue(resetRespawned),
        eventTimes: cloneValue(resetEventTimes),
        thresholds: cloneValue(TRAIN_RESET_TIMES_SECONDS)
      },
      failureDynamics: {
        fallingElapsedSeconds: round6(fallingElapsedSeconds),
        settledElapsedSeconds: round6(settledElapsedSeconds),
        settleRequiredSeconds,
        settleTimeoutSeconds,
        diagnostics: physics.getDiagnostics()
      },
      collision: {
        active: Boolean(collisionSnapshot),
        checksum: collisionSnapshot?.checksum ?? null,
        prepare: cloneValue(collisionPrepareReport)
      },
      preconditions: cloneValue(lastPrepareError),
      counts: getCounts(),
      performance: getPerformance()
    };
  }

  function dispose() {
    disconnectTcpSamples();
    contactTimeline = null;
    physics.reset();
    listeners.clear();
    state = TRAIN_STATES.STOPPED;
    poses = [];
    initialPoses = [];
    definitions = [];
    collisionSnapshot = null;
    supportMap = null;
  }

  initializeContext();

  return Object.freeze({
    subscribe,
    getState: () => state,
    getMotionMode: () => motionMode,
    getContactTiming,
    samplePhysicalContact,
    getResult: () => cloneValue(result),
    getSnapshot,
    getPoses: () => cloneValue(poses),
    getInitialPoses: () => cloneValue(initialPoses),
    getSupportMap: () => supportMap,
    getCollisionSnapshot: () => collisionSnapshot,
    getCollisionPrepareReport: () => cloneValue(collisionPrepareReport),
    getPushStartPose: () => pusherPublicPose(pusherStartLocalPose),
    getCounts,
    getPerformance,
    getDetailedPerformanceReport() {
      return { ...getPerformance(), recorder: recorder.report(), physics: physics.getPerformanceReport() };
    },
    resetPerformanceReport: resetPerformance,
    refreshSupport,
    setSpeed: setTrainSpeed,
    setTrainSpeed,
    setPushDistance,
    setPusherOffset,
    setPusherRotation,
    setPusherVisible,
    prepareTest,
    armPhysicalPush,
    finishPhysicalPush,
    notifyPusherReady,
    pushEvent,
    startTest,
    step,
    runForSeconds,
    runToTerminal,
    resetTrain,
    runResetToReady,
    stopTest,
    dispose
  });
}

export { TRAIN_STATES, TRAIN_FIXED_DT_SECONDS, TRAIN_RESET_TIMES_SECONDS };
