import RAPIER from "../../vendor/rapier/rapier.mjs";
import { DEFAULT_CONFIG, FIXED_DT, normalizeConfig } from "./config.js";
import { getFixture, supportsForFixture } from "./fixtures.js";
import { RailSupportMap, TRACK, createCentreline } from "./track.js";

let rapierReady;

export function initialiseRapier() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

const BODY_LENGTH = 3;
const BODY_WIDTH = 1.36;
const COUPLER_GAP = 0.55;
const GUIDE_OFFSET = BODY_LENGTH * 0.36;
const COLLIDER_CHUNK = 2;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function copyVector(target, source) {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
  return target;
}

function copyRotation(target, source) {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
  target.w = source.w;
  return target;
}

function quaternionFromTangent(tangent) {
  const w = 1 + tangent.x;
  if (w < 1e-7) return { x: 0, y: 1, z: 0, w: 0 };
  const length = Math.hypot(tangent.z, tangent.y, w);
  return { x: 0, y: -tangent.z / length, z: tangent.y / length, w: w / length };
}

function rotateVector(rotation, vector) {
  const { x, y, z, w } = rotation;
  const tx = 2 * (y * vector.z - z * vector.y);
  const ty = 2 * (z * vector.x - x * vector.z);
  const tz = 2 * (x * vector.y - y * vector.x);
  return {
    x: vector.x + w * tx + (y * tz - z * ty),
    y: vector.y + w * ty + (z * tx - x * tz),
    z: vector.z + w * tz + (x * ty - y * tx),
  };
}

function pointVelocity(body, offset) {
  const linear = body.linvel();
  const angular = body.angvel();
  return {
    x: linear.x + angular.y * offset.z - angular.z * offset.y,
    y: linear.y + angular.z * offset.x - angular.x * offset.z,
    z: linear.z + angular.x * offset.y - angular.y * offset.x,
  };
}

function quaternionTiltDegrees(rotation) {
  const up = rotateVector(rotation, { x: 0, y: 1, z: 0 });
  return Math.acos(clamp(up.y, -1, 1)) * 180 / Math.PI;
}

function bodyDescriptor(mode, position) {
  const descriptor = mode === "dynamic"
    ? RAPIER.RigidBodyDesc.dynamic()
    : RAPIER.RigidBodyDesc.kinematicPositionBased();
  return descriptor
    .setTranslation(position.x, position.y, position.z)
    .setLinearDamping(0.08)
    .setAngularDamping(1.35)
    .setCanSleep(true)
    .setCcdEnabled(false);
}

function makeRenderState(body) {
  const translation = body.translation();
  const rotation = body.rotation();
  const position = { x: translation.x, y: translation.y, z: translation.z };
  const quaternion = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
  return {
    previousPosition: { ...position },
    currentPosition: { ...position },
    previousRotation: { ...quaternion },
    currentRotation: { ...quaternion },
  };
}

export class TrainSimulation {
  constructor(options = {}) {
    this.config = normalizeConfig(options.config);
    this.fixtureId = options.fixtureId ?? "A";
    this.centreline = createCentreline(this.config.trackProfile);
    this.world = null;
    this.supportMap = null;
    this.supportColliders = new Map();
    this.bodies = [];
    this.joints = [];
    this.couplerStates = [];
    this.renderStates = [];
    this.running = false;
    this.elapsed = 0;
    this.stepCount = 0;
    this.rapierStepCount = 0;
    this.skippedRapierSteps = 0;
    this.outcome = null;
    this.derailRecorded = false;
    this.stopTimer = 0;
    this.hybridReleased = false;
    this.fixtureEvents = [];
    this.listeners = { derail: new Set(), fall: new Set(), complete: new Set(), support: new Set() };
    this.lastStepMs = 0;
    this.lastStepKind = "idle";
    this.initialTransforms = [];
    this.guideTelemetry = [];
  }

  async initialize() {
    await initialiseRapier();
    this.resetTrain();
    return this;
  }

  configure(changes = {}) {
    this.config = normalizeConfig({ ...this.config, ...changes });
  }

  setFixture(id) {
    this.fixtureId = getFixture(id).id;
    this.resetTrain();
  }

  startTest() {
    if (this.outcome) this.resetTrain();
    this.running = true;
    return this.getSnapshot();
  }

  stopTest() {
    this.running = false;
    if (!this.outcome) this.finish("STOPPED");
    return this.getSnapshot();
  }

