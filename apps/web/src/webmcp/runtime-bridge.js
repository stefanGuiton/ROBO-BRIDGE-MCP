const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export const STABLE_ERRORS = Object.freeze([
  'runtime_unavailable','outside_workspace','speed_limit','ik_failed','collision','cancelled',
  'no_brick_in_capture','already_holding','not_holding','target_occupied','unknown_target',
  'wrong_mode','stale_state','invalid_input'
]);

export function machineError(reason, message, extra = {}) {
  const code = STABLE_ERRORS.includes(reason) ? reason : 'invalid_input';
  return { ok: false, reason: code, message: message || code.replaceAll('_', ' '), ...clone(extra) };
}

function hasFunction(value, path) {
  let current = value;
  for (const part of path.slice(0, -1)) current = current?.[part];
  return typeof current?.[path.at(-1)] === 'function';
}

export function runtimeAvailability(runtime) {
  const required = [
    ['getWorldRevision'], ['game','getBuildState'], ['game','claimTarget'], ['robot','getState'],
    ['robot','moveTool'], ['robot','latch'], ['robot','unlatch'], ['world','getVisibleObjects'], ['world','getObjectById']
  ];
  const missing = required.filter((path) => !hasFunction(runtime, path)).map((path) => path.join('.'));
  return { ok: missing.length === 0, missing };
}

function normalizeResult(result, fallbackReason = 'runtime_unavailable') {
  if (result?.ok === false) return machineError(result.reason || fallbackReason, result.message, result);
  return result;
}

export function createRuntimeBridge(runtime = null) {
  const availability = runtimeAvailability(runtime);
  const unavailable = () => machineError('runtime_unavailable', 'LOGO ROBO production runtime is not connected.', { missing: availability.missing });
  const call = async (fn, ...args) => {
    if (!availability.ok || typeof fn !== 'function') return unavailable();
    try { return normalizeResult(await fn(...args)); }
    catch (error) { return machineError('runtime_unavailable', error instanceof Error ? error.message : String(error)); }
  };
  const bridge = {
    availability,
    getWorldRevision() {
      if (!availability.ok) return -1;
      const revision = Number(runtime.getWorldRevision());
      return Number.isSafeInteger(revision) ? revision : -1;
    },
    getCamera(cameraId, size) {
      if (!availability.ok || typeof runtime.world?.getCamera !== 'function') return null;
      return runtime.world.getCamera(cameraId, size) ?? null;
    },
    game: {
      getBuildState: (filters) => call(runtime?.game?.getBuildState?.bind(runtime.game), filters),
      claimTarget: (targetId) => call(runtime?.game?.claimTarget?.bind(runtime.game), targetId, 'agent')
    },
    robot: {
      getState: () => availability.ok ? clone(runtime.robot.getState()) : unavailable(),
      moveTool: (request) => call(runtime?.robot?.moveTool?.bind(runtime.robot), request),
      latch: () => call(runtime?.robot?.latch?.bind(runtime.robot)),
      unlatch: () => call(runtime?.robot?.unlatch?.bind(runtime.robot))
    },
    world: {
      getVisibleObjects: async () => {
        if (!availability.ok) return [];
        const result = await runtime.world.getVisibleObjects();
        return Array.isArray(result) ? clone(result) : [];
      },
      getObjectById: async (id) => availability.ok ? clone(await runtime.world.getObjectById(id)) : null
    }
  };
  return Object.freeze(bridge);
}
