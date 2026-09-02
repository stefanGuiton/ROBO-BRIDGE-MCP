import { displayBoundsToMachine, MAIN_DEMO_DISPLAY_FRAME, MAIN_DEMO_MACHINE_FRAME } from './challenge-transforms.js';

function frozenBox(id, min, max, tags = []) {
  return Object.freeze({ id, kind: 'AABB', min: Object.freeze(min), max: Object.freeze(max), tags: Object.freeze([...tags]) });
}

export function createCollisionProxy({ terrainBoundsDisplay, entryDisplay, exitDisplay, tableTopZ, deckDisplayZ, protectedHalfWidthMm, displayRouteDirection, machineMount }) {
  const supportGapMm = 14;
  const proxyTop = Math.max(deckDisplayZ + 16, tableTopZ + 30);
  const halfWidthX = Math.abs(displayRouteDirection.y) * protectedHalfWidthMm;
  const halfWidthY = Math.abs(displayRouteDirection.x) * protectedHalfWidthMm;
  const protectedBridgeCorridor = Object.freeze({
    min: Object.freeze({
      x: Math.min(entryDisplay.x, exitDisplay.x) - halfWidthX,
      y: Math.min(entryDisplay.y, exitDisplay.y) - halfWidthY,
      z: tableTopZ
    }),
    max: Object.freeze({
      x: Math.max(entryDisplay.x, exitDisplay.x) + halfWidthX,
      y: Math.max(entryDisplay.y, exitDisplay.y) + halfWidthY,
      z: deckDisplayZ + 160
    })
  });
  const crossingAxis = Math.abs(displayRouteDirection.x) >= Math.abs(displayRouteDirection.y) ? 'x' : 'y';
  const perpendicularAxis = crossingAxis === 'x' ? 'y' : 'x';
  const lowEndpoint = entryDisplay[crossingAxis] <= exitDisplay[crossingAxis]
    ? { id: 'terrain-entry-bank', point: entryDisplay }
    : { id: 'terrain-exit-bank', point: exitDisplay };
  const highEndpoint = lowEndpoint.point === entryDisplay
    ? { id: 'terrain-exit-bank', point: exitDisplay }
    : { id: 'terrain-entry-bank', point: entryDisplay };
  const lowMin = { ...terrainBoundsDisplay.min, z: tableTopZ };
  const lowMax = { ...terrainBoundsDisplay.max, z: proxyTop };
  const highMin = { ...terrainBoundsDisplay.min, z: tableTopZ };
  const highMax = { ...terrainBoundsDisplay.max, z: proxyTop };
  lowMax[crossingAxis] = lowEndpoint.point[crossingAxis] - supportGapMm;
  highMin[crossingAxis] = highEndpoint.point[crossingAxis] + supportGapMm;
  lowMin[perpendicularAxis] = terrainBoundsDisplay.min[perpendicularAxis];
  highMax[perpendicularAxis] = terrainBoundsDisplay.max[perpendicularAxis];
  const displayProxies = Object.freeze([
    frozenBox(lowEndpoint.id, lowMin, lowMax, ['terrain', 'bank', 'player-collision']),
    frozenBox(highEndpoint.id, highMin, highMax, ['terrain', 'bank', 'player-collision'])
  ]);
  const machineProxies = Object.freeze(displayProxies.map((proxy) => Object.freeze({
    ...proxy,
    ...displayBoundsToMachine({ min: proxy.min, max: proxy.max }, machineMount),
    coordinateFrame: MAIN_DEMO_MACHINE_FRAME.id
  })));
  return Object.freeze({
    schemaVersion: 'robo-bridge.challenge-collision.v1',
    coordinateFrame: MAIN_DEMO_DISPLAY_FRAME.id,
    protectedBridgeCorridor,
    proxies: displayProxies,
    machine: Object.freeze({
      coordinateFrame: MAIN_DEMO_MACHINE_FRAME.id,
      protectedBridgeCorridor: displayBoundsToMachine(protectedBridgeCorridor, machineMount),
      proxies: machineProxies,
      floorZMm: 0
    }),
    floor: Object.freeze({
      id: 'challenge-table-support-plane',
      kind: 'PLANE_Z',
      z: tableTopZ,
      tags: Object.freeze(['support', 'existing-table-surface'])
    })
  });
}