  resetTrain() {
    this.#destroyWorld();
    this.centreline = createCentreline(this.config.trackProfile);
    this.supportMap = new RailSupportMap(supportsForFixture(this.fixtureId));
    this.world = new RAPIER.World({ x: 0, y: -this.config.gravity, z: 0 });
    this.world.timestep = FIXED_DT;
    this.world.numSolverIterations = this.config.solverIterations;
    this.#createEnvironment();
    this.#createTrain();
    this.fixtureEvents = getFixture(this.fixtureId).events.map((event) => ({ ...event, fired: false }));
    this.running = false;
    this.elapsed = 0;
    this.stepCount = 0;
    this.rapierStepCount = 0;
    this.skippedRapierSteps = 0;
    this.outcome = null;
    this.derailRecorded = false;
    this.stopTimer = 0;
    this.hybridReleased = this.config.mode === "dynamic";
    this.lastStepMs = 0;
    this.lastStepKind = "idle";
    this.guideTelemetry = this.bodies.flatMap((_, bodyIndex) => [
      { bodyIndex, name: "front", supported: true, release: 1, latched: false, s: 0, position: null },
      { bodyIndex, name: "rear", supported: true, release: 1, latched: false, s: 0, position: null },
    ]);
    this.#updateCouplerStates();
    this.#updateGuideTelemetry(FIXED_DT);
    this.renderStates = this.bodies.map(({ body }) => makeRenderState(body));
    this.initialTransforms = this.getBodyTransforms();
    return this.getSnapshot();
  }

  setRailSupport(segmentId, supported) {
    if (!this.supportMap.setSupport(segmentId, supported)) return false;
    for (const collider of this.supportColliders.get(Number(segmentId)) ?? []) collider.setEnabled(Boolean(supported));
    this.#emit("support", { segmentId: Number(segmentId), supported: Boolean(supported), elapsed: this.elapsed });
    return true;
  }

  restoreAllSupport() {
    for (const segment of this.supportMap.segments) this.setRailSupport(segment.id, true);
  }

  step(dt = FIXED_DT) {
    if (!this.running || this.outcome) return false;
    const started = performance.now();
    this.#capturePreviousRenderState();
    this.#runFixtureEvents();

    let needsRapier = true;
    if (this.config.mode === "hybrid" && !this.hybridReleased) needsRapier = this.#stepAnalytic(dt);
    else this.#applyDynamicControls(dt);

    if (needsRapier) {
      this.world.step();
      this.rapierStepCount += 1;
      this.lastStepKind = "rapier";
    } else {
      this.skippedRapierSteps += 1;
      this.lastStepKind = "analytic";
    }

    this.elapsed += dt;
    this.stepCount += 1;
    this.#updateGuideTelemetry(dt);
    this.#updateCouplerStates();
    this.#captureCurrentRenderState();
    this.#detectEvents(dt);
    this.lastStepMs = performance.now() - started;
    return true;
  }

  runForSeconds(seconds, dt = FIXED_DT) {
    const steps = Math.ceil(seconds / dt);
    for (let index = 0; index < steps && this.running; index += 1) this.step(dt);
    return this.getSnapshot();
  }

  getTrainProgress() {
    const locomotive = this.bodies[0];
    if (!locomotive) return { routeS: TRACK.startS, normalized: 0, elapsed: this.elapsed };
    const routeS = this.config.mode === "hybrid" && !this.hybridReleased
      ? locomotive.routeS
      : this.centreline.project(locomotive.body.translation()).s;
    return { routeS, normalized: this.centreline.progressForS(routeS), elapsed: this.elapsed };
  }

  getTrainLoads() {
    return this.bodies.map((entry, index) => {
      const position = entry.body.translation();
      const mass = index === 0 ? this.config.locomotiveMass : this.config.carriageMass;
      return {
        bodyIndex: index,
        role: entry.role,
        active: true,
        routeS: this.config.mode === "hybrid" && !this.hybridReleased
          ? entry.routeS
          : this.centreline.project(position).s,
        position: { x: position.x, y: position.y, z: position.z },
        approximateMass: mass,
        approximateLoadNewtons: mass * this.config.gravity,
      };
    });
  }

  getLoadPositions() {
    return this.getTrainLoads().map(({ bodyIndex, routeS, position, approximateLoadNewtons }) => ({
      bodyIndex,
      routeS,
      position,
      approximateLoadNewtons,
    }));
  }

