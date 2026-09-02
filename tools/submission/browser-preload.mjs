export const PRELOAD_SCRIPT = String.raw`
(() => {
  const state = {
    registrations: [],
    nativeTools: Object.create(null),
    duplicateRegistrations: [],
    ownerSignals: [],
    ownerSignalIds: new WeakMap(),
    nextOwnerSignalId: 1,
    unhandledRejections: [],
    windowErrors: [],
    listenerAdds: 0,
    listenerRemoves: 0,
    activeTimeouts: new Set(),
    activeIntervals: new Set()
  };

  const clone = (value) => {
    try { return structuredClone(value); }
    catch {
      try { return JSON.parse(JSON.stringify(value)); }
      catch { return null; }
    }
  };

  const ownerSignalId = (signal) => {
    if (!signal || (typeof signal !== 'object' && typeof signal !== 'function')) return null;
    if (!state.ownerSignalIds.has(signal)) state.ownerSignalIds.set(signal, state.nextOwnerSignalId++);
    return state.ownerSignalIds.get(signal);
  };

  const modelContext = Object.freeze({
    async registerTool(tool, options = {}) {
      const name = typeof tool?.name === 'string' ? tool.name : null;
      if (name && state.nativeTools[name]) state.duplicateRegistrations.push(name);
      if (name) state.nativeTools[name] = tool;
      const signalId = ownerSignalId(options.signal);
      if (signalId !== null) state.ownerSignals.push(signalId);
      state.registrations.push({
        name,
        description: typeof tool?.description === 'string' ? tool.description : null,
        inputSchema: clone(tool?.inputSchema),
        annotations: clone(tool?.annotations),
        executeType: typeof tool?.execute,
        ownerSignalId: signalId
      });
    }
  });

  try {
    Object.defineProperty(Document.prototype, 'modelContext', {
      configurable: true,
      get() { return modelContext; }
    });
  } catch {}
  try {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: modelContext });
  } catch {}

  const originalSetTimeout = window.setTimeout.bind(window);
  const originalClearTimeout = window.clearTimeout.bind(window);
  const originalSetInterval = window.setInterval.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);

  window.setTimeout = (callback, delay, ...args) => {
    let id;
    const wrapped = typeof callback === 'function'
      ? (...innerArgs) => {
          state.activeTimeouts.delete(id);
          return callback(...innerArgs);
        }
      : callback;
    id = originalSetTimeout(wrapped, delay, ...args);
    state.activeTimeouts.add(id);
    return id;
  };
  window.clearTimeout = (id) => {
    state.activeTimeouts.delete(id);
    return originalClearTimeout(id);
  };
  window.setInterval = (callback, delay, ...args) => {
    const id = originalSetInterval(callback, delay, ...args);
    state.activeIntervals.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    state.activeIntervals.delete(id);
    return originalClearInterval(id);
  };

  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function(...args) {
    state.listenerAdds += 1;
    return originalAdd.apply(this, args);
  };
  EventTarget.prototype.removeEventListener = function(...args) {
    state.listenerRemoves += 1;
    return originalRemove.apply(this, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    state.unhandledRejections.push(String(event.reason?.stack ?? event.reason?.message ?? event.reason ?? 'unknown rejection'));
  });
  window.addEventListener('error', (event) => {
    state.windowErrors.push({
      message: String(event.message ?? 'window error'),
      source: event.filename ?? null,
      line: event.lineno ?? null,
      column: event.colno ?? null
    });
  });

  const sceneObjectCount = () => {
    const runtime = window.__ROBO_BRIDGE__;
    const roots = [runtime?.renderer?.scene, runtime?.renderer?.machineRoot].filter(Boolean);
    let maximum = 0;
    for (const root of roots) {
      let count = 0;
      try { root.traverse(() => { count += 1; }); } catch {}
      maximum = Math.max(maximum, count);
    }
    return maximum;
  };

  const collectRuntimeValues = () => {
    const runtime = window.__ROBO_BRIDGE__ ?? {};
    const queue = [runtime, runtime?.runtime, runtime?.services, runtime?.runtime?.services];
    const values = [];
    const seen = new Set();
    while (queue.length && values.length < 250) {
      const value = queue.shift();
      if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) continue;
      seen.add(value);
      values.push(value);
      let children = [];
      try { children = Object.values(value); } catch {}
      for (const child of children.slice(0, 80)) {
        if (child && (typeof child === 'object' || typeof child === 'function')) queue.push(child);
      }
    }
    return values;
  };

  const hasService = (keys, constructors) => {
    const runtime = window.__ROBO_BRIDGE__ ?? {};
    for (const key of keys) {
      if (runtime?.[key] || runtime?.runtime?.[key] || runtime?.services?.[key] || runtime?.runtime?.services?.[key]) return true;
    }
    return collectRuntimeValues().some((value) => constructors.includes(value?.constructor?.name));
  };

  const provider = () => window.__ROBO_BRIDGE_SUBMISSION__
    || window.__ROBO_BRIDGE_SUBMISSION_ACCEPTANCE__
    || window.__ROBO_BRIDGE__?.submissionAcceptance
    || window.__ROBO_BRIDGE__?.runtime?.services?.submissionAcceptance
    || null;

  const serviceAvailability = () => ({
    challenge: hasService(['challengeService', 'challenge'], ['ChallengeService', 'TerrainChallengeService']),
    construction: hasService(['constructionService', 'construction'], ['ConstructionService']),
    train: hasService(['trainService', 'train'], ['TrainService']),
    mission: hasService(['missionService', 'mission'], ['MissionService']),
    provider: Boolean(provider())
  });

  const leakSnapshot = () => {
    const runtime = window.__ROBO_BRIDGE__;
    const robot = runtime?.getRobotState?.() ?? null;
    const fast = runtime?.fastPlacement?.getState?.() ?? null;
    const board = runtime?.board;
    const build = board?.getBuildState?.({ limit: 1000 }) ?? null;
    const progress = board?.progress?.() ?? null;
    return {
      listenerBalance: state.listenerAdds - state.listenerRemoves,
      listenerAdds: state.listenerAdds,
      listenerRemoves: state.listenerRemoves,
      activeTimeouts: state.activeTimeouts.size,
      activeIntervals: state.activeIntervals.size,
      registrationCount: state.registrations.length,
      duplicateRegistrations: [...state.duplicateRegistrations],
      sceneObjectCount: sceneObjectCount(),
      brickCount: runtime?.robotController?.getBricks?.().length ?? null,
      targetCount: board?.getTargets?.().length ?? progress?.totalTargets ?? null,
      claimCount: Array.isArray(build?.claims) ? build.claims.length : null,
      placementQueueLength: fast?.queue?.length ?? null,
      placementRemaining: fast?.stream?.remainingPlacements ?? null,
      robot: robot ? {
        moving: robot.moving,
        operationState: robot.operationState,
        heldBrickId: robot.heldBrickId,
        jawState: robot.gripper?.jawState ?? null,
        worldRevision: robot.worldRevision
      } : null,
      bridge: runtime?.bridgeHost?.getCompileState?.() ?? null,
      unhandledRejectionCount: state.unhandledRejections.length,
      windowErrorCount: state.windowErrors.length
    };
  };

  const parseToolResult = (raw) => {
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); }
    catch { return raw; }
  };

  const invoke = async (name, input = {}, options = {}) => {
    const tool = state.nativeTools[name];
    if (!tool) return { available: false, name };
    const abortController = new AbortController();
    if (options.aborted) abortController.abort('submission_gate_abort');
    try {
      const raw = await tool.execute(input, { signal: abortController.signal });
      return {
        available: true,
        rawType: typeof raw,
        rawText: typeof raw === 'string' ? raw : JSON.stringify(raw),
        parsed: parseToolResult(raw)
      };
    } catch (error) {
      return {
        available: true,
        threw: true,
        error: {
          name: error?.name ?? null,
          code: error?.code ?? null,
          message: error?.message ?? String(error)
        }
      };
    }
  };

  const methodCaseMap = Object.freeze({
    runConstructionAcceptance: 'construction_acceptance',
    runSourceReassignmentAcceptance: 'source_reassignment',
    runTrainFailureAcceptance: 'train_failure',
    runTrainSuccessAcceptance: 'train_success',
    runMissionAcceptance: 'mission_state_machine',
    runTerrainAcceptance: 'terrain_easy',
    runIntegratedResetAcceptance: 'reset_leak'
  });

  const callProvider = async (methodName, argument, timeoutMs = 120000) => {
    const target = provider();
    if (!target) return { available: false, reason: 'ACCEPTANCE_PROVIDER_NOT_PRESENT', methodName };
    let invoke = null;
    if (typeof target[methodName] === 'function') {
      invoke = () => target[methodName](argument);
    } else if (methodName === 'runFlagshipJourney' && typeof target.runHero === 'function') {
      invoke = () => target.runHero(argument);
    } else if (methodName === 'runAdversarialScenario' && typeof target.runCase === 'function') {
      const name = 'adversarial:' + (argument?.scenario ?? 'unknown');
      invoke = target.runCase.length >= 2
        ? () => target.runCase(name, argument)
        : () => target.runCase({ name, ...argument });
    } else if (methodCaseMap[methodName] && typeof target.runCase === 'function') {
      const name = methodCaseMap[methodName];
      invoke = target.runCase.length >= 2
        ? () => target.runCase(name, argument)
        : () => target.runCase({ name, ...argument });
    }
    if (!invoke) {
      return { available: false, reason: 'ACCEPTANCE_METHOD_NOT_PRESENT', methodName };
    }
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve(invoke()),
        new Promise((_, reject) => {
          timer = originalSetTimeout(() => reject(new Error('Acceptance provider timed out: ' + methodName)), timeoutMs);
        })
      ]);
      return { available: true, result: clone(result) };
    } catch (error) {
      return {
        available: true,
        threw: true,
        error: { name: error?.name ?? null, code: error?.code ?? null, message: error?.message ?? String(error) }
      };
    } finally {
      if (timer) originalClearTimeout(timer);
    }
  };

  const resetProvider = async (timeoutMs = 120000) => {
    const target = provider();
    if (!target) return { available: false, reason: 'ACCEPTANCE_PROVIDER_NOT_PRESENT' };
    if (typeof target.reset === 'function') return callProvider('reset', {}, timeoutMs);
    if (typeof target.runCase === 'function') {
      let timer;
      try {
        const result = await Promise.race([
          Promise.resolve(target.runCase.length >= 2 ? target.runCase('reset', {}) : target.runCase({ name: 'reset' })),
          new Promise((_, reject) => { timer = originalSetTimeout(() => reject(new Error('Acceptance reset timed out.')), timeoutMs); })
        ]);
        return { available: true, result: clone(result) };
      } catch (error) {
        return { available: true, threw: true, error: { message: error?.message ?? String(error) } };
      } finally {
        if (timer) originalClearTimeout(timer);
      }
    }
    return { available: false, reason: 'ACCEPTANCE_RESET_NOT_PRESENT' };
  };

  window.__ROBO_BRIDGE_QA__ = Object.freeze({
    get registrations() { return clone(state.registrations); },
    get duplicateRegistrations() { return [...state.duplicateRegistrations]; },
    get ownerSignals() { return [...state.ownerSignals]; },
    get unhandledRejections() { return [...state.unhandledRejections]; },
    get windowErrors() { return clone(state.windowErrors); },
    invoke,
    callProvider,
    resetProvider,
    leakSnapshot,
    serviceAvailability
  });
})();
`;
