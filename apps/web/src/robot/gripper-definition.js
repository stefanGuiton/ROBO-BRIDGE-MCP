import { frameForJawGap } from './gripper-jaw-calibration.js';
import { wrapPi } from './math.js';

// Calibrated from the verified Oracle package. The source GLB is modelled in
// metres, points along local -Z, and is mounted to the UR10 flange by Rx(pi).
export const UR10_GRIPPER = Object.freeze({
  id: 'oracle-real-gripper-v1',
  assetPath: '../../assets/models/Gripper.glb',
  sourceGlbSha256: 'e866760a7bd5ee91f4944d073b1d96db315786e51c540a0f97463f79ae62126e',
  sourcePackageSha256: '63d9616af1c6ae79e9ef4e27d9688df199476c4ced28ad41cd716eb607ec8431',
  uniformScale: 0.4,
  openGapMm: 46,
  contactGapMm: 16,
  calibratedBrickGapMm: 15.8,
  jawAnimationDurationMs: 450,
  maxYawSpeedRadS: Math.PI / 2,
  safeLateralZMm: 45,
  lowZxyLimitMm: 3,
  animation: Object.freeze({
    closedFrame: 0,
    contactFrame: 20.64870315395287,
    calibratedBrickFrame: 20.497117166503344,
    openFrame: 53.82619551169074,
    fullOpenFrame: 60
  }),
  gripperRootToTcpMm: Object.freeze({
    xMm: -0.4870334067230564 * 0.4,
    yMm: 0,
    zMm: -410.1105809169691 * 0.4
  }),
  flangeToTcpOffsetMm: Object.freeze({
    xMm: -0.4870334067230564 * 0.4,
    yMm: 0,
    zMm: 410.1105809169691 * 0.4
  }),
  calibration: Object.freeze({
    source: Object.freeze({ nodes: 89, meshes: 33, animations: 1, durationS: 2.5, frames: 60 }),
    axisMap: 'glTF +Y → tool -Z; glTF +Z → jaw +X; glTF +X → tool -Y',
    closed: Object.freeze({ frame: 0, padGapMm: -0.500774 }),
    legoContact: Object.freeze({ frame: 20.497117166503344, padGapMm: 15.8 }),
    workOpen: Object.freeze({ frame: 53.82619551169074, padGapMm: 46, lowestClawLocalZMm: -165.87072273053695 }),
    fullOpen: Object.freeze({ frame: 60, padGapMm: 47.4727196 }),
    workOpenTableClearanceMm: 10.673509636250714
  })
});

export function toolOrientationForYaw(yawRad, fixedDownOrientation) {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  const a = [c, -s, 0, s, c, 0, 0, 0, 1];
  const b = fixedDownOrientation;
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
  ];
}

export function shortestHalfTurnDelta(currentYawRad, targetYawRad) {
  let delta = wrapPi(targetYawRad - currentYawRad);
  if (delta > Math.PI / 2) delta -= Math.PI;
  if (delta < -Math.PI / 2) delta += Math.PI;
  return delta;
}

export function selectAutomaticYaw({ currentYawRad = 0, target, heldBrick = null, heldBrickYawInTcpRad = 0, bricks = [], targets = [] }) {
  const candidates = heldBrick ? targets : bricks.filter((brick) => !brick.heldBy && !brick.snapped && !brick.placedTargetId);
  let nearest = null;
  for (const item of candidates) {
    const position = item.position;
    if (!position) continue;
    const xyMm = Math.hypot(target.xMm - position.xMm, target.yMm - position.yMm);
    if (xyMm > 45 || (nearest && xyMm >= nearest.xyMm)) continue;
    const itemYawRad = Number(item.yawRad) || 0;
    nearest = {
      xyMm,
      // The real gripper closes along its local jaw axis. A loose 2x4 is
      // grasped across its short side; a held brick preserves the measured
      // brick-in-TCP transform when lining up with a target.
      yawRad: heldBrick ? itemYawRad - heldBrickYawInTcpRad : itemYawRad + Math.PI / 2
    };
  }
  if (!nearest) return wrapPi(currentYawRad);
  return wrapPi(currentYawRad + shortestHalfTurnDelta(currentYawRad, nearest.yawRad));
}

export function captureBrickInTcp(tcp, tcpYawRad, brickPosition) {
  const dx = brickPosition.xMm - tcp.xMm;
  const dy = brickPosition.yMm - tcp.yMm;
  const c = Math.cos(tcpYawRad);
  const s = Math.sin(tcpYawRad);
  return Object.freeze({
    xMm: c * dx + s * dy,
    yMm: -s * dx + c * dy,
    zMm: brickPosition.zMm - tcp.zMm
  });
}

export function heldBrickWorldPose(tcp, tcpYawRad, brickInTcp, brickYawInTcpRad = 0) {
  const c = Math.cos(tcpYawRad);
  const s = Math.sin(tcpYawRad);
  return {
    position: {
      xMm: tcp.xMm + c * brickInTcp.xMm - s * brickInTcp.yMm,
      yMm: tcp.yMm + s * brickInTcp.xMm + c * brickInTcp.yMm,
      zMm: tcp.zMm + brickInTcp.zMm
    },
    yawRad: wrapPi(tcpYawRad + brickYawInTcpRad)
  };
}

export function jawAnimationFrame(gapMm) {
  return frameForJawGap(gapMm);
}