  getBodyTransforms() {
    return this.bodies.map(({ body }, bodyIndex) => {
      const translation = body.translation();
      const rotation = body.rotation();
      return {
        bodyIndex,
        translation: { x: translation.x, y: translation.y, z: translation.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
        linearVelocity: { ...body.linvel() },
        angularVelocity: { ...body.angvel() },
      };
    });
  }

  getRenderStates() { return this.renderStates; }
  getCouplerStates() { return this.couplerStates.map((state) => ({ ...state })); }

  getCounts() {
    let sleeping = 0;
    let active = 0;
    this.world?.forEachRigidBody((body) => {
      if (body.isSleeping()) sleeping += 1;
      else active += 1;
    });
    return {
      rigidBodies: this.world?.bodies.len() ?? 0,
      activeRigidBodies: active,
      sleepingBodies: sleeping,
      joints: this.world?.impulseJoints.len() ?? 0,
      trainBodies: this.bodies.length,
    };
  }

  getPerformanceStats() {
    return {
      lastStepMs: this.lastStepMs,
      lastStepKind: this.lastStepKind,
      logicalSteps: this.stepCount,
      rapierSteps: this.rapierStepCount,
      skippedRapierSteps: this.skippedRapierSteps,
      rapierStepRatio: this.stepCount ? this.rapierStepCount / this.stepCount : 0,
    };
  }

  getSnapshot() {
    return {
      running: this.running,
      outcome: this.outcome,
      fixtureId: this.fixtureId,
      progress: this.getTrainProgress(),
      counts: this.getCounts(),
      performance: this.getPerformanceStats(),
      couplers: this.getCouplerStates(),
      supports: this.supportMap?.snapshot() ?? [],
      transforms: this.getBodyTransforms(),
      elapsed: this.elapsed,
      stepCount: this.stepCount,
      lastStepMs: this.lastStepMs,
    };
  }

  onDerail(listener) { this.listeners.derail.add(listener); return () => this.listeners.derail.delete(listener); }
  onFall(listener) { this.listeners.fall.add(listener); return () => this.listeners.fall.delete(listener); }
  onComplete(listener) { this.listeners.complete.add(listener); return () => this.listeners.complete.delete(listener); }
  onSupportChange(listener) { this.listeners.support.add(listener); return () => this.listeners.support.delete(listener); }

  finish(outcome) {
    if (this.outcome) return;
    this.outcome = outcome;
    this.running = false;
    if (outcome === "TRAIN_FELL") this.#emit("fall", this.getSnapshot());
    if (outcome === "CROSSED") this.#emit("complete", this.getSnapshot());
  }

  #createEnvironment() {
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(70, 0.5, 25)
      .setTranslation(0, -8, 0)
      .setFriction(0.8));

