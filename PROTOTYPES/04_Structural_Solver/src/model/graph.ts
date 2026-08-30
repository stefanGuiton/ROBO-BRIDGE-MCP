import type { StructuralGraph, StructuralMember, StructuralNode } from "./types.js";

export const cloneGraph = (graph: StructuralGraph): StructuralGraph => ({
  nodes: graph.nodes.map((node) => ({ ...node, position: { ...node.position } })),
  members: graph.members.map((member) => ({ ...member, brickIds: [...member.brickIds] })),
});

export const memberLength = (
  member: StructuralMember,
  nodes: ReadonlyMap<number, StructuralNode>,
): number => {
  const a = nodes.get(member.nodeA);
  const b = nodes.get(member.nodeB);
  if (!a || !b) throw new Error(`Member ${member.id} references a missing node.`);
  return Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
};

export const validateGraph = (graph: StructuralGraph): void => {
  const nodeIds = new Set<number>();
  for (const node of graph.nodes) {
    if (!Number.isInteger(node.id) || nodeIds.has(node.id)) throw new Error(`Invalid or duplicate node ID ${node.id}.`);
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) throw new Error(`Node ${node.id} has an invalid position.`);
    if (!Number.isFinite(node.appliedLoad) || node.appliedLoad < 0) throw new Error(`Node ${node.id} has an invalid applied load.`);
    nodeIds.add(node.id);
  }
  const memberIds = new Set<number>();
  for (const member of graph.members) {
    if (!Number.isInteger(member.id) || memberIds.has(member.id)) throw new Error(`Invalid or duplicate member ID ${member.id}.`);
    if (!nodeIds.has(member.nodeA) || !nodeIds.has(member.nodeB) || member.nodeA === member.nodeB) throw new Error(`Member ${member.id} has invalid endpoints.`);
    if (!Number.isFinite(member.baseCapacity) || member.baseCapacity <= 0) throw new Error(`Member ${member.id} has invalid capacity.`);
    if (member.completionFactor < 0 || member.completionFactor > 1) throw new Error(`Member ${member.id} has invalid completion.`);
    memberIds.add(member.id);
  }
};

export const stableGraphString = (graph: StructuralGraph): string => JSON.stringify({
  nodes: [...graph.nodes].sort((a, b) => a.id - b.id),
  members: [...graph.members].sort((a, b) => a.id - b.id),
});
