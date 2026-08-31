import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { createCameraRig } from '../perception/camera-rig.js';
import { objectWorldCorners } from '../perception/projection.js';
import { forwardKinematics } from '../robot/kinematics.js';
import { CHALLENGE_LAYOUT } from '../robot/ur10-definition.js';

const clone = (value) => structuredClone(value);
const PRODUCTION_CAMERA_CONFIGS = Object.freeze({
  tray_camera: Object.freeze({ position: [520, -230, 680], target: [520, -230, 0], halfWidth: 82 }),
  canvas_camera: Object.freeze({ position: [655, 220, 680], target: [655, 220, 0], halfWidth: 92 })
});

function boundsWithHeight(bounds, minZ = 0, maxZ = minZ + BRICK_SPEC.bodyHeightMm) {
  return { ...bounds, minZ, maxZ };
}

export function placedBuildBounds(objects = []) {
  const points = objects
    .filter((object) => object?.type === 'brick' && ['placed', 'snapped'].includes(object.state))
    .flatMap((object) => objectWorldCorners(object));
  if (!points.length) return null;
  const axes = [0, 1, 2].map((axis) => points.map((point) => point[axis]));
  return {
    minX: Math.min(...axes[0]), maxX: Math.max(...axes[0]),
    minY: Math.min(...axes[1]), maxY: Math.max(...axes[1]),
    minZ: Math.min(...axes[2]), maxZ: Math.max(...axes[2])
  };
}

function boundsCentre(bounds) {
  return [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    ((bounds.minZ ?? 0) + (bounds.maxZ ?? 0)) / 2
  ];
}

function spanAlong(bounds, axis) {
  const values = [];
  for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) {
    values.push(x * axis[0] + y * axis[1]);
  }
  return Math.max(...values) - Math.min(...values);
}

function overheadCameraForBounds(bounds, size, heightMm = 680, marginMm = 40) {
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreY = (bounds.minY + bounds.maxY) / 2;
  const centreZ = ((bounds.minZ ?? 0) + (bounds.maxZ ?? 0)) / 2;
  const aspect = size.widthPx / size.heightPx;
  const halfWidth = Math.max(
    (bounds.maxX - bounds.minX) / 2 + marginMm,
    ((bounds.maxY - bounds.minY) / 2 + marginMm) * aspect,
    72
  );
  const positionZ = Math.max((bounds.maxZ ?? centreZ) + heightMm, centreZ + heightMm);
  return { position: [centreX, centreY, positionZ], target: [centreX, centreY, centreZ], up: [0, 1, 0], halfWidth, farMm: heightMm * 2 + 600 };
}

function sideCameraForBounds(bounds, size, side, tableFrame = null) {
  const [centreX, centreY, centreZ] = boundsCentre(bounds);
  const aspect = size.widthPx / size.heightPx;
  const xAxis = tableFrame?.xAxis ?? [1, 0, 0];
  const yAxis = tableFrame?.yAxis ?? [0, 1, 0];
  const horizontalSpan = spanAlong(bounds, yAxis);
  const verticalSpan = (bounds.maxZ ?? centreZ) - (bounds.minZ ?? centreZ);
  const halfWidth = Math.max(horizontalSpan / 2 + 48, (verticalSpan / 2 + 48) * aspect, 120);
  const offsetX = Math.max(760, spanAlong(bounds, xAxis) + 520);
  const direction = side === 'left' ? -1 : 1;
  return {
    position: [centreX + xAxis[0] * offsetX * direction, centreY + xAxis[1] * offsetX * direction, centreZ],
    target: [centreX, centreY, centreZ],
    up: [0, 0, 1],
    halfWidth,
    farMm: offsetX * 2 + 800
  };
}

export function cameraConfigsForWorkcell(profile, size = { widthPx: 640, heightPx: 360 }, focusBounds = null) {
  if (!profile?.supplyZone || !profile?.buildZone) return PRODUCTION_CAMERA_CONFIGS;
  const buildBounds = focusBounds ?? boundsWithHeight(
    profile.buildZone,
    profile.placementSurfaceZMm,
    profile.placementSurfaceZMm + BRICK_SPEC.bodyHeightMm
  );
  const topCamera = overheadCameraForBounds(buildBounds, size, 900, 56);
  topCamera.up = profile.tableFrame?.yAxis ?? [0, 1, 0];
  return {
    tray_camera: overheadCameraForBounds(boundsWithHeight(profile.supplyZone, profile.tableSurfaceZMm, profile.tableSurfaceZMm + BRICK_SPEC.bodyHeightMm), size),
    canvas_camera: overheadCameraForBounds(buildBounds, size, 680, 40),
    top_camera: topCamera,
    left_camera: sideCameraForBounds(buildBounds, size, 'left', profile.tableFrame),
    right_camera: sideCameraForBounds(buildBounds, size, 'right', profile.tableFrame)
  };
}