    for (const segment of this.supportMap.segments) {
      const colliders = [];
      for (let startS = segment.startS; startS < segment.endS; startS += COLLIDER_CHUNK) {
        const endS = Math.min(segment.endS, startS + COLLIDER_CHUNK);
        const middleS = (startS + endS) / 2;
        const sample = this.centreline.sample(middleS);
        const rotation = quaternionFromTangent(sample.tangent);
        const position = {
          x: sample.position.x - sample.vertical.x * TRACK.railTopY,
          y: sample.position.y - sample.vertical.y * TRACK.railTopY,
          z: sample.position.z - sample.vertical.z * TRACK.railTopY,
        };
        const halfLength = ((endS - startS) / Math.max(0.25, sample.tangent.x)) / 2 - 0.015;
        const descriptor = RAPIER.ColliderDesc.cuboid(halfLength, 0.15, TRACK.deckWidth / 2)
          .setTranslation(position.x, position.y, position.z)
          .setRotation(rotation)
          .setFriction(0.75)
          .setRestitution(0.02)
          .setEnabled(segment.supported);
        colliders.push(this.world.createCollider(descriptor));
      }
      this.supportColliders.set(segment.id, colliders);
    }
  }

  #createTrain() {
    const count = this.config.carriageCount + 1;
    const startHeadS = TRACK.startS + 2 + (count - 1) * (BODY_LENGTH + COUPLER_GAP);
    for (let index = 0; index < count; index += 1) {
      const locomotive = index === 0;
      const halfHeight = locomotive ? 0.62 : 0.5;
      const routeS = startHeadS - index * (BODY_LENGTH + COUPLER_GAP);
      const sample = this.centreline.sample(routeS);
      const position = {
        x: sample.position.x + sample.vertical.x * halfHeight,
        y: sample.position.y + sample.vertical.y * halfHeight,
        z: sample.position.z + sample.vertical.z * halfHeight,
      };
      const body = this.world.createRigidBody(bodyDescriptor(this.config.mode, position));
      const rotation = quaternionFromTangent(sample.tangent);
      body.setRotation(rotation, false);
      body.setLinvel({
        x: sample.tangent.x * this.config.trainSpeed,
        y: sample.tangent.y * this.config.trainSpeed,
        z: sample.tangent.z * this.config.trainSpeed,
      }, false);
      const mass = locomotive ? this.config.locomotiveMass : this.config.carriageMass;
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(BODY_LENGTH / 2, halfHeight, BODY_WIDTH / 2)
          .setMass(mass)
          .setFriction(0.52)
          .setRestitution(0.03),
        body,
      );
      this.bodies.push({ body, collider, halfHeight, routeS, role: locomotive ? "locomotive" : "carriage" });
    }

    for (let index = 0; index < this.bodies.length - 1; index += 1) {
      const jointData = RAPIER.JointData.spring(
        COUPLER_GAP,
        this.config.couplerStiffness,
        this.config.couplerDamping,
        { x: -BODY_LENGTH / 2, y: 0, z: 0 },
        { x: BODY_LENGTH / 2, y: 0, z: 0 },
      );
      this.joints.push(this.world.createImpulseJoint(
        jointData,
        this.bodies[index].body,
        this.bodies[index + 1].body,
        true,
      ));
    }
  }

  #stepAnalytic(dt) {
    for (const entry of this.bodies) {
      entry.routeS += this.config.trainSpeed * dt;
      const sample = this.centreline.sample(entry.routeS);
      const position = {
        x: sample.position.x + sample.vertical.x * entry.halfHeight,
        y: sample.position.y + sample.vertical.y * entry.halfHeight,
        z: sample.position.z + sample.vertical.z * entry.halfHeight,
      };
      entry.body.setTranslation(position, false);
      entry.body.setRotation(quaternionFromTangent(sample.tangent), false);
      entry.body.setLinvel({
        x: sample.tangent.x * this.config.trainSpeed,
        y: sample.tangent.y * this.config.trainSpeed,
        z: sample.tangent.z * this.config.trainSpeed,
      }, false);
    }

    const lostSupport = this.bodies.some((entry) =>
      !this.supportMap.isSupportedAt(entry.routeS + GUIDE_OFFSET)
      || !this.supportMap.isSupportedAt(entry.routeS - GUIDE_OFFSET));
    if (!lostSupport) return false;
    this.#updateGuideTelemetry(dt);
    this.#promoteDynamicIsland();
    return true;
  }

  #promoteDynamicIsland() {
    this.hybridReleased = true;
    for (const entry of this.bodies) {
      const sample = this.centreline.sample(entry.routeS);
      entry.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      entry.body.enableCcd(this.config.ccdOnFailure);
      entry.body.setLinvel({
        x: sample.tangent.x * this.config.trainSpeed,
        y: sample.tangent.y * this.config.trainSpeed,
        z: sample.tangent.z * this.config.trainSpeed,
      }, true);
      entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  #applyDynamicControls(dt) {
    const totalMass = this.config.locomotiveMass + this.config.carriageMass * this.config.carriageCount;
    const locomotive = this.bodies[0].body;
    for (const { body } of this.bodies) {
      body.resetForces(true);
      body.resetTorques(true);
    }

    const locoSample = this.centreline.sample(this.centreline.project(locomotive.translation()).s);
    const locoVelocity = locomotive.linvel();
    const tangentSpeed = locoVelocity.x * locoSample.tangent.x
      + locoVelocity.y * locoSample.tangent.y
      + locoVelocity.z * locoSample.tangent.z;
    const speedError = this.config.trainSpeed - tangentSpeed;
    const traction = clamp(speedError * totalMass * 2.1, -totalMass * this.config.acceleration, totalMass * this.config.acceleration);
    locomotive.addForce({
      x: locoSample.tangent.x * traction,
      y: locoSample.tangent.y * traction,
      z: locoSample.tangent.z * traction,
    }, true);

    this.bodies.forEach((entry, bodyIndex) => {
      const body = entry.body;
      const mass = bodyIndex === 0 ? this.config.locomotiveMass : this.config.carriageMass;
      const rotation = body.rotation();
      const translation = body.translation();
      for (let guideIndex = 0; guideIndex < 2; guideIndex += 1) {
        const direction = guideIndex === 0 ? 1 : -1;
        const local = { x: direction * GUIDE_OFFSET, y: -entry.halfHeight, z: 0 };
        const offset = rotateVector(rotation, local);
        const point = { x: translation.x + offset.x, y: translation.y + offset.y, z: translation.z + offset.z };
        const projection = this.centreline.project(point);
        const sample = this.centreline.sample(projection.s);
        const telemetry = this.guideTelemetry[bodyIndex * 2 + guideIndex];
        const supported = this.supportMap.isSupportedAt(projection.s);
        let release = telemetry?.release ?? 1;
        if (supported && !telemetry?.latched) release = Math.min(1, release + dt * 8);
        else if (this.config.guideReleaseMode === "instant") release = 0;
        else release = Math.max(0, release - dt / this.config.guideReleaseSeconds);
        if (telemetry) {
          telemetry.supported = supported;
          telemetry.release = release;
          telemetry.latched = telemetry.latched || (!supported && release <= 0);
          telemetry.s = projection.s;
          telemetry.position = point;
        }
        if (release <= 0) continue;

        const velocity = pointVelocity(body, offset);
        const lateralVelocity = velocity.x * sample.lateral.x + velocity.y * sample.lateral.y + velocity.z * sample.lateral.z;
        const verticalVelocity = velocity.x * sample.vertical.x + velocity.y * sample.vertical.y + velocity.z * sample.vertical.z;
        const lateralForce = clamp(
          (-this.config.guideStiffness * projection.lateral - this.config.guideDamping * lateralVelocity) * release,
          -mass * 18,
          mass * 18,
        );
        const verticalForce = clamp(
          (-this.config.guideStiffness * projection.vertical - this.config.guideDamping * verticalVelocity) * release,
          -mass * (this.config.gravity + 24),
          mass * (this.config.gravity + 24),
        );
        const force = {
          x: sample.lateral.x * lateralForce + sample.vertical.x * verticalForce,
          y: sample.lateral.y * lateralForce + sample.vertical.y * verticalForce,
          z: sample.lateral.z * lateralForce + sample.vertical.z * verticalForce,
        };
        body.addForceAtPoint(force, point, true);
      }
    });
  }

  #updateGuideTelemetry(dt) {
    this.bodies.forEach((entry, bodyIndex) => {
      if (this.config.mode === "hybrid" && !this.hybridReleased) {
        for (let guideIndex = 0; guideIndex < 2; guideIndex += 1) {
          const direction = guideIndex === 0 ? 1 : -1;
          const s = entry.routeS + direction * GUIDE_OFFSET;
          const sample = this.centreline.sample(s);
          const telemetry = this.guideTelemetry[bodyIndex * 2 + guideIndex];
          telemetry.supported = this.supportMap.isSupportedAt(s);
          telemetry.release = telemetry.supported ? 1 : 0;
          telemetry.latched ||= !telemetry.supported;
          telemetry.s = s;
          telemetry.position = { ...sample.position };
          telemetry.dt = dt;
        }
        return;
      }

      const body = entry.body;
      const rotation = body.rotation();
      const translation = body.translation();
      for (let guideIndex = 0; guideIndex < 2; guideIndex += 1) {
        const direction = guideIndex === 0 ? 1 : -1;
        const local = { x: direction * GUIDE_OFFSET, y: -entry.halfHeight, z: 0 };
        const offset = rotateVector(rotation, local);
        const point = { x: translation.x + offset.x, y: translation.y + offset.y, z: translation.z + offset.z };
        const telemetry = this.guideTelemetry[bodyIndex * 2 + guideIndex];
        const projection = this.centreline.project(point);
        telemetry.supported = this.supportMap.isSupportedAt(projection.s);
        telemetry.s = projection.s;
        telemetry.position = point;
        telemetry.dt = dt;
      }
    });
  }

  #updateCouplerStates() {
    this.couplerStates.length = Math.max(0, this.bodies.length - 1);
    for (let index = 0; index < this.couplerStates.length; index += 1) {
      const lead = this.centreline.sample(this.#routeSForEntry(this.bodies[index])).tangent;
      const trail = this.centreline.sample(this.#routeSForEntry(this.bodies[index + 1])).tangent;
      const leadYaw = Math.atan2(lead.z, lead.x);
      const trailYaw = Math.atan2(trail.z, trail.x);
      const leadPitch = Math.atan2(lead.y, Math.hypot(lead.x, lead.z));
      const trailPitch = Math.atan2(trail.y, Math.hypot(trail.x, trail.z));
      this.couplerStates[index] = {
        leadBody: index,
        trailingBody: index + 1,
        yawRadians: normalizeAngle(trailYaw - leadYaw),
        pitchRadians: normalizeAngle(trailPitch - leadPitch),
        degreesOfFreedom: 2,
      };
    }
  }

  #runFixtureEvents() {
    const progress = this.getTrainProgress().normalized;
    for (const event of this.fixtureEvents) {
      if (event.fired) continue;
      let triggerValue = progress;
      if (event.type === "body-s") {
        const entry = this.bodies[event.bodyIndex];
        triggerValue = entry ? this.#routeSForEntry(entry) : TRACK.startS;
      }
      if (event.type === "route-s") triggerValue = this.getTrainProgress().routeS;
      if (triggerValue < event.at) continue;
      event.fired = true;
      event.segmentIds.forEach((id) => this.setRailSupport(id, false));
    }
  }

  #detectEvents(dt) {
    const locomotive = this.bodies[0].body;
    if (locomotive.translation().y < this.config.failPlaneY) {
      this.finish("TRAIN_FELL");
      return;
    }

    const trainClearedBridge = this.bodies.every((entry) => {
      const position = entry.body.translation();
      const projection = this.centreline.project(position);
      return projection.s >= 24 && projection.vertical > -0.8;
    });
    if (trainClearedBridge && !this.derailRecorded) {
      this.finish("CROSSED");
      return;
    }

    let derailedBody = -1;
    this.bodies.some((entry, bodyIndex) => {
      const position = entry.body.translation();
      const projection = this.centreline.project(position);
      const front = this.guideTelemetry[bodyIndex * 2];
      const rear = this.guideTelemetry[bodyIndex * 2 + 1];
      const bothUnsupported = !front.supported && !rear.supported && front.release < 0.05 && rear.release < 0.05;
      const lateral = Math.abs(projection.lateral) > this.config.lateralDerailThreshold;
      const belowDeck = projection.vertical < -this.config.verticalDerailThreshold;
      const tilted = quaternionTiltDegrees(entry.body.rotation()) > this.config.tiltDerailDegrees;
      if (bothUnsupported || lateral || belowDeck || tilted) derailedBody = bodyIndex;
      return derailedBody >= 0;
    });
    if (derailedBody >= 0 && !this.derailRecorded) {
      this.derailRecorded = true;
      this.#emit("derail", { bodyIndex: derailedBody, elapsed: this.elapsed, progress: this.getTrainProgress() });
    }

    const velocity = locomotive.linvel();
    const speed = this.config.mode === "hybrid" && !this.hybridReleased
      ? this.config.trainSpeed
      : Math.hypot(velocity.x, velocity.y, velocity.z);
    this.stopTimer = this.elapsed > 2 && speed < 0.12 ? this.stopTimer + dt : 0;
    if (this.stopTimer >= this.config.stoppedSeconds || this.elapsed >= this.config.maxTestSeconds) {
      this.finish(this.derailRecorded ? "DERAILED" : "STOPPED");
    }
  }

  #routeSForEntry(entry) {
    return this.config.mode === "hybrid" && !this.hybridReleased
      ? entry.routeS
      : this.centreline.project(entry.body.translation()).s;
  }

  #capturePreviousRenderState() {
    this.renderStates.forEach((state) => {
      copyVector(state.previousPosition, state.currentPosition);
      copyRotation(state.previousRotation, state.currentRotation);
    });
  }

  #captureCurrentRenderState() {
    this.bodies.forEach(({ body }, index) => {
      const state = this.renderStates[index];
      if (!state) return;
      copyVector(state.currentPosition, body.translation());
      copyRotation(state.currentRotation, body.rotation());
    });
  }

  #emit(type, payload) {
    for (const listener of this.listeners[type]) listener(payload);
  }

  #destroyWorld() {
    this.bodies = [];
    this.joints = [];
    this.couplerStates = [];
    this.renderStates = [];
    this.supportColliders.clear();
    if (this.world) this.world.free();
    this.world = null;
  }
}

export { DEFAULT_CONFIG, FIXED_DT, TRACK };
