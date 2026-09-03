import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { BRICK_SPEC, makeBrick } from '../../apps/web/src/bricks/brick-spec.js';
import { findLatchCandidate } from '../../apps/web/src/bricks/latch.js';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { parseCubeLUT } from '../../apps/web/src/player/color-grading.js';
import { ConnectionGraph } from '../../apps/web/src/player/connection-graph.js';
import {
  expectedConnectionCells,
  isCanonicalConnectorPair,
  validateConnectorConnection
} from '../../apps/web/src/player/connector-contract.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';
import { fixedStepAdvance } from '../../apps/web/src/player/math.js';
import { PlacementIntentEngine } from '../../apps/web/src/player/placement-intent.js';
import { HeldBrickController, HELD_STATES } from '../../apps/web/src/player/held-brick-controller.js';
import { LooseBrickPhysics } from '../../apps/web/src/player/loose-brick-physics.js';
import { PlayerController } from '../../apps/web/src/player/player-controller.js';
import { PlayerSettingsStore, PLAYER_FALLBACK_SETTINGS, PLAYER_SOURCE_PROVENANCE } from '../../apps/web/src/player/player-settings.js';
import { makeV8InitialSpawn, makeV8MoreSpawn, V8_BRICK_PALETTE } from '../../apps/web/src/player/v8-spawn.js';
import { compileImageData } from '../../apps/web/src/logo/compiler.js';
import { makePattern } from '../../apps/web/src/logo/patterns.js';
import { challengeBoardLimits, challengeInventoryHasNoOverlap, createChallengeInventory, remapBlueprintToChallenge } from '../../apps/web/src/logo/workcell-adapter.js';

const settings = {
  ...PLAYER_FALLBACK_SETTINGS,
  connectionCenterBandMm: 4,
  connectionSwitchHysteresisPct: 15,
  gridPitchMm: 8,
  snapSearchRadiusMm: 22
};

function makeRuntime() {
  const clock = new RevisionClock();
  const board = new BuildBoard([{
    id: 'target-red',
    colour: 'red',
    position: { xMm: 100, yMm: 100, zMm: 4.8 },
    yawRad: 0
  }], { revisionClock: clock });
  const bricks = [
    makeBrick({ id: 'brick-red', colour: 'red', xMm: 0, yMm: 0, zMm: 4.8, yawRad: 0 }),
    makeBrick({ id: 'brick-blue', colour: 'blue', xMm: 48, yMm: 0, zMm: 4.8, yawRad: 0 })
  ];
  const controller = new RobotController({ board, bricks, revisionClock: clock, timeScale: 0 });
  const graph = new ConnectionGraph();
  const placementEngine = new PlacementIntentEngine(settings, board, graph);
  const adapter = new HumanBuildAdapter({ controller, board, graph, placementEngine });
  return { clock, board, controller, graph, placementEngine, adapter };
}

test('original V8 pointer-lock flow enables free-look and Escape-style release', async () => {
  const previous = {
    document: globalThis.document,
    addEventListener: globalThis.addEventListener,
    matchMedia: globalThis.matchMedia
  };
  const classes = new Set();
  const documentTarget = new EventTarget();
  documentTarget.pointerLockElement = null;
  documentTarget.querySelectorAll = () => [];
  documentTarget.exitPointerLock = () => {};
  documentTarget.body = { classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
  } };
  const windowTarget = new EventTarget();
  const canvas = new EventTarget();
  const lockRequests = [];
  canvas.requestPointerLock = (options) => {
    lockRequests.push(options ?? null);
    return options ? Promise.reject(new Error('raw movement unsupported')) : Promise.resolve();
  };
  const event = (type, values) => {
    const result = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(values)) Object.defineProperty(result, key, { value });
    return result;
  };
  globalThis.document = documentTarget;
  globalThis.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  let player;
  try {
    player = new PlayerController({}, canvas, { ...PLAYER_FALLBACK_SETTINGS, mobileControlsMode: 'Off' }, { getDiagnostics: () => ({}) });
    player.setEnabled(true);
    const initialYaw = player.targetYaw;
    const initialPitch = player.targetPitch;
    canvas.dispatchEvent(event('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(lockRequests, [{ unadjustedMovement: true }, null]);
    documentTarget.pointerLockElement = canvas;
    documentTarget.dispatchEvent(new Event('pointerlockchange'));
    documentTarget.dispatchEvent(event('mousemove', { clientX: 100, clientY: 100, movementX: 40, movementY: -20 }));
    assert.ok(player.targetYaw < initialYaw);
    assert.ok(player.targetPitch > initialPitch);
    assert.equal(player.pointerLocked, true);
    assert.equal(classes.has('player-pointer-locked'), true);
    documentTarget.pointerLockElement = null;
    documentTarget.dispatchEvent(new Event('pointerlockchange'));
    const releasedYaw = player.targetYaw;
    documentTarget.dispatchEvent(event('mousemove', { clientX: 140, clientY: 80, movementX: 40, movementY: -20 }));
    assert.equal(player.targetYaw, releasedYaw);
    assert.equal(player.pointerLocked, false);
    assert.equal(classes.has('player-pointer-locked'), false);
  } finally {
    player?.setEnabled(false);
    globalThis.document = previous.document;
    globalThis.addEventListener = previous.addEventListener;
    globalThis.matchMedia = previous.matchMedia;
  }
});

