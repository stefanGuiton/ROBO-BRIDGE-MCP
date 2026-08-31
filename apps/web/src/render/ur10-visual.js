import { mat4Identity, mat4Multiply } from '../robot/math.js';
import { forwardKinematics } from '../robot/kinematics.js';
import { UR10_DEFINITION } from '../robot/ur10-definition.js';
import { GlbModel, parseGlb, THREE } from './real-gripper-visual.js';
import { buildUr10SurfaceGeometryAsync, UR10_NORMAL_DEFAULTS } from './ur10-surface-normals.js';

export const UR10_VISUAL = Object.freeze({
  assetPath: '../../assets/models/UR10-v2-complete.glb',
  sourceGlbSha256: 'f7a74be4b84726c2b073b7c1dd0a6b5549372ac6c30a6c1226c7cfe9d98a59f8',
  nodeCount: 27,
  meshCount: 27,
  triangleCount: 115789
});

const PI = Math.PI;
const JOINT_ORIGINS = Object.freeze([
  Object.freeze({ xyzMm: [0, 0, 127.3], rpy: [0, 0, 0] }),
  Object.freeze({ xyzMm: [0, 0, 0], rpy: [PI / 2, 0, 0] }),
  Object.freeze({ xyzMm: [-612, 0, 0], rpy: [0, 0, 0] }),
  Object.freeze({ xyzMm: [-572.3, 0, 163.941], rpy: [0, 0, 0] }),
  Object.freeze({ xyzMm: [0, -115.7, 0], rpy: [PI / 2, 0, 0] }),
  Object.freeze({ xyzMm: [0, 92.2, 0], rpy: [PI / 2, PI, PI] })
]);

const LINK_FRAMES = Object.freeze([
  Object.freeze({ name: 'base', frame: -1, offsetMm: [0, 0, 0], rpy: [0, 0, PI] }),
  Object.freeze({ name: 'shoulder', frame: 0, offsetMm: [0, 0, 0], rpy: [0, 0, PI] }),
  Object.freeze({ name: 'upper arm', frame: 1, offsetMm: [0, 0, 220.941], rpy: [PI / 2, 0, -PI / 2] }),
  Object.freeze({ name: 'forearm', frame: 2, offsetMm: [0, 0, 49.042], rpy: [PI / 2, 0, -PI / 2] }),
  Object.freeze({ name: 'wrist 1', frame: 3, offsetMm: [0, 0, -114.9], rpy: [PI / 2, 0, 0] }),
  Object.freeze({ name: 'wrist 2', frame: 4, offsetMm: [0, 0, -115.8], rpy: [0, 0, 0] }),
  Object.freeze({ name: 'wrist 3', frame: 5, offsetMm: [0, 1, -92.2], rpy: [PI / 2, 0, 0] })
]);

const LINK_PARENT_FRAMES = Object.freeze(new Map([
  ['base', 0], ['shoulder', 1], ['upper arm', 2], ['forearm', 3],
  ['wrist 1', 4], ['wrist 2', 5], ['wrist 3', 6]
]));

export const UR10_VISUAL_NODES = Object.freeze([
  ['base', 'shape0_001-mesh', 'anodized_aluminium'],
  ['shoulder', 'Circle.002', 'hub_caps'],
  ['shoulder', 'shape0-mesh.001', 'powder_dark'],
  ['shoulder', 'shape1_001-mesh', 'ur_blue'],
  ['shoulder', 'shape2_001-mesh', 'anodized_aluminium'],
  ['upper arm', 'Circle.003', 'hub_caps'],
  ['upper arm', 'Circle.004', 'hub_caps'],
  ['upper arm', 'shape0_001-mesh.001', 'powder_dark'],
  ['upper arm', 'shape1_001-mesh.001', 'ur_blue'],
  ['upper arm', 'shape2_001-mesh.001', 'anodized_aluminium'],
  ['upper arm', 'shape3_001-mesh', 'pcasa_light'],
  ['forearm', 'Circle', 'hub_caps'],
  ['forearm', 'Circle.001', 'hub_caps'],
  ['forearm', 'shape0-mesh', 'powder_dark'],
  ['forearm', 'shape1-mesh', 'ur_blue'],
  ['forearm', 'shape2-mesh', 'anodized_aluminium'],
  ['forearm', 'shape3-mesh', 'pcasa_light'],
  ['forearm', 'shape4-mesh', 'rubber_black'],
  ['wrist 1', 'Circle.005', 'hub_caps'],
  ['wrist 1', 'shape0_001-mesh.002', 'powder_dark'],
  ['wrist 1', 'shape1_001-mesh.002', 'ur_blue'],
  ['wrist 1', 'shape2_001-mesh.002', 'anodized_aluminium'],
  ['wrist 2', 'Circle.006', 'hub_caps'],
  ['wrist 2', 'shape0_002-mesh', 'powder_dark'],
  ['wrist 2', 'shape1_002-mesh', 'ur_blue'],
  ['wrist 2', 'shape2_002-mesh', 'anodized_aluminium'],
  ['wrist 3', 'shape0_003-mesh', 'anodized_aluminium']
].map(Object.freeze));

