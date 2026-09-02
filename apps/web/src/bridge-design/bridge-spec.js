'use strict';

import { BridgeDesignError, structuredCloneSafe } from './errors.js';

export const BRIDGE_FAMILIES = Object.freeze(['aqueduct', 'viaduct']);
const FAMILY_SET = new Set(BRIDGE_FAMILIES);

const number = (internal, minimum, maximum, description, extra = {}) => ({
  internal, type: 'number', minimum, maximum, description, ...extra
});
const integer = (internal, minimum, maximum, description) => ({
  internal, type: 'integer', minimum, maximum, description
});
const choice = (internal, values, description) => ({
  internal, type: 'string', enum: values, description
});
const boolean = (internal, description) => ({ internal, type: 'boolean', description });

export const BRIDGE_PARAMETER_DEFINITIONS = Object.freeze({
  common: Object.freeze({
    positionX: number('anchorGroupX', -100, 100, 'Bridge and ENTRY/EXIT pair X position.'),
    positionZ: number('anchorGroupZ', -80, 80, 'Bridge and ENTRY/EXIT pair Z position.'),
    bridgeBaseElevation: number('anchorBaseY', -80, 160, 'Base elevation. Increase this to make the bridge and road higher.'),
    anchorHeight: number('anchorHeightY', 2, 100, 'ENTRY/EXIT anchor height. This also raises road elevation.'),
    entryExitGap: number('anchorGapX', 50, 340, 'Distance between the inner ENTRY and EXIT faces. This is the bridge span.'),
    deckThickness: number('deckThickness', 0.5, 20, 'Structural deck thickness.'),
    deckOverhang: number('deckOverhang', 0, 30, 'Deck extension past the bridge span.'),
    voxelSize: number('voxelSize', 0.6, 8, 'World units per compiler cell. A larger value usually uses fewer parts but reduces detail.'),
    bondPattern: choice('bondPattern', ['running', 'stacked'], 'Running bond improves seam staggering. Stacked targets minimum part packing.')
  }),
  aqueduct: Object.freeze({
    topArchCount: integer('aqTopCount', 3, 24, 'Top-tier arch count.'),
    middleArchCount: integer('aqMiddleCount', 3, 20, 'Middle-tier arch count.'),
    bottomArchCount: integer('aqBottomCount', 2, 16, 'Bottom-tier arch count.'),
    topOpeningOffset: number('aqTopOffset', 0, 0.4, 'Top-tier opening inset ratio. Decrease it for wider openings; increase it for narrower openings.'),
    middleOpeningOffset: number('aqMiddleOffset', 0, 0.4, 'Middle-tier opening inset ratio. Decrease it for wider openings; increase it for narrower openings.'),
    bottomOpeningOffset: number('aqBottomOffset', 0, 0.4, 'Bottom-tier opening inset ratio. Decrease it for wider openings; increase it for narrower openings.'),
    topSupportBand: number('aqTopSupportBand', 0.5, 12, 'Top-tier support band height.'),
    middleSupportBand: number('aqMiddleSupportBand', 0.5, 14, 'Middle-tier support band height.'),
    bottomSupportBand: number('aqBottomSupportBand', 0.5, 18, 'Bottom-tier support band height.'),
    ledgeHeight: number('aqLedgeHeight', 0, 6, 'Tier ledge height.'),
    ledgeOverhang: number('aqLedgeOverhang', 0, 6, 'Tier ledge overhang.'),
    topArchType: choice('aqTopArchType', ['A', 'B'], 'Top arch piece: A has a flat top; B has a stepped top.'),
    middleArchType: choice('aqMiddleArchType', ['A', 'B'], 'Middle arch piece: A has a flat top; B has a stepped top.'),
    bottomArchType: choice('aqBottomArchType', ['A', 'B'], 'Bottom arch piece: A has a flat top; B has a stepped top.'),
    archThicknessCells: number('aqArchThicknessCells', 0.25, 4, 'Aqueduct arch crown thickness in cells.')
  }),
  viaduct: Object.freeze({
    archCount: integer('viArchCount', 2, 14, 'Viaduct arch count.'),
    openingWidthRatio: number('viOpeningWidthRatio', 0.35, 0.96, 'Opening width as a ratio of arch pitch. Increase it for wider openings.'),
    terrainPenetration: number('viPenetration', 0, 45, 'Extra pier penetration into terrain.'),
    pierDraftAngleDeg: number('viDraftDeg', 0, 7, 'Pier draft angle in degrees.'),
    endAbutmentWidth: number('viEndAbutment', 0, 20, 'End abutment width.'),
    archType: choice('viArchType', ['A', 'B'], 'Arch piece: A has a flat top; B has a stepped top.'),
    archThicknessCells: number('viArchThicknessCells', 0.25, 5, 'Viaduct arch crown thickness in cells.')
  }),
  track: Object.freeze({
    nominalSegmentLengthCells: number('trackNominalSegmentLengthCells', 2, 30, 'Nominal track module length in cells.'),
    sleeperWidthCells: number('trackSleeperWidthCells', 0.2, 2, 'Sleeper width in cells.'),
    sleeperDepthCells: number('trackSleeperDepthCells', 1, 3, 'Sleeper depth in cells. The bridge is three cells wide.'),
    railGaugeCells: number('trackRailGaugeCells', 0.5, 2.7, 'Rail gauge in cells.'),
    railWidthCells: number('trackRailWidthCells', 0.05, 0.6, 'Rail width in cells.'),
    railHeightLayers: number('trackRailHeightLayers', 0.05, 0.8, 'Rail height in brick layers.'),
    owner: choice('trackOwner', ['codex', 'user', 'shared_open'], 'Track construction owner.')
  }),
  collaboration: Object.freeze({
    mode: choice('collaborationMode', ['codex_all', 'shared_open', 'split_meet_middle'], 'Construction collaboration mode.'),
    splitRatio: number('splitRatio', 0.1, 0.9, 'User/Codex split position for split-meet-middle mode.'),
    meetBandCells: integer('meetBandCells', 0, 20, 'Shared meet band width in cells.'),
    strictTerritories: boolean('strictTerritories', 'Keep packing boundaries inside construction territories.'),
    allowUserTakeoverAnywhere: boolean('allowUserTakeoverAnywhere', 'Allow the user to take a Codex task anywhere.'),
    sharedArchOwner: choice('sharedMacroOwner', ['codex', 'user', 'first_available'], 'Owner of shared custom arch pieces.')
  }),
  timing: Object.freeze({
    brickPlaceTimeMs: integer('brickPlaceTimeMs', 50, 10000, 'Placement time for one standard brick.'),
    archPlaceTimeMs: integer('archPlaceTimeMs', 50, 30000, 'Placement time for one custom arch piece.'),
    trackPlaceTimeMs: integer('trackPlaceTimeMs', 50, 30000, 'Placement time for one track module.')
  })
});

