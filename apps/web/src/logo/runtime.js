import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { createCameraRig } from '../perception/camera-rig.js';

const clone = (value) => structuredClone(value);
const PRODUCTION_CAMERA_CONFIGS = Object.freeze({
  tray_camera: Object.freeze({ position: [520, -230, 680], target: [520, -230, 0], halfWidth: 82 }),
  canvas_camera: Object.freeze({ position: [655, 220, 680], target: [655, 220, 0], halfWidth: 92 })
});
const STABLE_ERROR_MAP = Object.freeze({
  no_ik_solution: 'ik_failed',
  joint_limit: 'ik_failed',
  no_snap_target: 'target_occupied'
});

function normalizeReason(reason) {
  return STABLE_ERROR_MAP[reason] ?? reason ?? 'invalid_input';
}

function brickObject(brick) {
  const state = brick.heldBy ? 'held' : brick.snapped ? 'snapped' : 'free';
  return {
    id: brick.id,
    type: 'brick',
    colour: brick.colour,
    position: clone(brick.position),
    bounds: { xMm: BRICK_SPEC.lengthMm, yMm: BRICK_SPEC.widthMm, zMm: BRICK_SPEC.bodyHeightMm },
    yawDeg: Number(brick.yawRad ?? 0) * 180 / Math.PI,
    state,
    held: Boolean(brick.heldBy),
    visible: true,
    occluder: true,
    placedTargetId: brick.placedTargetId ?? null
  };
}

function targetObject(target, brick = null, claimOwner = null) {
  const position = clone(target.position);
  const status = brick?.snapped ? 'filled' : 'unfilled';
  return {
    id: target.id,
    targetId: target.id,
    type: 'target',
    colour: target.colour ?? null,
    position,
    worldXmm: position.xMm,
    worldYmm: position.yMm,
    worldZmm: position.zMm,
    bounds: { xMm: BRICK_SPEC.lengthMm, yMm: BRICK_SPEC.widthMm, zMm: BRICK_SPEC.bodyHeightMm },
    yawDeg: Number(target.yawRad ?? 0) * 180 / Math.PI,
    status,
    state: status,
    claimOwner: claimOwner ?? 'none',
    placedBrickId: brick?.id ?? target.placedBrickId ?? null,
    visible: true,
    occluder: false
  };
}

