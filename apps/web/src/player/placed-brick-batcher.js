import * as THREE from '../../vendor/three.module.min.js';
import { colourHex } from './v8-brick-visual.js';

export class PlacedBrickBatcher {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.groups = new Map();
    this.rebuildGeometry();
    this.matrix = new THREE.Matrix4();
    this.rootMatrix = new THREE.Matrix4();
    this.localMatrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.idsByMesh = new WeakMap();
  }

  clear() {
    for (const group of this.groups.values()) {
      this.scene.remove(group.body, group.studs);
      group.body.dispose?.();
      group.studs.dispose?.();
      group.material.dispose();
    }
    this.groups.clear();
  }

  rebuildGeometry() {
    this.bodyGeometry?.dispose?.();
    this.studGeometry?.dispose?.();
    this.bodyGeometry = new THREE.BoxGeometry(this.settings.brickLengthMm, this.settings.brickWidthMm, this.settings.brickBodyHeightMm);
    this.studGeometry = new THREE.CylinderGeometry(
      this.settings.studDiameterMm / 2,
      this.settings.studDiameterMm / 2,
      this.settings.studHeightMm,
      18
    );
    this.studGeometry.rotateX(Math.PI / 2);
    for (const group of this.groups?.values?.() ?? []) {
      group.body.geometry = this.bodyGeometry;
      group.studs.geometry = this.studGeometry;
    }
  }

  ensureGroup(colourKey, count, sampleBrick) {
    const existing = this.groups.get(colourKey);
    if (existing && existing.capacity >= count) return existing;
    if (existing) {
      this.scene.remove(existing.body, existing.studs);
      existing.material.dispose();
      this.groups.delete(colourKey);
    }
    const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
    const material = new THREE.MeshStandardMaterial({
      color: colourHex(sampleBrick),
      roughness: this.settings.brickRoughness ?? 0.31,
      metalness: this.settings.brickMetalness ?? 0
    });
    const body = new THREE.InstancedMesh(this.bodyGeometry, material, capacity);
    const studs = new THREE.InstancedMesh(this.studGeometry, material, capacity * 8);
    for (const mesh of [body, studs]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
    }
    const group = { colour: colourKey, capacity, material, body, studs, brickIds: [] };
    body.userData.placedBrickBatch = group;
    studs.userData.placedBrickBatch = group;
    this.groups.set(colourKey, group);
    return group;
  }

  applyMaterialSettings() {
    for (const group of this.groups.values()) {
      group.material.roughness = this.settings.brickRoughness ?? 0.31;
      group.material.metalness = this.settings.brickMetalness ?? 0;
      group.material.needsUpdate = true;
    }
  }

  rebuild(bricks, placedIds) {
    const grouped = new Map();
    for (const brick of bricks) {
      if (!placedIds.has(brick.id)) continue;
      const colourKey = Number.isInteger(brick.displayHex) ? `hex:${brick.displayHex}` : `name:${brick.colour}`;
      if (!grouped.has(colourKey)) grouped.set(colourKey, []);
      grouped.get(colourKey).push(brick);
    }
    for (const [colour, group] of this.groups) {
      if (!grouped.has(colour)) {
        group.body.count = 0;
        group.studs.count = 0;
      }
    }
    const pitch = this.settings.studPitchMm;
    const studZ = this.settings.brickBodyHeightMm / 2 + this.settings.studHeightMm / 2;
    for (const [colour, list] of grouped) {
      const group = this.ensureGroup(colour, list.length, list[0]);
      group.brickIds = list.map((brick) => brick.id);
      let studIndex = 0;
      for (let index = 0; index < list.length; index += 1) {
        const brick = list[index];
        this.position.set(brick.position.xMm, brick.position.yMm, brick.position.zMm);
        this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), brick.yawRad ?? 0);
        this.rootMatrix.compose(this.position, this.quaternion, this.scale);
        group.body.setMatrixAt(index, this.rootMatrix);
        for (const x of [-1.5 * pitch, -0.5 * pitch, 0.5 * pitch, 1.5 * pitch]) {
          for (const y of [-0.5 * pitch, 0.5 * pitch]) {
            this.position.set(x, y, studZ);
            this.localMatrix.compose(this.position, new THREE.Quaternion(), this.scale);
            this.matrix.multiplyMatrices(this.rootMatrix, this.localMatrix);
            group.studs.setMatrixAt(studIndex, this.matrix);
            studIndex += 1;
          }
        }
      }
      group.body.count = list.length;
      group.studs.count = studIndex;
      group.body.instanceMatrix.needsUpdate = true;
      group.studs.instanceMatrix.needsUpdate = true;
      group.body.computeBoundingSphere();
      group.studs.computeBoundingSphere();
    }
  }

  brickIdFromHit(hit) {
    const group = hit?.object?.userData?.placedBrickBatch;
    return group && Number.isInteger(hit.instanceId) ? group.brickIds[hit.instanceId] ?? null : null;
  }

  pickMeshes() {
    return [...this.groups.values()].flatMap((group) => group.body.count ? [group.body] : []);
  }

  getDiagnostics() {
    let placedInstances = 0;
    let studInstances = 0;
    let drawMeshes = 0;
    for (const group of this.groups.values()) {
      placedInstances += group.body.count;
      studInstances += group.studs.count;
      if (group.body.count) drawMeshes += 2;
    }
    return { placedInstances, studInstances, drawMeshes, colourBatches: this.groups.size };
  }
}
