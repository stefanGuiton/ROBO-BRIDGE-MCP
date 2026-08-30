import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TUNING, StructuralSolverSession, getFixture, solveStructure } from "../src/index.js";

test("incomplete deck reports a lost route without nondeterminism", () => {
  const fixture = getFixture("incomplete-deck");
  const result = solveStructure(fixture.graph, fixture.route, { mode: "TEST", loadProgress: 0.6, loadMass: 48, tuning: DEFAULT_TUNING, testId: 9 });
  assert.equal(result.routeConnected, false);
  assert.equal(result.testResult.outcome, "ROUTE_LOST");
  assert.ok(result.testResult.diagnostics.some((item) => item.code === "ROUTE_LOST"));
});

test("completion factor reduces the current effective capacity", () => {
  const fixture = getFixture("incomplete-deck");
  const result = solveStructure(fixture.graph, fixture.route, { mode: "BUILD", loadProgress: 0.5, loadMass: 20, tuning: DEFAULT_TUNING, testId: 10 });
  const complete = result.memberDiagnostics.find((item) => item.memberId === 101);
  const partial = result.memberDiagnostics.find((item) => item.memberId === 102);
  assert.ok(complete && partial);
  assert.ok(partial.effectiveCapacity < complete.effectiveCapacity * 0.5);
});

test("removing a support is allowed only in BUILD", () => {
  const fixture = getFixture("short-supported-beam");
  const session = new StructuralSolverSession(fixture.graph, fixture.route);
  assert.equal(session.removeSupport(1), true);
  session.setMode("TEST");
  assert.equal(session.removeSupport(3), false);
});

test("optional direct-stiffness mode returns deterministic diagnostics", () => {
  const fixture = getFixture("warren-truss");
  const tuning = { ...DEFAULT_TUNING, analysisMode: "truss-stiffness" as const };
  const first = solveStructure(fixture.graph, fixture.route, { mode: "BUILD", loadProgress: 0.5, loadMass: 48, tuning, testId: 11 });
  const second = solveStructure(fixture.graph, fixture.route, { mode: "BUILD", loadProgress: 0.5, loadMass: 48, tuning, testId: 11 });
  assert.deepEqual(first.memberDiagnostics.map((item) => item.utilisation), second.memberDiagnostics.map((item) => item.utilisation));
  assert.ok(first.testResult.diagnostics.some((item) => item.code === "STIFFNESS_SOLVED" || item.code === "STIFFNESS_MECHANISM"));
});

test("TestResult includes stable brick expansion and first-failure position", () => {
  const fixture = getFixture("long-cantilever");
  const result = solveStructure(fixture.graph, fixture.route, { mode: "TEST", loadProgress: 1, loadMass: 80, tuning: DEFAULT_TUNING, testId: 12 });
  assert.equal(result.testResult.testId, 12);
  assert.ok(result.testResult.failedBrickIds.length > result.testResult.failedMemberIds.length);
  assert.equal(result.testResult.firstFailure?.memberId, result.testResult.failedMemberIds[0]);
  assert.equal(result.testResult.loadPositionAtFirstFailure, 1);
});
