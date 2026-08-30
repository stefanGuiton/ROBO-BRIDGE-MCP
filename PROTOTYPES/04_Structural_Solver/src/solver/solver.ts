import { cloneGraph, memberLength, validateGraph } from "../model/graph.js";
import type { DeckRoute, FailureEvent, MemberDiagnostic, SolveRequest, SolveSnapshot, StructuralGraph, TestDiagnostic, TestResult } from "../model/types.js";
import { analyseSupportConnectivity, componentForNode, isRouteConnected, type SupportAnalysis } from "./connectivity.js";
import { createNodalLoads, loadRegionSignature, loadsAsRecord } from "./loads.js";
import { solveTrussStiffness } from "./truss.js";

const typeUnsupportedFactor = new Map<string, number>([
  ["pier", 0.25],
  ["truss", 0.55],
  ["arch", 0.45],
  ["cable", 0.6],
]);

type LoadSupportRoute = { supportId: number; distance: number; memberIds: number[]; weight: number };

const findLoadSupportRoutes = (startNodeId: number, graph: StructuralGraph, analysis: SupportAnalysis): LoadSupportRoute[] => {
  const distances = new Map(graph.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY] as const));
  const previousNode = new Map<number, number>();
  const previousMember = new Map<number, number>();
  const queue: Array<{ nodeId: number; distance: number }> = [{ nodeId: startNodeId, distance: 0 }];
  distances.set(startNodeId, 0);
  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance || a.nodeId - b.nodeId);
    const current = queue.shift();
    if (!current || current.distance !== distances.get(current.nodeId)) continue;
    for (const edge of analysis.adjacency.get(current.nodeId) ?? []) {
      const candidate = current.distance + edge.length;
      const known = distances.get(edge.nodeId) ?? Number.POSITIVE_INFINITY;
      const existingMember = previousMember.get(edge.nodeId) ?? Number.POSITIVE_INFINITY;
      if (candidate > known + 1e-9 || (Math.abs(candidate - known) <= 1e-9 && edge.memberId >= existingMember)) continue;
      distances.set(edge.nodeId, candidate);
      previousNode.set(edge.nodeId, current.nodeId);
      previousMember.set(edge.nodeId, edge.memberId);
      queue.push({ nodeId: edge.nodeId, distance: candidate });
    }
  }
  const supports = graph.nodes.filter((node) => node.supportType !== "none" && Number.isFinite(distances.get(node.id)))
    .sort((a, b) => (distances.get(a.id) ?? 0) - (distances.get(b.id) ?? 0) || a.id - b.id);
  if (supports.length === 0) return [];
  if ((distances.get(supports[0]?.id ?? -1) ?? 1) <= 1e-9) return [{ supportId: supports[0]?.id ?? startNodeId, distance: 0, memberIds: [], weight: 1 }];
  const raw = supports.map((support) => 1 / Math.max(0.001, distances.get(support.id) ?? Number.POSITIVE_INFINITY));
  const totalWeight = raw.reduce((sum, value) => sum + value, 0);
  return supports.map((support, index) => {
    const reversed: number[] = [];
    let current = support.id;
    const guard = new Set<number>();
    while (current !== startNodeId && !guard.has(current)) {
      guard.add(current);
      const memberId = previousMember.get(current);
      const next = previousNode.get(current);
      if (memberId === undefined || next === undefined) break;
      reversed.push(memberId);
      current = next;
    }
    return {
      supportId: support.id,
      distance: distances.get(support.id) ?? Number.POSITIVE_INFINITY,
      memberIds: reversed.reverse(),
      weight: (raw[index] ?? 0) / totalWeight,
    };
  });
};

