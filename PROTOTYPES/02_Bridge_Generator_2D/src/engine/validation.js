import { FAMILY_IDS, familyProfile } from "./catalogue.js";

export const ERROR_CODES = Object.freeze([
  "SPAN_INVALID", "DECK_OUTSIDE_CORRIDOR", "VEHICLE_CLEARANCE", "PIER_NO_FOUNDATION",
  "UNSUPPORTED_MEMBER", "INVALID_PARAMETER_RANGE", "INVALID_CABLE_ANCHOR",
  "BRICK_GRID_MISMATCH", "BRICK_INTENT_MISSING", "CONSTRUCTION_SYSTEM_MISMATCH",
  "HYBRID_PARTS_REQUIRED",
]);

const ARCH_SHAPES = new Set(["segmental", "elliptical"]);
const BOND_PATTERNS = new Set(["running", "stack"]);
const PARTS = new Set([
  "brick-2x4", "brick-2x2", "brick-1x4", "brick-1x2", "brick-1x1", "arch-wedge",
  "technic-beam", "technic-connector", "cable", "chain", "hinge",
]);
const COMMON_KEYS = Object.freeze([
  "version", "family", "seed", "span", "deckHeight", "bridgeWidth", "vehicleClearance",
  "symmetry", "structuralDensity", "targetLoadClass", "brick",
]);
const RANGE_RULES = Object.freeze({
  panelCount: [2, 32, true], trussHeight: [4, 50, false], pierCount: [0, 12, true],
  pierSpacing: [4, 40, false], archCount: [1, 12, true], archRise: [4, 48, false],
  towerHeight: [8, 50, false], cableSag: [2, 30, false], hangerSpacing: [2, 24, false],
  structuralDensity: [0.2, 1, false], targetLoadClass: [1, 5, true],
});

function issue(code, path, message, severity = "error") {
  return { code, path, message, severity };
}

function aligned(value, step) {
  return Number.isFinite(value) && Math.abs(value / step - Math.round(value / step)) < 1e-6;
}

export function terrainHeightAt(challenge, x) {
  const points = challenge.terrain.profile;
  if (x <= points[0].x) return points[0].y;
  if (x >= points.at(-1).x) return points.at(-1).y;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (x >= a.x && x <= b.x) {
      const width = b.x - a.x;
      if (Math.abs(width) < 1e-9) return Math.min(a.y, b.y);
      const t = (x - a.x) / width;
      return a.y + (b.y - a.y) * t;
    }
  }
  return 0;
}

export function foundationAt(challenge, x, kind = "pier") {
  const region = challenge.supportRegions.find((candidate) => x >= candidate.xMin - 1e-6
    && x <= candidate.xMax + 1e-6 && candidate.allowed.includes(kind));
  if (!region) return null;
  if (region.id.includes("bed") || region.id.includes("floor")) return terrainHeightAt(challenge, x);
  return region.foundationY;
}

export function validateChallengeState(challenge) {
  const issues = [];
  if (!challenge || challenge.version !== 3) issues.push(issue("INVALID_PARAMETER_RANGE", "version", "ChallengeState.version must be 3."));
  if (!challenge?.entry?.position || !challenge?.exit?.position) issues.push(issue("SPAN_INVALID", "entry/exit", "ENTRY and EXIT positions are required."));
  if (!Array.isArray(challenge?.terrain?.profile) || challenge.terrain.profile.length < 2) issues.push(issue("INVALID_PARAMETER_RANGE", "terrain.profile", "Terrain profile needs at least two points."));
  if (!Array.isArray(challenge?.supportRegions)) issues.push(issue("INVALID_PARAMETER_RANGE", "supportRegions", "Support regions must be an array."));
  if (!challenge?.corridor || !Array.isArray(challenge.corridor.deckElevationRange)) issues.push(issue("DECK_OUTSIDE_CORRIDOR", "corridor", "The transport corridor needs an elevation range."));
  return report(issues);
}

