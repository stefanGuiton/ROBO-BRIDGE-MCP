import * as THREE from '../../vendor/three.module.min.js';

export const V8_COLOUR_HEX = Object.freeze({
  white: 0xf4f6f8,
  black: 0x30353b,
  red: 0xe64444,
  blue: 0x2477d4,
  yellow: 0xf4c842,
  green: 0x42a65a,
  orange: 0xf28e2b,
  purple: 0x9d61c9,
  teal: 0x37a8a2
});

export function colourHex(brick) {
  return Number.isInteger(brick?.displayHex) ? brick.displayHex : (V8_COLOUR_HEX[brick?.colour] ?? V8_COLOUR_HEX.white);
}

export class V8BrickGeometryFactory {
  constructor(settings) {
    this.settings = settings;
    this.body = null;
    this.stud = null;
    this.rebuild();
  }

  rebuild() {
    this.body?.dispose();
    this.stud?.dispose();
    const settings = this.settings;
    this.body = new THREE.BoxGeometry(settings.brickLengthMm, settings.brickWidthMm, settings.brickBodyHeightMm);
    this.stud = new THREE.CylinderGeometry(
      settings.studDiameterMm / 2,
      settings.studDiameterMm / 2,
      settings.studHeightMm,
      18
    );
    this.stud.rotateX(Math.PI / 2);
  }
}

function updateStudMatrices(studs, settings) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const pitch = settings.studPitchMm;
  const z = settings.brickBodyHeightMm / 2 + settings.studHeightMm / 2;
  let index = 0;
  for (const x of [-1.5 * pitch, -0.5 * pitch, 0.5 * pitch, 1.5 * pitch]) {
    for (const y of [-0.5 * pitch, 0.5 * pitch]) {
      matrix.compose(new THREE.Vector3(x, y, z), quaternion, scale);
      studs.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  studs.instanceMatrix.needsUpdate = true;
}

export function createV8BrickVisual(brick, settings, factory, { ghost = false } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: colourHex(brick),
    roughness: ghost ? 0.35 : settings.brickRoughness,
    metalness: ghost ? 0 : settings.brickMetalness,
    emissive: 0x000000,
    transparent: ghost,
    opacity: ghost ? settings.ghostOpacity : 1,
    depthWrite: !ghost
  });
  const body = new THREE.Mesh(factory.body, material);
  body.castShadow = !ghost;
  body.receiveShadow = !ghost;
  const studs = new THREE.InstancedMesh(factory.stud, material, 8);
  studs.castShadow = !ghost;
  studs.receiveShadow = !ghost;
  updateStudMatrices(studs, settings);
  body.add(studs);
  body.userData.material = material;
  body.userData.studs = studs;
  body.userData.ghost = ghost;
  return body;
}

export function applyV8BrickGeometry(body, settings, factory) {
  body.geometry = factory.body;
  body.userData.studs.geometry = factory.stud;
  updateStudMatrices(body.userData.studs, settings);
}

export function applyV8BrickMaterial(body, settings, brick = null) {
  const material = body.userData.material;
  if (brick) material.color.setHex(colourHex(brick));
  material.roughness = body.userData.ghost ? 0.35 : settings.brickRoughness;
  material.metalness = body.userData.ghost ? 0 : settings.brickMetalness;
  if (body.userData.ghost) material.opacity = settings.ghostOpacity;
  material.needsUpdate = true;
}

export function disposeV8BrickVisual(body) {
  body.userData.material?.dispose?.();
}
