import { BuildBoard } from '../bricks/build-board.js';

export class CoBuildGame {
  constructor(blueprint, options = {}) {
    this.mode = 'co-build';
    this.board = new BuildBoard(blueprint, { ...options, mode: this.mode });
    this.startedAtMs = null;
    this.endedAtMs = null;
    this.replans = 0;
    this.maxTcpSpeedMmS = options.maxTcpSpeedMmS ?? 500;
  }
  start(nowMs = 0) { if (this.startedAtMs === null) this.startedAtMs = nowMs; return this.getState(nowMs); }
  claimTarget(targetId, owner) { return this.board.claimTarget(targetId, owner); }
  releaseClaim(targetId, owner) { return this.board.releaseClaim(targetId, owner); }
  place(input) {
    const result = this.board.trySnapBrick(input);
    if (result.accepted && this.board.isComplete() && this.endedAtMs === null && Number.isFinite(input.nowMs)) this.endedAtMs = input.nowMs;
    return result;
  }
  remove(brickId, actor = null) { return this.board.removeBrick(brickId, actor); }
  reportReplan() { this.replans += 1; return this.replans; }
  getBuildState(filters = {}, runtime = {}) {
    const nowMs = Number.isFinite(runtime.nowMs) ? runtime.nowMs : (this.startedAtMs ?? 0);
    return {
      ...this.board.getBuildState(filters),
      mode: this.mode,
      replans: this.replans,
      timer: { startedAtMs: this.startedAtMs, endedAtMs: this.endedAtMs, elapsedMs: this.startedAtMs === null ? 0 : (this.endedAtMs ?? nowMs) - this.startedAtMs },
      maxTcpSpeedMmS: this.maxTcpSpeedMmS,
      heldBrickId: runtime.heldBrickId ?? null
    };
  }
  getState(nowMs = this.startedAtMs ?? 0) {
    return this.getBuildState({}, { nowMs });
  }
}
