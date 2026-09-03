'use strict';

import { V46_COMMON_SETTINGS, V46_FAMILIES, getV46DefaultSettings } from './bridge-defaults.js';
import { BridgeCoreError, cloneValue } from './errors.js';

const FAMILY_SET = new Set(V46_FAMILIES);
const ALLOWED_KEYS = new Set(Object.keys(V46_COMMON_SETTINGS));

const ENUMS = Object.freeze({
  family: V46_FAMILIES,
  bondPattern: ['running', 'stacked'],
  collaborationMode: ['codex_all', 'shared_open', 'split_meet_middle'],
  aqTopArchType: ['A', 'B'],
  aqMiddleArchType: ['A', 'B'],
  aqBottomArchType: ['A', 'B'],
  viArchType: ['A', 'B'],
  sharedMacroOwner: ['codex', 'user', 'first_available'],
  trackOwner: ['codex', 'user', 'shared_open'],
  viewMode: ['plan', 'build', 'playback', 'slice', 'voxels']
});

const BOUNDS = Object.freeze({
  bridgeWidthCells: [2, 3],
  anchorGroupX: [-100000, 100000],
  anchorBaseY: [-100000, 100000],
  anchorGroupZ: [-100000, 100000],
  anchorGapX: [50, 340],
  anchorBlockLengthX: [4, 60],
  anchorHeightY: [2, 100],
  deckThickness: [0.5, 20],
  deckOverhang: [0, 30],
  capHeight: [0, 8],
  capOverhang: [0, 6],
  aqTopCount: [3, 24],
  aqMiddleCount: [3, 20],
  aqBottomCount: [2, 16],
  aqTopOffset: [0, 0.4],
  aqMiddleOffset: [0, 0.4],
  aqBottomOffset: [0, 0.4],
  aqTopSupportBand: [0.5, 12],
  aqMiddleSupportBand: [0.5, 14],
  aqBottomSupportBand: [0.5, 18],
  aqLedgeHeight: [0, 6],
  aqLedgeOverhang: [0, 6],
  aqArchThicknessCells: [0.25, 4],
  viArchCount: [2, 14],
  viOpeningWidthRatio: [0.35, 0.96],
  viPenetration: [0, 45],
  viDraftDeg: [0, 7],
  viEndAbutment: [0, 20],
  viArchThicknessCells: [0.25, 5],
  collaborationMode: null,
  splitRatio: [0.1, 0.9],
  meetBandCells: [0, 20],
  brickPlaceTimeMs: [50, 10000],
  archPlaceTimeMs: [50, 30000],
  trackPlaceTimeMs: [50, 30000],
  voxelSize: [0.6, 8],
  brickHeightRatio: [0.5, 1.8],
  samplesPerAxis: [1, 5],
  captureThreshold: [0.01, 1],
  contactEpsilon: [0, 3],
  closurePasses: [0, 3],
  curveBandCells: [0, 3],
  archSegmentsPerCell: [1, 8],
  archMinSideThicknessCells: [0.5, 1],
  maxGridCells: [100000, 9000000],
  brickGap: [0, 0.22],
  verticalGap: [0, 0.18],
  trackNominalSegmentLengthCells: [2, 30],
  trackSleeperWidthCells: [0.2, 2],
  trackSleeperDepthCells: [1, 3],
  trackSleeperHeightLayers: [0.05, 1],
  trackSleeperEndInsetCells: [0, 1.5],
  trackRailGaugeCells: [0.5, 2.7],
  trackRailWidthCells: [0.05, 0.6],
  trackRailHeightLayers: [0.05, 0.8],
  trackRailBaseLayers: [0, 1.5]
});

const INTEGER_FIELDS = new Set([
  'bridgeWidthCells',
  'aqTopCount', 'aqMiddleCount', 'aqBottomCount', 'viArchCount', 'meetBandCells',
  'brickPlaceTimeMs', 'archPlaceTimeMs', 'trackPlaceTimeMs', 'samplesPerAxis',
  'closurePasses', 'archSegmentsPerCell', 'maxGridCells', 'terrainSeed',
  'terrainResolutionX', 'terrainResolutionZ', 'terrainNoiseOctaves'
]);

const BOOLEAN_FIELDS = new Set([
  'liveCompile', 'strictTerritories', 'allowUserTakeoverAnywhere', 'waterEnabled',
  'baseplateEnabled', 'showTerrain', 'showWater', 'showBaseplate', 'invertMouseX', 'invertMouseY'
]);

const COLOUR_FIELDS = new Set([
  'bodyColor', 'deckColor', 'capColor', 'mainArchColor', 'accentColor', 'mortarColor',
  'entryColor', 'exitColor', 'userTint', 'codexTint', 'sharedTint', 'claimTint',
  'terrainGrassColor', 'terrainRockColor', 'waterColor', 'baseplateColor', 'backgroundColor',
  'trackColourSleepers', 'trackColourRails'
]);

function requirePlainObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeCoreError('INVALID_SETTINGS', `${path} must be an object.`, { path });
  }
}

