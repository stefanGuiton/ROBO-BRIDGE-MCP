import RAPIER from "../../vendor/rapier/rapier.mjs";
import { DEFAULT_CONFIG, FIXED_DT, normalizeConfig } from "./config.js";
import { getFixture, supportsForFixture } from "./fixtures.js";
import { RailSupportMap, StraightCentreline, TRACK } from "./track.js";

let rapierReady;

export function initialiseRapier() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

const BODY_LENGTH = 3;
const BODY_WIDTH = 1.36;
const COUPLER_GAP = 0.55;

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
  return Math.acos(Math.max(-1, Math.min(1, up.y))) * 180 / Math.PI;
}

function bodyDescriptor(mode, position) {
  const descriptor = mode === "kinematic"
    ? RAPIER.RigidBodyDesc.kinematicPositionBased()
    : RAPIER.RigidBodyDesc.dynamic();
  return descriptor
    .setTranslation(position.x, position.y, position.z)
    .setLinearDamping(0.08)
    .setAngularDamping(1.35)
    .setCanSleep(true)
    .setCcdEnabled(true);
}

export class TrainSimulation {
  constructor(options = {}) {
    this.config = normalizeConfig(options.config);
    this.fixtureId = options.fixtureId ?? "A";
    this.centreline = new StraightCentreline();
    this.world = null;
    this.supportMap = null;
    this.supportColliders = new Map();
    this.bodies = [];
    this.joints = [];
    this.running = false;
    this.elapsed = 0;
    this.stepCount = 0;
    this.outcome = null;
    this.derailRecorded = false;
    this.stopTimer = 0;
    this.kinematicReleased = false;
    this.fixtureEvents = [];
    this.listeners = { derail: new Set(), fall: new Set(), complete: new Set(), support: new Set() };
    this.lastStepMs = 0;
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
    this.supportMap = new RailSupportMap(supportsForFixture(this.fixtureId));
    this.world = new RAPIER.World({ x: 0, y: -this.config.gravity, z: 0 });
    this.world.timestep = FIXED_DT;
    this.world.numSolverIterations = 8;
    this.#createEnvironment();
    this.#createTrain();
    this.fixtureEvents = getFixture(this.fixtureId).events.map((event) => ({ ...event, fired: false }));
    this.running = false;
    this.elapsed = 0;
    this.stepCount = 0;
    this.outcome = null;
    this.derailRecorded = false;
    this.stopTimer = 0;
    this.kinematicReleased = false;
    this.lastStepMs = 0;
    this.guideTelemetry = this.bodies.flatMap((_, bodyIndex) => [
      { bodyIndex, name: "front", supported: true, release: 1, latched: false, s: 0, position: null },
      { bodyIndex, name: "rear", supported: true, release: 1, latched: false, s: 0, position: null },
    ]);
    this.initialTransforms = this.getBodyTransforms();
    return this.getSnapshot();
  }

  setRailSupport(segmentId, supported) {
    if (!this.supportMap.setSupport(segmentId, supported)) return false;
    this.supportColliders.get(Number(segmentId))?.setEnabled(Boolean(supported));
    this.#emit("support", { segmentId: Number(segmentId), supported: Boolean(supported), elapsed: this.elapsed });
    return true;
  }

  restoreAllSupport() {
    for (const segment of this.supportMap.segments) this.setRailSupport(segment.id, true);
  }

  step(dt = FIXED_DT) {
    if (!this.running || this.outcome) return false;
    const started = performance.now();
    this.#runFixtureEvents();
    if (this.config.mode === "kinematic" && !this.kinematicReleased) this.#stepKinematic(dt);
    else this.#applyDynamicControls(dt);
    this.world.step();
    this.elapsed += dt;
    this.stepCount += 1;
    this.#updateGuideTelemetry(dt);
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
    const locomotive = this.bodies[0]?.body;
    if (!locomotive) return { routeS: TRACK.startS, normalized: 0, elapsed: this.elapsed };
    const routeS = locomotive.translation().x;
    return { routeS, normalized: this.centreline.progressForS(routeS), elapsed: this.elapsed };
  }

