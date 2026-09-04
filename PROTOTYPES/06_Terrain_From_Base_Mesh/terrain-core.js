export const EMPTY_LAYER = -32768;

export function computeGridShape(bounds, blockWidth, offsetX = 0, offsetZ = 0) {
  const originX = bounds.minX + offsetX;
  const originZ = bounds.minZ + offsetZ;
  const cols = Math.max(1, Math.ceil((bounds.maxX - originX) / blockWidth));
  const rows = Math.max(1, Math.ceil((bounds.maxZ - originZ) / blockWidth));
  return { originX, originZ, cols, rows };
}

function barycentricXZ(x, z, ax, az, bx, bz, cx, cz) {
  const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(den) < 1e-12) return null;
  const w0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
  const w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
  const w2 = 1 - w0 - w1;
  if (w0 < -1e-8 || w1 < -1e-8 || w2 < -1e-8) return null;
  return [w0, w1, w2];
}

function wrap01(v) {
  v %= 1;
  return v < 0 ? v + 1 : v;
}

export function sampleImageBilinear(image, u, v) {
  if (!image) return [255, 255, 255];
  u = wrap01(u);
  v = wrap01(v);
  const x = u * (image.width - 1);
  const y = (1 - v) * (image.height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, image.width - 1);
  const y1 = Math.min(y0 + 1, image.height - 1);
  const tx = x - x0, ty = y - y0;
  const d = image.data;
  const at = (xx, yy, c) => d[(yy * image.width + xx) * 4 + c];
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c00 = at(x0, y0, c), c10 = at(x1, y0, c);
    const c01 = at(x0, y1, c), c11 = at(x1, y1, c);
    const c0 = c00 * (1 - tx) + c10 * tx;
    const c1 = c01 * (1 - tx) + c11 * tx;
    out[c] = Math.max(0, Math.min(255, Math.round(c0 * (1 - ty) + c1 * ty)));
  }
  return out;
}

function applyTextureMatrix(u, v, m) {
  if (!m) return [u, v];
  return [m[0] * u + m[3] * v + m[6], m[1] * u + m[4] * v + m[7]];
}