test('in-app fallback enables no-drag free-look when pointer lock is rejected', async () => {
  const previous = {
    document: globalThis.document,
    addEventListener: globalThis.addEventListener,
    matchMedia: globalThis.matchMedia
  };
  const classes = new Set();
  const documentTarget = new EventTarget();
  documentTarget.pointerLockElement = null;
  documentTarget.querySelectorAll = () => [];
  documentTarget.exitPointerLock = () => {};
  documentTarget.body = { classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
  } };
  const windowTarget = new EventTarget();
  const canvas = new EventTarget();
  canvas.requestPointerLock = () => Promise.reject(new Error('pointer lock unavailable in embedded preview'));
  const event = (type, values) => {
    const result = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(values)) Object.defineProperty(result, key, { value });
    return result;
  };
  globalThis.document = documentTarget;
  globalThis.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  let player;
  try {
    player = new PlayerController({}, canvas, { ...PLAYER_FALLBACK_SETTINGS, mobileControlsMode: 'Off' }, { getDiagnostics: () => ({}) });
    player.setEnabled(true);
    const initialYaw = player.targetYaw;
    canvas.dispatchEvent(event('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(player.fallbackLookActive, true);
    assert.equal(player.getState().lookMode, 'in-app-fallback');
    assert.equal(classes.has('player-look-fallback'), true);
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });
    canvas.dispatchEvent(event('mousemove', { clientX: 145, clientY: 100, movementX: 0, movementY: 0, buttons: 0 }));
    assert.ok(player.targetYaw < initialYaw, 'ordinary in-app mouse movement must rotate without dragging');
    assert.equal(player.getState().fallbackEdgeTurn.dx, 0, 'normal FPS look must not invoke edge assist outside the final 100 pixels');
    let primary = 0;
    player.onPrimary = () => { primary += 1; };
    canvas.dispatchEvent(event('mousedown', { button: 0, clientX: 145, clientY: 80 }));
    assert.equal(primary, 1, 'second click remains the primary pick/release action');
    windowTarget.dispatchEvent(event('keydown', { code: 'Escape', target: null }));
    assert.equal(player.fallbackLookActive, false);
    assert.equal(classes.has('player-look-fallback'), false);
  } finally {
    player?.setEnabled(false);
    globalThis.document = previous.document;
    globalThis.addEventListener = previous.addEventListener;
    globalThis.matchMedia = previous.matchMedia;
  }
});

test('in-app fallback adds exponential 100px edge assist and an immediate bounded fast-flick boost', async () => {
  const previous = {
    document: globalThis.document,
    addEventListener: globalThis.addEventListener,
    matchMedia: globalThis.matchMedia
  };
  const classes = new Set();
  const documentTarget = new EventTarget();
  documentTarget.pointerLockElement = null;
  documentTarget.querySelectorAll = () => [];
  documentTarget.exitPointerLock = () => {};
  documentTarget.body = { classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
  } };
  const windowTarget = new EventTarget();
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });
  const event = (type, values) => {
    const result = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(values)) Object.defineProperty(result, key, { value });
    return result;
  };
  globalThis.document = documentTarget;
  globalThis.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  let player;
  try {
    player = new PlayerController({}, canvas, { ...PLAYER_FALLBACK_SETTINGS, mobileControlsMode: 'Off' }, { getDiagnostics: () => ({}) });
    player.setEnabled(true);
    player.activateFallbackLook(event('mousedown', { clientX: 400, clientY: 300, timeStamp: 1000 }));
    canvas.dispatchEvent(event('mousemove', { clientX: 110, clientY: 300, movementX: -290, movementY: 0, buttons: 0, timeStamp: 1100 }));
    assert.equal(player.getState().fallbackEdgeTurn.dx, 0, 'edge assist must remain off outside the final 100 pixels');
    assert.equal(player.getState().fallbackFlickBoost.dx, 0, 'a fast move outside the edge band must not receive a boost');
    canvas.dispatchEvent(event('mousemove', { clientX: 75, clientY: 300, movementX: -35, movementY: 0, buttons: 0, timeStamp: 1200 }));
    const softRate = Math.abs(player.getState().fallbackEdgeTurn.dx);
    assert.equal(classes.has('player-look-edge'), true);
    assert.ok(player.getState().fallbackEdgeTurn.dx < 0);
    assert.ok(softRate > 0, 'the continuous assist must begin inside 100 pixels');
    assert.equal(player.getState().fallbackFlickBoost.dx, 0, 'slow entry into the edge band must remain gentle');
    canvas.dispatchEvent(event('mousemove', { clientX: 400, clientY: 300, movementX: 325, movementY: 0, buttons: 0, timeStamp: 1300 }));
    canvas.dispatchEvent(event('mousemove', { clientX: 10, clientY: 10, movementX: -390, movementY: -290, buttons: 0, timeStamp: 1310 }));
    assert.ok(Math.abs(player.getState().fallbackEdgeTurn.dx) > softRate, 'turn rate must rise exponentially toward the edge');
    assert.ok(player.getState().fallbackFlickBoost.dx < 0, 'a fast left flick must add an immediate left-turn boost');
    assert.ok(player.getState().fallbackFlickBoost.dy < 0, 'a fast corner flick must boost pitch on the same event');
    const edgeYaw = player.targetYaw;
    player.applyFallbackEdgeTurn(0.25);
    assert.ok(player.targetYaw > edgeYaw, 'holding near the left edge must keep turning left without more cursor travel');
    canvas.dispatchEvent(event('mousemove', { clientX: 400, clientY: 300, movementX: 390, movementY: 290, buttons: 0, timeStamp: 1410 }));
    const centreYaw = player.targetYaw;
    player.applyFallbackEdgeTurn(0.25);
    assert.equal(player.targetYaw, centreYaw, 'returning toward the centre must stop continuous edge turning');
    assert.equal(classes.has('player-look-edge'), false);
    canvas.dispatchEvent(event('mousemove', { clientX: 400, clientY: 20, movementX: 0, movementY: -280, buttons: 0, timeStamp: 1510 }));
    const topPitch = player.targetPitch;
    player.applyFallbackEdgeTurn(0.1);
    assert.ok(player.targetPitch > topPitch, 'holding near the top edge must keep looking up');
    canvas.dispatchEvent(event('mousemove', { clientX: 400, clientY: 580, movementX: 0, movementY: 560, buttons: 0, timeStamp: 1610 }));
    const bottomPitch = player.targetPitch;
    player.applyFallbackEdgeTurn(0.1);
    assert.ok(player.targetPitch < bottomPitch, 'holding near the bottom edge must keep looking down');
  } finally {
    player?.setEnabled(false);
    globalThis.document = previous.document;
    globalThis.addEventListener = previous.addEventListener;
    globalThis.matchMedia = previous.matchMedia;
  }
});