export function createLogoRoboRuntime({ controller, board }) {
  if (!controller || !board) throw new TypeError('controller and board are required');
  const claims = new Map();
  let coordinationRevision = controller.getState().worldRevision;

  function worldRevision() {
    return Math.max(coordinationRevision, controller.getState().worldRevision);
  }

  function bumpCoordinationRevision() {
    coordinationRevision = Math.max(coordinationRevision + 1, controller.getState().worldRevision);
    return coordinationRevision;
  }

  function currentTargets() {
    const bricks = controller.getBricks();
    return board.getTargets().map((target) => {
      const brick = bricks.find((candidate) => candidate.placedTargetId === target.id && candidate.snapped) ?? null;
      return targetObject(target, brick, claims.get(target.id));
    });
  }

  function currentObjects() {
    return [...controller.getBricks().map(brickObject), ...currentTargets()];
  }

  function robotState() {
    return {
      ok: true,
      ...controller.getState(),
      coordinateFrame: 'machine-mm-rad'
    };
  }

  function resultWithState(result) {
    return { ...result, state: robotState(), worldRevision: worldRevision() };
  }

  const unsubscribe = controller.subscribe((event) => {
    coordinationRevision = Math.max(coordinationRevision, event.worldRevision ?? 0);
    if (event.type === 'reset' || event.type === 'world_reset') claims.clear();
  });

  const runtime = {
    getWorldRevision: worldRevision,
    robot: {
      getState: robotState,
      async moveTool(request = {}) {
        try {
          const result = await controller.moveTool(request);
          return resultWithState({
            ok: true,
            accepted: result.accepted,
            finalTcp: result.accepted.tcp,
            diagnostics: result.diagnostics,
            appliedSpeedMmS: request.speedMmS,
            durationMs: result.diagnostics?.durationMs ?? null
          });
        } catch (error) {
          return resultWithState({
            ok: false,
            reason: normalizeReason(error.code),
            details: error.details ?? { message: String(error.message ?? error) },
            finalTcp: controller.getState().tcp
          });
        }
      },
      latch() {
        const result = controller.latch();
        if (!result.success) return resultWithState({ ok: false, reason: normalizeReason(result.reason), ...result });
        const brick = controller.getBricks().find((candidate) => candidate.id === result.brickId) ?? null;
        return resultWithState({
          ok: true,
          ...result,
          brick: brick ? brickObject(brick) : null,
          heldBrickId: result.brickId
        });
      },
      unlatch() {
        const result = controller.unlatch();
        if (!result.success) return resultWithState({ ok: false, reason: normalizeReason(result.reason), ...result });
        const brick = controller.getBricks().find((candidate) => candidate.id === result.brickId) ?? null;
        const target = result.targetId ? board.getTargets().find((candidate) => candidate.id === result.targetId) : null;
        const targetSnap = result.snapped && target ? {
          targetId: target.id,
          position: clone(target.position),
          yawRad: target.yawRad ?? BRICK_SPEC.canonicalYawRad
        } : null;
        return resultWithState({
          ok: true,
          ...result,
          brick: brick ? brickObject(brick) : null,
          finalPose: clone(result.finalPosition),
          targetSnap,
          correctness: Boolean(result.snapped && brick && target && brick.colour === target.colour),
          correct: Boolean(result.snapped && brick && target && brick.colour === target.colour)
        });
      }
    },
    game: {
      async getBuildState(filters = {}) {
        let targets = currentTargets();
        if (filters.status) targets = targets.filter((target) => target.status === filters.status);
        if (filters.colour) targets = targets.filter((target) => target.colour === filters.colour);
        if (filters.claimOwner) targets = targets.filter((target) => target.claimOwner === filters.claimOwner);
        const allTargets = currentTargets();
        const filled = allTargets.filter((target) => target.status === 'filled').length;
        const correctTargets = allTargets.filter((target) => {
          const brick = controller.getBricks().find((candidate) => candidate.id === target.placedBrickId);
          return target.status === 'filled' && brick?.colour === target.colour;
        }).length;
        const total = allTargets.length;
        const boundedLimit = Number.isInteger(filters.limit) ? Math.max(1, Math.min(50, filters.limit)) : 20;
        return {
          ok: true,
          mode: 'co-build',
          worldRevision: worldRevision(),
          blueprintId: 'logo-robo-challenge-vertical-slice',
          progress: {
            filled,
            correctTargets,
            total,
            percent: total ? correctTargets / total * 100 : 100,
            fraction: total ? correctTargets / total : 1
          },
          targets: clone(targets.slice(0, boundedLimit)),
          contributionSummary: { agent: correctTargets, human: Math.max(0, filled - correctTargets) },
          heldBrickId: controller.getState().heldBrickId,
          robotSpeedCapMmS: controller.speedLimitMmS
        };
      },
      async claimTarget(targetId, owner = 'agent') {
        const target = board.getTargets().find((candidate) => candidate.id === targetId);
        if (!target) return { ok: false, reason: 'unknown_target' };
        const current = currentTargets().find((candidate) => candidate.id === targetId);
        if (current?.status === 'filled') return { ok: false, reason: 'target_occupied', targetId };
        const existingOwner = claims.get(targetId);
        if (existingOwner && existingOwner !== owner) return { ok: false, reason: 'target_occupied', targetId };
        claims.set(targetId, owner);
        const revision = bumpCoordinationRevision();
        return { ok: true, targetId, claimOwner: owner, worldRevision: revision };
      }
    },
    world: {
      async getVisibleObjects() {
        return currentObjects();
      },
      async getObjectById(id) {
        return currentObjects().find((object) => object.id === id) ?? null;
      },
      getCamera(cameraId, size = { widthPx: 640, heightPx: 360 }) {
        const widthPx = Number(size.widthPx);
        const heightPx = Number(size.heightPx);
        if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx)) return null;
        const rig = createCameraRig({ widthPx, heightPx, cameraConfigs: PRODUCTION_CAMERA_CONFIGS });
        return rig.getCamera(cameraId, worldRevision());
      }
    },
    dispose() {
      unsubscribe();
    }
  };

  return Object.freeze(runtime);
}

export { PRODUCTION_CAMERA_CONFIGS };
