import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { DEFAULT_SETTINGS, PRESETS, generateChallenge, serialiseChallenge } from "./terrain.js";

const viewport = document.querySelector("#viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef3f1);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 600);
camera.position.set(76, 62, 78);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
viewport.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, -3, 0);
controls.maxPolarAngle = Math.PI * 0.485;
controls.minDistance = 24;
controls.maxDistance = 240;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8da598, 2.4));
const sun = new THREE.DirectionalLight(0xfff1cf, 3.1);
sun.position.set(-45, 75, -35); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -90; sun.shadow.camera.right = 90; sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
scene.add(sun);

let challenge = null;
let generatedGroup = null;
const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map((node) => [node.id, node]));
const fieldKeys = ["mode", "obstacleWidth", "obstacleDepth", "noiseAmplitude", "noiseFrequency", "smoothing", "terrainAmplitude"];
const outputs = { obstacleWidth: "width-output", obstacleDepth: "depth-output", noiseAmplitude: "noise-output", noiseFrequency: "frequency-output", smoothing: "smoothing-output", terrainAmplitude: "terrain-output" };

function setInputs(settings) {
  ui.seed.value = settings.seed;
  for (const key of fieldKeys) if (ui[key]) ui[key].value = settings[key];
  updateOutputs();
}
function readInputs() {
  return { ...DEFAULT_SETTINGS, seed: Number(ui.seed.value) | 0, mode: ui.mode.value,
    obstacleWidth: Number(ui.obstacleWidth.value), obstacleDepth: Number(ui.obstacleDepth.value),
    noiseAmplitude: Number(ui.noiseAmplitude.value), noiseFrequency: Number(ui.noiseFrequency.value),
    smoothing: Number(ui.smoothing.value), terrainAmplitude: Number(ui.terrainAmplitude.value) };
}
function updateOutputs() { for (const [key, id] of Object.entries(outputs)) ui[id].value = ui[key].value; }