test('player movement ignores Space and Control and stays at its configurable fixed height', () => {
  const previous = {
    document: globalThis.document,
    addEventListener: globalThis.addEventListener,
    matchMedia: globalThis.matchMedia
  };
  const documentTarget = new EventTarget();
  documentTarget.pointerLockElement = null;
  documentTarget.querySelectorAll = () => [];
  documentTarget.exitPointerLock = () => {};
  documentTarget.body = { classList: { add() {}, remove() {}, toggle() {} } };
  const windowTarget = new EventTarget();
  const canvas = new EventTarget();
  const event = (type, values) => {
    const result = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(values)) Object.defineProperty(result, key, { value });
    return result;
  };
  const camera = {
    position: { copy() {} },
    up: { set() {} },
    lookAt() {}
  };
  const collision = {
    lastCollisionCount: 0,
    move(start, delta, output) {
      output.copy(start).add(delta);
      output.z = -999;
      return output;
    },
    getDiagnostics: () => ({})
  };
  globalThis.document = documentTarget;
  globalThis.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  let player;
  try {
    player = new PlayerController(camera, canvas, { ...PLAYER_FALLBACK_SETTINGS, mobileControlsMode: 'Off' }, collision);
    player.setLookAt({ x: 0, y: 0, z: 500 }, { x: 0, y: 100, z: 500 });
    player.setFixedHeight(640);
    player.setEnabled(true);

    const space = event('keydown', { code: 'Space' });
    const control = event('keydown', { code: 'ControlLeft' });
    windowTarget.dispatchEvent(space);
    windowTarget.dispatchEvent(control);
    assert.equal(player.keys.has('Space'), false);
    assert.equal(player.keys.has('ControlLeft'), false);
    assert.equal(space.defaultPrevented, true);
    assert.equal(control.defaultPrevented, true);

    player.keys.add('Space');
    player.keys.add('ControlRight');
    player.keys.add('KeyW');
    player.physicsStep(0.1);
    assert.ok(Math.hypot(player.position.x, player.position.y) > 0, 'horizontal movement must remain enabled');
    assert.equal(player.position.z, 640, 'collision resolution must not change the configured player height');
    assert.equal(player.velocity.z, 0);
    assert.equal(player.getState().fixedHeightMm, 640);
  } finally {
    player?.setEnabled(false);
    globalThis.document = previous.document;
    globalThis.addEventListener = previous.addEventListener;
    globalThis.matchMedia = previous.matchMedia;
  }
});

test('held brick uses the V8 240 Hz gravity and constrained-pendulum solver', () => {
  const physics = new HeldBrickController({
    ...PLAYER_FALLBACK_SETTINGS,
    gravityMS2: 9.81,
    brickMassKg: 0.0115,
    pendulumLengthMm: 20,
    angularDampingNms: 0.00012,
    linearDampingPerS: 0.25,
    maximumAngularVelocityRadS: 18,
    pickupStiffnessNPerM: 2,
    pickupDampingNsPerM: 0.12,
    pickupTransitionTimeS: 0.28,
    pickupCaptureRadiusMm: 8,
    pickupCaptureSpeedMmS: 1200,
    pickupMaxSpeedMmS: 4500,
    pickupGravityScale: 0.15,
    fullPhysicsHeightMm: 28.8,
    snapRegionHeightMm: 45,
    placementLockHeightMm: 9.6
  });
  const pivot = { x: 0, y: 0, z: 220 };
  const player = { getHoldPivot: (output) => output.set(pivot.x, pivot.y, pivot.z) };
  physics.pickup({ id: 'physics-brick', position: { xMm: 0, yMm: 0, zMm: 4.8 }, yawRad: 0 });
  for (let index = 0; index < 240; index += 1) physics.step(1 / 240, player);
  assert.equal(physics.state, HELD_STATES.HELD_PHYSICS);
  assert.ok(Math.abs(physics.position.z - 200) < 1);
  pivot.x = 120;
  for (let index = 0; index < 30; index += 1) physics.step(1 / 240, player);
  assert.ok(physics.angularVelocity.length() > 0.01);
  assert.ok(Math.abs(physics.position.x - pivot.x) > 0.01, 'pendulum COM must not be rigidly glued to the pivot');
  assert.ok(Math.abs(physics.quaternion.y) > 0.0001, 'pivot acceleration should create physical tilt');
  assert.ok(physics.getVisualPose().angularVelocityRadS.every(Number.isFinite));
});

