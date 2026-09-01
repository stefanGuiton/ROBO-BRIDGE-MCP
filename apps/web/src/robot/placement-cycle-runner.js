export const MIN_PLACEMENT_CYCLE_MS = 250;
export const MAX_PLACEMENT_CYCLE_MS = 60_000;
export const DEFAULT_PLACEMENT_CYCLE_MS = 1_000;

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function waitWithSignal(durationMs, signal) {
  if (durationMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, durationMs);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Placement cycle cancelled', 'AbortError'));
    }
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

export class PlannedPlacementCycleRunner {
  constructor({ coordinator, controller, clock = nowMs, wait = waitWithSignal } = {}) {
    this.coordinator = coordinator;
    this.controller = controller;
    this.clock = clock;
    this.wait = wait;
    this.abortController = null;
    this.lastResult = null;
  }

  getState() {
    return {
      running: Boolean(this.abortController),
      lastResult: this.lastResult ? structuredClone(this.lastResult) : null
    };
  }

  cancel(reason = 'cycle_cancelled') {
    if (!this.abortController) return { ok: true, cancelled: false };
    this.abortController.abort(new DOMException(reason, 'AbortError'));
    return { ok: true, cancelled: true };
  }

  async run({ cycleTimeMs = null, physicalSpeedMmS = 650, maximumPlacements = 50, signal = null } = {}) {
    if (this.abortController) return { ok: false, reason: 'cycle_in_progress' };
    if (!this.coordinator || !this.controller) return { ok: false, reason: 'runtime_unavailable' };
    const initial = this.coordinator.getState();
    const requestedCycleMs = cycleTimeMs ?? initial.stream?.cycleTimeMs ?? DEFAULT_PLACEMENT_CYCLE_MS;
    if (!Number.isInteger(requestedCycleMs) || requestedCycleMs < MIN_PLACEMENT_CYCLE_MS || requestedCycleMs > MAX_PLACEMENT_CYCLE_MS) {
      return { ok: false, reason: 'invalid_cycle_time', minimumCycleTimeMs: MIN_PLACEMENT_CYCLE_MS, maximumCycleTimeMs: MAX_PLACEMENT_CYCLE_MS };
    }
    if (!Number.isInteger(maximumPlacements) || maximumPlacements < 1 || maximumPlacements > 50) {
      return { ok: false, reason: 'invalid_maximum_placements' };
    }
    if ((initial.stream?.remainingPlacements ?? 0) > maximumPlacements) {
      return { ok: false, reason: 'cycle_placement_limit', maximumPlacements, remainingPlacements: initial.stream.remainingPlacements };
    }

    const abortController = new AbortController();
    this.abortController = abortController;
    const forwardAbort = () => abortController.abort(signal.reason ?? new DOMException('Placement cycle cancelled', 'AbortError'));
    if (signal?.aborted) forwardAbort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });
    const results = [];
    const runStartedAt = this.clock();
    let overruns = 0;
    try {
      while (results.length < maximumPlacements) {
        if (abortController.signal.aborted) throw abortController.signal.reason;
        const state = this.coordinator.getState();
        if ((state.stream?.remainingPlacements ?? 0) === 0) break;
        const proposal = state.queue?.[0];
        if (!proposal) {
          return { ok: false, reason: 'cycle_waiting', cycleTimeMs: requestedCycleMs, results, state };
        }
        const worldRevision = this.controller.getState().worldRevision;
        if (proposal.expectedWorldRevision !== worldRevision) {
          return { ok: false, reason: 'stale_state', expectedWorldRevision: proposal.expectedWorldRevision, worldRevision, results };
        }
        const playbackMultiplier = 40;
        const startedAt = this.clock();
        const result = await this.coordinator.execute({
          proposalId: proposal.proposalId,
          physicalSpeedMmS,
          playbackMultiplier,
          signal: abortController.signal
        });
        const executionElapsedMs = this.clock() - startedAt;
        if (!result.ok) return { ...result, cycleTimeMs: requestedCycleMs, results };
        const remainingDelayMs = Math.max(0, requestedCycleMs - executionElapsedMs);
        if (remainingDelayMs > 0 && (result.remainingPlacements ?? 0) > 0) {
          await this.wait(remainingDelayMs, abortController.signal);
        } else if (executionElapsedMs > requestedCycleMs) overruns += 1;
        results.push({
          placementId: result.placementId,
          brickId: result.brickId,
          worldRevision: result.worldRevision,
          physicalDurationMs: result.physicalDurationMs,
          playbackDurationMs: result.playbackDurationMs,
          executionWallDurationMs: result.executionWallDurationMs,
          playbackMultiplier,
          cycleElapsedMs: this.clock() - startedAt
        });
      }
      const finalState = this.coordinator.getState();
      const completed = (finalState.stream?.remainingPlacements ?? 0) === 0;
      const cadenceSamples = results.slice(0, -1).map((entry) => entry.cycleElapsedMs);
      this.lastResult = {
        ok: completed,
        reason: completed ? null : 'cycle_placement_limit',
        streamId: finalState.stream?.streamId ?? null,
        cycleTimeMs: requestedCycleMs,
        completedPlacements: results.length,
        remainingPlacements: finalState.stream?.remainingPlacements ?? null,
        overruns,
        totalElapsedMs: this.clock() - runStartedAt,
        meanStartIntervalMs: cadenceSamples.length
          ? cadenceSamples.reduce((sum, value) => sum + value, 0) / cadenceSamples.length
          : null,
        maximumStartIntervalMs: cadenceSamples.length ? Math.max(...cadenceSamples) : null,
        results,
        worldRevision: finalState.worldRevision
      };
      return structuredClone(this.lastResult);
    } catch (error) {
      const cancelled = abortController.signal.aborted;
      this.lastResult = {
        ok: false,
        reason: cancelled ? 'cancelled' : 'internal_error',
        cycleTimeMs: requestedCycleMs,
        completedPlacements: results.length,
        results,
        worldRevision: this.controller.getState().worldRevision
      };
      return structuredClone(this.lastResult);
    } finally {
      signal?.removeEventListener('abort', forwardAbort);
      if (this.abortController === abortController) this.abortController = null;
    }
  }
}
