import {
  MAIN_DEMO_DISPLAY_FRAME,
  MAIN_DEMO_MACHINE_FRAME,
  MAIN_DEMO_MACHINE_MOUNT,
  displayBoundsToMachine,
  displayToMachine,
  makeBridgeCoreTransform,
  makeDisplayBridgeTransform,
  makeTerrainTransform,
  normalizeMachineMount,
  sourceToDisplay,
  transformedTerrainBounds
} from './challenge-transforms.js';
import { createCollisionProxy } from './collision-proxy.js';

export const TERRAIN_ASSET = Object.freeze({
  repoPath: 'Scene_and_3D_Files/Terrain_Optimised_10k.glb',
  packagePath: 'assets/Terrain_Optimised_10k.glb',
  sha256: '66bd021d4d8f226a563a219b718776ad8be5f9cdb0110d2d2808c1d4288daaf6',
  bytes: 13083308,
  triangles: 9703,
  vertices: 6945,
  meshCount: 1,
  materialCount: 1
});

const COMMON = Object.freeze({
  horizontalScale: 360,
  displayX: 72,
  displayY: 30,
  tableTopDisplayZ: 1200,
  corridorSourceZ: -0.2
});

const RAW = Object.freeze({
  EASY: Object.freeze({
    id: 'EASY',
    familyHint: 'AQUEDUCT',
    verticalRatio: 0.40,
    entrySourceX: -0.30,
    exitSourceX: 0.46,
    deckDisplayZ: 1252,
    corridorWidthMm: 160,
    protectedHalfWidthMm: 94,
    camera: Object.freeze({ position: Object.freeze({ x: 840, y: -980, z: 1720 }), target: Object.freeze({ x: 5, y: 70, z: 1242 }), fov: 45 })
  }),
  CHALLENGING: Object.freeze({
    id: 'CHALLENGING',
    familyHint: 'VIADUCT',
    verticalRatio: 1.00,
    entrySourceX: -0.42,
    exitSourceX: 0.56,
    deckDisplayZ: 1387,
    corridorWidthMm: 180,
    protectedHalfWidthMm: 104,
    camera: Object.freeze({ position: Object.freeze({ x: 980, y: -1120, z: 1840 }), target: Object.freeze({ x: 8, y: 60, z: 1315 }), fov: 46 })
  })
});

export const CHALLENGE_CAMERA_RECOMMENDATIONS = Object.freeze({
  initial: RAW.EASY.camera,
  EASY: RAW.EASY.camera,
  CHALLENGING: RAW.CHALLENGING.camera
});

function normalizeDisplayOffset(input = {}) {
  const offset = {
    x: Number(input.x ?? 0),
    y: Number(input.y ?? 0),
    z: Number(input.z ?? 0)
  };
  if (!Object.values(offset).every(Number.isFinite)) throw new Error('invalid_display_offset');
  return Object.freeze(offset);
}

function offsetPoint(point, offset) {
  return Object.freeze({ x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z });
}

function endpoint(machinePosition, displayPosition, forward, widthMm) {
  return Object.freeze({
    coordinateFrame: MAIN_DEMO_MACHINE_FRAME.id,
    position: Object.freeze(machinePosition),
    displayPosition: Object.freeze(displayPosition),
    orientation: Object.freeze({ forward: Object.freeze(forward), up: Object.freeze({ x: 0, y: 0, z: 1 }), yawRad: Math.atan2(forward.y, forward.x) }),
    size: Object.freeze({ lengthMm: 32, widthMm, heightMm: 44 }),
    innerFace: Object.freeze({ position: Object.freeze({ ...machinePosition }), normal: Object.freeze({ ...forward }) })
  });
}

function makeSegments(start, end) {
  return Object.freeze([
    Object.freeze({ id: 'bridge-crossing', start: Object.freeze({ ...start }), end: Object.freeze({ ...end }), supportedBy: 'BuildBoard-derived support map' })
  ]);
}

