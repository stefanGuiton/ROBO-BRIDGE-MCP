import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { BRICK_FAMILY_IDS, FAMILY_IDS, HYBRID_FAMILY_IDS } from "../src/engine/catalogue.js";
import { FLAT_GAP, RAVINE, specForChallenge } from "../src/engine/fixtures.js";
import { generateBridgeGraph2D } from "../src/engine/generator.js";
import { stableStringify } from "../src/engine/stable-json.js";
import { validateBridgeSpec, validateGraph } from "../src/engine/validation.js";

function generate(family, overrides = {}, challenge = RAVINE) {
  return generateBridgeGraph2D(challenge, { ...specForChallenge(challenge, family), ...overrides });
}

function graphSignature(graph) {
  return stableStringify({
    nodes: graph.nodes,
    members: graph.members,
    cables: graph.cables,
    brickZones: graph.metadata.brickZones,
    resolvedGeometry: graph.metadata.resolvedGeometry,
  });
}

function withoutAllowed(challenge, ...kinds) {
  const blocked = new Set(kinds);
  return {
    ...structuredClone(challenge),
    supportRegions: challenge.supportRegions.map((region) => ({
      ...region,
      allowed: region.allowed.filter((kind) => !blocked.has(kind)),
    })),
  };
}

function memberCoordinates(graph, member) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return [nodes.get(member.nodeA), nodes.get(member.nodeB)];
}

function assertParameterChangesGeometry(family, parameter, value) {
  const baseline = generate(family);
  const changed = generate(family, { [parameter]: value });
  assert.equal(baseline.validation.valid, true, `${family} baseline`);
  assert.equal(changed.validation.valid, true, `${family}.${parameter}: ${stableStringify(changed.validation)}`);
  assert.notEqual(graphSignature(changed.graph), graphSignature(baseline.graph), `${family}.${parameter} must affect resolved geometry`);
}

test("every family uses the common graph contract and explicit compiler handoff", () => {
  for (const family of FAMILY_IDS) {
    const result = generate(family);
    assert.equal(result.validation.valid, true, `${family}: ${stableStringify(result.validation)}`);
    assert.deepEqual(Object.keys(result.graph).sort(), ["cables", "members", "metadata", "nodes"]);
    assert.ok(result.graph.nodes.length > 1);
    assert.ok(result.graph.members.length > 0);
    assert.equal(result.graph.metadata.generatorVersion, 3);
    assert.equal(result.graph.metadata.construction.compilerReady, true);
    assert.ok(result.graph.metadata.construction.allowedParts.length > 0);
    assert.ok(result.graph.metadata.resolvedGeometry.deckStations.length > 1);
    assert.ok(!("placements" in result.graph), "2D generator must not place bricks");
    for (const node of result.graph.nodes) assert.ok(["id", "x", "y", "role", "supportType"].every((key) => key in node));
    for (const member of result.graph.members) assert.ok([
      "id", "nodeA", "nodeB", "role", "memberClass", "capacityClass", "buildClass", "rasterMode", "connectionIntent", "sectionStuds",
    ].every((key) => key in member));
    for (const cable of result.graph.cables) assert.ok("connectionIntent" in cable);
  }
});

test("brick-native and hybrid catalogues remain honest", () => {
  for (const family of BRICK_FAMILY_IDS) {
    const graph = generate(family).graph;
    assert.equal(graph.metadata.construction.compatibility, "brick-native");
    assert.ok(graph.metadata.brickZones.length > 0, family);
    assert.equal(graph.members.some((member) => member.buildClass === "technic-frame"), false, family);
  }
  for (const family of HYBRID_FAMILY_IDS) {
    const result = generate(family);
    assert.equal(result.validation.valid, true, family);
    assert.ok(result.validation.warnings.some((entry) => entry.code === "HYBRID_PARTS_REQUIRED"), family);
    assert.equal(result.graph.metadata.construction.compatibility, "hybrid");
  }
});

test("beam is a clear span and pier is a distinct supported family", () => {
  const beamResult = generate("beam", {}, FLAT_GAP);
  const pierResult = generate("pier", {}, FLAT_GAP);
  assert.equal(beamResult.validation.valid, true);
  assert.equal(pierResult.validation.valid, true);
  assert.deepEqual(beamResult.graph.nodes.filter((node) => node.supportType === "fixed").map((node) => node.x), [0, 80]);
  assert.equal(beamResult.graph.members.some((member) => member.role === "pier"), false);
  assert.ok(pierResult.graph.members.some((member) => member.memberClass === "bonded-pier"));
  assert.notEqual(graphSignature(beamResult.graph), graphSignature(pierResult.graph));
  assert.ok(validateBridgeSpec(FLAT_GAP, { ...specForChallenge(FLAT_GAP, "beam"), pierCount: 2 }).errors.some((entry) => entry.code === "INVALID_PARAMETER_RANGE"));
});

