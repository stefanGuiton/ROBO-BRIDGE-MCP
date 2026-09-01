const clone = (value) => value === undefined ? undefined : structuredClone(value);

export const STABLE_ERRORS = Object.freeze([
  'runtime_unavailable','internal_error','outside_workspace','speed_limit','ik_failed','collision','cancelled',
  'no_brick_in_capture','already_holding','not_holding','target_occupied','wrong_colour','no_snap_target',
  'unknown_target','claim_conflict','wrong_mode','stale_state','operation_in_progress','invalid_input'
  ,'unknown_brick','unknown_support','placement_unavailable','out_of_bounds','out_of_range','mat_occupied','connector_occupied_or_misaligned'
  ,'no_reachable_brick','proposal_required','stream_not_found','stream_capacity','duplicate_placement_conflict'
]);

export function machineError(reason, message, extra = {}) {
  const code = STABLE_ERRORS.includes(reason) ? reason : 'internal_error';
  return { ok: false, reason: code, message: message || code.replaceAll('_', ' '), ...clone(extra) };
}

function hasFunction(value, path) {
  let current = value;
  for (const part of path.slice(0, -1)) current = current?.[part];
  return typeof current?.[path.at(-1)] === 'function';
}

export function runtimeAvailability(runtime) {
  const required = [
    ['getWorldRevision'], ['game','getBuildState'], ['game','claimTarget'], ['robot','getState'], ['robot','getWorkspace'],
    ['robot','moveTool'], ['robot','latch'], ['robot','unlatch'], ['robot','reset'], ['world','getSnapshotData'], ['world','getObjectById'], ['world','previewPlacement']
  ];
  const missing = required.filter((path) => !hasFunction(runtime, path)).map((path) => path.join('.'));
  return { ok: missing.length === 0, missing };
}

function normalizeResult(result) {
  if (result?.ok === false) return machineError(result.reason, result.message, result);
  return result;
}

export function createRuntimeBridge(runtime = null) {
  const availability = runtimeAvailability(runtime);
  const unavailable = () => machineError('runtime_unavailable', 'ROBO BRIDGE runtime is not connected.', { missing: availability.missing });
  const call = async (fn, ...args) => {
    if (!availability.ok || typeof fn !== 'function') return unavailable();
    try { return normalizeResult(await fn(...args)); }
    catch { return machineError('internal_error', 'The runtime failed while executing the request.'); }
  };
  return Object.freeze({
    availability,
    runtimeCameraAuthority: availability.ok && typeof runtime.world?.getCamera === 'function',
    getWorldRevision() {
      if (!availability.ok) return -1;
      const revision = Number(runtime.getWorldRevision());
      return Number.isSafeInteger(revision) ? revision : -1;
    },
    getCamera(cameraId, size) {
      if (!availability.ok || typeof runtime.world?.getCamera !== 'function') return null;
      try { return runtime.world.getCamera(cameraId, size) ?? null; } catch { return null; }
    },
    robot: {
      getState: () => availability.ok ? clone(runtime.robot.getState()) : unavailable(),
      getWorkspace: () => availability.ok ? clone(runtime.robot.getWorkspace()) : unavailable(),
      moveTool: (request, options) => call(runtime?.robot?.moveTool?.bind(runtime.robot), request, options),
      latch: (request) => call(runtime?.robot?.latch?.bind(runtime.robot), request),
      unlatch: (request) => call(runtime?.robot?.unlatch?.bind(runtime.robot), request),
      reset: (request) => call(runtime?.robot?.reset?.bind(runtime.robot), request)
    },
    placement: {
      getQueue: () => call(runtime?.placement?.getQueue?.bind(runtime.placement)),
      getStreamStatus: (request) => call(runtime?.placement?.getStreamStatus?.bind(runtime.placement), request),
      planQueue: (request) => call(runtime?.placement?.planQueue?.bind(runtime.placement), request),
      executeNext: (request, options) => call(runtime?.placement?.executeNext?.bind(runtime.placement), request, options)
    },
    game: {
      getBuildState: (filters) => call(runtime?.game?.getBuildState?.bind(runtime.game), filters),
      claimTarget: (targetId, owner, expectedWorldRevision) => call(runtime?.game?.claimTarget?.bind(runtime.game), targetId, owner, expectedWorldRevision)
    },
    world: {
      getSnapshotData: async () => {
        if (!availability.ok) return unavailable();
        try {
          const result = await runtime.world.getSnapshotData();
          if (!result || !Number.isSafeInteger(result.worldRevision) || !Array.isArray(result.objects)) return machineError('internal_error', 'Runtime returned an invalid world snapshot.');
          return clone(result);
        } catch { return machineError('internal_error', 'The runtime failed while reading the world snapshot.'); }
      },
      getObjectById: async (id) => availability.ok ? clone(await runtime.world.getObjectById(id)) : null
      ,previewPlacement: (request) => call(runtime?.world?.previewPlacement?.bind(runtime.world), request)
    }
  });
}
