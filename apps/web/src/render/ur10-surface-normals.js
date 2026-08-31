export const UR10_NORMAL_DEFAULTS = Object.freeze({ mode: 'smooth', angleDeg: 15, weldToleranceMm: 0.002, weighting: 'corner', clean: true });

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const safeAcos = (value) => Math.acos(clamp(value, -1, 1));

function buildTopology(positions, indices, weldToleranceMm, clean) {
  const tolerance = Math.max(1e-10, weldToleranceMm / 1000);
  const vertexCount = positions.length / 3;
  const weldedMap = new Int32Array(vertexCount);
  const keys = new Map();
  const weldedPositions = [];
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const x = positions[vertex * 3], y = positions[vertex * 3 + 1], z = positions[vertex * 3 + 2];
    const key = `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`;
    let welded = keys.get(key);
    if (welded === undefined) { welded = weldedPositions.length / 3; keys.set(key, welded); weldedPositions.push(x, y, z); }
    weldedMap[vertex] = welded;
  }
  const faceVertices = [], faceNormals = [], faceAreas = [], cornerAngles = [];
  let removed = 0;
  for (let triangle = 0; triangle + 2 < indices.length; triangle += 3) {
    const v0 = weldedMap[indices[triangle]], v1 = weldedMap[indices[triangle + 1]], v2 = weldedMap[indices[triangle + 2]];
    if (v0 === v1 || v1 === v2 || v2 === v0) { removed += 1; continue; }
    const ax = weldedPositions[v0 * 3], ay = weldedPositions[v0 * 3 + 1], az = weldedPositions[v0 * 3 + 2];
    const bx = weldedPositions[v1 * 3], by = weldedPositions[v1 * 3 + 1], bz = weldedPositions[v1 * 3 + 2];
    const cx = weldedPositions[v2 * 3], cy = weldedPositions[v2 * 3 + 1], cz = weldedPositions[v2 * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const area2 = Math.hypot(nx, ny, nz);
    if (area2 <= (clean ? 1e-10 : 1e-18)) { removed += 1; continue; }
    faceVertices.push(v0, v1, v2); faceNormals.push(nx / area2, ny / area2, nz / area2); faceAreas.push(area2 * 0.5);
    const points = [[ax, ay, az], [bx, by, bz], [cx, cy, cz]];
    for (let corner = 0; corner < 3; corner += 1) {
      const q = points[corner], q1 = points[(corner + 1) % 3], q2 = points[(corner + 2) % 3];
      const ux = q1[0] - q[0], uy = q1[1] - q[1], uz = q1[2] - q[2];
      const vx = q2[0] - q[0], vy = q2[1] - q[1], vz = q2[2] - q[2];
      const lengthU = Math.hypot(ux, uy, uz) || 1, lengthV = Math.hypot(vx, vy, vz) || 1;
      cornerAngles.push(safeAcos((ux * vx + uy * vy + uz * vz) / (lengthU * lengthV)));
    }
  }
  const edgeMap = new Map();
  const addEdge = (face, corner0, corner1, a, b) => {
    if (a > b) { [a, b] = [b, a]; [corner0, corner1] = [corner1, corner0]; }
    const key = `${a}|${b}`, record = edgeMap.get(key);
    if (!record) edgeMap.set(key, [1, face, corner0, corner1, -1, -1, -1]);
    else if (record[0] === 1) { record[0] = 2; record[4] = face; record[5] = corner0; record[6] = corner1; }
    else record[0] = 3;
  };
  for (let face = 0; face < faceAreas.length; face += 1) {
    const corner = face * 3, v0 = faceVertices[corner], v1 = faceVertices[corner + 1], v2 = faceVertices[corner + 2];
    addEdge(face, corner, corner + 1, v0, v1); addEdge(face, corner + 1, corner + 2, v1, v2); addEdge(face, corner + 2, corner, v2, v0);
  }
  const edgePairs = [];
  for (const record of edgeMap.values()) if (record[0] === 2) edgePairs.push(...record.slice(1));
  return { weldedPositions: new Float32Array(weldedPositions), faceVertices: new Int32Array(faceVertices), faceNormals: new Float32Array(faceNormals), faceAreas: new Float32Array(faceAreas), cornerAngles: new Float32Array(cornerAngles), edges: new Int32Array(edgePairs), removed };
}

function root(parent, value) { let result = value; while (parent[result] !== result) result = parent[result]; while (parent[value] !== value) { const next = parent[value]; parent[value] = result; value = next; } return result; }
function join(parent, rank, a, b) { a = root(parent, a); b = root(parent, b); if (a === b) return; if (rank[a] < rank[b]) [a, b] = [b, a]; parent[b] = a; if (rank[a] === rank[b]) rank[a] += 1; }
function weight(topology, corner, mode) { return mode === 'uniform' ? 1 : mode === 'area' ? topology.faceAreas[Math.floor(corner / 3)] : topology.cornerAngles[corner]; }

function buildFlat(topology) {
  const cornerCount = topology.faceVertices.length, positions = new Float32Array(cornerCount * 3), normals = new Float32Array(cornerCount * 3), indices = new Uint32Array(cornerCount);
  for (let corner = 0; corner < cornerCount; corner += 1) {
    const vertex = topology.faceVertices[corner], face = Math.floor(corner / 3);
    positions.set(topology.weldedPositions.subarray(vertex * 3, vertex * 3 + 3), corner * 3);
    normals.set(topology.faceNormals.subarray(face * 3, face * 3 + 3), corner * 3); indices[corner] = corner;
  }
  return { positions, normals, indices, diagnostics: { triangles: cornerCount / 3, renderVertices: cornerCount, removedFaces: topology.removed } };
}

