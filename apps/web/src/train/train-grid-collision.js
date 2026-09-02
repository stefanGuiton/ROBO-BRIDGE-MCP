'use strict';

import { clamp, rotateVector } from './math.js';
import { getCollisionBit } from './bridge-collision-snapshot.js';

export function createGridProbeSet(size) {
  const halfX = size.x * 0.49;
  const halfY = size.y * 0.49;
  const halfZ = size.z * 0.49;
  const values = [];
  for (const x of [-halfX, halfX]) for (const y of [-halfY, halfY]) for (const z of [-halfZ, halfZ]) values.push(x, y, z);
  values.push(
    0, -halfY, 0,
    halfX, 0, 0,
    -halfX, 0, 0,
    0, 0, halfZ,
    0, 0, -halfZ,
    halfX, -halfY, 0,
    -halfX, -halfY, 0
  );
  return new Float64Array(values);
}

export function createGridCollisionSystem(snapshot, options = {}) {
  if (!snapshot?.occupancyBits) throw new TypeError('Grid collision requires an immutable collision snapshot.');
  const width = snapshot.width;
  const height = snapshot.height;
  const depth = snapshot.depth;
  const sliceStride = width * height;
  const origin = snapshot.originMm;
  const maximum = snapshot.maximumMm;
  const cellX = snapshot.cellMm.x;
  const cellY = snapshot.cellMm.y;
  const cellZ = snapshot.cellMm.z;
  const invX = snapshot.inverseCellMm.x;
  const invY = snapshot.inverseCellMm.y;
  const invZ = snapshot.inverseCellMm.z;
  const bits = snapshot.occupancyBits;
  const epsilon = Number.isFinite(options.contactEpsilonMm)
    ? Math.max(1e-5, options.contactEpsilonMm)
    : Math.min(cellX, cellY, cellZ) * 0.002;
  const maximumVisits = Math.max(16, Math.round(options.maximumVoxelVisits || 512));
  const restitution = clamp(Number.isFinite(options.restitution) ? options.restitution : 0.05, 0, 0.8);
  const frictionPerSecond = Math.max(0, Number.isFinite(options.frictionPerSecond) ? options.frictionPerSecond : 1.0);
  const angularImpactGain = Math.max(0, Number.isFinite(options.angularImpactGain) ? options.angularImpactGain : 0.00008);
  const counters = {
    sweeps: 0,
    ddaVoxelVisits: 0,
    occupancyTests: 0,
    bridgeContacts: 0,
    penetrationResolves: 0,
    maximumCellsVisitedByOneSweep: 0,
    probeCount: 0
  };
  const stepCounters = { ...counters };

  const addCounter = (name, amount = 1) => {
    counters[name] += amount;
    stepCounters[name] += amount;
  };
  const resetStepCounters = () => {
    for (const key of Object.keys(stepCounters)) stepCounters[key] = 0;
  };
  const index = (x, y, z) => z * sliceStride + y * width + x;
  function occupiedCell(x, y, z) {
    addCounter('occupancyTests');
    if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) return false;
    return getCollisionBit(bits, index(x, y, z));
  }

  function pointCell(x, y, z, out) {
    out.x = Math.floor((x - origin.x) * invX);
    out.y = Math.floor((y - origin.y) * invY);
    out.z = Math.floor((z - origin.z) * invZ);
    return out;
  }

  function segmentInterval(x0, y0, z0, x1, y1, z1, out) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    let t0 = 0;
    let t1 = 1;
    let nx = 0, ny = 0, nz = 0;
    const axes = [
      [x0, dx, origin.x, maximum.x, 0],
      [y0, dy, origin.y, maximum.y, 1],
      [z0, dz, origin.z, maximum.z, 2]
    ];
    for (const [position, direction, minimum, max, axis] of axes) {
      if (Math.abs(direction) < 1e-12) {
        if (position < minimum || position > max) return false;
        continue;
      }
      let near = (minimum - position) / direction;
      let far = (max - position) / direction;
      let sign = -1;
      if (near > far) { [near, far] = [far, near]; sign = 1; }
      if (near > t0) {
        t0 = near;
        nx = ny = nz = 0;
        if (axis === 0) nx = sign;
        else if (axis === 1) ny = sign;
        else nz = sign;
      }
      t1 = Math.min(t1, far);
      if (t0 > t1) return false;
    }
    if (t1 < 0 || t0 > 1) return false;
    out.tEnter = Math.max(0, t0);
    out.tExit = Math.min(1, t1);
    out.nx = nx; out.ny = ny; out.nz = nz;
    return out.tEnter <= out.tExit;
  }

  const interval = {};
  const cell = {};
  function sweepPoint(x0, y0, z0, x1, y1, z1, out) {
    addCounter('sweeps');
    if (!segmentInterval(x0, y0, z0, x1, y1, z1, interval)) return false;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    let t = interval.tEnter;
    const nudge = Math.min(1e-7, Math.max(0, (interval.tExit - interval.tEnter) * 1e-5));
    pointCell(
      x0 + dx * Math.min(interval.tExit, t + nudge),
      y0 + dy * Math.min(interval.tExit, t + nudge),
      z0 + dz * Math.min(interval.tExit, t + nudge),
      cell
    );
    let cx = clamp(cell.x, 0, width - 1);
    let cy = clamp(cell.y, 0, height - 1);
    let cz = clamp(cell.z, 0, depth - 1);
    let entryNx = interval.nx, entryNy = interval.ny, entryNz = interval.nz;
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const deltaX = stepX ? cellX / Math.abs(dx) : Infinity;
    const deltaY = stepY ? cellY / Math.abs(dy) : Infinity;
    const deltaZ = stepZ ? cellZ / Math.abs(dz) : Infinity;
    let maxX = stepX ? ((origin.x + (stepX > 0 ? cx + 1 : cx) * cellX) - x0) / dx : Infinity;
    let maxY = stepY ? ((origin.y + (stepY > 0 ? cy + 1 : cy) * cellY) - y0) / dy : Infinity;
    let maxZ = stepZ ? ((origin.z + (stepZ > 0 ? cz + 1 : cz) * cellZ) - z0) / dz : Infinity;
    let visits = 0;
    while (visits < maximumVisits && t <= interval.tExit + 1e-9) {
      visits += 1;
      addCounter('ddaVoxelVisits');
      if (occupiedCell(cx, cy, cz)) {
        counters.maximumCellsVisitedByOneSweep = Math.max(counters.maximumCellsVisitedByOneSweep, visits);
        stepCounters.maximumCellsVisitedByOneSweep = Math.max(stepCounters.maximumCellsVisitedByOneSweep, visits);
        Object.assign(out, { t, normalX: entryNx, normalY: entryNy, normalZ: entryNz, cellX: cx, cellY: cy, cellZ: cz, visits });
        return true;
      }
      if (maxX <= maxY && maxX <= maxZ) {
        t = maxX; maxX += deltaX; cx += stepX; entryNx = -stepX; entryNy = 0; entryNz = 0;
        if (cx < 0 || cx >= width) break;
      } else if (maxY <= maxZ) {
        t = maxY; maxY += deltaY; cy += stepY; entryNx = 0; entryNy = -stepY; entryNz = 0;
        if (cy < 0 || cy >= height) break;
      } else {
        t = maxZ; maxZ += deltaZ; cz += stepZ; entryNx = 0; entryNy = 0; entryNz = -stepZ;
        if (cz < 0 || cz >= depth) break;
      }
    }
    counters.maximumCellsVisitedByOneSweep = Math.max(counters.maximumCellsVisitedByOneSweep, visits);
    stepCounters.maximumCellsVisitedByOneSweep = Math.max(stepCounters.maximumCellsVisitedByOneSweep, visits);
    return false;
  }

  function pointPenetration(x, y, z, out) {
    pointCell(x, y, z, cell);
    const cx = cell.x, cy = cell.y, cz = cell.z;
    if (!occupiedCell(cx, cy, cz)) return false;
    const x0 = origin.x + cx * cellX, x1 = x0 + cellX;
    const y0 = origin.y + cy * cellY, y1 = y0 + cellY;
    const z0 = origin.z + cz * cellZ, z1 = z0 + cellZ;
    const distances = [x - x0, x1 - x, y - y0, y1 - y, z - z0, z1 - z];
    let best = 0;
    for (let candidate = 1; candidate < distances.length; candidate += 1) if (distances[candidate] < distances[best]) best = candidate;
    Object.assign(out, {
      normalX: best === 0 ? -1 : best === 1 ? 1 : 0,
      normalY: best === 2 ? -1 : best === 3 ? 1 : 0,
      normalZ: best === 4 ? -1 : best === 5 ? 1 : 0,
      penetration: Math.max(0, distances[best]),
      cellX: cx, cellY: cy, cellZ: cz
    });
    return true;
  }

  const previousLocal = {};
  const currentLocal = {};
  const hit = {};
  const penetration = {};
  const probesFor = (body) => body.gridCollisionProbes || (body.gridCollisionProbes = createGridProbeSet(body.size));
  function rotateInto(rotation, x, y, z, out) { Object.assign(out, rotateVector(rotation, { x, y, z })); }

  function applyResponse(body, nx, ny, nz, localX, localY, localZ, dt) {
    const normalSpeed = body.linearVelocity.x * nx + body.linearVelocity.y * ny + body.linearVelocity.z * nz;
    if (normalSpeed >= 0) return;
    const normalOut = -normalSpeed * restitution;
    const friction = Math.exp(-frictionPerSecond * dt);
    const tangentX = (body.linearVelocity.x - normalSpeed * nx) * friction;
    const tangentY = (body.linearVelocity.y - normalSpeed * ny) * friction;
    const tangentZ = (body.linearVelocity.z - normalSpeed * nz) * friction;
    body.linearVelocity.x = tangentX + normalOut * nx;
    body.linearVelocity.y = tangentY + normalOut * ny;
    body.linearVelocity.z = tangentZ + normalOut * nz;
    const impact = Math.max(0, -normalSpeed) * angularImpactGain;
    body.angularVelocity.x += (localY * nz - localZ * ny) * impact;
    body.angularVelocity.y += (localZ * nx - localX * nz) * impact;
    body.angularVelocity.z += (localX * ny - localY * nx) * impact;
  }

  function resolveBodySweep(body, previousPosition, previousRotation, dt) {
    const probes = probesFor(body);
    addCounter('probeCount', probes.length / 3);
    let bestT = 2;
    let bestNx = 0, bestNy = 0, bestNz = 0, bestLocalX = 0, bestLocalY = 0, bestLocalZ = 0;
    for (let offset = 0; offset < probes.length; offset += 3) {
      const lx = probes[offset], ly = probes[offset + 1], lz = probes[offset + 2];
      rotateInto(previousRotation, lx, ly, lz, previousLocal);
      rotateInto(body.rotation, lx, ly, lz, currentLocal);
      if (sweepPoint(
        previousPosition.x + previousLocal.x,
        previousPosition.y + previousLocal.y,
        previousPosition.z + previousLocal.z,
        body.position.x + currentLocal.x,
        body.position.y + currentLocal.y,
        body.position.z + currentLocal.z,
        hit
      ) && hit.t < bestT) {
        bestT = hit.t;
        bestNx = hit.normalX; bestNy = hit.normalY; bestNz = hit.normalZ;
        bestLocalX = currentLocal.x; bestLocalY = currentLocal.y; bestLocalZ = currentLocal.z;
      }
    }
    if (bestT > 1) return false;
    const safeT = Math.max(0, bestT - 1e-4);
    body.position.x = previousPosition.x + (body.position.x - previousPosition.x) * safeT + bestNx * epsilon;
    body.position.y = previousPosition.y + (body.position.y - previousPosition.y) * safeT + bestNy * epsilon;
    body.position.z = previousPosition.z + (body.position.z - previousPosition.z) * safeT + bestNz * epsilon;
    body.contacts += 1;
    body.collisionKind = 'bridge-grid';
    body.contactNormal = { x: bestNx, y: bestNy, z: bestNz };
    applyResponse(body, bestNx, bestNy, bestNz, bestLocalX, bestLocalY, bestLocalZ, dt);
    addCounter('bridgeContacts');
    return true;
  }

  function resolveBodyPenetration(body, dt, maximumIterations = 2) {
    const probes = probesFor(body);
    let changed = false;
    for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
      let bestDepth = -1;
      let nx = 0, ny = 0, nz = 0, localX = 0, localY = 0, localZ = 0;
      for (let offset = 0; offset < probes.length; offset += 3) {
        const lx = probes[offset], ly = probes[offset + 1], lz = probes[offset + 2];
        rotateInto(body.rotation, lx, ly, lz, currentLocal);
        if (!pointPenetration(body.position.x + currentLocal.x, body.position.y + currentLocal.y, body.position.z + currentLocal.z, penetration)) continue;
        if (penetration.penetration > bestDepth) {
          bestDepth = penetration.penetration;
          nx = penetration.normalX; ny = penetration.normalY; nz = penetration.normalZ;
          localX = currentLocal.x; localY = currentLocal.y; localZ = currentLocal.z;
        }
      }
      if (bestDepth < 0) break;
      body.position.x += nx * (bestDepth + epsilon);
      body.position.y += ny * (bestDepth + epsilon);
      body.position.z += nz * (bestDepth + epsilon);
      body.contacts += 1;
      body.collisionKind = 'bridge-grid';
      body.contactNormal = { x: nx, y: ny, z: nz };
      applyResponse(body, nx, ny, nz, localX, localY, localZ, dt);
      addCounter('bridgeContacts');
      addCounter('penetrationResolves');
      changed = true;
    }
    return changed;
  }

  return Object.freeze({
    snapshot,
    resetStepCounters,
    occupiedCell,
    sweepPoint,
    pointPenetration,
    resolveBodySweep,
    resolveBodyPenetration,
    getCounters() { return { total: { ...counters }, step: { ...stepCounters } }; }
  });
}
