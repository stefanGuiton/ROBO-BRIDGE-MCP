'use strict';

import { routeLocalPointToMachine } from '../train/route-frame.js';
import { cloneValue, deepFreezePlain, invariant } from './internal.js';

function axisValue(value, axis) {
  const millimetreKey = `${axis}Mm`;
  const number = Number(value?.[millimetreKey] ?? value?.[axis]);
  return Number.isFinite(number) ? number : null;
}

function normalizeMachineBox(value, index) {
  const min = value?.min || {};
  const max = value?.max || {};
  const box = {
    id: String(value?.id ?? `challenge-proxy-${index}`),
    min: { x: axisValue(min, 'x'), y: axisValue(min, 'y'), z: axisValue(min, 'z') },
    max: { x: axisValue(max, 'x'), y: axisValue(max, 'y'), z: axisValue(max, 'z') },
    tags: Array.isArray(value?.tags) ? value.tags.map(String) : []
  };
  invariant(Object.values(box.min).every(Number.isFinite) && Object.values(box.max).every(Number.isFinite),
    'INVALID_TERRAIN_COLLISION_PROXY', 'Challenge terrain AABB has invalid bounds.', { id: box.id });
  invariant(box.min.x <= box.max.x && box.min.y <= box.max.y && box.min.z <= box.max.z,
    'INVALID_TERRAIN_COLLISION_PROXY', 'Challenge terrain AABB min exceeds max.', { id: box.id });
  return box;
}

function readCollisionProxy(challengeService) {
  invariant(typeof challengeService?.getCollisionProxy === 'function',
    'TERRAIN_COLLISION_PROXY_REQUIRED', 'ChallengeService.getCollisionProxy() is required.');
  const proxy = challengeService.getCollisionProxy();
  invariant(proxy && typeof proxy === 'object', 'TERRAIN_COLLISION_PROXY_REQUIRED', 'ChallengeService returned no collision proxy.');
  const machine = proxy.machine || proxy;
  const boxes = (machine.proxies || proxy.proxies || []).map(normalizeMachineBox);
  const floorZMm = Number(machine.floorZMm ?? proxy.floorZMm ?? proxy.floor?.z ?? proxy.floor?.zMm);
  return {
    schemaVersion: proxy.schemaVersion ?? 'robo-bridge.challenge-collision.unknown',
    coordinateFrame: machine.coordinateFrame ?? proxy.coordinateFrame ?? 'main-demo-machine-mm',
    boxes,
    floorZMm: Number.isFinite(floorZMm) ? floorZMm : null
  };
}

export function createChallengeTerrainSurfaceAdapter({
  challengeService,
  routeFrame,
  includeFloor = true,
  fallbackHeightMm = -300,
  horizontalToleranceMm = 0.01,
  sampleMachineSurface = null,
  solidContactProvider = null
} = {}) {
  invariant(routeFrame?.originMm && routeFrame?.trackTopMachineZMm !== undefined,
    'TRAIN_ROUTE_REQUIRED', 'A BuildPlan-bound train route frame is required for terrain collision.');
  if (solidContactProvider) {
    invariant(typeof solidContactProvider.sample === 'function'
      && typeof solidContactProvider.queryBodyContacts === 'function'
      && typeof solidContactProvider.sweepBody === 'function',
    'INVALID_TERRAIN_CONTACT_PROVIDER', 'Exact terrain contact requires floor, body-contact and sweep queries.');
    // This opt-in path must not read the legacy collision proxy at all. Its
    // Terrain7 floorZMm is a water datum, not an actual support surface.
    return Object.freeze({
      schemaVersion: 'robo-bridge.train-terrain-surface-adapter.v2',
      sample: input => solidContactProvider.sample(input),
      heightAt(forwardMm, rightMm, probeHeightMm) {
        return solidContactProvider.sample(typeof forwardMm === 'object' ? forwardMm : { forwardMm, rightMm, probeHeightMm });
      },
      queryBodyContacts: input => solidContactProvider.queryBodyContacts(input),
      sweepBody: input => solidContactProvider.sweepBody(input),
      queryColumn: input => solidContactProvider.queryColumn(input),
      refresh: () => solidContactProvider.refresh(),
      getDiagnostics: () => solidContactProvider.getDiagnostics()
    });
  }
  let collision = readCollisionProxy(challengeService);
  let sampleCount = 0;
  let proxyHitCount = 0;
  let floorHitCount = 0;

  function sample({ forwardMm = 0, rightMm = 0 } = {}) {
    sampleCount += 1;
    const machinePoint = routeLocalPointToMachine(routeFrame, { x: Number(forwardMm) || 0, y: 0, z: Number(rightMm) || 0 });
    let selected = null;

    if (typeof sampleMachineSurface === 'function') {
      const direct = sampleMachineSurface({ machinePointMm: cloneValue(machinePoint), routeFrame: cloneValue(routeFrame) });
      const zMm = Number(direct?.zMm ?? direct?.heightMachineZMm ?? direct);
      if (Number.isFinite(zMm)) {
        selected = {
          machineZMm: zMm,
          kind: direct?.kind || 'curated-terrain-surface',
          sourceId: direct?.sourceId || 'injected-machine-surface'
        };
      }
    }

    for (const box of collision.boxes) {
      const inside = machinePoint.xMm >= box.min.x - horizontalToleranceMm
        && machinePoint.xMm <= box.max.x + horizontalToleranceMm
        && machinePoint.yMm >= box.min.y - horizontalToleranceMm
        && machinePoint.yMm <= box.max.y + horizontalToleranceMm;
      if (!inside) continue;
      if (!selected || box.max.z > selected.machineZMm) {
        selected = { machineZMm: box.max.z, kind: 'curated-terrain-proxy', sourceId: box.id, tags: box.tags };
      }
    }

    if (selected) {
      proxyHitCount += 1;
      return {
        heightMm: selected.machineZMm - routeFrame.trackTopMachineZMm,
        normal: { x: 0, y: 1, z: 0 },
        kind: selected.kind,
        sourceId: selected.sourceId,
        tags: selected.tags || []
      };
    }
    if (includeFloor && Number.isFinite(collision.floorZMm)) {
      floorHitCount += 1;
      return {
        heightMm: collision.floorZMm - routeFrame.trackTopMachineZMm,
        normal: { x: 0, y: 1, z: 0 },
        kind: 'challenge-support-floor',
        sourceId: 'ChallengeService.collisionProxy.machine.floorZMm'
      };
    }
    return {
      heightMm: Number(fallbackHeightMm),
      normal: { x: 0, y: 1, z: 0 },
      kind: 'bounded-fallback-floor',
      sourceId: 'configured-fallback'
    };
  }

  return Object.freeze({
    schemaVersion: 'robo-bridge.train-terrain-surface-adapter.v1',
    sample,
    heightAt(forwardMm, rightMm) {
      if (forwardMm && typeof forwardMm === 'object') return sample(forwardMm);
      return sample({ forwardMm, rightMm });
    },
    refresh() { collision = readCollisionProxy(challengeService); return this.getDiagnostics(); },
    getDiagnostics() {
      return deepFreezePlain({
        coordinateFrame: collision.coordinateFrame,
        proxyCount: collision.boxes.length,
        floorZMm: collision.floorZMm,
        routeTrackTopMachineZMm: routeFrame.trackTopMachineZMm,
        sampleCount,
        proxyHitCount,
        floorHitCount,
        source: 'ChallengeService.getCollisionProxy',
        proceduralTerrainUsed: false
      });
    }
  });
}