const calculateDemands = (
  graph: StructuralGraph,
  route: DeckRoute,
  nodalLoads: ReadonlyMap<number, number>,
  request: SolveRequest,
): { analysis: SupportAnalysis; memberDiagnostics: MemberDiagnostic[]; diagnostics: TestDiagnostic[]; maximumUtilisation: number } => {
  const analysis = analyseSupportConnectivity(graph);
  const memberMap = new Map(graph.members.map((member) => [member.id, member] as const));
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const demand = new Map(graph.members.map((member) => [member.id, 0] as const));
  const diagnostics: TestDiagnostic[] = [];

  for (const [nodeId, load] of [...nodalLoads.entries()].sort(([a], [b]) => a - b)) {
    if (load <= 0) continue;
    const supportRoutes = findLoadSupportRoutes(nodeId, graph, analysis);
    if (supportRoutes.length === 0) {
      const component = new Set(componentForNode(nodeId, analysis));
      diagnostics.push({ code: "LOAD_WITHOUT_SUPPORT", message: `Load at node ${nodeId} has no active support path.`, nodeId, value: load });
      for (const member of graph.members) if (!member.failed && member.connected && component.has(member.nodeA) && component.has(member.nodeB)) {
        const length = memberLength(member, nodeMap);
        demand.set(member.id, (demand.get(member.id) ?? 0) + load * request.tuning.disconnectedDemandMultiplier * (1 + length / request.tuning.referenceLength));
      }
      continue;
    }
    for (const supportRoute of supportRoutes) {
      let distanceFromLoad = 0;
      for (const memberId of supportRoute.memberIds) {
        const member = memberMap.get(memberId);
        if (!member) continue;
        const length = memberLength(member, nodeMap);
        const lever = Math.max(0.7, distanceFromLoad + length * 0.5);
        const branchFactor = 1 + 0.12 * supportRoute.distance / request.tuning.referenceLength;
        demand.set(memberId, (demand.get(memberId) ?? 0) + load * supportRoute.weight * lever * branchFactor);
        distanceFromLoad += length;
      }
    }
    for (const edge of analysis.adjacency.get(nodeId) ?? []) {
      demand.set(edge.memberId, (demand.get(edge.memberId) ?? 0) + load * 0.18 * edge.length);
    }
  }

  if (request.tuning.analysisMode === "truss-stiffness") {
    const stiffness = solveTrussStiffness(graph, nodalLoads);
    for (const [memberId, axialForce] of stiffness.forces) demand.set(memberId, Math.max((demand.get(memberId) ?? 0) * 0.25, axialForce));
    diagnostics.push({
      code: stiffness.stable ? "STIFFNESS_SOLVED" : "STIFFNESS_MECHANISM",
      message: stiffness.stable ? "2D direct-stiffness solve completed." : "The direct-stiffness matrix contains a mechanism; regularised game fallback applied.",
      value: stiffness.maximumDisplacement,
    });
  }

  let maximumUtilisation = 0;
  const memberDiagnostics = [...graph.members].sort((a, b) => a.id - b.id).map((member): MemberDiagnostic => {
    const length = memberLength(member, nodeMap);
    const distanceA = analysis.distances.get(member.nodeA) ?? Number.POSITIVE_INFINITY;
    const distanceB = analysis.distances.get(member.nodeB) ?? Number.POSITIVE_INFINITY;
    const finiteDistance = Math.min(distanceA, distanceB);
    const supportDistance = Number.isFinite(finiteDistance) ? finiteDistance + length * 0.5 : request.tuning.referenceLength * 4;
    const factor = typeUnsupportedFactor.get(member.type) ?? 1;
    const unsupportedRatio = supportDistance / request.tuning.referenceLength;
    const completionCapacity = member.baseCapacity * member.completionFactor;
    const effectiveCapacity = member.connected && !member.failed
      ? completionCapacity / (1 + request.tuning.unsupportedLengthK * factor * unsupportedRatio ** request.tuning.unsupportedExponent) / request.tuning.difficultyMultiplier
      : 0;
    const memberDemand = member.failed ? (member.failureDemand ?? 0) : (demand.get(member.id) ?? 0);
    const utilisation = member.failed ? (member.failureUtilisation ?? 0) : effectiveCapacity > 0 ? memberDemand / effectiveCapacity : memberDemand > 0 ? Number.POSITIVE_INFINITY : 0;
    member.capacity = effectiveCapacity;
    member.demand = memberDemand;
    member.utilisation = utilisation;
    if (Number.isFinite(utilisation)) maximumUtilisation = Math.max(maximumUtilisation, utilisation);
    const threshold = request.tuning.failureThreshold;
    const state = member.failed ? "failed" : !member.connected || member.completionFactor === 0 ? "disconnected" : utilisation >= threshold * 0.9 ? "critical" : utilisation >= threshold * 0.65 ? "stressed" : "safe";
    return {
      memberId: member.id,
      type: member.type,
      length,
      supportDistance,
      baseCapacity: member.baseCapacity,
      effectiveCapacity,
      demand: memberDemand,
      utilisation,
      completionFactor: member.completionFactor,
      state,
      carriedBySupportId: analysis.supportByNode.get(member.nodeA) ?? analysis.supportByNode.get(member.nodeB) ?? null,
    };
  });
  return { analysis, memberDiagnostics, diagnostics, maximumUtilisation };
};

const selectFailure = (diagnostics: MemberDiagnostic[], graph: StructuralGraph, threshold: number): MemberDiagnostic | undefined => {
  const memberMap = new Map(graph.members.map((member) => [member.id, member] as const));
  return diagnostics.filter((item) => {
    const member = memberMap.get(item.memberId);
    return member !== undefined && member.connected && !member.failed && member.completionFactor > 0 && item.utilisation > threshold;
  }).sort((a, b) => {
    const utilisation = b.utilisation - a.utilisation;
    if (Math.abs(utilisation) > 1e-12) return utilisation;
    const marginA = a.effectiveCapacity - a.demand;
    const marginB = b.effectiveCapacity - b.demand;
    if (Math.abs(marginA - marginB) > 1e-12) return marginA - marginB;
    return a.memberId - b.memberId;
  })[0];
};