const GROUP_NAMES = Object.freeze(Object.keys(BRIDGE_PARAMETER_DEFINITIONS));
const GROUP_SET = new Set(GROUP_NAMES);
const ROOT_KEYS = new Set(['family', ...GROUP_NAMES]);

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requirePlainObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeDesignError('INVALID_PARAMETER', `${path} must be an object.`, { path });
  }
}

function validateValue(value, definition, path) {
  if (definition.type === 'number' || definition.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BridgeDesignError('INVALID_PARAMETER', `${path} must be a finite number.`, { path, value });
    }
    if (definition.type === 'integer' && !Number.isSafeInteger(value)) {
      throw new BridgeDesignError('INVALID_PARAMETER', `${path} must be an integer.`, { path, value });
    }
    if (value < definition.minimum || value > definition.maximum) {
      throw new BridgeDesignError('OUT_OF_RANGE', `${path} must be from ${definition.minimum} to ${definition.maximum}.`, {
        path, value, minimum: definition.minimum, maximum: definition.maximum
      });
    }
    return;
  }
  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new BridgeDesignError('INVALID_PARAMETER', `${path} must be boolean.`, { path, value });
    }
    return;
  }
  if (definition.type === 'string') {
    if (typeof value !== 'string' || !definition.enum.includes(value)) {
      throw new BridgeDesignError('INVALID_PARAMETER', `${path} must be one of: ${definition.enum.join(', ')}.`, {
        path, value, allowed: definition.enum
      });
    }
  }
}

