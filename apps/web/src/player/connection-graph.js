import {
  CONNECTION_SIDES,
  connectorCellsForSide,
  expectedConnectionCells,
  normalizeConnectorSide,
  validateConnectorConnection
} from './connector-contract.js';

function rotate2(x, y, yawRad) {
  const cosine = Math.cos(yawRad);
  const sine = Math.sin(yawRad);
  return { x: cosine * x - sine * y, y: sine * x + cosine * y };
}

function normalizeCell(cell) { return { ix: cell.ix ?? cell.column, iy: cell.iy ?? cell.row }; }

export class ConnectionGraph {
  constructor(settings = {}) {
    this.settings = { studPitchMm: 8, brickBodyHeightMm: 9.6, connectionSpatialCellMm: 32, ...settings };
    this.edges = [];
    this.matRoots = new Set();
    this.matOccupancy = new Map();
    this.matCellsByBrick = new Map();
    this.topOccupancy = new Map();
    this.bottomOccupancy = new Map();
    this.spatial = new Map();
    this.sequence = 0;
  }

  clear() {
    this.edges = [];
    this.matRoots.clear();
    this.matOccupancy.clear();
    this.matCellsByBrick.clear();
    this.topOccupancy.clear();
    this.bottomOccupancy.clear();
    this.spatial.clear();
    this.sequence = 0;
  }

  connectorCells(side) {
    return connectorCellsForSide(side);
  }

  studLocal(ix, iy, top = true) {
    const pitch = this.settings.studPitchMm;
    return { x: (ix - 1.5) * pitch, y: (iy - 0.5) * pitch, z: (top ? 1 : -1) * this.settings.brickBodyHeightMm / 2 };
  }

  connectorLocal(side, top = true) {
    const normalized = normalizeConnectorSide(side) ?? 'M';
    return {
      x: normalized === 'L' ? -this.settings.studPitchMm : normalized === 'R' ? this.settings.studPitchMm : 0,
      y: 0,
      z: (top ? 1 : -1) * this.settings.brickBodyHeightMm / 2
    };
  }

  localToWorld(brick, local) {
    const rotated = rotate2(local.x, local.y, brick.yawRad ?? 0);
    return { xMm: brick.position.xMm + rotated.x, yMm: brick.position.yMm + rotated.y, zMm: brick.position.zMm + local.z };
  }

  connectorWorld(brick, side, top = true) { return this.localToWorld(brick, this.connectorLocal(side, top)); }
  studWorld(brick, ix, iy, top = true) { return this.localToWorld(brick, this.studLocal(ix, iy, top)); }
  occupancyKey(brickId, face, ix, iy) { return `${brickId}:${face}:${ix},${iy}`; }
  matKey(ix, iy) { return `${ix},${iy}`; }
  isTopStudFree(brickId, ix, iy) { return !this.topOccupancy.has(this.occupancyKey(brickId, 'T', ix, iy)); }
  isBottomStudFree(brickId, ix, iy) { return !this.bottomOccupancy.has(this.occupancyKey(brickId, 'B', ix, iy)); }
  isConnectorFree(brickId, face, side) {
    return this.connectorCells(side).every(({ ix, iy }) => face === 'top'
      ? this.isTopStudFree(brickId, ix, iy)
      : this.isBottomStudFree(brickId, ix, iy));
  }
  matOwner(ix, iy) { return this.matOccupancy.get(this.matKey(ix, iy)) ?? null; }

  registerMatRoot(brickId, cells = []) {
    this.matRoots.add(brickId);
    const normalized = cells.map(([ix, iy]) => [ix, iy]);
    this.matCellsByBrick.set(brickId, normalized);
    for (const [ix, iy] of normalized) this.matOccupancy.set(this.matKey(ix, iy), brickId);
  }

  addConnection({ lowerBrickId, lowerConnector, upperBrickId, upperConnector, relativeRotationDeg = 0, relativeRotation = null, studPairs = null }) {
    const lowerSide = normalizeConnectorSide(lowerConnector);
    const upperSide = normalizeConnectorSide(upperConnector);
    const rotation = relativeRotation ?? relativeRotationDeg;
    const expected = expectedConnectionCells(lowerSide, upperSide, rotation);
    if (!expected) return false;
    const lowerCells = expected.lower;
    const upperCells = expected.upper;
    const pairs = (studPairs?.length ? studPairs : lowerCells.map((lower, index) => ({ lower, upper: upperCells[index] })))
      .map((pair) => ({ lower: normalizeCell(pair.lower), upper: normalizeCell(pair.upper) }));
    const contract = validateConnectorConnection({
      lowerConnector: lowerSide,
      upperConnector: upperSide,
      relativeRotationDeg: rotation,
      studPairs: pairs
    });
    if (!contract.valid) return false;
    if (!pairs.length || pairs.some((pair) => !this.isTopStudFree(lowerBrickId, pair.lower.ix, pair.lower.iy)
      || !this.isBottomStudFree(upperBrickId, pair.upper.ix, pair.upper.iy))) return false;
    const edge = {
      lowerBrickId, lowerConnector: lowerSide, upperBrickId, upperConnector: upperSide,
      relativeRotationDeg: contract.relativeRotationDeg,
      studPairs: pairs, studCount: pairs.length, creationSequence: ++this.sequence
    };
    this.edges.push(edge);
    for (const pair of pairs) {
      this.topOccupancy.set(this.occupancyKey(lowerBrickId, 'T', pair.lower.ix, pair.lower.iy), edge);
      this.bottomOccupancy.set(this.occupancyKey(upperBrickId, 'B', pair.upper.ix, pair.upper.iy), edge);
    }
    return true;
  }