function validateBrickSettings(spec, issues) {
  const brick = spec?.brick;
  const expected = new Set(["allowed", "maxBeamStuds", "sideThicknessStuds", "deckThicknessLayers", "bondPattern", "studSize", "layerHeight"]);
  if (!brick || typeof brick !== "object" || Array.isArray(brick)) {
    issues.push(issue("BRICK_INTENT_MISSING", "brick", "BridgeSpec requires explicit brick compiler settings."));
    return;
  }
  for (const key of Object.keys(brick)) if (!expected.has(key)) issues.push(issue("INVALID_PARAMETER_RANGE", `brick.${key}`, `Unknown brick parameter: ${key}.`));
  for (const key of expected) if (!(key in brick)) issues.push(issue("BRICK_INTENT_MISSING", `brick.${key}`, `brick.${key} is required.`));
  if (!Array.isArray(brick.allowed) || !brick.allowed.length || brick.allowed.some((part) => !PARTS.has(part))) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.allowed", "brick.allowed must contain only supported catalogue part identifiers."));
  if (!Number.isInteger(brick.maxBeamStuds) || brick.maxBeamStuds < 4 || brick.maxBeamStuds > 80) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.maxBeamStuds", "Maximum beam length must be 4–80 studs."));
  if (!Number.isInteger(brick.sideThicknessStuds) || brick.sideThicknessStuds < 1 || brick.sideThicknessStuds > 8) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.sideThicknessStuds", "Side thickness must be 1–8 studs."));
  if (!Number.isInteger(brick.deckThicknessLayers) || brick.deckThicknessLayers < 1 || brick.deckThicknessLayers > 8) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.deckThicknessLayers", "Deck thickness must be 1–8 layers."));
  if (!BOND_PATTERNS.has(brick.bondPattern)) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.bondPattern", "Bond pattern must be running or stack."));
  if (![0.5, 1, 2].includes(brick.studSize)) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.studSize", "Stud size must be 0.5, 1 or 2 design units."));
  if (![0.5, 1, 2].includes(brick.layerHeight)) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.layerHeight", "Layer height must be 0.5, 1 or 2 design units."));
}

