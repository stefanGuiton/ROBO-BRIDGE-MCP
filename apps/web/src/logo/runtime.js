import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { createCameraRig } from '../perception/camera-rig.js';
import { forwardKinematics } from '../robot/kinematics.js';
import { CHALLENGE_LAYOUT } from '../robot/ur10-definition.js';

const clone = (value) => structuredClone(value);
const PRODUCTION_CAMERA_CONFIGS = Object.freeze({
  tray_camera: Object.freeze({ position: [520, -230, 680], target: [520, -230, 0], halfWidth: 82 }),
  canvas_camera: Object.freeze({ position: [655, 220, 680], target: [655, 220, 0], halfWidth: 92 })
});

const STABLE_ERROR_MAP = Object.freeze({
  no_ik_solution: 'ik_failed',
  joint_limit: 'ik_failed'
});

function normalizeReason(reason) {
  return STABLE_ERROR_MAP[reason] ?? reason ?? 'internal_error';
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

function targetObject(target) {
  const position = clone(target.position);
  return {
    id: target.id,
    targetId: target.id,
    type: 'target',
    colour: target.colour ?? null,
    position,
    bounds: { xMm: BRICK_SPEC.lengthMm, yMm: BRICK_SPEC.widthMm, zMm: BRICK_SPEC.bodyHeightMm },
    yawDeg: target.yawDeg ?? 0,
    status: target.status,
    state: target.status,
    claimOwner: target.claimOwner ?? 'none',
    placedBrickId: target.placedBrickId ?? null,
    visible: true,
    occluder: false
  };
}

export function createLogoRoboRuntime({ controller, board, resetBricks = null }) {
  if (!controller || !board) throw new TypeError('controller and board are required');

  function worldRevision() { return controller.getState().worldRevision; }

  function structureObjects() {
    const tray = CHALLENGE_LAYOUT.tray;
    const boardLayout = CHALLENGE_LAYOUT.board;
    const wall = 6;
    const structures = [
      { id: 'structure-board', type: 'structure', position: { xMm: (boardLayout.minX + boardLayout.maxX) / 2, yMm: (boardLayout.minY + boardLayout.maxY) / 2, zMm: boardLayout.surfaceZ / 2 }, bounds: { xMm: boardLayout.maxX - boardLayout.minX, yMm: boardLayout.maxY - boardLayout.minY, zMm: boardLayout.surfaceZ }, visible: true, occluder: true },
      { id: 'structure-tray-left', type: 'structure', position: { xMm: tray.minX, yMm: (tray.minY + tray.maxY) / 2, zMm: tray.floorZ + tray.wallHeight / 2 }, bounds: { xMm: wall, yMm: tray.maxY - tray.minY, zMm: tray.wallHeight }, visible: true, occluder: true },
      { id: 'structure-tray-right', type: 'structure', position: { xMm: tray.maxX, yMm: (tray.minY + tray.maxY) / 2, zMm: tray.floorZ + tray.wallHeight / 2 }, bounds: { xMm: wall, yMm: tray.maxY - tray.minY, zMm: tray.wallHeight }, visible: true, occluder: true },
      { id: 'structure-tray-front', type: 'structure', position: { xMm: (tray.minX + tray.maxX) / 2, yMm: tray.minY, zMm: tray.floorZ + tray.wallHeight / 2 }, bounds: { xMm: tray.maxX - tray.minX, yMm: wall, zMm: tray.wallHeight }, visible: true, occluder: true },
      { id: 'structure-tray-back', type: 'structure', position: { xMm: (tray.minX + tray.maxX) / 2, yMm: tray.maxY, zMm: tray.floorZ + tray.wallHeight / 2 }, bounds: { xMm: tray.maxX - tray.minX, yMm: wall, zMm: tray.wallHeight }, visible: true, occluder: true }
    ];
    const fk = forwardKinematics(controller.getState().jointsRad);
    if (fk.ok) {
      const points = [...fk.jointPositions, fk.tcp];
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i], b = points[i + 1];
        structures.push({
          id: `robot-link-${i}`,
          type: 'robot-link',
          position: { xMm: (a.xMm + b.xMm) / 2, yMm: (a.yMm + b.yMm) / 2, zMm: (a.zMm + b.zMm) / 2 },
          bounds: { xMm: Math.abs(a.xMm - b.xMm) + 20, yMm: Math.abs(a.yMm - b.yMm) + 20, zMm: Math.abs(a.zMm - b.zMm) + 20 },
          visible: true,
          occluder: true
        });
      }
    }
    return structures;
  }

  function currentObjects() { return [...controller.getBricks().map(brickObject), ...board.getTargets().map(targetObject), ...structureObjects()]; }
  function robotState() { return { ok: true, ...controller.getState(), coordinateFrame: 'machine-mm-rad' }; }
  function resultWithState(result) { return { ...result, state: robotState(), worldRevision: worldRevision() }; }

  const runtime = {
    getWorldRevision: worldRevision,
    robot: {
      getState: robotState,
      getWorkspace() {
        return {
          ok: true,
          ...controller.getWorkspace(),
          speedLimitMmS: controller.speedLimitMmS,
          accelerationLimitMmS2: controller.accelerationLimitMmS2,
          jointSpeedLimitRadS: controller.jointSpeedLimitRadS,
          jointAccelerationLimitRadS2: controller.jointAccelerationLimitRadS2,
          coordinateFrame: 'machine-mm-rad',
          toolOrientation: 'fixed-down-auto-yaw',
          graspTcpOffsetMm: BRICK_SPEC.capture.tcpAboveCentreMm,
          recommendedClearanceZMm: 400,
          recommendedTransferTcp: { xMm: 600, yMm: 0, zMm: 450 }
        };
      },
      async moveTool(request = {}, options = {}) {
        try {
          const result = await controller.moveTool({ ...request, signal: options.signal });
          return resultWithState({
            ok: true,
            accepted: result.accepted,
            finalTcp: result.accepted.tcp,
            diagnostics: result.diagnostics,
            appliedSpeedMmS: result.appliedSpeedMmS,
            durationMs: result.durationMs
          });
        } catch (error) {
          return resultWithState({
            ok: false,
            reason: normalizeReason(error.code),
            details: error.details ?? {},
            finalTcp: controller.getState().tcp
          });
        }
      },
      async latch(request = {}) {
        const result = await controller.latch(request);
        if (!result.success) return resultWithState({ ok: false, reason: normalizeReason(result.reason), ...result });
        const brick = controller.getBricks().find((candidate) => candidate.id === result.brickId) ?? null;
        return resultWithState({ ok: true, ...result, brick: brick ? brickObject(brick) : null, heldBrickId: result.brickId });
      },
      async unlatch(request = {}) {
        const result = await controller.unlatch(request);
        if (!result.success) return resultWithState({ ok: false, reason: normalizeReason(result.reason), ...result });
        const brick = controller.getBricks().find((candidate) => candidate.id === result.brickId) ?? null;
        const target = result.targetId ? board.getTarget(result.targetId) : null;
        return resultWithState({
          ok: true,
          ...result,
          brick: brick ? brickObject(brick) : null,
          finalPose: clone(result.finalPosition),
          targetSnap: result.snapped && target ? { targetId: target.id, position: clone(target.position), yawRad: target.yawRad } : null,
          correctness: Boolean(result.correctness),
          correct: Boolean(result.correctness)
        });
      },
      async reset(request = {}) {
        const state = await controller.reset({ bricks: resetBricks ? resetBricks() : controller.getBricks() });
        return { ok: true, state, worldRevision: state.worldRevision, expectedWorldRevision: request.expectedWorldRevision };
      }
    },
    human: {
      moveLooseBrick(brickId, position) {
        return controller.moveLooseBrick(brickId, position, { actor: 'human' });
      }
    },
    game: {
      async getBuildState(filters = {}) {
        return {
          ...board.getBuildState(filters),
          heldBrickId: controller.getState().heldBrickId,
          robotSpeedCapMmS: controller.speedLimitMmS
        };
      },
      async claimTarget(targetId, owner = 'agent', expectedWorldRevision = undefined) {
        if (expectedWorldRevision !== undefined && expectedWorldRevision !== worldRevision()) {
          return { ok: false, reason: 'stale_state', expectedWorldRevision, worldRevision: worldRevision() };
        }
        return board.claimTarget(targetId, owner);
      }
    },
    world: {
      getSnapshotData() {
        return { worldRevision: worldRevision(), objects: currentObjects() };
      },
      getObjectById(id) {
        return currentObjects().find((object) => object.id === id) ?? null;
      },
      getCamera(cameraId, size = { widthPx: 640, heightPx: 360 }) {
        const widthPx = Number(size.widthPx);
        const heightPx = Number(size.heightPx);
        if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx)) return null;
        const rig = createCameraRig({ widthPx, heightPx, cameraConfigs: PRODUCTION_CAMERA_CONFIGS });
        return rig.getCamera(cameraId, worldRevision());
      }
    }
  };
  return Object.freeze(runtime);
}

export { PRODUCTION_CAMERA_CONFIGS };
