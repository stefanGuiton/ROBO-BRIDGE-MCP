import { createCatalogue, catalogueByType, DEFAULT_SETTINGS } from "./catalogue.js";
import { normalizeBridgeGraph } from "./normalize.js";

const PHASES = Object.freeze({
  foundation: 0,
  pier: 1,
  lower: 2,
  deck: 3,
  web: 4,
  upper: 5,
  rail: 6,
  cable: 7,
});

const ROLE_COLOURS = Object.freeze({
  foundation: "#475569",
  pier: "#d97706",
  lower: "#2563eb",
  deck: "#64748b",
  web: "#0f766e",
  upper: "#7c3aed",
  rail: "#dc2626",
  cable: "#374151",
});

function stableCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function cellKey(x, y, z) {
  return `${x},${y},${z}`;
}

function rasterLine(a, b) {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  if (steps === 0) return [{ x: a.x, y: a.y }];
  const output = [];
  const seen = new Set();
  for (let step = 0; step <= steps; step += 1) {
    const point = {
      x: Math.round(a.x + ((b.x - a.x) * step) / steps),
      y: Math.round(a.y + ((b.y - a.y) * step) / steps),
    };
    const key = `${point.x},${point.y}`;
    if (!seen.has(key)) {
      output.push(point);
      seen.add(key);
    }
  }
  return output;
}

