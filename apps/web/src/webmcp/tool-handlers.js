import { createObservationService } from '../perception/observation-service.js';
import { createAgentActivity } from '../ui/agent-activity.js';
import { machineError } from './runtime-bridge.js';

const COLOURS = new Set(['white','black','red','blue','yellow','green']);
const TYPES = new Set(['brick','target']);
const STATUSES = new Set(['unfilled','filled','correct','incorrect']);
const OWNERS = new Set(['human','agent','none']);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
function inputError(message) { return machineError('invalid_input', message); }
function cleanLimit(value, defaultValue = 20) { return value === undefined ? defaultValue : value; }
function validateLimit(value) { return Number.isInteger(value) && value >= 1 && value <= 50; }
function maybeWorldRevision(bridge) { const r = bridge.getWorldRevision(); return Number.isSafeInteger(r) ? r : -1; }

export function createLogoRoboToolHandlers({ bridge, observationService = createObservationService({ bridge }), activity = createAgentActivity() }) {
  let lastBuildState = null;
  async function getBuildState(input = {}) {
    if (input.status !== undefined && !STATUSES.has(input.status)) return inputError('Unknown status filter.');
    if (input.colour !== undefined && !COLOURS.has(String(input.colour).toLowerCase())) return inputError('Unknown colour filter.');
    if (input.claimOwner !== undefined && !OWNERS.has(input.claimOwner)) return inputError('Unknown claimOwner filter.');
    const limit = cleanLimit(input.limit); if (!validateLimit(limit)) return inputError('limit must be an integer from 1 to 50.');
    const result = await bridge.game.getBuildState({ ...input, limit });
    if (result?.ok === false) return result;
    lastBuildState = result;
    activity.push('VERIFY', `BUILD STATE ${Math.round(Number(result.progress?.percent ?? result.progressPercent ?? 0))}%`, { worldRevision: result.worldRevision ?? maybeWorldRevision(bridge) });
    return result;
  }

  async function observeCamera(input = {}) {
    if (input.colour !== undefined && !COLOURS.has(String(input.colour).toLowerCase())) return inputError('Unknown colour filter.');
    if (input.type !== undefined && !TYPES.has(input.type)) return inputError('Unknown type filter.');
    const result = await observationService.observe(input);
    if (result.ok) activity.push('OBSERVE', `${result.cameraId} -> ${result.detections.length} visible`, { sequence: result.sequence, snapshotRevision: result.snapshotRevision });
    return result;
  }

  async function moveTool(input = {}) {
    for (const field of ['xMm','yMm','zMm','speedMmS']) if (!finite(input[field])) return inputError(`${field} must be finite.`);
    if (input.xMm < -1200 || input.xMm > 1200 || input.yMm < -1200 || input.yMm > 1200 || input.zMm < -200 || input.zMm > 1600) return inputError('XYZ is outside broad workcell bounds.');
    if (input.speedMmS <= 0 || input.speedMmS > 3000) return inputError('speedMmS must be greater than 0 and not more than 3000.');
    const associated = observationService.associateMove(input);
    if (associated) activity.push('TARGET', `${associated.objectId} @ ${Math.round(associated.worldXmm)},${Math.round(associated.worldYmm)},${Math.round(associated.worldZmm)}`, { objectId: associated.objectId });
    const before = maybeWorldRevision(bridge);
    if (associated && associated.snapshotRevision >= 0 && before >= 0 && associated.snapshotRevision !== before) {
      const current = await bridge.world.getObjectById(associated.objectId);
      const moved = !current || current.visible === false || current.state === 'taken' || Math.hypot(
        Number(current?.position?.xMm ?? Infinity) - associated.worldXmm,
        Number(current?.position?.yMm ?? Infinity) - associated.worldYmm,
        Number(current?.position?.zMm ?? Infinity) - associated.worldZmm
      ) > 4;
      if (moved) {
        activity.push('RECOVER', `stale observation for ${associated.objectId}`, { observedRevision: associated.snapshotRevision, worldRevision: before });
        return machineError('stale_state', 'The observed object coordinate is stale. Observe again.', { observedRevision: associated.snapshotRevision, worldRevision: before });
      }
    }
    const result = await bridge.robot.moveTool(input);
    if (result?.ok === false) { activity.push('RECOVER', `MOVE ${result.reason}`, { requested: input }); return result; }
    activity.push('MOVE', 'TCP move accepted', { requested: input, appliedSpeedMmS: result.appliedSpeedMmS });
    return result;
  }

  async function latch() {
    const result = await bridge.robot.latch();
    if (result?.ok === false) { activity.push('RECOVER', `LATCH ${result.reason}`); return result; }
    const id = result.brick?.id ?? result.brickId ?? result.heldBrickId ?? null;
    if (id) observationService.setActiveObject(id);
    activity.push('LATCH', id ? `latched ${id}` : 'latch accepted', { objectId: id });
    return result;
  }

  async function unlatch() {
    const result = await bridge.robot.unlatch();
    if (result?.ok === false) { activity.push('RECOVER', `UNLATCH ${result.reason}`); return result; }
    const targetId = result.targetSnap?.targetId ?? result.targetId ?? null;
    activity.push(result.correctness === true || result.correct === true ? 'PLACE' : 'VERIFY', targetId ? `released -> ${targetId}` : 'released brick', { targetId, correctness: result.correctness ?? result.correct });
    return result;
  }

  async function claimTarget(input = {}) {
    if (typeof input.targetId !== 'string' || input.targetId.length < 1 || input.targetId.length > 64 || !/^[A-Za-z0-9_.:-]+$/.test(input.targetId)) return inputError('targetId is invalid.');
    const result = await bridge.game.claimTarget(input.targetId);
    if (result?.ok === false) { activity.push('RECOVER', `CLAIM ${result.reason}`, { targetId: input.targetId }); return result; }
    activity.push('TARGET', `claimed ${input.targetId}`, { targetId: input.targetId });
    return result;
  }

  return Object.freeze({ getBuildState, observeCamera, moveTool, latch, unlatch, claimTarget, observationService, activity, getLastBuildState: () => lastBuildState });
}
