// Transport/control only: the existing cycle runner remains the sole executor.
export function createPlacementStreamControl({ runner, coordinator, controller, canStart = () => true }) {
  let activeRun = null;
  let lastResult = null;
  runner.setCycleTime(2000);
  const getState = () => ({
    ok: true, running: runner.getState().running,
    ...coordinator.summary(), cycleTimeMs: runner.cycleTimeMs,
    lastResult: lastResult && { ok: lastResult.ok, reason: lastResult.reason ?? null, completedPlacements: lastResult.completedPlacements, overruns: lastResult.overruns },
    worldRevision: controller.worldRevision
  });
  async function stop() {
    runner.cancel('stream_stopped');
    if (activeRun) await activeRun;
    return getState();
  }
  async function execute(input = {}, { signal } = {}) {
    const fail = reason => ({ ok: false, reason, worldRevision: controller.worldRevision });
    if (signal?.aborted) return fail('cancelled');
    if (!Number.isSafeInteger(input.expectedWorldRevision) || input.expectedWorldRevision !== controller.worldRevision) return fail('stale_state');
    if (!['start', 'set_speed', 'stop'].includes(input.action)) return fail('invalid_input');
    if (input.cycleTimeMs !== undefined && (!Number.isInteger(input.cycleTimeMs) || input.cycleTimeMs <= 0 || input.cycleTimeMs > 10000)) return fail('invalid_input');
    if (input.maximumPlacements !== undefined && (!Number.isInteger(input.maximumPlacements) || input.maximumPlacements < 1 || input.maximumPlacements > 50)) return fail('invalid_input');
    if (input.action === 'stop') return stop();
    if (input.action === 'set_speed' && input.cycleTimeMs === undefined) return fail('invalid_input');
    if (input.action === 'start') {
      if (!canStart()) return fail('wrong_mode');
      if (runner.getState().running || controller.operationBlocked() || controller.operationState !== 'idle') return fail('operation_in_progress');
      const remaining = coordinator.summary().remainingPlacements;
      if (!remaining) return fail('proposal_required');
      if (remaining > (input.maximumPlacements ?? 50)) return fail('cycle_placement_limit');
      if (!coordinator.getState().queue.length) return fail('cycle_waiting');
    }
    const cycleTimeMs = Math.max(1000, input.cycleTimeMs ?? runner.cycleTimeMs);
    runner.setCycleTime(cycleTimeMs);
    if (input.action === 'start') {
      lastResult = null;
      activeRun = runner.run({ cycleTimeMs, maximumPlacements: input.maximumPlacements ?? 50,
        timingMode: controller.board?.blueprintId === 'simple-bricks' ? 'simple-smooth' : 'cadence', signal });
      activeRun.then(result => { lastResult = result; });
    }
    return { ...getState(), accepted: input.action, minimumCycleTimeMs: 1000 };
  }
  const tool = {
    name: 'control_placement_stream',
    description: 'Start/stop the already-planned generic placement stream, or change subsequent cycle cadence without replanning. Starts asynchronously; poll get_placement_stream_status. Default 2000ms, hard minimum 1000ms. 50% faster means current ms / 1.5, rounded and clamped to 1000. Robot collision/revision rules are unchanged.',
    inputSchema: { type: 'object', properties: {
      action: { type: 'string', enum: ['start', 'set_speed', 'stop'] },
      cycleTimeMs: { type: 'integer', minimum: 1, maximum: 10000, description: 'Values below 1000 are clamped to the 1000ms minimum.' },
      maximumPlacements: { type: 'integer', minimum: 1, maximum: 50, default: 50 },
      expectedWorldRevision: { type: 'integer', minimum: 0 }
    }, required: ['action', 'expectedWorldRevision'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false }, execute
  };
  return Object.freeze({ getState, stop, tool });
}
