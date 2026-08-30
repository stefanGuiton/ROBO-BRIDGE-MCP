import { checksumTypedArray } from "./checksums.js";

function addTriangleNormal(normals, positions, a, b, c) {
  const ai = a * 3, bi = b * 3, ci = c * 3;
  const abx = positions[bi] - positions[ai];
  const aby = positions[bi + 1] - positions[ai + 1];
  const abz = positions[bi + 2] - positions[ai + 2];
  const acx = positions[ci] - positions[ai];
  const acy = positions[ci + 1] - positions[ai + 1];
  const acz = positions[ci + 2] - positions[ai + 2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  for (const index of [ai, bi, ci]) {
    normals[index] += nx;
    normals[index + 1] += ny;
    normals[index + 2] += nz;
  }
}

function calculateNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let offset = 0; offset < indices.length; offset += 3) {
    addTriangleNormal(normals, positions, indices[offset], indices[offset + 1], indices[offset + 2]);
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]) || 1;
    normals[offset] /= length;
    normals[offset + 1] /= length;
    normals[offset + 2] /= length;
  }
  return normals;
}

function perimeterIndices(gridU, gridV) {
  const result = [];
  for (let iz = 0; iz < gridV; iz += 1) result.push(iz * gridU);
  for (let ix = 1; ix < gridU; ix += 1) result.push((gridV - 1) * gridU + ix);
  for (let iz = gridV - 2; iz >= 0; iz -= 1) result.push(iz * gridU + gridU - 1);
  for (let ix = gridU - 2; ix >= 1; ix -= 1) result.push(ix);
  return result;
}

