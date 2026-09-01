import crypto from 'node:crypto';

const COMMON = {
  family: 'aqueduct',
  anchorGroupX: 0,
  anchorGroupZ: 0,
  anchorBaseY: 55,
  anchorHeightY: 20,
  anchorGapX: 220,
  deckThickness: 2.36,
  deckOverhang: 5,
  voxelSize: 2,
  bondPattern: 'running',
  collaborationMode: 'codex_all',
  splitRatio: 0.5,
  meetBandCells: 2,
  strictTerritories: true,
  allowUserTakeoverAnywhere: true,
  sharedMacroOwner: 'codex',
  brickPlaceTimeMs: 2000,
  archPlaceTimeMs: 2000,
  trackPlaceTimeMs: 2000,
  trackNominalSegmentLengthCells: 8,
  trackSleeperWidthCells: 0.7,
  trackSleeperDepthCells: 3,
  trackRailGaugeCells: 1.65,
  trackRailWidthCells: 0.18,
  trackRailHeightLayers: 0.3,
  trackOwner: 'codex',
  aqTopCount: 8,
  aqMiddleCount: 6,
  aqBottomCount: 5,
  aqTopOffset: 0.18,
  aqMiddleOffset: 0.13,
  aqBottomOffset: 0.08,
  aqTopSupportBand: 2.8,
  aqMiddleSupportBand: 3.8,
  aqBottomSupportBand: 5.2,
  aqLedgeHeight: 1.4,
  aqLedgeOverhang: 1.2,
  aqTopArchType: 'A',
  aqMiddleArchType: 'A',
  aqBottomArchType: 'B',
  aqArchThicknessCells: 1,
  viArchCount: 6,
  viOpeningWidthRatio: 0.79,
  viPenetration: 14,
  viDraftDeg: 2.2,
  viEndAbutment: 5,
  viArchType: 'B',
  viArchThicknessCells: 1.25
};

const PRESETS = {
  aqueduct: { ...COMMON, family: 'aqueduct', anchorBaseY: 55, anchorGapX: 220, deckThickness: 2.36 },
  viaduct: {
    ...COMMON,
    family: 'viaduct',
    anchorBaseY: 89,
    anchorGapX: 190,
    deckThickness: 7,
    viArchCount: 6,
    viOpeningWidthRatio: 0.79,
    viDraftDeg: 2.2
  }
};

function clone(value) {
  return structuredClone(value);
}

function checksum(settings) {
  return crypto.createHash('sha256').update(JSON.stringify(Object.keys(settings).sort().map((key) => [key, settings[key]]))).digest('hex').slice(0, 8);
}

export class FakeV46Adapter {
  constructor(family = 'aqueduct') {
    this.settings = clone(PRESETS[family]);
    this.revision = 1;
    this.compileCount = 1;
    this.plan = this.makePlan();
    this.applyCount = 0;
  }

  get ready() { return true; }
  getInternalSettings() { return clone(this.settings); }
  getFamilyDefaults(family) { return clone(PRESETS[family]); }
  getBuildPlan() { return clone(this.plan); }
  getCompileState() { return { state: 'ready', compileCount: this.compileCount, designRevision: this.revision, lastError: null }; }
  getRendererSnapshot() { return { metadata: { timing: { geometry: 1, slice: 2, packing: 1, terrain: 2, total: 6 } }, renderStats: { bridgeDrawCalls: 1, trackDrawCalls: 1 } }; }

