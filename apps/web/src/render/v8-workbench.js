import { THREE } from './real-gripper-visual.js';
import { v8SupplyRegion } from '../player/v8-spawn.js';

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

function makeBox(size, centre, material, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.name = name;
  mesh.position.set(centre.x, centre.y, centre.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function moreBricksTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#d71920';
  context.fillRect(0, 0, 512, 512);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.translate(256, 256);
  context.rotate(-Math.PI / 2);
  context.font = "900 104px Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif";
  context.fillText('MORE', 0, -56);
  context.fillText('BRICKS', 0, 56);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class V8Workbench {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.root = new THREE.Group();
    this.root.name = 'MAIN_DEMO_V8_WORKBENCH';
    scene.add(this.root);
    this.rebuild();
  }

  clear() {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      dispose(child);
    }
  }

  rebuild() {
    this.clear();
    const s = this.settings;
    this.root.position.set(s.tableXmm, s.tableYmm, 0);
    this.root.rotation.set(0, 0, THREE.MathUtils.degToRad(s.tableYawDeg));
    const topMaterial = new THREE.MeshStandardMaterial({
      color: s.tableColor, roughness: s.tableRoughness, metalness: s.tableMetalness
    });
    const legMaterial = topMaterial.clone();
    legMaterial.color.offsetHSL(0, 0, -0.1);
    this.tableTop = makeBox(
      { x: s.tableWidthMm, y: s.tableDepthMm, z: s.tableTopThicknessMm },
      { x: 0, y: 0, z: s.tableTopHeightMm - s.tableTopThicknessMm / 2 },
      topMaterial,
      'MAIN_DEMO_V8_TABLE_TOP'
    );
    this.tableTop.userData.playerSurface = true;
    this.root.add(this.tableTop);
    const legHeight = s.tableTopHeightMm - s.tableTopThicknessMm;
    const legX = s.tableWidthMm / 2 - s.legInsetMm - s.legWidthMm / 2;
    const legY = s.tableDepthMm / 2 - s.legInsetMm - s.legDepthMm / 2;
    for (const [x, y] of [[-legX, -legY], [-legX, legY], [legX, -legY], [legX, legY]]) {
      this.root.add(makeBox(
        { x: s.legWidthMm, y: s.legDepthMm, z: legHeight },
        { x, y, z: legHeight / 2 }, legMaterial, 'MAIN_DEMO_V8_TABLE_LEG'
      ));
    }
    const matMaterial = new THREE.MeshStandardMaterial({
      color: s.matColor, roughness: Math.min(1, s.tableRoughness + 0.08), metalness: 0
    });
    this.mat = makeBox(
      { x: s.matWidthMm, y: s.matDepthMm, z: s.matThicknessMm },
      { x: s.matXmm, y: s.matYmm, z: s.tableTopHeightMm + s.matThicknessMm / 2 },
      matMaterial,
      'MAIN_DEMO_V8_BUILD_MAT'
    );
    this.mat.rotation.z = THREE.MathUtils.degToRad(s.matYawDeg);
    this.mat.userData.playerSurface = true;
    this.root.add(this.mat);
    if (s.matStudsVisible) this.addStuds(matMaterial);
    if (s.gridVisible) this.addGrid();
    this.addMoreBricksButton();
    this.root.updateMatrixWorld(true);
  }

  addStuds(material) {
    const s = this.settings;
    const columns = Math.round(s.matPanelsX * s.matPanelStuds);
    const rows = Math.round(s.matPanelsY * s.matPanelStuds);
    const geometry = new THREE.CylinderGeometry(
      s.matStudDiameterMm / 2, s.matStudDiameterMm / 2,
      s.matStudHeightMm, Math.max(3, Math.round(s.matStudSegments))
    );
    geometry.rotateX(Math.PI / 2);
    const studs = new THREE.InstancedMesh(geometry, material, columns * rows);
    studs.name = 'MAIN_DEMO_V8_BUILD_MAT_STUDS';
    studs.castShadow = true;
    studs.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(s.matYawDeg)
    );
    const scale = new THREE.Vector3(1, 1, 1);
    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const local = new THREE.Vector3(
          (column - (columns - 1) / 2) * s.gridPitchMm,
          (row - (rows - 1) / 2) * s.gridPitchMm,
          0
        ).applyQuaternion(rotation);
        matrix.compose(new THREE.Vector3(
          s.matXmm + local.x,
          s.matYmm + local.y,
          s.tableTopHeightMm + s.matThicknessMm + s.matStudHeightMm / 2
        ), rotation, scale);
        studs.setMatrixAt(index++, matrix);
      }
    }
    studs.instanceMatrix.needsUpdate = true;
    this.root.add(studs);
  }

  addGrid() {
    const s = this.settings;
    const width = s.matWidthMm;
    const depth = s.matDepthMm;
    const pitch = s.gridPitchMm;
    const z = s.tableTopHeightMm + s.matThicknessMm + s.matStudHeightMm + 0.12;
    const vertices = [];
    const columns = Math.round(width / pitch);
    const rows = Math.round(depth / pitch);
    for (let index = 0; index <= columns; index += 1) {
      const x = -width / 2 + index * pitch;
      vertices.push(x, -depth / 2, 0, x, depth / 2, 0);
    }
    for (let index = 0; index <= rows; index += 1) {
      const y = -depth / 2 + index * pitch;
      vertices.push(-width / 2, y, 0, width / 2, y, 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({
      color: s.gridColor,
      transparent: true,
      opacity: s.gridOpacity,
      depthWrite: false
    });
    const grid = new THREE.LineSegments(geometry, material);
    grid.name = 'MAIN_DEMO_V8_BUILD_GRID';
    grid.rotation.z = THREE.MathUtils.degToRad(s.matYawDeg);
    grid.position.set(s.matXmm, s.matYmm, z);
    this.root.add(grid);
  }

  addMoreBricksButton() {
    const s = this.settings;
    const geometry = new THREE.CylinderGeometry(50, 50, 24, 32);
    geometry.rotateX(Math.PI / 2);
    const sideMaterial = new THREE.MeshStandardMaterial({ color: 0xc9151b, roughness: 0.32, metalness: 0.08, emissive: 0x000000 });
    const topMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: moreBricksTexture(), roughness: 0.28, metalness: 0.04, emissive: 0x000000 });
    const bottomMaterial = new THREE.MeshStandardMaterial({ color: 0x8e1014, roughness: 0.45, metalness: 0.08 });
    const button = new THREE.Mesh(
      geometry,
      [
        sideMaterial,
        topMaterial,
        bottomMaterial
      ]
    );
    button.name = 'MAIN_DEMO_V8_MORE_BRICKS_BUTTON';
    const region = v8SupplyRegion(s);
    button.position.set(-s.tableWidthMm / 2 + 82, region.yMin + 52, s.tableTopHeightMm + 12.5);
    button.castShadow = true;
    button.receiveShadow = true;
    button.userData.moreBricks = true;
    button.userData.sideMaterial = sideMaterial;
    button.userData.topMaterial = topMaterial;
    this.moreBricksPressStart = -1;
    this.moreBricksButton = button;
    this.root.add(button);
  }

  setMoreBricksHighlighted(highlighted) {
    const button = this.moreBricksButton;
    if (!button) return;
    const emissive = highlighted ? 0x5a0909 : 0x000000;
    button.userData.sideMaterial.emissive.setHex(emissive);
    button.userData.topMaterial.emissive.setHex(emissive);
    button.userData.sideMaterial.emissiveIntensity = highlighted ? 0.32 : 0;
    button.userData.topMaterial.emissiveIntensity = highlighted ? 0.32 : 0;
  }

  pressMoreBricks(now = performance.now()) {
    this.moreBricksPressStart = now;
  }

  update(now = performance.now()) {
    if (!this.moreBricksButton || this.moreBricksPressStart < 0) return;
    const progress = (now - this.moreBricksPressStart) / 180;
    if (progress >= 1) {
      this.moreBricksButton.position.z = this.settings.tableTopHeightMm + 12.5;
      this.moreBricksPressStart = -1;
      return;
    }
    const pulse = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    this.moreBricksButton.position.z = this.settings.tableTopHeightMm + 12.5 - 5 * pulse;
  }

  worldPoint(localPoint) {
    this.root.updateMatrixWorld(true);
    return this.root.localToWorld(localPoint.clone());
  }

  collisionBoxes() {
    const s = this.settings;
    const result = [];
    const add = (kind, local, size) => {
      const bounds = new THREE.Box3();
      for (const dx of [-0.5, 0.5]) for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
        bounds.expandByPoint(this.worldPoint(new THREE.Vector3(local.x + dx * size.x, local.y + dy * size.y, local.z + dz * size.z)));
      }
      result.push({
        kind,
        minX: bounds.min.x, maxX: bounds.max.x,
        minY: bounds.min.y, maxY: bounds.max.y,
        minZ: bounds.min.z, maxZ: bounds.max.z
      });
    };
    add('WORKTABLE', { x: 0, y: 0, z: s.tableTopHeightMm - s.tableTopThicknessMm / 2 }, {
      x: s.tableWidthMm, y: s.tableDepthMm, z: s.tableTopThicknessMm
    });
    const height = s.tableTopHeightMm - s.tableTopThicknessMm;
    const x = s.tableWidthMm / 2 - s.legInsetMm - s.legWidthMm / 2;
    const y = s.tableDepthMm / 2 - s.legInsetMm - s.legDepthMm / 2;
    for (const [lx, ly] of [[-x, -y], [-x, y], [x, -y], [x, y]]) {
      add('TABLE_LEG', { x: lx, y: ly, z: height / 2 }, { x: s.legWidthMm, y: s.legDepthMm, z: height });
    }
    return result;
  }
}
