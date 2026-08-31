import { BuildBoard } from '../bricks/build-board.js';
import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { RobotRenderer } from '../render/robot-renderer.js';
import { RobotController, RobotError } from '../robot/controller.js';
import { CHALLENGE_LAYOUT, UR10_DEFINITION } from '../robot/ur10-definition.js';
import { RevisionClock } from '../state/revision-clock.js';
import { compileImageData } from './compiler.js';
import { makePattern } from './patterns.js';
import { challengeBoardLimits, createChallengeInventory, remapBlueprintToChallenge } from './workcell-adapter.js';
import { createLogoRoboRuntime } from './runtime.js';
import { registerWebMcpTools } from '../webmcp/register-tools.js';
import { ConnectionGraph } from '../player/connection-graph.js';
import { HumanBuildAdapter } from '../player/human-build-adapter.js';
import { PlacementIntentEngine } from '../player/placement-intent.js';
import { loadPlayerSettings, PlayerSettingsStore, PLAYER_SOURCE_PROVENANCE } from '../player/player-settings.js';
import { installPlayerSettingsPanel } from '../player/player-settings-panel.js';
import { makeV8InitialSpawn, makeV8MoreSpawn, mapV8SpawnToMachine } from '../player/v8-spawn.js';

const params = new URLSearchParams(window.__LOGO_ROBO_QUERY__ ?? location.search);
const evidenceMode = params.has('evidence');

function makeRoundBlueprint() {
  const compiled = compileImageData(makePattern('diagonal', 64), {
    brickBudget: 8,
    boardLimits: challengeBoardLimits(),
    fitMode: 'contain',
    seed: 173
  }).blueprint;
  return remapBlueprintToChallenge(compiled);
}

const blueprint = makeRoundBlueprint();
const makeRoundBricks = () => createChallengeInventory(blueprint);
const revisionClock = new RevisionClock();
const board = new BuildBoard(blueprint, { revisionClock, mode: 'co-build' });
const playerSettingsStore = new PlayerSettingsStore(await loadPlayerSettings());
const playerSettings = playerSettingsStore.get();
const makePlayerBricks = () => mapV8SpawnToMachine(makeV8InitialSpawn(playerSettings), playerSettings);
const controller = new RobotController({ board, bricks: evidenceMode ? makeRoundBricks() : makePlayerBricks(), revisionClock, timeScale: evidenceMode ? 0 : 0.35 });
const connectionGraph = new ConnectionGraph(playerSettings);
const placementEngine = new PlacementIntentEngine(playerSettings, board, connectionGraph);
const humanBuildAdapter = new HumanBuildAdapter({ controller, board, graph: connectionGraph, placementEngine });
const renderer = new RobotRenderer(document.querySelector('#scene'), controller, {
  board,
  playerSettings,
  humanBuildAdapter
});
const runtime = createLogoRoboRuntime({ controller, board, resetBricks: evidenceMode ? makeRoundBricks : makePlayerBricks, humanBuildAdapter });

const $ = (selector) => document.querySelector(selector);
const statusEl = $('[data-status]');
const webmcpEl = $('[data-webmcp]');
const tcpEl = $('[data-tcp]');
const jointsEl = $('[data-joints]');
const heldEl = $('[data-held]');
const rrevEl = $('[data-rrev]');
const wrevEl = $('[data-wrev]');
const progressEl = $('[data-progress]');
const fpsEl = $('[data-fps]');
const frameMsEl = $('[data-frame-ms]');
const gripperEl = $('[data-gripper]');
const yawEl = $('[data-yaw]');
const jawEl = $('[data-jaw]');
const logEl = $('[data-log]');
const toolListEl = $('[data-tool-list]');
const moveForm = $('[data-move-form]');
const moveButton = moveForm?.querySelector('button[type="submit"]');
const playerStateEl = $('[data-player-state]');
const playerHeldEl = $('[data-player-held]');
const hudFpsEl = $('[data-hud-fps]');
const hudFrameEl = $('[data-hud-frame]');
const hudPositionEl = $('[data-hud-pos]');
const hudZoneEl = $('[data-hud-zone]');
const hudOrientationEl = $('[data-hud-orientation]');
const hudSnapEl = $('[data-hud-snap]');
const anglePillEl = $('[data-angle-pill]');
const reticleStatusEl = $('[data-reticle-status]');
const crosshairEl = $('#crosshair');
const performancePanelEl = $('#performance-panel');
const performanceContentEl = $('[data-perf-content]');
const debugPanelEl = $('#debug-panel');

