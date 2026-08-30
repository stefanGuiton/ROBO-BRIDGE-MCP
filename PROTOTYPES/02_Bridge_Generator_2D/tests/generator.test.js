import assert from "node:assert/strict";
import test from "node:test";
import { FLAT_GAP, RAVINE, specForChallenge } from "../src/engine/fixtures.js";
import { generateBridgeGraph2D } from "../src/engine/generator.js";
import { stableStringify } from "../src/engine/stable-json.js";
import { foundationAt, validateBridgeSpec } from "../src/engine/validation.js";

const FAMILIES = ["beam", "trestle", "warren", "pratt", "howe", "arch", "aqueduct", "box", "suspension"];

function generate(family, overrides = {}, challenge = RAVINE) {
  return generateBridgeGraph2D(challenge, { ...specForChallenge(challenge, family), ...overrides });
}

test("every bridge family uses the common graph contract", () => {
  for (const family of FAMILIES) {
    const result = generate(family);
    assert.equal(result.validation.valid, true, `${family}: ${stableStringify(result.validation)}`);
    assert.deepEqual(Object.keys(result.graph).sort(), ["cables", "members", "metadata", "nodes"]);
    assert.ok(result.graph.nodes.length > 1);
    assert.ok(result.graph.members.length > 0);
    for (const node of result.graph.nodes) assert.ok(["id", "x", "y", "role", "supportType"].every((key) => key in node));
    for (const member of result.graph.members) assert.ok(["id", "nodeA", "nodeB", "role", "memberClass", "capacityClass"].every((key) => key in member));
  }
});

test("beam spans a simple flat gap", () => {
  const result = generate("beam", { pierCount: 0 }, FLAT_GAP);
  assert.equal(result.validation.valid, true);
  const supportXs = result.graph.nodes.filter((node) => node.supportType === "fixed").map((node) => node.x);
  assert.deepEqual(supportXs, [FLAT_GAP.entry.position.x, FLAT_GAP.exit.position.x]);
  assert.equal(result.graph.members.filter((member) => member.role === "deck").length, result.graph.nodes.length - 1);
});

test("trestle creates terrain-supported piers", () => {
  const result = generate("trestle", { pierCount: 4, pierSpacing: 16, crossBracing: true });
  const pierNodes = result.graph.nodes.filter((node) => node.role === "pier" && node.supportType === "terrain");
  assert.equal(pierNodes.length, 4);
  for (const node of pierNodes) assert.ok(Math.abs(node.y - foundationAt(RAVINE, node.x, "pier")) < 1e-6);
  assert.ok(result.graph.members.some((member) => member.memberClass === "trestle-x-brace"));
});

test("Warren, Pratt and Howe have different deterministic diagonal patterns", () => {
  const graphs = Object.fromEntries(["warren", "pratt", "howe"].map((family) => [family, generate(family).graph]));
  const pattern = (graph) => graph.members.filter((member) => member.role === "diagonal").map((member) => [member.nodeA, member.nodeB]);
  assert.notDeepEqual(pattern(graphs.warren), pattern(graphs.pratt));
  assert.notDeepEqual(pattern(graphs.pratt), pattern(graphs.howe));
  assert.ok(graphs.pratt.members.some((member) => member.memberClass === "pratt-diagonal"));
  assert.ok(graphs.howe.members.some((member) => member.memberClass === "howe-diagonal"));
});

test("arch geometry responds to rise and shape", () => {
  const low = generate("arch", { archRise: 12, archShape: "parabolic" }).graph;
  const high = generate("arch", { archRise: 26, archShape: "parabolic" }).graph;
  const circular = generate("arch", { archRise: 26, archShape: "circular" }).graph;
  const archYs = (graph) => graph.nodes.filter((node) => graph.members.some((member) => member.role === "arch" && (member.nodeA === node.id || member.nodeB === node.id))).map((node) => node.y);
  assert.ok(Math.min(...archYs(high)) < Math.min(...archYs(low)));
  assert.notDeepEqual(archYs(high), archYs(circular));
});

test("vehicle clearance remains explicit and valid", () => {
  for (const family of FAMILIES) {
    const result = generate(family);
    assert.equal(result.validation.errors.some((entry) => entry.code === "VEHICLE_CLEARANCE"), false);
    assert.equal(result.graph.metadata.vehicleClearance, specForChallenge(RAVINE, family).vehicleClearance);
  }
});

test("invalid parameters return explicit machine-readable codes", () => {
  const base = specForChallenge(RAVINE, "pratt");
  assert.ok(validateBridgeSpec(RAVINE, { ...base, span: 12 }).errors.some((entry) => entry.code === "SPAN_INVALID"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, deckHeight: 99 }).errors.some((entry) => entry.code === "DECK_OUTSIDE_CORRIDOR"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, bridgeWidth: 4 }).errors.some((entry) => entry.code === "VEHICLE_CLEARANCE"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, panelCount: 1 }).errors.some((entry) => entry.code === "INVALID_PARAMETER_RANGE"));
});

test("same input produces byte-identical canonical graph JSON", () => {
  const first = generate("aqueduct");
  const second = generate("aqueduct");
  assert.equal(first.canonicalJson, second.canonicalJson);
  assert.equal(first.graph.metadata.deterministicChecksum, second.graph.metadata.deterministicChecksum);
  assert.equal(first.graph.metadata.designRevision, second.graph.metadata.designRevision);
});

test("suspension contains towers, anchors, main cable and hanger targets", () => {
  const graph = generate("suspension").graph;
  assert.equal(graph.nodes.filter((node) => node.role === "tower").length, 4);
  assert.ok(graph.nodes.filter((node) => node.role === "anchor").length >= 2);
  const main = graph.cables.find((cable) => cable.structuralRole === "main");
  assert.ok(main);
  assert.ok(main.hangerTargets.length > 2);
  assert.equal(graph.cables.filter((cable) => cable.structuralRole === "hanger").length, main.hangerTargets.length);
});

test("generation does not mutate ChallengeState or BridgeSpec", () => {
  const challenge = structuredClone(RAVINE);
  const spec = specForChallenge(challenge, "box");
  const beforeChallenge = stableStringify(challenge);
  const beforeSpec = stableStringify(spec);
  generateBridgeGraph2D(challenge, spec);
  assert.equal(stableStringify(challenge), beforeChallenge);
  assert.equal(stableStringify(spec), beforeSpec);
});

test("generation occurs on demand with no animation loop dependency", () => {
  let clock = 0;
  const result = generateBridgeGraph2D(RAVINE, specForChallenge(RAVINE, "beam"), () => (clock += 0.125));
  assert.equal(result.generationTimeMs, 0.125);
});