test("pier positions preserve requested spacing instead of silently falling back", () => {
  const result = generate("pier", { pierCount: 4, pierSpacing: 16 });
  assert.equal(result.validation.valid, true);
  assert.deepEqual(result.graph.metadata.resolvedGeometry.pierStations, [24, 40, 56, 72]);
  const impossible = generate("pier", { pierCount: 8, pierSpacing: 16 });
  assert.equal(impossible.graph, null);
  assert.ok(impossible.validation.errors.some((entry) => entry.code === "BRICK_GRID_MISMATCH"));
});

test("trestle and Warren cross-bracing switches change members", () => {
  assertParameterChangesGeometry("trestle", "crossBracing", false);
  assertParameterChangesGeometry("warren", "crossBracing", true);
});

test("Pratt diagonals descend towards the centre and Howe is the reverse", () => {
  for (const family of ["pratt", "howe"]) {
    const graph = generate(family, { crossBracing: false }).graph;
    const midpoint = graph.metadata.span / 2 + RAVINE.entry.position.x;
    const diagonals = graph.members.filter((member) => member.memberClass === `${family}-diagonal`);
    assert.ok(diagonals.length > 2);
    for (const member of diagonals) {
      const [a, b] = memberCoordinates(graph, member);
      const upper = a.y > b.y ? a : b;
      const lower = a.y > b.y ? b : a;
      const panelMidpoint = (upper.x + lower.x) / 2;
      if (family === "pratt") {
        assert.equal(panelMidpoint < midpoint ? upper.x < lower.x : upper.x > lower.x, true, `Pratt ${member.id}`);
      } else {
        assert.equal(panelMidpoint < midpoint ? upper.x > lower.x : upper.x < lower.x, true, `Howe ${member.id}`);
      }
    }
  }
});

test("masonry arch responds to rise/profile and supports asymmetric banks", () => {
  const low = generate("arch", { archRise: 16 }).graph;
  const high = generate("arch", { archRise: 24 }).graph;
  const elliptical = generate("arch", { archRise: 24, archShape: "elliptical" }).graph;
  const archYs = (graph) => graph.members
    .filter((member) => member.role === "arch")
    .flatMap((member) => memberCoordinates(graph, member))
    .map((node) => node.y);
  assert.notDeepEqual(archYs(high), archYs(low));
  assert.notDeepEqual(archYs(high), archYs(elliptical));

  const asymmetric = structuredClone(RAVINE);
  asymmetric.supportRegions.at(-1).foundationY = 5;
  const result = generate("arch", {}, asymmetric);
  assert.equal(result.validation.valid, true, stableStringify(result.validation));
  const body = result.graph.metadata.brickZones.find((zone) => zone.role === "masonry-body");
  assert.equal(body.holes[0].at(-2).y, 5);
  assert.equal(validateGraph(result.graph).valid, true);
});

test("viaduct uses unique positive-width bays and rejects snapped collapse", () => {
  const graph = generate("viaduct", { archCount: 4, archRise: 10 }).graph;
  assert.equal(graph.members.filter((member) => member.memberClass === "viaduct-pier").length, 5);
  assert.equal(graph.metadata.brickZones.filter((zone) => zone.role === "viaduct-bay").length, 4);

  const tiny = structuredClone(FLAT_GAP);
  tiny.exit.position.x = 8;
  tiny.corridor.centreline[1].x = 8;
  tiny.terrain.obstacle.width = 8;
  tiny.supportRegions = [
    { id: "left-bank", xMin: -16, xMax: 0, foundationY: 0, allowed: ["fixed", "arch"] },
    { id: "gap-floor", xMin: 0.01, xMax: 7.99, foundationY: -18, allowed: ["pier", "arch"] },
    { id: "right-bank", xMin: 8, xMax: 24, foundationY: 0, allowed: ["fixed", "arch"] },
  ];
  const spec = { ...specForChallenge(tiny, "viaduct"), archCount: 8, archRise: 4, brick: { ...specForChallenge(tiny, "viaduct").brick, studSize: 2 } };
  const validation = validateBridgeSpec(tiny, spec);
  assert.ok(validation.errors.some((entry) => entry.code === "BRICK_GRID_MISMATCH"));
});

