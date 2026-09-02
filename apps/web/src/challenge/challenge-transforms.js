const EPS = 1e-9;

export const MAIN_DEMO_MACHINE_FRAME = Object.freeze({
  id: 'machine-mm-rad',
  distanceUnit: 'mm',
  horizontalAxes: Object.freeze(['+X', '+Y']),
  worldUpAxis: '+Z',
  bridgeLocalAxes: Object.freeze({ x: 'ENTRY_TO_EXIT', y: 'VERTICAL', z: 'BRIDGE_WIDTH' })
});

export const MAIN_DEMO_DISPLAY_FRAME = Object.freeze({
  id: 'main-demo-v8-world-mm',
  distanceUnit: 'mm',
  horizontalAxes: Object.freeze(['+X', '+Y']),
  worldUpAxis: '+Z'
});

// Current canonical MAIN_DEMO V8 mount from player-settings.js fallback values.
// Display point = machine-root transform * machine point.
export const MAIN_DEMO_MACHINE_MOUNT = Object.freeze({
  position: Object.freeze({ x: -820, y: 170, z: 1200 }),
  yawRad: 0,
  yawDeg: 0
});

// Backward-friendly alias for consumers that only need the canonical gameplay frame.
export const MAIN_DEMO_FRAME = MAIN_DEMO_MACHINE_FRAME;

export function normalizeMachineMount(input = MAIN_DEMO_MACHINE_MOUNT) {
  const position = input?.position ?? {};
  const numbers = [position.x, position.y, position.z];
  if (!numbers.every(Number.isFinite)) throw new Error('invalid_machine_mount_position');
  const yawRad = Number.isFinite(input?.yawRad)
    ? input.yawRad
    : Number.isFinite(input?.yawDeg) ? input.yawDeg * Math.PI / 180 : 0;
  if (!Number.isFinite(yawRad)) throw new Error('invalid_machine_mount_yaw');
  return Object.freeze({
    position: Object.freeze({ x: position.x, y: position.y, z: position.z }),
    yawRad,
    yawDeg: yawRad * 180 / Math.PI
  });
}

export const TERRAIN_SOURCE_BOUNDS = Object.freeze({
  min: Object.freeze({ x: -0.8850480914115906, y: 0.06293711066246033, z: -0.6644023060798645 }),
  max: Object.freeze({ x: 0.9276410341262817, y: 0.7327085733413696, z: 0.6400726437568665 })
});

export const ASSET_TO_WORLD_QUATERNION = Object.freeze({ x: 0.5, y: 0.5, z: 0.5, w: 0.5 });

export function deepClone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function vec(x = 0, y = 0, z = 0) { return { x, y, z }; }
export function add(a, b) { return vec(a.x + b.x, a.y + b.y, a.z + b.z); }
export function sub(a, b) { return vec(a.x - b.x, a.y - b.y, a.z - b.z); }
export function mul(a, scalar) { return vec(a.x * scalar, a.y * scalar, a.z * scalar); }
export function length(a) { return Math.hypot(a.x, a.y, a.z); }
export function normalize(a) {
  const value = length(a);
  if (value < EPS) throw new Error('zero_length_vector');
  return mul(a, 1 / value);
}

function rotateXY(point, yawRad) {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  return { x: c * point.x - s * point.y, y: s * point.x + c * point.y, z: point.z };
}

export function machineToDisplay(point, mount = MAIN_DEMO_MACHINE_MOUNT) {
  mount = normalizeMachineMount(mount);
  const rotated = rotateXY(point, mount.yawRad);
  return {
    x: mount.position.x + rotated.x,
    y: mount.position.y + rotated.y,
    z: mount.position.z + rotated.z
  };
}

export function displayToMachine(point, mount = MAIN_DEMO_MACHINE_MOUNT) {
  mount = normalizeMachineMount(mount);
  const relative = {
    x: point.x - mount.position.x,
    y: point.y - mount.position.y,
    z: point.z - mount.position.z
  };
  return rotateXY(relative, -mount.yawRad);
}

export function displayBoundsToMachine(bounds, mount = MAIN_DEMO_MACHINE_MOUNT) {
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    corners.push(displayToMachine({ x, y, z }, mount));
  }
  return Object.freeze({
    min: Object.freeze({
      x: Math.min(...corners.map((p) => p.x)),
      y: Math.min(...corners.map((p) => p.y)),
      z: Math.min(...corners.map((p) => p.z))
    }),
    max: Object.freeze({
      x: Math.max(...corners.map((p) => p.x)),
      y: Math.max(...corners.map((p) => p.y)),
      z: Math.max(...corners.map((p) => p.z))
    })
  });
}

// Source GLB: X = crossing, Y = up, Z = width. MAIN_DEMO display: X/Y = horizontal, Z = up.
// The fixed proper rotation maps source X -> display +Y, source Y -> display +Z, source Z -> display +X.
export function sourceToDisplay(source, terrainTransform) {
  const s = terrainTransform.scale;
  const p = terrainTransform.position;
  return {
    x: p.x + source.z * s.z,
    y: p.y + source.x * s.x,
    z: p.z + source.y * s.y
  };
}

