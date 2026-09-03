import * as THREE from '../../vendor/three.module.min.js';

// View-only gate. It never calls the board, controller or placement authority.
// The caller supplies explicitly classified solid meshes; alpha/visibility do
// not decide whether a rock can be clicked through. Water is not in this list.
export function terrainOccludesPoint({ origin, point, occluders = [], epsilonMm = 1 }) {
  if (!occluders.length) return { blocked: false, targetDistanceMm: origin.distanceTo(point), terrainDistanceMm: null };
  const direction = point.clone().sub(origin), distance = direction.length();
  if (distance <= epsilonMm) return { blocked: false, targetDistanceMm: distance, terrainDistanceMm: null };
  const ray = new THREE.Raycaster(origin, direction.normalize(), 0, distance);
  const hits = ray.intersectObjects(occluders, false);
  // Check both winding directions without changing shared render materials.
  // Otherwise a front-sided tunnel wall could be clicked through from inside.
  const reverse = new THREE.Raycaster(point, direction.clone().negate(), 0, distance);
  for (const hit of reverse.intersectObjects(occluders, false)) hits.push({ ...hit, distance: distance - hit.distance });
  hits.sort((a, b) => a.distance - b.distance);
  const hit = hits[0];
  return { blocked: Boolean(hit && hit.distance + epsilonMm < distance), targetDistanceMm: distance,
    terrainDistanceMm: hit?.distance ?? null, occluder: hit?.object?.parent?.name ?? null };
}
