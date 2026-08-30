import { checksum, fnv1a, stableStringify } from "./stable-json.js";
import { foundationAt, report, validateBridgeSpec, validateGraph } from "./validation.js";

const round = (value) => Math.round(value * 1e6) / 1e6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function createBuilder(challenge, spec) {
  const nodes = [];
  const members = [];
  const cables = [];
  const startX = challenge.entry.position.x;
  const capacity = clamp(Math.round(spec.targetLoadClass + spec.structuralDensity - 0.5), 1, 5);
  return {
    challenge,
    spec,
    startX,
    endX: startX + spec.span,
    capacity,
    nodes,
    members,
    cables,
    node(x, y, role = "joint", supportType = "none", extra = {}) {
      const node = { id: nodes.length + 1, x: round(x), y: round(y), role, supportType, ...extra };
      nodes.push(node);
      return node.id;
    },
    member(nodeA, nodeB, role, memberClass, capacityClass = capacity, extra = {}) {
      const member = { id: members.length + 1, nodeA, nodeB, role, memberClass, capacityClass, ...extra };
      members.push(member);
      return member.id;
    },
    cable(anchorNodeA, anchorNodeB, structuralRole, samples, hangerTargets = [], extra = {}) {
      const cable = {
        id: cables.length + 1,
        anchorNodeA,
        anchorNodeB,
        structuralRole,
        breakable: false,
        samples: samples.map((point) => ({ x: round(point.x), y: round(point.y) })),
        hangerTargets: hangerTargets.map((point) => ({ x: round(point.x), y: round(point.y) })),
        ...extra,
      };
      cables.push(cable);
      return cable.id;
    },
  };
}

function stationXs(builder, includePiers = false) {
  const { spec, startX } = builder;
  const xs = Array.from({ length: spec.panelCount + 1 }, (_, index) => startX + (spec.span * index) / spec.panelCount);
  if (includePiers) xs.push(...pierXs(builder));
  return [...new Set(xs.map(round))].sort((a, b) => a - b);
}

function pierXs(builder) {
  const { spec, startX } = builder;
  if (!spec.pierCount) return [];
  const center = startX + spec.span / 2;
  const desired = Array.from({ length: spec.pierCount }, (_, index) => center + (index - (spec.pierCount - 1) / 2) * spec.pierSpacing)
    .filter((x) => x > startX + 0.001 && x < startX + spec.span - 0.001);
  if (desired.length === spec.pierCount) return desired.map(round);
  return Array.from({ length: spec.pierCount }, (_, index) => startX + (spec.span * (index + 1)) / (spec.pierCount + 1)).map(round);
}

function deck(builder, xs = stationXs(builder), extra = {}) {
  const { spec } = builder;
  const ids = xs.map((x, index) => builder.node(
    x,
    spec.deckHeight,
    index === 0 || index === xs.length - 1 ? "support" : "deck",
    index === 0 || index === xs.length - 1 ? "fixed" : "none",
    extra,
  ));
  for (let index = 0; index < ids.length - 1; index += 1) builder.member(ids[index], ids[index + 1], "deck", "deck-primary", builder.capacity + 1, extra);
  return { xs, ids };
}

function addPiers(builder, deckData, withBracing = false) {
  const piers = [];
  for (const x of pierXs(builder)) {
    const foundationY = foundationAt(builder.challenge, x, "pier");
    if (foundationY == null) continue;
    const topIndex = deckData.xs.findIndex((station) => Math.abs(station - x) < 1e-5);
    const topId = topIndex >= 0 ? deckData.ids[topIndex] : builder.node(x, builder.spec.deckHeight, "deck", "none");
    const baseId = builder.node(x, foundationY, "pier", "terrain");
    builder.member(baseId, topId, "pier", "pier-column", builder.capacity + 1);
    piers.push({ x, topId, baseId });
  }
  if (withBracing) {
    for (let index = 0; index < piers.length - 1; index += 1) {
      builder.member(piers[index].baseId, piers[index + 1].topId, "diagonal", "trestle-x-brace", builder.capacity);
      builder.member(piers[index].topId, piers[index + 1].baseId, "diagonal", "trestle-x-brace", builder.capacity);
    }
  }
  return piers;
}