const MATERIALS = Object.freeze({
  ur_blue: Object.freeze({ color: 0x648aa3, metalness: 0, roughness: 0.34, clearcoat: 0.18, clearcoatRoughness: 0.28 }),
  hub_caps: Object.freeze({ color: 0x648aa3, metalness: 0, roughness: 0.34, clearcoat: 0.18, clearcoatRoughness: 0.28 }),
  powder_dark: Object.freeze({ color: 0x393939, metalness: 0, roughness: 0.46, clearcoat: 0.08, clearcoatRoughness: 0.32 }),
  anodized_aluminium: Object.freeze({ color: 0x767676, metalness: 0.82, roughness: 0.34, clearcoat: 0, clearcoatRoughness: 0.25 }),
  pcasa_light: Object.freeze({ color: 0xa7a7a7, metalness: 0, roughness: 0.38, clearcoat: 0.16, clearcoatRoughness: 0.30 }),
  rubber_black: Object.freeze({ color: 0x151515, metalness: 0, roughness: 0.82, clearcoat: 0, clearcoatRoughness: 0.60 })
});

const MATERIAL_SETTINGS = Object.freeze({
  ur_blue: 'ur10Blue',
  hub_caps: 'ur10Blue',
  powder_dark: 'ur10Dark',
  anodized_aluminium: 'ur10Aluminium',
  pcasa_light: 'ur10LightPolymer',
  rubber_black: 'ur10Rubber'
});

const EDITED_NORMAL_NODES = new Set(['Circle.002', 'Circle.003', 'Circle.004', 'Circle', 'Circle.001', 'Circle.005', 'Circle.006']);

function colourValue(value, fallback) {
  try { return new THREE.Color(value ?? fallback); } catch { return new THREE.Color(fallback); }
}

function transformMatrix(xyzMm = [0, 0, 0], rpy = [0, 0, 0]) {
  const [roll, pitch, yaw] = rpy;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, xyzMm[0],
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, xyzMm[1],
    -sp, cp * sr, cp * cr, xyzMm[2],
    0, 0, 0, 1
  ];
}

function jointRotation(angleRad) {
  return transformMatrix([0, 0, 0], [0, 0, angleRad]);
}

export function ur10VisualTransforms(jointsRad) {
  if (!Array.isArray(jointsRad) || jointsRad.length !== 6 || !jointsRad.every(Number.isFinite)) {
    throw new TypeError('invalid_ur10_visual_joint_state');
  }
  // The source demo's two pi rotations cancel. Its remaining global translation
  // is intentionally rebased so the challenge workcell and controller share the
  // same machine origin; only link-local reference transforms live here.
  let transform = mat4Identity();
  const frames = [];
  for (let index = 0; index < JOINT_ORIGINS.length; index += 1) {
    const joint = JOINT_ORIGINS[index];
    transform = mat4Multiply(transform, transformMatrix(joint.xyzMm, joint.rpy));
    transform = mat4Multiply(transform, jointRotation(jointsRad[index]));
    frames.push(transform);
  }
  const links = new Map();
  for (const link of LINK_FRAMES) {
    const frame = link.frame === -1 ? mat4Identity() : frames[link.frame];
    links.set(link.name, mat4Multiply(frame, transformMatrix(link.offsetMm, link.rpy)));
  }
  const flange = mat4Multiply(transform, transformMatrix([0, 0, 0], [0, -PI / 2, -PI / 2]));
  return { frames, links, flange };
}

