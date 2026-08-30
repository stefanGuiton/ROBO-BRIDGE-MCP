export const DEFAULT_SETTINGS = Object.freeze({
  sideOffsetStuds: 6,
  sideThicknessStuds: 2,
  deckWidthStuds: 10,
  deckThicknessLayers: 2,
  clearanceWidthStuds: 6,
  clearanceHeightLayers: 6,
  include1x1: true,
  allowedBeamLengths: [80, 64, 48, 32, 24, 16, 12, 8, 6],
  paletteId: "signal-structure",
  compilerVersion: "0.1.0",
});

export function createCatalogue(settings = {}) {
  const value = { ...DEFAULT_SETTINGS, ...settings };
  const beams = [...new Set(value.allowedBeamLengths)]
    .filter((length) => Number.isInteger(length) && length >= 6 && length <= 80)
    .sort((a, b) => b - a)
    .map((length) => ({
      partType: `beam-2x${length}`,
      studWidth: 2,
      studLength: length,
      layerHeight: 1,
      allowedRotations: [0, 90],
      robotPlaceable: true,
      structuralClass: "long-beam",
    }));

  const standard = [
    ["brick-2x4", 2, 4],
    ["brick-2x2", 2, 2],
    ["brick-1x4", 1, 4],
    ["brick-1x2", 1, 2],
  ].map(([partType, studWidth, studLength]) => ({
    partType,
    studWidth,
    studLength,
    layerHeight: 1,
    allowedRotations: [0, 90],
    robotPlaceable: true,
    structuralClass: "brick",
  }));

  if (value.include1x1) {
    standard.push({
      partType: "brick-1x1",
      studWidth: 1,
      studLength: 1,
      layerHeight: 1,
      allowedRotations: [0, 90],
      robotPlaceable: true,
      structuralClass: "brick",
    });
  }
  return Object.freeze([...beams, ...standard]);
}

export function catalogueByType(catalogue) {
  return new Map(catalogue.map((part) => [part.partType, part]));
}
