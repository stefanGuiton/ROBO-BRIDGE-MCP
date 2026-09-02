import { configureTerrainMaterial, configureTerrainMesh } from './terrain-material.js';

const COMPONENTS = Object.freeze({
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array
});
const ITEM_SIZE = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 });

export function parseGlb(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('invalid_glb_magic');
  if (view.getUint32(4, true) !== 2) throw new Error('unsupported_glb_version');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    const chunk = bytes.subarray(offset, offset + length);
    offset += length;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk).replace(/\0+$/, '').trim());
    if (type === 0x004e4942) bin = chunk;
  }
  if (!json || !bin) throw new Error('glb_chunks_missing');
  return { json, bin };
}

function accessorArray(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const Ctor = COMPONENTS[accessor.componentType];
  const itemSize = ITEM_SIZE[accessor.type];
  if (!Ctor || !itemSize) throw new Error(`unsupported_accessor:${accessorIndex}`);
  if (accessor.sparse) throw new Error('sparse_accessor_not_supported');
  const componentBytes = Ctor.BYTES_PER_ELEMENT;
  const byteStride = view.byteStride ?? itemSize * componentBytes;
  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (byteStride === itemSize * componentBytes) {
    const source = new Ctor(glb.bin.buffer, glb.bin.byteOffset + byteOffset, accessor.count * itemSize);
    return { array: new Ctor(source), itemSize, normalized: Boolean(accessor.normalized) };
  }
  const out = new Ctor(accessor.count * itemSize);
  const data = new DataView(glb.bin.buffer, glb.bin.byteOffset + byteOffset, byteStride * accessor.count);
  const getter = Ctor === Float32Array ? 'getFloat32' : Ctor === Uint32Array ? 'getUint32' : Ctor === Uint16Array ? 'getUint16' : Ctor === Int16Array ? 'getInt16' : Ctor === Uint8Array ? 'getUint8' : 'getInt8';
  for (let i = 0; i < accessor.count; i += 1) {
    for (let j = 0; j < itemSize; j += 1) out[i * itemSize + j] = data[getter](i * byteStride + j * componentBytes, true);
  }
  return { array: out, itemSize, normalized: Boolean(accessor.normalized) };
}

async function textureFromImage(glb, imageIndex, THREE, { colour = false } = {}) {
  const image = glb.json.images?.[imageIndex];
  if (!image || image.bufferView === undefined) return null;
  const view = glb.json.bufferViews[image.bufferView];
  const bytes = glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const blob = new Blob([bytes], { type: image.mimeType ?? 'application/octet-stream' });
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'none' });
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

async function makeMaterial(glb, materialIndex, THREE) {
  const source = glb.json.materials?.[materialIndex] ?? {};
  const pbr = source.pbrMetallicRoughness ?? {};
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().fromArray(pbr.baseColorFactor?.slice(0, 3) ?? [1, 1, 1]),
    opacity: pbr.baseColorFactor?.[3] ?? 1,
    metalness: pbr.metallicFactor ?? 1,
    roughness: pbr.roughnessFactor ?? 1,
    transparent: (pbr.baseColorFactor?.[3] ?? 1) < 1
  });
  if (pbr.baseColorTexture) {
    const texInfo = glb.json.textures[pbr.baseColorTexture.index];
    material.map = await textureFromImage(glb, texInfo.source, THREE, { colour: true });
  }
  if (source.normalTexture) {
    const texInfo = glb.json.textures[source.normalTexture.index];
    material.normalMap = await textureFromImage(glb, texInfo.source, THREE);
    material.normalScale.set(source.normalTexture.scale ?? 1, source.normalTexture.scale ?? 1);
  }
  if (pbr.metallicRoughnessTexture) {
    const texInfo = glb.json.textures[pbr.metallicRoughnessTexture.index];
    const combined = await textureFromImage(glb, texInfo.source, THREE);
    material.metalnessMap = combined;
    material.roughnessMap = combined;
  }
  return configureTerrainMaterial(material, THREE);
}

export async function decodeTerrainArrayBuffer(buffer, THREE) {
  const decodeStarted = performance.now();
  const glbParseStarted = performance.now();
  const glb = parseGlb(buffer);
  const glbParseMs = performance.now() - glbParseStarted;
  if (glb.json.extensionsRequired?.length) throw new Error(`unsupported_glb_extensions:${glb.json.extensionsRequired.join(',')}`);
  const root = new THREE.Group();
  root.name = 'ROBO_BRIDGE_TERRAIN_ROOT';
  let primitiveCount = 0;
  let triangleCount = 0;
  const materialCache = new Map();
  for (const meshDef of glb.json.meshes ?? []) {
    for (const primitive of meshDef.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4) throw new Error('terrain_requires_triangles');
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, accessorIndex] of Object.entries(primitive.attributes ?? {})) {
        const data = accessorArray(glb, accessorIndex);
        const name = semantic === 'POSITION' ? 'position' : semantic === 'NORMAL' ? 'normal' : semantic === 'TEXCOORD_0' ? 'uv' : null;
        if (name) geometry.setAttribute(name, new THREE.BufferAttribute(data.array, data.itemSize, data.normalized));
      }
      if (primitive.indices !== undefined) {
        const data = accessorArray(glb, primitive.indices);
        geometry.setIndex(new THREE.BufferAttribute(data.array, 1, data.normalized));
        triangleCount += data.array.length / 3;
      } else {
        triangleCount += geometry.getAttribute('position').count / 3;
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const key = primitive.material ?? -1;
      if (!materialCache.has(key)) materialCache.set(key, await makeMaterial(glb, primitive.material, THREE));
      const mesh = configureTerrainMesh(new THREE.Mesh(geometry, materialCache.get(key)));
      root.add(mesh);
      primitiveCount += 1;
    }
  }
  const decodeMs = performance.now() - decodeStarted;
  return {
    root,
    metrics: Object.freeze({
      meshCount: root.children.length,
      primitiveCount,
      triangleCount,
      materialCount: materialCache.size,
      drawCallsExpected: primitiveCount,
      glbParseMs,
      decodeMs,
      parseMs: decodeMs
    })
  };
}

export async function loadTerrainAsset({ url, THREE, fetchImpl = fetch }) {
  const loadStarted = performance.now();
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`terrain_fetch_failed:${response.status}`);
  const buffer = await response.arrayBuffer();
  const fetchMs = performance.now() - loadStarted;
  const decoded = await decodeTerrainArrayBuffer(buffer, THREE);
  return {
    ...decoded,
    metrics: Object.freeze({ ...decoded.metrics, bytes: buffer.byteLength, fetchMs, loadMs: performance.now() - loadStarted })
  };
}

export function applyTerrainTransform(root, transform) {
  root.position.set(transform.position.x, transform.position.y, transform.position.z);
  root.quaternion.set(transform.quaternion.x, transform.quaternion.y, transform.quaternion.z, transform.quaternion.w);
  root.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
  root.updateMatrixWorld(true);
  return root;
}