// Align each immutable visual-link frame to the authoritative DH frame once at
// neutral joints. Runtime articulation then consumes the controller's FK frames
// instead of deriving a second live robot pose inside the renderer.
const REFERENCE_ALIGNMENT_JOINTS = Object.freeze([0, 0, 0, 0, 0, 0]);
const REFERENCE_VISUAL_LINKS = ur10VisualTransforms(REFERENCE_ALIGNMENT_JOINTS).links;
const REFERENCE_DH = forwardKinematics(REFERENCE_ALIGNMENT_JOINTS, UR10_DEFINITION);
const LINK_CALIBRATIONS = new Map([...LINK_PARENT_FRAMES].map(([name, frameIndex]) => {
  const parent = new THREE.Matrix4().set(...REFERENCE_DH.frames[frameIndex]);
  const visual = new THREE.Matrix4().set(...REFERENCE_VISUAL_LINKS.get(name));
  return [name, parent.invert().multiply(visual)];
}));

export function calibratedUr10LinkMatrices(jointsRad, dhFrames = null) {
  const frames = dhFrames ?? forwardKinematics(jointsRad, UR10_DEFINITION).frames;
  if (!Array.isArray(frames) || frames.length !== 7) throw new TypeError('invalid_ur10_dh_frames');
  return new Map([...LINK_PARENT_FRAMES].map(([name, frameIndex]) => [
    name,
    new THREE.Matrix4().set(...frames[frameIndex]).multiply(LINK_CALIBRATIONS.get(name))
  ]));
}

function materialFromDescriptor(descriptor) {
  return new THREE.MeshPhysicalMaterial({ ...descriptor });
}

function triangleCount(json) {
  let count = 0;
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (primitive.indices === undefined) continue;
      count += (json.accessors[primitive.indices]?.count ?? 0) / 3;
    }
  }
  return count;
}

export class Ur10Visual {
  constructor(scene, settings = {}) {
    this.scene = scene;
    this.settings = settings;
    this.groups = new Map();
    this.materials = new Map(Object.entries(MATERIALS).map(([name, descriptor]) => [name, materialFromDescriptor(descriptor)]));
    this.status = { state: 'loading', reason: null, sourceGlbSha256: UR10_VISUAL.sourceGlbSha256 };
    this.sourceMeshes = [];
    this.normalBuildSerial = 0;
    for (const link of LINK_FRAMES) {
      const group = new THREE.Group();
      group.name = `UR10_V2_${link.name.toUpperCase().replaceAll(' ', '_')}`;
      group.matrixAutoUpdate = false;
      const metresToMillimetres = new THREE.Group();
      metresToMillimetres.name = `${group.name}_METRES_TO_MM`;
      // The supplied V2 GLB is Y-up; the proven demo rebases every region
      // to the simulator's Z-up frame as (x, -z, y) before articulation.
      metresToMillimetres.rotation.x = PI / 2;
      metresToMillimetres.scale.setScalar(1000);
      group.add(metresToMillimetres);
      scene.add(group);
      this.groups.set(link.name, { group, geometry: metresToMillimetres });
    }
    this.loadPromise = this.load();
  }

  async load() {
    try {
      const response = await fetch(new URL(UR10_VISUAL.assetPath, import.meta.url));
      if (!response.ok) throw new Error(`ur10_asset_http_${response.status}`);
      const { json, bin } = parseGlb(await response.arrayBuffer());
      const triangles = triangleCount(json);
      if (json.nodes?.length !== UR10_VISUAL.nodeCount) throw new Error('ur10_node_count_mismatch');
      if (json.meshes?.length !== UR10_VISUAL.meshCount) throw new Error('ur10_mesh_count_mismatch');
      if (triangles !== UR10_VISUAL.triangleCount) throw new Error('ur10_triangle_count_mismatch');
      const model = new GlbModel(json, bin);
      const used = new Set();
      for (const [linkName, nodeName, materialName] of UR10_VISUAL_NODES) {
        const node = model.nodeByName.get(nodeName);
        if (!node || !node.isMesh) throw new Error(`ur10_mesh_region_missing_${nodeName}`);
        if (used.has(node)) throw new Error(`ur10_mesh_region_duplicate_${nodeName}`);
        used.add(node);
        node.removeFromParent();
        node.material = this.materials.get(materialName);
        this.sourceMeshes.push({
          node,
          nodeName,
          positions: new Float32Array(node.geometry.getAttribute('position').array),
          normals: new Float32Array(node.geometry.getAttribute('normal').array),
          indices: new Uint32Array(node.geometry.index.array),
          edited: EDITED_NORMAL_NODES.has(nodeName)
        });
        this.groups.get(linkName).geometry.add(node);
      }
      if (used.size !== UR10_VISUAL.nodeCount) throw new Error('ur10_mesh_region_coverage_mismatch');
      this.applyMaterialSettings();
      await this.rebuildNormals();
      this.model = model;
      this.status = {
        state: 'ready', reason: null, sourceGlbSha256: UR10_VISUAL.sourceGlbSha256,
        nodes: json.nodes.length, meshes: json.meshes.length, triangles,
        normals: this.normalDiagnostics
      };
      return this.status;
    } catch (error) {
      this.status = { ...this.status, state: 'failed', reason: error.message };
      return this.status;
    }
  }