function validateValue(key, value) {
  if (ENUMS[key]) {
    if (typeof value !== 'string' || !ENUMS[key].includes(value)) {
      const code = key === 'family' ? 'UNKNOWN_FAMILY' : 'INVALID_SETTINGS';
      throw new BridgeCoreError(code, `${key} must be one of: ${ENUMS[key].join(', ')}.`, { key, value, allowed: ENUMS[key] });
    }
    return;
  }
  if (BOOLEAN_FIELDS.has(key)) {
    if (typeof value !== 'boolean') throw new BridgeCoreError('INVALID_SETTINGS', `${key} must be boolean.`, { key, value });
    return;
  }
  if (COLOUR_FIELDS.has(key)) {
    if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
      throw new BridgeCoreError('INVALID_SETTINGS', `${key} must be a six-digit hexadecimal colour.`, { key, value });
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new BridgeCoreError('INVALID_SETTINGS', `${key} must be finite.`, { key, value });
    if (INTEGER_FIELDS.has(key) && !Number.isSafeInteger(value)) {
      throw new BridgeCoreError('INVALID_SETTINGS', `${key} must be an integer.`, { key, value });
    }
    const bounds = BOUNDS[key];
    if (bounds && (value < bounds[0] || value > bounds[1])) {
      throw new BridgeCoreError('OUT_OF_RANGE', `${key} must be from ${bounds[0]} to ${bounds[1]}.`, {
        key, value, minimum: bounds[0], maximum: bounds[1]
      });
    }
    return;
  }
  if (typeof value !== 'string') {
    throw new BridgeCoreError('INVALID_SETTINGS', `${key} has an unsupported value type.`, { key, type: typeof value });
  }
}

function validateCrossField(settings) {
  if (settings.deckThickness > settings.anchorHeightY) {
    throw new BridgeCoreError('OUT_OF_RANGE', 'deckThickness must not exceed anchorHeightY.', {
      deckThickness: settings.deckThickness,
      anchorHeightY: settings.anchorHeightY
    });
  }
  if (settings.trackRailGaugeCells + settings.trackRailWidthCells > settings.bridgeWidthCells + 1e-9) {
    throw new BridgeCoreError('OUT_OF_RANGE', 'Track rail gauge and rail width exceed the configured bridge width.', {
      trackRailGaugeCells: settings.trackRailGaugeCells,
      trackRailWidthCells: settings.trackRailWidthCells
    });
  }
  const counts = settings.family === 'aqueduct'
    ? [settings.aqTopCount, settings.aqMiddleCount, settings.aqBottomCount]
    : [settings.viArchCount];
  for (const count of counts) {
    const pitchCells = settings.anchorGapX / count / settings.voxelSize;
    if (pitchCells < 4 - 1e-9) {
      throw new BridgeCoreError('OUT_OF_RANGE', 'The span is too short for the selected arch count and voxel size.', {
        family: settings.family,
        span: settings.anchorGapX,
        voxelSize: settings.voxelSize,
        archCount: count,
        pitchCells,
        minimumPitchCells: 4
      });
    }
  }
}

export function normalizeCompilerSettings(input = {}) {
  requirePlainObject(input, 'settings');
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new BridgeCoreError('INVALID_SETTINGS', `Unknown V4.6 setting: ${key}.`, { key });
    }
  }
  const family = input.family ?? 'aqueduct';
  if (!FAMILY_SET.has(family)) {
    throw new BridgeCoreError('UNKNOWN_FAMILY', `Unsupported bridge family: ${String(family)}.`, {
      family,
      supportedFamilies: V46_FAMILIES
    });
  }
  const settings = { ...getV46DefaultSettings(family), ...cloneValue(input), family };
  for (const [key, value] of Object.entries(settings)) validateValue(key, value);
  validateCrossField(settings);
  return settings;
}

export function validateExactDesignRevision(value, path = 'expectedDesignRevision') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BridgeCoreError('INVALID_SETTINGS', `${path} must be a non-negative safe integer.`, { path, value });
  }
  return value;
}

export const V46_COMPILER_SETTINGS_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.fromEntries(Object.keys(V46_COMMON_SETTINGS).map((key) => {
    if (ENUMS[key]) return [key, { type: 'string', enum: [...ENUMS[key]] }];
    if (BOOLEAN_FIELDS.has(key)) return [key, { type: 'boolean' }];
    if (COLOUR_FIELDS.has(key)) return [key, { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }];
    const defaultValue = V46_COMMON_SETTINGS[key];
    if (typeof defaultValue === 'number') {
      const bounds = BOUNDS[key];
      return [key, {
        type: INTEGER_FIELDS.has(key) ? 'integer' : 'number',
        ...(bounds ? { minimum: bounds[0], maximum: bounds[1] } : {})
      }];
    }
    return [key, { type: typeof defaultValue === 'string' ? 'string' : 'object' }];
  })),
  additionalProperties: false
});

export const WORLD_TRANSFORM_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string' },
    translationMm: {
      type: 'object',
      properties: {
        xMm: { type: 'number' },
        yMm: { type: 'number' },
        zMm: { type: 'number' }
      },
      additionalProperties: false
    },
    yawRad: { type: 'number' },
    yawDeg: { type: 'number' },
    scale: { type: 'number', exclusiveMinimum: 0, maximum: 1000 }
  },
  additionalProperties: false
});

export const CHALLENGE_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string' },
    entry: { $ref: '#/$defs/point' },
    exit: { $ref: '#/$defs/point' },
    span: { type: 'number', exclusiveMinimum: 0 },
    roadY: { type: 'number' },
    anchorHeightY: { type: 'number', exclusiveMinimum: 0 },
    anchorBlockLengthX: { type: 'number', exclusiveMinimum: 0 },
    worldTransform: WORLD_TRANSFORM_SCHEMA,
    supportProfile: { type: 'object' }
  },
  additionalProperties: false,
  $defs: {
    point: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
      required: ['x', 'y'],
      additionalProperties: false
    }
  }
});
