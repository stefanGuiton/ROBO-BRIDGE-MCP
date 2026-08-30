import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { PRESETS, generateChallenge, serialiseChallenge } from "./v2/index.js";
import { createDebugOverlays } from "./render/debug-overlays.js";
import { disposeObjectTree } from "./render/resource-disposal.js";
import { createTerrainObject, createWaterObject } from "./render/terrain-renderer.js";

const viewport = document.querySelector("#viewport");
const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map((node) => [node.id, node]));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f6f5);
const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 600);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 28;
controls.maxDistance = 260;
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8b948e, 2.1));
const sun = new THREE.DirectionalLight(0xfff8ea, 3.25);
sun.position.set(-65, 92, -46);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
scene.add(sun);

const diagnostics = { regenerations: 0, disposed: { geometries: 0, materials: 0, textures: 0 }, lastGpuMs: 0 };
let selectedPreset = { ...PRESETS.V2_MOUNTAIN_PASS };
let currentResult = null;
let generatedRoot = null;

const terrainFields = ["floorWidth", "valleyDepth", "shoulderWidth", "moundFalloffWidth", "moundEdgeDrop", "mountainPeakScale", "ridgeAmplitude", "ridgeScale", "ridgeWarpAmplitude", "centreNoiseAmplitude", "centreNoiseScale", "macroAmplitude", "slopeNoiseAmplitude", "detailAmplitude", "terraceStrength"];
const stretchFields = ["stretchX", "stretchY", "stretchZ"];
const fields = [...terrainFields, ...stretchFields];
const visibility = () => ({ anchors: ui.showAnchors.checked, platforms: ui.showPlatforms.checked, support: ui.showSupport.checked, corridor: ui.showCorridor.checked, obstacle: ui.showObstacle.checked });

function resetCamera() {
  const settings = currentResult?.settings || selectedPreset;
  const verticalSpan = settings.sharedTopY - settings.valleyFloorY + settings.baseThickness;
  const framingScale = Math.max(0.72, settings.chunkWidth / 160, settings.chunkDepth / 96, verticalSpan / 68);
  const cameraScale = framingScale > 1 ? framingScale * 1.1 : framingScale;
  const targetY = settings.sharedTopY * 0.12;
  camera.near = 0.1;
  camera.far = Math.max(600, cameraScale * 900);
  camera.updateProjectionMatrix();
  controls.maxDistance = Math.max(260, cameraScale * 360);
  camera.position.set(112 * cameraScale, targetY + 82 * cameraScale, 118 * cameraScale);
  controls.target.set(0, targetY, 0);
  controls.update();
}

function updateOutputs() {
  for (const key of fields) {
    const precision = [...stretchFields, "terraceStrength", "detailAmplitude", "centreNoiseAmplitude", "slopeNoiseAmplitude"].includes(key) ? 2 : ["macroAmplitude", "moundFalloffWidth", "moundEdgeDrop", "mountainPeakScale", "ridgeAmplitude", "ridgeWarpAmplitude"].includes(key) ? 1 : 0;
    ui[`${key}-output`].value = Number(ui[key].value).toFixed(precision);
  }
}

function setInputs(settings) {
  selectedPreset = { ...settings };
  ui.seed.value = settings.seed;
  ui.mode.value = settings.mode;
  ui.floorWidth.value = settings.floorWidth;
  ui.valleyDepth.value = settings.sharedTopY - settings.valleyFloorY;
  for (const key of ["shoulderWidth", "moundFalloffWidth", "moundEdgeDrop", "mountainPeakScale", "ridgeAmplitude", "ridgeScale", "ridgeWarpAmplitude", "centreNoiseAmplitude", "centreNoiseScale", "macroAmplitude", "slopeNoiseAmplitude", "detailAmplitude", "terraceStrength", ...stretchFields]) ui[key].value = settings[key];
  updateOutputs();
}

function readInputs() {
  const settings = { ...selectedPreset };
  settings.seed = Number(ui.seed.value) | 0;
  settings.mode = ui.mode.value;
  for (const key of ["floorWidth", "shoulderWidth", "moundFalloffWidth", "moundEdgeDrop", "mountainPeakScale", "ridgeAmplitude", "ridgeScale", "ridgeWarpAmplitude", "centreNoiseAmplitude", "centreNoiseScale", "macroAmplitude", "slopeNoiseAmplitude", "detailAmplitude", "terraceStrength", ...stretchFields]) settings[key] = Number(ui[key].value);
  settings.valleyFloorY = settings.sharedTopY - Number(ui.valleyDepth.value);
  settings.validateMesh = false;
  return settings;
}

function addDisposal(disposed) {
  for (const key of Object.keys(diagnostics.disposed)) diagnostics.disposed[key] += disposed[key];
}

function setLayer(name, visible) {
  const layer = generatedRoot?.getObjectByName(name);
  if (layer) layer.visible = visible;
}

