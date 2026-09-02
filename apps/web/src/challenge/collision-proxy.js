import { displayBoundsToMachine, MAIN_DEMO_DISPLAY_FRAME, MAIN_DEMO_MACHINE_FRAME } from './challenge-transforms.js';

function frozenBox(id, min, max, tags = []) {
  return Object.freeze({ id, kind: 'AABB', min: Object.freeze(min), max: Object.freeze(max), tags: Object.freeze([...tags]) });
}

export function createCollisionProxy({ terrainBoundsDisplay, entryDisplay, exitDisplay, tableTopZ, deckDisplayZ, protectedHalfWidthMm, machineMount }) {
  const supportGapMm = 14;
  const proxyTop = Math.max(deckDisplayZ + 16, tableTopZ + 30);
  const protectedBridgeCorridor = Object.freeze({
    min: Object.freeze({ x: -protectedHalfWidthMm, y: entryDisplay.y, z: tableTopZ }),
    max: Object.freeze({ x: protectedHalfWidthMm, y: exitDisplay.y, z: deckDisplayZ + 160 })
  });
  const displayProxies = Object.freeze([
    frozenBox(
      'terrain-entry-bank',
      { x: terrainBoundsDisplay.min.x, y: terrainBoundsDisplay.min.y, z: tableTopZ },
      { x: terrainBoundsDisplay.max.x, y: entryDisplay.y - supportGapMm, z: proxyTop },
      ['terrain', 'bank', 'player-collision']
    ),
    frozenBox(
      'terrain-exit-bank',
      { x: terrainBoundsDisplay.min.x, y: exitDisplay.y + supportGapMm, z: tableTopZ },
      { x: terrainBoundsDisplay.max.x, y: terrainBoundsDisplay.max.y, z: proxyTop },
      ['terrain', 'bank', 'player-collision']
    )
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