export function validateBridgeSpec(challenge, spec) {
  const issues = [];
  const challengeValidation = validateChallengeState(challenge);
  if (!challengeValidation.valid) return challengeValidation;
  const profile = familyProfile(spec?.family);
  const expectedKeys = new Set([...COMMON_KEYS, ...(profile?.parameters ?? [])]);
  for (const key of Object.keys(spec || {})) if (!expectedKeys.has(key)) issues.push(issue("INVALID_PARAMETER_RANGE", key, `Parameter ${key} is not valid for ${spec?.family ?? "this family"}.`));
  if (spec?.version !== 3) issues.push(issue("INVALID_PARAMETER_RANGE", "version", "BridgeSpec.version must be 3."));
  if (!FAMILY_IDS.includes(spec?.family)) issues.push(issue("INVALID_PARAMETER_RANGE", "family", "Bridge family is not supported."));
  for (const key of profile?.parameters ?? []) if (!(key in (spec ?? {}))) issues.push(issue("INVALID_PARAMETER_RANGE", key, `${key} is required for ${spec.family}.`));

  const actualSpan = challenge.exit.position.x - challenge.entry.position.x;
  if (!Number.isFinite(spec?.span) || spec.span <= 0 || Math.abs(spec.span - actualSpan) > 0.001) issues.push(issue("SPAN_INVALID", "span", `Span must match the ${actualSpan} unit ENTRY-to-EXIT crossing.`));
  const elevation = challenge.corridor.deckElevationRange;
  if (!Number.isFinite(spec?.deckHeight) || spec.deckHeight < elevation[0] || spec.deckHeight > elevation[1]) issues.push(issue("DECK_OUTSIDE_CORRIDOR", "deckHeight", `Deck height must be between ${elevation[0]} and ${elevation[1]}.`));
  if (!Number.isFinite(spec?.bridgeWidth) || spec.bridgeWidth < challenge.corridor.vehicleClearWidth + 2) issues.push(issue("VEHICLE_CLEARANCE", "bridgeWidth", "Bridge width does not leave two structural side zones around the vehicle corridor."));
  if (!Number.isFinite(spec?.vehicleClearance) || spec.vehicleClearance < challenge.corridor.vehicleClearHeight) issues.push(issue("VEHICLE_CLEARANCE", "vehicleClearance", `Vehicle clearance must be at least ${challenge.corridor.vehicleClearHeight}.`));
  if (typeof spec?.symmetry !== "boolean") issues.push(issue("INVALID_PARAMETER_RANGE", "symmetry", "Symmetry must be a boolean."));
  if (!Number.isInteger(spec?.seed)) issues.push(issue("INVALID_PARAMETER_RANGE", "seed", "Seed must be an integer."));
  for (const [path, [min, max, whole]] of Object.entries(RANGE_RULES)) {
    if (!(path in (spec ?? {}))) continue;
    const value = spec[path];
    if (!Number.isFinite(value) || value < min || value > max || (whole && !Number.isInteger(value))) issues.push(issue("INVALID_PARAMETER_RANGE", path, `${path} must be between ${min} and ${max}${whole ? " as a whole number" : ""}.`));
  }
  if ("archShape" in (spec ?? {}) && !ARCH_SHAPES.has(spec.archShape)) issues.push(issue("INVALID_PARAMETER_RANGE", "archShape", "Arch shape must be segmental or elliptical."));
  if ("crossBracing" in (spec ?? {}) && typeof spec.crossBracing !== "boolean") issues.push(issue("INVALID_PARAMETER_RANGE", "crossBracing", "Cross-bracing must be a boolean."));
  validateBrickSettings(spec, issues);

  const stud = spec?.brick?.studSize ?? 1;
  const layer = spec?.brick?.layerHeight ?? 1;
  if (!aligned(spec?.span, stud) || !aligned(spec?.deckHeight, layer)) issues.push(issue("BRICK_GRID_MISMATCH", "span/deckHeight", "Span and deck height must align to the selected brick grid."));
  if (Number.isInteger(spec?.panelCount) && spec.panelCount > Math.round(spec.span / stud)) issues.push(issue("BRICK_GRID_MISMATCH", "panelCount", "Panel count is too high to produce unique stud-grid stations."));
  if (["pratt", "howe", "warren", "tiedArch"].includes(spec?.family) && spec?.trussHeight < spec?.vehicleClearance) issues.push(issue("VEHICLE_CLEARANCE", "trussHeight", "The through-structure height must clear the vehicle envelope."));
  if (spec?.family === "suspension" && spec?.towerHeight <= spec?.cableSag) issues.push(issue("INVALID_PARAMETER_RANGE", "cableSag", "Cable sag must remain below tower height."));
  if (profile?.constructionSystem === "technic" && !spec?.brick?.allowed?.includes("technic-beam")) issues.push(issue("CONSTRUCTION_SYSTEM_MISMATCH", "brick.allowed", "This family requires Technic beams."));
  if (profile?.constructionSystem === "hybrid" && !spec?.brick?.allowed?.some((part) => ["technic-beam", "cable", "hinge"].includes(part))) issues.push(issue("CONSTRUCTION_SYSTEM_MISMATCH", "brick.allowed", "This family requires hybrid elements."));
  return report(issues);
}

function supportedNodeIds(graph) {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, new Set()]));
  for (const member of graph.members) {
    adjacency.get(member.nodeA)?.add(member.nodeB);
    adjacency.get(member.nodeB)?.add(member.nodeA);
  }
  const visited = new Set(graph.nodes.filter((node) => node.supportType !== "none").map((node) => node.id));
  const queue = [...visited];
  while (queue.length) {
    const id = queue.shift();
    for (const neighbour of adjacency.get(id) ?? []) if (!visited.has(neighbour)) {
      visited.add(neighbour);
      queue.push(neighbour);
    }
  }
  return visited;
}

