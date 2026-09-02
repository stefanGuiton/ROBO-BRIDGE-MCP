'use strict';

import { checksumHex, cloneValue, finite, round6 } from './math.js';
import { createAcceptedBuildBoardSnapshot, createAcceptedStructureOccupancy } from './buildboard-support-map.js';
import { createRouteFrame, normalizeTrainWorldTransform, routeFrameIdentity } from './route-frame.js';

export const COLLISION_FACE = Object.freeze({ PX: 1, NX: 2, PY: 4, NY: 8, PZ: 16, NZ: 32 });

const bitIndex = (width, height, x, y, z) => z * width * height + y * width + x;
const setBit = (bits, index) => { bits[index >>> 5] |= 1 << (index & 31); };
export const getCollisionBit = (bits, index) => Boolean((bits[index >>> 5] >>> (index & 31)) & 1);

function greedyRectangles(mask, width, height, emit) {
  const used = new Uint8Array(mask.length);
  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const start = v * width + u;
      if (!mask[start] || used[start]) continue;
      let runWidth = 1;
      while (u + runWidth < width && mask[start + runWidth] && !used[start + runWidth]) runWidth += 1;
      let runHeight = 1;
      outer: while (v + runHeight < height) {
        const row = (v + runHeight) * width + u;
        for (let du = 0; du < runWidth; du += 1) {
          if (!mask[row + du] || used[row + du]) break outer;
        }
        runHeight += 1;
      }
      for (let dv = 0; dv < runHeight; dv += 1) {
        const row = (v + dv) * width + u;
        for (let du = 0; du < runWidth; du += 1) used[row + du] = 1;
      }
      emit(u, v, runWidth, runHeight);
    }
  }
}

export function buildMergedCollisionFaces(snapshot) {
  const { width, height, depth, exposedFaceBits } = snapshot;
  const faces = [];
  const faceAt = (x, y, z) => exposedFaceBits[bitIndex(width, height, x, y, z)];

  for (const [flag, direction, positive] of [[COLLISION_FACE.PX, 'PX', true], [COLLISION_FACE.NX, 'NX', false]]) {
    for (let x = 0; x < width; x += 1) {
      const mask = new Uint8Array(depth * height);
      let any = false;
      for (let y = 0; y < height; y += 1) for (let z = 0; z < depth; z += 1) {
        if (faceAt(x, y, z) & flag) { mask[y * depth + z] = 1; any = true; }
      }
      if (any) greedyRectangles(mask, depth, height, (z0, y0, dz, dy) => {
        faces.push({ direction, plane: positive ? x + 1 : x, x, y0, z0, dy, dz, areaCells: dy * dz });
      });
    }
  }

  for (const [flag, direction, positive] of [[COLLISION_FACE.PY, 'PY', true], [COLLISION_FACE.NY, 'NY', false]]) {
    for (let y = 0; y < height; y += 1) {
      const mask = new Uint8Array(width * depth);
      let any = false;
      for (let z = 0; z < depth; z += 1) for (let x = 0; x < width; x += 1) {
        if (faceAt(x, y, z) & flag) { mask[z * width + x] = 1; any = true; }
      }
      if (any) greedyRectangles(mask, width, depth, (x0, z0, dx, dz) => {
        faces.push({ direction, plane: positive ? y + 1 : y, y, x0, z0, dx, dz, areaCells: dx * dz });
      });
    }
  }

  for (const [flag, direction, positive] of [[COLLISION_FACE.PZ, 'PZ', true], [COLLISION_FACE.NZ, 'NZ', false]]) {
    for (let z = 0; z < depth; z += 1) {
      const mask = new Uint8Array(width * height);
      let any = false;
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        if (faceAt(x, y, z) & flag) { mask[y * width + x] = 1; any = true; }
      }
      if (any) greedyRectangles(mask, width, height, (x0, y0, dx, dy) => {
        faces.push({ direction, plane: positive ? z + 1 : z, z, x0, y0, dx, dy, areaCells: dx * dy });
      });
    }
  }
  return faces;
}

export function mergedCollisionFaceBox(snapshot, face) {
  const origin = snapshot.originMm;
  const cellX = snapshot.cellMm.x;
  const cellY = snapshot.cellMm.y;
  const cellZ = snapshot.cellMm.z;
  const thin = Math.min(cellX, cellY, cellZ) * 0.035;
  if (face.direction === 'PX' || face.direction === 'NX') {
    return {
      position: { x: origin.x + face.plane * cellX, y: origin.y + (face.y0 + face.dy * 0.5) * cellY, z: origin.z + (face.z0 + face.dz * 0.5) * cellZ },
      size: { x: thin, y: face.dy * cellY, z: face.dz * cellZ }
    };
  }
  if (face.direction === 'PY' || face.direction === 'NY') {
    return {
      position: { x: origin.x + (face.x0 + face.dx * 0.5) * cellX, y: origin.y + face.plane * cellY, z: origin.z + (face.z0 + face.dz * 0.5) * cellZ },
      size: { x: face.dx * cellX, y: thin, z: face.dz * cellZ }
    };
  }
  return {
    position: { x: origin.x + (face.x0 + face.dx * 0.5) * cellX, y: origin.y + (face.y0 + face.dy * 0.5) * cellY, z: origin.z + face.plane * cellZ },
    size: { x: face.dx * cellX, y: face.dy * cellY, z: thin }
  };
}

