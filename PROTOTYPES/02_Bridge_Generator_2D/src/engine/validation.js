import { FAMILY_IDS, familyProfile } from "./catalogue.js";

export const ERROR_CODES = Object.freeze([
  "SPAN_INVALID", "DECK_OUTSIDE_CORRIDOR", "VEHICLE_CLEARANCE", "PIER_NO_FOUNDATION",
  "FOUNDATION_NOT_FOUND", "UNSUPPORTED_MEMBER", "INVALID_PARAMETER_RANGE", "INVALID_CABLE_ANCHOR",
  "BRICK_GRID_MISMATCH", "BRICK_INTENT_MISSING", "CONSTRUCTION_SYSTEM_MISMATCH",
  "DEGENERATE_GEOMETRY", "INVALID_BRICK_ZONE", "HYBRID_PARTS_REQUIRED",
]);

const EPSILON = 1e-6;
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
  return Number.isFinite(value) && Number.isFinite(step) && step > 0
    && Math.abs(value / step - Math.round(value / step)) < EPSILON;
}

export function snapToGrid(value, step = 1) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return Number.NaN;
  return Math.round(Math.round(value / step) * step * 1e6) / 1e6;
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Math.round(value * 1e6) / 1e6))];
}

export function plannedPierXs(challenge, spec) {
  const count = spec?.pierCount ?? 0;
  if (!count || !Number.isFinite(spec?.span) || !Number.isFinite(spec?.pierSpacing)) return [];
  const stud = spec?.brick?.studSize ?? 1;
  const center = challenge.entry.position.x + spec.span / 2;
  return Array.from({ length: count }, (_, index) => snapToGrid(
    center + (index - (count - 1) / 2) * spec.pierSpacing,
    stud,
  ));
}

export function plannedViaductBoundaries(challenge, spec) {
  if (!Number.isInteger(spec?.archCount) || spec.archCount < 1 || !Number.isFinite(spec?.span)) return [];
  const stud = spec?.brick?.studSize ?? 1;
  const startX = challenge.entry.position.x;
  return Array.from({ length: spec.archCount + 1 }, (_, index) => snapToGrid(
    startX + (spec.span * index) / spec.archCount,
    stud,
  ));
}

export function plannedBoxWallXs(challenge, spec) {
  const stud = spec?.brick?.studSize ?? 1;
  const startX = challenge.entry.position.x;
  const wall = Math.max(4, snapToGrid(spec.span * 0.12, stud));
  return [snapToGrid(startX + wall, stud), snapToGrid(startX + spec.span - wall, stud)];
}

export function plannedSuspensionLayout(challenge, spec) {
  const stud = spec?.brick?.studSize ?? 1;
  const startX = challenge.entry.position.x;
  const endX = startX + spec.span;
  return {
    towers: [snapToGrid(startX + spec.span * 0.2, stud), snapToGrid(startX + spec.span * 0.8, stud)],
    anchors: [snapToGrid(startX - spec.span * 0.08, stud), snapToGrid(endX + spec.span * 0.08, stud)],
  };
}

export function plannedBasculeLayout(challenge, spec) {
  const stud = spec?.brick?.studSize ?? 1;
  const startX = challenge.entry.position.x;
  return {
    hinges: [snapToGrid(startX + spec.span * 0.28, stud), snapToGrid(startX + spec.span * 0.72, stud)],
    center: snapToGrid(startX + spec.span / 2, stud),
  };
}

export function plannedHangerXs(startX, endX, spacing, stud = 1) {
  if (![startX, endX, spacing, stud].every(Number.isFinite) || spacing <= 0 || stud <= 0) return [];
  const output = [];
  for (let x = startX + spacing; x < endX - EPSILON; x += spacing) output.push(snapToGrid(x, stud));
  return uniqueNumbers(output).filter((x) => x > startX + EPSILON && x < endX - EPSILON);
}

