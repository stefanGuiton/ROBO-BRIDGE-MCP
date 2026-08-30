import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TUNING, FIXTURES, StructuralSolverSession, getFixture, solveStructure, type SolverMode, type SolverTuning } from "../src/index.js";

const solve = (fixtureId: string, progress: number, mode: SolverMode = "BUILD", mass = 48, tuning: SolverTuning = DEFAULT_TUNING) => {
  const fixture = getFixture(fixtureId);
  return solveStructure(fixture.graph, fixture.route, { mode, loadProgress: progress, loadMass: mass, tuning, testId: 7 });
};

test("1. short supported beam survives the baseline load", () => {
  const result = solve("short-supported-beam", 0.5, "TEST");
  assert.deepEqual(result.testResult.failedMemberIds, []);
  assert.equal(result.routeConnected, true);
  assert.ok(result.maximumUtilisation < 1);
});

test("2. long cantilever fails before the short cantilever", () => {
  const short = solve("short-cantilever", 1, "TEST");
  const long = solve("long-cantilever", 1, "TEST");
  assert.equal(short.testResult.failedMemberIds.length, 0);
  assert.ok(long.testResult.failedMemberIds.length > 0);
  assert.ok(long.maximumUtilisation > short.maximumUtilisation);
});

test("3. T structure weakens with distance from its vertical support", () => {
  const near = solve("t-structure", 0.5);
  const far = solve("t-structure", 1);
  const capacities = far.memberDiagnostics.filter((item) => [104, 105, 106].includes(item.memberId)).map((item) => item.effectiveCapacity);
  assert.ok((capacities[0] ?? 0) > (capacities[1] ?? 0));
  assert.ok((capacities[1] ?? 0) > (capacities[2] ?? 0));
  assert.ok(far.maximumUtilisation > near.maximumUtilisation * 3);
});

test("4. removing a pier increases demand on both neighbouring spans", () => {
  const complete = solve("deck-centre-pier", 0.5);
  const removed = solve("deck-centre-pier-removed", 0.5);
  for (const memberId of [102, 103]) {
    const withPier = complete.memberDiagnostics.find((item) => item.memberId === memberId)?.demand ?? 0;
    const withoutPier = removed.memberDiagnostics.find((item) => item.memberId === memberId)?.demand ?? 0;
    assert.ok(withoutPier > withPier, `Expected demand on M-${memberId} to increase.`);
  }
});

test("5. identical inputs always produce the same failed-member order", () => {
  const orders = Array.from({ length: 20 }, () => solve("long-cantilever", 1, "TEST", 80).testResult.failedMemberIds.join(","));
  assert.equal(new Set(orders).size, 1);
  assert.equal(orders[0], "103,104");
  const sequenceOrders = Array.from({ length: 10 }, () => {
    const fixture = getFixture("long-cantilever");
    const session = new StructuralSolverSession(fixture.graph, fixture.route);
    session.setMode("TEST");
    let result = session.update(0, 80, DEFAULT_TUNING).snapshot.testResult;
    for (let step = 1; step <= 20; step += 1) result = session.update(step / 20, 80, DEFAULT_TUNING).snapshot.testResult;
    return result.failedMemberIds.join(",");
  });
  assert.equal(new Set(sequenceOrders).size, 1);
  assert.equal(sequenceOrders[0], "101,102,103,104");
});

test("6. BUILD Mode calculates warnings but never applies failure", () => {
  const result = solve("long-cantilever", 1, "BUILD", 150);
  assert.ok(result.maximumUtilisation > 1);
  assert.equal(result.failureSequence.length, 0);
  assert.equal(result.graph.members.some((member) => member.failed), false);
});

test("7. TEST Mode produces progressive failure", () => {
  const result = solve("long-cantilever", 1, "TEST", 80);
  assert.ok(result.failureSequence.length >= 2);
  assert.deepEqual(result.failureSequence.map((event) => event.cascadeIteration), [1, 2]);
});

test("8. the cascade obeys its strict iteration limit", () => {
  const tuning = { ...DEFAULT_TUNING, maximumCascadeIterations: 1 };
  const result = solve("long-cantilever", 1, "TEST", 150, tuning);
  assert.equal(result.metrics.cascadeIterations, 1);
  assert.ok(result.testResult.diagnostics.some((item) => item.code === "CASCADE_LIMIT"));
});

test("9. the solver skips updates while point loads remain in the same region", () => {
  const fixture = getFixture("short-supported-beam");
  const session = new StructuralSolverSession(fixture.graph, fixture.route);
  const first = session.update(0.5, 48, DEFAULT_TUNING);
  const cached = session.update(0.501, 48, DEFAULT_TUNING);
  const moved = session.update(0.7, 48, DEFAULT_TUNING);
  assert.equal(first.recalculated, true);
  assert.equal(cached.recalculated, false);
  assert.equal(moved.recalculated, true);
  assert.ok(moved.snapshot.metrics.loadRegionUpdates > first.snapshot.metrics.loadRegionUpdates);
});

test("10. Warren, Pratt and Howe fixtures share the StructuralGraph contract", () => {
  for (const id of ["warren-truss", "pratt-truss", "howe-truss"]) {
    const fixture = getFixture(id);
    assert.ok(fixture.graph.nodes.length > 0);
    assert.ok(fixture.graph.members.some((member) => member.type === "truss"));
    assert.ok(fixture.graph.members.every((member) => member.brickIds.length > 1));
    assert.doesNotThrow(() => solve(id, 0.5));
  }
  assert.equal(FIXTURES.length, 11);
});