function updateMetrics(result, gpuMs) {
  ui["generation-ms"].textContent = `${result.timings.total.toFixed(2)} ms`;
  ui["mesh-ms"].textContent = `${result.timings.mesh.toFixed(2)} ms`;
  ui["upload-ms"].textContent = `${gpuMs.toFixed(2)} ms`;
  ui["vertex-count"].textContent = result.meshData.vertexCount.toLocaleString();
  ui["triangle-count"].textContent = result.meshData.triangleCount.toLocaleString();
  ui["support-count"].textContent = result.supportRegions.length.toLocaleString();
  ui["geometry-count"].textContent = renderer.info.memory.geometries.toLocaleString();
  ui["height-checksum"].textContent = result.checksums.heightField;
}

function regenerate() {
  ui.status.textContent = "Generating deterministic terrain…";
  let candidateRoot = null;
  const previousRoot = generatedRoot;
  const previousResult = currentResult;
  try {
    const settings = readInputs();
    const candidateResult = generateChallenge(settings.seed, settings);
    candidateRoot = new THREE.Group();
    candidateRoot.name = "generated-challenge";
    candidateRoot.add(createTerrainObject(candidateResult));
    const water = createWaterObject(candidateResult);
    if (water) candidateRoot.add(water);
    candidateRoot.add(createDebugOverlays(candidateResult, visibility()));
    const uploadStarted = performance.now();
    scene.add(candidateRoot);
    renderer.compile(scene, camera);
    if (previousRoot) previousRoot.visible = false;
    renderer.render(scene, camera);
    if (previousRoot) addDisposal(disposeObjectTree(scene, previousRoot));
    currentResult = candidateResult;
    generatedRoot = candidateRoot;
    candidateRoot = null;
    const stretchChanged = previousResult && stretchFields.some((key) => previousResult.sourceSettings[key] !== currentResult.sourceSettings[key]);
    if (stretchChanged) resetCamera();
    diagnostics.lastGpuMs = performance.now() - uploadStarted;
    diagnostics.regenerations += 1;
    updateMetrics(currentResult, diagnostics.lastGpuMs);
    ui.status.textContent = `${currentResult.settings.mode.toUpperCase()} · seed ${currentResult.settings.seed} · two banks · shared plane Y ${currentResult.platforms.sharedPlaneY}`;
    window.__terrainChallenge = currentResult;
    window.__lastTerrainError = null;
    window.__terrainDiagnostics = { ...diagnostics, rendererMemory: { ...renderer.info.memory }, meshChecksum: currentResult.checksums.mesh };
    return currentResult;
  } catch (error) {
    if (previousRoot) previousRoot.visible = true;
    if (candidateRoot) addDisposal(disposeObjectTree(scene, candidateRoot));
    console.error(error);
    window.__lastTerrainError = { code: error.code || "GENERATION_ERROR", message: error.message };
    const retained = currentResult ? " Last valid terrain retained." : "";
    ui.status.textContent = `${error.code || "GENERATION_ERROR"}: ${error.message}.${retained}`;
    return null;
  }
}

for (const [name, settings] of Object.entries(PRESETS)) {
  const button = document.createElement("button");
  button.textContent = name.replace(/^V2_/, "").replaceAll("_", " ");
  button.addEventListener("click", () => { setInputs(settings); regenerate(); });
  ui["preset-row"].append(button);
}
for (const key of fields) ui[key].addEventListener("input", updateOutputs);
ui.regenerate.addEventListener("click", regenerate);
ui.resetCamera.addEventListener("click", resetCamera);
ui.showAnchors.addEventListener("change", () => setLayer("debug-anchors", ui.showAnchors.checked));
ui.showPlatforms.addEventListener("change", () => setLayer("debug-platforms", ui.showPlatforms.checked));
ui.showSupport.addEventListener("change", () => setLayer("debug-support", ui.showSupport.checked));
ui.showCorridor.addEventListener("change", () => setLayer("debug-corridor", ui.showCorridor.checked));
ui.showObstacle.addEventListener("change", () => setLayer("debug-obstacle", ui.showObstacle.checked));
ui.export.addEventListener("click", () => {
  if (!currentResult) return;
  const blob = new Blob([serialiseChallenge(currentResult.state)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = "ChallengeState.json"; link.click();
  URL.revokeObjectURL(link.href);
  ui.status.textContent = "ChallengeState.json exported.";
});

function resize() {
  const { clientWidth, clientHeight } = viewport;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight, false);
}
window.addEventListener("resize", resize);
window.__regenerateTerrainForTest = regenerate;
resize(); setInputs(PRESETS.V2_MOUNTAIN_PASS); resetCamera(); regenerate();

let frameCount = 0, fpsStarted = performance.now();
renderer.setAnimationLoop(() => {
  controls.update(); renderer.render(scene, camera); frameCount += 1;
  const time = performance.now();
  if (time - fpsStarted >= 750) {
    ui.fps.textContent = Math.round(frameCount * 1000 / (time - fpsStarted));
    frameCount = 0; fpsStarted = time;
  }
});
