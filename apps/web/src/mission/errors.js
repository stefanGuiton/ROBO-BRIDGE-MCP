'use strict';

export const MISSION_ERROR_CODES = Object.freeze([
  'CANCELLED','INVALID_PARAMETER','INVALID_PHASE','STALE_MISSION','STALE_MISSION_REVISION',
  'STALE_DESIGN_REVISION','STALE_WORLD_REVISION','STALE_PLAN','PLAN_NOT_FROZEN',
  'BUILD_NOT_STARTED','BUILD_IN_PROGRESS','OPERATION_IN_PROGRESS','ROBOT_BUSY',
  'GRIPPER_NOT_EMPTY','TRAIN_NOT_READY','LEVEL3_ONLY','TEST_IN_PROGRESS','STALE_TRAIN_RESULT',
  'INVALID_TRAIN_RESULT','INVALID_SUPPORT_SNAPSHOT','CHALLENGE_NOT_FOUND',
  'RUNTIME_UNAVAILABLE','SERVICE_UNAVAILABLE','START_BUILD_FAILED','CONSTRUCTION_ERROR',
  'TRAIN_ERROR','RESET_FAILED','INTERNAL_ERROR'
]);

const EXTERNAL_ERROR_CODE_MAP = Object.freeze({
  cancelled: 'CANCELLED',
  train_test_cancelled: 'CANCELLED',
  abort_err: 'CANCELLED',
  invalid_input: 'INVALID_PARAMETER',
  invalid_parameter: 'INVALID_PARAMETER',
  wrong_mode: 'INVALID_PHASE',
  stale_state: 'STALE_WORLD_REVISION',
  stale_world_revision: 'STALE_WORLD_REVISION',
  stream_not_found: 'STALE_PLAN',
  operation_in_progress: 'OPERATION_IN_PROGRESS',
  already_holding: 'GRIPPER_NOT_EMPTY',
  robot_busy: 'ROBOT_BUSY',
  train_not_ready: 'TRAIN_NOT_READY',
  test_in_progress: 'TEST_IN_PROGRESS',
  challenge_not_found: 'CHALLENGE_NOT_FOUND',
  runtime_unavailable: 'RUNTIME_UNAVAILABLE',
  service_unavailable: 'SERVICE_UNAVAILABLE',
  start_build_failed: 'START_BUILD_FAILED',
  reset_failed: 'RESET_FAILED',
  internal_error: 'INTERNAL_ERROR'
});

export function normalizeMissionErrorCode(value) {
  if (typeof value !== 'string' || !value) return 'INTERNAL_ERROR';
  if (MISSION_ERROR_CODES.includes(value)) return value;
  const upper = value.toUpperCase();
  if (MISSION_ERROR_CODES.includes(upper)) return upper;
  return EXTERNAL_ERROR_CODE_MAP[value.toLowerCase()] ?? 'INTERNAL_ERROR';
}

const POLICY = Object.freeze({
  CANCELLED:[true,'Read mission state, then retry a legal action.'],
  INVALID_PARAMETER:[false,'Correct the input and retry.'],
  INVALID_PHASE:[false,'Call get_mission_state and use one of its nextActions.'],
  STALE_MISSION:[false,'Call get_mission_state and use its missionId.'],
  STALE_MISSION_REVISION:[true,'Call get_mission_state and use its missionRevision.'],
  STALE_DESIGN_REVISION:[true,'Call get_bridge_design and use its designRevision.'],
  STALE_WORLD_REVISION:[true,'Call get_mission_state and use its worldRevision.'],
  STALE_PLAN:[false,'Continue with the frozen plan or reset the mission.'],
  PLAN_NOT_FROZEN:[false,'Call start_bridge_build in DESIGN.'],
  BUILD_NOT_STARTED:[false,'Call start_bridge_build in DESIGN.'],
  BUILD_IN_PROGRESS:[true,'Wait for the active build call to stop, then read progress.'],
  OPERATION_IN_PROGRESS:[true,'Wait for the active mission operation to stop.'],
  ROBOT_BUSY:[true,'Wait until the robot is idle.'],
  GRIPPER_NOT_EMPTY:[true,'Place or release the held part.'],
  TRAIN_NOT_READY:[true,'Read mission state and retry when the train is ready.'],
  LEVEL3_ONLY:[false,'Continue Level 2 construction or select Level 3 before testing the bridge.'],
  TEST_IN_PROGRESS:[true,'Wait for the active test to stop.'],
  STALE_TRAIN_RESULT:[true,'Run a new test for the current frozen plan.'],
  INVALID_TRAIN_RESULT:[true,'Reset the train service and run a new test.'],
  INVALID_SUPPORT_SNAPSHOT:[true,'Read authoritative build progress and retry.'],
  CHALLENGE_NOT_FOUND:[false,'Call get_terrain_options and use a listed enabled ID.'],
  RUNTIME_UNAVAILABLE:[true,'Connect the production runtime and retry.'],
  SERVICE_UNAVAILABLE:[true,'Connect the missing production service and retry.'],
  START_BUILD_FAILED:[true,'Read design and mission state, then retry.'],
  CONSTRUCTION_ERROR:[true,'Read build progress, then retry or reset.'],
  TRAIN_ERROR:[true,'Read mission state, then retry the test.'],
  RESET_FAILED:[true,'Retry reset_mission with current revisions.'],
  INTERNAL_ERROR:[true,'Read mission state, then retry or reset.']
});

export const cloneValue = (value) => value === undefined ? undefined : structuredClone(value);

function compact(value, fallback) {
  const text = String(value ?? fallback).replace(/[\u0000-\u001F\u007F]+/g,' ').replace(/\s+/g,' ').trim();
  return text.length <= 240 ? text : `${text.slice(0,239)}…`;
}

export class MissionError extends Error {
  constructor(code, message, details = {}) {
    const stable = normalizeMissionErrorCode(code);
    const known = stable !== 'INTERNAL_ERROR' || String(code).toUpperCase() === 'INTERNAL_ERROR';
    super(known ? compact(message, stable.replaceAll('_',' ').toLowerCase()) : 'The mission operation failed.');
    this.name = 'MissionError';
    this.code = stable;
    try { this.details = cloneValue(details); }
    catch { this.details = {}; }
  }
}

export function assertNotAborted(signal) {
  if (signal?.aborted) throw new MissionError('CANCELLED','The operation was cancelled.');
}

export function toMissionError(error, fallbackCode = 'INTERNAL_ERROR', fallbackMessage = 'The mission operation failed.') {
  if (error instanceof MissionError) return error;
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || error?.code === 'CANCELLED') {
    return new MissionError('CANCELLED','The operation was cancelled.');
  }
  const rawCode = error?.code ?? error?.reason ?? null;
  const externalCode = rawCode ? normalizeMissionErrorCode(rawCode) : null;
  const useExternal = externalCode && (externalCode !== 'INTERNAL_ERROR' || String(rawCode).toUpperCase() === 'INTERNAL_ERROR');
  return new MissionError(useExternal ? externalCode : fallbackCode, error?.publicMessage ?? (useExternal ? error?.message : null) ?? fallbackMessage, error?.details);
}

export function errorPolicy(code) {
  const [retryable,recovery] = POLICY[code] ?? POLICY.INTERNAL_ERROR;
  return { retryable,recovery };
}