test("corbelled bridge is orthogonal and box culvert remains a masonry portal", () => {
  const corbelled = generate("corbelled").graph;
  for (const member of corbelled.members.filter((entry) => entry.memberClass === "corbelled-masonry")) {
    const [a, b] = memberCoordinates(corbelled, member);
    assert.ok(a.x === b.x || a.y === b.y, `member ${member.id} must be an orthogonal brick step`);
  }
  const culvert = generate("boxCulvert").graph;
  assert.equal(culvert.members.some((member) => member.role === "diagonal"), false);
  assert.equal(culvert.metadata.brickZones.find((zone) => zone.role === "box-culvert").holes[0].length, 4);
});

test("tied-arch hanger spacing and cross-bracing are real geometry inputs", () => {
  const dense = generate("tiedArch", { hangerSpacing: 8, crossBracing: true }).graph;
  const sparse = generate("tiedArch", { hangerSpacing: 12, crossBracing: true }).graph;
  const unbraced = generate("tiedArch", { hangerSpacing: 8, crossBracing: false }).graph;
  assert.notEqual(dense.members.filter((member) => member.memberClass === "tied-arch-hanger").length, sparse.members.filter((member) => member.memberClass === "tied-arch-hanger").length);
  assert.ok(dense.members.some((member) => member.memberClass === "tied-arch-cross-brace"));
  assert.equal(unbraced.members.some((member) => member.memberClass === "tied-arch-cross-brace"), false);
});

test("every family-specific parameter changes geometry or resolved build intent", () => {
  const cases = [
    ["beam", "panelCount", 10],
    ["pier", "panelCount", 10], ["pier", "pierCount", 3], ["pier", "pierSpacing", 20],
    ["trestle", "panelCount", 10], ["trestle", "pierCount", 3], ["trestle", "pierSpacing", 16],
    ["warren", "panelCount", 10], ["warren", "trussHeight", 18],
    ["pratt", "panelCount", 10], ["pratt", "trussHeight", 18], ["pratt", "crossBracing", false],
    ["howe", "panelCount", 10], ["howe", "trussHeight", 18], ["howe", "crossBracing", false],
    ["arch", "panelCount", 20], ["arch", "archShape", "elliptical"], ["arch", "archRise", 20],
    ["viaduct", "archCount", 3], ["viaduct", "archShape", "elliptical"], ["viaduct", "archRise", 8],
    ["corbelled", "archRise", 18], ["boxCulvert", "panelCount", 10],
    ["tiedArch", "panelCount", 10], ["tiedArch", "trussHeight", 18], ["tiedArch", "hangerSpacing", 12], ["tiedArch", "crossBracing", false],
    ["suspension", "panelCount", 10], ["suspension", "towerHeight", 22], ["suspension", "cableSag", 9], ["suspension", "hangerSpacing", 12],
    ["bascule", "panelCount", 12], ["bascule", "towerHeight", 20],
  ];
  for (const [family, parameter, value] of cases) assertParameterChangesGeometry(family, parameter, value);
});

test("foundation preflight fails closed for piers, towers, anchors, and abutments", () => {
  const noPiers = withoutAllowed(RAVINE, "pier");
  const pierResult = generate("pier", {}, noPiers);
  assert.equal(pierResult.graph, null);
  assert.ok(pierResult.validation.errors.some((entry) => entry.code === "PIER_NO_FOUNDATION"));

  const suspensionTower = generate("suspension", {}, noPiers);
  assert.equal(suspensionTower.graph, null);
  assert.ok(suspensionTower.validation.errors.some((entry) => entry.code === "FOUNDATION_NOT_FOUND"));

  const noAnchors = withoutAllowed(RAVINE, "anchor");
  const suspensionAnchor = generate("suspension", {}, noAnchors);
  assert.equal(suspensionAnchor.graph, null);
  assert.ok(suspensionAnchor.validation.errors.some((entry) => entry.code === "INVALID_CABLE_ANCHOR"));

  const noFixed = withoutAllowed(RAVINE, "fixed");
  const beamResult = generate("beam", {}, noFixed);
  assert.equal(beamResult.graph, null);
  assert.ok(beamResult.validation.errors.some((entry) => entry.code === "FOUNDATION_NOT_FOUND"));

  const basculeTower = generate("bascule", {}, noPiers);
  assert.equal(basculeTower.graph, null);
  assert.ok(basculeTower.validation.errors.some((entry) => entry.code === "FOUNDATION_NOT_FOUND"));
});

