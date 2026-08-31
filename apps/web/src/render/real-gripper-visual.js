import * as THREE from '../../vendor/three.module.min.js';
import { jawAnimationFrame, UR10_GRIPPER } from '../robot/gripper-definition.js';

const COMPONENTS = {
  5120: { Ctor: Int8Array }, 5121: { Ctor: Uint8Array },
  5122: { Ctor: Int16Array }, 5123: { Ctor: Uint16Array },
  5125: { Ctor: Uint32Array }, 5126: { Ctor: Float32Array }
};
const ITEM_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

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
    else if (type === 0x004e4942) bin = chunk;
  }
  if (!json || !bin) throw new Error('glb_chunks_missing');
  return { json, bin };
}

export class GlbModel {
  constructor(json, bin) {
    this.gltf = json;
    this.bin = bin;
    this.nodes = [];
    this.nodeByName = new Map();
    this.accessorCache = new Map();
    this.channels = [];
    this.sourceRoot = new THREE.Group();
    this.sourceRoot.name = 'GRIPPER_GLB_SCENE';
    this.buildMaterials();
    this.buildNodes();
    this.buildAnimation();
  }

  accessor(index) {
    if (this.accessorCache.has(index)) return this.accessorCache.get(index);
    const accessor = this.gltf.accessors[index];
    const view = this.gltf.bufferViews[accessor.bufferView];
    const info = COMPONENTS[accessor.componentType];
    const itemSize = ITEM_SIZE[accessor.type];
    if (!info || !itemSize) throw new Error(`unsupported_accessor_${index}`);
    const byteOffset = this.bin.byteOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const array = new info.Ctor(this.bin.buffer, byteOffset, accessor.count * itemSize);
    const result = { array, itemSize, count: accessor.count, normalized: Boolean(accessor.normalized) };
    this.accessorCache.set(index, result);
    return result;
  }

  buildMaterials() {
    this.materials = (this.gltf.materials || []).map((material, index) => {
      const pbr = material.pbrMetallicRoughness || {};
      const colour = pbr.baseColorFactor || [1, 1, 1, 1];
      const clearcoat = material.extensions?.KHR_materials_clearcoat;
      const options = {
        roughness: pbr.roughnessFactor ?? 1,
        metalness: pbr.metallicFactor ?? 1,
        side: material.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        transparent: colour[3] < 0.999,
        opacity: colour[3]
      };
      const result = clearcoat
        ? new THREE.MeshPhysicalMaterial({ ...options, clearcoat: clearcoat.clearcoatFactor ?? 0, clearcoatRoughness: clearcoat.clearcoatRoughnessFactor ?? 0 })
        : new THREE.MeshStandardMaterial(options);
      result.color.setRGB(colour[0], colour[1], colour[2]);
      const emissive = material.emissiveFactor || [0, 0, 0];
      result.emissive?.setRGB(emissive[0], emissive[1], emissive[2]);
      result.name = material.name || `material_${index}`;
      if (pbr.metallicRoughnessTexture) { result.metalness = 0.58; result.roughness = 0.34; }
      return result;
    });
  }

  geometryForMesh(meshIndex) {
    const source = this.gltf.meshes[meshIndex];
    const primitive = source.primitives[0];
    const geometry = new THREE.BufferGeometry();
    const mapping = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', TEXCOORD_1: 'uv1' };
    for (const [sourceName, targetName] of Object.entries(mapping)) {
      const accessorIndex = primitive.attributes[sourceName];
      if (accessorIndex === undefined) continue;
      const accessor = this.accessor(accessorIndex);
      geometry.setAttribute(targetName, new THREE.BufferAttribute(accessor.array, accessor.itemSize, accessor.normalized));
    }
    if (primitive.indices !== undefined) {
      const accessor = this.accessor(primitive.indices);
      geometry.setIndex(new THREE.BufferAttribute(accessor.array, 1, false));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = source.name || `mesh_${meshIndex}`;
    return { geometry, material: this.materials[primitive.material ?? 0] ?? new THREE.MeshStandardMaterial({ color: 0xaaaaaa }) };
  }

  applyNodeTransform(object, node) {
    if (node.matrix) {
      object.matrix.fromArray(node.matrix);
      object.matrix.decompose(object.position, object.quaternion, object.scale);
    } else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
    }
  }