export function terrainHeightAt(challenge, x) {
  const points = challenge?.terrain?.profile;
  if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(x)) return null;
  if (x <= points[0].x) return points[0].y;
  if (x >= points.at(-1).x) return points.at(-1).y;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (x >= a.x && x <= b.x) {
      const width = b.x - a.x;
      if (Math.abs(width) < EPSILON) return Math.min(a.y, b.y);
      const t = (x - a.x) / width;
      return a.y + (b.y - a.y) * t;
    }
  }
  return null;
}

export function foundationAt(challenge, x, kind = "pier") {
  if (!Number.isFinite(x) || !Array.isArray(challenge?.supportRegions)) return null;
  const region = challenge.supportRegions.find((candidate) => Number.isFinite(candidate?.xMin)
    && Number.isFinite(candidate?.xMax)
    && x >= candidate.xMin - EPSILON
    && x <= candidate.xMax + EPSILON
    && Array.isArray(candidate.allowed)
    && candidate.allowed.includes(kind));
  if (!region) return null;
  const value = region.id.includes("bed") || region.id.includes("floor")
    ? terrainHeightAt(challenge, x)
    : region.foundationY;
  return Number.isFinite(value) ? value : null;
}

export function resolveFoundation(challenge, x, kinds) {
  for (const kind of kinds) {
    const y = foundationAt(challenge, x, kind);
    if (y != null) return { y, kind };
  }
  return null;
}

function challengeNumber(value, path, issues, { min = -Infinity, exclusive = false } = {}) {
  if (!Number.isFinite(value) || (exclusive ? value <= min : value < min)) {
    issues.push(issue("INVALID_PARAMETER_RANGE", path, `${path} must be a finite${Number.isFinite(min) ? ` value ${exclusive ? "greater than" : "at least"} ${min}` : " number"}.`));
  }
}

export function validateChallengeState(challenge) {
  const issues = [];
  if (!challenge || challenge.version !== 3) issues.push(issue("INVALID_PARAMETER_RANGE", "version", "ChallengeState.version must be 3."));
  if (!challenge?.entry?.position || !challenge?.exit?.position) issues.push(issue("SPAN_INVALID", "entry/exit", "ENTRY and EXIT positions are required."));
  if (!Array.isArray(challenge?.terrain?.profile) || challenge.terrain.profile.length < 2) {
    issues.push(issue("INVALID_PARAMETER_RANGE", "terrain.profile", "Terrain profile needs at least two points."));
  } else {
    for (let index = 0; index < challenge.terrain.profile.length; index += 1) {
      const point = challenge.terrain.profile[index];
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) issues.push(issue("INVALID_PARAMETER_RANGE", `terrain.profile.${index}`, "Terrain points require finite x and y values."));
      if (index > 0 && point.x < challenge.terrain.profile[index - 1].x) issues.push(issue("INVALID_PARAMETER_RANGE", "terrain.profile", "Terrain profile x values must be ordered."));
    }
  }
  if (!Array.isArray(challenge?.supportRegions)) issues.push(issue("INVALID_PARAMETER_RANGE", "supportRegions", "Support regions must be an array."));
  if (!challenge?.corridor || !Array.isArray(challenge.corridor.deckElevationRange) || challenge.corridor.deckElevationRange.length !== 2) issues.push(issue("DECK_OUTSIDE_CORRIDOR", "corridor", "The transport corridor needs a two-value elevation range."));
  if (challenge?.terrain) {
    challengeNumber(challenge.terrain.width, "terrain.width", issues, { min: 0, exclusive: true });
    challengeNumber(challenge.terrain.depth, "terrain.depth", issues, { min: 0, exclusive: true });
    challengeNumber(challenge.terrain.gridX, "terrain.gridX", issues, { min: 1 });
    challengeNumber(challenge.terrain.gridZ, "terrain.gridZ", issues, { min: 1 });
  }
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
  if (!Array.isArray(brick.allowed) || !brick.allowed.length || new Set(brick.allowed).size !== brick.allowed.length || brick.allowed.some((part) => !PARTS.has(part))) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.allowed", "brick.allowed must contain unique supported catalogue part identifiers."));
  if (!Number.isInteger(brick.maxBeamStuds) || brick.maxBeamStuds < 4 || brick.maxBeamStuds > 80) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.maxBeamStuds", "Maximum beam length must be 4–80 studs."));
  if (!Number.isInteger(brick.sideThicknessStuds) || brick.sideThicknessStuds < 1 || brick.sideThicknessStuds > 8) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.sideThicknessStuds", "Side thickness must be 1–8 studs."));
  if (!Number.isInteger(brick.deckThicknessLayers) || brick.deckThicknessLayers < 1 || brick.deckThicknessLayers > 8) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.deckThicknessLayers", "Deck thickness must be 1–8 layers."));
  if (!BOND_PATTERNS.has(brick.bondPattern)) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.bondPattern", "Bond pattern must be running or stack."));
  if (![0.5, 1, 2].includes(brick.studSize)) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.studSize", "Stud size must be 0.5, 1 or 2 design units."));
  if (![0.5, 1, 2].includes(brick.layerHeight)) issues.push(issue("INVALID_PARAMETER_RANGE", "brick.layerHeight", "Layer height must be 0.5, 1 or 2 design units."));
}

