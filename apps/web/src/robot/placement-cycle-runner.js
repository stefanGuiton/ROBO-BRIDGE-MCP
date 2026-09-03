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
    this.activeTimingMode = null;
    this.lastResult = null;
    this.cycleTimeMs = DEFAULT_PLACEMENT_CYCLE_MS;
  }

  getState() {
    return {
      running: Boolean(this.abortController),
      cycleTimeMs: this.cycleTimeMs,
      lastResult: this.lastResult ? structuredClone(this.lastResult) : null
    };
  }

  cancel(reason = 'cycle_cancelled') {
    if (!this.abortController) return { ok: true, cancelled: false };
    this.abortController.abort(new DOMException(reason, 'AbortError'));
    return { ok: true, cancelled: true };
  }

  setCycleTime(cycleTimeMs) {
    const minimum = this.activeTimingMode === 'simple-smooth' ? 1000 : MIN_PLACEMENT_CYCLE_MS;
    if (!Number.isInteger(cycleTimeMs) || cycleTimeMs < minimum || cycleTimeMs > MAX_PLACEMENT_CYCLE_MS) return { ok: false, reason: 'invalid_cycle_time' };
    this.cycleTimeMs = cycleTimeMs;
    return { ok: true, cycleTimeMs, applies: 'next_cycle' };
  }

  async run({ cycleTimeMs = null, physicalSpeedMmS = 650, maximumPlacements = 50, timingMode = 'cadence', signal = null } = {}) {
    if (this.abortController) return { ok: false, reason: 'cycle_in_progress' };
    if (!this.coordinator || !this.controller) return { ok: false, reason: 'runtime_unavailable' };
    const initial = this.coordinator.getState();
    if (!['cadence', 'simple-smooth'].includes(timingMode)) return { ok: false, reason: 'invalid_timing_mode' };
    const smooth = timingMode === 'simple-smooth';
    if (smooth && (this.controller.board?.blueprintId !== 'simple-bricks' || this.coordinator.travelPolicy)) {
      return { ok: false, reason: 'wrong_mode' };
    }
    const requestedCycleMs = cycleTimeMs ?? initial.stream?.cycleTimeMs ?? (smooth ? 2000 : DEFAULT_PLACEMENT_CYCLE_MS);
    const minimum = smooth ? 1000 : MIN_PLACEMENT_CYCLE_MS;
    if (!Number.isInteger(requestedCycleMs) || requestedCycleMs < minimum || requestedCycleMs > MAX_PLACEMENT_CYCLE_MS) {
      return { ok: false, reason: 'invalid_cycle_time', minimumCycleTimeMs: minimum, maximumCycleTimeMs: MAX_PLACEMENT_CYCLE_MS };
    }
    if (!Number.isInteger(maximumPlacements) || maximumPlacements < 1 || maximumPlacements > 50) {
      return { ok: false, reason: 'invalid_maximum_placements' };
    }
    if ((initial.stream?.remainingPlacements ?? 0) > maximumPlacements) {
      return { ok: false, reason: 'cycle_placement_limit', maximumPlacements, remainingPlacements: initial.stream.remainingPlacements };
    }

    const abortController = new AbortController();
    this.abortController = abortController;
    this.activeTimingMode = timingMode;
    this.cycleTimeMs = requestedCycleMs;
    const forwardAbort = () => abortController.abort(signal.reason ?? new DOMException('Placement cycle cancelled', 'AbortError'));
    if (signal?.aborted) forwardAbort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });
    const results = [];
    const runStartedAt = this.clock();
    let overruns = 0;
    let previousTiming = null;
    let observedOverheadMs = 0;
    const previousPlaybackMultiplier = smooth ? this.controller.getState().simulationPlaybackMultiplier : null;
    let ownedPlaybackMultiplier = null;
    let activeCycle = null;
    const fail = details => {
      const endedAt = this.clock();
      const elapsedMs = activeCycle ? endedAt - activeCycle.startedAt : 0;
      const failedCycle = activeCycle ? {
        placementId: activeCycle.placementId,
        proposalId: activeCycle.proposalId,
        completed: false,
        reason: details.reason ?? 'execution_failed',
        executionStarted: activeCycle.executionStartedAt !== null,
        cycleTimeMs: activeCycle.cycleTimeMs,
        timingMode,
        playbackMultiplier: activeCycle.playbackMultiplier,
        preparationElapsedMs: (activeCycle.executionStartedAt ?? endedAt) - activeCycle.startedAt,
        executionWallDurationMs: activeCycle.executionStartedAt === null ? 0 : endedAt - activeCycle.executionStartedAt,
        executionElapsedMs: elapsedMs,
        cycleElapsedMs: elapsedMs,
        overrunMs: Math.max(0, elapsedMs - activeCycle.cycleTimeMs),
        // A rejected/interrupted profile may provide no physical duration. Do
        // not substitute its estimate or completed-stage sum for actual motion.
        physicalDurationMs: details.physicalDurationMs ?? null,
        playbackDurationMs: details.playbackDurationMs ?? null
      } : null;
      this.lastResult = { cycleTimeMs: this.cycleTimeMs, timingMode,
        worldRevision: this.controller.getState().worldRevision, ...details,
        completedPlacements: results.length,
        attemptedPlacements: results.length + (failedCycle?.executionStarted ? 1 : 0),
        overruns: overruns + (failedCycle?.overrunMs > 0 ? 1 : 0),
        totalElapsedMs: endedAt - runStartedAt, results, failedCycle };
      return structuredClone(this.lastResult);
    };
    try {
      while (results.length < maximumPlacements) {
        if (abortController.signal.aborted) throw abortController.signal.reason;
        const state = this.coordinator.getState();
        if ((state.stream?.remainingPlacements ?? 0) === 0) break;
        const proposal = state.queue?.[0];
        if (!proposal) {
          return fail({ ok: false, reason: 'cycle_waiting', state });
        }
        const worldRevision = this.controller.getState().worldRevision;
        if (proposal.expectedWorldRevision !== worldRevision) {
          return fail({ ok: false, reason: 'stale_state', expectedWorldRevision: proposal.expectedWorldRevision, worldRevision });
        }
        const currentCycleMs = this.cycleTimeMs;
        const startedAt = this.clock();
        activeCycle = { startedAt, executionStartedAt: null, cycleTimeMs: currentCycleMs,
          placementId: proposal.placementId ?? null, proposalId: proposal.proposalId, playbackMultiplier: null };
        let timing = null;
        let playbackMultiplier = 40;
        if (smooth) {
          if (this.controller.board?.blueprintId !== 'simple-bricks' || this.coordinator.travelPolicy || proposal.travelPolicy) {
            return fail({ ok: false, reason: 'wrong_mode' });
          }
          timing = await this.coordinator.estimateCycleTiming({ proposal, physicalSpeedMmS, previous: previousTiming, signal: abortController.signal });
          if (!timing.ok) return fail(timing);
          if (!Number.isFinite(timing.physicalDurationMs) || timing.physicalDurationMs < 0) return fail({ ok: false, reason: 'timing_unavailable' });
          const motionBudgetMs = Math.max(1, currentCycleMs - (this.clock() - startedAt) - observedOverheadMs);
          playbackMultiplier = Math.max(1, Math.min(40, timing.physicalDurationMs / motionBudgetMs));
          // Timing planning yields; recheck the exact revision and queue head
          // before executing. Never silently run a replaced or stale proposal.
          if (abortController.signal.aborted) throw abortController.signal.reason;
          if (worldRevision !== this.controller.getState().worldRevision || proposal.proposalId !== this.coordinator.getState().queue?.[0]?.proposalId) {
            return fail({ ok: false, reason: 'stale_state' });
          }
        }
        const preparationElapsedMs = this.clock() - startedAt;
        activeCycle.executionStartedAt = this.clock();
        activeCycle.playbackMultiplier = playbackMultiplier;
        let result;
        try {
          result = await this.coordinator.execute({
            proposalId: proposal.proposalId,
            physicalSpeedMmS,
            playbackMultiplier,
            signal: abortController.signal
          });
        } finally {
          // execute can reject before applying this cycle's requested rate.
          // Retain ownership of the preceding applied rate until the new rate
          // is observed, including when execute throws after applying it.
          if (smooth && this.controller.getState().simulationPlaybackMultiplier === playbackMultiplier) {
            ownedPlaybackMultiplier = playbackMultiplier;
          }
        }
        const executionElapsedMs = this.clock() - startedAt;
        if (!result.ok) return fail(result);
        if (smooth) {
          previousTiming = { physicalSpeedMmS, stages: timing.stages.map(stage => ({ ...stage,
            durationMs: result.stages?.find(actual => actual.stage === stage.stage)?.durationMs ?? stage.durationMs })) };
          observedOverheadMs = Math.max(0, executionElapsedMs - preparationElapsedMs - result.playbackDurationMs);
          if (!Number.isFinite(observedOverheadMs)) observedOverheadMs = 0;
        }
        const remainingDelayMs = Math.max(0, currentCycleMs - executionElapsedMs);
        const overrunMs = Math.max(0, executionElapsedMs - currentCycleMs);
        if (overrunMs > 0) overruns += 1;
        const sample = {
          placementId: result.placementId,
          brickId: result.brickId,
          worldRevision: result.worldRevision,
          physicalDurationMs: result.physicalDurationMs,
          playbackDurationMs: result.playbackDurationMs,
          executionWallDurationMs: result.executionWallDurationMs,
          preparationElapsedMs,
          executionElapsedMs,
          estimatedPhysicalDurationMs: timing?.physicalDurationMs ?? null,
          timingMode,
          playbackMultiplier,
          cycleTimeMs: currentCycleMs,
          overrunMs,
          cycleElapsedMs: executionElapsedMs
        };
        // Record a completed placement before an abortable cadence wait.
        results.push(sample);
        activeCycle = null;
        if (remainingDelayMs > 0 && (result.remainingPlacements ?? 0) > 0) {
          try { await this.wait(remainingDelayMs, abortController.signal); }
          finally { sample.cycleElapsedMs = this.clock() - startedAt; }
        }
      }
      const finalState = this.coordinator.getState();
      const completed = (finalState.stream?.remainingPlacements ?? 0) === 0;
      const cadenceSamples = results.slice(0, -1).map((entry) => entry.cycleElapsedMs);
      this.lastResult = {
        ok: completed,
        reason: completed ? null : 'cycle_placement_limit',
        streamId: finalState.stream?.streamId ?? null,
        cycleTimeMs: this.cycleTimeMs,
        completedPlacements: results.length,
        attemptedPlacements: results.length,
        failedCycle: null,
        remainingPlacements: finalState.stream?.remainingPlacements ?? null,
        overruns,
        timingMode,
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
      return fail({ ok: false, reason: cancelled ? 'cancelled' : error?.code ?? 'internal_error' });
    } finally {
      signal?.removeEventListener('abort', forwardAbort);
      // Smooth playback is scoped to this run. Restore only our own rate, after
      // the compound motion has released its lease; never overwrite a later
      // external rate change or change legacy bridge playback semantics.
      if (smooth && ownedPlaybackMultiplier !== null && Number.isFinite(previousPlaybackMultiplier)) {
        const current = this.controller.getState();
        if (current.simulationPlaybackMultiplier === ownedPlaybackMultiplier && !current.moving
          && current.operationState === 'idle' && !this.controller.pendingMoveCount && !this.controller.operationBlocked()) {
          this.controller.setSimulationPlaybackMultiplier(previousPlaybackMultiplier);
        }
      }
      if (this.abortController === abortController) {
        this.abortController = null;
        this.activeTimingMode = null;
      }
    }
  }
}