for (const [name, preset] of Object.entries(PRESETS)) {
  const button = document.createElement("button");
  button.textContent = name.replaceAll("_", " ");
  button.addEventListener("click", () => { setInputs({ ...DEFAULT_SETTINGS, ...preset }); regenerate(); });
  ui["preset-row"].append(button);
}
for (const key of fieldKeys) ui[key].addEventListener("input", updateOutputs);

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
      if (material.map) material.map.dispose();
      material.dispose();
    });
  });
  scene.remove(object);
}
function terrainGeometry(result) {
  const { gridX, gridZ, width, depth } = result.settings;
  const positions = new Float32Array(gridX * gridZ * 3);
  const colors = new Float32Array(gridX * gridZ * 3);
  const indices = [];
  const low = new THREE.Color(0x668f73), high = new THREE.Color(0xaed39b), rock = new THREE.Color(0x846d5e);
  for (let iz = 0; iz < gridZ; iz++) for (let ix = 0; ix < gridX; ix++) {
    const i = iz * gridX + ix, p = i * 3, h = result.heights[i];
    positions[p] = -width / 2 + ix * width / (gridX - 1); positions[p + 1] = h; positions[p + 2] = -depth / 2 + iz * depth / (gridZ - 1);
    const c = h < -result.settings.obstacleDepth * 0.4 ? rock : low.clone().lerp(high, THREE.MathUtils.clamp((h + 4) / 12, 0, 1));
    colors.set([c.r, c.g, c.b], p);
  }
  for (let iz = 0; iz < gridZ - 1; iz++) for (let ix = 0; ix < gridX - 1; ix++) {
    const a = iz * gridX + ix, b = a + 1, c = a + gridX, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
function marker(label, position, color) {
  const group = new THREE.Group(); group.name = `debug-${label.toLowerCase()}`;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.45, 10, 36), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.32; group.add(ring);
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 72;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.fillRect(0, 0, 256, 72); ctx.strokeStyle = `#${new THREE.Color(color).getHexString()}`; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 252, 68); ctx.fillStyle = "#183129"; ctx.font = "800 32px system-ui"; ctx.textAlign = "center"; ctx.fillText(label, 128, 48);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })); sprite.scale.set(15, 4.2, 1); sprite.position.y = 5; group.add(sprite);
  group.position.set(position.x, position.y + 0.2, position.z); return group;
}
function addDebugLayers(group, result) {
  const { state, settings, api } = result;
  const anchors = new THREE.Group(); anchors.name = "debug-anchors";
  anchors.add(marker("ENTRY", state.entry.position, 0x4de1ff), marker("EXIT", state.exit.position, 0xffcf5a)); anchors.visible = ui.showAnchors.checked; group.add(anchors);
  const support = new THREE.Group(); support.name = "debug-support";
  for (const region of state.supportRegions) {
    const b = region.bounds, geometry = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x68e5a5, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set((b.minX + b.maxX) / 2, api.getHeightAt(0, (b.minZ + b.maxZ) / 2) + 0.15, (b.minZ + b.maxZ) / 2); support.add(mesh);
  }
  support.visible = ui.showSupport.checked; group.add(support);
  const a = state.entry.position, b = state.exit.position, length = Math.hypot(b.x - a.x, b.z - a.z);
  const corridor = new THREE.Mesh(new THREE.BoxGeometry(state.corridor.deckWidth, 0.32, length), new THREE.MeshStandardMaterial({ color: 0x65a9ff, transparent: true, opacity: 0.38, emissive: 0x173c66, depthWrite: false }));
  corridor.name = "debug-corridor"; corridor.position.set((a.x + b.x) / 2, Math.max(a.y, b.y) + 0.75, (a.z + b.z) / 2); corridor.visible = ui.showCorridor.checked; group.add(corridor);
  if (settings.mode === "river") {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(settings.width, settings.obstacleWidth * 0.82, 64, 1), new THREE.MeshPhysicalMaterial({ color: 0x1d91c0, transparent: true, opacity: 0.72, roughness: 0.18, metalness: 0.05, side: THREE.DoubleSide }));
    water.name = "river-water"; water.rotation.x = -Math.PI / 2; water.position.y = -settings.obstacleDepth * 0.34; group.add(water);
  }
}
function regenerate() {
  ui.status.textContent = "Generating…";
  if (generatedGroup) disposeObject(generatedGroup);
  challenge = generateChallenge(Number(ui.seed.value), readInputs());
  generatedGroup = new THREE.Group(); generatedGroup.name = "generated-challenge";
  const geometry = terrainGeometry(challenge);
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide }));
  terrain.name = "terrain-mesh"; terrain.receiveShadow = true; generatedGroup.add(terrain);
  addDebugLayers(generatedGroup, challenge); scene.add(generatedGroup);
  ui["generation-ms"].textContent = `${challenge.generationMs.toFixed(2)} ms`;
  ui["vertex-count"].textContent = challenge.heights.length.toLocaleString();
  ui["triangle-count"].textContent = ((challenge.settings.gridX - 1) * (challenge.settings.gridZ - 1) * 2).toLocaleString();
  ui["mesh-count"].textContent = generatedGroup.children.length;
  ui.status.textContent = `${challenge.settings.mode.toUpperCase()} · seed ${challenge.settings.seed} · deterministic state ready`;
  window.__terrainChallenge = challenge;
}
function toggle(name, checked) { const object = generatedGroup?.getObjectByName(name); if (object) object.visible = checked; }
ui.showAnchors.addEventListener("change", () => toggle("debug-anchors", ui.showAnchors.checked));
ui.showSupport.addEventListener("change", () => toggle("debug-support", ui.showSupport.checked));
ui.showCorridor.addEventListener("change", () => toggle("debug-corridor", ui.showCorridor.checked));
ui.regenerate.addEventListener("click", regenerate);
ui.export.addEventListener("click", () => {
  const blob = new Blob([serialiseChallenge(challenge.state)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "ChallengeState.json"; link.click(); URL.revokeObjectURL(link.href);
  ui.status.textContent = "ChallengeState.json exported.";
});
function resize() { const { clientWidth, clientHeight } = viewport; camera.aspect = clientWidth / clientHeight; camera.updateProjectionMatrix(); renderer.setSize(clientWidth, clientHeight, false); }
window.addEventListener("resize", resize); resize(); setInputs(DEFAULT_SETTINGS); regenerate();
let frames = 0, fpsStarted = performance.now();
renderer.setAnimationLoop(() => {
  controls.update(); renderer.render(scene, camera); frames++;
  const now = performance.now(); if (now - fpsStarted >= 500) { ui.fps.textContent = Math.round(frames * 1000 / (now - fpsStarted)); frames = 0; fpsStarted = now; }
});