const STABLE_ERROR_MAP = Object.freeze({
  no_ik_solution: 'ik_failed',
  joint_limit: 'ik_failed'
});

function normalizeReason(reason) {
  return STABLE_ERROR_MAP[reason] ?? reason ?? 'internal_error';
}

function brickObject(brick) {
  const state = brick.heldBy ? 'held' : brick.snapped ? 'snapped' : brick.placementType ? 'placed' : 'free';
  return {
    id: brick.id,
    type: 'brick',
    colour: brick.colour,
    position: clone(brick.position),
    bounds: { xMm: BRICK_SPEC.lengthMm, yMm: BRICK_SPEC.widthMm, zMm: BRICK_SPEC.bodyHeightMm },
    yawDeg: Number(brick.yawRad ?? 0) * 180 / Math.PI,
    state,
    held: Boolean(brick.heldBy),
    ownership: brick.ownership ?? brick.heldBy ?? null,
    visible: true,
    occluder: true,
    placedTargetId: brick.placedTargetId ?? null,
    placementType: brick.placementType ?? null,
    connection: brick.connection ? clone(brick.connection) : null
    ,graspable: brick.graspable !== false
    ,reachability: brick.reachability ? clone(brick.reachability) : null
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

export function createLogoRoboRuntime({ controller, board, resetBricks = null, humanBuildAdapter = null, placementAuthority = null, fastPlacement = null, workcellProfile = null, getUserCamera = null, captureCamera = null, placementPreviewObserver = null }) {
  if (!controller || !board) throw new TypeError('controller and board are required');

  function worldRevision() { return controller.getState().worldRevision; }

  function structureObjects() {
    const activeLayout = workcellProfile?.layout ?? CHALLENGE_LAYOUT;
    const tray = activeLayout.tray;
    const boardLayout = activeLayout.board;
    const wall = 6;
    const structures = [];
    if (boardLayout) structures.push(
      { id: 'structure-board', type: 'structure', position: { xMm: (boardLayout.minX + boardLayout.maxX) / 2, yMm: (boardLayout.minY + boardLayout.maxY) / 2, zMm: boardLayout.surfaceZ / 2 }, bounds: { xMm: boardLayout.maxX - boardLayout.minX, yMm: boardLayout.maxY - boardLayout.minY, zMm: boardLayout.surfaceZ }, visible: true, occluder: true },
    );
    if (tray) structures.push(
      { id: 'structure-tray-left', type: 'structure', position: { xMm: tray.minX, yMm: (tray.minY + tray.maxY) / 2, zMm: tray.floorZ + tray.wallHeight / 2 }, bounds: { xMm: wall, yMm: tray.maxY - tray.minY, zMm: tray.wallHeight }, visible: true, occluder: true },
      { id: 'structure-tray-right', type: 'structure', position: { xMm: tray.maxX, yMm: (tray.minY + tray.maxY) / 2, zMm: tray.floorZ + tray.wallHeight / 2 }, bounds: { xMm: wall, yMm: tray.maxY - tray.minY, zMm: tray.wallHeight }, visible: true, occluder: true },
      { id: 'structure-tray-front', type: 'structure', position: { xMm: (tray.minX + tray.maxX) / 2, yMm: tray.minY, zMm: tray.floorZ + tray.wallHeight / 2 }, bounds: { xMm: tray.maxX - tray.minX, yMm: wall, zMm: tray.wallHeight }, visible: true, occluder: true },
      { id: 'structure-tray-back', type: 'structure', position: { xMm: (tray.minX + tray.maxX) / 2, yMm: tray.maxY, zMm: tray.floorZ + tray.wallHeight / 2 }, bounds: { xMm: tray.maxX - tray.minX, yMm: wall, zMm: tray.wallHeight }, visible: true, occluder: true }
    );
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
          // This is a conservative axis-aligned diagnostic envelope, not a
          // calibrated visual-link mesh. Treating it as a camera occluder can
          // hide the entire supply zone even when the rendered arm does not.
          occluder: false
        });
      }
    }
    return structures;
  }

  function currentObjects() { return [...controller.getBricks().map(brickObject), ...board.getTargets().map(targetObject), ...structureObjects()]; }
  function robotState() { return { ok: true, ...controller.getState(), coordinateFrame: 'machine-mm-rad' }; }
  function resultWithState(result) { return { ...result, state: robotState(), worldRevision: worldRevision() }; }
  function publicPlacementState(state = {}) {
    return {
      ok: state.ok !== false,
      reason: state.reason ?? null,
      cacheId: state.cacheId ?? null,
      status: state.status ?? 'NONE',
      queueLength: state.queueLength ?? state.queue?.length ?? 0,
      maximumLookahead: state.maximumLookahead ?? 5,
      planningDurationMs: state.planningDurationMs ?? null,
      running: Boolean(state.running),
      worldRevision: state.worldRevision ?? worldRevision(),
      queue: (state.queue ?? []).map((proposal) => ({
        proposalId: proposal.proposalId,
        slotIndex: proposal.slotIndex,
        slotLabel: proposal.slotLabel,
        status: proposal.status,
        reason: proposal.reason ?? null,
        expectedWorldRevision: proposal.expectedWorldRevision,
        brickId: proposal.brickId,
        colour: proposal.brick?.colour ?? proposal.requestedColour ?? null,
        sourcePosition: proposal.brick?.position ? clone(proposal.brick.position) : null,
        targetPosition: proposal.candidate?.position
          ? clone(proposal.candidate.position)
          : proposal.requestedPosition ? clone(proposal.requestedPosition) : null,
        targetYawDeg: Number(proposal.candidate?.yawRad ?? proposal.yawRad ?? 0) * 180 / Math.PI,
        sourceReassigned: Boolean(proposal.sourceReassigned),
        trajectory: proposal.trajectory ? {
          shape: proposal.trajectory.shape,
          safeZMm: proposal.trajectory.safeZMm,
          waypoints: proposal.trajectory.waypoints.map((waypoint) => ({
            stage: waypoint.stage,
            action: waypoint.action,
            brickId: waypoint.brickId,
            tcp: waypoint.tcp ? clone(waypoint.tcp) : undefined
          }))
        } : null
      }))
    };
  }

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
          recommendedClearanceZMm: workcellProfile?.safeClearanceZMm ?? 400,
          recommendedTransferTcp: clone(workcellProfile?.recommendedTransferTcp ?? { xMm: 600, yMm: 0, zMm: 450 }),
          workcellProfileId: workcellProfile?.id ?? 'challenge-evidence-v2',
          supplyZone: workcellProfile ? clone(workcellProfile.supplyZone) : null,
          buildZone: workcellProfile ? clone(workcellProfile.buildZone) : null,
          placementSurfaceZMm: workcellProfile?.placementSurfaceZMm ?? CHALLENGE_LAYOUT.board.surfaceZ
        };
      },
      async moveTool(request = {}, options = {}) {
        try {
          const result = await controller.moveTool({
            ...request,
            yawRad: Number.isFinite(request.yawDeg) ? request.yawDeg * Math.PI / 180 : undefined,
            signal: options.signal
          });
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
      },
      pickup(brickId) { return humanBuildAdapter?.pickup(brickId) ?? { ok: false, reason: 'player_unavailable' }; },
      rotate(direction = 1) { return humanBuildAdapter?.rotate(direction) ?? { ok: false, reason: 'player_unavailable' }; },
      release() { return humanBuildAdapter?.release() ?? { ok: false, reason: 'player_unavailable' }; },
      undo() { return humanBuildAdapter?.undo() ?? { ok: false, reason: 'player_unavailable' }; },
      drop(position = null) { return humanBuildAdapter?.drop(position) ?? { ok: false, reason: 'player_unavailable' }; },
      cancel() { return humanBuildAdapter?.cancel() ?? { ok: false, reason: 'player_unavailable' }; },
      getState() { return humanBuildAdapter?.getState() ?? { mode: 'UNAVAILABLE', locked: true, heldBrickId: null }; }
    },
    placement: {
      getQueue() {
        return fastPlacement
          ? publicPlacementState({ ok: true, ...fastPlacement.getState() })
          : { ok: false, reason: 'placement_unavailable', worldRevision: worldRevision() };
      },
      planQueue(request = {}) {
        if (!fastPlacement) return { ok: false, reason: 'placement_unavailable', worldRevision: worldRevision() };
        return publicPlacementState(fastPlacement.planQueue(request.placements, { expectedWorldRevision: request.expectedWorldRevision }));
      },
      async executeNext(request = {}, options = {}) {
        if (!fastPlacement) return { ok: false, reason: 'placement_unavailable', worldRevision: worldRevision() };
        const result = await fastPlacement.execute({
          proposalId: request.proposalId,
          physicalSpeedMmS: request.physicalSpeedMmS,
          playbackMultiplier: request.playbackMultiplier,
          signal: options.signal
        });
        return {
          ok: result.ok,
          reason: result.reason ?? null,
          cacheId: result.cacheId ?? fastPlacement.getState().cacheId,
          proposalId: result.proposalId ?? request.proposalId,
          brickId: result.brickId ?? null,
          finalPosition: result.finalPosition ? clone(result.finalPosition) : null,
          placementType: result.placementType ?? null,
          targetId: result.targetId ?? null,
          physicalDurationMs: result.physicalDurationMs ?? null,
          playbackDurationMs: result.playbackDurationMs ?? null,
          executionWallDurationMs: result.executionWallDurationMs ?? null,
          playbackMultiplier: result.playbackMultiplier ?? request.playbackMultiplier,
          physicalSpeedMmS: result.physicalSpeedMmS ?? request.physicalSpeedMmS,
          stages: (result.stages ?? []).map((stage) => ({ stage: stage.stage, durationMs: stage.durationMs ?? null, brickId: stage.brickId ?? null })),
          remainingQueued: result.remainingQueued ?? fastPlacement.getState().queueLength,
          worldRevision: result.worldRevision ?? worldRevision()
        };
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
      previewPlacement(request = {}) {
        if (!placementAuthority) return { ok: false, reason: 'placement_unavailable', worldRevision: worldRevision() };
        if (request.expectedWorldRevision !== worldRevision()) {
          return { ok: false, reason: 'stale_state', expectedWorldRevision: request.expectedWorldRevision, worldRevision: worldRevision() };
        }
        const result = placementAuthority.preview({
          brickId: request.brickId,
          position: Number.isFinite(request.xMm) && Number.isFinite(request.yMm) && Number.isFinite(request.zMm)
            ? { xMm: request.xMm, yMm: request.yMm, zMm: request.zMm }
            : null,
          yawRad: Number(request.yawDeg ?? 0) * Math.PI / 180,
          supportBrickId: request.supportBrickId ?? null,
          supportSide: request.supportSide ?? 'M',
          carriedSide: request.carriedSide ?? null
        });
        const robotState = controller.getState();
        const heldYawOffset = robotState.heldBrickId === request.brickId
          ? robotState.gripper?.brickYawInTcpRad
          : null;
        const requiredToolYawDeg = result.ok && Number.isFinite(heldYawOffset)
          ? (result.candidate.yawRad - heldYawOffset) * 180 / Math.PI
          : null;
        const publicResult = Number.isFinite(requiredToolYawDeg) ? {
          ...result,
          requiredToolYawDeg,
          requiredTcp: { ...result.requiredTcp, yawDeg: requiredToolYawDeg },
          approachTcp: { ...result.approachTcp, yawDeg: requiredToolYawDeg },
          retreatTcp: { ...result.retreatTcp, yawDeg: requiredToolYawDeg }
        } : result;
        try { placementPreviewObserver?.(request, publicResult); } catch { /* an optional visual observer cannot invalidate a read-only tool */ }
        return publicResult;
      },
      getCamera(cameraId, size = { widthPx: 640, heightPx: 360 }) {
        const widthPx = Number(size.widthPx);
        const heightPx = Number(size.heightPx);
        if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx)) return null;
        const focusBounds = placedBuildBounds(currentObjects());
        const cameraConfigs = { ...cameraConfigsForWorkcell(workcellProfile, { widthPx, heightPx }, focusBounds) };
        if (cameraId === 'user_camera') {
          const userCamera = getUserCamera?.({ widthPx, heightPx, worldRevision: worldRevision() });
          if (!userCamera) return null;
          cameraConfigs.user_camera = userCamera;
        }
        const rig = createCameraRig({ widthPx, heightPx, cameraConfigs });
        return rig.getCamera(cameraId, worldRevision());
      },
      captureCamera(request = {}) {
        if (typeof captureCamera !== 'function') return { ok: false, reason: 'camera_unavailable', cameraId: request.cameraId ?? null, worldRevision: worldRevision() };
        const before = worldRevision();
        const descriptor = runtime.world.getCamera(request.cameraId, { widthPx: request.widthPx, heightPx: request.heightPx });
        if (!descriptor) return { ok: false, reason: 'camera_unavailable', cameraId: request.cameraId ?? null, worldRevision: before };
        const result = captureCamera(descriptor, request);
        const after = worldRevision();
        if (after !== before) return { ok: false, reason: 'internal_error', message: 'Camera capture changed world state.', worldRevision: after };
        return { ...result, worldRevision: before };
      }
    }
  };
  return Object.freeze(runtime);
}

export { PRODUCTION_CAMERA_CONFIGS };
