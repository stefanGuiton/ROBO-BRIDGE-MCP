import { prepareBridgeBuild } from '../bridge-construction/bridge-build-session.js';
import { createConstructionService, physicalBuildReport } from '../bridge-construction/construction-service.js';
import { BuildBoard } from '../bricks/build-board.js';
import { PlacementAuthority } from '../bricks/placement-authority.js';
import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { RobotRenderer } from '../render/robot-renderer.js';
import { RobotController, RobotError } from '../robot/controller.js';
import { PlacementLookaheadCoordinator } from '../robot/placement-lookahead.js';
import { PlannedPlacementCycleRunner } from '../robot/placement-cycle-runner.js';
import { createSimpleStructurePlan, ROBOT_SHOWCASE_INVENTORY, toWebMcpPlacements } from '../robot/simple-structure-planner.js';
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
import { makeReachableV8MoreSpawn, makeReachableV8Spawn } from '../player/v8-spawn.js';
import { createV8WorkcellProfile } from '../workcell/v8-workcell-profile.js';
import { robotBasePoseFromSettings, SCENE_LAYOUT_CONTROLS } from '../workcell/scene-layout-settings.js';
import { createMainDemoBridge } from '../bridge/main-demo-bridge.js';
import { createLevel2VisualBridgeTest } from '../bridge/level2-visual-bridge-test.js';
import { createMainDemoEasyChallenge } from '../challenge/main-demo-easy.js';
import { installEndpointSettings } from '../challenge/endpoint-settings.js';
import { createMainDemoTrainIntegration } from '../train-integration/index.js';
import { createLevelGatedTrain } from '../train-integration/level-gated-train.js';
import { createRobotTcpPusher } from '../train-integration/robot-tcp-pusher.js';
import { createTrainBoardFingerprint } from '../train-integration/train-board-fingerprint.js';
import { createTerrainMeshContact } from '../train-integration/terrain-mesh-contact.js';
import { createMainDemoConstructionSession, createProductionMissionRuntime } from '../mission/index.js';
import { createMainDemoSubmissionAcceptance } from '../submission/main-demo-acceptance.js';
import { THREE } from '../render/real-gripper-visual.js';
import { createDemoModeControl, SIMPLE_DEMO_COLOURS } from './simple-demo-mode.js';
import { createPlacementStreamControl } from '../webmcp/placement-stream-control.js';
import { createSceneSettingsTools } from '../webmcp/scene-settings-tools.js';
import { createRecolourLooseBricksTool } from '../workcell/recolour-loose-bricks-tool.js';
import { createSimpleSourceRefill } from '../workcell/simple-source-refill.js';
import { createMoreBricksButton } from '../workcell/more-bricks-button.js';
import { guardDemoLevelTools } from './demo-level-tools.js';
import { createLevel3ResultsCollector, createLevel3ResultsPanel, deriveLevel3Results } from './level3-results.js';

const params = new URLSearchParams(window.__LOGO_ROBO_QUERY__ ?? location.search);
const evidenceMode = params.has('evidence');
const robotShowcaseMode = params.get('showcase') === 'robot-basics';
let demoMode = 'bridge';

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
const workcellProfile = { ...createV8WorkcellProfile(playerSettings) };
const makePlayerBricks = () => {
  const generated = makeReachableV8Spawn(playerSettings, workcellProfile, demoMode === 'simple' ? {
    count: SIMPLE_DEMO_COLOURS.length, colours: SIMPLE_DEMO_COLOURS, yawRad: 0
  } : robotShowcaseMode ? {
    count: ROBOT_SHOWCASE_INVENTORY.length,
    colours: ROBOT_SHOWCASE_INVENTORY
  } : {});
  if (!generated.ok) throw new Error(`V8 reachable scene generation failed: ${generated.reason}`);
  return generated.records;
};
const controller = new RobotController({
  basePose: robotBasePoseFromSettings(playerSettings),
  board,
  bricks: evidenceMode ? makeRoundBricks() : makePlayerBricks(),
  revisionClock,
  workspace: evidenceMode ? undefined : workcellProfile.workspace,
  // Keep strict collision behavior in evidence/tests; the recording demo allows
  // animated robot motion through geometry, not instant accepted placements.
  layout: evidenceMode ? undefined : { ...workcellProfile.layout, simulationMotionCollisions: false },
  timeScale: evidenceMode ? 0 : 0.35
});
const connectionGraph = new ConnectionGraph(playerSettings);
const placementEngine = new PlacementIntentEngine(playerSettings, board, connectionGraph);
const placementAuthority = evidenceMode ? null : new PlacementAuthority({
  board,
  graph: connectionGraph,
  placementEngine,
  settings: playerSettings,
  getBricks: () => controller.getBricks(),
  profile: workcellProfile
});
if (placementAuthority && !controller.setPlacementAuthority(placementAuthority)) {
  throw new Error('Unable to attach the shared V8 placement authority');
}
const fastPlacement = placementAuthority ? new PlacementLookaheadCoordinator({ controller, placementAuthority, workcellProfile }) : null;
const placementCycleRunner = fastPlacement ? new PlannedPlacementCycleRunner({ coordinator: fastPlacement, controller }) : null;
const streamControl = placementCycleRunner ? createPlacementStreamControl({ runner: placementCycleRunner, coordinator: fastPlacement, controller,
  canStart: () => !mainDemoConstruction?.preparedBuild }) : null;