test('released bricks retain V8 gravity, angular motion, collision, and authoritative world commits', () => {
  const { controller } = makeRuntime();
  assert.equal(controller.moveLooseBrick('brick-red', { xMm: 0, yMm: 80, zMm: 120 }).ok, true);
  const beforePhysics = controller.getState().worldRevision;
  const physics = new LooseBrickPhysics(controller, {
    ...PLAYER_FALLBACK_SETTINGS,
    physicsHz: 240,
    gravityMS2: 9.81,
    brickMassKg: 0.0115,
    linearDampingPerS: 0.25,
    angularDampingNms: 0.00012,
    restitution: 0.17,
    friction: 0.62,
    brickCollisionEnabled: true,
    brickCollisionIterations: 2,
    collisionPositionCorrection: 0.86,
    collisionSlopMm: 0.08
  });
  assert.equal(physics.launch('brick-red', {
    position: { xMm: 0, yMm: 80, zMm: 120 },
    quaternion: [0.08, 0.04, 0, 0.99599],
    velocityMmS: [180, 0, 40],
    angularVelocityRadS: [1.2, -0.8, 2.4]
  }), true);
  for (let index = 0; index < 1200; index += 1) physics.step(1 / 240);
  const brick = controller.getBricks().find((candidate) => candidate.id === 'brick-red');
  assert.ok(controller.getState().worldRevision > beforePhysics + 30);
  assert.ok(brick.position.xMm > 0, 'released linear velocity must move the authoritative brick');
  assert.ok(brick.position.zMm >= BRICK_SPEC.bodyHeightMm / 2 - 1e-6);
  assert.ok(brick.position.zMm < 25, 'gravity must return the brick to a supporting surface');
  assert.equal(brick.freeQuaternion.length, 4);
  assert.ok(brick.freeQuaternion.every(Number.isFinite));
  assert.equal(physics.getState().length, 0, 'resting free body must sleep');
});

