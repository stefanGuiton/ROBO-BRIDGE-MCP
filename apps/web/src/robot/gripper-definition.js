import { clamp, wrapPi } from './math.js';

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
  animation: Object.freeze({
    closedFrame: 0,
    contactFrame: 11.800022006034851,
    openFrame: 23.025494813919067,
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

export function selectAutomaticYaw({ currentYawRad = 0, target, heldBrick = null, bricks = [], targets = [] }) {
  const candidates = heldBrick ? targets : bricks.filter((brick) => !brick.heldBy && !brick.snapped && !brick.placedTargetId);
  let nearest = null;
  for (const item of candidates) {
    const position = item.position;
    if (!position) continue;
    const xyMm = Math.hypot(target.xMm - position.xMm, target.yMm - position.yMm);
    if (xyMm > 45 || (nearest && xyMm >= nearest.xyMm)) continue;
    nearest = { xyMm, yawRad: Number(item.yawRad) || 0 };
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
  const { contactGapMm, openGapMm, animation } = UR10_GRIPPER;
  const u = clamp((gapMm - contactGapMm) / (openGapMm - contactGapMm), 0, 1);
  return animation.contactFrame + (animation.openFrame - animation.contactFrame) * u;
}