const humanBuildAdapter = new HumanBuildAdapter({ controller, board, graph: connectionGraph, placementEngine });
const renderer = new RobotRenderer(document.querySelector('#scene'), controller, {
  board,
  playerSettings,
  humanBuildAdapter,
  fastPlacement
});
const runtime = createLogoRoboRuntime({
  controller,
  board,
  beforeReset: async () => {
    await streamControl?.stop();
    const state = await mainDemoMission?.service.getMissionState();
    if (mainDemoConstruction?.preparedBuild || (state && state.phase !== 'DESIGN')) {
      throw Object.assign(new Error('Use reset_mission while a mission build is active.'), {
        code: 'mission_reset_required', currentPhase: state?.phase, currentMissionId: state?.missionId,
        currentRevision: controller.worldRevision, permittedNextActions: ['get_mission_state', 'reset_mission'],
        recoveryAction: 'Call reset_mission with current mission and world revisions.'
      });
    }
  },
  resetBricks: evidenceMode ? makeRoundBricks : makePlayerBricks,
  humanBuildAdapter,
  placementAuthority,
  fastPlacement,
  placementCycleRunner,
  workcellProfile: evidenceMode ? null : workcellProfile,
  getUserCamera: () => renderer.getUserCameraConfig(),
  captureCamera: (descriptor, options) => renderer.captureInspectionCamera(descriptor, options),
  placementPreviewObserver: (request) => fastPlacement?.preview({
    brickId: request.brickId,
    position: Number.isFinite(request.xMm) && Number.isFinite(request.yMm) && Number.isFinite(request.zMm)
      ? { xMm: request.xMm, yMm: request.yMm, zMm: request.zMm }
      : null,
    yawRad: Number(request.yawDeg ?? 0) * Math.PI / 180,
    supportBrickId: request.supportBrickId ?? null,
    supportSide: request.supportSide ?? 'M',
    carriedSide: request.carriedSide ?? null
  })
});

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
const fastPlacementForm = $('[data-fast-placement-form]');
const fastBrickEl = $('[data-fast-brick]');
const fastStatusEl = $('[data-fast-status]');
const fastEstimateEl = $('[data-fast-estimate]');
const fastQueueEl = $('[data-fast-queue]');
const physicalSpeedInput = $('[data-physical-speed-input]');
const physicalSpeedOutput = $('[data-physical-speed]');
const playbackRateInput = $('[data-playback-rate-input]');
const playbackRateOutput = $('[data-playback-rate]');
const fastAcceptButton = $('[data-fast-accept]');
const cycleTimeInput = $('[data-cycle-time-input]');
const cycleTimeOutput = $('[data-cycle-time]');
const cycleStartButton = $('[data-cycle-start]');
const cycleStopButton = $('[data-cycle-stop]');
const undoButtonEl = $('[data-undo]');
const bridgeHudEl = $('[data-bridge-hud]');
const bridgeFamilyEl = $('[data-bridge-family]');
const bridgeRevisionEl = $('[data-bridge-revision]');
const bridgePlanEl = $('[data-bridge-plan]');
const level2PartSummaryEl = $('[data-level2-part-summary]');
const level2HologramVisibleEl = $('[data-level2-hologram-visible]');
const level2HologramOpacityEl = $('[data-level2-hologram-opacity]');
const level2HologramColourEl = $('[data-level2-hologram-colour]');
const level2VisualTestButtonEl = $('[data-level2-visual-test]');
const level2VisualTestStatusEl = $('[data-level2-visual-test-status]');

const settingsPanelController = installPlayerSettingsPanel({
  store: playerSettingsStore,
  panel: $('[data-settings-panel]'),
  groups: $('[data-settings-groups]'),
  search: $('[data-settings-search]'),
  onImportError: (error) => addLog(`Settings import rejected: ${error.message}`, 'bad')
});
playerSettingsStore.addGuard((next, keys) => {
  const changed = keys.filter(key => next[key] !== playerSettings[key]);
  if (!changed.some(key => SCENE_LAYOUT_CONTROLS[key] || /^robotMount/.test(key))) return true;
  const status = $('[data-scene-layout-status]');
  const reject = reason => { if (status) status.textContent = reason; return false; };
  if (changed.some(key => /^robotMount/.test(key))) return reject('The world display frame is fixed. Use Robot Base XYZ instead.');
  if (mainDemoMission?.service.phase === 'TEST') return reject('Finish the train test before changing layout.');
  if (controller.operationState !== 'idle' || controller.pendingMoveCount || controller.operationBlocked() || controller.getBricks().some(b => b.heldBy) || placementCycleRunner?.getState().running) return reject('Finish or cancel motion and release held parts before changing layout.');
  if (changed.includes('tableYawDeg') && mainDemoConstruction?.preparedBuild) return reject('Reset BUILD before rotating the table; frozen targets will not be moved.');
  if (changed.some(key => /^robotBase/.test(key))) {
    const result = controller.setBasePose({ ...robotBasePoseFromSettings(next), expectedWorldRevision: controller.worldRevision });
    if (!result.ok) return reject(`Base unchanged: ${result.reason}. Existing safety limits remain active.`);
  }
  if (status) status.textContent = 'Layout saved. World / BuildPlan coordinates unchanged. VISUAL: USER-VERIFY PENDING';
  return true;
});
playerSettingsStore.subscribe((key, _value, _settings, change) => {
  if (key === '*' && change?.changedKeys?.length
    && change.changedKeys.every(name => ['exposure', 'tableColor'].includes(name))) {
    // A presentation-only batch must not reset the orbit/player camera,
    // rebuild brick geometry or reapply the live machine transform.
    revisionClock.bump();
    for (const name of change.changedKeys) renderer.applySettings(name);
    return;
  }
  if (key === 'tableYawDeg' || key === '*') {
    const next = createV8WorkcellProfile(playerSettings);
    Object.assign(workcellProfile, next);
    controller.layout = { ...controller.layout, tableBounds: next.tableBounds, tableZMm: next.tableSurfaceZMm };
    revisionClock.bump();
  }
  renderer.applySettings(key);
});
let moreBricksBurst = 0;
const simpleSourceRefill = createSimpleSourceRefill({ controller, coordinator: fastPlacement,
  settings: playerSettings, profile: workcellProfile,
  getExclusions: () => {
    const anchor = renderer.workbench.getMoreBricksAnchor?.();
    return anchor ? [{ xMm: anchor.pose.xMm, yMm: anchor.pose.yMm, radiusMm: anchor.radiusMm + 20 }] : [];
  }
});
function spawnMoreBricks(options = {}) {
  if (!evidenceMode && demoMode === 'simple') {
    const result = simpleSourceRefill(options);
    return result;
  }
  if (!evidenceMode && demoMode !== 'simple' && mainDemoConstruction) {
    if (!mainDemoConstruction.preparedBuild) return { ok: false, reason: 'Start BUILD BRIDGE first to use the shared source feeder.' };
    if (mainDemoMission?.service.phase === 'TEST') return { ok: false, reason: 'Finish the train test before refilling sources.' };
    let result;
    try { result = mainDemoConstruction.refillSources({ expectedWorldRevision: controller.worldRevision, count: 6 }); }
    catch (error) { return { ok: false, reason: error.message }; }
    renderer.workbench.pressMoreBricks();
    const status = $('[data-scene-layout-status]');
    if (status) status.textContent = result.count ? `Added ${result.count} shared bridge sources. Targets unchanged.` : result.reason;
    return result;
  }
  const startIndex = controller.getBricks().length;
  const generated = makeReachableV8MoreSpawn(
    playerSettings,
    workcellProfile,
    ++moreBricksBurst,
    controller.getBricks(),
    { startIndex }
  );
  if (!generated.ok) return generated;
  const result = controller.addLooseBricks(generated.records, { actor: 'human' });
  if (!result.ok) return result;
  renderer.launchSpawnedBricks(result.bricks);
  renderer.workbench.pressMoreBricks();
  return { ...result, action: 'more_bricks' };
}
const moreBricksButton = createMoreBricksButton({ controller, settings: playerSettings, profile: workcellProfile,
  refill: spawnMoreBricks,
  onPress: () => renderer.workbench.pressMoreBricks(),
  canRequest: ({ actor }) => !humanBuildAdapter.getState().heldBrickId
    && (actor === 'human' || (demoMode === 'simple' && !placementCycleRunner?.getState().running))
});
const activateMoreBricks = () => moreBricksButton.activateHuman({ expectedWorldRevision: controller.worldRevision });
renderer.setMoreBricksHandler(() => handleAction(null, activateMoreBricks, 'Shared source inventory replenished'));
for (const button of document.querySelectorAll('[data-more-bridge-bricks]')) button.addEventListener('click', () => handleAction(button, activateMoreBricks, 'Shared source inventory replenished'));
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
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ' && !event.shiftKey) {
    event.preventDefault();
    handleAction(null, () => renderer.undoPlayerAction(), 'Undid last human placement');
    return;
  }
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

