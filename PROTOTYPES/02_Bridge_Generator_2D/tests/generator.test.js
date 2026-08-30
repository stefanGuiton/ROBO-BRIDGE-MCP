import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BRICK_FAMILY_IDS, FAMILY_IDS, HYBRID_FAMILY_IDS } from "../src/engine/catalogue.js";
import { FLAT_GAP, RAVINE, specForChallenge } from "../src/engine/fixtures.js";
import { generateBridgeGraph2D } from "../src/engine/generator.js";
import { stableStringify } from "../src/engine/stable-json.js";
import { foundationAt, validateBridgeSpec, validateGraph } from "../src/engine/validation.js";

function generate(family, overrides = {}, challenge = RAVINE) {
  return generateBridgeGraph2D(challenge, { ...specForChallenge(challenge, family), ...overrides });
}

test("every family uses the common graph contract and explicit brick handoff", () => {
  for (const family of FAMILY_IDS) {
    const result = generate(family);
    assert.equal(result.validation.valid, true, `${family}: ${stableStringify(result.validation)}`);
    assert.deepEqual(Object.keys(result.graph).sort(), ["cables", "members", "metadata", "nodes"]);
    assert.ok(result.graph.nodes.length > 1);
    assert.ok(result.graph.members.length > 0);
    assert.equal(result.graph.metadata.generatorVersion, 2);
    assert.equal(result.graph.metadata.construction.compilerReady, true);
    assert.ok(result.graph.metadata.construction.allowedParts.length > 0);
    assert.ok(!("placements" in result.graph), "2D generator must not place bricks");
    for (const node of result.graph.nodes) assert.ok(["id", "x", "y", "role", "supportType"].every((key) => key in node));
    for (const member of result.graph.members) assert.ok([
      "id", "nodeA", "nodeB", "role", "memberClass", "capacityClass", "buildClass", "rasterMode", "sectionStuds",
    ].every((key) => key in member));
  }
});

test("brick-native families expose raster zones without Technic frame members", () => {
  for (const family of BRICK_FAMILY_IDS) {
    const graph = generate(family).graph;
    assert.equal(graph.metadata.construction.compatibility, "brick-native");
    assert.ok(graph.metadata.brickZones.length > 0, family);
    assert.equal(graph.members.some((member) => member.buildClass === "technic-frame"), false, family);
  }
});

test("hybrid families are valid but return a machine-readable hybrid notice", () => {
  for (const family of HYBRID_FAMILY_IDS) {
    const result = generate(family);
    assert.equal(result.validation.valid, true, family);
    assert.ok(result.validation.warnings.some((entry) => entry.code === "HYBRID_PARTS_REQUIRED"), family);
    assert.equal(result.graph.metadata.construction.compatibility, "hybrid");
  }
});

test("beam spans a simple flat gap with bonded deck intent", () => {
  const result = generate("beam", { pierCount: 0 }, FLAT_GAP);
  assert.equal(result.validation.valid, true);
  const supportXs = result.graph.nodes.filter((node) => node.supportType === "fixed").map((node) => node.x);
  assert.deepEqual(supportXs, [FLAT_GAP.entry.position.x, FLAT_GAP.exit.position.x]);
  assert.ok(result.graph.members.every((member) => member.buildClass !== "technic-frame"));
  assert.ok(result.graph.metadata.brickZones.some((zone) => zone.role === "deck"));
});

test("pier bridge creates grid-aligned terrain-supported masonry piers", () => {
  const result = generate("pier", { pierCount: 4, pierSpacing: 16 });
  const pierNodes = result.graph.nodes.filter((node) => node.role === "pier" && node.supportType === "terrain");
  assert.equal(pierNodes.length, 4);
  for (const node of pierNodes) assert.equal(node.y, Math.round(foundationAt(RAVINE, node.x, "pier")));
  assert.ok(result.graph.members.some((member) => member.memberClass === "bonded-pier"));
  assert.ok(result.graph.metadata.brickZones.filter((zone) => zone.role === "pier").length >= 4);
});

