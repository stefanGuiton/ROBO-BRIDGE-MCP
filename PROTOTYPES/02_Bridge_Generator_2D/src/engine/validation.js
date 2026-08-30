export const ERROR_CODES = Object.freeze([
  "SPAN_INVALID",
  "DECK_OUTSIDE_CORRIDOR",
  "VEHICLE_CLEARANCE",
  "PIER_NO_FOUNDATION",
  "UNSUPPORTED_MEMBER",
  "INVALID_PARAMETER_RANGE",
  "INVALID_CABLE_ANCHOR",
]);

const FAMILIES = new Set(["beam", "trestle", "warren", "pratt", "howe", "arch", "aqueduct", "box", "suspension"]);
const ARCH_SHAPES = new Set(["circular", "parabolic"]);

function issue(code, path, message, severity = "error") {
  return { code, path, message, severity };
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
  const region = challenge.supportRegions.find((candidate) => x >= candidate.xMin - 1e-6 && x <= candidate.xMax + 1e-6 && candidate.allowed.includes(kind));
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

export function validateBridgeSpec(challenge, spec) {
  const issues = [];
  const expectedKeys = new Set([
    "version", "family", "seed", "span", "deckHeight", "bridgeWidth", "vehicleClearance", "panelCount", "trussHeight",
    "pierCount", "pierSpacing", "archCount", "archShape", "archRise", "towerHeight", "cableSag", "hangerSpacing",
    "symmetry", "crossBracing", "structuralDensity", "targetLoadClass",
  ]);
  for (const key of Object.keys(spec || {})) if (!expectedKeys.has(key)) issues.push(issue("INVALID_PARAMETER_RANGE", key, `Unknown BridgeSpec parameter: ${key}.`));
  if (spec?.version !== 3) issues.push(issue("INVALID_PARAMETER_RANGE", "version", "BridgeSpec.version must be 3."));
  if (!FAMILIES.has(spec?.family)) issues.push(issue("INVALID_PARAMETER_RANGE", "family", "Bridge family is not supported."));
  const actualSpan = challenge.exit.position.x - challenge.entry.position.x;
  if (!Number.isFinite(spec?.span) || spec.span <= 0 || Math.abs(spec.span - actualSpan) > 0.001) issues.push(issue("SPAN_INVALID", "span", `Span must match the ${actualSpan} m ENTRY-to-EXIT crossing.`));
  const elevation = challenge.corridor.deckElevationRange;
  if (!Number.isFinite(spec?.deckHeight) || spec.deckHeight < elevation[0] || spec.deckHeight > elevation[1]) issues.push(issue("DECK_OUTSIDE_CORRIDOR", "deckHeight", `Deck height must be between ${elevation[0]} and ${elevation[1]} m.`));
  if (!Number.isFinite(spec?.bridgeWidth) || spec.bridgeWidth < challenge.corridor.vehicleClearWidth + 2) issues.push(issue("VEHICLE_CLEARANCE", "bridgeWidth", "Bridge width does not leave two structural side zones around the vehicle corridor."));
  if (!Number.isFinite(spec?.vehicleClearance) || spec.vehicleClearance < challenge.corridor.vehicleClearHeight) issues.push(issue("VEHICLE_CLEARANCE", "vehicleClearance", `Vehicle clearance must be at least ${challenge.corridor.vehicleClearHeight} m.`));
  const ranges = [
    ["panelCount", spec?.panelCount, 2, 24, Number.isInteger], ["trussHeight", spec?.trussHeight, 4, 40],
    ["pierCount", spec?.pierCount, 0, 12, Number.isInteger], ["pierSpacing", spec?.pierSpacing, 4, 40],
    ["archCount", spec?.archCount, 1, 12, Number.isInteger], ["archRise", spec?.archRise, 4, 42],
    ["towerHeight", spec?.towerHeight, 8, 50], ["cableSag", spec?.cableSag, 2, 30],
    ["hangerSpacing", spec?.hangerSpacing, 2, 24], ["structuralDensity", spec?.structuralDensity, 0.2, 1],
    ["targetLoadClass", spec?.targetLoadClass, 1, 5, Number.isInteger],
  ];
  for (const [path, value, min, max, predicate] of ranges) {
    if (!Number.isFinite(value) || value < min || value > max || (predicate && !predicate(value))) issues.push(issue("INVALID_PARAMETER_RANGE", path, `${path} must be between ${min} and ${max}${predicate ? " as a whole number" : ""}.`));
  }
  if (!ARCH_SHAPES.has(spec?.archShape)) issues.push(issue("INVALID_PARAMETER_RANGE", "archShape", "Arch shape must be circular or parabolic."));
  if (typeof spec?.symmetry !== "boolean" || typeof spec?.crossBracing !== "boolean") issues.push(issue("INVALID_PARAMETER_RANGE", "style", "Symmetry and cross-bracing must be booleans."));
  if (["pratt", "howe", "warren", "box"].includes(spec?.family) && spec?.trussHeight < spec?.vehicleClearance) issues.push(issue("VEHICLE_CLEARANCE", "trussHeight", "Truss height must clear the vehicle envelope."));
  if (spec?.family === "suspension" && spec?.towerHeight <= spec?.cableSag) issues.push(issue("INVALID_PARAMETER_RANGE", "cableSag", "Cable sag must remain below tower height."));
  return report(issues);
}

export function validateGraph(graph) {
  const issues = [];
  if (!graph) return report([issue("UNSUPPORTED_MEMBER", "graph", "No graph was generated.")]);
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const member of graph.members) {
    if (!ids.has(member.nodeA) || !ids.has(member.nodeB) || member.nodeA === member.nodeB) issues.push(issue("UNSUPPORTED_MEMBER", `members.${member.id}`, "Member endpoints must reference two different graph nodes."));
  }
  const anchors = new Set(graph.nodes.filter((node) => ["anchor", "tower", "deck"].includes(node.role)).map((node) => node.id));
  for (const cable of graph.cables) {
    if (!anchors.has(cable.anchorNodeA) || !anchors.has(cable.anchorNodeB)) issues.push(issue("INVALID_CABLE_ANCHOR", `cables.${cable.id}`, "Cable endpoints must reference valid anchor, tower, or deck nodes."));
  }
  return report(issues);
}

export function report(issues) {
  return { valid: !issues.some((entry) => entry.severity === "error"), errors: issues.filter((entry) => entry.severity === "error"), warnings: issues.filter((entry) => entry.severity === "warning") };
}
