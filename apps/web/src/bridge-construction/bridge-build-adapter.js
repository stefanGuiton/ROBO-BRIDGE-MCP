'use strict';

import {
  createBuildBoardTargets,
  createConstructionPlacementStream,
  createExistingPlacementQueueChunks,
  normalizeWorldTransform
} from '../bridge-core/index.js';
import { createPlacementCompatibilityKey } from './part-registry.js';
import { createBridgeCollaboration, classifyBridgeCollaboration } from './bridge-collaboration.js';
import {
  addPosition,
  cloneFrozen,
  deepFreeze,
  invariant,
  rotateMachineOffset
} from './internal.js';

function insideWorkspace(point, workspace) {
  return point.xMm >= workspace.xMinMm && point.xMm <= workspace.xMaxMm
    && point.yMm >= workspace.yMinMm && point.yMm <= workspace.yMaxMm
    && point.zMm >= workspace.zMinMm && point.zMm <= workspace.zMaxMm;
}

function customProxyOffset(registryRecord, worldTransform) {
  const local = registryRecord.geometryOriginToProxyCentreLocal;
  if (!local) return { xMm: 0, yMm: 0, zMm: 0 };
  return rotateMachineOffset(local, worldTransform);
}

function normalizeEntry(entry, registry, worldTransform, workspace, collaborationRule) {
  const part = registry.resolve(entry);
  const renderPosition = { ...entry.position };
  const offset = customProxyOffset(part, worldTransform);
  const proxyPosition = addPosition(renderPosition, offset);
  const captureTcp = {
    xMm: proxyPosition.xMm,
    yMm: proxyPosition.yMm,
    zMm: proxyPosition.zMm + part.captureProxy.tcpAboveCentreMm
  };
  const targetReachable = insideWorkspace(captureTcp, workspace);
  const renderPose = {
    position: renderPosition,
    yawRad: entry.yawRad,
    uniformScale: worldTransform.scale
  };
  const collaboration = classifyBridgeCollaboration({ renderPose, worldTransform, collaboration: collaborationRule });
  const compatibilityKey = createPlacementCompatibilityKey(part, entry.material);
  return deepFreeze({
    ...entry,
    targetId: entry.placementId,
    registryKey: part.registryKey,
    registryId: part.registryId,
    compatibilityKey,
    colour: compatibilityKey,
    displayMaterial: entry.material,
    position: proxyPosition,
    proxyPose: {
      position: proxyPosition,
      yawRad: entry.yawRad
    },
    renderPose,
    renderOriginOffsetFromProxyMm: {
      xMm: -offset.xMm,
      yMm: -offset.yMm,
      zMm: -offset.zMm
    },
    logicalFootprint: part.logicalFootprint,
    physicalDimensions: part.physicalDimensions,
    collisionProxy: part.collisionProxy,
    captureProxy: part.captureProxy,
    robotTarget: {
      reachable: targetReachable,
      reason: targetReachable ? null : 'Capture TCP outside RobotController workspace.',
      requiredTcp: captureTcp,
      workspace
    },
    collaboration,
    allowedActors: ['human', 'agent'],
    actorAssignment: collaboration.advisoryActor,
    actorAssignmentReason: `${collaboration.side} bridge-local lateral side (advisory only; both actors allowed).`,
    originalActorPreference: entry.actorPreference
  });
}

function summary(placements) {
  const result = {
    totalPlacements: placements.length,
    assignedToAgent: 0,
    assignedToHuman: 0,
    reachableTargetCentres: 0,
    unreachableTargetCentres: 0,
    reachableCaptureTcpCount: 0,
    unreachableCaptureTcpCount: 0,
    byPartClass: {},
    byPartType: {},
    byDefinitionId: {}
  };
  for (const placement of placements) {
    result[placement.actorAssignment === 'agent' ? 'assignedToAgent' : 'assignedToHuman'] += 1;
    result[placement.robotTarget.reachable ? 'reachableTargetCentres' : 'unreachableTargetCentres'] += 1;
    result[placement.robotTarget.reachable ? 'reachableCaptureTcpCount' : 'unreachableCaptureTcpCount'] += 1;
    result.byPartClass[placement.partClass] = (result.byPartClass[placement.partClass] ?? 0) + 1;
    result.byPartType[placement.partType] = (result.byPartType[placement.partType] ?? 0) + 1;
    if (placement.customPartDefinitionId) {
      result.byDefinitionId[placement.customPartDefinitionId] = (result.byDefinitionId[placement.customPartDefinitionId] ?? 0) + 1;
    }
  }
  return deepFreeze(result);
}

