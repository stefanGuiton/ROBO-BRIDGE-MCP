import { BRICK_SPEC } from './brick-spec.js';

export class BoardAdapter {
  constructor(targets = []) {
    this.targets = new Map(targets.map((target) => [target.id, {
      ...structuredClone(target),
      placedBrickId: target.placedBrickId ?? null
    }]));
  }

  reset() {
    for (const target of this.targets.values()) target.placedBrickId = null;
  }

  getTargets() {
    return Array.from(this.targets.values(), (value) => structuredClone(value));
  }

  trySnapBrick({ brickId, colour, position, yawRad = 0 }) {
    let best = null;
    let occupiedMatch = null;
    for (const target of this.targets.values()) {
      if (target.colour && target.colour !== colour) continue;
      const dx = position.xMm - target.position.xMm;
      const dy = position.yMm - target.position.yMm;
      const dz = position.zMm - target.position.zMm;
      const distance = Math.hypot(dx, dy, dz);
      if (Math.abs(yawRad - (target.yawRad ?? BRICK_SPEC.canonicalYawRad)) > 0.02) continue;
      if (Math.hypot(dx, dy) > 7 || Math.abs(dz) > 10) continue;
      if (target.placedBrickId) {
        if (!occupiedMatch || distance < occupiedMatch.distance) occupiedMatch = { target, distance };
        continue;
      }
      if (!best || distance < best.distance) best = { target, distance };
    }
    if (!best && occupiedMatch) return { ok: false, reason: 'target_occupied', targetId: occupiedMatch.target.id };
    if (!best) return { ok: false, reason: 'no_snap_target' };
    best.target.placedBrickId = brickId;
    return {
      ok: true,
      targetId: best.target.id,
      transform: {
        position: { ...best.target.position },
        yawRad: best.target.yawRad ?? BRICK_SPEC.canonicalYawRad
      }
    };
  }
}
