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

export const DEFAULT_SPEC = Object.freeze({
  version: 3,
  family: "warren",
  seed: 17,
  span: 96,
  deckHeight: 34,
  bridgeWidth: 13,
  vehicleClearance: 7,
  panelCount: 8,
  trussHeight: 16,
  pierCount: 4,
  pierSpacing: 16,
  archCount: 4,
  archShape: "parabolic",
  archRise: 22,
  towerHeight: 25,
  cableSag: 11,
  hangerSpacing: 8,
  symmetry: true,
  crossBracing: true,
  structuralDensity: 0.68,
  targetLoadClass: 3,
});

export function specForChallenge(challenge, family = DEFAULT_SPEC.family) {
  const span = challenge.exit.position.x - challenge.entry.position.x;
  return { ...DEFAULT_SPEC, family, span, deckHeight: challenge.entry.position.y, bridgeWidth: challenge.corridor.deckWidth };
}