test("trestle keeps its X braces in the hybrid catalogue", () => {
  const result = generate("trestle", { pierCount: 4, pierSpacing: 16, crossBracing: true });
  assert.ok(result.graph.members.some((member) => member.memberClass === "trestle-x-brace" && member.buildClass === "technic-frame"));
});

test("Warren, Pratt and Howe retain different deterministic diagonal patterns", () => {
  const graphs = Object.fromEntries(["warren", "pratt", "howe"].map((family) => [family, generate(family).graph]));
  const pattern = (graph) => graph.members.filter((member) => member.role === "diagonal").map((member) => [member.nodeA, member.nodeB]);
  assert.notDeepEqual(pattern(graphs.warren), pattern(graphs.pratt));
  assert.notDeepEqual(pattern(graphs.pratt), pattern(graphs.howe));
});

test("masonry arch responds to rise and profile and uses real abutments", () => {
  const low = generate("arch", { archRise: 14, archShape: "segmental" }).graph;
  const high = generate("arch", { archRise: 26, archShape: "segmental" }).graph;
  const elliptical = generate("arch", { archRise: 26, archShape: "elliptical" }).graph;
  const archYs = (graph) => graph.nodes.filter((node) => graph.members.some((member) => member.role === "arch" && (member.nodeA === node.id || member.nodeB === node.id))).map((node) => node.y);
  assert.ok(Math.min(...archYs(high)) < Math.min(...archYs(low)));
  assert.notDeepEqual(archYs(high), archYs(elliptical));
  assert.equal(high.members.filter((member) => member.memberClass === "masonry-abutment").length, 2);
  assert.ok(high.metadata.brickZones.some((zone) => zone.holes.length === 1));
});

test("multi-arch viaduct uses shared piers and repeated masonry openings", () => {
  const graph = generate("viaduct", { archCount: 4, archRise: 10 }).graph;
  assert.equal(graph.members.filter((member) => member.memberClass === "viaduct-pier").length, 5);
  assert.equal(graph.metadata.brickZones.filter((zone) => zone.role === "viaduct-bay").length, 4);
  assert.equal(graph.members.filter((member) => member.memberClass === "viaduct-masonry-arch").length, 32);
});

test("corbelled bridge has only orthogonal stepped arch members", () => {
  const graph = generate("corbelled").graph;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const member of graph.members.filter((entry) => entry.memberClass === "corbelled-masonry")) {
    const a = byId.get(member.nodeA);
    const b = byId.get(member.nodeB);
    assert.ok(a.x === b.x || a.y === b.y, `member ${member.id} must be an orthogonal brick step`);
  }
});

test("box culvert replaces the steel box truss with a rectangular masonry opening", () => {
  const graph = generate("boxCulvert").graph;
  assert.equal(graph.members.some((member) => member.role === "diagonal"), false);
  const zone = graph.metadata.brickZones.find((entry) => entry.role === "box-culvert");
  assert.ok(zone);
  assert.equal(zone.holes[0].length, 4);
  assert.ok(graph.members.some((member) => member.memberClass === "culvert-lintel"));
});

test("tied arch is distinct from a masonry deck arch", () => {
  const graph = generate("tiedArch").graph;
  const archNodes = new Set(graph.members.filter((member) => member.memberClass === "tied-arch-rib").flatMap((member) => [member.nodeA, member.nodeB]));
  assert.ok(graph.nodes.filter((node) => archNodes.has(node.id)).some((node) => node.y > graph.metadata.vehicleClearance));
  assert.ok(graph.members.some((member) => member.memberClass === "tied-arch-hanger"));
  assert.equal(graph.metadata.construction.compatibility, "hybrid");
});

test("vehicle clearance remains explicit and valid for every family", () => {
  for (const family of FAMILY_IDS) {
    const result = generate(family);
    assert.equal(result.validation.errors.some((entry) => entry.code === "VEHICLE_CLEARANCE"), false, family);
    assert.equal(result.graph.metadata.vehicleClearance, specForChallenge(RAVINE, family).vehicleClearance);
  }
});