function buildSmooth(topology, angleDeg, weighting) {
  const cornerCount = topology.faceVertices.length, parent = new Int32Array(cornerCount), rank = new Uint8Array(cornerCount);
  for (let index = 0; index < cornerCount; index += 1) parent[index] = index;
  const cosine = Math.cos(angleDeg * Math.PI / 180);
  for (let index = 0; index < topology.edges.length; index += 6) {
    const firstFace = topology.edges[index], secondFace = topology.edges[index + 3];
    const dot = topology.faceNormals[firstFace * 3] * topology.faceNormals[secondFace * 3] + topology.faceNormals[firstFace * 3 + 1] * topology.faceNormals[secondFace * 3 + 1] + topology.faceNormals[firstFace * 3 + 2] * topology.faceNormals[secondFace * 3 + 2];
    if (dot >= cosine) { join(parent, rank, topology.edges[index + 1], topology.edges[index + 4]); join(parent, rank, topology.edges[index + 2], topology.edges[index + 5]); }
  }
  const sums = new Float64Array(cornerCount * 3);
  for (let corner = 0; corner < cornerCount; corner += 1) {
    const component = root(parent, corner), face = Math.floor(corner / 3), amount = weight(topology, corner, weighting);
    sums[component * 3] += topology.faceNormals[face * 3] * amount; sums[component * 3 + 1] += topology.faceNormals[face * 3 + 1] * amount; sums[component * 3 + 2] += topology.faceNormals[face * 3 + 2] * amount;
  }
  const componentToVertex = new Int32Array(cornerCount); componentToVertex.fill(-1);
  const positions = new Float32Array(cornerCount * 3), normals = new Float32Array(cornerCount * 3), indices = new Uint32Array(cornerCount);
  let renderVertices = 0;
  for (let corner = 0; corner < cornerCount; corner += 1) {
    const component = root(parent, corner); let outputVertex = componentToVertex[component];
    if (outputVertex < 0) {
      outputVertex = renderVertices++; componentToVertex[component] = outputVertex;
      const sourceVertex = topology.faceVertices[corner]; positions.set(topology.weldedPositions.subarray(sourceVertex * 3, sourceVertex * 3 + 3), outputVertex * 3);
      const nx = sums[component * 3], ny = sums[component * 3 + 1], nz = sums[component * 3 + 2], length = Math.hypot(nx, ny, nz) || 1;
      normals.set([nx / length, ny / length, nz / length], outputVertex * 3);
    }
    indices[corner] = outputVertex;
  }
  return { positions: positions.slice(0, renderVertices * 3), normals: normals.slice(0, renderVertices * 3), indices, diagnostics: { triangles: cornerCount / 3, renderVertices, removedFaces: topology.removed } };
}

export function buildUr10SurfaceGeometry({ positions, normals = null, indices, mode = UR10_NORMAL_DEFAULTS.mode, angleDeg = UR10_NORMAL_DEFAULTS.angleDeg, weldToleranceMm = UR10_NORMAL_DEFAULTS.weldToleranceMm, weighting = UR10_NORMAL_DEFAULTS.weighting, clean = UR10_NORMAL_DEFAULTS.clean, edited = false }) {
  if (!(positions instanceof Float32Array) || positions.length % 3 !== 0) throw new TypeError('invalid_positions');
  if (!(indices instanceof Uint8Array || indices instanceof Uint16Array || indices instanceof Uint32Array) || indices.length % 3 !== 0) throw new TypeError('invalid_indices');
  if (!['smooth', 'flat', 'exported', 'hybrid'].includes(mode)) throw new TypeError('invalid_normal_mode');
  if (!['uniform', 'area', 'corner'].includes(weighting)) throw new TypeError('invalid_normal_weighting');
  if (mode === 'exported' || (mode === 'hybrid' && edited)) {
    if (!(normals instanceof Float32Array) || normals.length !== positions.length) throw new TypeError('invalid_normals');
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), diagnostics: { triangles: indices.length / 3, renderVertices: positions.length / 3, removedFaces: 0, mode } };
  }
  const topology = buildTopology(positions, indices, weldToleranceMm, clean);
  const result = mode === 'flat' ? buildFlat(topology) : buildSmooth(topology, angleDeg, weighting);
  result.diagnostics = { ...result.diagnostics, mode, angleDeg, weldToleranceMm, weighting, clean };
  return result;
}

let sharedWorker = null, sequence = 0;
const pending = new Map();
function workerInstance() {
  if (sharedWorker || typeof Worker === 'undefined') return sharedWorker;
  sharedWorker = new Worker(new URL('./ur10-normal-worker.js', import.meta.url), { type: 'module' });
  sharedWorker.onmessage = ({ data }) => { const request = pending.get(data.id); if (!request) return; pending.delete(data.id); if (data.ok) request.resolve({ positions: new Float32Array(data.positions), normals: new Float32Array(data.normals), indices: new Uint32Array(data.indices), diagnostics: data.diagnostics }); else request.reject(new Error(data.reason ?? 'normal_rebuild_failed')); };
  sharedWorker.onerror = () => { for (const request of pending.values()) request.reject(new Error('normal_worker_failed')); pending.clear(); sharedWorker?.terminate(); sharedWorker = null; };
  return sharedWorker;
}

export async function buildUr10SurfaceGeometryAsync(options) {
  const worker = workerInstance();
  if (!worker) return buildUr10SurfaceGeometry(options);
  const id = ++sequence, positions = new Float32Array(options.positions), normals = options.normals ? new Float32Array(options.normals) : null, indices = new Uint32Array(options.indices);
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); const transfer = [positions.buffer, indices.buffer]; if (normals) transfer.push(normals.buffer); worker.postMessage({ id, ...options, positions: positions.buffer, normals: normals?.buffer ?? null, indices: indices.buffer }, transfer); });
}