  getTrainLoads() {
    return this.bodies.map((entry, index) => {
      const position = entry.body.translation();
      const mass = index === 0 ? this.config.locomotiveMass : this.config.carriageMass;
      return {
        bodyIndex: index,
        role: index === 0 ? "locomotive" : "carriage",
        active: true,
        routeS: position.x,
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

  getSnapshot() {
    return {
      running: this.running,
      outcome: this.outcome,
      fixtureId: this.fixtureId,
      progress: this.getTrainProgress(),
      counts: this.getCounts(),
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
    const bottom = RAPIER.ColliderDesc.cuboid(70, 0.5, 25)
      .setTranslation(0, -8, 0)
      .setFriction(0.8);
    this.world.createCollider(bottom);
    for (const segment of this.supportMap.segments) {
      const halfLength = (segment.endS - segment.startS) / 2 - 0.025;
      const midpoint = (segment.startS + segment.endS) / 2;
      const descriptor = RAPIER.ColliderDesc.cuboid(halfLength, 0.15, TRACK.deckWidth / 2)
        .setTranslation(midpoint, 0, 0)
        .setFriction(0.75)
        .setRestitution(0.02)
        .setEnabled(segment.supported);
      this.supportColliders.set(segment.id, this.world.createCollider(descriptor));
    }
  }

  #createTrain() {
    const count = this.config.carriageCount + 1;
    const startHeadS = TRACK.startS + 2 + (count - 1) * (BODY_LENGTH + COUPLER_GAP);
    for (let index = 0; index < count; index += 1) {
      const locomotive = index === 0;
      const halfHeight = locomotive ? 0.62 : 0.5;
      const position = {
        x: startHeadS - index * (BODY_LENGTH + COUPLER_GAP),
        y: TRACK.railTopY + halfHeight,
        z: 0,
      };
      const body = this.world.createRigidBody(bodyDescriptor(this.config.mode, position));
      const mass = locomotive ? this.config.locomotiveMass : this.config.carriageMass;
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(BODY_LENGTH / 2, halfHeight, BODY_WIDTH / 2)
          .setMass(mass)
          .setFriction(0.52)
          .setRestitution(0.03),
        body,
      );
      this.bodies.push({ body, collider, halfHeight, role: locomotive ? "locomotive" : "carriage" });
    }

    for (let index = 0; index < this.bodies.length - 1; index += 1) {
      const lead = this.bodies[index].body;
      const trailing = this.bodies[index + 1].body;
      const jointData = RAPIER.JointData.spring(
        COUPLER_GAP,
        this.config.couplerStiffness,
        this.config.couplerDamping,
        { x: -BODY_LENGTH / 2, y: 0, z: 0 },
        { x: BODY_LENGTH / 2, y: 0, z: 0 },
      );
      this.joints.push(this.world.createImpulseJoint(jointData, lead, trailing, true));
    }
  }

  #stepKinematic(dt) {
    const next = this.bodies.map((entry) => entry.body.translation().x + this.config.trainSpeed * dt);
    const lostSupport = this.bodies.some((entry, index) => {
      const halfGuide = BODY_LENGTH * 0.36;
      return !this.supportMap.isSupportedAt(next[index] + halfGuide) || !this.supportMap.isSupportedAt(next[index] - halfGuide);
    });
    if (lostSupport) {
      this.kinematicReleased = true;
      for (const { body } of this.bodies) {
        body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        body.setLinvel({ x: this.config.trainSpeed, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }
    this.bodies.forEach((entry, index) => {
      entry.body.setNextKinematicTranslation({ x: next[index], y: TRACK.railTopY + entry.halfHeight, z: 0 });
      entry.body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
    });
  }

  #applyDynamicControls(dt) {
    const totalMass = this.config.locomotiveMass + this.config.carriageMass * this.config.carriageCount;
    const locomotive = this.bodies[0].body;
    this.bodies.forEach(({ body }) => {
      body.resetForces(true);
      body.resetTorques(true);
    });
    const speedError = this.config.trainSpeed - locomotive.linvel().x;
    const traction = Math.max(-totalMass * this.config.acceleration, Math.min(totalMass * this.config.acceleration, speedError * totalMass * 2.1));
    locomotive.addForce({ x: traction, y: 0, z: 0 }, true);

    this.bodies.forEach((entry, bodyIndex) => {
      const body = entry.body;
      const mass = bodyIndex === 0 ? this.config.locomotiveMass : this.config.carriageMass;
      const rotation = body.rotation();
      const translation = body.translation();
      let guideY = 0;
      let guideZ = 0;
      let yawMoment = 0;
      [1, -1].forEach((direction, guideOffset) => {
        const local = { x: direction * BODY_LENGTH * 0.36, y: -entry.halfHeight, z: 0 };
        const offset = rotateVector(rotation, local);
        const point = { x: translation.x + offset.x, y: translation.y + offset.y, z: translation.z + offset.z };
        const support = this.supportMap.isSupportedAt(point.x);
        const telemetryIndex = bodyIndex * 2 + guideOffset;
        const telemetry = this.guideTelemetry[telemetryIndex];
        let release = telemetry?.release ?? 1;
        if (support && !telemetry?.latched) release = Math.min(1, release + dt * 8);
        else if (this.config.guideReleaseMode === "instant") release = 0;
        else release = Math.max(0, release - dt / this.config.guideReleaseSeconds);
        if (telemetry) Object.assign(telemetry, {
          supported: support,
          release,
          latched: telemetry.latched || (!support && release <= 0),
          s: point.x,
          position: point,
        });
        if (release <= 0) return;
        const velocity = pointVelocity(body, offset);
        const maxVertical = mass * (this.config.gravity + 24);
        const maxLateral = mass * 18;
        const forceY = Math.max(-maxVertical, Math.min(maxVertical,
          (this.config.guideStiffness * (TRACK.railTopY - point.y) - this.config.guideDamping * velocity.y) * release,
        ));
        const forceZ = Math.max(-maxLateral, Math.min(maxLateral,
          (this.config.guideStiffness * -point.z - this.config.guideDamping * velocity.z) * release,
        ));
        guideY += forceY;
        guideZ += forceZ;
        yawMoment += -local.x * forceZ * 0.18;
      });
      body.addForce({ x: 0, y: guideY, z: guideZ }, true);
      const angularY = body.angvel().y;
      body.addTorque({ x: 0, y: yawMoment - angularY * mass * 1.8, z: 0 }, true);
    });
  }

  #updateGuideTelemetry(dt) {
    this.bodies.forEach((entry, bodyIndex) => {
      const body = entry.body;
      const rotation = body.rotation();
      const translation = body.translation();
      [1, -1].forEach((direction, guideOffset) => {
        const local = { x: direction * BODY_LENGTH * 0.36, y: -entry.halfHeight, z: 0 };
        const offset = rotateVector(rotation, local);
        const point = { x: translation.x + offset.x, y: translation.y + offset.y, z: translation.z + offset.z };
        const telemetry = this.guideTelemetry[bodyIndex * 2 + guideOffset];
        const supported = this.supportMap.isSupportedAt(point.x);
        if (this.config.mode === "kinematic" && !this.kinematicReleased) telemetry.release = supported ? 1 : 0;
        Object.assign(telemetry, { supported, s: point.x, position: point, dt });
      });
    });
  }

  #runFixtureEvents() {
    const progress = this.getTrainProgress().normalized;
    for (const event of this.fixtureEvents) {
      if (event.fired) continue;
      let triggerValue = progress;
      if (event.type === "body-s") triggerValue = this.bodies[event.bodyIndex]?.body.translation().x ?? TRACK.startS;
      if (event.type === "route-s") triggerValue = this.getTrainProgress().routeS;
      if (triggerValue < event.at) continue;
      event.fired = true;
      event.segmentIds.forEach((id) => this.setRailSupport(id, false));
    }
  }

  #detectEvents(dt) {
    const locomotive = this.bodies[0].body;
    const locoPosition = locomotive.translation();
    if (locoPosition.y < this.config.failPlaneY) {
      this.finish("TRAIN_FELL");
      return;
    }
    const trainClearedBridge = this.bodies.every(({ body }) => {
      const position = body.translation();
      return position.x >= 24 && position.y > TRACK.railTopY - 0.8;
    });
    if (trainClearedBridge && !this.derailRecorded) {
      this.finish("CROSSED");
      return;
    }

    let derailedBody = -1;
    this.bodies.some((entry, bodyIndex) => {
      const position = entry.body.translation();
      const guides = this.guideTelemetry.slice(bodyIndex * 2, bodyIndex * 2 + 2);
      const bothUnsupported = guides.every((guide) => !guide.supported && guide.release < 0.05);
      const lateral = Math.abs(position.z) > this.config.lateralDerailThreshold;
      const belowDeck = position.y < TRACK.railTopY - this.config.verticalDerailThreshold;
      const tilted = quaternionTiltDegrees(entry.body.rotation()) > this.config.tiltDerailDegrees;
      if (bothUnsupported || lateral || belowDeck || tilted) derailedBody = bodyIndex;
      return derailedBody >= 0;
    });
    if (derailedBody >= 0 && !this.derailRecorded) {
      this.derailRecorded = true;
      this.#emit("derail", { bodyIndex: derailedBody, elapsed: this.elapsed, progress: this.getTrainProgress() });
    }

    const speed = Math.hypot(locomotive.linvel().x, locomotive.linvel().y, locomotive.linvel().z);
    this.stopTimer = this.elapsed > 2 && speed < 0.12 ? this.stopTimer + dt : 0;
    if (this.stopTimer >= this.config.stoppedSeconds || this.elapsed >= this.config.maxTestSeconds) {
      this.finish(this.derailRecorded ? "DERAILED" : "STOPPED");
    }
  }

  #emit(type, payload) {
    for (const listener of this.listeners[type]) listener(payload);
  }

  #destroyWorld() {
    this.bodies = [];
    this.joints = [];
    this.supportColliders.clear();
    if (this.world) this.world.free();
    this.world = null;
  }
}

export { DEFAULT_CONFIG, FIXED_DT, TRACK };