function validatePatchShape(patch) {
  requirePlainObject(patch, 'patch');
  for (const key of Object.keys(patch)) {
    if (!ROOT_KEYS.has(key)) {
      throw new BridgeDesignError('INVALID_PARAMETER', `Unknown bridge patch property: ${key}.`, { path: key });
    }
  }
  if (own(patch, 'family')) {
    if (typeof patch.family !== 'string' || !FAMILY_SET.has(patch.family)) {
      throw new BridgeDesignError('UNKNOWN_FAMILY', `Unsupported bridge family: ${String(patch.family)}.`, {
        family: patch.family, supportedFamilies: BRIDGE_FAMILIES
      });
    }
  }
  for (const groupName of GROUP_NAMES) {
    if (!own(patch, groupName)) continue;
    requirePlainObject(patch[groupName], `patch.${groupName}`);
    const definitions = BRIDGE_PARAMETER_DEFINITIONS[groupName];
    for (const key of Object.keys(patch[groupName])) {
      const definition = definitions[key];
      if (!definition) {
        throw new BridgeDesignError('INVALID_PARAMETER', `Unknown parameter: ${groupName}.${key}.`, {
          path: `${groupName}.${key}`
        });
      }
      validateValue(patch[groupName][key], definition, `${groupName}.${key}`);
    }
  }
}

function validateCrossField(candidate) {
  const family = candidate.family;
  const span = candidate.anchorGapX;
  const voxel = candidate.voxelSize;
  if (candidate.deckThickness > candidate.anchorHeightY) {
    throw new BridgeDesignError('OUT_OF_RANGE', 'common.deckThickness must not exceed common.anchorHeight.', {
      deckThickness: candidate.deckThickness,
      anchorHeight: candidate.anchorHeightY
    });
  }
  if (candidate.trackRailGaugeCells + candidate.trackRailWidthCells > 3 + 1e-9) {
    throw new BridgeDesignError('OUT_OF_RANGE', 'Track rail gauge and rail width exceed the fixed three-cell bridge width.', {
      railGaugeCells: candidate.trackRailGaugeCells,
      railWidthCells: candidate.trackRailWidthCells,
      maximumCombinedCells: 3
    });
  }
  const counts = family === 'aqueduct'
    ? [candidate.aqTopCount, candidate.aqMiddleCount, candidate.aqBottomCount]
    : [candidate.viArchCount];
  for (const count of counts) {
    const pitchCells = span / count / voxel;
    if (pitchCells < 4 - 1e-9) {
      throw new BridgeDesignError('OUT_OF_RANGE', 'The span is too short for the selected arch count and voxel size.', {
        family, span, voxelSize: voxel, archCount: count, pitchCells, minimumPitchCells: 4
      });
    }
  }
}

export function applyPublicPatch(currentInternalSettings, patch, getFamilyDefaults) {
  validatePatchShape(patch);
  requirePlainObject(currentInternalSettings, 'currentInternalSettings');
  const currentFamily = FAMILY_SET.has(currentInternalSettings.family) ? currentInternalSettings.family : 'aqueduct';
  const targetFamily = patch.family ?? currentFamily;
  const familyChanged = targetFamily !== currentFamily;
  let candidate;
  if (familyChanged) {
    const defaults = getFamilyDefaults(targetFamily);
    requirePlainObject(defaults, `family defaults for ${targetFamily}`);
    candidate = structuredCloneSafe(defaults);
    candidate.family = targetFamily;
  } else {
    candidate = structuredCloneSafe(currentInternalSettings);
  }

  if (own(patch, 'aqueduct') && targetFamily !== 'aqueduct') {
    throw new BridgeDesignError('INVALID_PARAMETER', 'aqueduct parameters require family aqueduct.', {
      family: targetFamily, path: 'aqueduct'
    });
  }
  if (own(patch, 'viaduct') && targetFamily !== 'viaduct') {
    throw new BridgeDesignError('INVALID_PARAMETER', 'viaduct parameters require family viaduct.', {
      family: targetFamily, path: 'viaduct'
    });
  }

  for (const groupName of GROUP_NAMES) {
    const groupPatch = patch[groupName];
    if (!groupPatch) continue;
    const definitions = BRIDGE_PARAMETER_DEFINITIONS[groupName];
    for (const [publicName, value] of Object.entries(groupPatch)) {
      candidate[definitions[publicName].internal] = value;
    }
  }
  candidate.family = targetFamily;
  validateCrossField(candidate);
  return candidate;
}

