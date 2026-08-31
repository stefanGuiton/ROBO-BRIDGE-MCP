import { seededRng } from './math.js';
import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { validateCollision } from '../robot/collision.js';
import { toolOrientationForYaw } from '../robot/gripper-definition.js';
import { forwardKinematics, inverseKinematicsPose } from '../robot/kinematics.js';
import { UR10_DEFINITION } from '../robot/ur10-definition.js';
import { validateWorkspacePoint } from '../robot/workspace.js';

export const V8_BRICK_PALETTE = Object.freeze([
  Object.freeze({ colour: 'red', displayHex: 0xe64444 }),
  Object.freeze({ colour: 'blue', displayHex: 0x2477d4 }),
  Object.freeze({ colour: 'yellow', displayHex: 0xf4c842 }),
  Object.freeze({ colour: 'green', displayHex: 0x42a65a }),
  Object.freeze({ colour: 'orange', displayHex: 0xf28e2b }),
  Object.freeze({ colour: 'white', displayHex: 0xf4f6f8 }),
  Object.freeze({ colour: 'black', displayHex: 0x30353b }),
  Object.freeze({ colour: 'purple', displayHex: 0x9d61c9 }),
  Object.freeze({ colour: 'teal', displayHex: 0x37a8a2 })
]);

export function v8SupplyRegion(settings) {
  const left = -settings.tableWidthMm / 2 + 185;
  const matLeft = settings.matXmm - settings.matWidthMm / 2;
  const right = Math.max(left + 160, Math.min(matLeft - 55, -settings.tableWidthMm * 0.08));
  return {
    left,
    right,
    center: (left + right) / 2,
    width: Math.max(120, right - left),
    yMin: -settings.tableDepthMm / 2 + 80,
    yMax: settings.tableDepthMm / 2 - 80
  };
}

function makeRecord(id, paletteEntry, xMm, yMm, zMm, yawRad) {
  return {
    id,
    colour: paletteEntry.colour,
    displayHex: paletteEntry.displayHex,
    position: { xMm, yMm, zMm },
    yawRad,
    heldBy: null,
    ownership: null,
    placedTargetId: null,
    placementType: null,
    connection: null,
    snapped: false,
    graspable: true
  };
}

export function makeV8InitialSpawn(settings, { idPrefix = 'v8-brick', startIndex = 0 } = {}) {
  const rng = seededRng(settings.seed);
  const count = Math.max(6, Math.min(20, Math.round(settings.spawnCount)));
  const region = v8SupplyRegion(settings);
  const columns = Math.max(2, Math.floor(region.width / 48));
  const records = [];
  for (let index = 0; index < count; index += 1) {
    const palette = V8_BRICK_PALETTE[Math.floor(rng() * V8_BRICK_PALETTE.length)];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const xMm = Math.min(region.right - 20, region.left + 25 + column * 47 + (rng() - 0.5) * 4);
    const yMm = Math.min(region.yMax - 20, region.yMin + 28 + row * 44 + (rng() - 0.5) * 4);
    records.push(makeRecord(
      `${idPrefix}-${startIndex + index}`,
      palette,
      xMm,
      yMm,
      settings.tableTopHeightMm + settings.brickBodyHeightMm / 2,
      rng() * Math.PI * 2
    ));
  }
  return records;
}

export function makeV8MoreSpawn(settings, burst, { idPrefix = 'v8-brick', startIndex = 0, count = 10 } = {}) {
  const rng = seededRng((settings.seed ^ (burst * 0x9e3779b9)) >>> 0);
  const region = v8SupplyRegion(settings);
  const columns = 5;
  const total = Math.max(1, Math.round(count));
  const records = [];
  for (let index = 0; index < total; index += 1) {
    const palette = V8_BRICK_PALETTE[Math.floor(rng() * V8_BRICK_PALETTE.length)];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const xMm = Math.min(
      region.right - 15,
      region.left + 45 + column * Math.max(38, Math.min(54, (region.width - 80) / Math.max(1, columns - 1)))
    );
    const yMm = Math.min(region.yMax - 15, region.yMin + 70 + row * 58 + (rng() - 0.5) * 5);
    const zMm = settings.tableTopHeightMm + settings.brickBodyHeightMm / 2 + 65 + (index % 4) * 22;
    const record = makeRecord(`${idPrefix}-${startIndex + index}`, palette, xMm, yMm, zMm, rng() * Math.PI * 2);
    record.initialVelocityMps = [(rng() - 0.5) * 0.07, (rng() - 0.5) * 0.07, 0.015 + rng() * 0.035];
    record.initialAngularVelocityRadS = [(rng() - 0.5) * 1.8, (rng() - 0.5) * 1.8, (rng() - 0.5) * 3.5];
    records.push(record);
  }
  return records;
}

