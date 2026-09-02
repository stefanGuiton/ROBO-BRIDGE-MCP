'use strict';

import { BridgeCoreError } from './errors.js';

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function appendTriangle(mesh, a, b, c, material = 0) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  for (const point of [a, b, c]) {
    mesh.positions.push(...point);
    mesh.normals.push(nx, ny, nz);
    mesh.materials.push(material);
  }
}

function appendQuad(mesh, a, b, c, d, material = 0) {
  appendTriangle(mesh, a, b, c, material);
  appendTriangle(mesh, a, c, d, material);
}

function appendBox(mesh, centre, size, material = 0) {
  const [cx, cy, cz] = centre;
  const [sx, sy, sz] = size;
  const x0 = cx - sx * 0.5, x1 = cx + sx * 0.5;
  const y0 = cy - sy * 0.5, y1 = cy + sy * 0.5;
  const z0 = cz - sz * 0.5, z1 = cz + sz * 0.5;
  appendQuad(mesh, [x1,y0,z0], [x1,y1,z0], [x1,y1,z1], [x1,y0,z1], material);
  appendQuad(mesh, [x0,y0,z1], [x0,y1,z1], [x0,y1,z0], [x0,y0,z0], material);
  appendQuad(mesh, [x0,y1,z0], [x0,y1,z1], [x1,y1,z1], [x1,y1,z0], material);
  appendQuad(mesh, [x0,y0,z1], [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], material);
  appendQuad(mesh, [x1,y0,z1], [x1,y1,z1], [x0,y1,z1], [x0,y0,z1], material);
  appendQuad(mesh, [x0,y0,z0], [x0,y1,z0], [x1,y1,z0], [x1,y0,z0], material);
}

function finalise(mesh) {
  return {
    positions: new Float32Array(mesh.positions),
    normals: new Float32Array(mesh.normals),
    materials: new Uint8Array(mesh.materials)
  };
}

export function generateArchGeometry(definition) {
  const p = definition?.parameters;
  if (!p || !['ARCH_A', 'ARCH_B'].includes(definition.partClass)) {
    throw new BridgeCoreError('UNSUPPORTED_PART', 'An ARCH_A or ARCH_B definition is required.');
  }
  const dx = p.cellX;
  const dy = p.cellY;
  const dz = p.cellZ;
  const n = p.outerWidthCells;
  const clear = p.clearSpanCells;
  const width = n * dx;
  const halfDepth = dz * 0.5;
  const left = -width * 0.5;
  const openingLeft = left + dx;
  const openingRight = openingLeft + clear * dx;
  const a = clear * dx * 0.5;
  const openingCentre = (openingLeft + openingRight) * 0.5;
  const spring = p.springOffsetLayers * dy;
  const rise = p.riseWorld;
  const mesh = { positions: [], normals: [], materials: [] };
  const topFor = (cell) => p.topLayers[cell] * dy;
  const bottomFor = (x, cell) => {
    if (cell === 0 || cell === n - 1) return p.bottomLayers[cell] * dy;
    const ratio = clamp((x - openingCentre) / Math.max(0.0001, a), -1, 1);
    return spring + rise * Math.sqrt(Math.max(0, 1 - ratio * ratio));
  };
  for (let cell = 0; cell < n; cell += 1) {
    const x0 = left + cell * dx;
    const x1 = x0 + dx;
    const segments = cell === 0 || cell === n - 1 ? 1 : Math.max(1, p.segmentsPerCell);
    const top = topFor(cell);
    for (let segment = 0; segment < segments; segment += 1) {
      const xa = x0 + (x1 - x0) * segment / segments;
      const xb = x0 + (x1 - x0) * (segment + 1) / segments;
      const ya = bottomFor(xa, cell);
      const yb = bottomFor(xb, cell);
      appendQuad(mesh, [xa,ya,halfDepth], [xb,yb,halfDepth], [xb,top,halfDepth], [xa,top,halfDepth], 0);
      appendQuad(mesh, [xa,top,-halfDepth], [xb,top,-halfDepth], [xb,yb,-halfDepth], [xa,ya,-halfDepth], 0);
    }
    appendQuad(mesh, [x0,top,halfDepth], [x1,top,halfDepth], [x1,top,-halfDepth], [x0,top,-halfDepth], 0);
    if (cell === 0 || cell === n - 1) {
      const bottom = p.bottomLayers[cell] * dy;
      appendQuad(mesh, [x0,bottom,-halfDepth], [x1,bottom,-halfDepth], [x1,bottom,halfDepth], [x0,bottom,halfDepth], 0);
    }
    if (cell < n - 1) {
      const nextTop = topFor(cell + 1);
      if (Math.abs(nextTop - top) > 1e-7) {
        const x = x1;
        const low = Math.min(top, nextTop);
        const high = Math.max(top, nextTop);
        if (nextTop > top) appendQuad(mesh, [x,low,-halfDepth], [x,high,-halfDepth], [x,high,halfDepth], [x,low,halfDepth], 0);
        else appendQuad(mesh, [x,low,halfDepth], [x,high,halfDepth], [x,high,-halfDepth], [x,low,-halfDepth], 0);
      }
    }
  }
  const segments = Math.max(16, Math.min(128, clear * Math.max(1, p.segmentsPerCell)));
  for (let segment = 0; segment < segments; segment += 1) {
    const xa = openingLeft + (openingRight - openingLeft) * segment / segments;
    const xb = openingLeft + (openingRight - openingLeft) * (segment + 1) / segments;
    const ya = bottomFor(xa, 1);
    const yb = bottomFor(xb, Math.min(n - 2, clear));
    appendQuad(mesh, [xa,ya,-halfDepth], [xb,yb,-halfDepth], [xb,yb,halfDepth], [xa,ya,halfDepth], 0);
  }
  const leftBottom = p.bottomLayers[0] * dy;
  const rightBottom = p.bottomLayers[n - 1] * dy;
  appendQuad(mesh, [left,leftBottom,halfDepth], [left,topFor(0),halfDepth], [left,topFor(0),-halfDepth], [left,leftBottom,-halfDepth], 0);
  appendQuad(mesh, [left+width,rightBottom,-halfDepth], [left+width,topFor(n-1),-halfDepth], [left+width,topFor(n-1),halfDepth], [left+width,rightBottom,halfDepth], 0);
  if (spring > leftBottom + 1e-7) appendQuad(mesh, [openingLeft,leftBottom,-halfDepth], [openingLeft,spring,-halfDepth], [openingLeft,spring,halfDepth], [openingLeft,leftBottom,halfDepth], 0);
  if (spring > rightBottom + 1e-7) appendQuad(mesh, [openingRight,rightBottom,halfDepth], [openingRight,spring,halfDepth], [openingRight,spring,-halfDepth], [openingRight,rightBottom,-halfDepth], 0);
  return finalise(mesh);
}

