import { BRICK_SPEC } from './brick-spec.js';

export function findLatchCandidate(tcp, bricks, heldBrickId = null) {
  if (heldBrickId) return { ok: false, reason: 'already_holding' };
  const candidates = bricks.filter((brick) => {
    if (!brick.graspable || brick.heldBy || brick.placedTargetId) return false;
    const xy = Math.hypot(tcp.xMm - brick.position.xMm, tcp.yMm - brick.position.yMm);
    const expectedTcpZ = brick.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm;
    return xy <= BRICK_SPEC.capture.xyToleranceMm &&
      Math.abs(tcp.zMm - expectedTcpZ) <= BRICK_SPEC.capture.zToleranceMm;
  });
  if (candidates.length !== 1) return { ok: false, reason: 'no_brick_in_capture', candidateCount: candidates.length };
  const brick = candidates[0];
  return {
    ok: true,
    brick,
    captureOffset: {
      xMm: brick.position.xMm - tcp.xMm,
      yMm: brick.position.yMm - tcp.yMm,
      zMm: brick.position.zMm - tcp.zMm
    }
  };
}