export function buildPreset(id, { machineMount = MAIN_DEMO_MACHINE_MOUNT, displayOffset = {} } = {}) {
  machineMount = normalizeMachineMount(machineMount);
  displayOffset = normalizeDisplayOffset(displayOffset);
  const raw = RAW[id];
  if (!raw) throw new Error(`unknown_preset:${id}`);
  const verticalScale = COMMON.horizontalScale * raw.verticalRatio;
  const terrainTransform = makeTerrainTransform({
    horizontalScale: COMMON.horizontalScale,
    verticalScale,
    worldX: COMMON.displayX + displayOffset.x,
    worldY: COMMON.displayY + displayOffset.y,
    tableTopZ: COMMON.tableTopDisplayZ + displayOffset.z
  });
  const terrainBoundsDisplay = transformedTerrainBounds(terrainTransform);
  const terrainBoundsMachine = displayBoundsToMachine(terrainBoundsDisplay, machineMount);
  const entryDisplay = sourceToDisplay({ x: raw.entrySourceX, y: 0, z: COMMON.corridorSourceZ }, terrainTransform);
  const exitDisplay = sourceToDisplay({ x: raw.exitSourceX, y: 0, z: COMMON.corridorSourceZ }, terrainTransform);
  entryDisplay.z = raw.deckDisplayZ + displayOffset.z;
  exitDisplay.z = raw.deckDisplayZ + displayOffset.z;
  const entryMachine = displayToMachine(entryDisplay, machineMount);
  const exitMachine = displayToMachine(exitDisplay, machineMount);
  const routeDirection = Object.freeze({ x: 0, y: 1, z: 0 });
  const entry = endpoint(entryMachine, entryDisplay, routeDirection, raw.corridorWidthMm);
  const exit = endpoint(exitMachine, exitDisplay, { x: 0, y: -1, z: 0 }, raw.corridorWidthMm);
  const routeLength = Math.hypot(exitMachine.x - entryMachine.x, exitMachine.y - entryMachine.y);
  const bridgeTransform = makeBridgeCoreTransform(entryMachine, exitMachine);
  const displayBridgeTransform = makeDisplayBridgeTransform(entryDisplay, exitDisplay);
  const bridgeCorridor = Object.freeze({
    coordinateFrame: MAIN_DEMO_MACHINE_FRAME.id,
    centre: Object.freeze({ x: (entryMachine.x + exitMachine.x) / 2, y: (entryMachine.y + exitMachine.y) / 2, z: entryMachine.z }),
    displayCentre: Object.freeze({ x: (entryDisplay.x + exitDisplay.x) / 2, y: (entryDisplay.y + exitDisplay.y) / 2, z: raw.deckDisplayZ + displayOffset.z }),
    direction: routeDirection,
    lengthMm: routeLength,
    widthMm: raw.corridorWidthMm,
    deckZMm: entryMachine.z,
    displayDeckZMm: raw.deckDisplayZ + displayOffset.z,
    minZMm: 0,
    maxZMm: entryMachine.z + 160
  });
  const trackRoute = Object.freeze({
    coordinateFrame: MAIN_DEMO_MACHINE_FRAME.id,
    start: Object.freeze({ ...entryMachine }),
    end: Object.freeze({ ...exitMachine }),
    displayStart: Object.freeze({ ...entryDisplay }),
    displayEnd: Object.freeze({ ...exitDisplay }),
    direction: routeDirection,
    lengthMm: routeLength,
    deckZMm: entryMachine.z,
    displayDeckZMm: raw.deckDisplayZ + displayOffset.z,
    segments: makeSegments(entryMachine, exitMachine)
  });
  const collisionProxy = createCollisionProxy({
    terrainBoundsDisplay,
    entryDisplay,
    exitDisplay,
    tableTopZ: COMMON.tableTopDisplayZ + displayOffset.z,
    deckDisplayZ: raw.deckDisplayZ + displayOffset.z,
    protectedHalfWidthMm: raw.protectedHalfWidthMm,
    machineMount
  });
  const bridgeMachineBounds = Object.freeze({
    min: Object.freeze({ x: bridgeCorridor.centre.x - raw.corridorWidthMm / 2, y: entryMachine.y, z: 0 }),
    max: Object.freeze({ x: bridgeCorridor.centre.x + raw.corridorWidthMm / 2, y: exitMachine.y, z: entryMachine.z + 160 })
  });
  return Object.freeze({
    schemaVersion: 'robo-bridge.challenge.v1',
    presetId: id,
    familyHint: raw.familyHint,
    coordinateFrame: MAIN_DEMO_MACHINE_FRAME,
    displayFrame: MAIN_DEMO_DISPLAY_FRAME,
    machineMount,
    terrainAsset: TERRAIN_ASSET,
    terrainTransform,
    entry,
    exit,
    bridgeCorridor,
    trackRoute,
    bridgeTransform,
    displayBridgeTransform,
    bridgeChallengeInput: Object.freeze({
      id: `terrain-${id.toLowerCase()}`,
      entry: bridgeTransform.localEntry,
      exit: bridgeTransform.localExit,
      span: bridgeTransform.spanMm,
      roadY: bridgeTransform.roadYmm,
      worldTransform: bridgeTransform
    }),
    collisionProxy,
    bounds: Object.freeze({
      terrain: terrainBoundsMachine,
      terrainDisplay: terrainBoundsDisplay,
      bridge: bridgeMachineBounds,
      protectedBridgeCorridorDisplay: collisionProxy.protectedBridgeCorridor
    }),
    recommendedCamera: Object.freeze({
      position: offsetPoint(raw.camera.position, displayOffset),
      target: offsetPoint(raw.camera.target, displayOffset),
      fov: raw.camera.fov
    }),
    tuning: Object.freeze({
      horizontalScaleMmPerSourceMetre: COMMON.horizontalScale,
      verticalScaleRatio: raw.verticalRatio,
      verticalScaleMmPerSourceMetre: verticalScale,
      corridorSourceZ: COMMON.corridorSourceZ,
      tableTopDisplayZMm: COMMON.tableTopDisplayZ + displayOffset.z,
      displayOffset
    })
  });
}

export const CHALLENGE_PRESETS = Object.freeze({ EASY: buildPreset('EASY'), CHALLENGING: buildPreset('CHALLENGING') });
export const DEFAULT_PRESET_ID = 'EASY';