function beam(builder) {
  const deckData = deck(builder, stationXs(builder, true));
  addPiers(builder, deckData, false);
}

function trestle(builder) {
  const deckData = deck(builder, stationXs(builder, true));
  addPiers(builder, deckData, builder.spec.crossBracing);
}

function warren(builder) {
  const deckData = deck(builder);
  const topIds = [];
  for (let index = 0; index < builder.spec.panelCount; index += 1) {
    const x = (deckData.xs[index] + deckData.xs[index + 1]) / 2;
    topIds.push(builder.node(x, builder.spec.deckHeight + builder.spec.trussHeight, "joint", "none"));
    builder.member(deckData.ids[index], topIds[index], "diagonal", "warren-diagonal");
    builder.member(topIds[index], deckData.ids[index + 1], "diagonal", "warren-diagonal");
    if (index > 0) builder.member(topIds[index - 1], topIds[index], "chord", "upper-chord", builder.capacity + 1);
  }
  if (builder.spec.crossBracing && builder.spec.structuralDensity > 0.72) {
    for (let index = 1; index < topIds.length; index += 2) builder.member(topIds[index], deckData.ids[index], "vertical", "warren-secondary", builder.capacity - 1);
  }
}

function prattHowe(builder, mode) {
  const deckData = deck(builder);
  const topIds = deckData.xs.map((x) => builder.node(x, builder.spec.deckHeight + builder.spec.trussHeight, "joint", "none"));
  for (let index = 0; index < topIds.length - 1; index += 1) builder.member(topIds[index], topIds[index + 1], "chord", "upper-chord", builder.capacity + 1);
  for (let index = 0; index < topIds.length; index += 1) builder.member(deckData.ids[index], topIds[index], "vertical", "truss-vertical");
  const midpoint = builder.spec.panelCount / 2;
  for (let index = 0; index < builder.spec.panelCount; index += 1) {
    const leftHalf = index < midpoint;
    const prattForward = leftHalf;
    const forward = mode === "pratt" ? prattForward : !prattForward;
    builder.member(
      forward ? deckData.ids[index] : topIds[index],
      forward ? topIds[index + 1] : deckData.ids[index + 1],
      "diagonal",
      `${mode}-diagonal`,
    );
    if (builder.spec.crossBracing && Math.abs(index + 0.5 - midpoint) < 1.1) {
      builder.member(
        forward ? topIds[index] : deckData.ids[index],
        forward ? deckData.ids[index + 1] : topIds[index + 1],
        "diagonal",
        `${mode}-counter-brace`,
        builder.capacity - 1,
      );
    }
  }
}

function archCurveY(shape, x, startX, span, deckHeight, rise) {
  const t = clamp((x - startX) / span, 0, 1);
  const spring = deckHeight - rise;
  if (shape === "parabolic") return spring + 4 * rise * t * (1 - t);
  const half = span / 2;
  const radius = (half * half + rise * rise) / (2 * rise);
  const centreY = spring + rise - radius;
  const localX = x - (startX + half);
  return centreY + Math.sqrt(Math.max(0, radius * radius - localX * localX));
}

function arch(builder) {
  const deckData = deck(builder);
  const count = Math.max(builder.spec.panelCount, 8);
  const archIds = [];
  for (let index = 0; index <= count; index += 1) {
    const x = builder.startX + (builder.spec.span * index) / count;
    const y = archCurveY(builder.spec.archShape, x, builder.startX, builder.spec.span, builder.spec.deckHeight, builder.spec.archRise);
    archIds.push(builder.node(x, y, index === 0 || index === count ? "support" : "joint", index === 0 || index === count ? "terrain" : "none"));
    if (index > 0) builder.member(archIds[index - 1], archIds[index], "arch", `${builder.spec.archShape}-arch`, builder.capacity + 1);
    if (index > 0 && index < count) {
      const nearestDeck = Math.round((index / count) * builder.spec.panelCount);
      builder.member(archIds[index], deckData.ids[nearestDeck], "vertical", "arch-spandrel", builder.capacity);
    }
  }
}

