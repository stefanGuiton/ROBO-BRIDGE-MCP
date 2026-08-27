import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { createBlueprint } from './blueprint.js';
import { CHALLENGE_LAYOUT, CHALLENGE_WORKSPACE } from '../robot/ur10-definition.js';

export function challengeBoardLimits(layout = CHALLENGE_LAYOUT) {
  return {
    maxWidthMm: layout.board.maxX - layout.board.minX - 12,
    maxHeightMm: layout.board.maxY - layout.board.minY - 12
  };
}

export function challengeBoardOrigin({ rows, cols }, layout = CHALLENGE_LAYOUT) {
  const widthMm = cols * BRICK_SPEC.logicalCellMm;
  const heightMm = rows * BRICK_SPEC.logicalCellMm;
  return {
    xMm: (layout.board.minX + layout.board.maxX - widthMm) / 2,
    yMm: (layout.board.minY + layout.board.maxY - heightMm) / 2,
    zMm: layout.board.surfaceZ
  };
}

export function remapBlueprintToChallenge(blueprint, layout = CHALLENGE_LAYOUT) {
  const origin = challengeBoardOrigin(blueprint.grid, layout);
  const sampledTargets = blueprint.targets.map((target) => ({
    row: target.gridRow,
    col: target.gridCol,
    coverage: target.coverage,
    colourError: target.colourError,
    colour: target.colour
  }));
  const mapped = createBlueprint({
    compilerVersion: blueprint.compilerVersion,
    source: { widthPx: blueprint.source.widthPx, heightPx: blueprint.source.heightPx },
    rows: blueprint.grid.rows,
    cols: blueprint.grid.cols,
    sampledTargets,
    brickBudget: blueprint.settings.brickBudget,
    fitMode: blueprint.source.fitMode,
    seed: blueprint.settings.seed,
    paletteId: blueprint.paletteId,
    boardOrigin: origin
  });
  validateBlueprintReachability(mapped, layout);
  return mapped;
}

export function validateBlueprintReachability(blueprint, layout = CHALLENGE_LAYOUT, workspace = CHALLENGE_WORKSPACE) {
  const failures = [];
  for (const target of blueprint.targets) {
    const tcp = { xMm: target.worldXmm, yMm: target.worldYmm, zMm: target.worldZmm + BRICK_SPEC.capture.tcpAboveCentreMm };
    const insideBoard = target.worldXmm >= layout.board.minX && target.worldXmm <= layout.board.maxX && target.worldYmm >= layout.board.minY && target.worldYmm <= layout.board.maxY;
    const insideWorkspace = tcp.xMm >= workspace.xMinMm && tcp.xMm <= workspace.xMaxMm && tcp.yMm >= workspace.yMinMm && tcp.yMm <= workspace.yMaxMm && tcp.zMm >= workspace.zMinMm && tcp.zMm <= workspace.zMaxMm;
    if (!insideBoard || !insideWorkspace) failures.push({ targetId: target.targetId, insideBoard, insideWorkspace, tcp });
  }
  if (failures.length) throw new Error(`blueprint_not_reachable:${JSON.stringify(failures.slice(0, 3))}`);
  return { ok: true, targetCount: blueprint.targets.length };
}

export function createChallengeInventory(blueprint, layout = CHALLENGE_LAYOUT) {
  const counts = new Map();
  for (const target of blueprint.targets) counts.set(target.colour, (counts.get(target.colour) ?? 0) + 1);
  const colours = [...counts.keys()].sort();
  const minX = layout.tray.minX + 22;
  const maxX = layout.tray.maxX - 22;
  const minY = layout.tray.minY + 22;
  const maxY = layout.tray.maxY - 22;
  const positions = [];
  for (let y = minY; y <= maxY + 1e-9; y += 24) {
    for (let x = minX; x <= maxX + 1e-9; x += 38) positions.push({ xMm: x, yMm: y });
  }
  if (positions.length < blueprint.brickCount) throw new Error(`inventory_exceeds_tray_capacity:${blueprint.brickCount}/${positions.length}`);
  const items = [];
  let index = 0;
  for (const colour of colours) {
    for (let i = 0; i < counts.get(colour); i += 1) {
      const pos = positions[index];
      items.push({
        id: `brick-${String(index + 1).padStart(3, '0')}-${colour}`,
        colour,
        position: { xMm: pos.xMm, yMm: pos.yMm, zMm: layout.tray.floorZ + BRICK_SPEC.heightMm / 2 },
        yawRad: 0,
        heldBy: null,
        placedTargetId: null,
        snapped: false,
        graspable: true
      });
      index += 1;
    }
  }
  return items;
}

export function challengeInventoryHasNoOverlap(items, toleranceMm = 0) {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i].position;
      const b = items[j].position;
      if (Math.abs(a.xMm - b.xMm) < BRICK_SPEC.lengthMm + toleranceMm &&
          Math.abs(a.yMm - b.yMm) < BRICK_SPEC.widthMm + toleranceMm) return false;
    }
  }
  return true;
}
