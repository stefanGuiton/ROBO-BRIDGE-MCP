import assert from "node:assert/strict";
import test from "node:test";
import { compileBridgeGraph, dependencyGraphHasCycle, placementEntersClearance } from "../src/compiler.js";
import { createCatalogue } from "../src/catalogue.js";
import { FIXTURES } from "../src/fixtures.js";

function compact(result) {
  return result.buildPlan.placements.map((placement) => ({
    placementId: placement.placementId,
    partType: placement.partType,
    structuralMemberId: placement.structuralMemberId,
    gridPosition: placement.gridPosition,
    orientation: placement.orientation,
    dependencies: placement.dependencies,
  }));
}

test("same graph and settings produce identical placements and checksum", () => {
  const first = compileBridgeGraph(FIXTURES.warren);
  const second = compileBridgeGraph(structuredClone(FIXTURES.warren));
  assert.deepEqual(compact(first), compact(second));
  assert.equal(first.buildPlan.checksum, second.buildPlan.checksum);
});

test("no emitted placement enters vehicle clearance", () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    const result = compileBridgeGraph(fixture);
    assert.equal(result.buildPlan.placements.some((placement) => placementEntersClearance(placement, result.occupancy.clearance)), false, name);
  }
});

test("long straight members use a configured long beam", () => {
  const result = compileBridgeGraph(FIXTURES.beam);
  const longParts = result.buildPlan.placements.filter((placement) => placement.partType.startsWith("beam-2x"));
  assert.ok(longParts.length > 0);
  assert.ok(longParts.some((placement) => Number(placement.partType.split("x")[1]) >= 32));
});

test("only legal catalogue parts are emitted", () => {
  const result = compileBridgeGraph(FIXTURES.pratt);
  const legal = new Set(createCatalogue(result.settings).map((part) => part.partType));
  assert.ok(result.buildPlan.placements.every((placement) => legal.has(placement.partType)));
});

test("dependency graph is acyclic and exposes parallel foundation work", () => {
  const result = compileBridgeGraph(FIXTURES.trestle);
  assert.equal(dependencyGraphHasCycle(result.buildPlan.placements), false);
  assert.equal(result.dependencyGraph.hasCycle, false);
  assert.ok(result.buildPlan.placements.filter((placement) => placement.dependencies.length === 0).length > 1);
});

test("every placement retains a structural-member ID and reverse mapping", () => {
  const result = compileBridgeGraph(FIXTURES.arch);
  for (const placement of result.buildPlan.placements) {
    assert.notEqual(placement.structuralMemberId, undefined);
    assert.ok(result.memberToPlacements[String(placement.structuralMemberId)].includes(placement.placementId));
  }
});

test("beam, trestle, truss and arch fixtures compile", () => {
  for (const name of ["beam", "trestle", "warren", "pratt", "arch"]) {
    const result = compileBridgeGraph(FIXTURES[name]);
    assert.equal(result.diagnostics.valid, true, name);
    assert.ok(result.buildPlan.placements.length > 0, name);
  }
});

test("extruded occupancy preserves both endpoints of every source member", () => {
  for (const fixture of Object.values(FIXTURES)) {
    const result = compileBridgeGraph(fixture);
    const nodeById = new Map(result.graph.nodes.map((node) => [node.id, node]));
    for (const member of result.graph.members) {
      const memberCells = result.occupancy.sourceMemberCells[String(member.id)];
      const a = nodeById.get(member.a).position;
      const b = nodeById.get(member.b).position;
      assert.ok(memberCells.some((cell) => cell.x === a.x && cell.y === a.y), `${fixture.metadata.family}:${member.id}:a`);
      assert.ok(memberCells.some((cell) => cell.x === b.x && cell.y === b.y), `${fixture.metadata.family}:${member.id}:b`);
    }
  }
});

test("long beams significantly reduce placement count", () => {
  const withBeams = compileBridgeGraph(FIXTURES.beam, { allowedBeamLengths: [80, 64, 48, 32, 24, 16, 12, 8, 6] });
  const shortOnly = compileBridgeGraph(FIXTURES.beam, { allowedBeamLengths: [] });
  assert.ok(withBeams.buildPlan.placements.length <= shortOnly.buildPlan.placements.length * 0.72,
    `${withBeams.buildPlan.placements.length} should be <= 72% of ${shortOnly.buildPlan.placements.length}`);
});

test("legacy BridgeGraph2D field aliases import without generator knowledge", () => {
  const legacy = {
    nodes: [{ id: 1, x: 0, y: 4, role: "support", supportType: "fixed" }, { id: 2, x: 12, y: 4, role: "support", supportType: "fixed" }],
    members: [{ id: 1, nodeA: 1, nodeB: 2, role: "deck", memberClass: "beam-primary", capacityClass: 2 }],
    cables: [],
    metadata: { family: "beam", span: 12, designRevision: 9 },
  };
  const result = compileBridgeGraph(legacy);
  assert.equal(result.graph.members[0].a, 1);
  assert.equal(result.buildPlan.designRevision, 9);
  assert.equal(result.diagnostics.valid, true);
});

test("1x1-disabled packing performs local residue repair", () => {
  const oddSpan = structuredClone(FIXTURES.beam);
  oddSpan.nodes[1].position.x = 39;
  oddSpan.metadata.span = 39;
  const result = compileBridgeGraph(oddSpan, { include1x1: false, allowedBeamLengths: [32, 16, 8, 6] });
  assert.ok(result.buildPlan.placements.every((placement) => placement.partType !== "brick-1x1"));
  assert.equal(result.diagnostics.valid, true);
});