const settingsPanelController = installPlayerSettingsPanel({
  store: playerSettingsStore,
  panel: $('[data-settings-panel]'),
  groups: $('[data-settings-groups]'),
  search: $('[data-settings-search]'),
  onImportError: (error) => addLog(`Settings import rejected: ${error.message}`, 'bad')
});
playerSettingsStore.subscribe((key) => renderer.applySettings(key));
let moreBricksBurst = 0;
function spawnMoreBricks() {
  const startIndex = controller.getBricks().length;
  const records = mapV8SpawnToMachine(makeV8MoreSpawn(playerSettings, ++moreBricksBurst, { startIndex }), playerSettings);
  const result = controller.addLooseBricks(records, { actor: 'human' });
  if (!result.ok) return result;
  renderer.launchSpawnedBricks(result.bricks);
  renderer.workbench.pressMoreBricks();
  return { ...result, action: 'more_bricks' };
}
renderer.setMoreBricksHandler(() => handleAction(null, spawnMoreBricks, 'Added 10 V8 physics bricks'));
const seedEl = $('[data-seed]');
if (seedEl) seedEl.textContent = String(playerSettings.seed);

function openSettingsFilter(query = '') {
  settingsPanelController?.setOpen(true);
  const search = $('[data-settings-search]');
  if (!search) return;
  search.value = query;
  search.dispatchEvent(new Event('input', { bubbles: true }));
}

const togglePanel = (panel) => panel?.classList.toggle('hidden');
$('[data-debug-toggle]')?.addEventListener('click', () => togglePanel(debugPanelEl));
$('[data-perf-toggle]')?.addEventListener('click', () => togglePanel(performancePanelEl));
$('[data-debug-close]')?.addEventListener('click', () => debugPanelEl?.classList.add('hidden'));
$('[data-perf-close]')?.addEventListener('click', () => performancePanelEl?.classList.add('hidden'));
addEventListener('keydown', (event) => {
  if (event.target?.matches?.('input,select,textarea')) return;
  if (event.code === 'F2') { event.preventDefault(); togglePanel(debugPanelEl); }
  if (event.code === 'F3') { event.preventDefault(); togglePanel(performancePanelEl); }
});

function nowLabel() { return new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function addLog(message, kind = '') {
  if (!logEl) return;
  const row = document.createElement('p');
  const time = document.createElement('time');
  const text = document.createElement('span');
  time.textContent = nowLabel();
  text.textContent = message;
  if (kind) text.className = kind;
  row.append(time, text);
  logEl.prepend(row);
  while (logEl.children.length > 20) logEl.lastElementChild.remove();
}
let toastTimer = 0;
function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}
function setStatus(value, kind = '') { if (statusEl) { statusEl.textContent = value; statusEl.dataset.kind = kind; } }
function formatNumber(value) { return Number.isFinite(value) ? value.toFixed(1) : '—'; }

function getRobotState() { return runtime.robot.getState(); }
function getWorkspace() { return runtime.robot.getWorkspace(); }
function getSceneState() {
  const snapshot = runtime.world.getSnapshotData();
  return {
    schemaVersion: 'logo-robo.scene.v2',
    worldRevision: snapshot.worldRevision,
    coordinateFrame: 'machine-mm-rad',
    displayFrame: {
      id: 'main-demo-v8-world-mm',
      machineOriginMm: {
        xMm: playerSettings.robotMountXmm,
        yMm: playerSettings.robotMountYmm,
        zMm: playerSettings.robotMountZmm
      },
      machineYawDeg: playerSettings.robotMountYawDeg
    },
    blueprintId: blueprint.blueprintId,
    workcell: {
      tableZMm: CHALLENGE_LAYOUT.tableZMm,
      tray: CHALLENGE_LAYOUT.tray,
      board: CHALLENGE_LAYOUT.board,
      displayTable: {
        xMm: playerSettings.tableXmm,
        yMm: playerSettings.tableYmm,
        yawDeg: playerSettings.tableYawDeg,
        widthMm: playerSettings.tableWidthMm,
        depthMm: playerSettings.tableDepthMm,
        topHeightMm: playerSettings.tableTopHeightMm
      }
    },
    objects: snapshot.objects,
    build: board.getBuildState({ limit: 20 })
  };
}