function updateBridgeHologramStatus({ source, summary }) {
  const family = String(source.family ?? 'bridge').toUpperCase();
  if (bridgeFamilyEl) bridgeFamilyEl.textContent = `${family} HOLOGRAM`;
  if (bridgeRevisionEl) bridgeRevisionEl.textContent = `REV ${source.designRevision} · ${summary.totalPhysicalCount} PARTS`;
  if (bridgePlanEl) bridgePlanEl.textContent = `${source.planId} · ${source.designChecksum}`;
  if (level2PartSummaryEl) {
    level2PartSummaryEl.textContent = `${summary.totalPhysicalCount} PARTS · ${summary.standardPhysicalCount} BRICKS · ${summary.physicalArchCount} ARCH · ${summary.trackSegmentCount} TRACK`;
    level2PartSummaryEl.dataset.planId = source.planId;
    level2PartSummaryEl.dataset.partCount = String(summary.totalPhysicalCount);
  }
  if (bridgeHudEl) {
    bridgeHudEl.dataset.state = 'ready';
    bridgeHudEl.dataset.family = source.family;
    bridgeHudEl.dataset.designRevision = String(source.designRevision);
    bridgeHudEl.dataset.planId = source.planId;
    bridgeHudEl.dataset.designChecksum = source.designChecksum;
    bridgeHudEl.dataset.partCount = String(summary.totalPhysicalCount);
  }
  document.documentElement.dataset.bridgeReady = 'true';
}

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
      profileId: evidenceMode ? 'challenge-evidence-v2' : workcellProfile.id,
      tableZMm: evidenceMode ? CHALLENGE_LAYOUT.tableZMm : workcellProfile.tableSurfaceZMm,
      tray: evidenceMode ? CHALLENGE_LAYOUT.tray : null,
      board: evidenceMode ? CHALLENGE_LAYOUT.board : null,
      supplyZone: evidenceMode ? null : workcellProfile.supplyZone,
      buildZone: evidenceMode ? null : workcellProfile.buildZone,
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
  placementCycleRunner?.cancel('workcell_reset');
  fastPlacement?.cancel();
  const result = await runtime.robot.reset({ expectedWorldRevision: controller.getState().worldRevision });
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

function refreshFastBrickChoices(selectedId = null) {
  if (!fastPlacement || !fastBrickEl) return;
  const available = fastPlacement.availableBricks();
  const selected = selectedId ?? fastBrickEl.value;
  fastBrickEl.replaceChildren(...available.map((brick) => {
    const option = document.createElement('option');
    option.value = brick.id;
    option.textContent = `${brick.colour.toUpperCase()} · ${brick.id}`;
    return option;
  }));
  if (available.some((brick) => brick.id === selected)) fastBrickEl.value = selected;
}

function readFastPlacementForm() {
  if (!fastPlacementForm) return null;
  const form = new FormData(fastPlacementForm);
  return {
    brickId: String(form.get('brickId') ?? ''),
    position: { xMm: Number(form.get('xMm')), yMm: Number(form.get('yMm')), zMm: Number(form.get('zMm')) },
    yawRad: Number(form.get('yawDeg')) * Math.PI / 180
  };
}

function previewFastPlacement() {
  const request = readFastPlacementForm();
  if (!fastPlacement || !request) return { status: 'INVALID', reason: 'runtime_unavailable' };
  return fastPlacement.preview(request);
}

function queuedDestination(proposal) {
  return {
    brickId: proposal.requestedBrickId ?? proposal.brickId ?? null,
    colour: proposal.requestedColour ?? null,
    position: proposal.requestedPosition ? { ...proposal.requestedPosition } : null,
    yawRad: proposal.yawRad ?? 0,
    supportBrickId: proposal.supportBrickId ?? null,
    supportSide: proposal.supportSide ?? 'M',
    carriedSide: proposal.carriedSide ?? null
  };
}

function addFastPlacementToQueue() {
  const request = readFastPlacementForm();
  if (!fastPlacement || !request) return { ok: false, reason: 'runtime_unavailable' };
  const current = fastPlacement.getState().queue.map(queuedDestination);
  if (current.length >= 5) return { ok: false, reason: 'queue_full', maximumLookahead: 5 };
  return fastPlacement.planQueue([...current, request]);
}

async function executeFastPlacement({ signal } = {}) {
  if (!fastPlacement) return { ok: false, reason: 'runtime_unavailable' };
  const result = await fastPlacement.execute({
    physicalSpeedMmS: Number(physicalSpeedInput?.value ?? 650),
    playbackMultiplier: Number(playbackRateInput?.value ?? 20),
    signal
  });
  if (result.ok) {
    addLog(`Fast placed ${result.brickId} in ${(result.playbackDurationMs / 1000).toFixed(2)} s`, 'ok');
    refreshFastBrickChoices();
  } else addLog(`Fast placement rejected: ${result.reason}`, 'bad');
  return result;
}