function aqueduct(builder) {
  const count = builder.spec.archCount;
  const moduleSpan = builder.spec.span / count;
  const deckData = deck(builder, Array.from({ length: count * 4 + 1 }, (_, index) => builder.startX + (builder.spec.span * index) / (count * 4)));
  const pierTopByX = new Map(deckData.xs.map((x, index) => [round(x), deckData.ids[index]]));
  for (let module = 0; module < count; module += 1) {
    const moduleStart = builder.startX + module * moduleSpan;
    const spring = Math.min(builder.spec.archRise, builder.spec.deckHeight - foundationAt(builder.challenge, moduleStart + moduleSpan / 2, "arch") - 2);
    let previous = null;
    for (let step = 0; step <= 8; step += 1) {
      const x = moduleStart + (moduleSpan * step) / 8;
      const y = archCurveY(builder.spec.archShape, x, moduleStart, moduleSpan, builder.spec.deckHeight - 2, spring);
      const id = builder.node(x, y, step === 0 || step === 8 ? "pier" : "joint", step === 0 || step === 8 ? "terrain" : "none");
      if (previous) builder.member(previous, id, "arch", "aqueduct-arch", builder.capacity + 1);
      previous = id;
    }
  }
  for (let index = 0; index <= count; index += 1) {
    const x = round(builder.startX + index * moduleSpan);
    const foundationY = foundationAt(builder.challenge, x, index === 0 || index === count ? "fixed" : "pier");
    const baseId = builder.node(x, foundationY ?? builder.spec.deckHeight - builder.spec.archRise, "pier", "terrain");
    const topId = pierTopByX.get(x) ?? builder.node(x, builder.spec.deckHeight, "deck", "none");
    builder.member(baseId, topId, "pier", "aqueduct-pier", builder.capacity + 1);
  }
}

function box(builder) {
  for (const side of ["near", "far"]) {
    const deckData = deck(builder, stationXs(builder), { side });
    const topIds = deckData.xs.map((x) => builder.node(x, builder.spec.deckHeight + builder.spec.trussHeight, "joint", "none", { side }));
    for (let index = 0; index < topIds.length; index += 1) {
      builder.member(deckData.ids[index], topIds[index], "vertical", "box-vertical", builder.capacity, { side });
      if (index > 0) {
        builder.member(topIds[index - 1], topIds[index], "chord", "box-upper-chord", builder.capacity + 1, { side });
        const even = index % 2 === 0;
        builder.member(even ? deckData.ids[index - 1] : topIds[index - 1], even ? topIds[index] : deckData.ids[index], "diagonal", "box-side-brace", builder.capacity, { side });
      }
    }
  }
}

function cablePointOnCentralSpan(x, leftX, rightX, topY, sag) {
  const t = clamp((x - leftX) / (rightX - leftX), 0, 1);
  return topY - 4 * sag * t * (1 - t);
}