async function moveTool(input, { signal } = {}) {
  const result = await runtime.robot.moveTool(input, { signal });
  return result;
}
async function latch(input = {}) { return runtime.robot.latch({ actor: input.actor ?? 'human', expectedWorldRevision: input.expectedWorldRevision }); }
async function unlatch(input = {}) { return runtime.robot.unlatch({ actor: input.actor ?? 'human', expectedWorldRevision: input.expectedWorldRevision }); }
async function resetScene() {
  moreBricksBurst = 0;
  const result = evidenceMode
    ? await runtime.robot.reset({ expectedWorldRevision: controller.getState().worldRevision })
    : controller.setBricks(makePlayerBricks());
  setStatus('READY');
  addLog('Workcell reset');
  return { ok: true, robot: getRobotState(), scene: getSceneState(), result };
}

function nextTask() {
  const target = board.getTargets().find((candidate) => !candidate.occupiedBy);
  if (!target) return null;
  const brick = controller.getBricks().find((candidate) => !candidate.heldBy && !candidate.snapped && candidate.colour === target.colour);
  return brick ? { brick, target } : null;
}

async function runOnePickPlace({ signal } = {}) {
  const task = nextTask();
  if (!task) return { ok: board.isComplete(), reason: board.isComplete() ? null : 'matching_brick_unavailable', stage: board.isComplete() ? 'complete' : 'blocked' };
  setStatus('RUNNING');
  const { brick, target } = task;
  const pickupTcp = { xMm: brick.position.xMm, yMm: brick.position.yMm, zMm: brick.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm };
  const targetTcp = { xMm: target.position.xMm, yMm: target.position.yMm, zMm: target.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm };
  const above = (point) => ({ xMm: point.xMm, yMm: point.yMm, zMm: 400 });
  const transfer = { xMm: 600, yMm: 0, zMm: 450 };
  const move = async (label, targetPoint, speedMmS) => {
    addLog(`MOVE ${label}`);
    const result = await moveTool({ ...targetPoint, speedMmS }, { signal });
    if (!result.ok) throw new RobotError(result.reason, result);
    return result;
  };
  try {
    await move('pickup approach', above(pickupTcp), 500);
    await move('pickup', pickupTcp, 220);
    const capture = await latch({ actor: 'agent' });
    if (!capture.ok) throw new RobotError(capture.reason, capture);
    await move('lift', above(pickupTcp), 300);
    await move('transfer safe point', transfer, 400);
    await move('target approach', above(targetTcp), 350);
    await move('target', targetTcp, 180);
    const release = await unlatch({ actor: 'agent' });
    if (!release.ok || !release.snapped) throw new RobotError(release.reason ?? 'no_snap_target', release);
    await move('retreat', above(targetTcp), 300);
    await move('return safe point', transfer, 400);
    const progress = board.progress();
    setStatus(progress.correctTargets === progress.totalTargets ? 'COMPLETE' : 'READY', progress.correctTargets === progress.totalTargets ? 'ok' : '');
    addLog(`Placed ${brick.id} → ${release.targetId}`, 'ok');
    return { ok: true, stage: 'placed', brickId: brick.id, targetId: release.targetId, progress, robot: getRobotState(), scene: getSceneState() };
  } catch (error) {
    setStatus('FAULT', 'bad');
    const reason = error.code ?? error.message;
    addLog(`Rejected: ${reason}`, 'bad');
    return { ok: false, reason, details: error.details ?? {}, robot: getRobotState(), scene: getSceneState() };
  }
}

async function runRound({ signal } = {}) {
  const results = [];
  while (!board.isComplete()) {
    const result = await runOnePickPlace({ signal });
    results.push(result);
    if (!result.ok) return { ok: false, reason: result.reason, results, progress: board.progress() };
  }
  return { ok: true, results, progress: board.progress(), scene: getSceneState() };
}

