import * as THREE from '../../vendor/three.module.min.js';
import { MAIN_DEMO_MACHINE_FRAME, MAIN_DEMO_DISPLAY_FRAME, MAIN_DEMO_MACHINE_MOUNT, normalizeMachineMount, machineToDisplay, displayBoundsToMachine } from './challenge-transforms.js';

export const TERRAIN7_WATER_DATUM_MM = -132.718;
export const TERRAIN7_MODEL_SCALE = 2;
export const TERRAIN7_ASSET = Object.freeze({
  repoPath: 'Scene_and_3D_Files/Terrain_7_Main.glb', packagePath: 'assets/terrain/Terrain_7_Main.glb',
  sha256: '419adc72b8fb408eea5060142890682fbcd03709b4cd4d292742286ba1518217', bytes: 31378000
});
export const TERRAIN7_OCCLUDERS = Object.freeze(['Terrain', 'Tunnel', 'Entry_Structure']);
export const TERRAIN7_AUTHORED = Object.freeze({
  entry: Object.freeze({ x: 0, y: 0, z: 0 }),
  exit: Object.freeze({ x: 370.0000047683716, y: 0, z: 0 }),
  bounds: Object.freeze({ min: { x: -386.583374, y: -439.004446, z: -288.883031 }, max: { x: 753.340354, y: 711.117441, z: 213.116915 } })
});

// Read actual glTF nodes before applying the display transform. glTF Y-up is
// converted back to Blender Z-up mm once: (x,y,z) -> (x,-z,y)*1000.
export function inspectTerrain7(root) {
  root.updateMatrixWorld(true);
  const anchor = name => {
    const node = root.getObjectByName(name);
    if (!node) throw new Error(`terrain_anchor_missing:${name}`);
    const p = node.getWorldPosition(new THREE.Vector3());
    return { x: p.x * 1000, y: -p.z * 1000, z: p.y * 1000 };
  };
  const bounds = new THREE.Box3();
  root.traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      bounds.expandByPoint(new THREE.Vector3(p.x * 1000, -p.z * 1000, p.y * 1000));
    }
  });
  const water = root.getObjectByName('Plane');
  let waterNormalMaps = 0;
  water?.traverse(object => { if (object.material?.normalMap) waterNormalMaps++; });
  if (!water || !waterNormalMaps) throw new Error('terrain_water_normal_map_missing');
  return { entry: anchor('ENTRY'), exit: anchor('EXIT'), bounds: { min: { ...bounds.min }, max: { ...bounds.max } }, waterNormalMaps };
}