export function mapV8SpawnToMachine(records, settings) {
  const tableYaw = settings.tableYawDeg * Math.PI / 180;
  const machineYaw = settings.robotMountYawDeg * Math.PI / 180;
  const relativeYaw = tableYaw - machineYaw;
  const tableCosine = Math.cos(tableYaw);
  const tableSine = Math.sin(tableYaw);
  const machineCosine = Math.cos(-machineYaw);
  const machineSine = Math.sin(-machineYaw);
  const rotate = (x, y, cosine, sine) => ({ x: cosine * x - sine * y, y: sine * x + cosine * y });
  return records.map((source) => {
    const tablePoint = rotate(source.position.xMm, source.position.yMm, tableCosine, tableSine);
    const worldX = settings.tableXmm + tablePoint.x;
    const worldY = settings.tableYmm + tablePoint.y;
    const machinePoint = rotate(
      worldX - settings.robotMountXmm,
      worldY - settings.robotMountYmm,
      machineCosine,
      machineSine
    );
    const record = {
      ...structuredClone(source),
      position: {
        xMm: machinePoint.x,
        yMm: machinePoint.y,
        zMm: source.position.zMm - settings.robotMountZmm
      },
      yawRad: source.yawRad + relativeYaw
    };
    if (source.initialVelocityMps) {
      const velocity = rotate(source.initialVelocityMps[0], source.initialVelocityMps[1], Math.cos(relativeYaw), Math.sin(relativeYaw));
      record.initialVelocityMps = [velocity.x, velocity.y, source.initialVelocityMps[2]];
    }
    return record;
  });
}

function validatePickupSequence(record, accepted, profile) {
  const pickupTcp = {
    xMm: record.position.xMm,
    yMm: record.position.yMm,
    zMm: record.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm
  };
  const safeApproachTcp = { ...pickupTcp, zMm: profile.safeClearanceZMm };
  const waypoints = [safeApproachTcp];
  const descent = Math.max(1, Math.ceil((safeApproachTcp.zMm - pickupTcp.zMm) / 10));
  for (let index = 1; index <= descent; index += 1) {
    const t = index / descent;
    waypoints.push({
      xMm: pickupTcp.xMm,
      yMm: pickupTcp.yMm,
      zMm: safeApproachTcp.zMm + (pickupTcp.zMm - safeApproachTcp.zMm) * t
    });
  }
  const bricks = [...accepted, record];
  const toolYawRad = record.yawRad + Math.PI / 2;
  let priorJoints = Array.from(UR10_DEFINITION.homeJointsRad);
  let first = true;
  for (const point of waypoints) {
    const workspace = validateWorkspacePoint(point, profile.workspace);
    if (!workspace.ok) return { ok: false, reason: workspace.reason, point };
    const ik = inverseKinematicsPose({
      ...point,
      rotation: toolOrientationForYaw(toolYawRad, UR10_DEFINITION.fixedToolOrientation)
    }, priorJoints, UR10_DEFINITION, { maxBranchJumpRad: first ? 6.3 : 0.55 });
    first = false;
    if (!ik.ok) return { ok: false, reason: ik.reason, point };
    const fk = forwardKinematics(ik.jointsRad, UR10_DEFINITION);
    const collision = validateCollision({
      tcp: point,
      jointPositions: [...fk.jointPositions, fk.tcp],
      bricks,
      ignoreBrickIds: point.zMm > pickupTcp.zMm + 14 ? [record.id] : []
    }, profile.layout);
    if (!collision.ok) return { ok: false, reason: collision.reason, obstacle: collision.obstacle, point };
    priorJoints = ik.jointsRad;
  }
  return {
    ok: true,
    pickupTcp,
    safeApproachTcp,
    liftTcp: { ...safeApproachTcp },
    sampleCount: waypoints.length
  };
}

