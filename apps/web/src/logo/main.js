import { BoardAdapter } from '../bricks/board-adapter.js';
import { makeBrick } from '../bricks/brick-spec.js';
import { RobotRenderer } from '../render/robot-renderer.js';
import { RobotController, RobotError } from '../robot/controller.js';
import { CHALLENGE_LAYOUT, UR10_DEFINITION } from '../robot/ur10-definition.js';
import { createLogoRoboRuntime } from './runtime.js';
import { registerWebMcpTools } from '../webmcp/register-oracle3-tools.js';

const params = new URLSearchParams(window.__LOGO_ROBO_QUERY__ ?? location.search);
const evidenceMode = params.has('evidence');
const pickupBrickPosition = {
  xMm: CHALLENGE_LAYOUT.pickupTcp.xMm,
  yMm: CHALLENGE_LAYOUT.pickupTcp.yMm,
  zMm: CHALLENGE_LAYOUT.tray.floorZ + 4.8
};
const targetBrickPosition = {
  xMm: CHALLENGE_LAYOUT.targetTcp.xMm,
  yMm: CHALLENGE_LAYOUT.targetTcp.yMm,
  zMm: CHALLENGE_LAYOUT.board.surfaceZ + 4.8
};

const makeSceneBrick = () => makeBrick({ id: 'brick-white-001', colour: 'white', ...pickupBrickPosition });
const board = new BoardAdapter([{ id: 'target-white-001', colour: 'white', position: targetBrickPosition, yawRad: 0 }]);
const controller = new RobotController({
  board,
  bricks: [makeSceneBrick()],
  timeScale: evidenceMode ? 0 : 0.35
});
const renderer = new RobotRenderer(document.querySelector('#scene'), controller, { board });

const $ = (selector) => document.querySelector(selector);
const statusEl = $('[data-status]');
const webmcpEl = $('[data-webmcp]');
const tcpEl = $('[data-tcp]');
const jointsEl = $('[data-joints]');
const heldEl = $('[data-held]');
const rrevEl = $('[data-rrev]');
const wrevEl = $('[data-wrev]');
const fpsEl = $('[data-fps]');
const logEl = $('[data-log]');
const toolListEl = $('[data-tool-list]');
const moveForm = $('[data-move-form]');
const moveButton = moveForm?.querySelector('button[type="submit"]');

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

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
}

function setStatus(value, kind = '') {
  if (!statusEl) return;
  statusEl.textContent = value;
  statusEl.dataset.kind = kind;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '—';
}

function getRobotState() {
  const state = controller.getState();
  return {
    ...state,
    workspace: controller.getWorkspace(),
    coordinateFrame: 'machine-mm-rad',
    brickCount: controller.getBricks().length
  };
}

function getWorkspace() {
  return {
    ...controller.getWorkspace(),
    speedLimitMmS: controller.speedLimitMmS,
    coordinateFrame: 'machine-mm-rad',
    toolOrientation: 'fixed-down'
  };
}

function getSceneState() {
  const robot = controller.getState();
  return {
    schemaVersion: 'logo-robo.scene.v1',
    worldRevision: robot.worldRevision,
    coordinateFrame: 'machine-mm-rad',
    workcell: {
      tableZMm: CHALLENGE_LAYOUT.tableZMm,
      tray: CHALLENGE_LAYOUT.tray,
      board: CHALLENGE_LAYOUT.board
    },
    bricks: controller.getBricks(),
    boardTargets: board.getTargets()
  };
}

async function moveTool(input, { signal } = {}) {
  try {
    const result = await controller.moveTool({ ...input, signal });
    return { ...result, state: getRobotState() };
  } catch (error) {
    if (error instanceof RobotError) {
      return {
        ok: false,
        reason: error.code,
        details: error.details,
        state: getRobotState()
      };
    }
    throw error;
  }
}

function latch() {
  const result = controller.latch();
  return { ok: result.success, ...result, state: getRobotState(), bricks: controller.getBricks() };
}

function unlatch() {
  const result = controller.unlatch();
  return { ok: result.success, ...result, state: getRobotState(), bricks: controller.getBricks() };
}

function resetScene() {
  board.reset();
  controller.reset({ bricks: [makeSceneBrick()] });
  setStatus('READY');
  addLog('Workcell reset');
  return { ok: true, robot: getRobotState(), scene: getSceneState() };
}