export function createBridgeCollisionSnapshot({
  frozenBuildPlan,
  acceptedBuildBoardSnapshot,
  worldTransform = {},
  includeMergedFaces = true
} = {}) {
  const started = performance.now();
  const plan = frozenBuildPlan;
  if (!plan || plan.schemaVersion !== '4.6') throw new TypeError('Collision snapshot requires a frozen V4.6 BuildPlan.');
  const board = acceptedBuildBoardSnapshot?.schemaVersion === 'robo-bridge.accepted-buildboard-snapshot.v1'
    ? acceptedBuildBoardSnapshot
    : createAcceptedBuildBoardSnapshot(acceptedBuildBoardSnapshot);
  const accepted = createAcceptedStructureOccupancy({ frozenBuildPlan: plan, acceptedBuildBoardSnapshot: board });
  const frame = createRouteFrame({ frozenBuildPlan: plan, worldTransform });
  const transform = normalizeTrainWorldTransform(worldTransform);
  const grid = plan.geometry.grid;
  const slice = plan.geometry.sliceArray;
  const width = grid.width;
  const height = grid.height;
  const depth = slice.count;
  const totalCells = width * height * depth;
  const cellX = grid.dx * transform.scale;
  const cellY = grid.dy * transform.scale;
  const cellZ = slice.pitch * transform.scale;
  const routeStartLocalX = frame.source.startLocalX;
  const gridStartLocalX = finite(plan.anchors.group?.x) + grid.gridMinX * grid.dx;
  const topLocalY = frame.source.trackTopLocalY;
  const originMm = {
    x: (gridStartLocalX - routeStartLocalX) * transform.scale,
    y: (grid.gridMinY * grid.dy - topLocalY) * transform.scale,
    z: -depth * cellZ * 0.5
  };
  const occupancyBits = new Uint32Array(Math.ceil(totalCells / 32));
  let occupiedCellCount = 0;
  let minX = width, minY = height, minZ = depth, maxX = -1, maxY = -1, maxZ = -1;

  // V4.6 slice index grows towards source +Z. Route-local +Z is right, which is source -Z.
  for (const record of accepted.placementRecords) {
    const x = record.gridX - grid.gridMinX;
    const y = record.gridY - grid.gridMinY;
    const z = depth - 1 - record.sliceIndex;
    if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) continue;
    const index = bitIndex(width, height, x, y, z);
    if (getCollisionBit(occupancyBits, index)) continue;
    setBit(occupancyBits, index);
    occupiedCellCount += 1;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const bitPackEnd = performance.now();

  const topLayer = new Int16Array(width * depth);
  topLayer.fill(-1);
  for (let z = 0; z < depth; z += 1) for (let x = 0; x < width; x += 1) {
    for (let y = height - 1; y >= 0; y -= 1) {
      if (getCollisionBit(occupancyBits, bitIndex(width, height, x, y, z))) { topLayer[z * width + x] = y; break; }
    }
  }
  const topLayerEnd = performance.now();

  const exposedFaceBits = new Uint8Array(totalCells);
  let exposedFaceCount = 0;
  const occupied = (x, y, z) => x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < depth
    && getCollisionBit(occupancyBits, bitIndex(width, height, x, y, z));
  for (let z = 0; z < depth; z += 1) for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!occupied(x, y, z)) continue;
    let mask = 0;
    if (!occupied(x + 1, y, z)) mask |= COLLISION_FACE.PX;
    if (!occupied(x - 1, y, z)) mask |= COLLISION_FACE.NX;
    if (!occupied(x, y + 1, z)) mask |= COLLISION_FACE.PY;
    if (!occupied(x, y - 1, z)) mask |= COLLISION_FACE.NY;
    if (!occupied(x, y, z + 1)) mask |= COLLISION_FACE.PZ;
    if (!occupied(x, y, z - 1)) mask |= COLLISION_FACE.NZ;
    exposedFaceBits[bitIndex(width, height, x, y, z)] = mask;
    exposedFaceCount += [1, 2, 4, 8, 16, 32].reduce((sum, flag) => sum + ((mask & flag) ? 1 : 0), 0);
  }
  const exposedEnd = performance.now();

  const snapshot = {
    schemaVersion: 'robo-bridge.train-collision-snapshot.v2',
    planIdentity: Object.freeze({ planId: plan.planId, designChecksum: plan.designChecksum, designRevision: plan.designRevision }),
    boardIdentity: Object.freeze({ worldRevision: board.worldRevision, acceptedChecksum: board.acceptedChecksum }),
    routeFrame: cloneValue(frame),
    routeIdentity: routeFrameIdentity(frame),
    width,
    height,
    depth,
    totalCells,
    cellMm: Object.freeze({ x: cellX, y: cellY, z: cellZ }),
    inverseCellMm: Object.freeze({ x: 1 / cellX, y: 1 / cellY, z: 1 / cellZ }),
    originMm: Object.freeze(originMm),
    maximumMm: Object.freeze({ x: originMm.x + width * cellX, y: originMm.y + height * cellY, z: originMm.z + depth * cellZ }),
    occupancyBits,
    topLayer,
    exposedFaceBits,
    occupiedCellCount,
    exposedFaceCount,
    occupancyBounds: occupiedCellCount ? Object.freeze({ minX, minY, minZ, maxX, maxY, maxZ }) : null,
    mergedFaces: [],
    checksum: '',
    estimatedBytes: 0,
    timings: null
  };
  const mergeStart = performance.now();
  snapshot.mergedFaces = includeMergedFaces ? buildMergedCollisionFaces(snapshot) : [];
  const mergeEnd = performance.now();
  snapshot.checksum = checksumHex({
    plan: snapshot.planIdentity,
    board: snapshot.boardIdentity,
    route: snapshot.routeIdentity,
    dimensions: [width, height, depth],
    cellMm: snapshot.cellMm,
    originMm,
    occupancy: Array.from(occupancyBits)
  });
  const checksumEnd = performance.now();
  snapshot.estimatedBytes = occupancyBits.byteLength + topLayer.byteLength + exposedFaceBits.byteLength + snapshot.mergedFaces.length * 56;
  snapshot.timings = Object.freeze({
    bitPackMs: round6(bitPackEnd - started),
    topLayerMs: round6(topLayerEnd - bitPackEnd),
    exposedFaceMaskMs: round6(exposedEnd - topLayerEnd),
    greedyMergeMs: round6(mergeEnd - mergeStart),
    checksumMs: round6(checksumEnd - mergeEnd),
    prepareTotalMs: round6(checksumEnd - started)
  });
  Object.freeze(snapshot.mergedFaces);
  return Object.freeze(snapshot);
}