function foundationRequirements(challenge, spec) {
  const startX = challenge.entry.position.x;
  const endX = startX + spec.span;
  const requirements = [
    { x: startX, kinds: ["fixed"], code: "FOUNDATION_NOT_FOUND", path: "entry", label: "ENTRY support" },
    { x: endX, kinds: ["fixed"], code: "FOUNDATION_NOT_FOUND", path: "exit", label: "EXIT support" },
  ];
  if (["pier", "trestle"].includes(spec.family)) {
    for (const x of plannedPierXs(challenge, spec)) requirements.push({ x, kinds: ["pier", "fixed"], code: "PIER_NO_FOUNDATION", path: "pierCount", label: "pier" });
  }
  if (spec.family === "viaduct") {
    for (const x of plannedViaductBoundaries(challenge, spec).slice(1, -1)) requirements.push({ x, kinds: ["pier", "arch"], code: "PIER_NO_FOUNDATION", path: "archCount", label: "viaduct pier" });
  }
  if (spec.family === "boxCulvert") {
    for (const x of plannedBoxWallXs(challenge, spec)) requirements.push({ x, kinds: ["pier", "arch", "fixed"], code: "FOUNDATION_NOT_FOUND", path: "panelCount", label: "culvert wall" });
  }
  if (spec.family === "suspension") {
    const layout = plannedSuspensionLayout(challenge, spec);
    for (const x of layout.towers) requirements.push({ x, kinds: ["tower", "pier"], code: "FOUNDATION_NOT_FOUND", path: "towerHeight", label: "suspension tower" });
    for (const x of layout.anchors) requirements.push({ x, kinds: ["anchor"], code: "INVALID_CABLE_ANCHOR", path: "cableSag", label: "main cable anchor" });
  }
  if (spec.family === "bascule") {
    for (const x of plannedBasculeLayout(challenge, spec).hinges) requirements.push({ x, kinds: ["tower", "pier"], code: "FOUNDATION_NOT_FOUND", path: "towerHeight", label: "bascule tower" });
  }
  return requirements;
}