test("bascule has separate leaf tips, real panel subdivisions, and no bonded zone across the opening", () => {
  const graph = generate("bascule", { panelCount: 8 }).graph;
  const hinges = graph.nodes.filter((node) => node.articulation === "hinge");
  const tips = graph.nodes.filter((node) => node.articulation === "leaf-tip");
  assert.equal(hinges.length, 2);
  assert.equal(tips.length, 2);
  assert.notEqual(tips[0].id, tips[1].id);
  assert.equal(tips[0].x, tips[1].x);
  assert.equal(tips[0].coincidentGroup, "bascule-centre-tips");
  assert.equal(graph.metadata.brickZones.some((zone) => zone.role === "deck"), false);
  assert.deepEqual(graph.metadata.brickZones.filter((zone) => zone.role.startsWith("bascule-approach")).map((zone) => zone.role).sort(), ["bascule-approach-left", "bascule-approach-right"]);
  const morePanels = generate("bascule", { panelCount: 12 }).graph;
  assert.ok(morePanels.members.filter((member) => member.articulation === "movable-leaf").length > graph.members.filter((member) => member.articulation === "movable-leaf").length);
});

test("vehicle clearance remains explicit and valid for every family", () => {
  for (const family of FAMILY_IDS) {
    const result = generate(family);
    assert.equal(result.validation.errors.some((entry) => entry.code === "VEHICLE_CLEARANCE"), false, family);
    assert.equal(result.graph.metadata.vehicleClearance, specForChallenge(RAVINE, family).vehicleClearance);
  }
});

test("machine-readable input errors include independent grid and brick-intent cases", () => {
  const base = specForChallenge(RAVINE, "pratt");
  assert.ok(validateBridgeSpec(RAVINE, { ...base, span: 12 }).errors.some((entry) => entry.code === "SPAN_INVALID"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, deckHeight: 99 }).errors.some((entry) => entry.code === "DECK_OUTSIDE_CORRIDOR"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, bridgeWidth: 4 }).errors.some((entry) => entry.code === "VEHICLE_CLEARANCE"));
  assert.ok(validateBridgeSpec(RAVINE, { ...base, panelCount: 1 }).errors.some((entry) => entry.code === "INVALID_PARAMETER_RANGE"));
  const gridOnly = specForChallenge(RAVINE, "beam");
  gridOnly.deckHeight = 33.5;
  assert.ok(validateBridgeSpec(RAVINE, gridOnly).errors.some((entry) => entry.code === "BRICK_GRID_MISMATCH"));
  const noBrick = structuredClone(base);
  delete noBrick.brick;
  assert.ok(validateBridgeSpec(RAVINE, noBrick).errors.some((entry) => entry.code === "BRICK_INTENT_MISSING"));
});

test("graph validation rejects disconnected, zero-length, coincident, and malformed cable geometry", () => {
  const disconnected = structuredClone(generate("beam").graph);
  disconnected.nodes.push({ id: 900, x: 20, y: 60, role: "joint", supportType: "none" }, { id: 901, x: 24, y: 60, role: "joint", supportType: "none" });
  disconnected.members.push({ id: 900, nodeA: 900, nodeB: 901, role: "beam", memberClass: "floating", capacityClass: 1, buildClass: "brick-beam", rasterMode: "line-raster", connectionIntent: "overlapping-stud-bond", sectionStuds: 2 });
  assert.ok(validateGraph(disconnected).errors.some((entry) => entry.code === "UNSUPPORTED_MEMBER"));

  const zeroLength = structuredClone(generate("beam").graph);
  zeroLength.nodes[1].x = zeroLength.nodes[0].x;
  zeroLength.nodes[1].y = zeroLength.nodes[0].y;
  assert.ok(validateGraph(zeroLength).errors.some((entry) => entry.code === "DEGENERATE_GEOMETRY"));

  const duplicateMember = structuredClone(generate("beam").graph);
  duplicateMember.members.push({ ...duplicateMember.members[0], id: 999 });
  assert.ok(validateGraph(duplicateMember).errors.some((entry) => entry.code === "DEGENERATE_GEOMETRY"));

  const cable = structuredClone(generate("suspension").graph);
  cable.cables[0].anchorNodeA = 99999;
  assert.ok(validateGraph(cable).errors.some((entry) => entry.code === "INVALID_CABLE_ANCHOR"));

  const missingIntent = structuredClone(generate("beam").graph);
  delete missingIntent.members[0].connectionIntent;
  assert.ok(validateGraph(missingIntent).errors.some((entry) => entry.code === "BRICK_INTENT_MISSING"));
});