export function createNormalisedBridgeConstruction({ frozenPlan, registry, workspace, resolveColour = null } = {}) {
  invariant(frozenPlan?.buildPlan?.schemaVersion === '4.6', 'BUILDPLAN_UNAVAILABLE', 'A frozen V4.6 bridge plan is required.');
  invariant(registry?.revision && registry?.hash, 'UNSUPPORTED_PART', 'A production bridge PartRegistry is required.');
  const worldTransform = normalizeWorldTransform(frozenPlan.worldTransform);
  const collaboration = createBridgeCollaboration({ buildPlan: frozenPlan.buildPlan });
  const raw = createConstructionPlacementStream(frozenPlan.buildPlan, worldTransform, {
    resolveColour: typeof resolveColour === 'function' ? resolveColour : () => null
  });
  const placements = raw.entries.map((entry) => normalizeEntry(entry, registry, worldTransform, workspace, collaboration));
  const unsupported = raw.entries.filter((entry) => !registry.supportsPart(entry));
  invariant(unsupported.length === 0, 'UNSUPPORTED_PART', 'The PartRegistry does not support the frozen plan.', {
    unsupported: unsupported.slice(0, 10).map((entry) => ({
      placementId: entry.placementId,
      partClass: entry.partClass,
      partType: entry.partType,
      definitionId: entry.customPartDefinitionId
    }))
  });
  return deepFreeze({
    schemaVersion: 'robo-bridge.normalised-construction.v1',
    streamId: raw.streamId,
    planId: raw.planId,
    designChecksum: raw.designChecksum,
    designRevision: raw.designRevision,
    coordinateFrame: raw.coordinateFrame,
    worldTransform,
    collaboration,
    partRegistryRevision: registry.revision,
    partRegistryHash: registry.hash,
    customDefinitions: raw.customDefinitions,
    placements,
    entries: placements,
    summary: summary(placements)
  });
}

export function createBridgeBuildBoardTargets(normalisedBuild) {
  invariant(Array.isArray(normalisedBuild?.placements), 'INVALID_SETTINGS', 'A normalised bridge construction is required.');
  const base = createBuildBoardTargets({
    planId: normalisedBuild.planId,
    designChecksum: normalisedBuild.designChecksum,
    entries: normalisedBuild.placements
  });
  const byId = new Map(normalisedBuild.placements.map((placement) => [placement.placementId, placement]));
  return deepFreeze({
    ...base,
    schemaVersion: 'robo-bridge.bridge-buildboard-targets.v1',
    partRegistryRevision: normalisedBuild.partRegistryRevision,
    partRegistryHash: normalisedBuild.partRegistryHash,
    targets: base.targets.map((target) => {
      const placement = byId.get(target.targetId);
      return {
        ...target,
        placementId: target.targetId,
        registryKey: placement.registryKey,
        registryId: placement.registryId,
        compatibilityKey: placement.compatibilityKey,
        displayMaterial: placement.displayMaterial,
        renderPose: placement.renderPose,
        collisionProxy: placement.collisionProxy,
        captureProxy: placement.captureProxy,
        collaboration: placement.collaboration,
        actorAssignment: placement.actorAssignment,
        actorAssignmentReason: placement.actorAssignmentReason,
        originalActorPreference: placement.originalActorPreference,
        robotTarget: placement.robotTarget,
        bridgeConstruction: true,
        allowedActors: ['human', 'agent'],
        physicalDimensions: placement.physicalDimensions,
        dependencyIds: placement.dependencyIds,
        requiresStructureComplete: placement.requiresStructureComplete
      };
    })
  });
}