export function publicBridgeSpec(internalSettings) {
  requirePlainObject(internalSettings, 'internalSettings');
  const family = FAMILY_SET.has(internalSettings.family) ? internalSettings.family : 'aqueduct';
  const result = { family };
  for (const groupName of GROUP_NAMES) {
    if (groupName === 'aqueduct' && family !== 'aqueduct') continue;
    if (groupName === 'viaduct' && family !== 'viaduct') continue;
    const group = {};
    for (const [publicName, definition] of Object.entries(BRIDGE_PARAMETER_DEFINITIONS[groupName])) {
      group[publicName] = internalSettings[definition.internal];
    }
    result[groupName] = group;
  }
  return result;
}

export function parameterCapabilities(family = null) {
  if (family !== null && !FAMILY_SET.has(family)) {
    throw new BridgeDesignError('UNKNOWN_FAMILY', `Unsupported bridge family: ${String(family)}.`);
  }
  const groups = {};
  for (const groupName of GROUP_NAMES) {
    if (groupName === 'aqueduct' && family === 'viaduct') continue;
    if (groupName === 'viaduct' && family === 'aqueduct') continue;
    groups[groupName] = {};
    for (const [name, definition] of Object.entries(BRIDGE_PARAMETER_DEFINITIONS[groupName])) {
      const item = { type: definition.type, description: definition.description };
      if (definition.minimum !== undefined) item.minimum = definition.minimum;
      if (definition.maximum !== undefined) item.maximum = definition.maximum;
      if (definition.enum) item.enum = [...definition.enum];
      groups[groupName][name] = item;
    }
  }
  return {
    families: [...BRIDGE_FAMILIES],
    patchSemantics: 'Partial merge. Unspecified values stay unchanged. A family switch starts from the tested V4.6 preset for that family, then applies the supplied patch.',
    groups
  };
}

function schemaForDefinition(definition) {
  const schema = { type: definition.type, description: definition.description };
  if (definition.minimum !== undefined) schema.minimum = definition.minimum;
  if (definition.maximum !== undefined) schema.maximum = definition.maximum;
  if (definition.enum) schema.enum = [...definition.enum];
  return schema;
}

export function bridgePatchJsonSchema() {
  const properties = {
    family: { type: 'string', enum: [...BRIDGE_FAMILIES], description: 'Target bridge family.' }
  };
  for (const groupName of GROUP_NAMES) {
    const groupProperties = {};
    for (const [name, definition] of Object.entries(BRIDGE_PARAMETER_DEFINITIONS[groupName])) {
      groupProperties[name] = schemaForDefinition(definition);
    }
    properties[groupName] = {
      type: 'object',
      properties: groupProperties,
      additionalProperties: false
    };
  }
  return { type: 'object', properties, additionalProperties: false };
}

export function changedInternalFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => !Object.is(before?.[key], after?.[key])).sort();
}

export function isBridgePatchEmpty(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
  if (own(patch, 'family')) return false;
  for (const key of GROUP_SET) {
    if (patch[key] && Object.keys(patch[key]).length > 0) return false;
  }
  return Object.keys(patch).length === 0 || Object.keys(patch).every((key) => GROUP_SET.has(key));
}