test("brick-zone validation rejects zero area, self-intersection, and escaped openings", () => {
  const zeroArea = structuredClone(generate("beam").graph);
  zeroArea.metadata.brickZones[0].outer = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
  assert.ok(validateGraph(zeroArea).errors.some((entry) => entry.code === "DEGENERATE_GEOMETRY"));

  const crossed = structuredClone(generate("beam").graph);
  crossed.metadata.brickZones[0].outer = [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 }];
  assert.ok(validateGraph(crossed).errors.some((entry) => entry.code === "INVALID_BRICK_ZONE"));

  const escaped = structuredClone(generate("arch").graph);
  escaped.metadata.brickZones.find((zone) => zone.holes.length).holes[0][0].x = -100;
  assert.ok(validateGraph(escaped).errors.some((entry) => entry.code === "INVALID_BRICK_ZONE"));
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

test("suspension contains founded towers, anchors, main cable, and reused deck hanger nodes", () => {
  const graph = generate("suspension").graph;
  assert.equal(graph.nodes.filter((node) => node.role === "tower").length, 4);
  assert.equal(graph.nodes.filter((node) => node.role === "tower" && node.supportType === "terrain").length, 2);
  const main = graph.cables.find((cable) => cable.structuralRole === "main");
  assert.ok(main?.hangerTargets.length > 2);
  assert.equal(graph.cables.filter((cable) => cable.structuralRole === "hanger").length, main.hangerTargets.length);
  const duplicatePoints = new Map();
  for (const node of graph.nodes) duplicatePoints.set(`${node.x},${node.y}`, (duplicatePoints.get(`${node.x},${node.y}`) ?? 0) + 1);
  assert.equal([...duplicatePoints.values()].some((count) => count > 1), false);
});

test("Draft 2020-12 schemas validate every fixture and reject wrong-family or malformed inputs", async () => {
  const names = ["BridgeSpec", "BridgeGraph2D", "ChallengeState"];
  const schemas = Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    JSON.parse(await readFile(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8")),
  ])));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validators = Object.fromEntries(names.map((name) => [name, ajv.compile(schemas[name])]));

  for (const challengeName of ["flat-gap", "ravine"]) {
    const fixture = JSON.parse(await readFile(new URL(`../fixtures/exports/ChallengeState.${challengeName}.json`, import.meta.url), "utf8"));
    assert.equal(validators.ChallengeState(fixture), true, stableStringify(validators.ChallengeState.errors));
  }
  for (const family of FAMILY_IDS) {
    const spec = JSON.parse(await readFile(new URL(`../fixtures/exports/BridgeSpec.${family}.json`, import.meta.url), "utf8"));
    const graph = JSON.parse(await readFile(new URL(`../fixtures/exports/BridgeGraph2D.${family}.json`, import.meta.url), "utf8"));
    assert.equal(validators.BridgeSpec(spec), true, `${family}: ${stableStringify(validators.BridgeSpec.errors)}`);
    assert.equal(validators.BridgeGraph2D(graph), true, `${family}: ${stableStringify(validators.BridgeGraph2D.errors)}`);
  }

  const wrongFamily = { ...specForChallenge(RAVINE, "pratt"), archRise: 12 };
  assert.equal(validators.BridgeSpec(wrongFamily), false);
  const malformedTerrain = structuredClone(RAVINE);
  malformedTerrain.terrain.width = "wide";
  assert.equal(validators.ChallengeState(malformedTerrain), false);
  const malformedGraph = structuredClone(generate("beam").graph);
  delete malformedGraph.members[0].connectionIntent;
  assert.equal(validators.BridgeGraph2D(malformedGraph), false);
});

test("generation does not mutate inputs and remains independent of animation frames", () => {
  const challenge = structuredClone(RAVINE);
  const spec = specForChallenge(challenge, "boxCulvert");
  const beforeChallenge = stableStringify(challenge);
  const beforeSpec = stableStringify(spec);
  let clock = 0;
  const result = generateBridgeGraph2D(challenge, spec, () => (clock += 0.125));
  assert.equal(stableStringify(challenge), beforeChallenge);
  assert.equal(stableStringify(spec), beforeSpec);
  assert.equal(result.generationTimeMs, 0.125);
});