function stageV8ParityConnection() {
  const [supportSource, carriedSource] = controller.getBricks();
  if (!supportSource || !carriedSource) return { ok: false, reason: 'insufficient_bricks' };
  const frame = placementEngine.tableFrame;
  const supportPosition = {
    xMm: frame.centre.xMm - 72,
    yMm: frame.centre.yMm,
    zMm: frame.placementSurfaceZMm + playerSettings.brickBodyHeightMm / 2
  };
  const carriedPosition = {
    xMm: supportPosition.xMm - 180,
    yMm: supportPosition.yMm - 130,
    zMm: supportPosition.zMm + 120
  };
  controller.moveLooseBrick(supportSource.id, supportPosition, { actor: 'parity_diagnostic', yawRad: 0 });
  controller.moveLooseBrick(carriedSource.id, carriedPosition, { actor: 'parity_diagnostic', yawRad: 0 });
  connectionGraph.clear();
  connectionGraph.registerMatRoot(supportSource.id, []);
  const support = controller.getBricks().find((brick) => brick.id === supportSource.id);
  const carried = controller.getBricks().find((brick) => brick.id === carriedSource.id);
  const pickup = humanBuildAdapter.pickup(carried.id);
  if (!pickup.ok) return pickup;
  renderer.heldVisual.pickup(carried);
  const candidate = placementEngine.connectionCandidate(
    support,
    { xMm: support.position.xMm - 12, yMm: support.position.yMm, zMm: support.position.zMm + playerSettings.brickBodyHeightMm / 2 },
    carried,
    controller.getBricks()
  );
  humanBuildAdapter.setPreview(candidate);
  renderer.heldVisual.setCandidate(candidate);
  renderer.setView('tray');
  renderer.render();
  return { ok: true, candidate };
}

const actions = {
  getSceneState, getRobotState, getWorkspace, moveTool, latch, unlatch, resetScene, spawnMoreBricks, runOnePickPlace, runRound,
  home: ({ signal } = {}) => moveTool({ ...UR10_DEFINITION.homeTcp, speedMmS: 420 }, { signal })
};

function updateUi() {
  const state = controller.getState();
  const progress = board.progress();
  if (tcpEl) tcpEl.textContent = `${formatNumber(state.tcp.xMm)} / ${formatNumber(state.tcp.yMm)} / ${formatNumber(state.tcp.zMm)} mm`;
  if (jointsEl) jointsEl.textContent = state.jointsRad.map((value) => `${(value * 180 / Math.PI).toFixed(0)}°`).join(' ');
  if (heldEl) heldEl.textContent = state.heldBrickId ?? 'NONE';
  if (yawEl) yawEl.textContent = `${(state.toolYawRad * 180 / Math.PI).toFixed(1)}° AUTO`;
  if (jawEl) jawEl.textContent = `${state.gripper.jawGapMm.toFixed(1)} mm`;
  if (rrevEl) rrevEl.textContent = String(state.robotRevision);
  if (wrevEl) wrevEl.textContent = String(state.worldRevision);
  if (progressEl) progressEl.textContent = `${progress.correctTargets}/${progress.totalTargets}`;
  if (state.operationState === 'planning') setStatus('PLANNING');
  else if (state.moving) setStatus('MOVING');
  else if (state.heldBrickId) setStatus('LATCHED');
  else if (statusEl?.textContent === 'MOVING' || statusEl?.textContent === 'PLANNING' || statusEl?.textContent === 'LATCHED') setStatus('READY');
}

controller.subscribe((event) => {
  updateUi();
  if (event.type === 'motion_started') addLog(`Accepted path → ${event.target.xMm.toFixed(0)}, ${event.target.yMm.toFixed(0)}, ${event.target.zMm.toFixed(0)}`);
  if (event.type === 'motion_completed') addLog('Motion accepted', 'ok');
  if (event.type === 'motion_cancelled') addLog('Motion cancelled safely', 'bad');
  if (event.type === 'latched') addLog(`Latch accepted: ${event.brickId}`, 'ok');
  if (event.type === 'unlatched') addLog(event.snap?.ok ? `Board snap accepted: ${event.snap.targetId}` : 'Released without snap', event.snap?.ok ? 'ok' : 'bad');
  if (event.type === 'unlatched' && event.snap?.ok) {
    connectionGraph.registerPlacement(event.brickId, { placementType: 'blueprint-target' });
  }
  if (event.type === 'reset' || event.type === 'world_reset') connectionGraph.clear();
});

