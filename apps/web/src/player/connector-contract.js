const SIDES = Object.freeze(['L', 'M', 'R']);
const COLUMNS = Object.freeze({ L: [0, 1], M: [1, 2], R: [2, 3] });
const REQUIRED_CARRIED_SIDE = Object.freeze({ L: 'R', M: 'M', R: 'L' });

const cellKey = (cell) => `${cell.ix ?? cell.column},${cell.iy ?? cell.row}`;

export function normalizeConnectorSide(side) {
  const normalized = side === 'CENTER' ? 'M' : side;
  return SIDES.includes(normalized) ? normalized : null;
}

export function connectorCellsForSide(side) {
  const normalized = normalizeConnectorSide(side);
  if (!normalized) return [];
  return COLUMNS[normalized].flatMap((ix) => [0, 1].map((iy) => ({ ix, iy, column: ix, row: iy })));
}

export function requiredCarriedSide(supportSide) {
  const normalized = normalizeConnectorSide(supportSide);
  return normalized ? REQUIRED_CARRIED_SIDE[normalized] : null;
}

export function isCanonicalConnectorPair(supportSide, carriedSide) {
  const lower = normalizeConnectorSide(supportSide);
  const upper = normalizeConnectorSide(carriedSide);
  return Boolean(lower && upper && REQUIRED_CARRIED_SIDE[lower] === upper);
}

export function isParallelYaw(requestedYawRad, supportYawRad, toleranceRad = 1e-6) {
  if (!Number.isFinite(requestedYawRad) || !Number.isFinite(supportYawRad)) return false;
  const period = Math.PI;
  const wrapped = ((requestedYawRad - supportYawRad + period / 2) % period + period) % period - period / 2;
  return Math.abs(wrapped) <= toleranceRad;
}

export function canonicalParallelYaw(supportYawRad) {
  return Number.isFinite(supportYawRad) ? supportYawRad : 0;
}

export function connectorSideForCells(cells) {
  const keys = new Set(cells.map(cellKey));
  if (keys.size !== 4) return null;
  for (const side of SIDES) {
    const expected = connectorCellsForSide(side).map(cellKey);
    if (expected.every((key) => keys.has(key))) return side;
  }
  return null;
}

export function expectedConnectionCells(supportSide, carriedSide) {
  if (!isCanonicalConnectorPair(supportSide, carriedSide)) return null;
  if (normalizeConnectorSide(supportSide) === 'M') {
    const full = [];
    for (let ix = 0; ix < 4; ix += 1) for (let iy = 0; iy < 2; iy += 1) full.push({ ix, iy, column: ix, row: iy });
    return { lower: full, upper: full.map((cell) => ({ ...cell })) };
  }
  return {
    lower: connectorCellsForSide(supportSide),
    upper: connectorCellsForSide(carriedSide)
  };
}

function sameCells(actual, expected) {
  const actualKeys = new Set(actual.map(cellKey));
  const expectedKeys = new Set(expected.map(cellKey));
  return actualKeys.size === expectedKeys.size && [...expectedKeys].every((key) => actualKeys.has(key));
}

export function validateConnectorConnection({
  lowerConnector,
  upperConnector,
  relativeRotationDeg = 0,
  studPairs = []
} = {}) {
  const lower = normalizeConnectorSide(lowerConnector);
  const upper = normalizeConnectorSide(upperConnector);
  if (!lower || !upper) return { valid: false, reason: 'connector_side_invalid' };
  if (!isCanonicalConnectorPair(lower, upper)) {
    return { valid: false, reason: 'connector_pair_mismatch', expectedUpperConnector: requiredCarriedSide(lower) };
  }
  const rotation = Number(relativeRotationDeg);
  const parallelRotation = Number.isFinite(rotation) && Math.abs(((rotation % 180) + 180) % 180) <= 1e-6;
  if (!parallelRotation) return { valid: false, reason: 'perpendicular_connection_forbidden' };
  const expected = expectedConnectionCells(lower, upper);
  if (!Array.isArray(studPairs) || studPairs.length !== expected.lower.length) {
    return { valid: false, reason: 'connector_stud_count_mismatch', expectedStudCount: expected.lower.length };
  }
  if (!sameCells(studPairs.map((pair) => pair.lower), expected.lower)
    || !sameCells(studPairs.map((pair) => pair.upper), expected.upper)) {
    return { valid: false, reason: 'connector_stud_pattern_mismatch' };
  }
  return {
    valid: true,
    reason: null,
    lowerConnector: lower,
    upperConnector: upper,
    studCount: studPairs.length,
    relativeRotationDeg: 0
  };
}

export { SIDES as CONNECTION_SIDES };