export function validateGraph(graph) {
  const issues = [];
  if (!graph) return report([issue("UNSUPPORTED_MEMBER", "graph", "No graph was generated.")]);
  const nodeIds = new Set();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) issues.push(issue("UNSUPPORTED_MEMBER", `nodes.${node.id}`, "Node IDs must be unique."));
    nodeIds.add(node.id);
  }
  const memberIds = new Set();
  for (const member of graph.members) {
    if (memberIds.has(member.id)) issues.push(issue("UNSUPPORTED_MEMBER", `members.${member.id}`, "Member IDs must be unique."));
    memberIds.add(member.id);
    if (!nodeIds.has(member.nodeA) || !nodeIds.has(member.nodeB) || member.nodeA === member.nodeB) issues.push(issue("UNSUPPORTED_MEMBER", `members.${member.id}`, "Member endpoints must reference two different graph nodes."));
  }
  const supported = supportedNodeIds(graph);
  for (const member of graph.members) if (!supported.has(member.nodeA) || !supported.has(member.nodeB)) issues.push(issue("UNSUPPORTED_MEMBER", `members.${member.id}`, "Member has no connected path to a fixed or terrain support."));

  const anchors = new Set(graph.nodes.filter((node) => ["anchor", "tower", "deck", "joint"].includes(node.role)).map((node) => node.id));
  for (const cable of graph.cables) if (!anchors.has(cable.anchorNodeA) || !anchors.has(cable.anchorNodeB)) issues.push(issue("INVALID_CABLE_ANCHOR", `cables.${cable.id}`, "Cable endpoints must reference valid anchor, tower, joint, or deck nodes."));

  const construction = graph.metadata?.construction;
  if (!construction?.grid || !Array.isArray(construction.allowedParts)) issues.push(issue("BRICK_INTENT_MISSING", "metadata.construction", "Graph metadata must include brick compiler intent."));
  const stud = construction?.grid?.stud ?? 1;
  const layer = construction?.grid?.layer ?? 1;
  for (const node of graph.nodes) if (!aligned(node.x, stud) || !aligned(node.y, layer)) issues.push(issue("BRICK_GRID_MISMATCH", `nodes.${node.id}`, "Node is not aligned to the declared stud/layer grid."));
  for (const member of graph.members) if (!member.buildClass || !member.rasterMode || !Number.isInteger(member.sectionStuds)) issues.push(issue("BRICK_INTENT_MISSING", `members.${member.id}`, "Every member requires buildClass, rasterMode and sectionStuds."));
  const zones = graph.metadata?.brickZones ?? [];
  if (construction?.compatibility === "brick-native" && !zones.length) issues.push(issue("BRICK_INTENT_MISSING", "metadata.brickZones", "Brick-native families require at least one rasterisable masonry zone."));
  for (const zone of zones) {
    if (!Array.isArray(zone.outer) || zone.outer.length < 3) issues.push(issue("BRICK_INTENT_MISSING", `metadata.brickZones.${zone.id}`, "Brick zones require a closed outer polygon."));
    for (const point of [...(zone.outer ?? []), ...(zone.holes ?? []).flat()]) if (!aligned(point.x, stud) || !aligned(point.y, layer)) issues.push(issue("BRICK_GRID_MISMATCH", `metadata.brickZones.${zone.id}`, "Brick zone points must align to the declared grid."));
  }
  if (construction?.compatibility === "brick-native" && graph.members.some((member) => member.buildClass === "technic-frame")) issues.push(issue("CONSTRUCTION_SYSTEM_MISMATCH", "members", "Brick-native families cannot contain Technic frame members."));
  if (construction?.compatibility === "hybrid") issues.push(issue("HYBRID_PARTS_REQUIRED", "metadata.construction", "This valid graph requires Technic, cable, chain, or hinge elements in addition to standard bricks.", "warning"));
  return report(issues);
}

export function report(issues) {
  return {
    valid: !issues.some((entry) => entry.severity === "error"),
    errors: issues.filter((entry) => entry.severity === "error"),
    warnings: issues.filter((entry) => entry.severity === "warning"),
  };
}