humanBuildAdapter.subscribe((event) => {
  if (event.type === 'picked_up') addLog(`Player picked up ${event.brickId}`, 'ok');
  if (event.type === 'released') addLog(`Player placed ${event.brickId}`, 'ok');
  if (event.type === 'dropped') addLog(`Player dropped ${event.brickId}`);
  if (event.type === 'mode_changed') addLog(`Player mode: ${event.mode}`);
});

async function handleAction(button, action, successMessage) {
  if (button) button.disabled = true;
  try {
    const result = await action();
    if (result?.ok) { if (successMessage) addLog(successMessage, 'ok'); }
    else { addLog(`Rejected: ${result?.reason ?? 'unknown'}`, 'bad'); setStatus('REJECTED', 'bad'); }
    return result;
  } finally { if (button) button.disabled = false; }
}

moveForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(moveForm);
  await handleAction(moveButton, () => moveTool({ xMm: Number(form.get('xMm')), yMm: Number(form.get('yMm')), zMm: Number(form.get('zMm')), speedMmS: Number(form.get('speedMmS')) }), 'Manual Cartesian move accepted');
});

for (const button of document.querySelectorAll('[data-target]')) {
  button.addEventListener('click', () => {
    const task = nextTask();
    const targetName = button.dataset.target;
    const target = targetName === 'pickup' && task ? { ...task.brick.position, zMm: task.brick.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm }
      : targetName === 'target' && task ? { ...task.target.position, zMm: task.target.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm }
        : UR10_DEFINITION.homeTcp;
    for (const [key, value] of Object.entries({ ...target, speedMmS: targetName === 'home' ? 420 : 180 })) {
      const field = moveForm?.elements.namedItem(key); if (field) field.value = value;
    }
    addLog(`Loaded ${targetName} target`);
  });
}

