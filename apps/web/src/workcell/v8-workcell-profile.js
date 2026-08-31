import { BRICK_SPEC } from '../bricks/brick-spec.js';

export const V8_WORKSPACE = Object.freeze({
  xMinMm: 250,
  xMaxMm: 1050,
  yMinMm: -450,
  yMaxMm: 450,
  zMinMm: 10,
  zMaxMm: 600,
  safeClearanceZMm: 400
});

function rotate2(x, y, yawRad) {
  const cosine = Math.cos(yawRad);
  const sine = Math.sin(yawRad);
  return { x: cosine * x - sine * y, y: sine * x + cosine * y };
}

export function tablePointToMachine(point, settings) {
  const tableYaw = Number(settings.tableYawDeg ?? 0) * Math.PI / 180;
  const mountYaw = Number(settings.robotMountYawDeg ?? 0) * Math.PI / 180;
  const tablePoint = rotate2(point.xMm, point.yMm, tableYaw);
  const worldX = Number(settings.tableXmm ?? 0) + tablePoint.x;
  const worldY = Number(settings.tableYmm ?? 0) + tablePoint.y;
  const machine = rotate2(
    worldX - Number(settings.robotMountXmm ?? 0),
    worldY - Number(settings.robotMountYmm ?? 0),
    -mountYaw
  );
  return {
    xMm: machine.x,
    yMm: machine.y,
    zMm: Number(point.zMm ?? 0) - Number(settings.robotMountZmm ?? 0)
  };
}

export function machinePointToTable(point, settings) {
  const tableYaw = Number(settings.tableYawDeg ?? 0) * Math.PI / 180;
  const mountYaw = Number(settings.robotMountYawDeg ?? 0) * Math.PI / 180;
  const worldOffset = rotate2(point.xMm, point.yMm, mountYaw);
  const worldX = Number(settings.robotMountXmm ?? 0) + worldOffset.x;
  const worldY = Number(settings.robotMountYmm ?? 0) + worldOffset.y;
  const table = rotate2(
    worldX - Number(settings.tableXmm ?? 0),
    worldY - Number(settings.tableYmm ?? 0),
    -tableYaw
  );
  return {
    xMm: table.x,
    yMm: table.y,
    zMm: Number(point.zMm ?? 0) + Number(settings.robotMountZmm ?? 0)
  };
}

function transformedBounds(centre, widthMm, depthMm, settings) {
  const points = [];
  for (const x of [-widthMm / 2, widthMm / 2]) {
    for (const y of [-depthMm / 2, depthMm / 2]) {
      points.push(tablePointToMachine({ xMm: centre.xMm + x, yMm: centre.yMm + y, zMm: centre.zMm }, settings));
    }
  }
  return {
    minX: Math.min(...points.map((point) => point.xMm)),
    maxX: Math.max(...points.map((point) => point.xMm)),
    minY: Math.min(...points.map((point) => point.yMm)),
    maxY: Math.max(...points.map((point) => point.yMm))
  };
}

function insetBounds(bounds, marginMm) {
  return {
    minX: bounds.minX + marginMm,
    maxX: bounds.maxX - marginMm,
    minY: bounds.minY + marginMm,
    maxY: bounds.maxY - marginMm
  };
}