async function runPlannedCycle({ signal = null } = {}) {
  if (!placementCycleRunner || !fastPlacement) return { ok: false, reason: 'runtime_unavailable' };
  if (demoMode === 'simple') return streamControl.tool.execute({ action: 'start', expectedWorldRevision: controller.worldRevision,
    cycleTimeMs: Math.max(1000, Math.min(10000, Number(cycleTimeInput?.value ?? 2000))) }, { signal });
  const state = fastPlacement.getState();
  const cycleTimeMs = Number(cycleTimeInput?.value ?? state.stream?.cycleTimeMs ?? 1000);
  setStatus('CYCLING');
  addLog(`Planned cycle started at ${cycleTimeMs} ms per brick`, 'ok');
  const result = await placementCycleRunner.run({
    cycleTimeMs,
    physicalSpeedMmS: Number(physicalSpeedInput?.value ?? 650),
    maximumPlacements: 50,
    signal
  });
  if (result.ok) {
    setStatus('CYCLE COMPLETE', 'ok');
    const meanCycle = Number.isFinite(result.meanStartIntervalMs) ? `${Math.round(result.meanStartIntervalMs)} ms mean` : 'single placement';
    addLog(`Cycle completed ${result.completedPlacements} placements · ${meanCycle} · ${result.overruns} overruns`, 'ok');
    refreshFastBrickChoices();
  } else {
    const cancelled = result.reason === 'cancelled';
    setStatus(cancelled ? 'CYCLE STOPPED' : 'CYCLE BLOCKED', cancelled ? '' : 'bad');
    addLog(`Cycle stopped: ${result.reason}`, cancelled ? '' : 'bad');
  }
  return result;
}

function captureCamera(cameraId = 'user_camera', options = {}) {
  return runtime.world.captureCamera({ cameraId, ...options });
}

for (const button of document.querySelectorAll('[data-camera-capture]')) {
  button.addEventListener('click', () => {
    const result = captureCamera(button.dataset.cameraCapture, { widthPx: 640, heightPx: 360, quality: 0.82 });
    const image = $('[data-camera-preview]');
    const status = $('[data-camera-preview-status]');
    if (!result.ok) {
      if (status) status.textContent = `Camera unavailable: ${result.reason}`;
      return;
    }
    if (image) image.src = result.dataUrl;
    if (status) status.textContent = `${result.cameraId} · revision ${result.worldRevision} · ${result.widthPx}×${result.heightPx}`;
  });
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
  const diagnosticQuarterTurns = Number(params.get('parityRotation') ?? 0);
  placementEngine.rotationQuarterTurns = Number.isInteger(diagnosticQuarterTurns)
    ? ((diagnosticQuarterTurns % 4) + 4) % 4
    : 0;
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
  getSceneState, getRobotState, getWorkspace, moveTool, latch, unlatch, resetScene, spawnMoreBricks: activateMoreBricks, runOnePickPlace, runRound, captureCamera,
  planSimpleStructure: (spec = {}) => {
    const availableColourCounts = {};
    for (const brick of fastPlacement?.availableBricks?.() ?? []) {
      availableColourCounts[brick.colour] = (availableColourCounts[brick.colour] ?? 0) + 1;
    }
    const plan = createSimpleStructurePlan(spec, { profile: workcellProfile, availableColourCounts });
    return { ...plan, webMcpPlacements: toWebMcpPlacements(plan) };
  },
  previewFastPlacement, executeFastPlacement, runPlannedCycle,
  cancelFastPlacement: () => fastPlacement?.cancel() ?? { ok: false, reason: 'runtime_unavailable' },
  cancelPlannedCycle: () => placementCycleRunner?.cancel() ?? { ok: false, reason: 'runtime_unavailable' },
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
  if (!placementAuthority && event.type === 'unlatched' && event.snap?.ok) {
    connectionGraph.registerPlacement(event.brickId, { placementType: 'blueprint-target' });
  }
  if (event.type === 'reset' || event.type === 'world_reset') connectionGraph.clear();
});