export function collisionSnapshotStats(snapshot, reused = false) {
  if (!snapshot) return null;
  return {
    schemaVersion: snapshot.schemaVersion,
    planIdentity: cloneValue(snapshot.planIdentity),
    boardIdentity: cloneValue(snapshot.boardIdentity),
    checksum: snapshot.checksum,
    dimensions: { width: snapshot.width, height: snapshot.height, depth: snapshot.depth },
    occupiedCells: snapshot.occupiedCellCount,
    exposedFaces: snapshot.exposedFaceCount,
    mergedFaces: snapshot.mergedFaces.length,
    estimatedBytes: snapshot.estimatedBytes,
    timings: cloneValue(snapshot.timings),
    reused
  };
}

export function createCollisionSnapshotManager(options = {}) {
  const getFrozenBuildPlan = options.getFrozenBuildPlan;
  const getAcceptedBuildBoardSnapshot = options.getAcceptedBuildBoardSnapshot;
  const getWorldTransform = options.getWorldTransform || (() => ({}));
  if (typeof getFrozenBuildPlan !== 'function' || typeof getAcceptedBuildBoardSnapshot !== 'function') {
    throw new TypeError('Collision snapshot manager requires BuildPlan and BuildBoard snapshot providers.');
  }
  let snapshot = null;
  let cacheKey = '';
  let lastPrepare = null;
  const keyFor = (plan, board, transform) => checksumHex({
    planId: plan?.planId,
    designChecksum: plan?.designChecksum,
    designRevision: plan?.designRevision,
    worldRevision: board?.worldRevision,
    acceptedChecksum: board?.acceptedChecksum,
    transform: normalizeTrainWorldTransform(transform)
  });
  return Object.freeze({
    prepare({ force = false, includeMergedFaces = true } = {}) {
      const plan = getFrozenBuildPlan();
      const board = createAcceptedBuildBoardSnapshot(getAcceptedBuildBoardSnapshot());
      const transform = getWorldTransform();
      const nextKey = keyFor(plan, board, transform);
      if (!force && snapshot && cacheKey === nextKey) {
        lastPrepare = collisionSnapshotStats(snapshot, true);
        lastPrepare.timings.prepareTotalMs = 0;
        return { snapshot, report: cloneValue(lastPrepare) };
      }
      snapshot = createBridgeCollisionSnapshot({
        frozenBuildPlan: plan,
        acceptedBuildBoardSnapshot: board,
        worldTransform: transform,
        includeMergedFaces
      });
      cacheKey = nextKey;
      lastPrepare = collisionSnapshotStats(snapshot, false);
      return { snapshot, report: cloneValue(lastPrepare) };
    },
    invalidate() { snapshot = null; cacheKey = ''; lastPrepare = null; },
    getSnapshot() { return snapshot; },
    getStats() { return cloneValue(lastPrepare); },
    getDebugFaces() { return snapshot ? snapshot.mergedFaces.map((face) => ({ ...face })) : []; }
  });
}