export function createBridgePlacementQueueEntries(placements, {
  resolveBrickId,
  acceptedPlacementIds = new Set()
} = {}) {
  invariant(Array.isArray(placements) && placements.length > 0 && placements.length <= 50, 'INVALID_SETTINGS', 'Queue admission requires 1 to 50 placements.');
  invariant(typeof resolveBrickId === 'function', 'INVALID_SETTINGS', 'resolveBrickId() is required.');
  const selectedIds = new Set(placements.map((placement) => placement.placementId));
  const validationChunks = createExistingPlacementQueueChunks({
    streamId: 'bridge-admission-validation',
    entries: placements
  }, {
    batchSize: 50,
    supportsPart: (entry) => Boolean(entry.registryKey),
    resolveBrickId
  });
  invariant(validationChunks.length === 1, 'INTERNAL_ERROR', 'Queue admission validation produced an unexpected chunk count.');
  const validated = new Map(validationChunks[0].placements.map((placement) => [placement.placementId, placement]));

  return placements.map((placement) => {
    const base = validated.get(placement.placementId);
    const pendingDependencies = placement.dependencyIds.filter((dependencyId) => !acceptedPlacementIds.has(dependencyId));
    invariant(pendingDependencies.every((dependencyId) => selectedIds.has(dependencyId)), 'INVALID_SETTINGS', 'A queue entry has an unsatisfied dependency outside the selected batch.', {
      placementId: placement.placementId,
      pendingDependencies
    });
    return deepFreeze({
      ...base,
      colour: placement.compatibilityKey,
      position: placement.proxyPose.position,
      yawRad: placement.proxyPose.yawRad,
      // Bridge dependencies gate order only. The explicit BuildBoard target pose remains authoritative.
      // Do not ask the generic connector solver to derive a different target from a support brick.
      supportBrickId: null,
      supportPlacementId: null,
      dependsOnPlacementIds: pendingDependencies,
      bridgeDependencyIds: placement.dependencyIds,
      registryKey: placement.registryKey,
      registryId: placement.registryId,
      collisionProxy: placement.collisionProxy,
      captureProxy: placement.captureProxy,
      renderPose: placement.renderPose
    });
  });
}

export function createBridgeQueueChunks(queueEntries, { streamId, batchSize = 50, cycleTimeMs = 1000 } = {}) {
  invariant(typeof streamId === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(streamId), 'INVALID_SETTINGS', 'A stream-safe streamId is required.');
  invariant(Number.isSafeInteger(batchSize) && batchSize >= 1 && batchSize <= 50, 'INVALID_SETTINGS', 'batchSize must be from 1 to 50.');
  const chunks = [];
  for (let cursor = 0; cursor < queueEntries.length; cursor += batchSize) {
    const placements = queueEntries.slice(cursor, cursor + batchSize).map(cloneFrozen);
    chunks.push(deepFreeze({
      streamId,
      mode: cursor === 0 ? 'replace' : 'append',
      finalChunk: cursor + placements.length >= queueEntries.length,
      cycleTimeMs,
      placements
    }));
  }
  return chunks;
}

export function createReachabilityReport(normalisedBuild) {
  invariant(Array.isArray(normalisedBuild?.placements), 'INVALID_SETTINGS', 'A normalised bridge construction is required.');
  const all = normalisedBuild.placements;
  const workspace = all[0]?.robotTarget?.workspace ?? null;
  const bounds = (axis) => ({
    minimum: Math.min(...all.map((placement) => placement.proxyPose.position[axis])),
    maximum: Math.max(...all.map((placement) => placement.proxyPose.position[axis]))
  });
  const reasons = {};
  for (const placement of all) {
    if (placement.actorAssignment === 'human') {
      const reason = placement.actorAssignmentReason ?? 'Human assignment';
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
  }
  return deepFreeze({
    schemaVersion: 'robo-bridge.reachability-report.v1',
    planId: normalisedBuild.planId,
    designChecksum: normalisedBuild.designChecksum,
    worldTransform: normalisedBuild.worldTransform,
    workspace,
    placementCentreBoundsMm: {
      x: bounds('xMm'),
      y: bounds('yMm'),
      z: bounds('zMm')
    },
    totalTargets: all.length,
    reachableTargetCentres: all.filter((placement) => placement.robotTarget.reachable).length,
    unreachableTargetCentres: all.filter((placement) => !placement.robotTarget.reachable).length,
    reachableCaptureTcpCount: all.filter((placement) => placement.robotTarget.reachable).length,
    unreachableCaptureTcpCount: all.filter((placement) => !placement.robotTarget.reachable).length,
    assignedToAgent: all.filter((placement) => placement.actorAssignment === 'agent').length,
    assignedToHuman: all.filter((placement) => placement.actorAssignment === 'human').length,
    humanAssignmentReasons: reasons,
    allAgentTargetsReachable: all.filter((placement) => placement.actorAssignment === 'agent').every((placement) => placement.robotTarget.reachable),
    allAgentCaptureTcpsReachable: all.filter((placement) => placement.actorAssignment === 'agent').every((placement) => placement.robotTarget.reachable),
    robotSafetyLimitsChanged: false
  });
}
