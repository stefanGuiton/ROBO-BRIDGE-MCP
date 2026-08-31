import { createObservationService } from '../perception/observation-service.js';
import { createAgentActivity } from '../ui/agent-activity.js';
import { machineError } from './runtime-bridge.js';

const COLOURS = new Set(['white','black','red','blue','yellow','green','orange','purple','teal']);
const TYPES = new Set(['brick','target']);
const STATUSES = new Set(['unfilled','filled','correct','incorrect']);
const OWNERS = new Set(['human','agent','none']);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const inputError = (message) => machineError('invalid_input', message);

function validateRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createLogoRoboToolHandlers({ bridge, observationService = createObservationService({ bridge }), activity = createAgentActivity() }) {
  async function getBuildState(input = {}) {
    if (input.status !== undefined && !STATUSES.has(input.status)) return inputError('Unknown status filter.');
    if (input.colour !== undefined && !COLOURS.has(String(input.colour).toLowerCase())) return inputError('Unknown colour filter.');
    if (input.claimOwner !== undefined && !OWNERS.has(input.claimOwner)) return inputError('Unknown claimOwner filter.');
    const limit = input.limit === undefined ? 12 : input.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) return inputError('limit must be an integer from 1 to 20.');
    const result = await bridge.game.getBuildState({ ...input, limit });
    if (result?.ok === false) return result;
    return result;
  }

  async function getSceneState(input = {}) {
    if (input.colour !== undefined && !COLOURS.has(String(input.colour).toLowerCase())) return inputError('Unknown colour filter.');
    if (input.type !== undefined && !TYPES.has(input.type)) return inputError('Unknown type filter.');
    const limit = input.limit === undefined ? 20 : input.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) return inputError('limit must be an integer from 1 to 20.');
    const snapshot = await bridge.world.getSnapshotData();
    if (snapshot?.ok === false) return snapshot;
    const build = await bridge.game.getBuildState({ limit });
    if (build?.ok === false) return build;
    let objects = snapshot.objects.filter((object) => ['brick', 'target'].includes(object.type));
    if (input.type !== undefined) objects = objects.filter((object) => object.type === input.type);
    if (input.colour !== undefined) objects = objects.filter((object) => String(object.colour).toLowerCase() === String(input.colour).toLowerCase());
    objects.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
    return {
      ok: true,
      coordinateFrame: 'machine-mm-rad',
      worldRevision: snapshot.worldRevision,
      objects: objects.slice(0, limit),
      totalAvailable: objects.length,
      truncated: objects.length > limit,
      build
    };
  }

  async function getRobotState() { return bridge.robot.getState(); }
  async function getWorkspace() { return bridge.robot.getWorkspace(); }

  async function observeCamera(input = {}) {
    if (input.colour !== undefined && !COLOURS.has(String(input.colour).toLowerCase())) return inputError('Unknown colour filter.');
    if (input.type !== undefined && !TYPES.has(input.type)) return inputError('Unknown type filter.');
    const result = await observationService.observe(input);
    return result;
  }

  async function previewPlacement(input = {}) {
    if (typeof input.brickId !== 'string' || input.brickId.length < 1 || input.brickId.length > 64 || !/^[A-Za-z0-9_.:-]+$/.test(input.brickId)) return inputError('brickId is invalid.');
    if (!validateRevision(input.expectedWorldRevision)) return inputError('expectedWorldRevision must be a non-negative safe integer.');
    const hasPosition = ['xMm', 'yMm', 'zMm'].every((field) => finite(input[field]));
    if (!hasPosition && !input.supportBrickId) return inputError('Provide xMm/yMm/zMm or supportBrickId.');
    if (input.yawDeg !== undefined && !finite(input.yawDeg)) return inputError('yawDeg must be finite.');
    return bridge.world.previewPlacement(input);
  }

  async function planPlacementQueue(input = {}) {
    if (!validateRevision(input.expectedWorldRevision)) return inputError('expectedWorldRevision must be a non-negative safe integer.');
    if (!Array.isArray(input.placements) || input.placements.length < 1 || input.placements.length > 5) {
      return inputError('placements must contain between one and five destinations.');
    }
    const before = bridge.getWorldRevision();
    if (before !== input.expectedWorldRevision) {
      return machineError('stale_state', 'World state changed. Read state again before planning.', { expectedWorldRevision: input.expectedWorldRevision, worldRevision: before });
    }
    const result = await bridge.placement.planQueue(input);
    if (result?.ok === false && result.reason !== undefined) activity.push('RECOVER', `PLAN ${result.reason}`);
    else activity.push('TARGET', `cached ${result.queueLength ?? 0} placement proposals`, { cacheId: result.cacheId, worldRevision: before });
    return result;
  }

  async function executeNextPlacement(input = {}, options = {}) {
    if (!validateRevision(input.expectedWorldRevision)) return inputError('expectedWorldRevision must be a non-negative safe integer.');
    const before = bridge.getWorldRevision();
    if (before !== input.expectedWorldRevision) {
      return machineError('stale_state', 'World state changed. Read state again before executing.', { expectedWorldRevision: input.expectedWorldRevision, worldRevision: before });
    }
    const result = await bridge.placement.executeNext(input, { signal: options.signal });
    if (result?.ok === false) activity.push('RECOVER', `PLACE ${result.reason}`, { proposalId: input.proposalId });
    else activity.push('PLACE', `executed ${result.proposalId}`, { brickId: result.brickId, playbackDurationMs: result.playbackDurationMs, worldRevision: result.worldRevision });
    return result;
  }

  async function moveTool(input = {}, options = {}) {
    for (const field of ['xMm','yMm','zMm','speedMmS']) if (!finite(input[field])) return inputError(`${field} must be finite.`);
    if (!validateRevision(input.expectedWorldRevision)) return inputError('expectedWorldRevision must be a non-negative safe integer.');
    const before = bridge.getWorldRevision();
    if (before !== input.expectedWorldRevision) return machineError('stale_state', 'World state changed. Read state again before moving.', { expectedWorldRevision: input.expectedWorldRevision, worldRevision: before });
    const associated = observationService.associateMove(input);
    if (associated) activity.push('TARGET', `${associated.objectId} @ ${Math.round(input.xMm)},${Math.round(input.yMm)},${Math.round(input.zMm)}`, { objectId: associated.objectId, snapshotRevision: associated.snapshotRevision });
    const result = await bridge.robot.moveTool(input, { signal: options.signal });
    if (result?.ok === false) { activity.push('RECOVER', `MOVE ${result.reason}`, { requested: input }); return result; }
    activity.push('MOVE', 'TCP move accepted', { requested: input, appliedSpeedMmS: result.appliedSpeedMmS, worldRevision: result.worldRevision });
    return result;
  }

  async function latch(input = {}) {
    if (!validateRevision(input.expectedWorldRevision)) return inputError('expectedWorldRevision must be a non-negative safe integer.');
    const result = await bridge.robot.latch({ expectedWorldRevision: input.expectedWorldRevision, actor: 'agent' });
    if (result?.ok === false) { activity.push('RECOVER', `LATCH ${result.reason}`); return result; }
    const id = result.brick?.id ?? result.brickId ?? result.heldBrickId ?? null;
    if (id) observationService.setActiveObject(id);
    activity.push('LATCH', id ? `latched ${id}` : 'latch accepted', { objectId: id, worldRevision: result.worldRevision });
    return result;
  }

  async function unlatch(input = {}) {
    if (!validateRevision(input.expectedWorldRevision)) return inputError('expectedWorldRevision must be a non-negative safe integer.');
    const result = await bridge.robot.unlatch({ expectedWorldRevision: input.expectedWorldRevision, actor: 'agent' });
    if (result?.ok === false) { activity.push('RECOVER', `UNLATCH ${result.reason}`); return result; }
    const targetId = result.targetSnap?.targetId ?? result.targetId ?? null;
    activity.push(result.correctness ? 'PLACE' : 'VERIFY', targetId ? `released -> ${targetId}` : 'released brick', { targetId, correctness: result.correctness, worldRevision: result.worldRevision });
    return result;
  }

  async function claimTarget(input = {}) {
    if (typeof input.targetId !== 'string' || input.targetId.length < 1 || input.targetId.length > 64 || !/^[A-Za-z0-9_.:-]+$/.test(input.targetId)) return inputError('targetId is invalid.');
    if (!validateRevision(input.expectedWorldRevision)) return inputError('expectedWorldRevision must be a non-negative safe integer.');
    const result = await bridge.game.claimTarget(input.targetId, 'agent', input.expectedWorldRevision);
    if (result?.ok === false) { activity.push('RECOVER', `CLAIM ${result.reason}`, { targetId: input.targetId }); return result; }
    activity.push('TARGET', `claimed ${input.targetId}`, { targetId: input.targetId, worldRevision: result.worldRevision });
    return result;
  }

  async function resetWorkcell(input = {}) {
    if (!validateRevision(input.expectedWorldRevision)) return inputError('expectedWorldRevision must be a non-negative safe integer.');
    const before = bridge.getWorldRevision();
    if (before !== input.expectedWorldRevision) return machineError('stale_state', 'World state changed. Read state again before resetting.', { expectedWorldRevision: input.expectedWorldRevision, worldRevision: before });
    const result = await bridge.robot.reset(input);
    activity.clear();
    return result;
  }

  return Object.freeze({ getSceneState, getBuildState, getRobotState, getWorkspace, observeCamera, previewPlacement, planPlacementQueue, executeNextPlacement, moveTool, latch, unlatch, claimTarget, resetWorkcell, observationService, activity });
}