export async function compileHeightGrid(input, options = {}) {
  const {
    positions, uvs, indices, bounds, baseImage, ambientImage = null, aoImage = null,
    textureMatrix = null,
  } = input;
  const blockWidth = Number(options.blockWidth);
  const blockHeight = Number(options.blockHeight);
  if (!(blockWidth > 0) || !(blockHeight > 0)) throw new Error('Block dimensions must be greater than zero.');
  const offsetX = Number(options.offsetX || 0);
  const offsetZ = Number(options.offsetZ || 0);
  const { originX, originZ, cols, rows } = computeGridShape(bounds, blockWidth, offsetX, offsetZ);
  const totalCells = rows * cols;
  const maxCells = options.maxCells ?? 250000;
  if (totalCells > maxCells) throw new Error(`Grid has ${totalCells.toLocaleString()} cells. Limit is ${maxCells.toLocaleString()}.`);

  const triCount = indices ? indices.length / 3 : positions.length / 9;
  const vi = (face, corner) => indices ? indices[face * 3 + corner] : face * 3 + corner;
  const pos = (vertex, axis) => positions[vertex * 3 + axis];

  // Use a compact CSR index instead of one JavaScript array for each cell.
  const counts = new Uint32Array(totalCells);
  const faceCellRange = (f) => {
    const a = vi(f, 0), b = vi(f, 1), c = vi(f, 2);
    const ax = pos(a, 0), az = pos(a, 2), bx = pos(b, 0), bz = pos(b, 2), cx = pos(c, 0), cz = pos(c, 2);
    const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx);
    const minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
    const c0 = Math.max(0, Math.floor((minX - originX) / blockWidth));
    const c1 = Math.min(cols - 1, Math.floor((maxX - originX) / blockWidth));
    const r0 = Math.max(0, Math.floor((minZ - originZ) / blockWidth));
    const r1 = Math.min(rows - 1, Math.floor((maxZ - originZ) / blockWidth));
    return [c0, c1, r0, r1];
  };
  for (let f = 0; f < triCount; f++) {
    const [c0,c1,r0,r1] = faceCellRange(f);
    if (c0 > c1 || r0 > r1) continue;
    for (let r = r0; r <= r1; r++) {
      const base = r * cols;
      for (let c = c0; c <= c1; c++) counts[base + c]++;
    }
  }
  const offsets = new Uint32Array(totalCells + 1);
  for (let i = 0; i < totalCells; i++) offsets[i + 1] = offsets[i] + counts[i];
  const refs = new Uint32Array(offsets[totalCells]);
  const cursor = offsets.slice(0, totalCells);
  for (let f = 0; f < triCount; f++) {
    const [c0,c1,r0,r1] = faceCellRange(f);
    if (c0 > c1 || r0 > r1) continue;
    for (let r = r0; r <= r1; r++) {
      const base = r * cols;
      for (let c = c0; c <= c1; c++) {
        const cell = base + c;
        refs[cursor[cell]++] = f;
      }
    }
  }

  const heights = new Int16Array(totalCells); heights.fill(EMPTY_LAYER);
  const colors = new Uint8Array(totalCells * 3);
  const hitUV = new Float32Array(totalCells * 2); hitUV.fill(Number.NaN);
  const baseY = bounds.minY;
  const bakedStrength = Math.max(0, Math.min(1, Number(options.bakedStrength ?? 1)));
  const aoStrength = Math.max(0, Math.min(2, Number(options.aoStrength ?? 1)));
  const batchSize = Math.max(256, Math.floor(options.batchSize || 2048));
  let occupied = 0;

  for (let cell = 0; cell < totalCells; cell++) {
    if (options.shouldCancel?.()) throw new Error('Compile cancelled.');
    const r = Math.floor(cell / cols), c = cell - r * cols;
    const x = originX + (c + 0.5) * blockWidth;
    const z = originZ + (r + 0.5) * blockWidth;
    let bestY = -Infinity, bestU = 0, bestV = 0;
    const start = offsets[cell], end = offsets[cell + 1];
    for (let k = start; k < end; k++) {
      const f = refs[k];
      const ia = vi(f, 0), ib = vi(f, 1), ic = vi(f, 2);
      const ax = pos(ia, 0), ay = pos(ia, 1), az = pos(ia, 2);
      const bx = pos(ib, 0), by = pos(ib, 1), bz = pos(ib, 2);
      const cx = pos(ic, 0), cy = pos(ic, 1), cz = pos(ic, 2);
      const bc = barycentricXZ(x, z, ax, az, bx, bz, cx, cz);
      if (!bc) continue;
      const y = bc[0] * ay + bc[1] * by + bc[2] * cy;
      if (y <= bestY) continue;
      bestY = y;
      if (uvs) {
        bestU = bc[0] * uvs[ia * 2] + bc[1] * uvs[ib * 2] + bc[2] * uvs[ic * 2];
        bestV = bc[0] * uvs[ia * 2 + 1] + bc[1] * uvs[ib * 2 + 1] + bc[2] * uvs[ic * 2 + 1];
      }
    }
    if (Number.isFinite(bestY)) {
      const layer = Math.max(-32767, Math.min(32767, Math.round((bestY - baseY) / blockHeight)));
      heights[cell] = layer;
      const tuv = applyTextureMatrix(bestU, bestV, textureMatrix);
      hitUV[cell * 2] = tuv[0]; hitUV[cell * 2 + 1] = tuv[1];
      const base = sampleImageBilinear(baseImage, tuv[0], tuv[1]);
      let final = base;
      if (ambientImage) {
        const baked = sampleImageBilinear(ambientImage, tuv[0], tuv[1]);
        final = [0,1,2].map(i => Math.round(base[i] * (1 - bakedStrength) + baked[i] * bakedStrength));
      }
      if (aoImage) {
        const ao = sampleImageBilinear(aoImage, tuv[0], tuv[1]);
        const a = ((ao[0] + ao[1] + ao[2]) / (3 * 255));
        const factor = Math.max(0, Math.min(1, 1 - aoStrength * (1 - a)));
        final = final.map(v => Math.round(v * factor));
      }
      colors.set(final, cell * 3);
      occupied++;
    }
    if (cell % batchSize === 0) {
      options.onProgress?.(cell / totalCells);
      if (options.yieldControl) await options.yieldControl();
    }
  }
  options.onProgress?.(1);
  return { heights, colors, hitUV, rows, cols, originX, originZ, baseY, blockWidth, blockHeight, occupied, totalCells, candidateRefs: refs.length, bounds };
}