  normalOptions() {
    return {
      mode: this.settings.ur10NormalMode ?? UR10_NORMAL_DEFAULTS.mode,
      angleDeg: Number(this.settings.ur10SmoothAngleDeg ?? UR10_NORMAL_DEFAULTS.angleDeg),
      weldToleranceMm: Number(this.settings.ur10WeldToleranceMm ?? UR10_NORMAL_DEFAULTS.weldToleranceMm),
      weighting: this.settings.ur10NormalWeighting ?? UR10_NORMAL_DEFAULTS.weighting,
      clean: this.settings.ur10CleanDegenerateFaces ?? UR10_NORMAL_DEFAULTS.clean
    };
  }

  async rebuildNormals() {
    if (!this.sourceMeshes.length) return null;
    const serial = ++this.normalBuildSerial;
    const started = performance.now();
    const options = this.normalOptions();
    const results = await Promise.all(this.sourceMeshes.map((source) => buildUr10SurfaceGeometryAsync({
      positions: source.positions,
      normals: source.normals,
      indices: source.indices,
      edited: source.edited,
      ...options
    })));
    if (serial !== this.normalBuildSerial) return null;
    let triangles = 0, renderVertices = 0, removedFaces = 0;
    for (let index = 0; index < this.sourceMeshes.length; index += 1) {
      const source = this.sourceMeshes[index], result = results[index];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(result.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.name = source.node.geometry.name;
      const previous = source.node.geometry;
      source.node.geometry = geometry;
      previous.dispose?.();
      triangles += result.diagnostics.triangles;
      renderVertices += result.diagnostics.renderVertices;
      removedFaces += result.diagnostics.removedFaces;
    }
    this.normalDiagnostics = { ...options, triangles, renderVertices, removedFaces, durationMs: performance.now() - started };
    if (this.status.state === 'ready') this.status = { ...this.status, normals: this.normalDiagnostics };
    return this.normalDiagnostics;
  }

  applyMaterialSettings() {
    for (const [name, material] of this.materials) {
      const defaults = MATERIALS[name];
      const prefix = MATERIAL_SETTINGS[name];
      material.color.copy(colourValue(this.settings[`${prefix}Color`], defaults.color));
      material.metalness = Number(this.settings[`${prefix}Metalness`] ?? defaults.metalness);
      material.roughness = Number(this.settings[`${prefix}Roughness`] ?? defaults.roughness);
      material.clearcoat = Number(this.settings[`${prefix}Clearcoat`] ?? defaults.clearcoat);
      material.clearcoatRoughness = Number(this.settings[`${prefix}ClearcoatRoughness`] ?? defaults.clearcoatRoughness);
      material.needsUpdate = true;
    }
  }

  applySettings(key = '*') {
    if (key === '*' || /^ur10(Blue|Dark|Aluminium|LightPolymer|Rubber)/.test(key)) this.applyMaterialSettings();
    if (key === '*' || /^ur10(Normal|Smooth|Weld|Clean)/.test(key)) this.rebuildNormals().catch((error) => {
      this.status = { ...this.status, reason: error.message, normalRebuildFailed: true };
    });
  }

  update(jointsRad, dhFrames = null) {
    const matrices = calibratedUr10LinkMatrices(jointsRad, dhFrames);
    for (const [name, matrix] of matrices) {
      const group = this.groups.get(name).group;
      group.matrix.copy(matrix);
      group.matrixWorldNeedsUpdate = true;
    }
    return matrices;
  }

  getStatus() { return { ...this.status }; }
}
