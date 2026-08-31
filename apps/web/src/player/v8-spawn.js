import { seededRng } from './math.js';

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