humanBuildAdapter.subscribe((event) => {
  if (event.type === 'picked_up') addLog(`Player picked up ${event.brickId} · colour ${event.colour} · after pickup ${event.colourAfterPickup} · ${event.colourPreserved ? 'unchanged' : 'COLOUR MISMATCH'}`, event.colourPreserved ? 'ok' : 'bad');
  if (event.type === 'released') addLog(`Player placed ${event.brickId} · colour ${event.colour} · ${event.colourPreserved ? 'unchanged' : 'COLOUR MISMATCH'}`, event.colourPreserved ? 'ok' : 'bad');
  if (event.type === 'dropped') addLog(`Player dropped ${event.brickId}`);
  if (event.type === 'undone') addLog(`Player undid ${event.brickId}`, 'ok');
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

undoButtonEl?.addEventListener('click', (event) => handleAction(event.currentTarget, () => renderer.undoPlayerAction(), 'Undid last human placement'));

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
cycleStartButton?.addEventListener('click', (event) => handleAction(event.currentTarget, () => runPlannedCycle(), null));
cycleStopButton?.addEventListener('click', () => placementCycleRunner?.cancel());
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

if (fastPlacementForm && fastPlacement) {
  const frame = placementEngine.tableFrame;
  const defaults = {
    xMm: frame.centre.xMm,
    yMm: frame.centre.yMm,
    zMm: frame.placementSurfaceZMm + playerSettings.brickBodyHeightMm / 2,
    yawDeg: 0
  };
  for (const [name, value] of Object.entries(defaults)) {
    const field = fastPlacementForm.elements.namedItem(name);
    if (field) field.value = Number(value.toFixed(2));
  }
  refreshFastBrickChoices();
  fastPlacementForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const state = previewFastPlacement();
    addLog(state.status === 'VALID' ? 'Fast ghost proposal ready' : `Ghost rejected: ${state.reason}`, state.status === 'VALID' ? 'ok' : 'bad');
  });
  for (const button of document.querySelectorAll('[data-proposal-nudge]')) button.addEventListener('click', () => {
    const [dx, dy] = button.dataset.proposalNudge.split(',').map(Number);
    for (const [name, delta] of [['xMm', dx], ['yMm', dy]]) {
      const field = fastPlacementForm.elements.namedItem(name);
      field.value = Number(field.value) + delta;
    }
    previewFastPlacement();
  });
  $('[data-proposal-rotate]')?.addEventListener('click', () => {
    const field = fastPlacementForm.elements.namedItem('yawDeg');
    field.value = (Number(field.value) + 90) % 360;
    previewFastPlacement();
  });
  fastAcceptButton?.addEventListener('click', (event) => handleAction(event.currentTarget, () => executeFastPlacement(), null));
  $('[data-fast-cancel]')?.addEventListener('click', () => {
    fastPlacement.cancel();
    addLog('Fast placement cancelled');
  });
  $('[data-fast-queue-clear]')?.addEventListener('click', () => {
    fastPlacement.cancel();
    addLog('Look-ahead queue cleared');
  });
  $('[data-fast-queue-add]')?.addEventListener('click', () => {
    const state = addFastPlacementToQueue();
    addLog(state.ok ? `Cached ${state.queueLength} ghost placements` : `Queue rejected: ${state.reason}`, state.ok ? 'ok' : 'bad');
  });
  const syncRange = (input, output, suffix) => {
    const update = () => { if (output) output.textContent = `${input.value}${suffix}`; };
    input?.addEventListener('input', update);
    update();
  };
  syncRange(physicalSpeedInput, physicalSpeedOutput, ' mm/s');
  syncRange(playbackRateInput, playbackRateOutput, '×');
  syncRange(cycleTimeInput, cycleTimeOutput, ' ms');
  fastPlacement.subscribe((state) => {
    const cycleRunning = placementCycleRunner?.getState().running ?? false;
    if (cycleTimeInput && !cycleRunning && state.stream?.cycleTimeMs) {
      cycleTimeInput.value = String(demoMode === 'simple' ? placementCycleRunner.cycleTimeMs : state.stream.cycleTimeMs);
      if (cycleTimeOutput) cycleTimeOutput.textContent = `${state.stream.cycleTimeMs} ms`;
    }
    if (cycleStartButton) cycleStartButton.disabled = cycleRunning || (state.stream?.remainingPlacements ?? 0) === 0;
    if (cycleStopButton) cycleStopButton.disabled = !cycleRunning;
    if (fastStatusEl) fastStatusEl.textContent = state.status.replace('_', ' ');
    if (fastAcceptButton) fastAcceptButton.disabled = state.status !== 'VALID';
    if (fastEstimateEl) {
      const distance = state.proposal?.approximatePhysicalDistanceMm;
      const physicalSeconds = distance ? distance / Number(physicalSpeedInput?.value ?? 650) : null;
      const playbackSeconds = physicalSeconds ? physicalSeconds / Number(playbackRateInput?.value ?? 20) : null;
      fastEstimateEl.textContent = state.status === 'VALID'
        ? `Cyan = valid · rough travel ${physicalSeconds.toFixed(1)} physical s / ${playbackSeconds.toFixed(2)} displayed s. Live planning and collision checks still apply.`
        : state.status === 'STALE' ? 'Amber = world changed. Preview again before accepting.'
          : state.status === 'INVALID' ? `Red = ${state.reason}. Adjust the ghost and retry.`
            : 'Preview a valid cyan brick, then accept. Physical limits remain unchanged.';
    }
    if (fastQueueEl) {
      fastQueueEl.replaceChildren(...state.queue.map((proposal) => {
        const item = document.createElement('li');
        const label = document.createElement('b');
        label.textContent = proposal.slotLabel;
        const source = document.createElement('span');
        source.textContent = `${proposal.brick?.colour?.toUpperCase?.() ?? '—'} ${proposal.brickId ?? 'NO SOURCE'} → ${Math.round(proposal.requestedPosition?.xMm ?? 0)},${Math.round(proposal.requestedPosition?.yMm ?? 0)}`;
        const status = document.createElement('em');
        status.textContent = proposal.sourceReassigned ? 'REASSIGNED' : proposal.status;
        status.className = proposal.sourceReassigned ? 'reassigned' : proposal.status === 'VALID' ? '' : 'invalid';
        item.append(label, source, status);
        return item;
      }));
    }
  });
  previewFastPlacement();
}
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