  buildNodes() {
    for (let index = 0; index < this.gltf.nodes.length; index += 1) {
      const node = this.gltf.nodes[index];
      let object;
      if (node.mesh !== undefined) {
        const { geometry, material } = this.geometryForMesh(node.mesh);
        object = new THREE.Mesh(geometry, material);
        object.castShadow = true;
        object.receiveShadow = true;
      } else object = new THREE.Object3D();
      object.name = node.name || `node_${index}`;
      this.applyNodeTransform(object, node);
      this.nodes.push(object);
      this.nodeByName.set(object.name, object);
    }
    for (let index = 0; index < this.gltf.nodes.length; index += 1) {
      for (const child of this.gltf.nodes[index].children || []) this.nodes[index].add(this.nodes[child]);
    }
    const scene = this.gltf.scenes[this.gltf.scene ?? 0];
    for (const root of scene.nodes || []) this.sourceRoot.add(this.nodes[root]);
    this.sourceRoot.updateMatrixWorld(true);
  }

  buildAnimation() {
    const animation = this.gltf.animations?.[0];
    this.duration = 0;
    if (!animation) return;
    for (const channel of animation.channels) {
      const sampler = animation.samplers[channel.sampler];
      const input = this.accessor(sampler.input);
      const output = this.accessor(sampler.output);
      this.duration = Math.max(this.duration, input.array[input.array.length - 1] || 0);
      this.channels.push({
        node: this.nodes[channel.target.node], path: channel.target.path,
        times: input.array, values: output.array, itemSize: output.itemSize,
        interpolation: sampler.interpolation || 'LINEAR'
      });
    }
  }

  sample(channel, time) {
    const { times } = channel;
    if (time <= times[0]) return { first: 0, second: 0, amount: 0 };
    if (time >= times[times.length - 1]) return { first: times.length - 1, second: times.length - 1, amount: 0 };
    let low = 0;
    let high = times.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (times[middle] <= time) low = middle; else high = middle;
    }
    return { first: low, second: high, amount: channel.interpolation === 'STEP' ? 0 : (time - times[low]) / (times[high] - times[low]) };
  }

  applyTime(time) {
    const firstQuaternion = new THREE.Quaternion();
    const secondQuaternion = new THREE.Quaternion();
    for (const channel of this.channels) {
      const { first, second, amount } = this.sample(channel, time);
      const a = first * channel.itemSize;
      const b = second * channel.itemSize;
      const { values, node } = channel;
      if (channel.path === 'translation' || channel.path === 'scale') {
        const target = channel.path === 'translation' ? node.position : node.scale;
        target.set(
          values[a] * (1 - amount) + values[b] * amount,
          values[a + 1] * (1 - amount) + values[b + 1] * amount,
          values[a + 2] * (1 - amount) + values[b + 2] * amount
        );
      } else if (channel.path === 'rotation') {
        firstQuaternion.set(values[a], values[a + 1], values[a + 2], values[a + 3]);
        secondQuaternion.set(values[b], values[b + 1], values[b + 2], values[b + 3]);
        node.quaternion.copy(firstQuaternion).slerp(secondQuaternion, amount);
      }
    }
    this.sourceRoot.updateMatrixWorld(true);
  }
}

export class RealGripperVisual {
  constructor(scene, settings = {}) {
    this.settings = settings;
    this.root = new THREE.Group();
    this.root.name = 'REAL_GRIPPER_ROOT';
    this.root.matrixAutoUpdate = false;
    scene.add(this.root);
    this.axisGroup = new THREE.Group();
    this.baseShift = new THREE.Group();
    this.root.add(this.axisGroup);
    this.axisGroup.add(this.baseShift);
    const axisMap = new THREE.Matrix4().set(0, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1);
    this.axisGroup.quaternion.setFromRotationMatrix(axisMap);
    this.axisGroup.scale.setScalar(1000 * UR10_GRIPPER.uniformScale);
    this.mountRotation = new THREE.Matrix4().makeRotationX(Math.PI);
    this.model = null;
    this.currentFrame = UR10_GRIPPER.animation.openFrame;
    this.targetFrame = this.currentFrame;
    this.animationStartFrame = this.currentFrame;
    this.animationStartedAt = null;
    this.lastAppliedFrame = null;
    this.status = { state: 'loading', reason: null, sourceGlbSha256: UR10_GRIPPER.sourceGlbSha256 };
    this.loadPromise = this.load();
  }