  addConnections(upperBrickId, connections = []) {
    let added = 0;
    for (const connection of connections) if (this.addConnection({ ...connection, upperBrickId })) added += 1;
    return added;
  }

  registerPlacement(brickId, placement = {}) {
    if (placement.placementType === 'mat' || placement.placementType === 'blueprint-target') this.registerMatRoot(brickId, placement.cells ?? []);
    const connections = placement.connections ?? placement.connection?.groups ?? (placement.connection ? [placement.connection] : []);
    this.addConnections(brickId, connections);
  }

  connectionsFor(brickId) { return this.edges.filter((edge) => edge.lowerBrickId === brickId || edge.upperBrickId === brickId); }

  upperBrickIdsFor(brickId) {
    return [...new Set(this.edges
      .filter((edge) => edge.lowerBrickId === brickId)
      .map((edge) => edge.upperBrickId))];
  }

  isTopmost(brickId) { return this.upperBrickIdsFor(brickId).length === 0; }

  removeBrick(brickOrId) {
    const brickId = typeof brickOrId === 'object' ? brickOrId.id : brickOrId;
    this.matRoots.delete(brickId);
    for (const [ix, iy] of this.matCellsByBrick.get(brickId) ?? []) this.matOccupancy.delete(this.matKey(ix, iy));
    this.matCellsByBrick.delete(brickId);
    const before = this.edges.length;
    this.edges = this.edges.filter((edge) => edge.lowerBrickId !== brickId && edge.upperBrickId !== brickId);
    if (this.edges.length !== before) this.rebuildOccupancy();
    return before - this.edges.length;
  }

  rebuildOccupancy() {
    this.topOccupancy.clear();
    this.bottomOccupancy.clear();
    for (const edge of this.edges) for (const pair of edge.studPairs) {
      this.topOccupancy.set(this.occupancyKey(edge.lowerBrickId, 'T', pair.lower.ix, pair.lower.iy), edge);
      this.bottomOccupancy.set(this.occupancyKey(edge.upperBrickId, 'B', pair.upper.ix, pair.upper.iy), edge);
    }
  }

  supportedIds() {
    const supported = new Set(this.matRoots);
    const children = new Map();
    for (const edge of this.edges) {
      if (!children.has(edge.lowerBrickId)) children.set(edge.lowerBrickId, []);
      children.get(edge.lowerBrickId).push(edge.upperBrickId);
    }
    const queue = [...supported];
    for (let index = 0; index < queue.length; index += 1) for (const child of children.get(queue[index]) ?? []) {
      if (!supported.has(child)) { supported.add(child); queue.push(child); }
    }
    return supported;
  }

  rebuildSpatial(bricks) {
    this.spatial.clear();
    const cellSize = Math.max(8, Number(this.settings.connectionSpatialCellMm) || 32);
    for (const brick of bricks) for (let ix = 0; ix < 4; ix += 1) for (let iy = 0; iy < 2; iy += 1) {
      if (!this.isTopStudFree(brick.id, ix, iy)) continue;
      const position = this.studWorld(brick, ix, iy, true);
      const key = `${Math.floor(position.xMm / cellSize)},${Math.floor(position.yMm / cellSize)},${Math.floor(position.zMm / cellSize)}`;
      if (!this.spatial.has(key)) this.spatial.set(key, []);
      this.spatial.get(key).push({ brick, ix, iy, position });
    }
  }

  findFreeTopStudAt(position, toleranceMm = 0.08, excludeBrickId = null) {
    const cellSize = Math.max(8, Number(this.settings.connectionSpatialCellMm) || 32);
    const ix = Math.floor(position.xMm / cellSize), iy = Math.floor(position.yMm / cellSize), iz = Math.floor(position.zMm / cellSize);
    let best = null, bestDistance = toleranceMm ** 2;
    for (let dz = -1; dz <= 1; dz += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      for (const candidate of this.spatial.get(`${ix + dx},${iy + dy},${iz + dz}`) ?? []) {
        if (candidate.brick.id === excludeBrickId) continue;
        const distance = (candidate.position.xMm - position.xMm) ** 2 + (candidate.position.yMm - position.yMm) ** 2 + (candidate.position.zMm - position.zMm) ** 2;
        if (distance <= bestDistance) { bestDistance = distance; best = candidate; }
      }
    }
    return best;
  }

  validate() {
    const errors = [], top = new Set(), bottom = new Set();
    for (const edge of this.edges) for (const pair of edge.studPairs) {
      const topKey = this.occupancyKey(edge.lowerBrickId, 'T', pair.lower.ix, pair.lower.iy);
      const bottomKey = this.occupancyKey(edge.upperBrickId, 'B', pair.upper.ix, pair.upper.iy);
      if (top.has(topKey)) errors.push(`duplicate top ${topKey}`);
      if (bottom.has(bottomKey)) errors.push(`duplicate bottom ${bottomKey}`);
      top.add(topKey); bottom.add(bottomKey);
    }
    return { pass: errors.length === 0, errors, edges: this.edges.length, matRoots: this.matRoots.size, topStuds: top.size, bottomStuds: bottom.size };
  }

  snapshot() {
    return {
      derived: true, edges: structuredClone(this.edges), matRoots: [...this.matRoots],
      topOccupied: [...this.topOccupancy.keys()], bottomOccupied: [...this.bottomOccupancy.keys()],
      supportedIds: [...this.supportedIds()], validation: this.validate()
    };
  }
}

export { CONNECTION_SIDES };
