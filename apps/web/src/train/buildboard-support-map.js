'use strict';

import { DEFAULT_SUPPORT_SETTINGS } from './constants.js';
import { checksumHex, clamp, cloneValue, deepFreezePlain, finite, round6 } from './math.js';
import {
  createRouteFrame,
  normalizeTrainWorldTransform,
  routeLocalPointToMachine,
  routeFrameIdentity
} from './route-frame.js';

function requirePlan(plan) {
  if (!plan || plan.schemaVersion !== '4.6' || !plan.geometry?.masterSlice || !plan.geometry?.grid) {
    throw new TypeError('A frozen V4.6 BuildPlan is required.');
  }
}

function placementIdForStandard(plan, basePlacementId, sliceIndex) {
  return `${plan.planId}.s.${basePlacementId}.${sliceIndex}`;
}

function placementIdForCustom(plan, masterIndex, sliceIndex, repeatAcrossSlices) {
  return `${plan.planId}.c.${masterIndex}.${repeatAcrossSlices ? sliceIndex : 't'}`;
}

function acceptedRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.accepted === true) return true;
  if (record.correctness === true && (record.occupiedBy || record.placedBrickId || record.status === 'correct')) return true;
  if (record.status === 'correct' || record.status === 'accepted' || record.state === 'accepted') return true;
  return false;
}

export function createAcceptedBuildBoardSnapshot(source = {}) {
  const board = source || {};
  const targets = typeof board.getTargets === 'function'
    ? board.getTargets()
    : cloneValue(board.targets ?? board.buildState?.targets ?? []);
  const freePlacements = typeof board.getPlacements === 'function'
    ? board.getPlacements()
    : cloneValue(board.freePlacements ?? board.placements ?? board.buildState?.freePlacements ?? []);
  const explicitIds = board.acceptedPlacementIds instanceof Set
    ? [...board.acceptedPlacementIds]
    : Array.isArray(board.acceptedPlacementIds) ? board.acceptedPlacementIds : [];
  const ids = new Set(explicitIds.map(String));
  for (const target of targets || []) {
    if (!acceptedRecord(target)) continue;
    const id = target.placementId ?? target.targetId ?? target.id;
    if (id) ids.add(String(id));
  }
  for (const placement of freePlacements || []) {
    if (placement.accepted === false) continue;
    const id = placement.placementId ?? placement.targetId ?? placement.id;
    if (id) ids.add(String(id));
  }
  for (const placement of board.acceptedPlacements || []) {
    const id = placement.placementId ?? placement.targetId ?? placement.id;
    if (id) ids.add(String(id));
  }
  const sorted = [...ids].sort();
  return deepFreezePlain({
    schemaVersion: 'robo-bridge.accepted-buildboard-snapshot.v1',
    blueprintId: board.blueprintId ?? board.planId ?? board.buildState?.blueprintId ?? null,
    designChecksum: board.designChecksum ?? board.buildState?.designChecksum ?? null,
    worldRevision: finite(board.worldRevision ?? board.buildState?.worldRevision, 0),
    acceptedPlacementIds: sorted,
    acceptedChecksum: checksumHex(sorted),
    targetCount: Array.isArray(targets) ? targets.length : 0,
    freePlacementCount: Array.isArray(freePlacements) ? freePlacements.length : 0
  });
}

