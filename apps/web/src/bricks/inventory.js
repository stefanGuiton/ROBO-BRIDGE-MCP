import { BRICK_SPEC } from './brick-spec.js';

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function countRequiredByColour(blueprint) {
  const counts = {};
  for (const target of blueprint.targets) counts[target.colour] = (counts[target.colour] ?? 0) + 1;
  return counts;
}

export function inventoryHasNoOverlap(items, toleranceMm = 0) {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i].spawnPose;
      const b = items[j].spawnPose;
      if (Math.abs(a.xMm - b.xMm) < BRICK_SPEC.lengthMm + toleranceMm &&
          Math.abs(a.yMm - b.yMm) < BRICK_SPEC.widthMm + toleranceMm) return false;
    }
  }
  return true;
}

export function createInventory(blueprint, options = {}) {
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) : blueprint.settings.seed;
  const rng = mulberry32(seed);
  const required = countRequiredByColour(blueprint);
  if (!options.trayOrigin || ![options.trayOrigin.xMm, options.trayOrigin.yMm, options.trayOrigin.zMm].every(Number.isFinite)) throw new Error('tray_origin_required');
  const trayOrigin = options.trayOrigin;
  const spacingX = options.spacingX ?? 38;
  const spacingY = options.spacingY ?? 22;
  const columns = Math.max(1, Math.trunc(options.columns ?? 10));
  const jitterMm = Math.min(2, Math.max(0, options.jitterMm ?? 1.5));
  const items = [];
  let index = 0;
  for (const colour of Object.keys(required).sort()) {
    for (let count = 0; count < required[colour]; count += 1) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const jitterX = (rng() * 2 - 1) * jitterMm;
      const jitterY = (rng() * 2 - 1) * jitterMm;
      items.push(Object.freeze({
        brickId: `b_${String(index).padStart(3, '0')}_${colour}`,
        colour,
        type: BRICK_SPEC.type,
        spawnPose: Object.freeze({
          xMm: trayOrigin.xMm + col * spacingX + jitterX,
          yMm: trayOrigin.yMm + row * spacingY + jitterY,
          zMm: trayOrigin.zMm
        }),
        yawDeg: BRICK_SPEC.canonicalYawDeg,
        sourceTray: options.sourceTray ?? 'main'
      }));
      index += 1;
    }
  }
  if (!inventoryHasNoOverlap(items)) throw new Error('inventory_spawn_overlap');
  return Object.freeze({ seed, coordinateFrame: options.coordinateFrame ?? 'caller-supplied-mm', items: Object.freeze(items), required: Object.freeze(required), decoyCount: 0 });
}