export function createV8WorkcellProfile(settings, workspace = V8_WORKSPACE) {
  const tableSurfaceZMm = Number(settings.tableTopHeightMm) - Number(settings.robotMountZmm);
  const tableBounds = transformedBounds(
    { xMm: 0, yMm: 0, zMm: Number(settings.tableTopHeightMm) },
    Number(settings.tableWidthMm),
    Number(settings.tableDepthMm),
    settings
  );
  const matBounds = transformedBounds(
    {
      xMm: Number(settings.matXmm),
      yMm: Number(settings.matYmm),
      zMm: Number(settings.tableTopHeightMm) + Number(settings.matThicknessMm ?? 2)
    },
    Number(settings.matWidthMm),
    Number(settings.matDepthMm),
    settings
  );
  const brickMargin = Math.max(BRICK_SPEC.lengthMm / 2 + 8, 24);
  const tableInterior = insetBounds(tableBounds, brickMargin);
  const supplyZone = {
    minX: Math.max(workspace.xMinMm + brickMargin, tableInterior.minX),
    maxX: Math.min(workspace.xMaxMm - brickMargin, tableInterior.maxX, matBounds.minX - brickMargin),
    minY: Math.max(workspace.yMinMm + brickMargin, tableInterior.minY),
    maxY: Math.min(workspace.yMaxMm - brickMargin, tableInterior.maxY)
  };
  const buildZone = {
    minX: Math.max(workspace.xMinMm + brickMargin, matBounds.minX + brickMargin),
    maxX: Math.min(workspace.xMaxMm - brickMargin, matBounds.maxX - brickMargin),
    minY: Math.max(workspace.yMinMm + brickMargin, matBounds.minY + brickMargin),
    maxY: Math.min(workspace.yMaxMm - brickMargin, matBounds.maxY - brickMargin)
  };
  const placementSurfaceZMm = tableSurfaceZMm
    + Number(settings.matThicknessMm ?? 2)
    + Number(settings.matStudHeightMm ?? 1.8);
  const tableOrigin = tablePointToMachine({ xMm: 0, yMm: 0, zMm: Number(settings.tableTopHeightMm) }, settings);
  const tableXPoint = tablePointToMachine({ xMm: 100, yMm: 0, zMm: Number(settings.tableTopHeightMm) }, settings);
  const tableYPoint = tablePointToMachine({ xMm: 0, yMm: 100, zMm: Number(settings.tableTopHeightMm) }, settings);
  const axis = (point) => {
    const x = point.xMm - tableOrigin.xMm;
    const y = point.yMm - tableOrigin.yMm;
    const length = Math.hypot(x, y) || 1;
    return Object.freeze([x / length, y / length, 0]);
  };
  const tableFrame = Object.freeze({
    origin: Object.freeze(tableOrigin),
    xAxis: axis(tableXPoint),
    yAxis: axis(tableYPoint),
    widthMm: Number(settings.tableWidthMm),
    depthMm: Number(settings.tableDepthMm)
  });
  const layout = {
    id: 'main-demo-v8-workcell-v1',
    tableZMm: tableSurfaceZMm,
    tableBounds,
    tray: null,
    board: null,
    obstacles: []
  };
  return Object.freeze({
    id: 'main-demo-v8-workcell-v1',
    coordinateFrame: 'machine-mm-rad',
    workspace: Object.freeze({ ...workspace }),
    layout: Object.freeze(layout),
    tableBounds: Object.freeze(tableBounds),
    tableFrame,
    matBounds: Object.freeze(matBounds),
    supplyZone: Object.freeze(supplyZone),
    buildZone: Object.freeze(buildZone),
    tableSurfaceZMm,
    placementSurfaceZMm,
    looseBrickCentreZMm: tableSurfaceZMm + BRICK_SPEC.bodyHeightMm / 2,
    pickupTcpOffsetMm: BRICK_SPEC.capture.tcpAboveCentreMm,
    safeClearanceZMm: workspace.safeClearanceZMm,
    recommendedTransferTcp: Object.freeze({
      xMm: Math.min(workspace.xMaxMm - 80, Math.max(workspace.xMinMm + 80, (supplyZone.maxX + buildZone.minX) / 2)),
      yMm: Math.max(workspace.yMinMm + 80, Math.min(workspace.yMaxMm - 80, (buildZone.minY + buildZone.maxY) / 2)),
      zMm: workspace.safeClearanceZMm
    })
  });
}

export function pointInsideZone(point, zone, marginMm = 0) {
  return point.xMm >= zone.minX + marginMm && point.xMm <= zone.maxX - marginMm
    && point.yMm >= zone.minY + marginMm && point.yMm <= zone.maxY - marginMm;
}