export function createAcceptedStructureOccupancy({ frozenBuildPlan, acceptedBuildBoardSnapshot } = {}) {
  requirePlan(frozenBuildPlan);
  const plan = frozenBuildPlan;
  const board = acceptedBuildBoardSnapshot?.schemaVersion === 'robo-bridge.accepted-buildboard-snapshot.v1'
    ? acceptedBuildBoardSnapshot
    : createAcceptedBuildBoardSnapshot(acceptedBuildBoardSnapshot);
  const accepted = new Set(board.acceptedPlacementIds);
  const grid = plan.geometry.grid;
  const slice = plan.geometry.sliceArray;
  const standardMasters = plan.geometry.masterSlice.placements || [];
  const customMasters = plan.geometry.masterSlice.customPlacements || [];
  const cells = new Map();
  const requiredTopByGridX = new Map();
  const placementRecords = [];

  const recordRequired = (gridX, gridY) => {
    requiredTopByGridX.set(gridX, Math.max(requiredTopByGridX.get(gridX) ?? -Infinity, gridY));
  };
  const setCell = (gridX, gridY, sliceIndex, placementId, partClass) => {
    const key = `${gridX}:${gridY}:${sliceIndex}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(placementId);
    placementRecords.push({ gridX, gridY, sliceIndex, placementId, partClass });
  };

  for (const master of standardMasters) {
    for (let gridX = master.gridX; gridX < master.gridX + master.lengthCells; gridX += 1) {
      recordRequired(gridX, master.gridY);
    }
    for (let sliceIndex = 0; sliceIndex < slice.count; sliceIndex += 1) {
      const id = placementIdForStandard(plan, master.basePlacementId, sliceIndex);
      if (!accepted.has(id)) continue;
      for (let gridX = master.gridX; gridX < master.gridX + master.lengthCells; gridX += 1) {
        setCell(gridX, master.gridY, sliceIndex, id, 'STANDARD_BRICK');
      }
    }
  }

  customMasters.forEach((master, masterIndex) => {
    if (master.partClass === 'TRACK_SEGMENT') return;
    for (const run of master.reservedRuns || []) {
      for (let gridY = run.y0; gridY <= run.y1; gridY += 1) recordRequired(run.gridX, gridY);
    }
    const repeat = master.repeatAcrossSlices !== false;
    const count = repeat ? slice.count : 1;
    for (let index = 0; index < count; index += 1) {
      const sliceIndex = repeat ? index : Math.floor((slice.count - 1) / 2);
      const id = placementIdForCustom(plan, masterIndex, index, repeat);
      if (!accepted.has(id)) continue;
      for (const run of master.reservedRuns || []) {
        for (let gridY = run.y0; gridY <= run.y1; gridY += 1) {
          setCell(run.gridX, gridY, sliceIndex, id, master.partClass || 'CUSTOM_ARCH');
        }
      }
    }
  });

  return {
    plan,
    board,
    grid,
    slice,
    cells,
    requiredTopByGridX,
    placementRecords,
    hasCell(gridX, gridY, sliceIndex) {
      return cells.has(`${gridX}:${gridY}:${sliceIndex}`);
    },
    evidenceForCell(gridX, gridY, sliceIndex) {
      return cloneValue(cells.get(`${gridX}:${gridY}:${sliceIndex}`) || []);
    }
  };
}

function resolveTrackDefinition(plan) {
  const definitionId = plan.geometry.track?.definitionId;
  return plan.catalogue?.customDefinitions?.find((item) => item.definitionId === definitionId)
    || plan.catalogue?.customDefinitions?.find((item) => item.partClass === 'TRACK_SEGMENT')
    || null;
}

function trackPlacements(plan) {
  return (plan.geometry.masterSlice.customPlacements || [])
    .filter((placement) => placement.partClass === 'TRACK_SEGMENT')
    .sort((left, right) => finite(left.trackIndex) - finite(right.trackIndex));
}

export function createBuildBoardSupportMap({
  frozenBuildPlan,
  acceptedBuildBoardSnapshot,
  worldTransform = {},
  sampleCount = DEFAULT_SUPPORT_SETTINGS.sampleCount,
  minimumAcceptedSlices = DEFAULT_SUPPORT_SETTINGS.minimumAcceptedSlices,
  minimumSupportedSampleRatio = DEFAULT_SUPPORT_SETTINGS.minimumSupportedSampleRatio
} = {}) {
  requirePlan(frozenBuildPlan);
  const plan = frozenBuildPlan;
  const board = acceptedBuildBoardSnapshot?.schemaVersion === 'robo-bridge.accepted-buildboard-snapshot.v1'
    ? acceptedBuildBoardSnapshot
    : createAcceptedBuildBoardSnapshot(acceptedBuildBoardSnapshot);
  if (board.blueprintId && board.blueprintId !== plan.planId) {
    throw new Error(`BuildBoard plan mismatch: expected ${plan.planId}, got ${board.blueprintId}.`);
  }
  if (board.designChecksum && board.designChecksum !== plan.designChecksum) {
    throw new Error('BuildBoard design checksum does not match the frozen BuildPlan.');
  }
  const occupancy = createAcceptedStructureOccupancy({ frozenBuildPlan: plan, acceptedBuildBoardSnapshot: board });
  const frame = createRouteFrame({ frozenBuildPlan: plan, worldTransform });
  const transform = normalizeTrainWorldTransform(worldTransform);
  const tracks = trackPlacements(plan);
  if (!tracks.length) throw new Error('The frozen BuildPlan has no track segments.');
  const definition = resolveTrackDefinition(plan);
  const nominalLength = finite(definition?.parameters?.segmentLength, frame.lengthMm / tracks.length);
  const segmentLengthMm = nominalLength * transform.scale;
  const samplesPerSegment = Math.max(3, Math.round(sampleCount));
  const minimumSlices = clamp(Math.round(minimumAcceptedSlices), 1, plan.geometry.sliceArray.count);
  const sampleRatio = clamp(finite(minimumSupportedSampleRatio, 0.68), 0.1, 1);
  const requiredSamples = Math.ceil(samplesPerSegment * sampleRatio - 1e-9);
  const anchors = plan.anchors;
  const grid = plan.geometry.grid;
  const routeStartLocalX = finite(anchors.entry.innerFaceX);

  const segments = tracks.map((track, index) => {
    const centreLocalX = finite(track.centreX);
    const startLocalX = centreLocalX - nominalLength * 0.5;
    const endLocalX = centreLocalX + nominalLength * 0.5;
    const startMm = (startLocalX - routeStartLocalX) * transform.scale;
    const endMm = (endLocalX - routeStartLocalX) * transform.scale;
    const sampleEvidence = [];
    for (let sampleIndex = 0; sampleIndex < samplesPerSegment; sampleIndex += 1) {
      const fraction = (sampleIndex + 0.5) / samplesPerSegment;
      const localX = startLocalX + (endLocalX - startLocalX) * fraction;
      const gridX = Math.floor((localX - finite(anchors.group?.x)) / grid.dx + 1e-7);
      const topGridY = occupancy.requiredTopByGridX.get(gridX);
      const acceptedSlices = [];
      const missingSlices = [];
      const supportingPlacementIds = new Set();
      if (Number.isFinite(topGridY)) {
        for (let sliceIndex = 0; sliceIndex < occupancy.slice.count; sliceIndex += 1) {
          if (occupancy.hasCell(gridX, topGridY, sliceIndex)) {
            acceptedSlices.push(sliceIndex);
            for (const id of occupancy.evidenceForCell(gridX, topGridY, sliceIndex)) supportingPlacementIds.add(id);
          } else {
            missingSlices.push(sliceIndex);
          }
        }
      } else {
        for (let sliceIndex = 0; sliceIndex < occupancy.slice.count; sliceIndex += 1) missingSlices.push(sliceIndex);
      }
      const supported = Number.isFinite(topGridY) && acceptedSlices.length >= minimumSlices;
      const forwardMm = (localX - routeStartLocalX) * transform.scale;
      sampleEvidence.push({
        sampleIndex,
        fraction: round6(fraction),
        forwardMm: round6(forwardMm),
        machinePointMm: routeLocalPointToMachine(frame, { x: forwardMm, y: 0, z: 0 }),
        sourceLocalX: round6(localX),
        gridX,
        topRequiredGridY: Number.isFinite(topGridY) ? topGridY : null,
        acceptedSliceCount: acceptedSlices.length,
        requiredSliceCount: minimumSlices,
        acceptedSlices,
        missingSlices,
        supportingPlacementIds: [...supportingPlacementIds].sort(),
        supported,
        reason: !Number.isFinite(topGridY)
          ? 'NO_REQUIRED_STRUCTURE'
          : supported ? 'ACCEPTED_TOP_SUPPORT' : 'INSUFFICIENT_ACCEPTED_SLICES'
      });
    }
    const supportedSampleCount = sampleEvidence.filter((sample) => sample.supported).length;
    const supported = supportedSampleCount >= requiredSamples;
    const supportingPlacementIds = [...new Set(sampleEvidence.flatMap((sample) => sample.supportingPlacementIds))].sort();
    return {
      id: Number.isFinite(Number(track.trackIndex)) ? Number(track.trackIndex) : index,
      trackPlacementId: placementIdForCustom(plan, plan.geometry.masterSlice.customPlacements.indexOf(track), 0, false),
      startMm: round6(startMm),
      endMm: round6(endMm),
      centreMm: round6((startMm + endMm) * 0.5),
      lengthMm: round6(segmentLengthMm),
      progressStart: round6(startMm / frame.lengthMm),
      progressEnd: round6(endMm / frame.lengthMm),
      machineStartMm: routeLocalPointToMachine(frame, { x: startMm, y: 0, z: 0 }),
      machineEndMm: routeLocalPointToMachine(frame, { x: endMm, y: 0, z: 0 }),
      supported,
      supportedSampleCount,
      requiredSupportedSampleCount: requiredSamples,
      sampleCount: samplesPerSegment,
      minimumAcceptedSlices: minimumSlices,
      score: round6(supportedSampleCount / samplesPerSegment),
      supportingPlacementIds,
      evidence: sampleEvidence,
      trackVisualStateIgnored: true
    };
  });

  const firstUnsupported = segments.find((segment) => !segment.supported) || null;
  const result = {
    schemaVersion: 'robo-bridge.train-support-map.v2',
    ready: true,
    planIdentity: {
      planId: plan.planId,
      designChecksum: plan.designChecksum,
      designRevision: plan.designRevision,
      frozen: Object.isFrozen(plan)
    },
    buildBoard: {
      blueprintId: board.blueprintId,
      worldRevision: board.worldRevision,
      acceptedChecksum: board.acceptedChecksum,
      acceptedPlacementCount: board.acceptedPlacementIds.length
    },
    worldTransform: cloneValue(transform),
    routeFrame: cloneValue(frame),
    route: {
      coordinateFrame: 'route-local-mm',
      startMm: 0,
      endMm: frame.lengthMm,
      lengthMm: frame.lengthMm,
      entryOuterMm: -frame.entryLengthMm,
      exitOuterMm: frame.lengthMm + frame.exitLengthMm,
      trackTopMm: 0,
      bridgeWidthMm: frame.bridgeWidthMm,
      originMachineMm: cloneValue(frame.originMm),
      endMachineMm: cloneValue(frame.endMachineMm),
      forward: cloneValue(frame.forward),
      lateral: cloneValue(frame.right),
      up: cloneValue(frame.up)
    },
    routeIdentity: routeFrameIdentity(frame),
    family: plan.geometry.family,
    algorithm: {
      name: 'ACCEPTED_BUILD_BOARD_TOP_SUPPORT_V2',
      sampleCount: samplesPerSegment,
      minimumAcceptedSlices: minimumSlices,
      minimumSupportedSampleRatio: sampleRatio,
      requiredSupportedSampleCount: requiredSamples,
      trackVisualStateIgnored: true,
      authority: 'accepted-buildboard-snapshot'
    },
    segmentCount: segments.length,
    supportedCount: segments.filter((segment) => segment.supported).length,
    allSupported: segments.length > 0 && !firstUnsupported,
    firstUnsupportedSegment: firstUnsupported?.id ?? null,
    firstUnsupportedProgress: firstUnsupported ? clamp(firstUnsupported.progressStart, 0, 1) : null,
    segments
  };
  result.checksum = checksumHex({
    planId: plan.planId,
    designChecksum: plan.designChecksum,
    boardRevision: board.worldRevision,
    acceptedChecksum: board.acceptedChecksum,
    transform,
    segments: segments.map((segment) => [segment.id, segment.supported, segment.score, segment.supportingPlacementIds])
  });
  return deepFreezePlain(result);
}

export function segmentAtRouteDistance(supportMap, forwardMm) {
  if (!supportMap?.segments?.length) return null;
  return supportMap.segments.find((segment, index) => {
    if (index === supportMap.segments.length - 1) return forwardMm >= segment.startMm && forwardMm <= segment.endMm + 1e-6;
    return forwardMm >= segment.startMm && forwardMm < segment.endMm;
  }) || null;
}

export function createBuildBoardSupportMapAdapter(options = {}) {
  const getFrozenBuildPlan = options.getFrozenBuildPlan;
  const getAcceptedBuildBoardSnapshot = options.getAcceptedBuildBoardSnapshot;
  const getWorldTransform = options.getWorldTransform || (() => ({}));
  if (typeof getFrozenBuildPlan !== 'function' || typeof getAcceptedBuildBoardSnapshot !== 'function') {
    throw new TypeError('Support map adapter requires BuildPlan and BuildBoard snapshot providers.');
  }
  let current = null;
  return Object.freeze({
    refresh(overrides = {}) {
      current = createBuildBoardSupportMap({
        frozenBuildPlan: getFrozenBuildPlan(),
        acceptedBuildBoardSnapshot: getAcceptedBuildBoardSnapshot(),
        worldTransform: getWorldTransform(),
        sampleCount: overrides.sampleCount ?? options.sampleCount,
        minimumAcceptedSlices: overrides.minimumAcceptedSlices ?? options.minimumAcceptedSlices,
        minimumSupportedSampleRatio: overrides.minimumSupportedSampleRatio ?? options.minimumSupportedSampleRatio
      });
      return current;
    },
    getMap() { return current; },
    segmentAt(forwardMm) { return segmentAtRouteDistance(current, forwardMm); },
    invalidate() { current = null; }
  });
}

export const TRAIN_PLACEMENT_IDS = Object.freeze({
  standard: placementIdForStandard,
  custom: placementIdForCustom
});
