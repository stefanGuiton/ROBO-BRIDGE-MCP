import type { DeckRoute, StructuralGraph, TrainPointLoad } from "../model/types.js";

export type PointLoadPosition = { progress: number; mass: number; region: number };

const clamp = (value: number, minimum = 0, maximum = 1): number => Math.min(maximum, Math.max(minimum, value));

export const pointLoadPositions = (route: DeckRoute, progress: number, totalMass: number): PointLoadPosition[] => {
  const loads: TrainPointLoad[] = route.pointLoads.length > 0 ? route.pointLoads : [{ offset: 0, massFraction: 1 }];
  return loads.map((load) => {
    const position = clamp(progress + load.offset);
    return {
      progress: position,
      mass: totalMass * load.massFraction,
      region: Math.min(route.regionCount - 1, Math.floor(position * route.regionCount)),
    };
  });
};

export const loadRegionSignature = (route: DeckRoute, progress: number, totalMass: number): string =>
  pointLoadPositions(route, progress, totalMass).map((load) => load.region).join(":");

export const createNodalLoads = (
  graph: StructuralGraph,
  route: DeckRoute,
  progress: number,
  totalMass: number,
): Map<number, number> => {
  const loads = new Map(graph.nodes.map((node) => [node.id, node.appliedLoad] as const));
  const routeNodes = route.nodeIds.map((id) => graph.nodes.find((node) => node.id === id)).filter((node) => node !== undefined);
  if (routeNodes.length < 2) return loads;
  const lengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < routeNodes.length; index += 1) {
    const a = routeNodes[index - 1];
    const b = routeNodes[index];
    if (!a || !b) continue;
    totalLength += Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
    lengths.push(totalLength);
  }
  for (const point of pointLoadPositions(route, progress, totalMass)) {
    const target = point.progress * totalLength;
    let segment = lengths.findIndex((length) => target <= length + 1e-9);
    if (segment < 0) segment = lengths.length - 1;
    const startDistance = segment === 0 ? 0 : (lengths[segment - 1] ?? 0);
    const segmentLength = (lengths[segment] ?? totalLength) - startDistance;
    const local = segmentLength <= 1e-9 ? 0 : clamp((target - startDistance) / segmentLength);
    const a = routeNodes[segment];
    const b = routeNodes[segment + 1];
    if (!a || !b) continue;
    loads.set(a.id, (loads.get(a.id) ?? 0) + point.mass * (1 - local));
    loads.set(b.id, (loads.get(b.id) ?? 0) + point.mass * local);
  }
  return loads;
};

export const loadsAsRecord = (loads: ReadonlyMap<number, number>): Record<number, number> =>
  Object.fromEntries([...loads.entries()].filter(([, load]) => load > 0).sort(([a], [b]) => a - b));