function validateFamilyGeometry(challenge, spec, issues) {
  const stud = spec.brick.studSize;
  const startX = challenge.entry.position.x;
  const endX = startX + spec.span;
  if (["pier", "trestle"].includes(spec.family)) {
    if (spec.pierCount < 1) issues.push(issue("INVALID_PARAMETER_RANGE", "pierCount", `${spec.family} requires at least one intermediate support.`));
    const raw = Array.from({ length: spec.pierCount }, (_, index) => startX + spec.span / 2 + (index - (spec.pierCount - 1) / 2) * spec.pierSpacing);
    const snapped = plannedPierXs(challenge, spec);
    if (raw.some((x) => !aligned(x, stud)) || uniqueNumbers(snapped).length !== spec.pierCount || snapped.some((x) => x <= startX || x >= endX)) {
      issues.push(issue("BRICK_GRID_MISMATCH", "pierSpacing", "Pier count and spacing must produce unique stud-grid positions strictly inside the span."));
    }
  }
  if (Number.isInteger(spec.panelCount)) {
    const stations = Array.from({ length: spec.panelCount + 1 }, (_, index) => snapToGrid(startX + (spec.span * index) / spec.panelCount, stud));
    if (uniqueNumbers(stations).length !== spec.panelCount + 1) issues.push(issue("BRICK_GRID_MISMATCH", "panelCount", "Panel count collapses two or more deck stations on the selected stud grid."));
  }
  if (spec.family === "viaduct") {
    const boundaries = plannedViaductBoundaries(challenge, spec);
    if (uniqueNumbers(boundaries).length !== spec.archCount + 1) issues.push(issue("BRICK_GRID_MISMATCH", "archCount", "Arch count collapses adjacent viaduct boundaries on the selected stud grid."));
    const bayWidths = boundaries.slice(1).map((x, index) => x - boundaries[index]);
    if (bayWidths.some((width) => width <= 0)) issues.push(issue("DEGENERATE_GEOMETRY", "archCount", "Every viaduct bay must have positive width."));
    if (bayWidths.length && spec.archRise >= Math.min(...bayWidths) / 2) issues.push(issue("INVALID_PARAMETER_RANGE", "archRise", "Viaduct arch rise must remain below half of the narrowest resolved bay."));
  }
  if (spec.family === "boxCulvert") {
    const [left, right] = plannedBoxWallXs(challenge, spec);
    if (!(left < right)) issues.push(issue("DEGENERATE_GEOMETRY", "span", "Box culvert walls must resolve to two different stud-grid positions."));
  }
  if (spec.family === "bascule" && spec.panelCount < 4) issues.push(issue("INVALID_PARAMETER_RANGE", "panelCount", "Bascule requires at least four panels to resolve approaches and two leaves."));
}

function validateRequiredParts(spec, issues) {
  const allowed = new Set(spec?.brick?.allowed ?? []);
  const required = [];
  if (["trestle", "warren", "pratt", "howe", "tiedArch"].includes(spec.family)) required.push("technic-beam", "technic-connector");
  if (spec.family === "suspension") required.push("cable");
  if (spec.family === "bascule") required.push("technic-beam", "hinge");
  const missing = required.filter((part) => !allowed.has(part));
  if (missing.length) issues.push(issue("CONSTRUCTION_SYSTEM_MISMATCH", "brick.allowed", `${spec.family} requires: ${missing.join(", ")}.`));
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
  if (!Number.isFinite(spec?.span) || spec.span <= 0 || spec.span > 180 || Math.abs(spec.span - actualSpan) > 0.001) issues.push(issue("SPAN_INVALID", "span", `Span must match the ${actualSpan} unit ENTRY-to-EXIT crossing and remain at most 180 units.`));
  const elevation = challenge.corridor.deckElevationRange;
  if (!Number.isFinite(spec?.deckHeight) || spec.deckHeight < elevation[0] || spec.deckHeight > elevation[1]) issues.push(issue("DECK_OUTSIDE_CORRIDOR", "deckHeight", `Deck height must be between ${elevation[0]} and ${elevation[1]}.`));
  if (!Number.isFinite(spec?.bridgeWidth) || spec.bridgeWidth < challenge.corridor.vehicleClearWidth + 2 || spec.bridgeWidth > 30) issues.push(issue("VEHICLE_CLEARANCE", "bridgeWidth", "Bridge width must leave two structural side zones around the vehicle corridor and remain at most 30 units."));
  if (!Number.isFinite(spec?.vehicleClearance) || spec.vehicleClearance < challenge.corridor.vehicleClearHeight || spec.vehicleClearance > 20) issues.push(issue("VEHICLE_CLEARANCE", "vehicleClearance", `Vehicle clearance must be at least ${challenge.corridor.vehicleClearHeight} and at most 20.`));
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
  if (!aligned(spec?.span, stud) || !aligned(spec?.deckHeight, layer) || !aligned(spec?.bridgeWidth, stud)) issues.push(issue("BRICK_GRID_MISMATCH", "span/deckHeight/bridgeWidth", "Span, deck height and bridge width must align to the selected brick grid."));
  for (const path of ["trussHeight", "archRise", "towerHeight", "cableSag"]) if (path in (spec ?? {}) && !aligned(spec[path], layer)) issues.push(issue("BRICK_GRID_MISMATCH", path, `${path} must align to the selected layer grid.`));
  for (const path of ["pierSpacing", "hangerSpacing"]) if (path in (spec ?? {}) && !aligned(spec[path], stud)) issues.push(issue("BRICK_GRID_MISMATCH", path, `${path} must align to the selected stud grid.`));
  if (["pratt", "howe", "warren", "tiedArch"].includes(spec?.family) && spec?.trussHeight < spec?.vehicleClearance) issues.push(issue("VEHICLE_CLEARANCE", "trussHeight", "The through-structure height must clear the vehicle envelope."));
  if (spec?.family === "suspension" && spec?.towerHeight <= spec?.cableSag) issues.push(issue("INVALID_PARAMETER_RANGE", "cableSag", "Cable sag must remain below tower height."));
  validateRequiredParts(spec ?? {}, issues);

  if (!issues.some((entry) => entry.severity === "error")) {
    validateFamilyGeometry(challenge, spec, issues);
    for (const requirement of foundationRequirements(challenge, spec)) {
      if (!resolveFoundation(challenge, requirement.x, requirement.kinds)) issues.push(issue(
        requirement.code,
        requirement.path,
        `No legal ${requirement.label} foundation is available at x=${requirement.x}.`,
      ));
    }
  }
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
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    for (const neighbour of adjacency.get(id) ?? []) if (!visited.has(neighbour)) {
      visited.add(neighbour);
      queue.push(neighbour);
    }
  }
  return visited;
}

