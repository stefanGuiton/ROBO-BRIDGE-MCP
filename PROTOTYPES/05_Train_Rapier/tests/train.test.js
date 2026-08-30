import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TrainSimulation } from "../src/core/train-simulation.js";
import { CurvedCentreline, RailSupportMap, StraightCentreline, createRailSupportSegments } from "../src/core/track.js";

test("RailSupportSegment is a bridge-generator-independent data contract", async () => {
  const segments = createRailSupportSegments();
  assert.deepEqual(Object.keys(segments[0]).sort(), ["endS", "id", "startS", "supported"]);
  assert.equal(segments.length, 17);
  const source = await readFile(new URL("../src/core/train-simulation.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /bridge.generator|BridgeGraph|BuildPlan|brick/i);
});

test("straight centreline samples and projects route coordinates", () => {
  const centreline = new StraightCentreline();
  assert.deepEqual(centreline.sample(3).tangent, { x: 1, y: 0, z: 0 });
  assert.equal(centreline.project({ x: 7, y: 0.42, z: -1.2 }).s, 7);
  assert.equal(centreline.project({ x: 7, y: 0.42, z: -1.2 }).lateral, -1.2);
  assert.equal(centreline.progressForS(-42), 0);
  assert.equal(centreline.progressForS(60), 1);
});

test("curved centreline supplies pitch and yaw frames without adding roll", () => {
  const centreline = new CurvedCentreline();
  const sample = centreline.sample(-4);
  assert.notEqual(sample.position.z, 0);
  assert.notEqual(sample.position.y, 0.42);
  assert.ok(Math.abs(sample.tangent.y) > 0.001 || Math.abs(sample.tangent.z) > 0.001);
  assert.ok(Math.abs(sample.tangent.x ** 2 + sample.tangent.y ** 2 + sample.tangent.z ** 2 - 1) < 1e-9);
});

test("support changes are exact, reversible, and read queries do not mutate", () => {
  const map = new RailSupportMap();
  const before = map.snapshot();
  assert.equal(map.isSupportedAt(0), true);
  assert.deepEqual(map.snapshot(), before);
  assert.equal(map.setSupport(7, false), true);
  assert.equal(map.isSupportedAt(1), false);
  assert.equal(map.setSupport(999, false), false);
  map.restoreInitial();
  assert.deepEqual(map.snapshot(), before);
});

test("fixture A crosses analytically with zero supported Rapier steps", async () => {
  const simulation = await new TrainSimulation({ fixtureId: "A" }).initialize();
  simulation.startTest();
  simulation.runForSeconds(20);
  assert.equal(simulation.outcome, "CROSSED");
  const transforms = simulation.getBodyTransforms();
  assert.equal(transforms.length, 3);
  assert.ok(transforms.every((body) => Math.abs(simulation.centreline.project(body.translation).lateral) < 0.2));
  assert.equal(simulation.getCounts().joints, 2);
  assert.equal(simulation.getPerformanceStats().rapierSteps, 0);
  assert.ok(simulation.getPerformanceStats().skippedRapierSteps > 700);
});

test("legacy dynamic guide remains available as a comparison mode", async () => {
  const simulation = await new TrainSimulation({ fixtureId: "A", config: { mode: "dynamic", trackProfile: "straight" } }).initialize();
  simulation.startTest();
  simulation.runForSeconds(20);
  assert.equal(simulation.outcome, "CROSSED");
  assert.ok(simulation.getPerformanceStats().rapierSteps > 0);
});

test("maximum configurable six-carriage train remains supported and articulated", async () => {
  const simulation = await new TrainSimulation({ fixtureId: "A", config: { carriageCount: 6 } }).initialize();
  simulation.startTest();
  simulation.runForSeconds(24);
  assert.equal(simulation.outcome, "CROSSED");
  assert.deepEqual(simulation.getCounts(), {
    rigidBodies: 7,
    activeRigidBodies: 7,
    sleepingBodies: 0,
    joints: 6,
    trainBodies: 7,
  });
  assert.ok(simulation.getBodyTransforms().every((body) =>
    Math.abs(simulation.centreline.project(body.translation).lateral) < 0.2));
  assert.equal(simulation.getPerformanceStats().rapierSteps, 0);
});

test("three-link train exposes only yaw and pitch coupling state on a curved dip", async () => {
  const simulation = await new TrainSimulation({ fixtureId: "A" }).initialize();
  simulation.startTest();
  while (simulation.getTrainProgress().routeS < -4) simulation.step();
  const couplers = simulation.getCouplerStates();
  assert.equal(couplers.length, 2);
  assert.ok(couplers.every((coupler) => coupler.degreesOfFreedom === 2));
  assert.ok(couplers.some((coupler) => Math.abs(coupler.yawRadians) > 0.001));
  assert.ok(couplers.some((coupler) => Math.abs(coupler.pitchRadians) > 0.001));
});

test("fixtures B and C lose support and fall under gravity", async () => {
  for (const fixtureId of ["B", "C"]) {
    const simulation = await new TrainSimulation({ fixtureId }).initialize();
    simulation.startTest();
    simulation.runForSeconds(20);
    assert.equal(simulation.outcome, "TRAIN_FELL", fixtureId);
    assert.ok(simulation.getBodyTransforms()[0].translation.y < -5.5, fixtureId);
    assert.ok(simulation.getPerformanceStats().skippedRapierSteps > 0, fixtureId);
    assert.ok(simulation.getPerformanceStats().rapierSteps > 0, fixtureId);
  }
});

test("fixture D releases a carriage first for articulated failure", async () => {
  const simulation = await new TrainSimulation({ fixtureId: "D" }).initialize();
  let firstDerail;
  simulation.onDerail((event) => { firstDerail = event; });
  simulation.startTest();
  simulation.runForSeconds(30);
  assert.equal(firstDerail?.bodyIndex, 1);
  assert.ok(["DERAILED", "TRAIN_FELL"].includes(simulation.outcome));
});

test("only the guide inside a removed support segment releases", async () => {
  const simulation = await new TrainSimulation({ fixtureId: "A", config: { guideReleaseMode: "instant" } }).initialize();
  simulation.startTest();
  while (simulation.bodies[0].body.translation().x < -29.7) simulation.step();
  const front = simulation.guideTelemetry[0];
  const rear = simulation.guideTelemetry[1];
  const frontSegment = simulation.supportMap.segmentAt(front.s);
  const rearSegment = simulation.supportMap.segmentAt(rear.s);
  assert.notEqual(frontSegment.id, rearSegment.id);
  simulation.setRailSupport(frontSegment.id, false);
  simulation.step();
  assert.equal(front.release, 0);
  assert.equal(rear.release, 1);
  assert.equal(rear.supported, true);
});

test("load output remains narrow and identifies every active train body", async () => {
  const simulation = await new TrainSimulation({ fixtureId: "A", config: { carriageCount: 3 } }).initialize();
  const loads = simulation.getTrainLoads();
  assert.equal(loads.length, 4);
  assert.deepEqual(loads.map((load) => load.role), ["locomotive", "carriage", "carriage", "carriage"]);
  assert.ok(loads.every((load) => load.active && load.approximateLoadNewtons > 0));
  assert.ok(loads.every((load) => !Object.hasOwn(load, "bridgeMemberId")));
});

test("reset restores bit-identical starts and 20 TEST/RESET cycles do not leak", async () => {
  const simulation = await new TrainSimulation({ fixtureId: "A" }).initialize();
  const initial = JSON.stringify(simulation.initialTransforms);
  const expectedCounts = simulation.getCounts();
  for (let cycle = 0; cycle < 20; cycle += 1) {
    simulation.startTest();
    simulation.runForSeconds(0.35);
    simulation.resetTrain();
    assert.equal(JSON.stringify(simulation.getBodyTransforms()), initial, `transform cycle ${cycle + 1}`);
    assert.deepEqual(simulation.getCounts(), expectedCounts, `counts cycle ${cycle + 1}`);
  }
});

test("inactive TEST state performs no physics steps", async () => {
  const simulation = await new TrainSimulation({ fixtureId: "A" }).initialize();
  const before = simulation.getSnapshot();
  assert.equal(simulation.step(), false);
  const after = simulation.getSnapshot();
  assert.equal(after.stepCount, before.stepCount);
  assert.deepEqual(after.transforms, before.transforms);
});
