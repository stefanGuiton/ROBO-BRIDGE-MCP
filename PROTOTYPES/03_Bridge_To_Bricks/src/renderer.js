import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/OrbitControls.js";

const VIEW_LABELS = {
  graph: ["SOURCE CONTRACT", "Original 2D graph"],
  extruded: ["STRUCTURAL VOLUME", "Extruded side structure"],
  clearance: ["FORBIDDEN REGION", "Vehicle clearance volume"],
  occupancy: ["RASTER OUTPUT", "Occupancy / stud grid"],
  bricks: ["FINAL OUTPUT", "Brick structure"],
  members: ["TEST TRACEABILITY", "Structural-member groups"],
  dependencies: ["PARALLEL SCHEDULE", "Build dependency / order"],
};

const PHASE_COLOURS = Object.freeze({
  foundation: "#475569",
  pier: "#d97706",
  lower: "#2563eb",
  deck: "#64748b",
  web: "#0f766e",
  upper: "#7c3aed",
  rail: "#dc2626",
  cable: "#374151",
});

function hashColour(value) {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  return new THREE.Color().setHSL(((Math.abs(hash) % 330) / 360), 0.56, 0.48);
}

export class BridgeRenderer {
  constructor(canvas, onMetrics) {
    this.canvas = canvas;
    this.onMetrics = onMetrics;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0xfbfaf6, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xfbfaf6, 70, 150);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
    this.camera.position.set(54, 34, 48);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.target.set(20, 7, 0);
    this.content = new THREE.Group();
    this.scene.add(this.content);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd7d0c2, 2.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(30, 50, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);
    this.addStage();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.frames = 0;
    this.lastFpsAt = performance.now();
    this.fps = 0;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  addStage() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 100), new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.55;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(100, 100, 0xc5beb0, 0xe2ddd2);
    grid.position.set(20, -0.49, 0);
    this.scene.add(grid);
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  clearContent() {
    this.content.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.content.clear();
  }

  fit(result, flat = false) {
    const span = result.occupancy.bounds.maxX - result.occupancy.bounds.minX;
    const centreX = (result.occupancy.bounds.maxX + result.occupancy.bounds.minX) / 2;
    const centreY = result.occupancy.deckY * 0.62;
    this.controls.target.set(centreX, centreY, 0);
    this.camera.position.set(centreX + span * 0.82, centreY + Math.max(20, span * 0.54), flat ? 42 : Math.max(32, span * 0.76));
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  render(result, view) {
    this.result = result;
    this.view = view;
    this.clearContent();
    if (view === "graph") this.addGraph(result);
    if (view === "extruded") this.addExtruded(result, false);
    if (view === "clearance") { this.addExtruded(result, true); this.addClearance(result); }
    if (view === "occupancy") this.addOccupancy(result);
    if (["bricks", "members", "dependencies"].includes(view)) this.addBricks(result, view);
    this.fit(result, view === "graph");
    return VIEW_LABELS[view];
  }

  addGraph(result) {
    const nodeById = new Map(result.graph.nodes.map((node) => [node.id, node]));
    const positions = [];
    for (const member of result.graph.members) {
      const a = nodeById.get(member.a).position;
      const b = nodeById.get(member.b).position;
      positions.push(a.x, a.y, 0, b.x, b.y, 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x195c9d }));
    this.content.add(lines);
    const sphere = new THREE.SphereGeometry(0.42, 12, 8);
    const nodes = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0xffc94a, roughness: 0.72 }), result.graph.nodes.length);
    const matrix = new THREE.Matrix4();
    result.graph.nodes.forEach((node, index) => {
      matrix.makeTranslation(node.position.x, node.position.y, 0);
      nodes.setMatrixAt(index, matrix);
    });
    nodes.instanceMatrix.needsUpdate = true;
    this.content.add(nodes);
  }

  addExtruded(result, pale) {
    const source = result.occupancy.cells.filter((cell) => cell.sourceMemberId !== null || ["cross-member", "deck", "rail-support"].includes(cell.role));
    this.addCellInstances(source, pale ? 0xaab8c6 : null, pale ? 0.45 : 1);
  }

  addCellInstances(cells, fixedColour = null, opacity = 1) {
    const geometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);
    const material = new THREE.MeshStandardMaterial({ color: fixedColour ?? 0xffffff, roughness: 0.72, metalness: 0.02, transparent: opacity < 1, opacity });
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    const matrix = new THREE.Matrix4();
    cells.forEach((cell, index) => {
      matrix.makeTranslation(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
      mesh.setMatrixAt(index, matrix);
      if (fixedColour === null) mesh.setColorAt(index, new THREE.Color(PHASE_COLOURS[cell.phase] ?? "#64748b"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = opacity === 1;
    mesh.receiveShadow = true;
    this.content.add(mesh);
  }

  addClearance(result) {
    const { min, max } = result.occupancy.clearance;
    const size = new THREE.Vector3(max.x - min.x + 1, max.y - min.y + 1, max.z - min.z + 1);
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const fill = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x3aa8d8, transparent: true, opacity: 0.2, depthWrite: false }));
    fill.position.set(min.x + size.x / 2, min.y + size.y / 2, min.z + size.z / 2);
    this.content.add(fill);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineDashedMaterial({ color: 0x1478a5, dashSize: .7, gapSize: .4 }));
    edges.computeLineDistances();
    edges.position.copy(fill.position);
    this.content.add(edges);
  }

  addOccupancy(result) {
    this.addCellInstances(result.occupancy.cells);
  }

  addBricks(result, mode) {
    const placements = result.buildPlan.placements;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.01 });
    const boxes = new THREE.InstancedMesh(geometry, material, placements.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    placements.forEach((placement, index) => {
      position.set(placement.gridPosition.x + placement.dimensions.x / 2, placement.gridPosition.y + 0.5, placement.gridPosition.z + placement.dimensions.z / 2);
      scale.set(Math.max(.92, placement.dimensions.x - .08), .92, Math.max(.92, placement.dimensions.z - .08));
      matrix.compose(position, quaternion, scale);
      boxes.setMatrixAt(index, matrix);
      let colour = new THREE.Color(placement.colour);
      if (mode === "members") colour = hashColour(placement.structuralMemberId);
      if (mode === "dependencies") colour = new THREE.Color(PHASE_COLOURS[placement.phase] ?? "#64748b");
      boxes.setColorAt(index, colour);
    });
    boxes.instanceMatrix.needsUpdate = true;
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
    boxes.castShadow = true;
    boxes.receiveShadow = true;
    this.content.add(boxes);

    const studCount = placements.reduce((sum, placement) => sum + placement.dimensions.x * placement.dimensions.z, 0);
    const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(.31, .31, .18, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .58 }), studCount);
    let studIndex = 0;
    placements.forEach((placement) => {
      let colour = new THREE.Color(placement.colour);
      if (mode === "members") colour = hashColour(placement.structuralMemberId);
      if (mode === "dependencies") colour = new THREE.Color(PHASE_COLOURS[placement.phase] ?? "#64748b");
      for (let dx = 0; dx < placement.dimensions.x; dx += 1) {
        for (let dz = 0; dz < placement.dimensions.z; dz += 1) {
          matrix.makeTranslation(placement.gridPosition.x + dx + .5, placement.gridPosition.y + 1.01, placement.gridPosition.z + dz + .5);
          studs.setMatrixAt(studIndex, matrix);
          studs.setColorAt(studIndex, colour);
          studIndex += 1;
        }
      }
    });
    studs.instanceMatrix.needsUpdate = true;
    if (studs.instanceColor) studs.instanceColor.needsUpdate = true;
    studs.castShadow = true;
    this.content.add(studs);
  }

  animate(now) {
    this.resize();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frames += 1;
    if (now - this.lastFpsAt >= 750) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsAt));
      this.frames = 0;
      this.lastFpsAt = now;
      this.onMetrics?.({ fps: this.fps, drawCalls: this.renderer.info.render.calls });
    }
    requestAnimationFrame(this.animate);
  }
}