let mainDemoChallenge = null;
let mainDemoBridge = null;
let mainDemoConstruction = null;
let mainDemoTrain = null;
let mainDemoMission = null;
let level2VisualTest = null;
const level3Telemetry = createLevel3ResultsCollector();
const level3ResultsPanel = !evidenceMode ? createLevel3ResultsPanel() : null;
if (level3ResultsPanel) Object.assign(level3ResultsPanel.element.style, {
  position: 'fixed', top: '145px', right: '16px', width: '300px',
  maxHeight: 'calc(100vh - 250px)', overflowY: 'auto', zIndex: '20'
});
let resultsReadPending = false;
async function updateLevel3Results() {
  if (!level3ResultsPanel) return;
  if (demoMode !== 'train') { level3ResultsPanel.render({ visible: false }); return; }
  if (!mainDemoMission || resultsReadPending) return;
  resultsReadPending = true;
  try {
    const state = await mainDemoMission.service.getMissionState({ detail: 'detail', eventLimit: 1 });
    level3ResultsPanel.render(deriveLevel3Results({ mode: demoMode, missionState: state,
      constructionProgress: mainDemoConstruction?.getBuildProgress(), frozenMission: mainDemoMission.service.frozen,
      telemetry: level3Telemetry.getSnapshot({ missionId: state.missionId }) }));
  } finally { resultsReadPending = false; }
}
try {
  mainDemoChallenge = await createMainDemoEasyChallenge({ renderer, playerSettings });
  const entry = mainDemoChallenge.getEntry().position;
  const exit = mainDemoChallenge.getExit().position;
  addLog(`EASY terrain ready: ${entry.x.toFixed(0)},${entry.y.toFixed(0)} → ${exit.x.toFixed(0)},${exit.y.toFixed(0)} mm`, 'ok');
  mainDemoBridge = await createMainDemoBridge({
    renderer,
    challenge: mainDemoChallenge.bridgeChallenge,
    settingsStore: playerSettingsStore,
    onHologramChanged: updateBridgeHologramStatus
  });
  if (!evidenceMode) {
    const initial = prepareBridgeBuild({ host: mainDemoBridge.host, workspace: controller.workspace });
    const bottom = physicalBuildReport(initial).physicalBoundsMm.min.zMm;
    if (bottom < workcellProfile.placementSurfaceZMm) {
      const elevation = mainDemoChallenge.getActiveChallenge().tuning.buildElevationMm + 4 - bottom;
      await mainDemoChallenge.elevateForConstruction(mainDemoBridge.host, elevation);
      addLog('Challenge elevation corrected from live physical bounds: ' + elevation.toFixed(2) + ' mm', 'ok');
    }
    mainDemoTrain = createLevelGatedTrain({
      subscribeFrame: listener => renderer.addFrameListener(listener),
      createIntegration: () => {
        // Created lazily in Level 3 only. The pusher reads the one controller;
        // its private witness also binds unchanged board and source geometry.
        const robotPusher = createRobotTcpPusher({ controller,
          getBoardFingerprint: createTrainBoardFingerprint({ board, controller }) });
        return createMainDemoTrainIntegration({
          challengeService: mainDemoChallenge, THREE,
          machineRoot: renderer.machineRoot,
          requestRender: () => renderer.render(),
          motionMode: 'tcp_contact', robotPusher,
          pusher: { adapter: robotPusher },
          trainProfile: ({ routeFrame }) => ({
            pusherRotationQuaternion: robotPusher.getOrientationForYaw(Math.atan2(routeFrame.forward.y, routeFrame.forward.x))
          }),
          createSolidContactProvider: ({ routeFrame }) => createTerrainMeshContact({ routeFrame,
            getSolidMeshes: () => mainDemoChallenge.getTerrainOccluders(),
            machineMount: mainDemoChallenge.getState().machineMount }),
          preconditions: {
            isRobotExecuting: () => controller.operationState !== 'idle' || controller.pendingMoveCount > 0,
            isRobotIdle: () => controller.operationState === 'idle' && controller.pendingMoveCount === 0 && !controller.operationBlocked(),
            isGripperHoldingPart: () => Boolean(controller.heldBrick())
          }
        });
      }
    });
    mainDemoConstruction = createConstructionService({ bridgeHost: mainDemoBridge.host, challenge: mainDemoChallenge,
      buildBoard: board, controller, placementAuthority, placementCoordinator: fastPlacement, cycleRunner: placementCycleRunner,
      onPrepared: prepared => {
        renderer.brickFactory.partRegistry = prepared?.registry ?? null;
        mainDemoBridge.setConstructionBoard(prepared ? board : null);
        if (prepared && demoMode === 'train') mainDemoTrain.prepare({ preparedBuild: prepared, buildBoard: board });
        else if (!prepared) Promise.resolve(mainDemoTrain.clear()).catch(error => addLog(`Train cleanup: ${error.message}`, 'bad'));
      }
    });
    level2VisualTest = createLevel2VisualBridgeTest({
      renderer,
      challenge: mainDemoChallenge,
      getOffsets: () => {
        const s = playerSettingsStore.get();
        return { x: s.trainVisualOffsetXmm, y: s.trainVisualOffsetYmm, z: s.trainVisualOffsetZmm, overshootMm: s.trainVisualOvershootMm };
      },
      canStart: () => {
        if (playerSettingsStore.get().overrideTrainTest) return true;
        const progress = mainDemoConstruction?.getBuildProgress();
        return Boolean(progress && progress.total > 0 && progress.completed === progress.total);
      },
      onStateChanged: state => {
        if (!level2VisualTestStatusEl) return;
        level2VisualTestStatusEl.textContent = state.status === 'running'
          ? 'VISUAL TEST RUNNING · NO PHYSICS'
          : state.status === 'error' ? `TRAIN MODEL LOAD FAILED: ${state.error}`
          : state.status === 'complete' ? 'ENTRY → EXIT COMPLETE · NO PHYSICS'
            : 'VISUAL TEST · NO PHYSICS';
      }
    });
    // demoMode starts at Level 2 before the selector controller is installed;
    // activate the presentation lifecycle even when its first change is a no-op.
    level2VisualTest.setLevelActive(demoMode === 'bridge');
    mainDemoMission = await createProductionMissionRuntime({
      bridgeHost: mainDemoBridge.host,
      bridgeDesignPackage: mainDemoBridge.bridgeDesign,
      challengeService: mainDemoChallenge,
      challengeMetadata: {
        EASY: { label: 'Curated EASY', bridgeChallengeId: mainDemoChallenge.bridgeChallenge.id }
      },
      constructionSession: createMainDemoConstructionSession(mainDemoConstruction, () => controller.worldRevision),
      getAcceptedBuildBoardSnapshot: () => board,
      trainIntegration: mainDemoTrain,
      robotController: controller,
      runtime,
      eventSink: event => {
        level3Telemetry.recordMissionEvent(event, { worldRevision: controller.worldRevision });
        addLog(`Mission ${event.type}: ${event.summary}`, event.type === 'RECOVER' ? 'bad' : 'ok');
      }
    });
    controller.subscribe(event => {
      if (mainDemoConstruction.preparedBuild && ['human_placement', 'unlatched', 'human_pickup', 'simulated_placement'].includes(event.type)) mainDemoBridge.refreshHologram();
    });
    const endpointPanel = await installEndpointSettings({ groups: document.querySelector('[data-settings-groups]'), challenge: mainDemoChallenge,
      bridgeHost: mainDemoBridge.host, getSettings: () => playerSettingsStore.get(),
      beforeApply: () => {
        if (mainDemoConstruction.preparedBuild) throw new Error('Reset BUILD before moving ENTRY or EXIT.');
        if (controller.operationState !== 'idle' || controller.operationBlocked() || controller.getBricks().some(b => b.heldBy)) throw new Error('Finish or cancel the current movement before moving endpoints.');
      }
    });
    if (params.get('settings') === 'bridge-endpoints') {
      settingsPanelController?.setOpen(true);
      requestAnimationFrame(() => endpointPanel?.section.scrollIntoView({ block: 'start' }));
    }
  }
  const bridgeState = mainDemoBridge.host.getCompileState();
  addLog(`V4.6 ${mainDemoBridge.host.settings.family} ready: ${bridgeState.planId}`, 'ok');
} catch (error) {
  if (bridgeHudEl) bridgeHudEl.dataset.state = 'failed';
  if (bridgeFamilyEl) bridgeFamilyEl.textContent = 'BRIDGE UNAVAILABLE';
  if (bridgeRevisionEl) bridgeRevisionEl.textContent = 'V4.6 INITIALISATION FAILED';
  if (bridgePlanEl) bridgePlanEl.textContent = String(error?.code ?? 'COMPILE_FAILED');
  document.documentElement.dataset.bridgeReady = 'false';
  addLog(`V4.6 bridge unavailable: ${error?.code ?? error?.message ?? 'compile failed'}`, 'bad');
}