  async load() {
    try {
      const url = new URL(UR10_GRIPPER.assetPath, import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`gripper_asset_http_${response.status}`);
      const { json, bin } = parseGlb(await response.arrayBuffer());
      this.model = new GlbModel(json, bin);
      this.model.applyTime(0);
      const baseNode = this.model.nodeByName.get('ring_steel_0');
      if (!baseNode) throw new Error('gripper_base_reference_missing');
      const box = new THREE.Box3().setFromObject(baseNode);
      this.baseShift.position.set(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);
      this.baseShift.add(this.model.sourceRoot);
      await this.applyMaterialConfig();
      this.captureMaterialDefaults();
      this.applySettings('*');
      this.model.applyTime(this.model.duration * this.currentFrame / 60);
      this.lastAppliedFrame = this.currentFrame;
      this.status = {
        state: 'ready', reason: null, sourceGlbSha256: UR10_GRIPPER.sourceGlbSha256,
        nodes: json.nodes.length, meshes: json.meshes.length, animations: json.animations?.length ?? 0
      };
      return this.status;
    } catch (error) {
      this.status = { ...this.status, state: 'failed', reason: error.message };
      return this.status;
    }
  }

  async applyMaterialConfig() {
    try {
      const response = await fetch(new URL('../../config/gripper/materials.json', import.meta.url));
      if (!response.ok) return;
      const config = await response.json();
      for (const descriptor of config.gripper || []) {
        const material = this.model.materials[descriptor.index];
        if (!material) continue;
        material.color.set(descriptor.color);
        material.metalness = descriptor.metalness;
        material.roughness = descriptor.roughness;
        material.opacity = descriptor.opacity;
        material.transparent = descriptor.opacity < 0.999;
        material.emissive?.set(descriptor.emissive);
        if (descriptor.clearcoat !== null && 'clearcoat' in material) material.clearcoat = descriptor.clearcoat;
        if (descriptor.clearcoatRoughness !== null && 'clearcoatRoughness' in material) material.clearcoatRoughness = descriptor.clearcoatRoughness;
        material.needsUpdate = true;
      }
    } catch { /* GLB material factors remain a safe fallback. */ }
  }

  captureMaterialDefaults() {
    for (const material of this.model?.materials ?? []) {
      material.userData.roboBridgeDefaults = {
        metalness: material.metalness,
        roughness: material.roughness,
        clearcoat: 'clearcoat' in material ? material.clearcoat : null
      };
    }
  }

  applySettings(key = '*') {
    if (!this.model || (key !== '*' && !/^gripperMaterial/.test(key))) return;
    for (const material of this.model.materials) {
      const defaults = material.userData.roboBridgeDefaults;
      if (!defaults) continue;
      material.metalness = Math.max(0, Math.min(1, defaults.metalness * Number(this.settings.gripperMaterialMetalnessScale ?? 1)));
      material.roughness = Math.max(0, Math.min(1, defaults.roughness * Number(this.settings.gripperMaterialRoughnessScale ?? 1)));
      if (defaults.clearcoat !== null) material.clearcoat = Math.max(0, Math.min(1, defaults.clearcoat * Number(this.settings.gripperMaterialClearcoatScale ?? 1)));
      material.needsUpdate = true;
    }
  }

  update(flangeTransform, jawGapMm) {
    this.root.matrix.set(...flangeTransform).multiply(this.mountRotation);
    this.root.matrixWorldNeedsUpdate = true;
    const nextTarget = jawAnimationFrame(jawGapMm);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (Math.abs(nextTarget - this.targetFrame) > 1e-9) {
      this.animationStartFrame = this.currentFrame;
      this.targetFrame = nextTarget;
      this.animationStartedAt = now;
    }
    if (this.animationStartedAt !== null) {
      const u = Math.max(0, Math.min(1, (now - this.animationStartedAt) / UR10_GRIPPER.jawAnimationDurationMs));
      const eased = u * u * u * (10 + u * (-15 + 6 * u));
      this.currentFrame = this.animationStartFrame + (this.targetFrame - this.animationStartFrame) * eased;
      if (u >= 1) { this.currentFrame = this.targetFrame; this.animationStartedAt = null; }
    }
    if (this.model && this.currentFrame !== this.lastAppliedFrame) {
      this.model.applyTime(this.model.duration * this.currentFrame / 60);
      this.lastAppliedFrame = this.currentFrame;
    }
  }

  getStatus() {
    return {
      ...this.status,
      currentFrame: this.currentFrame,
      targetFrame: this.targetFrame,
      uniformScale: UR10_GRIPPER.uniformScale,
      calibration: UR10_GRIPPER.calibration
    };
  }
}

export { THREE };