function suspension(builder) {
  const deckData = deck(builder);
  const leftTowerX = builder.startX + builder.spec.span * 0.2;
  const rightTowerX = builder.startX + builder.spec.span * 0.8;
  const leftBase = builder.node(leftTowerX, builder.spec.deckHeight, "tower", "terrain");
  const rightBase = builder.node(rightTowerX, builder.spec.deckHeight, "tower", "terrain");
  const towerTopY = builder.spec.deckHeight + builder.spec.towerHeight;
  const leftTop = builder.node(leftTowerX, towerTopY, "tower", "none");
  const rightTop = builder.node(rightTowerX, towerTopY, "tower", "none");
  builder.member(leftBase, leftTop, "tower", "suspension-tower", builder.capacity + 1);
  builder.member(rightBase, rightTop, "tower", "suspension-tower", builder.capacity + 1);
  const leftAnchorX = builder.startX - builder.spec.span * 0.08;
  const rightAnchorX = builder.endX + builder.spec.span * 0.08;
  const leftAnchorY = foundationAt(builder.challenge, leftAnchorX, "anchor") ?? builder.spec.deckHeight - builder.spec.towerHeight * 0.25;
  const rightAnchorY = foundationAt(builder.challenge, rightAnchorX, "anchor") ?? builder.spec.deckHeight - builder.spec.towerHeight * 0.25;
  const leftAnchor = builder.node(leftAnchorX, leftAnchorY, "anchor", "terrain");
  const rightAnchor = builder.node(rightAnchorX, rightAnchorY, "anchor", "terrain");
  const samples = [];
  for (let index = 0; index <= 48; index += 1) {
    const x = leftAnchorX + ((rightAnchorX - leftAnchorX) * index) / 48;
    let y;
    if (x <= leftTowerX) y = leftAnchorY + ((towerTopY - leftAnchorY) * (x - leftAnchorX)) / (leftTowerX - leftAnchorX);
    else if (x >= rightTowerX) y = towerTopY + ((rightAnchorY - towerTopY) * (x - rightTowerX)) / (rightAnchorX - rightTowerX);
    else y = cablePointOnCentralSpan(x, leftTowerX, rightTowerX, towerTopY, builder.spec.cableSag);
    samples.push({ x, y });
  }
  const hangerTargets = [];
  for (let x = leftTowerX + builder.spec.hangerSpacing; x < rightTowerX - 0.001; x += builder.spec.hangerSpacing) hangerTargets.push({ x, y: builder.spec.deckHeight });
  builder.cable(leftAnchor, rightAnchor, "main", samples, hangerTargets, { sag: builder.spec.cableSag });
  for (const target of hangerTargets) {
    const cableY = cablePointOnCentralSpan(target.x, leftTowerX, rightTowerX, towerTopY, builder.spec.cableSag);
    const cableNode = builder.node(target.x, cableY, "anchor", "none", { cableAttachment: true });
    const deckNode = builder.node(target.x, target.y, "deck", "none", { cableAttachment: true });
    builder.cable(cableNode, deckNode, "hanger", [{ x: target.x, y: cableY }, target], [], { parentCableId: 1 });
  }
}

const GENERATORS = { beam, trestle, warren, pratt: (builder) => prattHowe(builder, "pratt"), howe: (builder) => prattHowe(builder, "howe"), arch, aqueduct, box, suspension };

function missingFoundationIssues(builder) {
  if (!["beam", "trestle", "aqueduct"].includes(builder.spec.family)) return [];
  const kind = builder.spec.family === "aqueduct" ? "arch" : "pier";
  return pierXs(builder)
    .filter((x) => foundationAt(builder.challenge, x, kind) == null)
    .map((x) => ({ code: "PIER_NO_FOUNDATION", path: "pierCount", message: `No ${kind} foundation is available at x=${x}.`, severity: "error" }));
}

export function generateBridgeGraph2D(challenge, spec, clock = () => globalThis.performance?.now?.() ?? Date.now()) {
  const started = clock();
  const inputValidation = validateBridgeSpec(challenge, spec);
  if (!inputValidation.valid) return { graph: null, validation: inputValidation, generationTimeMs: round(clock() - started) };
  const builder = createBuilder(challenge, spec);
  const supportIssues = missingFoundationIssues(builder);
  if (supportIssues.length) return { graph: null, validation: report(supportIssues), generationTimeMs: round(clock() - started) };
  GENERATORS[spec.family](builder);
  const designRevision = fnv1a({ challenge, spec, generatorVersion: 1 });
  const graph = {
    nodes: builder.nodes,
    members: builder.members,
    cables: builder.cables,
    metadata: {
      version: 3,
      generatorVersion: 1,
      family: spec.family,
      span: spec.span,
      bridgeWidth: spec.bridgeWidth,
      vehicleClearance: spec.vehicleClearance,
      sideStructures: spec.family === "box" ? 2 : 1,
      sharedDeck: spec.family === "box",
      designRevision,
      deterministicChecksum: "",
    },
  };
  graph.metadata.deterministicChecksum = checksum({ ...graph, metadata: { ...graph.metadata, deterministicChecksum: "" } });
  const graphValidation = validateGraph(graph);
  return { graph, validation: graphValidation, generationTimeMs: round(clock() - started), canonicalJson: stableStringify(graph) };
}