function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) / 2;
}

function orientation(a, b, c) {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(value) < EPSILON ? 0 : Math.sign(value);
}

function pointOnSegment(point, a, b) {
  return orientation(a, b, point) === 0
    && point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON
    && point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && pointOnSegment(c, a, b)) || (o2 === 0 && pointOnSegment(d, a, b))
    || (o3 === 0 && pointOnSegment(a, c, d)) || (o4 === 0 && pointOnSegment(b, c, d));
}

function selfIntersects(points) {
  for (let first = 0; first < points.length; first += 1) {
    const a = points[first];
    const b = points[(first + 1) % points.length];
    for (let second = first + 1; second < points.length; second += 1) {
      if (second === first || second === first + 1 || (first === 0 && second === points.length - 1)) continue;
      const c = points[second];
      const d = points[(second + 1) % points.length];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function pointInsideOrOnPolygon(point, polygon) {
  for (let index = 0; index < polygon.length; index += 1) if (pointOnSegment(point, polygon[index], polygon[(index + 1) % polygon.length])) return true;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function finitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function validatePolygon(points, path, issues) {
  if (!Array.isArray(points) || points.length < 3) {
    issues.push(issue("INVALID_BRICK_ZONE", path, "Polygon needs at least three points."));
    return false;
  }
  if (points.some((point) => !finitePoint(point))) issues.push(issue("INVALID_BRICK_ZONE", path, "Polygon points must be finite."));
  if (new Set(points.map((point) => `${point.x},${point.y}`)).size < 3 || polygonArea(points) < EPSILON) issues.push(issue("DEGENERATE_GEOMETRY", path, "Polygon must have positive area and at least three distinct points."));
  if (selfIntersects(points)) issues.push(issue("INVALID_BRICK_ZONE", path, "Polygon must not self-intersect."));
  return true;
}

export function validateGraph(graph) {
  const issues = [];
  if (!graph) return report([issue("UNSUPPORTED_MEMBER", "graph", "No graph was generated.")]);
  const nodeIds = new Set();
  const nodesById = new Map();
  const nodesByPoint = new Map();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) issues.push(issue("UNSUPPORTED_MEMBER", `nodes.${node.id}`, "Node IDs must be unique."));
    nodeIds.add(node.id);
    nodesById.set(node.id, node);
    if (!finitePoint(node)) issues.push(issue("DEGENERATE_GEOMETRY", `nodes.${node.id}`, "Node coordinates must be finite."));
    const key = `${node.x},${node.y}`;
    if (!nodesByPoint.has(key)) nodesByPoint.set(key, []);
    nodesByPoint.get(key).push(node);
  }
  for (const [key, nodes] of nodesByPoint) if (nodes.length > 1) {
    const group = nodes[0].coincidentGroup;
    if (!group || nodes.some((node) => node.coincidentGroup !== group)) issues.push(issue("DEGENERATE_GEOMETRY", `nodes@${key}`, "Coincident structural nodes require one explicit coincidentGroup."));
  }

  const memberIds = new Set();
  const memberGeometry = new Set();
  for (const member of graph.members) {
    if (memberIds.has(member.id)) issues.push(issue("UNSUPPORTED_MEMBER", `members.${member.id}`, "Member IDs must be unique."));
    memberIds.add(member.id);
    const a = nodesById.get(member.nodeA);
    const b = nodesById.get(member.nodeB);
    if (!a || !b || member.nodeA === member.nodeB) issues.push(issue("UNSUPPORTED_MEMBER", `members.${member.id}`, "Member endpoints must reference two different graph nodes."));
    else if (Math.hypot(a.x - b.x, a.y - b.y) < EPSILON) issues.push(issue("DEGENERATE_GEOMETRY", `members.${member.id}`, "Structural members must have non-zero resolved length."));
    else {
      const endpoints = [`${a.x},${a.y}`, `${b.x},${b.y}`].sort();
      const geometryKey = endpoints.join("|");
      if (memberGeometry.has(geometryKey)) issues.push(issue("DEGENERATE_GEOMETRY", `members.${member.id}`, "Two members cannot duplicate the same resolved structural path."));
      memberGeometry.add(geometryKey);
    }
  }
  const supported = supportedNodeIds(graph);
  for (const member of graph.members) if (!supported.has(member.nodeA) || !supported.has(member.nodeB)) issues.push(issue("UNSUPPORTED_MEMBER", `members.${member.id}`, "Member has no connected path to a fixed or terrain support."));

  const anchors = new Set(graph.nodes.filter((node) => ["anchor", "tower", "deck", "joint"].includes(node.role)).map((node) => node.id));
  const cableIds = new Set();
  for (const cable of graph.cables) {
    if (cableIds.has(cable.id)) issues.push(issue("INVALID_CABLE_ANCHOR", `cables.${cable.id}`, "Cable IDs must be unique."));
    cableIds.add(cable.id);
    if (!anchors.has(cable.anchorNodeA) || !anchors.has(cable.anchorNodeB) || cable.anchorNodeA === cable.anchorNodeB) issues.push(issue("INVALID_CABLE_ANCHOR", `cables.${cable.id}`, "Cable endpoints must reference two different valid anchor, tower, joint, or deck nodes."));
    if (!Array.isArray(cable.samples) || cable.samples.length < 2 || cable.samples.some((point) => !finitePoint(point))) issues.push(issue("DEGENERATE_GEOMETRY", `cables.${cable.id}.samples`, "Cable samples require at least two finite points."));
  }

  const construction = graph.metadata?.construction;
  if (!construction?.grid || !Array.isArray(construction.allowedParts)) issues.push(issue("BRICK_INTENT_MISSING", "metadata.construction", "Graph metadata must include brick compiler intent."));
  const stud = construction?.grid?.stud ?? 1;
  const layer = construction?.grid?.layer ?? 1;
  for (const node of graph.nodes) if (!aligned(node.x, stud) || !aligned(node.y, layer)) issues.push(issue("BRICK_GRID_MISMATCH", `nodes.${node.id}`, "Node is not aligned to the declared stud/layer grid."));
  for (const member of graph.members) if (!member.buildClass || !member.rasterMode || !member.connectionIntent || !Number.isInteger(member.sectionStuds)) issues.push(issue("BRICK_INTENT_MISSING", `members.${member.id}`, "Every member requires buildClass, rasterMode, connectionIntent and sectionStuds."));
  for (const cable of graph.cables) if (!cable.connectionIntent) issues.push(issue("BRICK_INTENT_MISSING", `cables.${cable.id}`, "Every cable requires explicit connectionIntent."));

  const zones = graph.metadata?.brickZones ?? [];
  if (construction?.compatibility === "brick-native" && !zones.length) issues.push(issue("BRICK_INTENT_MISSING", "metadata.brickZones", "Brick-native families require at least one rasterisable masonry zone."));
  const zoneIds = new Set();
  for (const zone of zones) {
    if (zoneIds.has(zone.id)) issues.push(issue("INVALID_BRICK_ZONE", `metadata.brickZones.${zone.id}`, "Brick zone IDs must be unique."));
    zoneIds.add(zone.id);
    const outerValid = validatePolygon(zone.outer, `metadata.brickZones.${zone.id}.outer`, issues);
    for (const point of [...(zone.outer ?? []), ...(zone.holes ?? []).flat()]) if (!aligned(point.x, stud) || !aligned(point.y, layer)) issues.push(issue("BRICK_GRID_MISMATCH", `metadata.brickZones.${zone.id}`, "Brick zone points must align to the declared grid."));
    for (let index = 0; index < (zone.holes ?? []).length; index += 1) {
      const hole = zone.holes[index];
      validatePolygon(hole, `metadata.brickZones.${zone.id}.holes.${index}`, issues);
      if (outerValid && hole.some((point) => !pointInsideOrOnPolygon(point, zone.outer))) issues.push(issue("INVALID_BRICK_ZONE", `metadata.brickZones.${zone.id}.holes.${index}`, "Every opening point must remain inside or on the masonry body's lower boundary."));
    }
  }
  if (construction?.compatibility === "brick-native" && graph.members.some((member) => member.buildClass === "technic-frame")) issues.push(issue("CONSTRUCTION_SYSTEM_MISMATCH", "members", "Brick-native families cannot contain Technic frame members."));

  if (graph.metadata?.family === "bascule") {
    const hinges = graph.nodes.filter((node) => node.articulation === "hinge");
    const tips = graph.nodes.filter((node) => node.articulation === "leaf-tip");
    if (hinges.length !== 2 || tips.length !== 2 || tips[0]?.id === tips[1]?.id) issues.push(issue("DEGENERATE_GEOMETRY", "bascule.articulation", "Bascule requires two hinges and two separate coincident leaf-tip nodes."));
    if (hinges.length === 2) {
      const minHinge = Math.min(...hinges.map((node) => node.x));
      const maxHinge = Math.max(...hinges.map((node) => node.x));
      for (const zone of zones) {
        const minX = Math.min(...zone.outer.map((point) => point.x));
        const maxX = Math.max(...zone.outer.map((point) => point.x));
        if (minX < minHinge - EPSILON && maxX > maxHinge + EPSILON) issues.push(issue("INVALID_BRICK_ZONE", `metadata.brickZones.${zone.id}`, "Bonded masonry zones cannot bridge across the bascule's full movable opening."));
      }
    }
  }

  if (construction?.compatibility === "hybrid") issues.push(issue("HYBRID_PARTS_REQUIRED", "metadata.construction", "This valid graph requires Technic, cable, chain, or hinge elements in addition to standard bricks.", "warning"));
  return report(issues);
}

export function report(issues) {
  const unique = [];
  const keys = new Set();
  for (const entry of issues) {
    const key = `${entry.code}|${entry.path}|${entry.message}|${entry.severity}`;
    if (!keys.has(key)) {
      keys.add(key);
      unique.push(entry);
    }
  }
  return {
    valid: !unique.some((entry) => entry.severity === "error"),
    errors: unique.filter((entry) => entry.severity === "error"),
    warnings: unique.filter((entry) => entry.severity === "warning"),
  };
}