test('the visible carried brick is opaque while only placement targets remain translucent', async () => {
  const renderer = await readFile(fileURLToPath(new URL('../../apps/web/src/render/robot-renderer.js', import.meta.url)), 'utf8');
  const visual = await readFile(fileURLToPath(new URL('../../apps/web/src/player/v8-brick-visual.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(renderer, /tcpMarker|tcpRing/);
  assert.match(renderer, /this\.gripper\.update\(fk\.frames\[6\], state\.gripper\.jawGapMm\)/);
  assert.match(renderer, /createV8BrickVisual\(\{ colour: 'green',[\s\S]*MAIN_DEMO_HELD_BRICK/);
  assert.match(visual, /transparent:\s*ghost,[\s\S]*opacity:\s*ghost \? settings\.ghostOpacity : 1/);
  assert.match(renderer, /heldGhost\.userData\.material\.opacity\s*=\s*1/);
  assert.match(renderer, /heldGhost\.userData\.material\.transparent\s*=\s*false/);
});

test('supplied V8 player settings are provenance-locked and production disables collapse', async () => {
  const path = fileURLToPath(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url));
  const bytes = await readFile(path);
  const normalizedBytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  assert.equal(createHash('sha256').update(normalizedBytes).digest('hex'), PLAYER_SOURCE_PROVENANCE.currentSettingsSha256);
  assert.equal(PLAYER_SOURCE_PROVENANCE.suppliedSettingsSha256, '3e9a58a4b23b96d4ce98a1cd77b8c123ebf14270c1806016da49620713cbc9b9');
  const attributes = await readFile(fileURLToPath(new URL('../../.gitattributes', import.meta.url)), 'utf8');
  assert.match(attributes, /^apps\/web\/config\/player\/LOGO_ROBO_PLAYER_SETTINGS\.json -text$/m);
  const supplied = JSON.parse(bytes.toString('utf8'));
  assert.equal(supplied.fovDeg, 62);
  assert.equal(supplied.cameraZoom, 1.2999999999999994);
  assert.equal(supplied.physicsHz, 240);
  assert.equal(supplied.structuralCollapseEnabled, true);
  assert.equal(PLAYER_FALLBACK_SETTINGS.structuralCollapseEnabled, false);
  const store = new PlayerSettingsStore(supplied);
  assert.ok(Object.keys(store.get()).length >= Object.keys(supplied).length);
  for (const [key, value] of Object.entries(supplied)) {
    assert.deepEqual(store.get()[key], key === 'structuralCollapseEnabled' ? false : value, key);
  }
});

test('V8 panel preserves settings and hides the legacy world mount in favour of robot base controls', async () => {
  const store = new PlayerSettingsStore({ ...PLAYER_FALLBACK_SETTINGS, tableWidthMm: 1750, matPanelsX: 4 });
  assert.deepEqual(
    ['robotMountXmm', 'robotMountYmm', 'robotMountZmm', 'robotMountYawDeg'].map((key) => store.get()[key]),
    [-820, 170, 1200, 0]
  );
  assert.equal(store.setMany({ robotMountXmm: -500, structuralCollapseEnabled: true }).ok, true);
  assert.equal(store.get().robotMountXmm, -500);
  assert.equal(store.get().structuralCollapseEnabled, false);
  const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
  const panel = await readFile(fileURLToPath(new URL('../../apps/web/src/player/player-settings-panel.js', import.meta.url)), 'utf8');
  const workbench = await readFile(fileURLToPath(new URL('../../apps/web/src/render/v8-workbench.js', import.meta.url)), 'utf8');
  assert.match(html, /data-settings-panel/);
  assert.match(html, /PLACE NEXT BRICK/);
  assert.match(panel, /20×20 Stud Build Mat/);
  assert.match(panel, /Robot Mount/);
  assert.match(panel, /HIDDEN_SETTINGS = new Set\(\['verticalSpeedMmS', 'movementFollowsPitch', 'robotMountXmm', 'robotMountYmm', 'robotMountZmm', 'robotMountYawDeg'\]\)/);
  assert.match(panel, /SCENE_LAYOUT_CONTROLS\[key\]/);
  assert.match(workbench, /MAIN_DEMO_V8_MORE_BRICKS_BUTTON/);
  assert.match(workbench, /matPanelsX \* s\.matPanelStuds/);
});

test('fuller V8 production round remains authoritative, red-blue, and tray-safe', () => {
  const compiled = compileImageData(makePattern('diagonal', 64), {
    brickBudget: 8,
    boardLimits: challengeBoardLimits(),
    fitMode: 'contain',
    seed: 173
  }).blueprint;
  const blueprint = remapBlueprintToChallenge(compiled);
  const inventory = createChallengeInventory(blueprint);
  assert.equal(blueprint.brickCount, 8);
  assert.deepEqual([...new Set(inventory.map((brick) => brick.colour))].sort(), ['blue', 'red']);
  assert.equal(challengeInventoryHasNoOverlap(inventory), true);
});

test('240 Hz fixed-step schedule is independent of 60/90/120/144 render cadence', () => {
  const totals = [];
  for (const renderHz of [60, 90, 120, 144]) {
    let accumulator = 0;
    let steps = 0;
    const frames = renderHz * 5;
    for (let frame = 0; frame < frames; frame += 1) {
      const advance = fixedStepAdvance(accumulator, 1 / renderHz, 1 / 240, 8);
      accumulator = advance.accumulator;
      steps += advance.steps;
    }
    totals.push(steps);
  }
  assert.deepEqual(totals, [1200, 1200, 1200, 1200]);
});

test('locked V8 seed reproduces the original immediate 12-brick multicolour spawn', async () => {
  const supplied = JSON.parse(await readFile(fileURLToPath(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url)), 'utf8'));
  const bricks = makeV8InitialSpawn(supplied);
  assert.equal(bricks.length, 12);
  assert.deepEqual(V8_BRICK_PALETTE.map(({ colour }) => colour), [
    'red', 'blue', 'yellow', 'green', 'orange', 'white', 'black', 'purple', 'teal'
  ]);
  assert.deepEqual(bricks.slice(0, 4).map((brick) => ({
    colour: brick.colour,
    position: Object.values(brick.position).map((value) => Number(value.toFixed(4))),
    yawRad: Number(brick.yawRad.toFixed(6))
  })), [
    { colour: 'blue', position: [-666.679, -491.6628, 1204.8], yawRad: 0.746199 },
    { colour: 'white', position: [-619.6378, -492.222, 1204.8], yawRad: 3.673034 },
    { colour: 'yellow', position: [-572.752, -491.7345, 1204.8], yawRad: 5.891398 },
    { colour: 'purple', position: [-524.4297, -491.7476, 1204.8], yawRad: 1.774049 }
  ]);
  assert.ok(bricks.every((brick) => brick.position.zMm === supplied.tableTopHeightMm + supplied.brickBodyHeightMm / 2));
});

test('MORE BRICKS deterministically adds ten physical launch records without replacing the initial set', async () => {
  const supplied = JSON.parse(await readFile(fileURLToPath(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url)), 'utf8'));
  const initial = makeV8InitialSpawn(supplied);
  const added = makeV8MoreSpawn(supplied, 1, { startIndex: initial.length });
  assert.equal(added.length, 10);
  assert.equal(new Set([...initial, ...added].map((brick) => brick.id)).size, 22);
  assert.deepEqual(added.slice(0, 2).map((brick) => ({
    colour: brick.colour,
    position: Object.values(brick.position).map((value) => Number(value.toFixed(4))),
    velocity: brick.initialVelocityMps.map((value) => Number(value.toFixed(6))),
    spin: brick.initialAngularVelocityRadS.map((value) => Number(value.toFixed(6)))
  })), [
    { colour: 'orange', position: [-645, -447.7218, 1269.8], velocity: [-0.026279, -0.017203, 0.047627], spin: [0.533923, -0.15917, 1.333971] },
    { colour: 'black', position: [-591, -449.7956, 1291.8], velocity: [0.01161, -0.025243, 0.036362], spin: [-0.818007, -0.340853, 0.838226] }
  ]);
});

test('MAIN_DEMO preserves the V8 HUD, controls, snap animation, and additive MORE BRICKS action', async () => {
  const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
  const css = await readFile(fileURLToPath(new URL('../../apps/web/logo.css', import.meta.url)), 'utf8');
  const main = await readFile(fileURLToPath(new URL('../../apps/web/src/logo/main.js', import.meta.url)), 'utf8');
  const renderer = await readFile(fileURLToPath(new URL('../../apps/web/src/render/robot-renderer.js', import.meta.url)), 'utf8');
  const workbench = await readFile(fileURLToPath(new URL('../../apps/web/src/render/v8-workbench.js', import.meta.url)), 'utf8');
  assert.match(html, /LOGO ROBO <span>PLAYER LAB V8 · 120 HZ TARGET<\/span>/);
  assert.match(html, /W forward · A left · S back · D right · Wheel zoom · Click pick\/release · R rotates around selected studs/);
  assert.match(html, /data-hud-zone>PHYSICS/);
  assert.match(html, /id="angle-pill"/);
  assert.match(html, /data-settings-preset="precise"[\s\S]*data-settings-preset="balanced"[\s\S]*data-settings-preset="fast"/);
  assert.match(html, /data-camera-capture="top_camera"[\s\S]*data-camera-capture="left_camera"[\s\S]*data-camera-capture="right_camera"[\s\S]*data-camera-capture="user_camera"/);
  assert.match(css, /\.panel\.closed\{transform:translateX\(calc\(100% \+ 28px\)\)/);
  assert.match(css, /#angle-pill\{bottom:calc\(78px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /#reticle-status\{bottom:calc\(46px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(main, /function spawnMoreBricks\(options = \{\}\)[\s\S]*controller\.addLooseBricks[\s\S]*renderer\.launchSpawnedBricks/);
  assert.match(main, /spawnMoreBricks:\s*activateMoreBricks,\s*runOnePickPlace/);
  assert.doesNotMatch(main, /SNAP \$\{preview\.mode/);
  assert.match(main, /getUserCamera: \(\) => renderer\.getUserCameraConfig\(\)[\s\S]*captureCamera: \(descriptor, options\) => renderer\.captureInspectionCamera\(descriptor, options\)/);
  assert.match(main, /function captureCamera\([\s\S]*runtime\.world\.captureCamera/);
  assert.match(renderer, /snapNaturalFrequencyHz[\s\S]*snapDampingRatio[\s\S]*snapOvershootMm/);
  assert.match(renderer, /captureInspectionCamera\([\s\S]*WebGLRenderTarget[\s\S]*readRenderTargetPixels/);
  assert.match(workbench, /CylinderGeometry\(anchor\.radiusMm, anchor\.radiusMm, anchor\.heightMm, 32\)/);
  assert.match(workbench, /context\.rotate\(-Math\.PI \/ 2\)/);
  assert.match(workbench, /Impact[\s\S]*context\.fillText\('MORE', 0, -56\)[\s\S]*context\.fillText\('BRICKS', 0, 56\)/);
});

test('fixed-step catch-up is capped after a suspended browser frame', () => {
  const advance = fixedStepAdvance(0, 12, 1 / 240, 8);
  assert.equal(advance.steps, 8);
  assert.ok(advance.accumulator < 1 / 240);
});

test('L/M/R connector masks overlap by two studs and reject duplicate occupancy', () => {
  const graph = new ConnectionGraph();
  assert.deepEqual(graph.connectorCells('L').map((cell) => cell.column), [0, 0, 1, 1]);
  assert.deepEqual(graph.connectorCells('M').map((cell) => cell.column), [1, 1, 2, 2]);
  assert.deepEqual(graph.connectorCells('R').map((cell) => cell.column), [2, 2, 3, 3]);
  assert.equal(graph.addConnection({
    lowerBrickId: 'lower',
    lowerConnector: 'L',
    upperBrickId: 'upper',
    upperConnector: 'R'
  }), true);
  assert.equal(graph.addConnection({
    lowerBrickId: 'lower',
    lowerConnector: 'L',
    upperBrickId: 'other',
    upperConnector: 'M'
  }), false);
  assert.equal(graph.validate().pass, true);
});

test('connector contract keeps canonical pairs while side pairs rotate in quarter turns', () => {
  const sides = ['L', 'M', 'R'];
  const validPairs = new Set(['L:R', 'M:M', 'R:L']);
  for (const lowerConnector of sides) for (const upperConnector of sides) {
    const key = `${lowerConnector}:${upperConnector}`;
    assert.equal(isCanonicalConnectorPair(lowerConnector, upperConnector), validPairs.has(key), key);
    const expected = expectedConnectionCells(lowerConnector, upperConnector);
    if (!validPairs.has(key)) {
      assert.equal(expected, null);
      continue;
    }
    const studPairs = expected.lower.map((lower, index) => ({ lower, upper: expected.upper[index] }));
    const parallel = validateConnectorConnection({ lowerConnector, upperConnector, relativeRotationDeg: 0, studPairs });
    assert.equal(parallel.valid, true, key);
    assert.equal(parallel.studCount, lowerConnector === 'M' ? 8 : 4);
    const quarterCells = expectedConnectionCells(lowerConnector, upperConnector, 90);
    const quarterPairs = quarterCells.lower.map((lower, index) => ({ lower, upper: quarterCells.upper[index] }));
    const quarter = validateConnectorConnection({ lowerConnector, upperConnector, relativeRotationDeg: 90, studPairs: quarterPairs });
    if (lowerConnector === 'M') assert.equal(quarter.reason, 'perpendicular_connection_forbidden');
    else {
      assert.equal(quarter.valid, true, key);
      assert.equal(quarter.relativeRotationDeg, 90);
      assert.equal(quarter.studCount, 4);
    }
    const halfTurnCells = expectedConnectionCells(lowerConnector, upperConnector, 180);
    const halfTurnPairs = halfTurnCells.lower.map((lower, index) => ({ lower, upper: halfTurnCells.upper[index] }));
    const halfTurn = validateConnectorConnection({ lowerConnector, upperConnector, relativeRotationDeg: 180, studPairs: halfTurnPairs });
    assert.equal(halfTurn.valid, true, key);
    assert.equal(halfTurn.studCount, 8);
  }
});

test('placement engine produces exact L/M/R support candidates and blocks collisions', () => {
  const { placementEngine } = makeRuntime();
  const support = { id: 'support', position: { xMm: 200, yMm: 0, zMm: 8.6 }, yawRad: 0 };
  const carried = { id: 'carried', position: { xMm: 184, yMm: 0, zMm: 18.2 }, yawRad: 0 };
  const left = placementEngine.connectionCandidate(
    support,
    { xMm: 188, yMm: 0, zMm: 13.4 },
    carried,
    [support, carried]
  );
  assert.equal(left.side, 'L');
  assert.equal(left.carriedSide, 'R');
  assert.equal(left.position.xMm, 184);
  assert.ok(Math.abs(left.position.zMm - 18.2) < 1e-9);
  carried.position.xMm = 200;
  carried.yawRad = Math.PI / 2;
  placementEngine.rotationQuarterTurns = 1;
  const middle = placementEngine.connectionCandidate(
    support,
    { xMm: 200, yMm: 0, zMm: 13.4 },
    carried,
    [support, carried]
  );
  assert.equal(middle.side, 'M');
  assert.equal(middle.carriedSide, 'M');
  assert.equal(middle.position.xMm, support.position.xMm);
  assert.equal(middle.position.yMm, support.position.yMm);
  assert.equal(middle.yawRad, support.yawRad, 'brick-on-brick preview must lock parallel despite a perpendicular carried pose');
  assert.equal(middle.studCount, 8, 'AM-BM must engage all eight studs');
  assert.equal(middle.overhang, false);
  carried.position.xMm = 216;
  const right = placementEngine.connectionCandidate(
    support,
    { xMm: 212, yMm: 0, zMm: 13.4 },
    carried,
    [support, carried]
  );
  assert.equal(right.side, 'R');
  assert.equal(right.carriedSide, 'L');
  assert.ok(Math.abs(right.yawRad - Math.PI / 2) < 1e-9, 'AR-BL must retain the requested 90 degree turn');
  assert.equal(right.relativeRotationDeg, 90);
  assert.equal(right.studCount, 4);
  const mismatched = placementEngine.connectionCandidate(
    support,
    { xMm: 212, yMm: 0, zMm: 13.4 },
    carried,
    [support, carried],
    'M'
  );
  assert.equal(mismatched.valid, false);
  assert.equal(mismatched.blockedReason, 'CONNECTOR_PAIR_MISMATCH');
  assert.equal(mismatched.carriedSide, 'L', 'invalid BM-AR requests must still preview the canonical BR-AL alignment');
  const blocker = {
    id: 'blocker',
    position: { ...right.position, xMm: right.position.xMm + 4, yMm: right.position.yMm + 4 },
    yawRad: right.yawRad
  };
  const blocked = placementEngine.connectionCandidate(
    support,
    { xMm: 212, yMm: 0, zMm: 13.4 },
    carried,
    [support, carried, blocker]
  );
  assert.equal(blocked.valid, false);
  assert.equal(blocked.blockedReason, 'COLLISION:blocker');
});

test('rotation skips a wall-clipping quarter turn and selects the next valid orientation', () => {
  const { placementEngine } = makeRuntime();
  const support = { id: 'support', position: { xMm: 200, yMm: 0, zMm: 8.6 }, yawRad: 0 };
  const carried = { id: 'carried', position: { xMm: 200, yMm: 0, zMm: 18.2 }, yawRad: 0 };
  const blocker = { id: 'wall', position: { xMm: 208, yMm: 22, zMm: 18.2 }, yawRad: 0 };
  const hitPoint = { xMm: 212, yMm: 0, zMm: 13.4 };

  const rotation = placementEngine.rotateToNextValid(1, () => placementEngine.connectionCandidate(
    support,
    hitPoint,
    carried,
    [support, carried, blocker]
  ));

  assert.equal(rotation.degrees, 180);
  assert.equal(rotation.skipped, 1);
  assert.equal(rotation.attempts, 2);
  assert.equal(rotation.candidate.valid, true);
  assert.equal(placementEngine.rotationQuarterTurns, 2);
});

test('human pickup and placement use controller, board, ownership, and one revision clock', () => {
  const { controller, board, graph, placementEngine, adapter } = makeRuntime();
  const before = controller.getState().worldRevision;
  const pickup = adapter.pickup('brick-red');
  assert.equal(pickup.ok, true);
  const afterPickup = controller.getState().worldRevision;
  assert.ok(afterPickup > before);
  assert.equal(controller.getBricks().find((brick) => brick.id === 'brick-red').ownership, 'human');
  const candidate = placementEngine.matCandidate(
    { xMm: 32, yMm: 32, zMm: 0 },
    { id: 'brick-red' },
    controller.getBricks()
  );
  adapter.setPreview(candidate);
  assert.equal(controller.getState().worldRevision, afterPickup, 'preview must not mutate world state');
  const release = adapter.release();
  assert.equal(release.ok, true);
  assert.ok(controller.getState().worldRevision > afterPickup);
  const brick = controller.getBricks().find((entry) => entry.id === 'brick-red');
  assert.equal(brick.ownership, null);
  assert.equal(brick.placementType, 'mat');
  assert.deepEqual(brick.position, candidate.position);
  assert.equal(board.getPlacements().at(0).actor, 'human');
  assert.equal(graph.snapshot().matRoots.includes('brick-red'), true);
  assert.equal(controller.moveLooseBrick('brick-red', { xMm: 80, yMm: 80, zMm: 4.8 }).reason, 'operation_in_progress');
  assert.equal(findLatchCandidate({ ...brick.position, zMm: brick.position.zMm + 7.7 }, controller.getBricks()).reason, 'no_brick_in_capture');
});

test('only top-most structure bricks can be picked up', () => {
  const { adapter, graph } = makeRuntime();
  assert.equal(graph.addConnection({
    lowerBrickId: 'brick-red',
    lowerConnector: 'R',
    upperBrickId: 'brick-blue',
    upperConnector: 'L'
  }), true);
  const supporting = adapter.pickup('brick-red');
  assert.equal(supporting.ok, false);
  assert.equal(supporting.reason, 'supporting_brick');
  assert.deepEqual(supporting.blockedByBrickIds, ['brick-blue']);
  assert.equal(adapter.pickup('brick-blue').ok, true);
});

test('human placement undo restores the exact loose source and authoritative board state', () => {
  const { adapter, controller, board, graph, placementEngine } = makeRuntime();
  const original = controller.getBricks().find((brick) => brick.id === 'brick-red');
  assert.equal(adapter.pickup(original.id).ok, true);
  const candidate = placementEngine.matCandidate(
    { xMm: 32, yMm: 32, zMm: 0 },
    { id: original.id },
    controller.getBricks()
  );
  adapter.setPreview(candidate);
  assert.equal(adapter.release().ok, true);
  assert.equal(adapter.getState().canUndo, true);
  assert.equal(board.getPlacements().length, 1);
  const beforeUndoRevision = controller.getState().worldRevision;
  const undone = adapter.undo();
  assert.equal(undone.ok, true);
  assert.equal(undone.action, 'placement_undone');
  assert.ok(controller.getState().worldRevision > beforeUndoRevision);
  assert.equal(board.getPlacements().length, 0);
  assert.equal(graph.snapshot().matRoots.includes(original.id), false);
  const restored = controller.getBricks().find((brick) => brick.id === original.id);
  assert.deepEqual(restored.position, original.position);
  assert.equal(restored.yawRad, original.yawRad);
  assert.equal(restored.placementType, null);
  assert.equal(adapter.getState().canUndo, false);
});

test('paused controls expose undo and descriptive labels without shortcut badges', async () => {
  const html = await readFile(fileURLToPath(new URL('../../apps/web/index.html', import.meta.url)), 'utf8');
  const main = await readFile(fileURLToPath(new URL('../../apps/web/src/logo/main.js', import.meta.url)), 'utf8');
  assert.match(html, /data-undo disabled>UNDO<\/button>/);
  assert.match(html, /data-settings-toggle>SETTINGS<\/button>/);
  assert.match(html, /data-debug-toggle>DEBUG<\/button>/);
  assert.match(html, /data-perf-toggle>PERFORMANCE<\/button>/);
  assert.doesNotMatch(html, /<kbd>/);
  assert.match(main, /event\.code === 'KeyZ'/);
  assert.match(main, /renderer\.undoPlayerAction\(\)/);
});

test('TEST mode locks player edits and returning to BUILD restores pickup', () => {
  const { adapter } = makeRuntime();
  assert.equal(adapter.setMode('TEST'), true);
  assert.deepEqual(adapter.pickup('brick-red'), { ok: false, reason: 'test_mode_locked' });
  assert.equal(adapter.setMode('BUILD'), true);
  assert.equal(adapter.pickup('brick-red').ok, true);
});

test('human pickup fails closed while robot motion is queued', async () => {
  const { controller, adapter } = makeRuntime();
  const current = controller.getState().tcp;
  const motion = controller.moveTool({
    xMm: current.xMm,
    yMm: current.yMm,
    zMm: current.zMm + 1,
    speedMmS: 100
  });
  const pickup = adapter.pickup('brick-red');
  assert.equal(pickup.ok, false);
  assert.equal(pickup.reason, 'operation_in_progress');
  await motion;
});

test('cube LUT parser accepts local 3D data and rejects unsupported production sizes', () => {
  const cube = [
    'TITLE "Identity 2"',
    'LUT_3D_SIZE 2',
    'DOMAIN_MIN 0 0 0',
    'DOMAIN_MAX 1 1 1',
    '0 0 0', '1 0 0', '0 1 0', '1 1 0',
    '0 0 1', '1 0 1', '0 1 1', '1 1 1'
  ].join('\n');
  const parsed = parseCubeLUT(cube, [2]);
  assert.equal(parsed.size, 2);
  assert.equal(parsed.data.length, 32);
  assert.throws(() => parseCubeLUT(cube), /not supported/);
});
