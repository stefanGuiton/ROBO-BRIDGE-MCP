const CONNECTOR_COLUMNS = Object.freeze({
  L: Object.freeze([0, 1]),
  M: Object.freeze([1, 2]),
  R: Object.freeze([2, 3])
});

function normalizeSide(side) {
  return side === 'CENTER' ? 'M' : side;
}

export class ConnectionGraph {
  constructor() {
    this.edges = [];
    this.matRoots = new Set();
    this.topOccupancy = new Map();
    this.bottomOccupancy = new Map();
    this.sequence = 0;
  }

  clear() {
    this.edges = [];
    this.matRoots.clear();
    this.topOccupancy.clear();
    this.bottomOccupancy.clear();
    this.sequence = 0;
  }

  connectorCells(side) {
    const columns = CONNECTOR_COLUMNS[normalizeSide(side)] ?? CONNECTOR_COLUMNS.M;
    return columns.flatMap((column) => [0, 1].map((row) => ({ column, row })));
  }

  occupancyKey(brickId, face, column, row) {
    return `${brickId}:${face}:${column},${row}`;
  }

  isConnectorFree(brickId, face, side) {
    const occupancy = face === 'top' ? this.topOccupancy : this.bottomOccupancy;
    const token = face === 'top' ? 'T' : 'B';
    return this.connectorCells(side).every(({ column, row }) => (
      !occupancy.has(this.occupancyKey(brickId, token, column, row))
    ));
  }

  addConnection({
    lowerBrickId,
    lowerConnector,
    upperBrickId,
    upperConnector,
    relativeRotationDeg = 0,
    studPairs = null
  }) {
    const lowerSide = normalizeSide(lowerConnector);
    const upperSide = normalizeSide(upperConnector);
    if (!this.isConnectorFree(lowerBrickId, 'top', lowerSide)
      || !this.isConnectorFree(upperBrickId, 'bottom', upperSide)) return false;
    const lowerCells = this.connectorCells(lowerSide);
    const upperCells = this.connectorCells(upperSide);
    const pairs = studPairs ?? lowerCells.map((lower, index) => ({ lower, upper: upperCells[index] }));
    const edge = {
      lowerBrickId,
      lowerConnector: lowerSide,
      upperBrickId,
      upperConnector: upperSide,
      relativeRotationDeg,
      studPairs: structuredClone(pairs),
      studCount: pairs.length,
      creationSequence: ++this.sequence
    };
    this.edges.push(edge);
    for (const pair of pairs) {
      this.topOccupancy.set(
        this.occupancyKey(lowerBrickId, 'T', pair.lower.column, pair.lower.row),
        edge
      );
      this.bottomOccupancy.set(
        this.occupancyKey(upperBrickId, 'B', pair.upper.column, pair.upper.row),
        edge
      );
    }
    return true;
  }

  registerPlacement(brickId, placement) {
    if (placement?.placementType === 'mat' || placement?.placementType === 'blueprint-target') {
      this.matRoots.add(brickId);
    }
    if (placement?.connection) {
      this.addConnection({ upperBrickId: brickId, ...placement.connection });
    }
  }

  removeBrick(brickId) {
    this.matRoots.delete(brickId);
    const before = this.edges.length;
    this.edges = this.edges.filter((edge) => edge.lowerBrickId !== brickId && edge.upperBrickId !== brickId);
    if (this.edges.length !== before) this.rebuildOccupancy();
    return before - this.edges.length;
  }

  rebuildOccupancy() {
    this.topOccupancy.clear();
    this.bottomOccupancy.clear();
    for (const edge of this.edges) {
      for (const pair of edge.studPairs) {
        this.topOccupancy.set(
          this.occupancyKey(edge.lowerBrickId, 'T', pair.lower.column, pair.lower.row),
          edge
        );
        this.bottomOccupancy.set(
          this.occupancyKey(edge.upperBrickId, 'B', pair.upper.column, pair.upper.row),
          edge
        );
      }
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
    for (let index = 0; index < queue.length; index += 1) {
      for (const child of children.get(queue[index]) ?? []) {
        if (!supported.has(child)) {
          supported.add(child);
          queue.push(child);
        }
      }
    }
    return supported;
  }

  validate() {
    const errors = [];
    const top = new Set();
    const bottom = new Set();
    for (const edge of this.edges) {
      for (const pair of edge.studPairs) {
        const topKey = this.occupancyKey(edge.lowerBrickId, 'T', pair.lower.column, pair.lower.row);
        const bottomKey = this.occupancyKey(edge.upperBrickId, 'B', pair.upper.column, pair.upper.row);
        if (top.has(topKey)) errors.push(`duplicate top ${topKey}`);
        if (bottom.has(bottomKey)) errors.push(`duplicate bottom ${bottomKey}`);
        top.add(topKey);
        bottom.add(bottomKey);
      }
    }
    return { pass: errors.length === 0, errors, edges: this.edges.length, matRoots: this.matRoots.size };
  }

  snapshot() {
    return {
      derived: true,
      edges: structuredClone(this.edges),
      matRoots: [...this.matRoots],
      supportedIds: [...this.supportedIds()],
      validation: this.validate()
    };
  }
}