export function buildWatertightMesh(settings, heights, slopes, platformMask) {
  const { gridU, gridV, chunkWidth, chunkDepth, valleyFloorY, baseThickness } = settings;
  const topCount = gridU * gridV;
  const perimeter = perimeterIndices(gridU, gridV);
  let minimumHeight = valleyFloorY;
  for (const height of heights) minimumHeight = Math.min(minimumHeight, height);
  const bottomY = Math.fround(minimumHeight - baseThickness);
  const vertexCount = topCount + perimeter.length + 1;
  const positions = new Float32Array(vertexCount * 3);
  const materialIds = new Uint8Array(vertexCount);
  const stepU = chunkWidth / (gridU - 1);
  const stepV = chunkDepth / (gridV - 1);

  for (let iz = 0; iz < gridV; iz += 1) {
    for (let ix = 0; ix < gridU; ix += 1) {
      const index = iz * gridU + ix;
      const offset = index * 3;
      positions[offset] = -chunkWidth / 2 + ix * stepU;
      positions[offset + 1] = heights[index];
      positions[offset + 2] = -chunkDepth / 2 + iz * stepV;
      if (platformMask[index]) materialIds[index] = 0;
      else if (slopes[index] > 0.72) materialIds[index] = 1;
      else if (heights[index] < valleyFloorY + (settings.sharedTopY - valleyFloorY) * 0.3) materialIds[index] = 2;
      else materialIds[index] = 0;
    }
  }

  for (let edgeIndex = 0; edgeIndex < perimeter.length; edgeIndex += 1) {
    const source = perimeter[edgeIndex] * 3;
    const targetVertex = topCount + edgeIndex;
    const target = targetVertex * 3;
    positions[target] = positions[source];
    positions[target + 1] = bottomY;
    positions[target + 2] = positions[source + 2];
    materialIds[targetVertex] = 2;
  }
  const bottomCentre = vertexCount - 1;
  positions[bottomCentre * 3 + 1] = bottomY;
  materialIds[bottomCentre] = 3;

  const indices = [];
  for (let iz = 0; iz < gridV - 1; iz += 1) {
    for (let ix = 0; ix < gridU - 1; ix += 1) {
      const a = iz * gridU + ix;
      const b = a + 1;
      const c = a + gridU;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  for (let edgeIndex = 0; edgeIndex < perimeter.length; edgeIndex += 1) {
    const next = (edgeIndex + 1) % perimeter.length;
    const topA = perimeter[edgeIndex];
    const topB = perimeter[next];
    const bottomA = topCount + edgeIndex;
    const bottomB = topCount + next;
    indices.push(topA, bottomA, topB, topB, bottomA, bottomB);
    indices.push(bottomCentre, bottomB, bottomA);
  }
  const indexArray = new Uint32Array(indices);
  const normals = calculateNormals(positions, indexArray);
  const checksumSource = new Uint8Array(positions.byteLength + indexArray.byteLength);
  checksumSource.set(new Uint8Array(positions.buffer), 0);
  checksumSource.set(new Uint8Array(indexArray.buffer), positions.byteLength);
  return Object.freeze({
    positions,
    normals,
    indices: indexArray,
    materialIds,
    bottomY,
    topVertexCount: topCount,
    vertexCount,
    triangleCount: indexArray.length / 3,
    checksum: checksumTypedArray(checksumSource)
  });
}

export function validateWatertightMesh(meshData) {
  const { positions, indices, vertexCount } = meshData;
  const edgeDegrees = new Map();
  const adjacency = Array.from({ length: vertexCount }, () => []);
  let degenerateTriangles = 0;
  let signedVolume = 0;
  let finite = true;
  let indicesInRange = true;
  const addEdge = (a, b) => {
    const low = Math.min(a, b), high = Math.max(a, b);
    const key = `${low}:${high}`;
    edgeDegrees.set(key, (edgeDegrees.get(key) || 0) + 1);
    adjacency[a].push(b);
    adjacency[b].push(a);
  };
  for (const value of positions) if (!Number.isFinite(value)) finite = false;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2];
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) indicesInRange = false;
    if (a === b || b === c || c === a) degenerateTriangles += 1;
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
    const ai = a * 3, bi = b * 3, ci = c * 3;
    const bx = positions[bi], by = positions[bi + 1], bz = positions[bi + 2];
    const cx = positions[ci], cy = positions[ci + 1], cz = positions[ci + 2];
    signedVolume += (positions[ai] * (by * cz - bz * cy) + positions[ai + 1] * (bz * cx - bx * cz) + positions[ai + 2] * (bx * cy - by * cx)) / 6;
  }
  let nonManifoldEdges = 0;
  for (const degree of edgeDegrees.values()) if (degree !== 2) nonManifoldEdges += 1;
  const visited = new Uint8Array(vertexCount);
  let connectedComponents = 0;
  for (let start = 0; start < vertexCount; start += 1) {
    if (visited[start]) continue;
    connectedComponents += 1;
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const current = stack.pop();
      for (const next of adjacency[current]) if (!visited[next]) { visited[next] = 1; stack.push(next); }
    }
  }
  const valid = finite && indicesInRange && degenerateTriangles === 0 && nonManifoldEdges === 0 && connectedComponents === 1 && Math.abs(signedVolume) > 1e-6;
  return Object.freeze({ valid, finite, indicesInRange, degenerateTriangles, nonManifoldEdges, connectedComponents, signedVolume, volume: Math.abs(signedVolume), edgeCount: edgeDegrees.size });
}

export function buildWaterRibbon(settings, centreline) {
  if (settings.mode !== "river") return null;
  const halfWidth = settings.floorWidth * 0.42;
  const positions = new Float32Array(centreline.length * 2 * 3);
  const indices = new Uint32Array((centreline.length - 1) * 6);
  for (let index = 0; index < centreline.length; index += 1) {
    const previous = centreline[Math.max(0, index - 1)];
    const next = centreline[Math.min(centreline.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const px = -dz / length * halfWidth;
    const pz = dx / length * halfWidth;
    const offset = index * 6;
    positions[offset] = centreline[index].x + px;
    positions[offset + 1] = settings.waterLevel;
    positions[offset + 2] = centreline[index].z + pz;
    positions[offset + 3] = centreline[index].x - px;
    positions[offset + 4] = settings.waterLevel;
    positions[offset + 5] = centreline[index].z - pz;
    if (index < centreline.length - 1) {
      const target = index * 6;
      const a = index * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.set([a, b, c, c, b, d], target);
    }
  }
  return Object.freeze({ positions, indices, vertexCount: centreline.length * 2, triangleCount: (centreline.length - 1) * 2 });
}