function inferDeckY(graph) {
  const deckNodes = graph.nodes.filter((node) => ["deck", "support"].includes(node.role));
  const values = (deckNodes.length ? deckNodes : graph.nodes).map((node) => node.position.y).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function memberPhase(member, byNode, deckY) {
  const role = member.role.toLowerCase();
  const meanY = (byNode.get(member.a).position.y + byNode.get(member.b).position.y) / 2;
  if (role.includes("pier") || role.includes("tower") || role.includes("foundation")) return role.includes("foundation") ? "foundation" : "pier";
  if (role.includes("deck")) return "deck";
  if (role.includes("rail")) return "rail";
  if (role.includes("vertical") || role.includes("diagonal") || role.includes("arch")) return "web";
  if (role.includes("chord")) return meanY > deckY + 2 ? "upper" : "lower";
  return meanY > deckY + 2 ? "upper" : "lower";
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deterministicChecksum(value) {
  const text = canonicalJson(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createOccupancy(graph, settings) {
  const byNode = new Map(graph.nodes.map((node) => [node.id, node]));
  const deckY = inferDeckY(graph);
  const minX = Math.min(...graph.nodes.map((node) => node.position.x));
  const maxX = Math.max(...graph.nodes.map((node) => node.position.x));
  const sideCenters = [-settings.sideOffsetStuds, settings.sideOffsetStuds];
  const sideZ = sideCenters.flatMap((centre) => Array.from({ length: settings.sideThicknessStuds }, (_, index) => centre + index));
  const clearance = {
    min: { x: minX, y: deckY + 2, z: -Math.floor(settings.clearanceWidthStuds / 2) },
    max: { x: maxX, y: deckY + 1 + settings.clearanceHeightLayers, z: Math.ceil(settings.clearanceWidthStuds / 2) - 1 },
  };
  const cells = new Map();
  const rejected = [];
  const sourceMemberCells = new Map(graph.members.map((member) => [String(member.id), new Set()]));

  const insideClearance = (x, y, z) => x >= clearance.min.x && x <= clearance.max.x
    && y >= clearance.min.y && y <= clearance.max.y
    && z >= clearance.min.z && z <= clearance.max.z;

  function addCell(x, y, z, metadata) {
    if (metadata.sourceMemberId !== null && metadata.sourceMemberId !== undefined) {
      sourceMemberCells.get(String(metadata.sourceMemberId))?.add(cellKey(x, y, z));
    }
    if (insideClearance(x, y, z)) {
      rejected.push({ x, y, z, structuralMemberId: metadata.structuralMemberId, reason: "VEHICLE_CLEARANCE" });
      return false;
    }
    const key = cellKey(x, y, z);
    const candidate = { x, y, z, ...metadata };
    const current = cells.get(key);
    if (!current || PHASES[candidate.phase] < PHASES[current.phase]
      || (candidate.phase === current.phase && stableCompare(candidate.structuralMemberId, current.structuralMemberId) < 0)) {
      cells.set(key, candidate);
    }
    return true;
  }

  for (const member of graph.members) {
    const a = byNode.get(member.a).position;
    const b = byNode.get(member.b).position;
    const phase = memberPhase(member, byNode, deckY);
    const points = rasterLine(a, b);
    for (const side of sideZ) {
      for (const point of points) {
        addCell(point.x, point.y, side, {
          structuralMemberId: member.id,
          sourceMemberId: member.id,
          phase,
          role: member.role,
          axis: "x",
          group: `member:${member.id}`,
        });
      }
    }
  }

  const supportXs = [...new Set(graph.nodes
    .filter((node) => node.supportType !== "none" || ["support", "pier", "anchor"].includes(node.role))
    .map((node) => node.position.x))].sort((a, b) => a - b);
  for (const x of supportXs) {
    for (const centre of sideCenters) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = 0; dz < settings.sideThicknessStuds; dz += 1) {
          addCell(x + dx, 0, centre + dz, {
            structuralMemberId: `foundation:${x}`,
            sourceMemberId: null,
            phase: "foundation",
            role: "foundation",
            axis: "x",
            group: `foundation:${x}:${centre}`,
          });
        }
      }
      const target = graph.nodes.filter((node) => node.position.x === x).reduce((height, node) => Math.max(height, node.position.y), deckY);
      for (let y = 1; y < target; y += 1) {
        for (let dz = 0; dz < settings.sideThicknessStuds; dz += 1) {
          addCell(x, y, centre + dz, {
            structuralMemberId: `support:${x}`,
            sourceMemberId: null,
            phase: "pier",
            role: "pier",
            axis: "x",
            group: `support:${x}:${centre}`,
          });
        }
      }
    }
  }

  const deckMinZ = -Math.floor(settings.deckWidthStuds / 2);
  const deckMaxZ = deckMinZ + settings.deckWidthStuds - 1;
  for (let layer = 0; layer < settings.deckThicknessLayers; layer += 1) {
    const y = deckY - layer;
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = deckMinZ; z <= deckMaxZ; z += 1) {
        addCell(x, y, z, {
          structuralMemberId: "deck",
          sourceMemberId: null,
          phase: "deck",
          role: "deck",
          axis: "x",
          group: "deck",
        });
      }
    }
  }

  const crossMemberXs = [...new Set(graph.nodes.map((node) => node.position.x))].sort((a, b) => a - b);
  for (const x of crossMemberXs) {
    for (let z = sideCenters[0]; z < sideCenters[1] + settings.sideThicknessStuds; z += 1) {
      addCell(x, deckY - settings.deckThicknessLayers, z, {
        structuralMemberId: `cross:${x}`,
        sourceMemberId: null,
        phase: "lower",
        role: "cross-member",
        axis: "z",
        group: `cross:${x}`,
      });
    }
  }

  const railZs = [-2, 2];
  for (const z of railZs) {
    for (let x = minX; x <= maxX; x += 1) {
      addCell(x, deckY + 1, z, {
        structuralMemberId: `rail:${z}`,
        sourceMemberId: null,
        phase: "rail",
        role: "rail-support",
        axis: "x",
        group: `rail:${z}`,
      });
    }
  }

  return {
    cells: [...cells.values()].sort((a, b) => PHASES[a.phase] - PHASES[b.phase]
      || stableCompare(a.structuralMemberId, b.structuralMemberId) || a.y - b.y || a.x - b.x || a.z - b.z),
    rejected,
    clearance,
    deckY,
    bounds: { minX, maxX, deckMinZ, deckMaxZ },
    sourceMemberCells: Object.fromEntries([...sourceMemberCells.entries()].map(([id, keys]) => [id, [...keys].map((key) => {
      const [x, y, z] = key.split(",").map(Number);
      return { x, y, z };
    })])),
  };
}