function colourForReachableIndex(index, rng) {
  const guaranteed = ['red', 'blue', 'red', 'blue'];
  const colour = guaranteed[index] ?? V8_BRICK_PALETTE[Math.floor(rng() * V8_BRICK_PALETTE.length)].colour;
  return V8_BRICK_PALETTE.find((entry) => entry.colour === colour);
}

export function makeReachableV8Spawn(settings, profile, {
  idPrefix = 'v8-brick',
  startIndex = 0,
  count: requestedCount = settings.spawnCount,
  occupied = [],
  seed = settings.seed
} = {}) {
  if (!profile?.supplyZone || !profile?.workspace || !profile?.layout) {
    return { ok: false, reason: 'invalid_workcell_profile', records: [], diagnostics: { rejected: [] } };
  }
  const rng = seededRng(seed);
  const count = Math.max(1, Math.min(20, Math.round(requestedCount)));
  const zone = profile.supplyZone;
  const spacingX = 48;
  const spacingY = 42;
  const columns = Math.max(1, Math.floor((zone.maxX - zone.minX) / spacingX));
  const rows = Math.max(1, Math.ceil(count / columns));
  const accepted = occupied.map((record) => structuredClone(record));
  const records = [];
  const rejected = [];
  const maximumAttempts = Math.max(count * 12, 96);
  const capacityRows = Math.max(1, Math.floor((zone.maxY - zone.minY - 40) / spacingY) + 1);
  const capacity = Math.max(1, columns * capacityRows);
  for (let attempt = 0; attempt < maximumAttempts && records.length < count; attempt += 1) {
    const index = records.length;
    const slot = (attempt + occupied.length) % capacity;
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const xMm = zone.minX + 24 + column * spacingX + (rng() - 0.5) * 3;
    const yMm = zone.minY + 24 + row * spacingY + (rng() - 0.5) * 3;
    if (xMm > zone.maxX - 20 || yMm > zone.maxY - 20) continue;
    const palette = colourForReachableIndex(index, rng);
    const record = makeRecord(
      `${idPrefix}-${startIndex + index}`,
      palette,
      xMm,
      yMm,
      profile.looseBrickCentreZMm,
      Math.round(rng() * 2) * Math.PI / 2
    );
    if (accepted.some((other) => Math.hypot(other.position.xMm - xMm, other.position.yMm - yMm) < 38)) {
      rejected.push({ attempt, reason: 'spawn_overlap', xMm, yMm });
      continue;
    }
    const validation = validatePickupSequence(record, accepted, profile);
    if (!validation.ok) {
      rejected.push({ attempt, ...validation });
      continue;
    }
    record.reachability = {
      reachable: true,
      pickupTcp: validation.pickupTcp,
      safeApproachTcp: validation.safeApproachTcp,
      liftTcp: validation.liftTcp,
      validationSamples: validation.sampleCount,
      profileId: profile.id
    };
    accepted.push(record);
    records.push(record);
  }
  if (records.length !== count) {
    return {
      ok: false,
      reason: 'scene_generation_failed',
      records: [],
      diagnostics: { requestedCount: count, acceptedCount: records.length, attemptCount: maximumAttempts, rejected: rejected.slice(0, 30) }
    };
  }
  return {
    ok: true,
    records,
    diagnostics: {
      seed,
      requestedCount: count,
      acceptedCount: records.length,
      rejectedCount: rejected.length,
      guaranteedColours: { red: records.filter((brick) => brick.colour === 'red').length, blue: records.filter((brick) => brick.colour === 'blue').length },
      profileId: profile.id
    }
  };
}

export function makeReachableV8MoreSpawn(settings, profile, burst, occupied, {
  idPrefix = 'v8-brick',
  startIndex = occupied?.length ?? 0,
  count = 10
} = {}) {
  const result = makeReachableV8Spawn(settings, profile, {
    idPrefix,
    startIndex,
    count,
    occupied,
    seed: (settings.seed ^ (burst * 0x9e3779b9)) >>> 0
  });
  if (!result.ok) return result;
  for (let index = 0; index < result.records.length; index += 1) {
    const record = result.records[index];
    record.position.zMm += 65 + (index % 4) * 22;
    record.initialVelocityMps = [0, 0, 0.015 + (index % 3) * 0.008];
    record.initialAngularVelocityRadS = [0, 0, ((index % 5) - 2) * 0.35];
    record.reachability.pendingPhysicsSettle = true;
  }
  return result;
}