for (const button of document.querySelectorAll('[data-construction-action]')) button.addEventListener('click', async () => {
  const action = button.dataset.constructionAction;
  try {
    if (!mainDemoConstruction) throw new Error('construction_unavailable');
    const options = { expectedWorldRevision: controller.worldRevision };
    const state = mainDemoMission ? await mainDemoMission.service.getMissionState() : null;
    const missionInput = state?.ok ? {
      expectedMissionId: state.missionId,
      expectedMissionRevision: state.revisions.missionRevision,
      expectedWorldRevision: state.revisions.worldRevision
    } : null;
    const result = action === 'start' && mainDemoMission ? await mainDemoMission.service.startBridgeBuild({
      ...missionInput,
      expectedDesignRevision: mainDemoBridge.host.designRevision
    }) : action === 'next' && mainDemoMission ? await mainDemoMission.service.buildNextParts({
      ...missionInput,
      count: Number($('[data-construction-count]').value)
    }) : action === 'reset' && mainDemoMission ? await mainDemoMission.service.resetMission({
      ...missionInput,
      confirm: true
    }) : action === 'start' ? mainDemoConstruction.startBuild(options)
      : action === 'next' ? await mainDemoConstruction.buildNextParts(Number($('[data-construction-count]').value), options)
      : action === 'cancel' ? mainDemoConstruction.cancelBuild(options) : mainDemoConstruction.reset(options);
    if (action === 'start' || action === 'reset') level2VisualTest?.reset();
    const progress = mainDemoConstruction.getBuildProgress();
    const status = $('[data-construction-status]');
    if (status) status.textContent = result.ok === false ? result.reason : progress.status + ' · ' + progress.completed + '/' + (progress.total ?? '—');
  } catch (error) { const status = $('[data-construction-status]'); if (status) status.textContent = error.message; addLog('Construction: ' + error.message, 'bad'); }
});
if (mainDemoBridge && level2HologramVisibleEl && level2HologramOpacityEl && level2HologramColourEl) {
  const appearance = playerSettingsStore.get();
  level2HologramVisibleEl.checked = mainDemoBridge.visible;
  level2HologramOpacityEl.value = String(appearance.bridgeHologramOpacity);
  level2HologramColourEl.value = appearance.bridgeHologramColor;
  level2HologramVisibleEl.addEventListener('change', () => mainDemoBridge.setVisible(level2HologramVisibleEl.checked));
  level2HologramOpacityEl.addEventListener('input', () => playerSettingsStore.set('bridgeHologramOpacity', Number(level2HologramOpacityEl.value)));
  level2HologramColourEl.addEventListener('input', () => playerSettingsStore.set('bridgeHologramColor', level2HologramColourEl.value));
}
level2VisualTestButtonEl?.addEventListener('click', () => {
  const result = level2VisualTest?.start() ?? { ok: false, reason: 'visual_test_unavailable' };
  if (!result.ok) showToast(result.reason === 'bridge_incomplete' ? 'Complete the bridge first.' : result.reason);
});
const demoModeControl = !evidenceMode ? createDemoModeControl({ controller, board, runtime, streamControl, coordinator: fastPlacement, workcellProfile,
  challenge: mainDemoChallenge, bridge: mainDemoBridge, train: mainDemoTrain, mission: mainDemoMission?.service,
  renderer, setMode: value => { demoMode = value; level2VisualTest?.setLevelActive(value === 'bridge'); }, originalBlueprint: blueprint,
  getPreparedBuild: () => mainDemoConstruction?.preparedBuild }) : null;
if (demoModeControl) {
  $('select[data-demo-mode]').addEventListener('change', async event => {
    const result = await demoModeControl.change(event.target.value);
    if (!result.ok) showToast(result.reason);
  });
  $('[data-simple-reset]').addEventListener('click', () => demoModeControl.change('simple', { reset: true }));
  $('[data-simple-stop]').addEventListener('click', () => streamControl.stop());
  const initialMode = params.get('demo') === 'train' || params.get('level') === '3' || params.has('submissionGate') ? 'train'
    : params.get('demo') === 'simple' || (!params.has('demo') && !robotShowcaseMode) ? 'simple' : 'bridge';
  const result = await demoModeControl.change(initialMode);
  if (!result.ok) addLog(`Demo mode: ${result.reason}`, 'bad');
}
renderer.start();
setInterval(() => {
  void updateLevel3Results().catch(error => addLog(`Results unavailable: ${error.message}`, 'bad'));
  if (mainDemoConstruction && demoMode !== 'simple') {
    const progress = mainDemoConstruction.getBuildProgress();
    $('[data-collaboration-status]').textContent = `${demoMode === 'bridge' ? 'LEVEL 2 · NO TRAIN' : 'LEVEL 3 · TRAIN'} · ${progress.completed}/${progress.total ?? '—'} ${progress.status.toUpperCase()}`;
    const modes = progress.byExecutionMode;
    $('[data-build-actors]').textContent = modes ? `Accepted: Human ${modes.human} · Robot ${modes.robot} · Accelerated ${modes.simulated_fast_forward}` : 'Freeze the current design to start shared construction.';
    if (level2VisualTestButtonEl) {
      const running = level2VisualTest?.getState().status === 'running';
      level2VisualTestButtonEl.disabled = demoMode !== 'bridge' || running || !(playerSettingsStore.get().overrideTrainTest || (progress.total > 0 && progress.completed === progress.total));
      level2VisualTestButtonEl.textContent = running ? 'TESTING…' : 'TEST BRIDGE';
    }
  }
  if (streamControl && demoMode === 'simple') {
    const stream = streamControl.getState();
    $('[data-simple-status]').textContent = `${stream.satisfiedPlacements}/${stream.totalPlacements} · ${stream.cycleTimeMs} ms/cycle · ${stream.running ? 'RUNNING' : stream.lastResult?.reason ?? fastPlacement.getState().status}`;
  }
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
      ? (performance.player.pointerLocked ? 'PLAYER · LOCKED · ESC FOR UI'
        : performance.player.fallbackLookActive ? 'PLAYER · IN-APP LOOK · ESC FOR UI'
          : 'CLICK TO LOOK AROUND')
      : 'ORBIT CAMERA';
  }
  const heldId = performance.heldBrick?.brickId ?? performance.interaction.snapBrickId ?? null;
  if (playerHeldEl) playerHeldEl.textContent = heldId ?? 'NONE';
  if (hudPositionEl) hudPositionEl.textContent = performance.player?.position?.map((value) => Math.round(value)).join(' ') ?? '—';
  const preview = performance.interaction.preview;
  const zone = performance.interaction.snapAnimating ? 'SNAPPING'
    : performance.heldBrick?.state?.replace(/^HELD_/, '') ?? 'PHYSICS';
  if (hudZoneEl) hudZoneEl.textContent = zone;
  const orientation = `${preview?.type === 'BRICK' ? preview.relativeRotationDeg : placementEngine.rotationQuarterTurns * 90}°`;
  if (hudOrientationEl) hudOrientationEl.textContent = orientation;
  if (anglePillEl) {
    anglePillEl.textContent = `ANGLE ${orientation}`;
    anglePillEl.classList.toggle('hidden', !heldId);
  }
  const snapStatus = performance.interaction.snapAnimating ? 'SNAPPING' : preview?.status ?? 'NONE';
  if (hudSnapEl) hudSnapEl.textContent = snapStatus;
  const aimed = Boolean(performance.interaction.highlightedBrickId || performance.interaction.protectedBrickId || performance.interaction.highlightedMoreBricks || (preview && preview.status !== 'NONE'));
  crosshairEl?.classList.toggle('target', aimed);
  if (reticleStatusEl) reticleStatusEl.textContent = performance.interaction.highlightedMoreBricks ? 'MORE BRICKS'
    : performance.interaction.protectedBrickId ? 'SUPPORTING BRICK'
      : performance.interaction.highlightedBrickId ? 'PICK BRICK'
      : preview?.status === 'VALID' ? ''
        : preview?.status === 'BLOCKED' ? 'BLOCKED' : '';
  if (undoButtonEl) undoButtonEl.disabled = !humanBuildAdapter.canUndo();
  if (performanceContentEl) performanceContentEl.innerHTML = `<span>FPS mean</span><b>${fpsText}</b><span>Frame mean</span><b>${frameText}</b><span>Frame p95</span><b>${performance.p95FrameMs.toFixed(2)} ms</b><span>Frame max</span><b>${performance.maxFrameMs.toFixed(2)} ms</b><span>Physics</span><b>${playerSettings.physicsHz} Hz</b><span>Loose bodies</span><b>${performance.looseBrickPhysics.length}</b>`;
}, 500);
window.addEventListener('resize', () => renderer.render());

