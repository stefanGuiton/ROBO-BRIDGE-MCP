export const FLAT_GAP = Object.freeze({
  version: 3,
  seed: 101,
  mode: "rail",
  name: "Flat gap",
  terrain: {
    seed: 101,
    width: 112,
    depth: 40,
    gridX: 16,
    gridZ: 4,
    heightScale: 1,
    obstacle: { type: "gap", width: 80, depth: 18, noiseAmplitude: 0, noiseFrequency: 0 },
    profile: [
      { x: -16, y: 0 }, { x: 0, y: 0 }, { x: 0.01, y: -18 },
      { x: 79.99, y: -18 }, { x: 80, y: 0 }, { x: 96, y: 0 },
    ],
  },
  entry: { position: { x: 0, y: 28, z: 0 }, forward: { x: 1, y: 0, z: 0 }, platformWidth: 12, platformLength: 16 },
  exit: { position: { x: 80, y: 28, z: 0 }, forward: { x: 1, y: 0, z: 0 }, platformWidth: 12, platformLength: 16 },
  corridor: {
    centreline: [{ x: 0, y: 28, z: 0 }, { x: 80, y: 28, z: 0 }],
    deckWidth: 12,
    vehicleClearWidth: 7,
    vehicleClearHeight: 6,
    deckElevationRange: [22, 36],
    mode: "rail-single",
  },
  supportRegions: [
    { id: "left-bank", xMin: -16, xMax: 0, foundationY: 0, allowed: ["fixed", "anchor", "tower"] },
    { id: "gap-floor", xMin: 0.01, xMax: 79.99, foundationY: -18, allowed: ["pier", "arch"] },
    { id: "right-bank", xMin: 80, xMax: 96, foundationY: 0, allowed: ["fixed", "anchor", "tower"] },
  ],
});

export const RAVINE = Object.freeze({
  version: 3,
  seed: 407,
  mode: "rail",
  name: "Ravine",
  terrain: {
    seed: 407,
    width: 132,
    depth: 52,
    gridX: 24,
    gridZ: 6,
    heightScale: 1,
    obstacle: { type: "ravine", width: 96, depth: 30, noiseAmplitude: 1.5, noiseFrequency: 0.08 },
    profile: [
      { x: -18, y: 4 }, { x: 0, y: 2 }, { x: 8, y: -5 }, { x: 18, y: -16 },
      { x: 32, y: -26 }, { x: 48, y: -29 }, { x: 64, y: -24 }, { x: 78, y: -15 },
      { x: 90, y: -4 }, { x: 96, y: 2 }, { x: 114, y: 5 },
    ],
  },
  entry: { position: { x: 0, y: 34, z: 0 }, forward: { x: 1, y: 0, z: 0 }, platformWidth: 12, platformLength: 18 },
  exit: { position: { x: 96, y: 34, z: 0 }, forward: { x: 1, y: 0, z: 0 }, platformWidth: 12, platformLength: 18 },
  corridor: {
    centreline: [{ x: 0, y: 34, z: 0 }, { x: 96, y: 34, z: 0 }],
    deckWidth: 13,
    vehicleClearWidth: 7,
    vehicleClearHeight: 6,
    deckElevationRange: [27, 42],
    mode: "rail-single",
  },
  supportRegions: [
    { id: "left-bank", xMin: -18, xMax: 7.5, foundationY: 2, allowed: ["fixed", "anchor", "tower", "pier", "arch"] },
    { id: "ravine-bed", xMin: 7.5, xMax: 90.5, foundationY: -28, allowed: ["pier", "arch"] },
    { id: "right-bank", xMin: 90.5, xMax: 114, foundationY: 2, allowed: ["fixed", "anchor", "tower", "pier", "arch"] },
  ],
});

export const CHALLENGE_FIXTURES = Object.freeze({ flatGap: FLAT_GAP, ravine: RAVINE });

const SYSTEM_PARTS = Object.freeze(["brick-2x4", "brick-2x2", "brick-1x4", "brick-1x2", "brick-1x1", "arch-wedge"]);
const TECHNIC_PARTS = Object.freeze(["technic-beam", "technic-connector"]);
const HYBRID_PARTS = Object.freeze(["cable", "chain", "hinge"]);

function brickSettings(family) {
  const technic = ["trestle", "warren", "pratt", "howe", "tiedArch", "suspension", "bascule"].includes(family);
  const cable = ["suspension", "bascule"].includes(family);
  return {
    allowed: [...SYSTEM_PARTS, ...(technic ? TECHNIC_PARTS : []), ...(cable ? HYBRID_PARTS : [])],
    maxBeamStuds: 24,
    sideThicknessStuds: 2,
    deckThicknessLayers: 3,
    bondPattern: "running",
    studSize: 1,
    layerHeight: 1,
  };
}

function familyParameters(family, span) {
  const commonPanels = Math.max(4, Math.min(12, Math.round(span / 12)));
  switch (family) {
    case "beam": return { panelCount: commonPanels, pierCount: 0, pierSpacing: 16 };
    case "pier": return { panelCount: commonPanels, pierCount: 4, pierSpacing: 16 };
    case "trestle": return { panelCount: commonPanels, pierCount: 5, pierSpacing: 14, crossBracing: true };
    case "warren":
    case "pratt":
    case "howe": return { panelCount: commonPanels, trussHeight: 16, crossBracing: family !== "warren" };
    case "arch": return { panelCount: Math.max(12, commonPanels * 2), archShape: "segmental", archRise: Math.min(24, Math.round(span * 0.25)) };
    case "viaduct": return { archCount: 4, archShape: "segmental", archRise: Math.min(10, Math.round(span / 10)) };
    case "corbelled": return { archRise: Math.min(22, Math.round(span * 0.23)) };
    case "boxCulvert": return { panelCount: commonPanels };
    case "tiedArch": return { panelCount: commonPanels, trussHeight: 20, hangerSpacing: 8, crossBracing: true };
    case "suspension": return { panelCount: commonPanels, towerHeight: 25, cableSag: 11, hangerSpacing: 8 };
    case "bascule": return { panelCount: commonPanels, towerHeight: 22 };
    default: return {};
  }
}

export const DEFAULT_SPEC = Object.freeze({
  version: 3,
  family: "arch",
  seed: 17,
  span: 96,
  deckHeight: 34,
  bridgeWidth: 13,
  vehicleClearance: 7,
  symmetry: true,
  structuralDensity: 0.68,
  targetLoadClass: 3,
  brick: brickSettings("arch"),
  ...familyParameters("arch", 96),
});

export function specForChallenge(challenge, family = DEFAULT_SPEC.family) {
  const span = challenge.exit.position.x - challenge.entry.position.x;
  return {
    version: 3,
    family,
    seed: 17,
    span,
    deckHeight: challenge.entry.position.y,
    bridgeWidth: challenge.corridor.deckWidth,
    vehicleClearance: Math.max(7, challenge.corridor.vehicleClearHeight),
    symmetry: true,
    structuralDensity: 0.68,
    targetLoadClass: 3,
    brick: brickSettings(family),
    ...familyParameters(family, span),
  };
}
