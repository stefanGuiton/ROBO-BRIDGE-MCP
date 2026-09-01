import { BRICK_SPEC } from '../bricks/brick-spec.js';

export const SIMPLE_STRUCTURE_TYPES = Object.freeze(['single', 'wall', 'cross_laminated_tower']);
export const SIMPLE_STRUCTURE_COLOURS = Object.freeze([
  'white', 'black', 'red', 'blue', 'yellow', 'green', 'orange', 'purple', 'teal'
]);
export const ROBOT_SHOWCASE_INVENTORY = Object.freeze([
  ...Array.from({ length: 12 }, () => 'blue'),
  ...Array.from({ length: 12 }, () => 'red')
]);

const quarterTurn = Math.PI / 2;
const clone = (value) => structuredClone(value);

function rotate2(x, y, yawRad) {
  const cosine = Math.cos(yawRad), sine = Math.sin(yawRad);
  return { x: cosine * x - sine * y, y: sine * x + cosine * y };
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  const text = JSON.stringify(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function integer(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function normalizeQuarterTurn(yawDeg = 0) {
  if (!Number.isFinite(yawDeg)) return null;
  const turns = Math.round(yawDeg / 90);
  if (Math.abs(yawDeg - turns * 90) > 1e-6) return null;
  return ((turns % 4) + 4) % 4;
}

function defaultOrigin(profile, quarterTurns = 0) {
  if (!profile?.buildZone || !Number.isFinite(profile.placementSurfaceZMm)) return null;
  const desired = {
    xMm: (profile.buildZone.minX + profile.buildZone.maxX) / 2,
    yMm: (profile.buildZone.minY + profile.buildZone.maxY) / 2
  };
  if (!profile.matBounds) {
    return { ...desired, zMm: profile.placementSurfaceZMm + BRICK_SPEC.bodyHeightMm / 2 };
  }
  const pitch = BRICK_SPEC.studPitchMm;
  const matCentre = {
    xMm: (profile.matBounds.minX + profile.matBounds.maxX) / 2,
    yMm: (profile.matBounds.minY + profile.matBounds.maxY) / 2
  };
  const gridOriginX = -(profile.matBounds.maxX - profile.matBounds.minX) / 2 + pitch / 2;
  const gridOriginY = -(profile.matBounds.maxY - profile.matBounds.minY) / 2 + pitch / 2;
  const orientation = quarterTurns % 2;
  const offsetX = (orientation === 0 ? 1.5 : 0.5) * pitch;
  const offsetY = (orientation === 0 ? 0.5 : 1.5) * pitch;
  const snap = (value, centre, gridOrigin, offset) => {
    const local = value - centre;
    return centre + gridOrigin + Math.round((local - gridOrigin - offset) / pitch) * pitch + offset;
  };
  return {
    xMm: snap(desired.xMm, matCentre.xMm, gridOriginX, offsetX),
    yMm: snap(desired.yMm, matCentre.yMm, gridOriginY, offsetY),
    zMm: profile.placementSurfaceZMm + BRICK_SPEC.bodyHeightMm / 2
  };
}

function placementId(prefix, layer, slot) {
  return `${prefix}-l${String(layer).padStart(2, '0')}-b${String(slot).padStart(2, '0')}`;
}

function worldPosition(origin, localX, localY, layer, baseYawRad) {
  const rotated = rotate2(localX, localY, baseYawRad);
  return {
    xMm: origin.xMm + rotated.x,
    yMm: origin.yMm + rotated.y,
    zMm: origin.zMm + layer * BRICK_SPEC.bodyHeightMm
  };
}

function wallPlacements({ colour, widthBricks, heightLayers, origin, baseYawRad, prefix }) {
  const placements = [];
  for (let layer = 0; layer < heightLayers; layer += 1) {
    const priorLayer = layer > 0
      ? Array.from({ length: widthBricks }, (_, column) => placementId(prefix, layer - 1, column))
      : [];
    for (let column = 0; column < widthBricks; column += 1) {
      placements.push({
        placementId: placementId(prefix, layer, column),
        colour,
        position: worldPosition(
          origin,
          (column - (widthBricks - 1) / 2) * BRICK_SPEC.studPitchMm * 4,
          0,
          layer,
          baseYawRad
        ),
        yawRad: baseYawRad,
        supportPlacementId: layer > 0 ? placementId(prefix, layer - 1, column) : null,
        dependsOnPlacementIds: priorLayer,
        supportSide: 'M',
        carriedSide: layer > 0 ? 'M' : null
      });
    }
  }
  return placements;
}

function towerPlacements({ colour, heightLayers, origin, baseYawRad, prefix }) {
  const placements = [];
  const offset = BRICK_SPEC.studPitchMm;
  for (let layer = 0; layer < heightLayers; layer += 1) {
    const perpendicular = layer % 2 === 1;
    const layerYawRad = baseYawRad + (perpendicular ? quarterTurn : 0);
    const priorLayer = layer > 0
      ? [placementId(prefix, layer - 1, 0), placementId(prefix, layer - 1, 1)]
      : [];
    for (let slot = 0; slot < 2; slot += 1) {
      const sign = slot === 0 ? -1 : 1;
      const localX = perpendicular ? sign * offset : 0;
      const localY = perpendicular ? 0 : sign * offset;
      const primarySupportSlot = layer === 0 ? null : slot === 0 ? 1 : 0;
      placements.push({
        placementId: placementId(prefix, layer, slot),
        colour,
        position: worldPosition(origin, localX, localY, layer, baseYawRad),
        yawRad: layerYawRad,
        supportPlacementId: layer > 0 ? placementId(prefix, layer - 1, primarySupportSlot) : null,
        dependsOnPlacementIds: priorLayer,
        supportSide: slot === 0 ? 'L' : 'R',
        carriedSide: layer > 0 ? (slot === 0 ? 'R' : 'L') : null
      });
    }
  }
  return placements;
}

function validatePlan(placements, { profile, colour, availableColourCounts = null }) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  for (const placement of placements) {
    if (ids.has(placement.placementId)) errors.push(`duplicate placement ${placement.placementId}`);
    ids.add(placement.placementId);
    const position = placement.position;
    if (!position || ![position.xMm, position.yMm, position.zMm].every(Number.isFinite)) {
      errors.push(`non-finite placement ${placement.placementId}`);
      continue;
    }
    if (profile?.buildZone) {
      const halfExtent = BRICK_SPEC.lengthMm / 2;
      if (position.xMm < profile.buildZone.minX + halfExtent || position.xMm > profile.buildZone.maxX - halfExtent
        || position.yMm < profile.buildZone.minY + halfExtent || position.yMm > profile.buildZone.maxY - halfExtent) {
        errors.push(`outside build zone ${placement.placementId}`);
      }
    }
    const tcpZMm = position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm;
    if (profile?.workspace && (tcpZMm < profile.workspace.zMinMm || tcpZMm > profile.workspace.zMaxMm)) {
      errors.push(`outside workspace ${placement.placementId}`);
    }
    for (const dependency of placement.dependsOnPlacementIds ?? []) {
      if (!ids.has(dependency)) errors.push(`forward or unknown dependency ${dependency}`);
    }
    if (placement.supportPlacementId && !ids.has(placement.supportPlacementId)) {
      errors.push(`forward or unknown support ${placement.supportPlacementId}`);
    }
  }
  const available = availableColourCounts && Number.isFinite(availableColourCounts[colour])
    ? Math.max(0, Math.trunc(availableColourCounts[colour]))
    : null;
  const shortfall = available === null ? null : Math.max(0, placements.length - available);
  if (shortfall > 0) warnings.push(`requires ${placements.length} ${colour} bricks; ${available} available`);
  return { errors, warnings, available, shortfall, ready: errors.length === 0 && (shortfall === null || shortfall === 0) };
}

export function createSimpleStructurePlan(spec = {}, options = {}) {
  const structure = String(spec.structure ?? spec.type ?? 'single').toLowerCase();
  const colour = String(spec.colour ?? spec.color ?? 'red').toLowerCase();
  const widthBricks = structure === 'single' ? 1 : integer(spec.widthBricks ?? spec.width, structure === 'wall' ? 3 : 2);
  const heightLayers = structure === 'single' ? 1 : integer(spec.heightLayers ?? spec.height, structure === 'wall' ? 4 : 5);
  const blockCount = spec.blockCount === undefined ? null : integer(spec.blockCount, null);
  const baseTurns = normalizeQuarterTurn(spec.yawDeg ?? 0);
  const profile = options.profile ?? null;
  const origin = spec.origin ? clone(spec.origin) : defaultOrigin(profile, baseTurns ?? 0);
  const errors = [];
  if (!SIMPLE_STRUCTURE_TYPES.includes(structure)) errors.push('unsupported_structure');
  if (!SIMPLE_STRUCTURE_COLOURS.includes(colour)) errors.push('unsupported_colour');
  if (!Number.isInteger(widthBricks) || widthBricks < 1 || widthBricks > 12) errors.push('invalid_width');
  if (!Number.isInteger(heightLayers) || heightLayers < 1 || heightLayers > 20) errors.push('invalid_height');
  if (structure === 'cross_laminated_tower' && widthBricks !== 2) errors.push('tower_width_must_be_two');
  if (baseTurns === null) errors.push('yaw_must_be_quarter_turn');
  if (!origin || ![origin.xMm, origin.yMm, origin.zMm].every(Number.isFinite)) errors.push('invalid_origin');
  const expectedCount = structure === 'single' ? 1
    : structure === 'wall' ? widthBricks * heightLayers
      : widthBricks * heightLayers;
  if (blockCount !== null && blockCount !== expectedCount) errors.push('block_count_mismatch');
  if (expectedCount > 50) errors.push('structure_exceeds_single_mcp_chunk');
  if (errors.length) return { ok: false, reason: 'invalid_structure_spec', errors };

  const canonical = { structure, colour, widthBricks, heightLayers, origin, yawDeg: baseTurns * 90 };
  const planId = `simple-${structure.replaceAll('_', '-')}-${stableHash(canonical)}`;
  const prefix = planId.slice(0, 48);
  const baseYawRad = baseTurns * quarterTurn;
  const placements = structure === 'single'
    ? [{
        placementId: placementId(prefix, 0, 0), colour, position: clone(origin), yawRad: baseYawRad,
        supportPlacementId: null, dependsOnPlacementIds: [], supportSide: 'M', carriedSide: null
      }]
    : structure === 'wall'
      ? wallPlacements({ colour, widthBricks, heightLayers, origin, baseYawRad, prefix })
      : towerPlacements({ colour, heightLayers, origin, baseYawRad, prefix });
  const validation = validatePlan(placements, {
    profile,
    colour,
    availableColourCounts: options.availableColourCounts ?? null
  });
  return {
    ok: validation.errors.length === 0,
    reason: validation.errors.length ? 'invalid_generated_plan' : null,
    planId,
    designChecksum: stableHash({ canonical, placements }),
    structure,
    colour,
    widthBricks,
    heightLayers,
    blockCount: placements.length,
    origin: clone(origin),
    yawDeg: baseTurns * 90,
    placements,
    inventory: {
      required: { [colour]: placements.length },
      available: validation.available === null ? null : { [colour]: validation.available },
      shortfall: validation.shortfall === null ? null : { [colour]: validation.shortfall }
    },
    ready: validation.ready,
    warnings: validation.warnings,
    errors: validation.errors
  };
}

export function toWebMcpPlacements(plan) {
  if (!plan?.ok || !Array.isArray(plan.placements)) return [];
  return plan.placements.map((placement) => ({
    placementId: placement.placementId,
    colour: placement.colour,
    xMm: placement.position.xMm,
    yMm: placement.position.yMm,
    zMm: placement.position.zMm,
    yawDeg: placement.yawRad * 180 / Math.PI,
    ...(placement.supportPlacementId ? { supportPlacementId: placement.supportPlacementId } : {}),
    ...(placement.dependsOnPlacementIds?.length ? { dependsOnPlacementIds: [...placement.dependsOnPlacementIds] } : {}),
    supportSide: placement.supportSide,
    ...(placement.carriedSide ? { carriedSide: placement.carriedSide } : {})
  }));
}