function dimensionsFor(part, axis) {
  return axis === "x"
    ? { x: part.studLength, z: part.studWidth, orientation: 0 }
    : { x: part.studWidth, z: part.studLength, orientation: 90 };
}

function packingCandidates(catalogue, axis, allowLongBeam) {
  return catalogue
    .filter((part) => allowLongBeam || part.structuralClass !== "long-beam")
    .flatMap((part) => {
      const aligned = dimensionsFor(part, axis);
      const rotated = { x: aligned.z, z: aligned.x, orientation: aligned.orientation === 0 ? 90 : 0 };
      return aligned.x === rotated.x && aligned.z === rotated.z
        ? [{ part, ...aligned }]
        : [{ part, ...aligned }, { part, ...rotated }];
    })
    .sort((a, b) => (b.x * b.z) - (a.x * a.z) || b.part.studLength - a.part.studLength || stableCompare(a.part.partType, b.part.partType));
}

function packOccupancy(occupancy, catalogue) {
  const cells = new Map(occupancy.cells.map((cell) => [cellKey(cell.x, cell.y, cell.z), cell]));
  const remaining = new Set(cells.keys());
  const placements = [];
  const seamEnds = new Map();
  const orderedCells = occupancy.cells;
  let orderedCursor = 0;

  function hasCandidate(start, candidate, structuralMemberId, group) {
    for (let dx = 0; dx < candidate.x; dx += 1) {
      for (let dz = 0; dz < candidate.z; dz += 1) {
        const key = cellKey(start.x + dx, start.y, start.z + dz);
        const cell = cells.get(key);
        if (!remaining.has(key) || !cell || cell.structuralMemberId !== structuralMemberId || cell.group !== group) return false;
      }
    }
    return true;
  }

  function residueIsPackable(start, candidate, cell, candidates) {
    const advance = cell.axis === "x" ? candidate.x : candidate.z;
    const direction = cell.axis === "x" ? { x: 1, z: 0 } : { x: 0, z: 1 };
    let run = 0;
    for (let offset = advance; offset < 82; offset += 1) {
      const key = cellKey(start.x + direction.x * offset, start.y, start.z + direction.z * offset);
      const next = cells.get(key);
      if (!remaining.has(key) || !next || next.group !== cell.group || next.structuralMemberId !== cell.structuralMemberId) break;
      run += 1;
    }
    if (run === 0) return true;
    const lengths = candidates.map((entry) => cell.axis === "x" ? entry.x : entry.z).filter((length) => length <= run);
    if (lengths.includes(1)) return true;
    const reachable = new Array(run + 1).fill(false);
    reachable[0] = true;
    for (let value = 1; value <= run; value += 1) reachable[value] = lengths.some((length) => value >= length && reachable[value - length]);
    return reachable[run];
  }

  while (remaining.size) {
    while (orderedCursor < orderedCells.length && !remaining.has(cellKey(orderedCells[orderedCursor].x, orderedCells[orderedCursor].y, orderedCells[orderedCursor].z))) {
      orderedCursor += 1;
    }
    const cell = orderedCells[orderedCursor];
    const allowLongBeam = ["lower", "upper", "deck", "rail"].includes(cell.phase);
    const candidates = packingCandidates(catalogue, cell.axis, allowLongBeam);
    const valid = candidates.filter((candidate) => hasCandidate(cell, candidate, cell.structuralMemberId, cell.group));
    if (!valid.length) throw new Error(`No legal part can cover occupancy cell ${cellKey(cell.x, cell.y, cell.z)}`);

    const seamKey = `${cell.group}:${cell.axis}:${cell.y - 1}`;
    const previousSeams = seamEnds.get(seamKey) ?? new Set();
    const scored = valid.map((candidate) => {
      const end = cell.axis === "x" ? cell.x + candidate.x : cell.z + candidate.z;
      let supportedCells = 0;
      if (cell.y === 0) supportedCells = candidate.x * candidate.z;
      else {
        for (let dx = 0; dx < candidate.x; dx += 1) {
          for (let dz = 0; dz < candidate.z; dz += 1) {
            if (cells.has(cellKey(cell.x + dx, cell.y - 1, cell.z + dz))) supportedCells += 1;
          }
        }
      }
      const coverage = candidate.x * candidate.z;
      const score = 1
        - coverage * 0.02
        + (previousSeams.has(end) ? 0.25 : 0)
        + (supportedCells === 0 ? 0.15 : 0)
        + (Math.max(candidate.x, candidate.z) > 64 ? 0.05 : 0);
      return { candidate, score };
    }).sort((a, b) => a.score - b.score || (b.candidate.x * b.candidate.z) - (a.candidate.x * a.candidate.z)
      || stableCompare(a.candidate.part.partType, b.candidate.part.partType));

    let selected = scored[0].candidate;
    for (const { candidate } of scored) {
      if (residueIsPackable(cell, candidate, cell, candidates)) {
        selected = candidate;
        break;
      }
    }

    const selectedEnd = cell.axis === "x" ? cell.x + selected.x : cell.z + selected.z;
    if (previousSeams.has(selectedEnd) && valid.length > 1) {
      const staggered = valid.find((candidate) => {
        const end = cell.axis === "x" ? cell.x + candidate.x : cell.z + candidate.z;
        return !previousSeams.has(end) && residueIsPackable(cell, candidate, cell, candidates);
      });
      if (staggered) selected = staggered;
    }

    const occupiedCells = [];
    for (let dx = 0; dx < selected.x; dx += 1) {
      for (let dz = 0; dz < selected.z; dz += 1) {
        const key = cellKey(cell.x + dx, cell.y, cell.z + dz);
        remaining.delete(key);
        occupiedCells.push({ x: cell.x + dx, y: cell.y, z: cell.z + dz });
      }
    }
    const end = cell.axis === "x" ? cell.x + selected.x : cell.z + selected.z;
    const ownSeamKey = `${cell.group}:${cell.axis}:${cell.y}`;
    if (!seamEnds.has(ownSeamKey)) seamEnds.set(ownSeamKey, new Set());
    seamEnds.get(ownSeamKey).add(end);

    placements.push({
      partType: selected.part.partType,
      structuralMemberId: cell.structuralMemberId,
      sourceMemberId: cell.sourceMemberId,
      phase: cell.phase,
      role: cell.role,
      gridPosition: { x: cell.x, y: cell.y, z: cell.z },
      orientation: selected.orientation,
      dimensions: { x: selected.x, y: 1, z: selected.z },
      colour: ROLE_COLOURS[cell.phase],
      material: "ABS-matte",
      occupiedCells,
      dependencies: [],
    });
  }
  return placements;
}

