import { memberLength } from "../model/graph.js";
import type { StructuralGraph } from "../model/types.js";

export type TrussResult = { forces: Map<number, number>; stable: boolean; maximumDisplacement: number };

const solveLinearSystem = (matrix: Float64Array, rightHandSide: Float64Array, size: number): { values: Float64Array; stable: boolean } => {
  const a = new Float64Array(matrix);
  const b = new Float64Array(rightHandSide);
  let stable = true;
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(a[row * size + pivot] ?? 0) > Math.abs(a[best * size + pivot] ?? 0)) best = row;
    }
    if (Math.abs(a[best * size + pivot] ?? 0) < 1e-8) {
      stable = false;
      a[pivot * size + pivot] = (a[pivot * size + pivot] ?? 0) + 1e-6;
      best = pivot;
    }
    if (best !== pivot) {
      for (let column = pivot; column < size; column += 1) {
        const indexA = pivot * size + column;
        const indexB = best * size + column;
        const temporary = a[indexA] ?? 0;
        a[indexA] = a[indexB] ?? 0;
        a[indexB] = temporary;
      }
      const temporary = b[pivot] ?? 0;
      b[pivot] = b[best] ?? 0;
      b[best] = temporary;
    }
    const diagonal = a[pivot * size + pivot] ?? 1;
    for (let row = pivot + 1; row < size; row += 1) {
      const factor = (a[row * size + pivot] ?? 0) / diagonal;
      if (Math.abs(factor) < 1e-15) continue;
      for (let column = pivot; column < size; column += 1) {
        a[row * size + column] = (a[row * size + column] ?? 0) - factor * (a[pivot * size + column] ?? 0);
      }
      b[row] = (b[row] ?? 0) - factor * (b[pivot] ?? 0);
    }
  }
  const values = new Float64Array(size);
  for (let row = size - 1; row >= 0; row -= 1) {
    let remainder = b[row] ?? 0;
    for (let column = row + 1; column < size; column += 1) remainder -= (a[row * size + column] ?? 0) * (values[column] ?? 0);
    values[row] = remainder / (a[row * size + row] ?? 1e-6);
  }
  return { values, stable };
};

export const solveTrussStiffness = (graph: StructuralGraph, nodalLoads: ReadonlyMap<number, number>): TrussResult => {
  const nodes = [...graph.nodes].sort((a, b) => a.id - b.id);
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index] as const));
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const size = nodes.length * 2;
  const stiffness = new Float64Array(size * size);
  const forces = new Float64Array(size);
  const activeMembers = graph.members.filter((member) => member.connected && !member.failed && member.completionFactor > 0);

  for (const node of nodes) {
    const index = nodeIndex.get(node.id);
    if (index !== undefined) forces[index * 2 + 1] = -(nodalLoads.get(node.id) ?? 0);
  }
  for (const member of activeMembers) {
    const a = nodeMap.get(member.nodeA);
    const b = nodeMap.get(member.nodeB);
    const ia = nodeIndex.get(member.nodeA);
    const ib = nodeIndex.get(member.nodeB);
    if (!a || !b || ia === undefined || ib === undefined) continue;
    const length = memberLength(member, nodeMap);
    const c = (b.position.x - a.position.x) / length;
    const s = (b.position.y - a.position.y) / length;
    const axialRigidity = Math.max(1, member.baseCapacity * member.completionFactor * 30);
    const scale = axialRigidity / length;
    const local = [c * c, c * s, -c * c, -c * s, c * s, s * s, -c * s, -s * s, -c * c, -c * s, c * c, c * s, -c * s, -s * s, c * s, s * s];
    const dofs = [ia * 2, ia * 2 + 1, ib * 2, ib * 2 + 1];
    for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
      const globalRow = dofs[row]; const globalColumn = dofs[column];
      if (globalRow !== undefined && globalColumn !== undefined) stiffness[globalRow * size + globalColumn] = (stiffness[globalRow * size + globalColumn] ?? 0) + (local[row * 4 + column] ?? 0) * scale;
    }
  }

  const fixed = new Set<number>();
  for (const node of nodes) if (node.supportType !== "none") {
    const index = nodeIndex.get(node.id);
    if (index !== undefined) { fixed.add(index * 2); fixed.add(index * 2 + 1); }
  }
  const free = Array.from({ length: size }, (_, index) => index).filter((index) => !fixed.has(index));
  if (free.length === 0) return { forces: new Map(), stable: true, maximumDisplacement: 0 };
  const reduced = new Float64Array(free.length * free.length);
  const reducedForces = new Float64Array(free.length);
  for (let row = 0; row < free.length; row += 1) {
    reducedForces[row] = forces[free[row] ?? 0] ?? 0;
    for (let column = 0; column < free.length; column += 1) reduced[row * free.length + column] = stiffness[(free[row] ?? 0) * size + (free[column] ?? 0)] ?? 0;
  }
  const solved = solveLinearSystem(reduced, reducedForces, free.length);
  const displacement = new Float64Array(size);
  for (let index = 0; index < free.length; index += 1) displacement[free[index] ?? 0] = solved.values[index] ?? 0;

  const memberForces = new Map<number, number>();
  for (const member of activeMembers) {
    const a = nodeMap.get(member.nodeA); const b = nodeMap.get(member.nodeB);
    const ia = nodeIndex.get(member.nodeA); const ib = nodeIndex.get(member.nodeB);
    if (!a || !b || ia === undefined || ib === undefined) continue;
    const length = memberLength(member, nodeMap);
    const c = (b.position.x - a.position.x) / length; const s = (b.position.y - a.position.y) / length;
    const extension = c * ((displacement[ib * 2] ?? 0) - (displacement[ia * 2] ?? 0)) + s * ((displacement[ib * 2 + 1] ?? 0) - (displacement[ia * 2 + 1] ?? 0));
    memberForces.set(member.id, Math.abs(member.baseCapacity * member.completionFactor * 30 / length * extension));
  }
  return { forces: memberForces, stable: solved.stable, maximumDisplacement: Math.max(0, ...displacement.map((value) => Math.abs(value))) };
};
