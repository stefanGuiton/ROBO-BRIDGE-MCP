import { movingBodyAabb } from './collision.js';

// One plane for the frozen build, including the lowest point of any payload.
// Use the actual collision envelopes; this does not change collision authority.
export function createTerrainTravelPolicy(terrainPlane, parts, workspace) {
  if (!terrainPlane) return null;
  const terrainMaxZMm = terrainPlane.terrainMaxZMm;
  if (!Number.isFinite(terrainMaxZMm)) throw new Error('terrain_travel_plane_unavailable');
  const origin = { xMm: 0, yMm: 0, zMm: 0 };
  const toolClearanceMm = Math.max(0, -movingBodyAabb(origin, null).min.zMm);
  const payloadClearanceMm = Math.max(0, ...parts.map(part => -movingBodyAabb(origin, part).min.zMm));
  const numericalMarginMm = 0.1;
  const safeTcpTravelZMm = terrainMaxZMm + Math.max(toolClearanceMm, payloadClearanceMm) + numericalMarginMm;
  const policy = { type: 'terrain-max-z-hop', ...terrainPlane, toolClearanceMm, payloadClearanceMm, numericalMarginMm, safeTcpTravelZMm };
  if (safeTcpTravelZMm < workspace.zMinMm || safeTcpTravelZMm > workspace.zMaxMm) {
    throw Object.assign(new Error('terrain_travel_plane_outside_workspace'), { code: 'terrain_travel_plane_outside_workspace', details: policy });
  }
  return Object.freeze(policy);
}
