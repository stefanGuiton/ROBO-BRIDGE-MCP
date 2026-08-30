import { memberLength } from "../model/graph.js";
import type { DeckRoute, StructuralGraph, StructuralMember, StructuralNode, SupportPath } from "../model/types.js";

export type AdjacencyEdge = { nodeId: number; memberId: number; length: number };
export type SupportAnalysis = {
  distances: Map<number, number>;
  supportByNode: Map<number, number | null>;
  predecessorNode: Map<number, number | null>;
  predecessorMember: Map<number, number | null>;
  components: number[][];
  supportPaths: SupportPath[];
  adjacency: Map<number, AdjacencyEdge[]>;
};

const active = (member: StructuralMember): boolean => member.connected && !member.failed && member.completionFactor > 0;

export const buildAdjacency = (graph: StructuralGraph): Map<number, AdjacencyEdge[]> => {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as AdjacencyEdge[]] as const));
  for (const member of [...graph.members].sort((a, b) => a.id - b.id)) {
    if (!active(member)) continue;
    const length = memberLength(member, nodes);
    adjacency.get(member.nodeA)?.push({ nodeId: member.nodeB, memberId: member.id, length });
    adjacency.get(member.nodeB)?.push({ nodeId: member.nodeA, memberId: member.id, length });
  }
  for (const edges of adjacency.values()) edges.sort((a, b) => a.memberId - b.memberId || a.nodeId - b.nodeId);
  return adjacency;
};

export const analyseSupportConnectivity = (graph: StructuralGraph): SupportAnalysis => {
  const adjacency = buildAdjacency(graph);
  const distances = new Map(graph.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY] as const));
  const supportByNode = new Map(graph.nodes.map((node) => [node.id, null as number | null] as const));
  const predecessorNode = new Map(graph.nodes.map((node) => [node.id, null as number | null] as const));
  const predecessorMember = new Map(graph.nodes.map((node) => [node.id, null as number | null] as const));
  const queue: Array<{ nodeId: number; distance: number; supportId: number }> = [];

  for (const support of graph.nodes.filter((node) => node.supportType !== "none").sort((a, b) => a.id - b.id)) {
    distances.set(support.id, 0);
    supportByNode.set(support.id, support.id);
    queue.push({ nodeId: support.id, distance: 0, supportId: support.id });
  }

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance || a.supportId - b.supportId || a.nodeId - b.nodeId);
    const current = queue.shift();
    if (!current || current.distance !== distances.get(current.nodeId) || current.supportId !== supportByNode.get(current.nodeId)) continue;
    for (const edge of adjacency.get(current.nodeId) ?? []) {
      const candidate = current.distance + edge.length;
      const known = distances.get(edge.nodeId) ?? Number.POSITIVE_INFINITY;
      const knownSupport = supportByNode.get(edge.nodeId);
      const better = candidate < known - 1e-9 || (Math.abs(candidate - known) <= 1e-9 && (knownSupport === null || current.supportId < knownSupport));
      if (!better) continue;
      distances.set(edge.nodeId, candidate);
      supportByNode.set(edge.nodeId, current.supportId);
      predecessorNode.set(edge.nodeId, current.nodeId);
      predecessorMember.set(edge.nodeId, edge.memberId);
      queue.push({ nodeId: edge.nodeId, distance: candidate, supportId: current.supportId });
    }
  }

  const visited = new Set<number>();
  const components: number[][] = [];
  for (const node of [...graph.nodes].sort((a, b) => a.id - b.id)) {
    if (visited.has(node.id)) continue;
    const stack = [node.id];
    const component: number[] = [];
    visited.add(node.id);
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined) break;
      component.push(next);
      for (const edge of adjacency.get(next) ?? []) {
        if (!visited.has(edge.nodeId)) { visited.add(edge.nodeId); stack.push(edge.nodeId); }
      }
    }
    components.push(component.sort((a, b) => a - b));
  }

  const supportPaths = [...graph.nodes].sort((a, b) => a.id - b.id).map((node): SupportPath => {
    const memberIds: number[] = [];
    let current: number | null = node.id;
    const guard = new Set<number>();
    while (current !== null && predecessorMember.get(current) !== null && !guard.has(current)) {
      guard.add(current);
      const memberId = predecessorMember.get(current);
      if (memberId !== null && memberId !== undefined) memberIds.push(memberId);
      current = predecessorNode.get(current) ?? null;
    }
    return {
      nodeId: node.id,
      supportNodeId: supportByNode.get(node.id) ?? null,
      memberIds,
      distance: distances.get(node.id) ?? Number.POSITIVE_INFINITY,
    };
  });

  return { distances, supportByNode, predecessorNode, predecessorMember, components, supportPaths, adjacency };
};

const reachable = (start: number, target: number, adjacency: Map<number, AdjacencyEdge[]>): boolean => {
  const queue = [start];
  const visited = new Set([start]);
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === target) return true;
    if (node === undefined) break;
    for (const edge of adjacency.get(node) ?? []) {
      if (!visited.has(edge.nodeId)) { visited.add(edge.nodeId); queue.push(edge.nodeId); }
    }
  }
  return false;
};

export const isRouteConnected = (route: DeckRoute, analysis: SupportAnalysis): boolean => {
  for (let index = 1; index < route.nodeIds.length; index += 1) {
    const previous = route.nodeIds[index - 1];
    const current = route.nodeIds[index];
    if (previous === undefined || current === undefined || !reachable(previous, current, analysis.adjacency)) return false;
  }
  return true;
};

export const componentForNode = (nodeId: number, analysis: SupportAnalysis): number[] =>
  analysis.components.find((component) => component.includes(nodeId)) ?? [];