try {
  const bridgeTools = guardDemoLevelTools(mainDemoMission?.additionalTools ?? mainDemoBridge?.bridgeDesign.tools ?? [],
    () => demoMode, () => controller.worldRevision);
  const additionalTools = [...bridgeTools, ...(streamControl ? [streamControl.tool] : []), moreBricksButton.tool,
    ...(fastPlacement && placementCycleRunner ? [createRecolourLooseBricksTool({ controller, coordinator: fastPlacement,
      runner: placementCycleRunner, isSimpleMode: () => demoMode === 'simple' })] : []),
    ...createSceneSettingsTools({ settingsStore: playerSettingsStore, revisionClock,
      canUpdate: () => !controller.moving && !controller.pendingMoveCount && controller.operationState === 'idle'
        && !controller.operationBlocked() && !humanBuildAdapter.getState().heldBrickId })];
  const result = await registerWebMcpTools(runtime, updateToolDiagnostics, additionalTools);
  if (webmcpEl) {
    if (result.ok) { webmcpEl.textContent = `${result.toolCount} TOOLS READY`; webmcpEl.dataset.kind = 'ok'; addLog(`WebMCP ready: ${result.toolNames.join(', ')}`, 'ok'); }
    else { webmcpEl.textContent = 'WEBMCP UNAVAILABLE'; webmcpEl.dataset.kind = 'warning'; addLog(`WebMCP unavailable: ${result.reason}`, 'bad'); }
  }
} catch {
  if (webmcpEl) { webmcpEl.textContent = 'WEBMCP FAILED'; webmcpEl.dataset.kind = 'warning'; }
  addLog('WebMCP registration failed', 'bad');
}

const submissionAcceptance = params.get('submissionGate') === '1' && mainDemoBridge && mainDemoConstruction && mainDemoTrain && mainDemoMission
  ? createMainDemoSubmissionAcceptance({
    bridgeHost: mainDemoBridge.host,
    board,
    controller,
    placementAuthority,
    placementCoordinator: fastPlacement,
    cycleRunner: placementCycleRunner,
    humanBuildAdapter,
    construction: mainDemoConstruction,
    train: mainDemoTrain,
    mission: mainDemoMission.service,
    missionTools: mainDemoMission.missionTools,
    renderer,
    getLeakSnapshot: () => window.__ROBO_BRIDGE_QA__?.leakSnapshot?.() ?? null
  })
  : null;

const publicRuntime = Object.freeze({
  version: '3.1.0-main-demo-player-v8',
  product: 'ROBO BRIDGE MCP MAIN_DEMO',
  actions,
  runtime,
  robotController: controller,
  humanBuildAdapter,
  fastPlacement,
  placementCycleRunner,
  streamControl,
  moreBricksButton,
  demoModeControl,
  connectionGraph,
  playerSettingsStore,
  playerSourceProvenance: PLAYER_SOURCE_PROVENANCE,
  board,
  blueprint,
  renderer,
  challenge: mainDemoChallenge,
  construction: mainDemoConstruction,
  train: mainDemoTrain,
  mission: mainDemoMission?.service ?? null,
  missionRuntime: mainDemoMission,
  level2VisualTest,
  submissionAcceptance,
  bridgeHost: mainDemoBridge?.host ?? null,
  bridgeDesign: mainDemoBridge?.bridgeDesign ?? null,
  get bridgeHologram() { return mainDemoBridge?.hologramSnapshot ?? null; },
  getSceneState,
  getRobotState,
  getWorkspace,
  get scene() { return getSceneState(); }
});
if (Object.isExtensible(window)) {
  window.__LOGO_ROBO__ = publicRuntime;
  window.__ROBO_BRIDGE__ = publicRuntime;
  window.__LOGO_ROBO_RUNTIME__ = runtime;
}
document.documentElement.dataset.robotShowcase = robotShowcaseMode ? 'true' : 'false';
document.documentElement.dataset.runtimeReady = 'true';
window.addEventListener('beforeunload', () => level2VisualTest?.dispose(), { once: true });

if (['connection', 'snap'].includes(params.get('parityPreview'))) {
  setTimeout(() => { window.__LOGO_ROBO_PARITY_PREVIEW__ = stageV8ParityConnection(); }, 80);
  if (params.get('parityPreview') === 'snap') setTimeout(() => renderer.releaseHeldPlacement(), 3000);
}

if (evidenceMode) {
  runRound().then((result) => { window.__LOGO_ROBO_EVIDENCE_RESULT__ = result; window.__LOGO_ROBO_EVIDENCE_READY__ = true; });
}