export function generateTrackGeometry(definition) {
  const p = definition?.parameters;
  if (!p || definition.partClass !== 'TRACK_SEGMENT') {
    throw new BridgeCoreError('UNSUPPORTED_PART', 'A TRACK_SEGMENT definition is required.');
  }
  const mesh = { positions: [], normals: [], materials: [] };
  const length = p.segmentLength;
  const count = 4;
  const maximumInset = Math.max(0, length * 0.5 - p.sleeperWidth * 0.5);
  const inset = clamp(p.sleeperEndInset, 0, maximumInset);
  const left = -length * 0.5 + inset;
  const right = length * 0.5 - inset;
  for (let index = 0; index < count; index += 1) {
    const x = count === 1 ? 0 : left + (right - left) * index / (count - 1);
    appendBox(mesh, [x, p.sleeperHeight * 0.5, 0], [p.sleeperWidth, p.sleeperHeight, p.sleeperDepth], 1);
  }
  for (const side of [-1, 1]) {
    appendBox(mesh, [0, p.railBase + p.railHeight * 0.5, side * p.railGauge * 0.5], [length, p.railHeight, p.railWidth], 2);
  }
  return finalise(mesh);
}

export function generateCustomPartGeometry(definition) {
  if (definition?.partClass === 'TRACK_SEGMENT') return generateTrackGeometry(definition);
  if (['ARCH_A', 'ARCH_B'].includes(definition?.partClass)) return generateArchGeometry(definition);
  throw new BridgeCoreError('UNSUPPORTED_PART', `Unsupported custom part class: ${String(definition?.partClass)}.`, {
    partClass: definition?.partClass ?? null
  });
}

export function createCustomPartRegistry(buildPlan) {
  if (!buildPlan?.catalogue?.customDefinitions) {
    throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'BuildPlan custom definitions are unavailable.');
  }
  const definitions = new Map(buildPlan.catalogue.customDefinitions.map((definition) => [definition.definitionId, definition]));
  const geometry = new Map();
  return Object.freeze({
    listDefinitions: () => [...definitions.values()].map((definition) => structuredClone(definition)),
    getDefinition: (definitionId) => definitions.has(definitionId) ? structuredClone(definitions.get(definitionId)) : null,
    has: (definitionId) => definitions.has(definitionId),
    getGeometry(definitionId) {
      const definition = definitions.get(definitionId);
      if (!definition) throw new BridgeCoreError('UNSUPPORTED_PART', `Unknown custom definition: ${definitionId}.`);
      if (!geometry.has(definitionId)) geometry.set(definitionId, generateCustomPartGeometry(definition));
      const value = geometry.get(definitionId);
      return {
        positions: value.positions.slice(),
        normals: value.normals.slice(),
        materials: value.materials.slice()
      };
    }
  });
}