const buildResult = (
  graph: StructuralGraph,
  routeConnected: boolean,
  request: SolveRequest,
  failureSequence: FailureEvent[],
  maximumUtilisation: number,
  diagnostics: TestDiagnostic[],
): TestResult => {
  const failedMembers = graph.members.filter((member) => member.failed);
  const first = failureSequence[0];
  const outcome = !routeConnected ? "ROUTE_LOST" : failedMembers.length > 0 ? "BRIDGE_FAILED" : request.loadProgress >= 1 ? "CROSSED" : "STOPPED";
  const base = {
    testId: request.testId,
    success: outcome === "CROSSED",
    outcome,
    failedMemberIds: failureSequence.map((failure) => failure.memberId),
    failedBrickIds: failureSequence.flatMap((failure) => graph.members.find((member) => member.id === failure.memberId)?.brickIds ?? []),
    maximumUtilisation,
    loadPositionAtFirstFailure: first ? request.loadProgress : null,
    diagnostics,
  };
  return first
    ? { ...base, firstFailure: { memberId: first.memberId, reason: "utilisation exceeded the deterministic failure threshold", loadPosition: request.loadProgress } }
    : base;
};

export const solveStructure = (input: StructuralGraph, route: DeckRoute, request: SolveRequest): SolveSnapshot => {
  const started = performance.now();
  validateGraph(input);
  const graph = cloneGraph(input);
  const nodalLoads = createNodalLoads(graph, route, request.loadProgress, request.loadMass);
  const failureSequence: FailureEvent[] = [];
  const allDiagnostics: TestDiagnostic[] = [];
  let cascadeIterations = 0;
  let maximumUtilisation = 0;
  let last = calculateDemands(graph, route, nodalLoads, request);
  maximumUtilisation = Math.max(maximumUtilisation, last.maximumUtilisation);
  allDiagnostics.push(...last.diagnostics);

  if (request.mode === "TEST") {
    while (cascadeIterations < request.tuning.maximumCascadeIterations) {
      const candidate = selectFailure(last.memberDiagnostics, graph, request.tuning.failureThreshold);
      if (!candidate) break;
      cascadeIterations += 1;
      const member = graph.members.find((item) => item.id === candidate.memberId);
      if (!member) break;
      member.failed = true;
      member.failureDemand = candidate.demand;
      member.failureUtilisation = candidate.utilisation;
      failureSequence.push({
        memberId: member.id,
        utilisation: candidate.utilisation,
        demand: candidate.demand,
        effectiveCapacity: candidate.effectiveCapacity,
        cascadeIteration: cascadeIterations,
      });
      allDiagnostics.push({ code: "MEMBER_FAILED", message: `Member ${member.id} failed at utilisation ${candidate.utilisation.toFixed(3)}.`, memberId: member.id, value: candidate.utilisation });
      last = calculateDemands(graph, route, nodalLoads, request);
      maximumUtilisation = Math.max(maximumUtilisation, last.maximumUtilisation);
    }
    if (cascadeIterations >= request.tuning.maximumCascadeIterations && selectFailure(last.memberDiagnostics, graph, request.tuning.failureThreshold)) {
      allDiagnostics.push({ code: "CASCADE_LIMIT", message: "Progressive failure stopped at the strict cascade iteration limit.", value: cascadeIterations });
    }
  }

  const routeConnected = isRouteConnected(route, last.analysis);
  if (!routeConnected) allDiagnostics.push({ code: "ROUTE_LOST", message: "The deck route is no longer structurally connected." });
  const testResult = buildResult(graph, routeConnected, request, failureSequence, maximumUtilisation, allDiagnostics);
  return {
    mode: request.mode,
    graph,
    loadProgress: request.loadProgress,
    nodalLoads: loadsAsRecord(nodalLoads),
    supportPaths: last.analysis.supportPaths,
    memberDiagnostics: last.memberDiagnostics,
    failureSequence,
    routeConnected,
    maximumUtilisation,
    metrics: {
      nodeCount: graph.nodes.length,
      memberCount: graph.members.length,
      solveTimeMs: performance.now() - started,
      loadRegionUpdates: request.loadRegionUpdates ?? 0,
      cascadeIterations,
      loadRegionSignature: loadRegionSignature(route, request.loadProgress, request.loadMass),
    },
    testResult,
  };
};