test("invalid inputs return explicit brick-aware machine codes", () => {
  const base = specForChallenge(RAVINE, "pratt");
  assert.ok(validateBridgeSpec(RAVINE, { ...base, span: 12 }).errors.some((entry) => entry.code === "SPAN_INVALID"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, deckHeight: 99 }).errors.some((entry) => entry.code === "DECK_OUTSIDE_CORRIDOR"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, bridgeWidth: 4 }).errors.some((entry) => entry.code === "VEHICLE_CLEARANCE"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, panelCount: 1 }).errors.some((entry) => entry.code === "INVALID_PARAMETER_RANGE"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, brick: { ...base.brick, studSize: 2 }, span: 95 }).errors.some((entry) => entry.code === "SPAN_INVALID"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, archRise: 12 }).errors.some((entry) => entry.code === "INVALID_PARAMETER_RANGE"));
  const noTechnic = { ...base, brick: { ...base.brick, allowed: base.brick.allowed.filter((part) => !part.startsWith("technic")) } };
  assert.ok(validateBridgeSpec(RAVINE, noTechnic).errors.some((entry) => entry.code === "CONSTRUCTION_SYSTEM_MISMATCH"));
});

test("graph support validation rejects a disconnected structural member", () => {
  const graph = structuredClone(generate("beam").graph);
  graph.nodes.push({ id: 900, x: 20, y: 60, role: "joint", supportType: "none" }, { id: 901, x: 24, y: 60, role: "joint", supportType: "none" });
  graph.members.push({ id: 900, nodeA: 900, nodeB: 901, role: "beam", memberClass: "floating", capacityClass: 1, buildClass: "brick-beam", rasterMode: "line-raster", sectionStuds: 2 });
  assert.ok(validateGraph(graph).errors.some((entry) => entry.code === "UNSUPPORTED_MEMBER"));
});

test("same input produces byte-identical JSON for every family", () => {
  for (const family of FAMILY_IDS) {
    const first = generate(family);
    const second = generate(family);
    assert.equal(first.canonicalJson, second.canonicalJson, family);
    assert.equal(first.graph.metadata.deterministicChecksum, second.graph.metadata.deterministicChecksum, family);
    assert.equal(first.graph.metadata.designRevision, second.graph.metadata.designRevision, family);
  }
});

test("suspension contains founded towers, anchors, main cable and hanger targets", () => {
  const graph = generate("suspension").graph;
  assert.equal(graph.nodes.filter((node) => node.role === "tower").length, 4);
  assert.equal(graph.nodes.filter((node) => node.role === "tower" && node.supportType === "terrain").length, 2);
  const main = graph.cables.find((cable) => cable.structuralRole === "main");
  assert.ok(main?.hangerTargets.length > 2);
  assert.equal(graph.cables.filter((cable) => cable.structuralRole === "hanger").length, main.hangerTargets.length);
});

test("bascule output identifies two hinges and two leaves", () => {
  const graph = generate("bascule").graph;
  assert.equal(graph.nodes.filter((node) => node.hinge).length, 2);
  assert.equal(graph.members.filter((member) => member.memberClass.startsWith("bascule-leaf")).length, 2);
});

test("JSON schema documents remain valid JSON", async () => {
  for (const name of ["BridgeSpec", "BridgeGraph2D", "ChallengeState"]) {
    const source = await readFile(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8");
    assert.doesNotThrow(() => JSON.parse(source), name);
  }
});

test("generation does not mutate ChallengeState or BridgeSpec", () => {
  const challenge = structuredClone(RAVINE);
  const spec = specForChallenge(challenge, "boxCulvert");
  const beforeChallenge = stableStringify(challenge);
  const beforeSpec = stableStringify(spec);
  generateBridgeGraph2D(challenge, spec);
  assert.equal(stableStringify(challenge), beforeChallenge);
  assert.equal(stableStringify(spec), beforeSpec);
});

test("generation remains on-demand and independent of animation frames", () => {
  let clock = 0;
  const result = generateBridgeGraph2D(RAVINE, specForChallenge(RAVINE, "beam"), () => (clock += 0.125));
  assert.equal(result.generationTimeMs, 0.125);
});