function overlapsFootprint(a, b) {
  const ax1 = a.gridPosition.x;
  const ax2 = ax1 + a.dimensions.x - 1;
  const az1 = a.gridPosition.z;
  const az2 = az1 + a.dimensions.z - 1;
  const bx1 = b.gridPosition.x;
  const bx2 = bx1 + b.dimensions.x - 1;
  const bz1 = b.gridPosition.z;
  const bz2 = bz1 + b.dimensions.z - 1;
  return ax1 <= bx2 && bx1 <= ax2 && az1 <= bz2 && bz1 <= az2;
}

function assignIdsAndDependencies(rawPlacements) {
  const placements = rawPlacements.map((placement, index) => ({ ...placement, placementId: index + 1 }));
  for (const placement of placements) {
    const rank = PHASES[placement.phase];
    if (rank === 0) continue;
    const lower = placements.filter((candidate) => PHASES[candidate.phase] < rank && candidate.gridPosition.y <= placement.gridPosition.y);
    const direct = lower
      .filter((candidate) => candidate.gridPosition.y + candidate.dimensions.y <= placement.gridPosition.y && overlapsFootprint(candidate, placement))
      .sort((a, b) => b.gridPosition.y - a.gridPosition.y || PHASES[b.phase] - PHASES[a.phase] || a.placementId - b.placementId)
      .slice(0, 2);
    let dependencies = direct;
    if (!dependencies.length && lower.length) {
      const nearestPhase = Math.max(...lower.map((candidate) => PHASES[candidate.phase]));
      dependencies = lower.filter((candidate) => PHASES[candidate.phase] === nearestPhase).slice(0, 1);
    }
    placement.dependencies = dependencies.map((candidate) => candidate.placementId).sort((a, b) => a - b);
  }
  return placements;
}

