import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { DEFAULT_PALETTE, DEFAULT_PALETTE_ID } from './palette.js';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function makeBlueprintId(payload) {
  return `bp_${fnv1a32(stableStringify(payload)).toString(16).padStart(8, '0')}`;
}

export function mapTargetToWorld({ row, col, rows, cols, origin, logicalCellMm = BRICK_SPEC.logicalCellMm }) {
  const boardWidthMm = cols * logicalCellMm;
  const boardHeightMm = rows * logicalCellMm;
  return {
    worldXmm: origin.xMm + (col + 1) * logicalCellMm,
    worldYmm: origin.yMm + (rows - row - 0.5) * logicalCellMm,
    worldZmm: origin.zMm + BRICK_SPEC.heightMm / 2,
    boardWidthMm,
    boardHeightMm
  };
}

export function createBlueprint({
  compilerVersion,
  source,
  rows,
  cols,
  sampledTargets,
  brickBudget,
  fitMode,
  seed,
  palette = DEFAULT_PALETTE,
  paletteId = DEFAULT_PALETTE_ID,
  boardOrigin = null
}) {
  if (cols % 2 !== 0) throw new Error('grid_width_must_be_even');
  const logicalCellMm = BRICK_SPEC.logicalCellMm;
  const widthMm = cols * logicalCellMm;
  const heightMm = rows * logicalCellMm;
  const origin = boardOrigin ?? { xMm: -widthMm / 2, yMm: -heightMm / 2, zMm: 0 };
  const allowed = new Set(palette.map((item) => item.id));
  const colourCounts = {};
  const occupiedCells = new Set();
  const targets = sampledTargets.map((target) => {
    const row = target.row;
    const col = target.col;
    const cellA = `${row}:${col}`;
    const cellB = `${row}:${col + 1}`;
    if (row < 0 || row >= rows || col < 0 || col + 1 >= cols) throw new Error('target_outside_grid');
    if (occupiedCells.has(cellA) || occupiedCells.has(cellB)) throw new Error('target_overlap');
    if (!allowed.has(target.colour)) throw new Error(`invalid_colour:${target.colour}`);
    occupiedCells.add(cellA);
    occupiedCells.add(cellB);
    colourCounts[target.colour] = (colourCounts[target.colour] ?? 0) + 1;
    const world = mapTargetToWorld({ row, col, rows, cols, origin, logicalCellMm });
    return Object.freeze({
      targetId: `t_r${String(row).padStart(2, '0')}_c${String(col).padStart(2, '0')}`,
      colour: target.colour,
      gridRow: row,
      gridCol: col,
      cells: Object.freeze([[row, col], [row, col + 1]]),
      worldXmm: world.worldXmm,
      worldYmm: world.worldYmm,
      worldZmm: world.worldZmm,
      yawDeg: 0,
      coverage: target.coverage,
      colourError: target.colourError
    });
  });
  if (targets.length > brickBudget) throw new Error('brick_budget_exceeded');
  const core = {
    compilerVersion,
    source: { widthPx: source.widthPx, heightPx: source.heightPx, fitMode },
    grid: { rows, cols, logicalCellMm },
    paletteId,
    brickCount: targets.length,
    targets,
    colourCounts,
    board: { origin, widthMm, heightMm },
    settings: { brickBudget, backgroundMode: 'alpha', seed }
  };
  const blueprintId = makeBlueprintId(core);
  return Object.freeze({ blueprintId, ...core });
}

export function validateBlueprint(blueprint, palette = DEFAULT_PALETTE) {
  const errors = [];
  const allowed = new Set(palette.map((item) => item.id));
  if (!blueprint || typeof blueprint !== 'object') return { ok: false, errors: ['missing_blueprint'] };
  if (blueprint.grid.cols % 2 !== 0) errors.push('grid_width_not_even');
  if (blueprint.brickCount !== blueprint.targets.length) errors.push('brick_count_mismatch');
  if (blueprint.brickCount > blueprint.settings.brickBudget) errors.push('brick_budget_exceeded');
  const cells = new Set();
  const ids = new Set();
  for (const target of blueprint.targets) {
    if (ids.has(target.targetId)) errors.push(`duplicate_target_id:${target.targetId}`);
    ids.add(target.targetId);
    if (!allowed.has(target.colour)) errors.push(`invalid_colour:${target.targetId}`);
    if (target.yawDeg !== 0) errors.push(`noncanonical_yaw:${target.targetId}`);
    if (!Number.isFinite(target.worldXmm) || !Number.isFinite(target.worldYmm) || !Number.isFinite(target.worldZmm)) errors.push(`nonfinite_world:${target.targetId}`);
    if (!Array.isArray(target.cells) || target.cells.length !== 2) errors.push(`cell_count:${target.targetId}`);
    if (target.cells?.length === 2) {
      const [[r0, c0], [r1, c1]] = target.cells;
      if (r0 !== r1 || c1 !== c0 + 1) errors.push(`cells_not_horizontal:${target.targetId}`);
      for (const [row, col] of target.cells) {
        if (row < 0 || row >= blueprint.grid.rows || col < 0 || col >= blueprint.grid.cols) errors.push(`cell_outside:${target.targetId}`);
        const key = `${row}:${col}`;
        if (cells.has(key)) errors.push(`overlap:${target.targetId}`);
        cells.add(key);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
