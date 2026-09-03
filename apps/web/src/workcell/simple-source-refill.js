import { makeReachableV8Spawn } from '../player/v8-spawn.js';

const TERMINAL = new Set(['COMPLETED', 'ADOPTED', 'CANCELLED']);
const PALETTE = ['red', 'blue', 'yellow', 'green', 'orange', 'white', 'black', 'purple', 'teal'];
const loose = brick => !brick.heldBy && !brick.snapped && !brick.placedTargetId && !brick.placementType;

export function readSimpleInventory(controller) {
  const bricks = controller.getBricks(), availableByColour = {};
  for (const brick of bricks.filter(loose)) availableByColour[brick.colour] = (availableByColour[brick.colour] ?? 0) + 1;
  return { total: bricks.length, available: Object.values(availableByColour).reduce((sum, n) => sum + n, 0), availableByColour };
}

// Shared dispenser rule: both a Human press and a Robot contact use the same
// pending-plan demand. This supplies real sources, never accepted targets.
function requestedRefillColours(colourDemand, availableByColour, count) {
  if (colourDemand === undefined || colourDemand === null) return [];
  if (typeof colourDemand !== 'object' || Array.isArray(colourDemand)) return null;
  const deficits = {};
  for (const colour of PALETTE) {
    const target = colourDemand[colour];
    if (target === undefined) continue;
    if (!Number.isSafeInteger(target) || target < 0 || target > 5000) return null;
    deficits[colour] = Math.max(0, target - (availableByColour[colour] ?? 0));
  }
  if (Object.keys(colourDemand).some(colour => !PALETTE.includes(colour))) return null;
  const requested = [];
  while (requested.length < count && PALETTE.some(colour => (deficits[colour] ?? 0) > 0)) {
    for (const colour of PALETTE) {
      if (requested.length >= count) break;
      if ((deficits[colour] ?? 0) <= 0) continue;
      requested.push(colour);
      deficits[colour]--;
    }
  }
  return requested;
}

export function simpleRefillColours(entries, availableByColour, count = 16, colourDemand = null) {
  const remaining = { ...availableByColour }, demand = [];
  for (const entry of entries ?? []) {
    if (TERMINAL.has(entry.status)) continue;
    const request = entry.request ?? entry;
    const colour = request.colour ?? request.preferredColour;
    if (!PALETTE.includes(colour)) continue;
    if ((remaining[colour] ?? 0) > 0) remaining[colour]--;
    else if (demand.length < count) demand.push(colour);
  }
  const requested = requestedRefillColours(colourDemand, availableByColour, count);
  if (requested === null) return null;
  if (requested.length) {
    const planCounts = Object.fromEntries(PALETTE.map(colour => [colour, demand.filter(value => value === colour).length]));
    const requestedCounts = Object.fromEntries(PALETTE.map(colour => [colour, requested.filter(value => value === colour).length]));
    demand.length = 0;
    const mergedCounts = Object.fromEntries(PALETTE.map(colour => [colour, Math.max(planCounts[colour], requestedCounts[colour])]));
    while (demand.length < count && PALETTE.some(colour => mergedCounts[colour] > 0)) {
      for (const colour of PALETTE) {
        if (demand.length >= count) break;
        if (mergedCounts[colour] <= 0) continue;
        demand.push(colour);
        mergedCounts[colour]--;
      }
    }
  }
  // With no outstanding deficit the dispenser remains useful without a plan.
  while (demand.length < count) demand.push(demand.length % 2 ? 'blue' : 'red');
  return demand;
}

export function createSimpleSourceRefill({ controller, coordinator, settings, profile, onSpawn = () => {}, getExclusions = () => [] }) {
  let burst = 0;
  return ({ actor = 'human', operationToken = null, expectedWorldRevision = controller.worldRevision, colourDemand = null } = {}) => {
    if (expectedWorldRevision !== controller.worldRevision) return { ok: false, reason: 'stale_state', worldRevision: controller.worldRevision };
    if (controller.operationBlocked(operationToken) || controller.operationState !== 'idle' || controller.pendingMoveCount || controller.heldBrickId) {
      return { ok: false, reason: 'operation_in_progress', worldRevision: controller.worldRevision };
    }
    const before = readSimpleInventory(controller), occupied = controller.getBricks();
    const colours = simpleRefillColours(coordinator?.stream?.entries, before.availableByColour, 16, colourDemand);
    if (!colours) return { ok: false, reason: 'invalid_input', inventoryBefore: before, worldRevision: controller.worldRevision };
    // Keep stable unique IDs even after human edits/reset; no ID recolouring.
    const idPrefix = `simple-refill-${++burst}`;
    let generated;
    for (const count of [16, 12, 8, 4, 2, 1]) {
      generated = makeReachableV8Spawn(settings, profile, {
        idPrefix, startIndex: occupied.length, count, occupied,
        colours: colours.slice(0, count), yawRad: 0,
        excludedCircles: getExclusions(),
        seed: (settings.seed ^ (burst * 0x9e3779b9)) >>> 0
      });
      if (generated.ok) break;
    }
    if (!generated.ok) return { ok: false, reason: 'supply_area_full', inventoryBefore: before, worldRevision: controller.worldRevision };
    // Simple sources are delivered settled to checked reachable feeder poses;
    // no flying/tossed sources race the active planner or pickup capture.
    const result = controller.addLooseBricks(generated.records, { actor, operationToken });
    if (!result.ok) return result;
    onSpawn(result.bricks);
    return { ok: true, action: 'more_bricks', count: result.count, spawnedIds: result.bricks.map(b => b.id),
      inventoryBefore: before, inventoryAfter: readSimpleInventory(controller), worldRevision: controller.worldRevision };
  };
}
