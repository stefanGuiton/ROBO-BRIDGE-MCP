import { BuildBoard } from '../bricks/build-board.js';

// Race has two explicit physical-board states by design: one human board and one agent board.
// They are never aliases for the single Co-Build production board.
export class RaceGame {
  constructor(blueprint, options = {}) {
    this.mode = 'race';
    this.blueprint = blueprint;
    this.human = new BuildBoard(blueprint, { ...options, mode: 'race-human' });
    this.agent = new BuildBoard(blueprint, { ...options, mode: 'race-agent' });
    this.maxTcpSpeedMmS = options.maxTcpSpeedMmS ?? 500;
    this.startedAtMs = null;
    this.completionMs = { human: null, agent: null };
    this.invalidPlacements = { human: 0, agent: 0 };
  }
  start(nowMs = 0) { if (this.startedAtMs === null) this.startedAtMs = nowMs; return this.getState(nowMs); }
  place(side, input) {
    const board = side === 'human' ? this.human : side === 'agent' ? this.agent : null;
    if (!board) return { ok: false, accepted: false, reason: 'invalid_side' };
    const result = board.trySnapBrick(input);
    if (!result.ok) this.invalidPlacements[side] += 1;
    if (result.ok && board.isComplete() && this.completionMs[side] === null && Number.isFinite(input.nowMs)) this.completionMs[side] = input.nowMs;
    return result;
  }
  winner() {
    const h = this.completionMs.human, a = this.completionMs.agent;
    if (h === null && a === null) return null;
    if (h !== null && a === null) return 'human';
    if (a !== null && h === null) return 'agent';
    if (h < a) return 'human';
    if (a < h) return 'agent';
    if (this.invalidPlacements.human < this.invalidPlacements.agent) return 'human';
    if (this.invalidPlacements.agent < this.invalidPlacements.human) return 'agent';
    return 'tie';
  }
  getBuildState(filters = {}, runtime = {}) {
    const side = filters.side === 'human' ? 'human' : 'agent';
    const { side: _ignored, ...boardFilters } = filters;
    const board = side === 'human' ? this.human : this.agent;
    const nowMs = Number.isFinite(runtime.nowMs) ? runtime.nowMs : (this.startedAtMs ?? 0);
    return { ...board.getBuildState(boardFilters), mode: this.mode, side, startedAtMs: this.startedAtMs, elapsedMs: this.startedAtMs === null ? 0 : nowMs - this.startedAtMs, maxTcpSpeedMmS: this.maxTcpSpeedMmS, heldBrickId: runtime.heldBrickId ?? null, winner: this.winner() };
  }
  getState(nowMs = this.startedAtMs ?? 0) {
    return { mode: this.mode, blueprintId: this.blueprint.blueprintId, startedAtMs: this.startedAtMs, elapsedMs: this.startedAtMs === null ? 0 : nowMs - this.startedAtMs, maxTcpSpeedMmS: this.maxTcpSpeedMmS, human: this.human.getBuildState(), agent: this.agent.getBuildState(), completionMs: { ...this.completionMs }, invalidPlacements: { ...this.invalidPlacements }, winner: this.winner() };
  }
}