export function applyHeightAO(grid, strength = 0.18) {
  strength = Math.max(0, Math.min(1, Number(strength)));
  if (!strength) return grid.colors.slice();
  const { rows, cols, heights, colors } = grid;
  const out = colors.slice();
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, h = heights[i];
    if (h === EMPTY_LAYER) continue;
    let occ = 0, n = 0;
    for (const [dr,dc] of dirs) {
      const rr=r+dr, cc=c+dc;
      if (rr<0||rr>=rows||cc<0||cc>=cols) continue;
      const nh=heights[rr*cols+cc]; if (nh===EMPTY_LAYER) continue;
      occ += Math.min(Math.max(nh-h,0),4)/4; n++;
    }
    const factor = 1 - strength * (n ? occ/n : 0);
    out[i*3] = Math.round(out[i*3]*factor);
    out[i*3+1] = Math.round(out[i*3+1]*factor);
    out[i*3+2] = Math.round(out[i*3+2]*factor);
  }
  return out;
}

export function countSideWalls(grid) {
  const { rows, cols, heights } = grid;
  let count = 0;
  for (let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
    const cur=heights[r*cols+c]; if(cur===EMPTY_LAYER) continue;
    for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const rr=r+dr, cc=c+dc;
      const nb=(rr<0||rr>=rows||cc<0||cc>=cols)?EMPTY_LAYER:heights[rr*cols+cc];
      if(nb===EMPTY_LAYER || cur>nb) count++;
    }
  }
  return count;
}

export function sideWallQuad(side, x0, x1, z0, z1, low, high) {
  switch (side) {
    case 'N':
      return {
        vertices: [[x1, low, z0], [x0, low, z0], [x0, high, z0], [x1, high, z0]],
        normal: [0, 0, -1],
      };
    case 'S':
      return {
        vertices: [[x0, low, z1], [x1, low, z1], [x1, high, z1], [x0, high, z1]],
        normal: [0, 0, 1],
      };
    case 'W':
      return {
        vertices: [[x0, low, z0], [x0, low, z1], [x0, high, z1], [x0, high, z0]],
        normal: [-1, 0, 0],
      };
    case 'E':
      return {
        vertices: [[x1, low, z1], [x1, low, z0], [x1, high, z0], [x1, high, z1]],
        normal: [1, 0, 0],
      };
    default:
      throw new Error(`Unknown side wall direction: ${side}`);
  }
}

export function createCellBinary(grid, colors = grid.colors) {
  const count = grid.rows * grid.cols;
  const buffer = new ArrayBuffer(count * 6);
  const view = new DataView(buffer);
  for (let i=0;i<count;i++) {
    const layer=grid.heights[i]; const off=i*6;
    const empty=layer===EMPTY_LAYER;
    view.setInt16(off, layer, true);
    view.setUint8(off+2, empty?0:colors[i*3]);
    view.setUint8(off+3, empty?0:colors[i*3+1]);
    view.setUint8(off+4, empty?0:colors[i*3+2]);
    view.setUint8(off+5, empty?1:0);
  }
  return buffer;
}

export function parseCellBinary(meta, buffer) {
  const count=meta.rows*meta.cols;
  if(buffer.byteLength!==count*6) throw new Error('Cell binary size does not match metadata.');
  const view=new DataView(buffer); const heights=new Int16Array(count); const colors=new Uint8Array(count*3);
  let occupied=0;
  for(let i=0;i<count;i++) {
    const off=i*6, h=view.getInt16(off,true), flags=view.getUint8(off+5); heights[i]=h;
    if(!(flags&1)) { colors[i*3]=view.getUint8(off+2); colors[i*3+1]=view.getUint8(off+3); colors[i*3+2]=view.getUint8(off+4); occupied++; }
  }
  return { heights, colors, rows:meta.rows, cols:meta.cols, originX:meta.gridOrigin[0], originZ:meta.gridOrigin[1], baseY:meta.baseHeight, blockWidth:meta.blockWidth, blockHeight:meta.blockHeight, occupied, totalCells:count };
}

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
