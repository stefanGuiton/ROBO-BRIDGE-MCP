import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { createCameraRig, CAMERA_IDS } from './camera-rig.js';
import { objectPoseRecord, projectObjectBounds } from './projection.js';
import { visibilityForObject } from './visibility.js';

const MAX_LIMIT = 20;
const clone = (value) => structuredClone(value);

function cameraMetadata(camera) {
  return {
    coordinateFrame: 'machine-mm-rad',
    projection: camera.projection,
    positionMm: clone(camera.position),
    targetMm: clone(camera.target),
    up: clone(camera.up ?? [0, 1, 0]),
    fovYDeg: camera.fovYDeg ?? null,
    halfWidthMm: camera.halfWidth ?? null,
    nearMm: camera.nearMm,
    farMm: camera.farMm,
    matrixConvention: 'row-major; column-vector; clip=P*V*point'
  };
}

function actionTcp(object, pose) {
  if (object.type === 'brick') {
    if (object.reachability?.pickupTcp) return clone(object.reachability.pickupTcp);
    return { xMm: pose.worldXmm, yMm: pose.worldYmm, zMm: pose.worldZmm + BRICK_SPEC.capture.tcpAboveCentreMm };
  }
  if (object.type === 'target') {
    return { xMm: pose.worldXmm, yMm: pose.worldYmm, zMm: pose.worldZmm + BRICK_SPEC.capture.tcpAboveCentreMm };
  }
  return null;
}

export function createObservationService({ bridge, cameraRig = createCameraRig() } = {}) {
  const snapshots = new Map();
  let sequence = 0;
  let activeDetection = null;

  async function observe(input = {}) {
    const cameraId = input.cameraId ?? 'tray_camera';
    if (!CAMERA_IDS.includes(cameraId)) return { ok: false, reason: 'invalid_input', message: 'Unknown cameraId.' };
    const limit = input.limit === undefined ? 12 : input.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { ok: false, reason: 'invalid_input', message: `limit must be 1..${MAX_LIMIT}.` };
    const snapshotData = await bridge.world.getSnapshotData();
    if (snapshotData?.ok === false) return snapshotData;
    const revision = snapshotData.worldRevision;
    const objects = snapshotData.objects;
    const runtimeCamera = bridge.getCamera?.(cameraId, cameraRig.getSize()) ?? null;
    const camera = bridge.runtimeCameraAuthority ? runtimeCamera : (runtimeCamera ?? cameraRig.getCamera(cameraId, revision));
    if (!camera) return { ok: false, reason: 'camera_unavailable', message: `${cameraId} is unavailable.` };
    const detections = [];
    for (const object of objects) {
      if (!['brick', 'target'].includes(object.type)) continue;
      if (input.colour && String(object.colour).toLowerCase() !== String(input.colour).toLowerCase()) continue;
      if (input.type && object.type !== input.type) continue;
      const projection = projectObjectBounds(object, camera);
      if (!projection) continue;
      const visibility = visibilityForObject(object, objects, camera);
      if (!visibility.visible) continue;
      const pose = objectPoseRecord(object);
      detections.push({
        objectId: object.id,
        type: object.type ?? 'brick',
        colour: object.colour ?? 'unknown',
        bboxPx: projection.bboxPx.map((value) => Math.round(value * 10) / 10),
        centrePx: projection.centrePx.map((value) => Math.round(value * 10) / 10),
        ...pose,
        recommendedTcp: actionTcp(object, pose),
        recommendedPickupTcp: object.type === 'brick' ? actionTcp(object, pose) : null,
        safeApproachTcp: object.reachability?.safeApproachTcp ? clone(object.reachability.safeApproachTcp) : null,
        liftTcp: object.reachability?.liftTcp ? clone(object.reachability.liftTcp) : null,
        reachable: object.type === 'brick' ? object.reachability?.reachable === true : null,
        reachabilityReason: object.type === 'brick' && object.reachability?.reachable !== true ? 'not_validated' : null,
        graspable: object.type === 'brick' ? object.graspable !== false && object.state === 'free' : null,
        heldBy: object.ownership ?? null,
        snapped: object.state === 'snapped',
        placedTargetId: object.placedTargetId ?? null,
        visible: true,
        visibilityModel: 'five-ray-aabb-approximation',
        visibleFraction: visibility.visibleFraction,
        clipped: projection.clipped,
        state: object.state ?? (object.held ? 'held' : 'free')
      });
    }
    detections.sort((a, b) => b.visibleFraction - a.visibleFraction || a.objectId.localeCompare(b.objectId));
    const snapshot = Object.freeze({ ok: true, cameraId, sequence: ++sequence, snapshotRevision: revision, widthPx: camera.widthPx, heightPx: camera.heightPx, camera: cameraMetadata(camera), approximateOcclusion: true, detections: detections.slice(0, limit) });
    snapshots.set(cameraId, snapshot);
    return clone(snapshot);
  }

  function getSnapshot(cameraId) { const snapshot = snapshots.get(cameraId); return snapshot ? clone(snapshot) : null; }

  function associateMove({ xMm, yMm, zMm, toleranceMm = 30 }) {
    let best = null;
    let bestDistance = Infinity;
    for (const snapshot of snapshots.values()) {
      for (const detection of snapshot.detections) {
        const tcp = detection.recommendedTcp ?? { xMm: detection.worldXmm, yMm: detection.worldYmm, zMm: detection.worldZmm };
        const distance = Math.hypot(xMm - tcp.xMm, yMm - tcp.yMm, (zMm - tcp.zMm) * 0.35);
        if (distance < bestDistance && distance <= toleranceMm) {
          best = { ...detection, snapshotRevision: snapshot.snapshotRevision };
          bestDistance = distance;
        }
      }
    }
    if (best) activeDetection = clone(best);
    return best ? clone(best) : null;
  }

  function setActiveObject(objectId) {
    for (const snapshot of snapshots.values()) {
      const detection = snapshot.detections.find((candidate) => candidate.objectId === objectId);
      if (detection) { activeDetection = { ...clone(detection), snapshotRevision: snapshot.snapshotRevision }; return clone(activeDetection); }
    }
    activeDetection = { objectId };
    return clone(activeDetection);
  }

  return Object.freeze({ observe, getSnapshot, associateMove, setActiveObject, getActiveDetection: () => activeDetection ? clone(activeDetection) : null, cameraRig });
}