async function runPickPlace({ stopAt = 'complete', signal } = {}) {
  resetScene();
  setStatus('RUNNING');
  const move = async (label, target, speedMmS) => {
    addLog(`MOVE ${label}`);
    const result = await moveTool({ ...target, speedMmS }, { signal });
    if (!result.ok) throw new RobotError(result.reason, result);
    return result;
  };

  try {
    if (stopAt === 'home') return { ok: true, stage: 'home', robot: getRobotState() };
    await move('pickup approach', CHALLENGE_LAYOUT.pickupAboveTcp, 560);
    if (stopAt === 'pickup-above') return { ok: true, stage: stopAt, robot: getRobotState() };
    await move('pickup', CHALLENGE_LAYOUT.pickupTcp, 260);
    if (stopAt === 'pickup') return { ok: true, stage: stopAt, robot: getRobotState() };
    const capture = latch();
    if (!capture.ok) throw new RobotError(capture.reason, capture);
    if (stopAt === 'latch') return { ok: true, stage: stopAt, latch: capture, robot: getRobotState() };
    await move('lift', CHALLENGE_LAYOUT.pickupAboveTcp, 300);
    if (stopAt === 'carrying') return { ok: true, stage: stopAt, robot: getRobotState() };
    await move('target approach', CHALLENGE_LAYOUT.targetAboveTcp, 560);
    if (stopAt === 'target-above') return { ok: true, stage: stopAt, robot: getRobotState() };
    await move('target', CHALLENGE_LAYOUT.targetTcp, 250);
    if (stopAt === 'target') return { ok: true, stage: stopAt, robot: getRobotState() };
    const release = unlatch();
    if (!release.ok || !release.snapped) throw new RobotError(release.reason ?? 'snap_failed', release);
    await move('retreat', CHALLENGE_LAYOUT.targetAboveTcp, 300);
    setStatus('COMPLETE', 'ok');
    addLog(`Pick + place complete at ${release.targetId}`, 'ok');
    return { ok: true, stage: 'complete', release, robot: getRobotState(), scene: getSceneState() };
  } catch (error) {
    setStatus('FAULT', 'bad');
    const reason = error.code ?? error.message;
    addLog(`Rejected: ${reason}`, 'bad');
    return { ok: false, reason, details: error.details ?? {}, robot: getRobotState(), scene: getSceneState() };
  }
}

const actions = {
  getSceneState,
  getRobotState,
  getWorkspace,
  moveTool,
  latch,
  unlatch,
  resetScene,
  runPickPlace,
  home: ({ signal } = {}) => moveTool({ ...UR10_DEFINITION.homeTcp, speedMmS: 500 }, { signal })
};
const runtime = createLogoRoboRuntime({ controller, board });

function updateUi() {
  const state = controller.getState();
  if (tcpEl) tcpEl.textContent = `${formatNumber(state.tcp.xMm)} / ${formatNumber(state.tcp.yMm)} / ${formatNumber(state.tcp.zMm)} mm`;
  if (jointsEl) jointsEl.textContent = state.jointsRad.map((value) => `${(value * 180 / Math.PI).toFixed(0)}°`).join(' ');
  if (heldEl) heldEl.textContent = state.heldBrickId ?? 'NONE';
  if (rrevEl) rrevEl.textContent = String(state.robotRevision);
  if (wrevEl) wrevEl.textContent = String(state.worldRevision);
  if (state.moving) setStatus('MOVING');
  else if (state.heldBrickId) setStatus('LATCHED');
  else if (statusEl?.textContent === 'MOVING' || statusEl?.textContent === 'LATCHED') setStatus('READY');
}

controller.subscribe((event) => {
  updateUi();
  if (event.type === 'motion_started') addLog(`Accepted path → ${event.target.xMm.toFixed(0)}, ${event.target.yMm.toFixed(0)}, ${event.target.zMm.toFixed(0)}`);
  if (event.type === 'motion_completed') addLog('Motion accepted', 'ok');
  if (event.type === 'latched') addLog(`Latch accepted: ${event.brickId}`, 'ok');
  if (event.type === 'unlatched') addLog(event.snap?.ok ? `Board snap accepted: ${event.snap.targetId}` : 'Released without snap', event.snap?.ok ? 'ok' : 'bad');
});

async function handleAction(button, action, successMessage) {
  if (button) button.disabled = true;
  try {
    const result = await action();
    if (result?.ok) {
      if (successMessage) addLog(successMessage, 'ok');
    } else {
      addLog(`Rejected: ${result?.reason ?? 'unknown'}`, 'bad');
      setStatus('REJECTED', 'bad');
    }
    return result;
  } finally {
    if (button) button.disabled = false;
  }
}

moveForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(moveForm);
  const input = {
    xMm: Number(form.get('xMm')),
    yMm: Number(form.get('yMm')),
    zMm: Number(form.get('zMm')),
    speedMmS: Number(form.get('speedMmS'))
  };
  await handleAction(moveButton, () => moveTool(input), 'Manual Cartesian move accepted');
});

for (const button of document.querySelectorAll('[data-target]')) {
  button.addEventListener('click', () => {
    const targetName = button.dataset.target;
    const target = targetName === 'pickup' ? CHALLENGE_LAYOUT.pickupTcp : targetName === 'target' ? CHALLENGE_LAYOUT.targetTcp : UR10_DEFINITION.homeTcp;
    for (const [key, value] of Object.entries({ ...target, speedMmS: targetName === 'home' ? 500 : 250 })) {
      const field = moveForm?.elements.namedItem(key);
      if (field) field.value = value;
    }
    addLog(`Loaded ${targetName} target`);
  });
}

$('[data-action="run"]')?.addEventListener('click', (event) => handleAction(event.currentTarget, () => actions.runPickPlace(), null));
$('[data-action="home"]')?.addEventListener('click', (event) => handleAction(event.currentTarget, () => actions.home(), 'Home accepted'));
$('[data-action="reset"]')?.addEventListener('click', () => resetScene());
$('[data-action="latch"]')?.addEventListener('click', (event) => handleAction(event.currentTarget, () => latch(), 'Latch accepted'));
$('[data-action="unlatch"]')?.addEventListener('click', (event) => handleAction(event.currentTarget, () => unlatch(), 'Unlatch accepted'));
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => renderer.setView(button.dataset.view));

function updateToolDiagnostics(event) {
  if (!toolListEl) return;
  let tool = toolListEl.querySelector(`[data-tool="${event.toolName}"]`);
  if (!tool) {
    tool = document.createElement('span');
    tool.dataset.tool = event.toolName;
    tool.textContent = event.toolName;
    toolListEl.append(tool);
  }
  tool.dataset.status = event.status;
  if (event.status === 'discovered') addLog(`WebMCP discovered: ${event.toolName}`, 'ok');
  if (event.status === 'executing') addLog(`WebMCP executing: ${event.toolName}`);
  if (event.status === 'succeeded') addLog(`WebMCP succeeded: ${event.toolName}`, 'ok');
  if (event.status === 'rejected') addLog(`WebMCP rejected: ${event.toolName} (${event.reason ?? 'invalid request'})`, 'bad');
}

renderer.start();
setInterval(() => {
  const performance = renderer.getPerformance();
  if (fpsEl) fpsEl.textContent = performance.fps ? `${performance.fps.toFixed(0)} FPS` : '—';
}, 500);
window.addEventListener('resize', () => renderer.render());

registerWebMcpTools(runtime, updateToolDiagnostics).then((result) => {
  if (!webmcpEl) return;
  if (result.ok) {
    webmcpEl.textContent = `${result.toolCount} TOOLS READY`;
    webmcpEl.dataset.kind = 'ok';
    addLog(`WebMCP ready: ${result.toolNames.join(', ')}`, 'ok');
  } else {
    webmcpEl.textContent = 'SECURE CONTEXT REQUIRED';
    webmcpEl.dataset.kind = 'warning';
    addLog('WebMCP unavailable in this browser context');
  }
});

window.__LOGO_ROBO__ = Object.freeze({
  version: '0.4.0-oracle3-perception-webmcp',
  actions,
  runtime,
  robotController: controller,
  board,
  renderer,
  getSceneState,
  getRobotState,
  getWorkspace,
  get scene() { return getSceneState(); }
});
window.__LOGO_ROBO_ORACLE1__ = { controller, renderer, board, runPickPlace, resetScene, layout: CHALLENGE_LAYOUT };
window.__LOGO_ROBO_ORACLE3__ = { runtime, controller, board, renderer };
window.__LOGO_ROBO_RUNTIME__ = runtime;
window.__ROBO_SIM__ = window.__LOGO_ROBO__;

if (evidenceMode) {
  const state = params.get('evidence') ?? 'home';
  const view = params.get('view') ?? (state === 'latch' ? 'latch' : state.includes('target') || state === 'complete' ? 'target' : state.includes('pickup') ? 'tray' : 'hero');
  renderer.setView(view);
  runPickPlace({ stopAt: state }).then((result) => {
    window.__LOGO_ROBO_EVIDENCE_RESULT__ = result;
    window.__LOGO_ROBO_EVIDENCE_READY__ = true;
  });
}