export function buildTerrain7Preset(id, { machineMount = MAIN_DEMO_MACHINE_MOUNT, endpoints = null, buildElevationMm = 0, authored = TERRAIN7_AUTHORED } = {}) {
  if (id !== 'EASY') throw new Error(`unknown_preset:${id}`);
  machineMount = normalizeMachineMount(machineMount);
  const authoredSpan = Math.hypot(authored.exit.x - authored.entry.x, authored.exit.y - authored.entry.y);
  // Keep the existing across-table +X direction and centre. A 4mm water/table
  // clearance is explicit; authored datum/brick dimensions are never rescaled.
  const selected = endpoints ?? {
    entry: { x: 650 - authoredSpan / 2, y: -111.2, z: 4 - TERRAIN7_WATER_DATUM_MM },
    exit: { x: 650 + authoredSpan / 2, y: -111.2, z: 4 - TERRAIN7_WATER_DATUM_MM }
  };
  if (![selected.entry?.x, selected.entry?.y, selected.entry?.z, selected.exit?.x, selected.exit?.y, selected.exit?.z, buildElevationMm].every(Number.isFinite)) throw new Error('Endpoint XYZ values must be finite numbers.');
  if (Math.abs(selected.entry.z - selected.exit.z) > 1e-7) throw new Error('The Aqueduct requires level ENTRY and EXIT heights.');
  const entryPosition = { ...selected.entry, z: selected.entry.z + buildElevationMm };
  const exitPosition = { ...selected.exit, z: selected.exit.z + buildElevationMm };
  const span = Math.hypot(exitPosition.x - entryPosition.x, exitPosition.y - entryPosition.y);
  if (span < 32 || span > 2000) throw new Error('ENTRY to EXIT distance must be between 32 and 2000 mm.');
  const yawRad = Math.atan2(exitPosition.y - entryPosition.y, exitPosition.x - entryPosition.x);
  const authoredYaw = Math.atan2(authored.exit.y - authored.entry.y, authored.exit.x - authored.entry.x);
  const displayYaw = yawRad + machineMount.yawRad - authoredYaw;
  const entryDisplay = machineToDisplay(entryPosition, machineMount), exitDisplay = machineToDisplay(exitPosition, machineMount);
  const horizontalScale = span / authoredSpan;
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), displayYaw);
  const origin = new THREE.Vector3(entryDisplay.x, entryDisplay.y, entryDisplay.z).sub(
    new THREE.Vector3(authored.entry.x * horizontalScale, authored.entry.y * horizontalScale, authored.entry.z).applyQuaternion(rotation));
  const quaternion = rotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  const terrainTransform = { position: { ...origin }, quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
    scale: { x: 1000 * horizontalScale, y: 1000, z: 1000 * horizontalScale }, yawRad: displayYaw, yawDeg: displayYaw * 180 / Math.PI,
    sourceUnit: 'm', worldUnit: 'mm', coordinateFrame: MAIN_DEMO_DISPLAY_FRAME.id };
  const bounds = new THREE.Box3();
  for (const x of [authored.bounds.min.x, authored.bounds.max.x]) for (const y of [authored.bounds.min.y, authored.bounds.max.y]) for (const z of [authored.bounds.min.z, authored.bounds.max.z]) {
    bounds.expandByPoint(new THREE.Vector3(x * horizontalScale, y * horizontalScale, z).applyQuaternion(rotation).add(origin));
  }
  const terrainBoundsDisplay = { min: { ...bounds.min }, max: { ...bounds.max } };
  const direction = { x: Math.cos(yawRad), y: Math.sin(yawRad), z: 0 };
  const endpoint = (position, displayPosition, forward) => ({ position, displayPosition, coordinateFrame: MAIN_DEMO_MACHINE_FRAME.id,
    orientation: { forward, up: { x: 0, y: 0, z: 1 }, yawRad: Math.atan2(forward.y, forward.x) } });
  const entry = endpoint(entryPosition, entryDisplay, direction), exit = endpoint(exitPosition, exitDisplay, { x: -direction.x, y: -direction.y, z: 0 });
  // Compiler local Y=0 is the constant water datum. This is a coordinate
  // conversion, not a changed datum: authored -132.718 mm maps exactly to 0.
  const waterMachineZ = entryPosition.z + TERRAIN7_WATER_DATUM_MM;
  const roadY = -TERRAIN7_WATER_DATUM_MM / TERRAIN7_MODEL_SCALE;
  const worldTransform = { id: 'terrain7-bridge-to-machine', translationMm: { xMm: (entryPosition.x + exitPosition.x) / 2, yMm: (entryPosition.y + exitPosition.y) / 2, zMm: waterMachineZ },
    yawRad, scale: TERRAIN7_MODEL_SCALE, sourceFrame: 'v46-bridge-local-x-span-y-up-z-width', targetFrame: 'main-demo-machine-x-y-horizontal-z-up' };
  const bridgeChallengeInput = { id: 'terrain7-easy-aqueduct', entry: { x: -span / 4, y: roadY, z: 0 }, exit: { x: span / 4, y: roadY, z: 0 }, span: span / 2, roadY,
    worldTransform, supportProfile: { type: 'flat', heightY: 0, id: 'terrain7-water-datum' } };
  const trackRoute = { coordinateFrame: MAIN_DEMO_MACHINE_FRAME.id, start: entryPosition, end: exitPosition, displayStart: entryDisplay, displayEnd: exitDisplay,
    direction, lengthMm: span, deckZMm: entryPosition.z, displayDeckZMm: entryDisplay.z,
    segments: [{ id: 'bridge-crossing', start: entryPosition, end: exitPosition, supportedBy: 'BuildBoard-derived support map' }] };
  return {
    schemaVersion: 'robo-bridge.challenge.v1', presetId: 'EASY', familyHint: 'AQUEDUCT', coordinateFrame: MAIN_DEMO_MACHINE_FRAME, displayFrame: MAIN_DEMO_DISPLAY_FRAME,
    machineMount, terrainAsset: TERRAIN7_ASSET, terrainTransform, entry, exit, trackRoute, bridgeChallengeInput,
    bridgeTransform: { ...worldTransform, localEntry: { x: -span / 2, y: roadY * 2, z: 0 }, localExit: { x: span / 2, y: roadY * 2, z: 0 }, spanMm: span, roadYmm: roadY * 2 },
    bridgeCorridor: { centre: { x: worldTransform.translationMm.xMm, y: worldTransform.translationMm.yMm, z: entryPosition.z }, direction, lengthMm: span, widthMm: 160, deckZMm: entryPosition.z },
    // Terrain intersections are diagnostics per the final P0 contract, not
    // artificial bank AABBs that prohibit bridge foundations. Robot/table and
    // part collision authority remain unchanged; Human visibility uses meshes.
    collisionProxy: { coordinateFrame: MAIN_DEMO_DISPLAY_FRAME.id, proxies: [], machine: { coordinateFrame: MAIN_DEMO_MACHINE_FRAME.id, proxies: [], floorZMm: waterMachineZ } },
    bounds: { terrain: displayBoundsToMachine(terrainBoundsDisplay, machineMount), terrainDisplay: terrainBoundsDisplay },
    waterDatum: { authoredZMm: TERRAIN7_WATER_DATUM_MM, machineZMm: waterMachineZ, displayZMm: entryDisplay.z + TERRAIN7_WATER_DATUM_MM, objectName: 'Plane' },
    tuning: { buildElevationMm, endpoints: endpoints ? structuredClone(endpoints) : null, authored, challengeYawDeg: displayYaw * 180 / Math.PI }
  };
}