  makePlan() {
    const hash = checksum(this.settings);
    const logicalArches = this.settings.family === 'aqueduct'
      ? this.settings.aqTopCount + this.settings.aqMiddleCount + this.settings.aqBottomCount
      : this.settings.viArchCount;
    const standard = Math.max(30, Math.round(this.settings.anchorGapX / this.settings.voxelSize) * 3);
    const track = Math.max(1, Math.round(this.settings.anchorGapX / (this.settings.trackNominalSegmentLengthCells * this.settings.voxelSize)));
    const archPieces = logicalArches * 3;
    const placements = Array.from({ length: Math.min(80, standard / 3) }, (_, index) => ({
      basePlacementId: index,
      placementKind: 'STANDARD_BRICK',
      partType: index % 5 === 0 ? '1x20x1' : '1x2x1',
      layer: Math.floor(index / 10),
      gridX: index,
      gridY: Math.floor(index / 10),
      lengthCells: index % 5 === 0 ? 20 : 2,
      role: 'body',
      curve: false,
      territory: 'codex',
      segmentId: index,
      dependsOn: []
    }));
    const customPlacements = Array.from({ length: logicalArches + track }, (_, index) => ({
      masterCustomId: index < logicalArches ? `arch_${index}` : `track_${index - logicalArches}`,
      placementKind: index < logicalArches ? 'CUSTOM_ARCH' : 'TRACK_SEGMENT',
      definitionId: index < logicalArches ? 'arch_fake' : 'track_fake',
      partClass: index < logicalArches ? 'ARCH_A' : 'TRACK_SEGMENT',
      centreX: index,
      baseY: 0,
      baseLayer: 0,
      repeatAcrossSlices: index < logicalArches,
      role: index < logicalArches ? 'body' : 'track',
      territory: 'codex',
      phase: index < logicalArches ? 'ARCH_MACRO' : 'TRACK',
      trackIndex: index < logicalArches ? null : index - logicalArches
    }));
    return {
      schemaVersion: '4.6',
      planId: `bp_${hash}`,
      designRevision: this.revision,
      executionRevision: 0,
      designChecksum: hash,
      billOfMaterials: {
        masterSliceBricks: Math.round(standard / 3),
        sliceCount: 3,
        totalPhysicalParts: standard + archPieces + track,
        byPartClass: { STANDARD_BRICK: standard, CUSTOM_ARCH: archPieces, TRACK_SEGMENT: track },
        byStandardPartType: { '1x1x1': 0, '1x2x1': standard - 3, '1x20x1': 3 },
        byPartType: { '1x1x1': 0, '1x2x1': standard - 3, '1x20x1': 3 },
        byCustomDefinitionId: { arch_fake: archPieces, track_fake: track },
        trackSegmentCount: track
      },
      timing: {
        robotOnly: { partCount: standard + archPieces + track, byClass: { standard, arch: archPieces, track }, milliseconds: 1000, seconds: 1, minutes: 1 / 60 },
        codexAssigned: { partCount: standard + archPieces + track, byClass: { standard, arch: archPieces, track }, milliseconds: 1000, seconds: 1, minutes: 1 / 60 },
        codexRemaining: { partCount: standard + archPieces + track, byClass: { standard, arch: archPieces, track }, milliseconds: 1000, seconds: 1, minutes: 1 / 60 }
      },
      collaboration: { mode: this.settings.collaborationMode },
      anchors: {
        roadY: this.settings.anchorBaseY + this.settings.anchorHeightY,
        bridgeStartX: -this.settings.anchorGapX / 2,
        bridgeEndX: this.settings.anchorGapX / 2,
        entry: { innerFaceX: -this.settings.anchorGapX / 2 },
        exit: { innerFaceX: this.settings.anchorGapX / 2 }
      },
      catalogue: {
        customDefinitions: [
          { definitionId: 'arch_fake', partClass: 'ARCH_A', geometryVersion: 1, geometryHash: 'a', widthCells: 1, materialRole: 'body', parameters: { clearSpanCells: 6 } },
          { definitionId: 'track_fake', partClass: 'TRACK_SEGMENT', geometryVersion: 1, geometryHash: 't', widthCells: 3, materialRole: 'track', parameters: { segmentLength: 16 } }
        ]
      },
      geometry: {
        family: this.settings.family,
        masterSlice: { placements, customPlacements },
        track: { segmentCount: track, segmentLength: 16, routeLength: this.settings.anchorGapX }
      },
      execution: { state: 'BUILD' }
    };
  }

  async applyInternalSettings(candidate, expectedRevision, options = {}) {
    if (options.signal?.aborted) {
      const error = new Error('cancelled');
      error.code = 'CANCELLED';
      throw error;
    }
    if (expectedRevision !== this.revision) {
      const error = new Error('stale');
      error.code = 'STALE_DESIGN_REVISION';
      error.details = { expectedDesignRevision: expectedRevision, currentDesignRevision: this.revision };
      throw error;
    }
    this.settings = clone(candidate);
    this.revision += 1;
    this.compileCount += 1;
    this.applyCount += 1;
    this.plan = this.makePlan();
    return { ok: true, designRevision: this.revision, planId: this.plan.planId, designChecksum: this.plan.designChecksum };
  }

  async compileCurrent(expectedRevision, options = {}) {
    return this.applyInternalSettings(this.settings, expectedRevision, options);
  }
}