$('[data-action="run"]')?.addEventListener('click', (event) => handleAction(event.currentTarget, () => runOnePickPlace(), null));
$('[data-action="round"]')?.addEventListener('click', (event) => handleAction(event.currentTarget, () => runRound(), null));
$('[data-action="home"]')?.addEventListener('click', (event) => handleAction(event.currentTarget, () => actions.home(), 'Home accepted'));
for (const button of document.querySelectorAll('[data-action="reset"]')) button.addEventListener('click', (event) => handleAction(event.currentTarget, () => resetScene(), null));
$('[data-action="latch"]')?.addEventListener('click', (event) => handleAction(event.currentTarget, () => latch({ actor: 'human' }), 'Latch accepted'));
$('[data-action="unlatch"]')?.addEventListener('click', (event) => handleAction(event.currentTarget, () => unlatch({ actor: 'human' }), 'Unlatch accepted'));
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => renderer.setView(button.dataset.view));
for (const button of document.querySelectorAll('[data-player-mode]')) {
  button.addEventListener('click', () => {
    const playerMode = button.dataset.playerMode === 'player';
    renderer.setPlayerMode(playerMode);
    addLog(playerMode ? 'MAIN_DEMO player controls active' : 'Orbit camera active', 'ok');
  });
}
$('[data-build-mode="BUILD"]')?.addEventListener('click', () => humanBuildAdapter.setMode('BUILD'));
$('[data-build-mode="TEST"]')?.addEventListener('click', () => humanBuildAdapter.setMode('TEST'));
const PLAYER_PRESETS = Object.freeze({
  precise: { mouseSensitivityRadPerPx: 0.00125, moveSpeedMmS: 900, verticalSpeedMmS: 650, accelerationMmS2: 3800, decelerationMmS2: 5200, maximumSpeedMmS: 2200 },
  balanced: { mouseSensitivityRadPerPx: 0.00165, moveSpeedMmS: 1500, verticalSpeedMmS: 1000, accelerationMmS2: 5500, decelerationMmS2: 6500, maximumSpeedMmS: 3600 },
  fast: { mouseSensitivityRadPerPx: 0.00205, moveSpeedMmS: 2300, verticalSpeedMmS: 1500, accelerationMmS2: 7800, decelerationMmS2: 8500, maximumSpeedMmS: 5200 }
});
for (const button of document.querySelectorAll('[data-settings-preset]')) button.addEventListener('click', () => {
  const preset = button.dataset.settingsPreset;
  playerSettingsStore.setMany(PLAYER_PRESETS[preset]);
  for (const candidate of document.querySelectorAll('[data-settings-preset]')) candidate.classList.toggle('active', candidate === button);
  showToast(`${button.textContent} player preset`);
});
$('[data-new-seed]')?.addEventListener('click', async () => {
  playerSettingsStore.set('seed', Math.floor(Math.random() * 0x100000000) >>> 0);
  if (seedEl) seedEl.textContent = String(playerSettings.seed);
  await resetScene();
  showToast('New seed loaded');
});
$('[data-copy-player-settings]')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(playerSettingsStore.exportJSON());
    showToast('Settings JSON copied');
  } catch {
    showToast('Clipboard unavailable');
  }
});
$('[data-reset-brick-settings]')?.addEventListener('click', () => {
  playerSettingsStore.setMany({ brickLengthMm: 31.8, brickWidthMm: 15.8, brickBodyHeightMm: 9.6, studPitchMm: 8, studDiameterMm: 4.8, studHeightMm: 1.8, brickMassKg: 0.0024 });
  showToast('Real brick dimensions restored');
});
$('[data-export-player-settings]')?.addEventListener('click', () => {
  const blob = new Blob([playerSettingsStore.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ROBO_BRIDGE_MAIN_DEMO_PLAYER_SETTINGS.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('[data-color-grading]')?.addEventListener('change', (event) => {
  playerSettingsStore.set('colorGradingEnabled', event.currentTarget.checked);
});
$('[data-lut-file]')?.addEventListener('change', async (event) => {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  try {
    const diagnostics = renderer.colorGrader.loadCubeText(await file.text(), file.name);
    playerSettingsStore.set('colorGradingEnabled', true);
    const toggle = $('[data-color-grading]');
    if (toggle) toggle.checked = true;
    addLog(`LUT ready: ${diagnostics.lutName} (${diagnostics.lutSize}³)`, 'ok');
  } catch (error) {
    addLog(`LUT rejected: ${error.message}`, 'bad');
  }
});
$('[data-clear-lut]')?.addEventListener('click', () => {
  renderer.colorGrader.clearLut();
  addLog('LUT cleared');
});

function updateToolDiagnostics(event) {
  if (!toolListEl) return;
  toolListEl.querySelector('[data-status="pending"]')?.remove();
  let tool = toolListEl.querySelector(`[data-tool="${event.toolName}"]`);
  if (!tool) { tool = document.createElement('span'); tool.dataset.tool = event.toolName; tool.textContent = event.toolName; toolListEl.append(tool); }
  tool.dataset.status = event.status;
  if (event.status === 'discovered') addLog(`WebMCP discovered: ${event.toolName}`, 'ok');
  if (event.status === 'executing') addLog(`WebMCP executing: ${event.toolName}`);
  if (event.status === 'succeeded') addLog(`WebMCP succeeded: ${event.toolName}`, 'ok');
  if (event.status === 'rejected') addLog(`WebMCP rejected: ${event.toolName} (${event.reason ?? 'invalid request'})`, 'bad');
}

renderer.start();
setInterval(() => {
  const performance = renderer.getPerformance();
  const fpsText = performance.fps ? performance.fps.toFixed(0) : '—';
  const frameText = performance.meanFrameMs ? `${performance.meanFrameMs.toFixed(2)} ms` : '— ms';
  if (fpsEl) fpsEl.textContent = fpsText;
  if (frameMsEl) frameMsEl.textContent = frameText;
  if (hudFpsEl) hudFpsEl.textContent = fpsText;
  if (hudFrameEl) hudFrameEl.textContent = frameText;
  if (gripperEl) {
    gripperEl.textContent = performance.gripper.state === 'ready' ? 'REAL GLB READY' : performance.gripper.state.toUpperCase();
    gripperEl.dataset.kind = performance.gripper.state === 'ready' ? 'ok' : 'warning';
  }
  if (playerStateEl) {
    playerStateEl.textContent = performance.player?.enabled
      ? (performance.player.pointerLocked ? 'PLAYER · LOCKED · ESC FOR UI' : 'CLICK TO LOCK POINTER')
      : 'ORBIT CAMERA';
  }
  const heldId = performance.heldBrick?.brickId ?? performance.interaction.snapBrickId ?? null;
  if (playerHeldEl) playerHeldEl.textContent = heldId ?? 'NONE';
  if (hudPositionEl) hudPositionEl.textContent = performance.player?.position?.map((value) => Math.round(value)).join(' ') ?? '—';
  const preview = performance.interaction.preview;
  const zone = performance.interaction.snapAnimating ? 'SNAPPING'
    : performance.heldBrick?.state?.replace(/^HELD_/, '') ?? 'PHYSICS';
  if (hudZoneEl) hudZoneEl.textContent = zone;
  const orientation = `${placementEngine.rotationQuarterTurns * 90}°`;
  if (hudOrientationEl) hudOrientationEl.textContent = orientation;
  if (anglePillEl) {
    anglePillEl.textContent = `ANGLE ${orientation}`;
    anglePillEl.classList.toggle('hidden', !heldId);
  }
  const snapStatus = performance.interaction.snapAnimating ? 'SNAPPING' : preview?.status ?? 'NONE';
  if (hudSnapEl) hudSnapEl.textContent = snapStatus;
  const aimed = Boolean(performance.interaction.highlightedBrickId || performance.interaction.highlightedMoreBricks || (preview && preview.status !== 'NONE'));
  crosshairEl?.classList.toggle('target', aimed);
  if (reticleStatusEl) reticleStatusEl.textContent = performance.interaction.highlightedMoreBricks ? 'MORE BRICKS'
    : performance.interaction.highlightedBrickId ? 'PICK BRICK'
      : preview?.status === 'VALID' ? `SNAP ${preview.mode ?? preview.type}`
        : preview?.status === 'BLOCKED' ? 'BLOCKED' : '';
  if (performanceContentEl) performanceContentEl.innerHTML = `<span>FPS mean</span><b>${fpsText}</b><span>Frame mean</span><b>${frameText}</b><span>Frame p95</span><b>${performance.p95FrameMs.toFixed(2)} ms</b><span>Frame max</span><b>${performance.maxFrameMs.toFixed(2)} ms</b><span>Physics</span><b>${playerSettings.physicsHz} Hz</b><span>Loose bodies</span><b>${performance.looseBrickPhysics.length}</b>`;
}, 500);
window.addEventListener('resize', () => renderer.render());

try {
  const result = await registerWebMcpTools(runtime, updateToolDiagnostics);
  if (webmcpEl) {
    if (result.ok) { webmcpEl.textContent = `${result.toolCount} TOOLS READY`; webmcpEl.dataset.kind = 'ok'; addLog(`WebMCP ready: ${result.toolNames.join(', ')}`, 'ok'); }
    else { webmcpEl.textContent = 'WEBMCP UNAVAILABLE'; webmcpEl.dataset.kind = 'warning'; addLog(`WebMCP unavailable: ${result.reason}`, 'bad'); }
  }
} catch {
  if (webmcpEl) { webmcpEl.textContent = 'WEBMCP FAILED'; webmcpEl.dataset.kind = 'warning'; }
  addLog('WebMCP registration failed', 'bad');
}

window.__LOGO_ROBO__ = Object.freeze({
  version: '3.1.0-main-demo-player-v8',
  product: 'ROBO BRIDGE MCP MAIN_DEMO',
  actions,
  runtime,
  robotController: controller,
  humanBuildAdapter,
  connectionGraph,
  playerSettingsStore,
  playerSourceProvenance: PLAYER_SOURCE_PROVENANCE,
  board,
  blueprint,
  renderer,
  getSceneState,
  getRobotState,
  getWorkspace,
  get scene() { return getSceneState(); }
});
window.__ROBO_BRIDGE__ = window.__LOGO_ROBO__;
window.__LOGO_ROBO_RUNTIME__ = runtime;

if (['connection', 'snap'].includes(params.get('parityPreview'))) {
  setTimeout(() => { window.__LOGO_ROBO_PARITY_PREVIEW__ = stageV8ParityConnection(); }, 80);
  if (params.get('parityPreview') === 'snap') setTimeout(() => renderer.releaseHeldPlacement(), 3000);
}

if (evidenceMode) {
  runRound().then((result) => { window.__LOGO_ROBO_EVIDENCE_RESULT__ = result; window.__LOGO_ROBO_EVIDENCE_READY__ = true; });
}