export function dependencyGraphHasCycle(placements) {
  const edges = new Map(placements.map((placement) => [placement.placementId, placement.dependencies]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of edges.get(id) ?? []) if (visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return [...edges.keys()].some(visit);
}

export function placementEntersClearance(placement, clearance) {
  return placement.occupiedCells.some((cell) => cell.x >= clearance.min.x && cell.x <= clearance.max.x
    && cell.y >= clearance.min.y && cell.y <= clearance.max.y
    && cell.z >= clearance.min.z && cell.z <= clearance.max.z);
}

export function compileBridgeGraph(input, options = {}) {
  const started = globalThis.performance?.now?.() ?? Date.now();
  const graph = normalizeBridgeGraph(input);
  const settings = { ...DEFAULT_SETTINGS, ...options };
  const catalogue = createCatalogue(settings);
  const occupancy = createOccupancy(graph, settings);
  const placements = assignIdsAndDependencies(packOccupancy(occupancy, catalogue));
  const partTypes = catalogueByType(catalogue);
  const memberToPlacements = {};
  for (const placement of placements) {
    const key = String(placement.structuralMemberId);
    if (!memberToPlacements[key]) memberToPlacements[key] = [];
    memberToPlacements[key].push(placement.placementId);
  }
  const hasCycle = dependencyGraphHasCycle(placements);
  const illegalParts = placements.filter((placement) => !partTypes.has(placement.partType));
  const clearanceViolations = placements.filter((placement) => placementEntersClearance(placement, occupancy.clearance));
  const buildPlanCore = {
    schemaVersion: "candidate-build-plan/1.0.0",
    compilerVersion: settings.compilerVersion,
    designRevision: graph.metadata.designRevision,
    coordinateSpace: "bridge-local-stud-grid",
    grid: { stud: 1, layer: 1, machineTransformRequired: true },
    paletteId: settings.paletteId,
    placements,
  };
  const checksum = deterministicChecksum(buildPlanCore);
  const elapsed = (globalThis.performance?.now?.() ?? Date.now()) - started;
  const diagnostics = {
    valid: !hasCycle && !illegalParts.length && !clearanceViolations.length,
    codes: [
      ...(hasCycle ? ["DEPENDENCY_CYCLE"] : []),
      ...(illegalParts.length ? ["ILLEGAL_CATALOGUE_PART"] : []),
      ...(clearanceViolations.length ? ["CLEARANCE_VIOLATION"] : []),
      ...(occupancy.rejected.length ? ["CLEARANCE_CELLS_REJECTED"] : []),
    ],
    graphFamily: graph.metadata.family,
    compilationTimeMs: elapsed,
    placementCount: placements.length,
    occupancyCellCount: occupancy.cells.length,
    rejectedClearanceCellCount: occupancy.rejected.length,
    dependencyEdgeCount: placements.reduce((sum, placement) => sum + placement.dependencies.length, 0),
    memberCount: Object.keys(memberToPlacements).length,
    checksum,
  };
  return {
    graph,
    settings,
    catalogue,
    occupancy,
    buildPlan: { ...buildPlanCore, checksum, diagnostics },
    memberToPlacements,
    dependencyGraph: {
      nodes: placements.map((placement) => ({ placementId: placement.placementId, phase: placement.phase })),
      edges: placements.flatMap((placement) => placement.dependencies.map((dependency) => ({ from: dependency, to: placement.placementId }))),
      hasCycle,
    },
    diagnostics,
  };
}

export { PHASES };