export const sourceToWorld = sourceToDisplay;

export function makeTerrainTransform({ horizontalScale, verticalScale, worldX, worldY, tableTopZ }) {
  return Object.freeze({
    coordinateFrame: MAIN_DEMO_DISPLAY_FRAME.id,
    position: Object.freeze({
      x: worldX,
      y: worldY,
      z: tableTopZ - TERRAIN_SOURCE_BOUNDS.min.y * verticalScale
    }),
    quaternion: ASSET_TO_WORLD_QUATERNION,
    scale: Object.freeze({ x: horizontalScale, y: verticalScale, z: horizontalScale }),
    sourceUnit: 'm',
    worldUnit: 'mm'
  });
}

export function transformedTerrainBounds(transform) {
  const min = TERRAIN_SOURCE_BOUNDS.min;
  const max = TERRAIN_SOURCE_BOUNDS.max;
  return Object.freeze({
    min: Object.freeze({
      x: transform.position.x + min.z * transform.scale.z,
      y: transform.position.y + min.x * transform.scale.x,
      z: transform.position.z + min.y * transform.scale.y
    }),
    max: Object.freeze({
      x: transform.position.x + max.z * transform.scale.z,
      y: transform.position.y + max.x * transform.scale.x,
      z: transform.position.z + max.y * transform.scale.y
    })
  });
}

export function bridgeBasis(entry, exit) {
  const xAxis = normalize(sub(exit, entry));
  const yAxis = Object.freeze(vec(0, 0, 1));
  // Match ORACLE_BRIDGE_CORE_MAIN_DEMO_V1: local +Z width follows its yaw mapping.
  const zAxis = normalize(vec(-xAxis.y, xAxis.x, 0));
  return Object.freeze({ xAxis: Object.freeze(xAxis), yAxis, zAxis: Object.freeze(zAxis) });
}

// Display-only transform used by the standalone viewer/debug geometry.
export function makeDisplayBridgeTransform(entryDisplay, exitDisplay) {
  const basis = bridgeBasis(entryDisplay, exitDisplay);
  const origin = Object.freeze({ ...entryDisplay });
  return Object.freeze({
    coordinateFrame: MAIN_DEMO_DISPLAY_FRAME.id,
    origin,
    ...basis,
    matrix4ColumnMajor: Object.freeze([
      basis.xAxis.x, basis.xAxis.y, basis.xAxis.z, 0,
      basis.yAxis.x, basis.yAxis.y, basis.yAxis.z, 0,
      basis.zAxis.x, basis.zAxis.y, basis.zAxis.z, 0,
      origin.x, origin.y, origin.z, 1
    ])
  });
}

export const makeBridgeTransform = makeDisplayBridgeTransform;

// Direct contract for ORACLE_BRIDGE_CORE_MAIN_DEMO_V1 world-transform.js.
// Local anchors are centred on X. Local Y is height above the machine/table origin.
export function makeBridgeCoreTransform(entryMachine, exitMachine) {
  const dx = exitMachine.x - entryMachine.x;
  const dy = exitMachine.y - entryMachine.y;
  const span = Math.hypot(dx, dy);
  if (span < EPS) throw new Error('zero_length_bridge_span');
  if (Math.abs(entryMachine.z - exitMachine.z) > 1e-7) throw new Error('bridge_endpoints_must_share_height');
  const yawRad = Math.atan2(dy, dx);
  const centre = {
    x: (entryMachine.x + exitMachine.x) / 2,
    y: (entryMachine.y + exitMachine.y) / 2
  };
  const roadY = entryMachine.z;
  return Object.freeze({
    id: 'bridge-local-to-main-demo',
    translationMm: Object.freeze({ xMm: centre.x, yMm: centre.y, zMm: 0 }),
    yawRad,
    yawDeg: yawRad * 180 / Math.PI,
    scale: 1,
    sourceFrame: 'v46-bridge-local-x-span-y-up-z-width',
    targetFrame: 'main-demo-machine-x-y-horizontal-z-up',
    localEntry: Object.freeze({ x: -span / 2, y: roadY, z: 0 }),
    localExit: Object.freeze({ x: span / 2, y: roadY, z: 0 }),
    spanMm: span,
    roadYmm: roadY
  });
}

// Matches the bridge-core Oracle's existing world-transform.js mapping exactly.
export function bridgeCoreLocalToMachine(point, transform) {
  const c = Math.cos(transform.yawRad);
  const s = Math.sin(transform.yawRad);
  return {
    x: transform.translationMm.xMm + transform.scale * (c * point.x - s * point.z),
    y: transform.translationMm.yMm + transform.scale * (s * point.x + c * point.z),
    z: transform.translationMm.zMm + transform.scale * point.y
  };
}

export function localToWorld(point, transform) {
  const { origin, xAxis, yAxis, zAxis } = transform;
  return {
    x: origin.x + point.x * xAxis.x + point.y * yAxis.x + point.z * zAxis.x,
    y: origin.y + point.x * xAxis.y + point.y * yAxis.y + point.z * zAxis.y,
    z: origin.z + point.x * xAxis.z + point.y * yAxis.z + point.z * zAxis.z
  };
}
