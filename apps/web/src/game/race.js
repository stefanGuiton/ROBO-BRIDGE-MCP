import { BuildBoard } from '../bricks/build-board.js';

export class RaceGame {
  constructor(blueprint, options = {}) {
    this.mode = 'race';
    this.blueprint = blueprint;
    this.human = new BuildBoard(blueprint, { ...options, mode: 'race-human' });
    this.ai = new BuildBoard(blueprint, { ...options, mode: 'race-ai' });
    this.maxTcpSpeedMmS = options.maxTcpSpeedMmS ?? 500;
    this.startedAtMs = null;
    this.completionMs = { human: null, ai: null };
    this.invalidPlacements = { human: 0, ai: 0 };
  }
  start(nowMs = 0) {
    if (this.startedAtMs === null) this.startedAtMs = nowMs;
    return this.getState(nowMs);
  }
  place(side, input) {
    const board = side === 'human' ? this.human : side === 'ai' ? this.ai : null;
    if (!board) return { accepted: false, reason: 'invalid_side' };
    const result = board.trySnapBrick(input);
    if (!result.accepted || !result.correctness) this.invalidPlacements[side] += 1;
    if (result.accepted && board.isComplete() && this.completionMs[side] === null && Number.isFinite(input.nowMs)) this.completionMs[side] = input.nowMs;
    return result;
  }
  winner() {
    const h = this.completionMs.human;
    const a = this.completionMs.ai;
    if (h === null && a === null) return null;
    if (h !== null && a === null) return 'human';
    if (a !== null && h === null) return 'ai';
    if (h < a) return 'human';
    if (a < h) return 'ai';
    const hc = this.human.getBuildState().corrections;
    const ac = this.ai.getBuildState().corrections;
    if (hc < ac) return 'human';
    if (ac < hc) return 'ai';
    if (this.invalidPlacements.human < this.invalidPlacements.ai) return 'human';
    if (this.invalidPlacements.ai < this.invalidPlacements.human) return 'ai';
    return 'tie';
  }
  getBuildState(filters = {}, runtime = {}) {
    const side = filters.side === 'human' ? 'human' : 'ai';
    const { side: _ignored, ...boardFilters } = filters;
    const board = side === 'human' ? this.human : this.ai;
    const nowMs = Number.isFinite(runtime.nowMs) ? runtime.nowMs : (this.startedAtMs ?? 0);
    return {
      ...board.getBuildState(boardFilters),
      mode: this.mode,
      side,
      startedAtMs: this.startedAtMs,
      elapsedMs: this.startedAtMs === null ? 0 : nowMs - this.startedAtMs,
      maxTcpSpeedMmS: this.maxTcpSpeedMmS,
      heldBrickId: runtime.heldBrickId ?? null,
      winner: this.winner()
    };
  }
  getState(nowMs = this.startedAtMs ?? 0) {
    return {
      mode: this.mode,
      blueprintId: this.blueprint.blueprintId,
      startedAtMs: this.startedAtMs,
      elapsedMs: this.startedAtMs === null ? 0 : nowMs - this.startedAtMs,
      maxTcpSpeedMmS: this.maxTcpSpeedMmS,
      human: this.human.getBuildState(),
      ai: this.ai.getBuildState(),
      completionMs: { ...this.completionMs },
      invalidPlacements: { ...this.invalidPlacements },
      winner: this.winner()
    };
  }
}
